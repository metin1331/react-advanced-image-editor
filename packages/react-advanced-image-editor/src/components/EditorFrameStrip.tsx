import { useCallback, useEffect, useRef } from 'react';
import {
  FRAME_PRESET_IDS,
  getFrameControls,
  resolveFrameFromPreset,
  type FrameControlId,
  type FramePresetId,
  type FrameState,
} from 'react-advanced-image-editor-core';
import { afterLayout, scrollChildToCenter } from '../scroll/scrollStrip';
import { MARKUP_PRESET_COLORS } from './EditorMarkupToolbar';
import { attachPointerHeld, rangeHoldFadeHandlers } from '../crop/pointerHeld';

export type FrameStripLabels = Record<FramePresetId, string> & {
  thickness?: string;
  color?: string;
  accent?: string;
  radius?: string;
  spacing?: string;
  shadow?: string;
};

type Props = {
  frame: FrameState;
  labels: FrameStripLabels;
  onPresetChange: (id: FramePresetId) => void;
  onFrameChange: (patch: Partial<FrameState>, commit?: boolean) => void;
  chromeFadeFocus?: string | null;
  onChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onChromeHoldFadeEnd?: () => void;
};

function FrameThumbPreview({ id }: { id: FramePresetId }) {
  return (
    <span className='ie-frame-thumb' data-ie-frame={id} aria-hidden>
      <span className='ie-frame-thumb-back' />
      <span className='ie-frame-thumb-mat'>
        <span className='ie-frame-thumb-photo' />
      </span>
    </span>
  );
}

