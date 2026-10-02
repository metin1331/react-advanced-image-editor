import { useEffect, useRef } from 'react';
import { MODE_STRIP_SCROLL_IDLE_MS } from '../crop/modeStripScrollFade';
import {
  afterLayout,
  directionalThresholdChild,
  nearestCenteredChild,
  scrollChildToCenter,
} from './scrollStrip';
import { useHorizontalStripDragScroll } from './useHorizontalStripDragScroll';

const MODE_ATTR = (id: string) => `[data-ie-mode="${id}"]`;

/**
 * Shared Crop / Calibrate badge-strip scroll: 40% live highlight, snap + commit
 * only after the finger/trackpad is released.
 */
export function useModeBadgeStrip<T extends string>(
  el: HTMLDivElement | null,
  ids: readonly T[],
  highlight: T,
  onHighlightChange: (id: T) => void,
  onCommit: (id: T) => void,
  fallback: T,
) {
  const ignoreScroll = useRef(false);
  const lastScrollLeft = useRef(0);
  const scrollDir = useRef<'left' | 'right' | null>(null);
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  const scrollFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markScrolling = () => {
    if (!el) return;
    el.setAttribute('data-ie-scrolling', 'true');
    if (scrollFadeTimer.current) clearTimeout(scrollFadeTimer.current);
    scrollFadeTimer.current = setTimeout(() => {
      el.removeAttribute('data-ie-scrolling');
      scrollFadeTimer.current = null;
    }, MODE_STRIP_SCROLL_IDLE_MS);
  };

  const scrollToId = (id: T, smooth: boolean) => {
    if (!el) return;
    const btn = el.querySelector(MODE_ATTR(id)) as HTMLElement | null;
    if (!btn) return;
    ignoreScroll.current = true;
    if (smooth) el.setAttribute('data-ie-dragging', 'true');
    scrollChildToCenter(el, btn, smooth);
    window.setTimeout(
      () => {
        ignoreScroll.current = false;
        el.removeAttribute('data-ie-dragging');
      },
      smooth ? 320 : 40,
    );
  };

  const resolveNearest = (): T => {
    if (!el || ids.length < 2) return ids[0] ?? fallback;
    return nearestCenteredChild(el, ids, MODE_ATTR);
  };

  const resolveThreshold = (): T => {
    if (!el || ids.length < 2) return ids[0] ?? fallback;
    const sl = el.scrollLeft;
    const prev = lastScrollLeft.current;
    if (sl > prev + 0.5) scrollDir.current = 'right';
    else if (sl < prev - 0.5) scrollDir.current = 'left';
    lastScrollLeft.current = sl;
    return directionalThresholdChild(
      el,
      ids,
      MODE_ATTR,
      scrollDir.current,
      highlightRef.current,
    );
  };

  useHorizontalStripDragScroll(el, Boolean(el), {
    onSessionEnd: (didMove) => {
      if (!didMove) return;
      const settled = resolveThreshold();
      highlightRef.current = settled;
      onHighlightChange(settled);
      onCommit(settled);
      scrollToId(settled, true);
    },
  });

  useEffect(() => {
    if (!el || !ids.includes(highlight)) return;
    afterLayout(() => scrollToId(highlight, false));
    // Center once the strip node exists — not on every highlight change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el]);

  useEffect(
    () => () => {
      if (scrollFadeTimer.current) clearTimeout(scrollFadeTimer.current);
      el?.removeAttribute('data-ie-scrolling');
    },
    [el],
  );

  const onScroll = () => {
    markScrolling();
    if (ignoreScroll.current) return;
    const next = resolveThreshold();
    if (next === highlightRef.current) return;
    highlightRef.current = next;
    onHighlightChange(next);
  };

  const onSelect = (id: T, onReset?: (id: T) => void) => {
    if (id === highlight && resolveNearest() === id) {
      onReset?.(id);
      return;
    }
    highlightRef.current = id;
    onHighlightChange(id);
    onCommit(id);
    markScrolling();
    scrollToId(id, true);
  };

  return { onScroll, onSelect };
}
