import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { chromePanelFadeDurationMs } from '../crop/chromePanelFade';
import { rulerSwitchFadeDurationMs } from '../crop/rulerSwitchFade';

/** Bottom-bar modes that share one locked height (preview must not jump). */
export const FIXED_BOTTOM_CHROME_IDS = new Set([
  'crop',
  'crop-shape',
  'calibrate',
  'filter',
]);

type Phase = 'enter' | 'in';

function durationMs() {
  return chromePanelFadeDurationMs();
}

function readBottomChromeSlotHeight(anchor?: HTMLElement | null): number {
  if (typeof document === 'undefined') return 124;
  const target =
    anchor ??
    document.querySelector('[data-ie-root]') ??
    document.documentElement;
  const raw = getComputedStyle(target as Element)
    .getPropertyValue('--ie-bottom-bar-slot-height')
    .trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 124;
}

function resolveChromeSlotHeight(
  id: string,
  measured: number,
  lockBottomBarHeight: boolean,
  anchor?: HTMLElement | null
): number {
  if (id === 'none') return 0;
  if (lockBottomBarHeight && FIXED_BOTTOM_CHROME_IDS.has(id)) {
    return readBottomChromeSlotHeight(anchor);
  }
  return measured;
}

function shouldLockBottomBarHeight(id: string, lockBottomBarHeight: boolean) {
  return lockBottomBarHeight && FIXED_BOTTOM_CHROME_IDS.has(id);
}

/** First `data-ie-part` on a direct chrome child (sub-toolbar, bottom-bar, …). */
function readChromeType(children: ReactNode): string | undefined {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (!child || typeof child !== 'object' || !('props' in child)) continue;
    const props = child.props;
    if (props && typeof props === 'object' && 'data-ie-part' in props) {
      const part = props['data-ie-part'];
      if (typeof part === 'string') return part;
    }
  }
  return undefined;
}

/**
 * Keeps children mounted through an opacity exit, optionally collapsing
 * height so siblings (the preview) can grow/shrink with the chrome.
 */
export function ModePresence({
  show,
  children,
  collapse = false,
  className,
  style,
  'data-ie-part': dataPart,
  'data-ie-crop-fade': cropFade,
  'data-ie-filter-label': filterLabel,
  'aria-hidden': ariaHidden,
}: {
  show: boolean;
  children: ReactNode;
  collapse?: boolean;
  className?: string;
  style?: CSSProperties;
  'data-ie-part'?: string;
  'data-ie-crop-fade'?: string;
  'data-ie-filter-label'?: string;
  'aria-hidden'?: boolean;
}) {
  const [mounted, setMounted] = useState(show);
  const [open, setOpen] = useState(show);
  const [height, setHeight] = useState<number | 'auto'>(show ? 'auto' : 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      setMounted(show);
      setOpen(show);
      if (collapse) setHeight(show ? 'auto' : 0);
      return;
    }
    if (show) {
      setMounted(true);
      if (collapse) setHeight(0);
      const frame = requestAnimationFrame(() => {
        if (collapse) setHeight(rootRef.current?.scrollHeight ?? 0);
        setOpen(true);
      });
      return () => cancelAnimationFrame(frame);
    }
    setOpen(false);
    if (!collapse) return;
    setHeight(rootRef.current?.offsetHeight ?? 0);
    const frame = requestAnimationFrame(() => setHeight(0));
    return () => cancelAnimationFrame(frame);
  }, [show, collapse]);

  useEffect(() => {
    if (show || !mounted) return;
    const t = window.setTimeout(() => setMounted(false), durationMs());
    return () => window.clearTimeout(t);
  }, [show, mounted]);

  useEffect(() => {
    if (!show || !open || !collapse || height === 'auto') return;
    const t = window.setTimeout(() => setHeight('auto'), durationMs());
    return () => window.clearTimeout(t);
  }, [show, open, collapse, height]);

  if (!mounted) return null;

  return (
    <div
      ref={rootRef}
      className={className}
      data-ie-part={dataPart}
      data-ie-crop-fade={cropFade}
      data-ie-filter-label={filterLabel}
      data-ie-mode-presence=''
      data-ie-open={open ? 'true' : 'false'}
      data-ie-collapse={collapse ? 'true' : undefined}
      aria-hidden={ariaHidden}
      style={{
        ...style,
        ...(collapse ? { height: height === 'auto' ? 'auto' : `${height}px` } : null),
      }}
    >
      {children}
    </div>
  );
}

/**
 * Crossfades the floating mode title inside `.ie-mode-label-pill` when the
 * sidebar tool changes. Uses the same hide / reveal tokens as chrome-panel.
 */
export function ModeLabelFade({ id, text }: { id: string; text: string }) {
  const [slotId, setSlotId] = useState(id);
  const [exit, setExit] = useState<{ key: string; text: string } | null>(null);
  const [phase, setPhase] = useState<Phase>('in');
  const prevText = useRef(text);

  if (id !== slotId) {
    setExit({ key: slotId, text: prevText.current });
    setSlotId(id);
    setPhase('enter');
  }

  useEffect(() => {
    prevText.current = text;
  });

  useLayoutEffect(() => {
    if (phase !== 'enter') return;
    const frame = requestAnimationFrame(() => setPhase('in'));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (!exit) return;
    const t = window.setTimeout(() => setExit(null), durationMs());
    return () => window.clearTimeout(t);
  }, [exit]);

  return (
    <>
      {exit ? (
        <span data-ie-chrome-panel='' data-ie-phase='exit' aria-hidden>
          {exit.text}
        </span>
      ) : null}
      <span data-ie-chrome-panel='' data-ie-phase={phase}>
        {text}
      </span>
    </>
  );
}