function ColorRow({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (c: string) => void;
  label: string;
}) {
  const current = value.toLowerCase();
  return (
    <div className='ie-frame-swatches' role='group' aria-label={label}>
      {MARKUP_PRESET_COLORS.map((c) => (
        <button
          key={c}
          type='button'
          className='ie-markup-swatch ie-frame-swatch'
          data-ie-active={current === c ? 'true' : undefined}
          style={{ background: c }}
          aria-label={c}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  focusId,
  chromeFadeFocus = null,
  onLive,
  onCommit,
  onChromeHoldFadeBegin,
  onChromeHoldFadeEnd,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  focusId: string;
  chromeFadeFocus?: string | null;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
  onChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onChromeHoldFadeEnd?: () => void;
}) {
  const heldRef = useRef(false);
  const rangeHandlers =
    onChromeHoldFadeBegin && onChromeHoldFadeEnd
      ? rangeHoldFadeHandlers(
          focusId,
          onChromeHoldFadeBegin,
          onChromeHoldFadeEnd,
          heldRef,
        )
      : null;

  return (
    <label
      className='ie-frame-slider'
      data-ie-chrome-fade-target=''
      data-ie-chrome-focus={chromeFadeFocus === focusId ? 'true' : undefined}
    >
      <span>{label}</span>
      <input
        type='range'
        min={min}
        max={max}
        value={Math.round(value)}
        onChange={(e) => onLive(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onPointerCancel={(e) =>
          onCommit(Number((e.target as HTMLInputElement).value))
        }
        {...rangeHandlers}
      />
    </label>
  );
}

function scalePads(preset: FramePresetId, spacing: number): Partial<FrameState> {
  const base = resolveFrameFromPreset(preset);
  const current = Math.max(
    base.padding,
    base.paddingTop,
    base.paddingRight,
    base.paddingBottom,
    base.paddingLeft,
    1,
  );
  const s = spacing / current;
  const round = (n: number) => Math.max(0, Math.round(n * s));
  return {
    padding: round(base.padding),
    paddingTop: round(base.paddingTop || base.padding),
    paddingRight: round(base.paddingRight || base.padding),
    paddingBottom: round(base.paddingBottom || base.padding),
    paddingLeft: round(base.paddingLeft || base.padding),
  };
}

export function EditorFrameStrip({
  frame,
  labels,
  onPresetChange,
  onFrameChange,
  chromeFadeFocus = null,
  onChromeHoldFadeBegin,
  onChromeHoldFadeEnd,
}: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  const interactionHeldRef = useRef(false);
  const activeId = frame.preset;
  const controls = getFrameControls(activeId);

  const requestChromeHoldFade = useCallback(
    (focus: string | null) => {
      if (!onChromeHoldFadeBegin) return;
      onChromeHoldFadeBegin(focus, () => interactionHeldRef.current);
    },
    [onChromeHoldFadeBegin],
  );

  const releaseChromeHoldFade = useCallback(() => {
    onChromeHoldFadeEnd?.();
  }, [onChromeHoldFadeEnd]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el || !onChromeHoldFadeBegin) return;
    return attachPointerHeld(el, {
      onAcquire: () => {
        interactionHeldRef.current = true;
        requestChromeHoldFade(activeId);
      },
      onRelease: () => {
        interactionHeldRef.current = false;
        releaseChromeHoldFade();
      },
    });
  }, [onChromeHoldFadeBegin, releaseChromeHoldFade, requestChromeHoldFade, activeId]);

  const onStripScroll = useCallback(() => {
    requestChromeHoldFade(activeId);
  }, [requestChromeHoldFade, activeId]);

  const scrollToPreset = (id: FramePresetId, smooth: boolean) => {
    const el = stripRef.current;
    if (!el) return;
    const tile = el.querySelector(`[data-ie-frame="${id}"]`) as HTMLElement | null;
    if (!tile) return;
    scrollChildToCenter(el, tile, smooth);
  };

  useEffect(() => {
    afterLayout(() => scrollToPreset(activeId, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (next: Partial<FrameState>, commit = true) => onFrameChange(next, commit);

  return (
    <div className='ie-frame-strip-wrap' data-ie-part='frame-strip'>
      <div
        ref={stripRef}
        className='ie-frame-strip'
        role='listbox'
        aria-label={labels.none}
        onScroll={onStripScroll}
      >
        {FRAME_PRESET_IDS.map((id) => {
          const active = activeId === id;
          const label = labels[id] ?? id;
          return (
            <button
              key={id}
              type='button'
              data-ie-frame={id}
              data-ie-active={active ? 'true' : undefined}
              data-ie-chrome-fade-target=''
              data-ie-chrome-focus={chromeFadeFocus === id ? 'true' : undefined}
              className='ie-frame-item'
              onClick={() => {
                onPresetChange(id);
                scrollToPreset(id, true);
              }}
              aria-label={label}
              aria-pressed={active}
            >
              <FrameThumbPreview id={id} />
              <span className='ie-frame-name'>{label}</span>
            </button>
          );
        })}
      </div>

      {controls.length > 0 && (
        <div className='ie-frame-controls'>
          {controls.map((id: FrameControlId) => {
            if (id === 'color') {
              return (
                <div key={id} className='ie-frame-control-block'>
                  <span className='ie-frame-control-label'>{labels.color ?? 'Color'}</span>
                  <ColorRow
                    value={frame.color}
                    label={labels.color ?? 'Color'}
                    onChange={(c) => patch({ color: c })}
                  />
                </div>
              );
            }
            if (id === 'accent') {
              return (
                <div key={id} className='ie-frame-control-block'>
                  <span className='ie-frame-control-label'>{labels.accent ?? 'Accent'}</span>
                  <ColorRow
                    value={frame.accentColor}
                    label={labels.accent ?? 'Accent'}
                    onChange={(c) => patch({ accentColor: c })}
                  />
                </div>
              );
            }
            if (id === 'thickness') {
              return (
                <SliderRow
                  key={id}
                  focusId={id}
                  label={labels.thickness ?? 'Thickness'}
                  value={frame.borderWidth}
                  min={1}
                  max={48}
                  chromeFadeFocus={chromeFadeFocus}
                  onChromeHoldFadeBegin={onChromeHoldFadeBegin}
                  onChromeHoldFadeEnd={onChromeHoldFadeEnd}
                  onLive={(v) => patch({ borderWidth: v }, false)}
                  onCommit={(v) => patch({ borderWidth: v }, true)}
                />
              );
            }
            if (id === 'radius') {
              return (
                <SliderRow
                  key={id}
                  focusId={id}
                  label={labels.radius ?? 'Radius'}
                  value={frame.cornerRadius}
                  min={0}
                  max={48}
                  chromeFadeFocus={chromeFadeFocus}
                  onChromeHoldFadeBegin={onChromeHoldFadeBegin}
                  onChromeHoldFadeEnd={onChromeHoldFadeEnd}
                  onLive={(v) => patch({ cornerRadius: v }, false)}
                  onCommit={(v) => patch({ cornerRadius: v }, true)}
                />
              );
            }
            if (id === 'spacing') {
              const spacing = Math.max(
                frame.padding,
                frame.paddingTop,
                frame.paddingRight,
                frame.paddingBottom,
                frame.paddingLeft,
              );
              return (
                <SliderRow
                  key={id}
                  focusId={id}
                  label={labels.spacing ?? 'Spacing'}
                  value={spacing}
                  min={0}
                  max={72}
                  chromeFadeFocus={chromeFadeFocus}
                  onChromeHoldFadeBegin={onChromeHoldFadeBegin}
                  onChromeHoldFadeEnd={onChromeHoldFadeEnd}
                  onLive={(v) => patch(scalePads(activeId, v), false)}
                  onCommit={(v) => patch(scalePads(activeId, v), true)}
                />
              );
            }
            if (id === 'shadow') {
              const usesInner =
                activeId === 'inset' || activeId === 'inner-shadow';
              const value = usesInner
                ? Math.round(frame.innerShadowIntensity * 100)
                : Math.round(frame.shadowIntensity * 100);
              return (
                <SliderRow
                  key={id}
                  focusId={id}
                  label={labels.shadow ?? 'Shadow'}
                  value={value}
                  min={0}
                  max={100}
                  chromeFadeFocus={chromeFadeFocus}
                  onChromeHoldFadeBegin={onChromeHoldFadeBegin}
                  onChromeHoldFadeEnd={onChromeHoldFadeEnd}
                  onLive={(v) =>
                    usesInner
                      ? patch({ innerShadowIntensity: v / 100 }, false)
                      : patch({ shadow: v > 0, shadowIntensity: v / 100 }, false)
                  }
                  onCommit={(v) =>
                    usesInner
                      ? patch({ innerShadowIntensity: v / 100 }, true)
                      : patch({ shadow: v > 0, shadowIntensity: v / 100 }, true)
                  }
                />
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

export { FRAME_PRESET_IDS };