/**
 * Crossfades the Crop / Calibrate ruler when the active `ie-mode-badge` changes.
 * Same enter/exit phases as chrome-panel, with the faster ruler-switch tokens.
 */
export function RulerSwitchFade({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const [slotId, setSlotId] = useState(id);
  const [exit, setExit] = useState<{ key: string; node: ReactNode } | null>(
    null,
  );
  const [phase, setPhase] = useState<Phase>('in');
  const prevChildren = useRef(children);

  if (id !== slotId) {
    setExit({ key: slotId, node: prevChildren.current });
    setSlotId(id);
    setPhase('enter');
  }

  useEffect(() => {
    prevChildren.current = children;
  });

  useLayoutEffect(() => {
    if (phase !== 'enter') return;
    const frame = requestAnimationFrame(() => setPhase('in'));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (!exit) return;
    const t = window.setTimeout(
      () => setExit(null),
      rulerSwitchFadeDurationMs(),
    );
    return () => window.clearTimeout(t);
  }, [exit]);

  return (
    <div data-ie-part='ruler-slot'>
      {exit ? (
        <div data-ie-ruler-panel='' data-ie-phase='exit' aria-hidden>
          {exit.node}
        </div>
      ) : null}
      <div data-ie-ruler-panel='' data-ie-phase={phase}>
        {children}
      </div>
    </div>
  );
}

/**
 * Crossfades tool chrome without unmounting the outgoing pane until its fade
 * finishes. Slot height interpolates so the preview moves continuously.
 *
 * Pass `lockBottomBarHeight` only on the **bottom-bar** slot — never on the
 * sub-toolbar slot above the preview (both can share the same `id`, e.g. crop).
 */
export function ModeChromeSlot({
  id,
  children,
  lockBottomBarHeight = false,
}: {
  id: string;
  children: ReactNode;
  /** Lock height for Crop / Crop Shape / Calibrate / Filter bottom bars only. */
  lockBottomBarHeight?: boolean;
}) {
  const [slotId, setSlotId] = useState(id);
  const [exit, setExit] = useState<{ key: string; node: ReactNode } | null>(null);
  const [phase, setPhase] = useState<Phase>('in');
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const inRef = useRef<HTMLDivElement>(null);
  const lastHeight = useRef(0);
  const prevChildren = useRef(children);
  const first = useRef(true);

  if (id !== slotId) {
    setExit({ key: slotId, node: prevChildren.current });
    setSlotId(id);
    setPhase('enter');
  }

  useEffect(() => {
    prevChildren.current = children;
  });

  useLayoutEffect(() => {
    const measured = inRef.current?.offsetHeight ?? 0;
    const next = resolveChromeSlotHeight(
      id,
      measured,
      lockBottomBarHeight,
      inRef.current
    );

    if (first.current) {
      first.current = false;
      lastHeight.current = next;
      setHeight(next);
      return;
    }

    if (phase !== 'enter') {
      if (Math.abs(next - lastHeight.current) > 0.5) {
        lastHeight.current = next;
        setHeight(next);
      }
      return;
    }

    const fromFixed =
      lockBottomBarHeight && shouldLockBottomBarHeight(exit?.key ?? slotId, true);
    const toFixed = shouldLockBottomBarHeight(id, lockBottomBarHeight);
    const skipHeightTween =
      fromFixed && toFixed && Math.abs(lastHeight.current - next) < 0.5;

    // Incoming panel must paint at opacity 0 (`enter`) before `in`, or the
    // CSS fade never runs. Same for locked-height Crop ↔ Calibrate ↔ Filter.
    const armReveal = () => {
      lastHeight.current = next;
      setHeight(next);
      setPhase('in');
    };

    if (skipHeightTween) {
      lastHeight.current = next;
      setHeight(next);
      const frame = requestAnimationFrame(armReveal);
      return () => cancelAnimationFrame(frame);
    }

    setHeight(lastHeight.current);
    const frame = requestAnimationFrame(armReveal);
    return () => cancelAnimationFrame(frame);
  }, [id, phase, children, exit?.key, slotId, lockBottomBarHeight]);

  useEffect(() => {
    if (!exit) return;
    const t = window.setTimeout(() => setExit(null), durationMs());
    return () => window.clearTimeout(t);
  }, [exit]);

  const chromeType = readChromeType(children);
  const fixedBottom = shouldLockBottomBarHeight(id, lockBottomBarHeight);

  return (
    <div
      data-ie-part='chrome-slot'
      data-ie-crop-fade=''
      data-ie-type={chromeType}
      data-ie-fixed-bottom={fixedBottom ? 'true' : undefined}
      style={{ height: height === 'auto' ? 'auto' : `${height}px` }}
    >
      {exit ? (
        <div data-ie-chrome-panel='' data-ie-phase='exit' aria-hidden>
          {exit.node}
        </div>
      ) : null}
      <div ref={inRef} data-ie-chrome-panel='' data-ie-phase={phase}>
        {children}
      </div>
    </div>
  );
}
