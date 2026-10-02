import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { filterIds, type FilterId } from '../types';
import type { FilterThumbnails } from '../hooks/useFilterThumbnails';
import { attachPointerHeld } from '../crop/pointerHeld';

const IDS = filterIds;
const LAST = IDS.length - 1;

const ITEM_H = 46;
const DRAG_THRESHOLD_PX = 4;
const WHEEL_IDLE_MS = 140;
const RUBBER = 0.28;
const SNAP_MS = 200;
const TAP_SNAP_MS = 320;
/** Finger travel → carousel travel. Keep a slight boost over mouse, not 1:1. */
const TOUCH_DRAG_GAIN = 0.8;
/** Exponential decay per ms while coasting after a flick. */
const INERTIA_FRICTION = 0.0038;
/** Stop coasting below this (filter-indices per ms). */
const INERTIA_MIN_V = 0.00055;
const VELOCITY_MAX_DT_MS = 64;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/** Matches the Calibrate strip's native smooth-scroll feel. */
function easeOutQuart(t: number) {
  return 1 - (1 - t) ** 4;
}

function clampIndex(index: number) {
  return Math.min(LAST, Math.max(0, index));
}

function nearestIndex(position: number) {
  return clampIndex(Math.round(position));
}

function rubberPosition(position: number) {
  if (position < 0) return position * RUBBER;
  if (position > LAST) return LAST + (position - LAST) * RUBBER;
  return position;
}

function normalizeWheelDelta(e: WheelEvent) {
  const line = 16;
  const page = 400;
  let dx = e.deltaX;
  let dy = e.deltaY;
  if (e.deltaMode === 1) {
    dx *= line;
    dy *= line;
  } else if (e.deltaMode === 2) {
    dx *= page;
    dy *= page;
  }
  return Math.abs(dx) >= Math.abs(dy) ? dx : dy;
}

type ItemProps = {
  id: FilterId;
  label: string;
  thumbnail?: string;
  selected: boolean;
  onSelect: () => void;
};

function FilterItem({ id, label, thumbnail, selected, onSelect }: ItemProps) {
  return (
    <button
      type='button'
      data-ie-mode={id}
      id={`ie-filter-${id}`}
      className='ie-filter-item'
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className='ie-filter-thumb'>
        {thumbnail ? (
          <img src={thumbnail} alt='' decoding='async' draggable={false} />
        ) : (
          <span className='ie-filter-thumb-placeholder' aria-hidden />
        )}
      </span>
    </button>
  );
}

type Props = {
  highlightId: FilterId;
  labels: Record<FilterId, string>;
  thumbnails: FilterThumbnails;
  thumbAspect?: number;
  onHighlightChange: (id: FilterId) => void;
  onCommitFilter: (id: FilterId) => void;
  onResetIntensity: (id: FilterId) => void;
  chromeFadeFocus?: string | null;
  onChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onChromeHoldFadeEnd?: () => void;
};

/**
 * Filter carousel.
 *
 * `carouselPosition` is continuous (can sit between items).
 * The committed look updates when the selection frame's leading edge crosses
 * 75% of a thumbnail, and snaps to that look on release.
 */
export function EditorFilterStrip({
  highlightId,
  labels,
  thumbnails,
  thumbAspect = 1,
  onHighlightChange,
  onCommitFilter,
  onResetIntensity,
  onChromeHoldFadeBegin,
  onChromeHoldFadeEnd,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const positionRef = useRef(Math.max(0, IDS.indexOf(highlightId)));
  const highlightRef = useRef(highlightId);
  highlightRef.current = highlightId;

  const draggingRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startPosRef = useRef(0);
  const startHitIdRef = useRef<FilterId | null>(null);
  const tapHandledRef = useRef(false);
  const movedRef = useRef(false);
  const snappingRef = useRef(false);
  const interactionHeldRef = useRef(false);
  const directionRef = useRef<'left' | 'right' | null>(null);
  const lastPosRef = useRef(positionRef.current);
  const isTouchRef = useRef(false);
  const velPxRef = useRef(0);
  const lastMoveXRef = useRef(0);
  const lastMoveTRef = useRef(0);

  const snapRafRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aspect = Number.isFinite(thumbAspect) && thumbAspect > 0 ? thumbAspect : 1;
  const itemW = Math.round(Math.min(72, Math.max(34, ITEM_H * aspect)));
  const itemWRef = useRef(itemW);
  const pitchRef = useRef(itemW);
  itemWRef.current = itemW;

  const applyLayout = useCallback((position: number) => {
    const root = rootRef.current;
    const track = trackRef.current;
    const frame = frameRef.current;
    if (!root || !track) return;

    const items = track.querySelectorAll<HTMLElement>('.ie-filter-item');
    if (items.length === 0) return;

    const first = items[0];
    const itemWidth = first.offsetWidth || itemWRef.current;
    const itemHeight = first.offsetHeight || ITEM_H;
    const pitch =
      items.length > 1
        ? items[1].offsetLeft - first.offsetLeft
        : itemWidth;
    itemWRef.current = itemWidth;
    pitchRef.current = Math.max(1, pitch);

    const originX = first.offsetLeft;
    const originY = first.offsetTop;
    const centerInTrack = originX + itemWidth / 2 + position * pitchRef.current;
    track.style.transform = `translate3d(${root.clientWidth / 2 - centerInTrack}px, 0, 0)`;

    if (!frame) return;

    // Same parent + layout coords as the thumbs, so the hollow frame sits
    // on the interpolated slot with no viewport/outline conversion drift.
    frame.style.width = `${itemWidth}px`;
    frame.style.height = `${itemHeight}px`;
    frame.style.opacity = '1';
    frame.style.transform = `translate3d(${originX + position * pitchRef.current}px, ${originY}px, 0)`;
  }, []);

  const noteDirection = useCallback((nextPos: number) => {
    const delta = nextPos - lastPosRef.current;
    if (delta > 1e-4) directionRef.current = 'right';
    else if (delta < -1e-4) directionRef.current = 'left';
    lastPosRef.current = nextPos;
  }, []);

  /**
   * Directional 75% threshold from live layout:
   *  right swipe → select.right vs item.x + 0.75 * width
   *  left swipe  → select.left  vs item.x + 0.25 * width
   */
  const resolveThresholdIndex = useCallback((): number => {
    const frame = frameRef.current;
    const track = trackRef.current;
    const current = Math.max(0, IDS.indexOf(highlightRef.current));
    const direction = directionRef.current;
    if (!frame || !track || !direction) return current;

    const select = frame.getBoundingClientRect();
    const items = track.querySelectorAll<HTMLElement>('.ie-filter-item');
    let chosen = current;

    items.forEach((el, i) => {
      const item = el.getBoundingClientRect();
      if (item.width <= 0) return;
      if (direction === 'right') {
        if (select.right >= item.left + item.width * 0.65) {
          chosen = Math.max(chosen, i);
        }
      } else if (select.left <= item.left + item.width * 0.35) {
        chosen = Math.min(chosen, i);
      }
    });

    return clampIndex(chosen);
  }, []);

  const syncThresholdFilter = useCallback(() => {
    const idx = resolveThresholdIndex();
    const id = IDS[idx];
    if (id && id !== highlightRef.current) onHighlightChange(id);
  }, [onHighlightChange, resolveThresholdIndex]);

  const stopSnap = useCallback(() => {
    if (snapRafRef.current) {
      cancelAnimationFrame(snapRafRef.current);
      snapRafRef.current = 0;
    }
  }, []);

  const commitId = useCallback(
    (id: FilterId, history: boolean) => {
      onHighlightChange(id);
      if (history) onCommitFilter(id);
    },
    [onCommitFilter, onHighlightChange],
  );

  const snapTo = useCallback(
    (targetIndex: number, history: boolean, durationMs?: number) => {
      const target = clampIndex(targetIndex);
      const id = IDS[target];
      const already = id === highlightRef.current;
      stopSnap();
      snappingRef.current = true;

      const from = positionRef.current;
      const commitHistory = history && !already;

      if (Math.abs(from - target) < 0.001) {
        positionRef.current = target;
        applyLayout(target);
        snappingRef.current = false;
        if (!already) commitId(id, commitHistory);
        return;
      }

      if (!already) commitId(id, false);
      const start = performance.now();
      const dist = Math.abs(target - from);
      const duration =
        durationMs ?? Math.min(480, SNAP_MS + dist * 40);

      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = durationMs != null ? easeOutQuart(t) : easeOutCubic(t);
        const next = from + (target - from) * eased;
        positionRef.current = next;
        applyLayout(next);
        if (t < 1) {
          snapRafRef.current = requestAnimationFrame(step);
          return;
        }
        snapRafRef.current = 0;
        snappingRef.current = false;
        positionRef.current = target;
        applyLayout(target);
        if (commitHistory) onCommitFilter(id);
      };
      snapRafRef.current = requestAnimationFrame(step);
    },
    [applyLayout, commitId, onCommitFilter, stopSnap],
  );

  const selectById = useCallback(
    (id: FilterId) => {
      const idx = IDS.indexOf(id);
      if (idx < 0) return;
      if (
        id === highlightRef.current &&
        nearestIndex(positionRef.current) === idx
      ) {
        onResetIntensity(id);
        return;
      }
      snappingRef.current = true;
      onHighlightChange(id);
      snapTo(idx, false, TAP_SNAP_MS);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        onCommitFilter(id);
      }, 280);
    },
    [onCommitFilter, onHighlightChange, onResetIntensity, snapTo],
  );

  const releaseChrome = useCallback(() => {
    interactionHeldRef.current = false;
    onChromeHoldFadeEnd?.();
  }, [onChromeHoldFadeEnd]);

  const acquireChrome = useCallback(() => {
    if (!onChromeHoldFadeBegin) return;
    interactionHeldRef.current = true;
    onChromeHoldFadeBegin('filter-carousel', () => interactionHeldRef.current);
  }, [onChromeHoldFadeBegin]);

  const finishGesture = useCallback(() => {
    const idx = Math.max(0, IDS.indexOf(highlightRef.current));
    snapTo(idx, true);
    directionRef.current = null;
    velPxRef.current = 0;
    releaseChrome();
  }, [releaseChrome, snapTo]);

  const coastThenSnap = useCallback(() => {
    const pitch = pitchRef.current;
    const gain = isTouchRef.current ? TOUCH_DRAG_GAIN : 1;
    let v = (-velPxRef.current * gain) / pitch;
    if (!isTouchRef.current || Math.abs(v) < INERTIA_MIN_V) {
      finishGesture();
      return;
    }

    stopSnap();
    snappingRef.current = true;
    const coastStart = performance.now();
    let last = coastStart;

    const step = (now: number) => {
      if (now - coastStart > 900) {
        snapRafRef.current = 0;
        finishGesture();
        return;
      }
      const dt = Math.min(32, now - last);
      last = now;
      v *= Math.exp(-INERTIA_FRICTION * dt);
      let next = positionRef.current + v * dt;
      if (next < 0 || next > LAST) {
        next = rubberPosition(next);
        v *= 0.32;
      }
      positionRef.current = next;
      noteDirection(next);
      applyLayout(next);
      syncThresholdFilter();
      if (Math.abs(v) < INERTIA_MIN_V) {
        snapRafRef.current = 0;
        finishGesture();
        return;
      }
      snapRafRef.current = requestAnimationFrame(step);
    };
    snapRafRef.current = requestAnimationFrame(step);
  }, [applyLayout, finishGesture, noteDirection, stopSnap, syncThresholdFilter]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root) root.style.setProperty('--ie-filter-item-w', `${itemW}px`);
    applyLayout(positionRef.current);
  }, [applyLayout, itemW]);

  useEffect(() => {
    if (draggingRef.current || pointerActiveRef.current || snappingRef.current) return;
    const idx = IDS.indexOf(highlightId);
    if (idx < 0) return;
    if (Math.abs(positionRef.current - idx) < 0.001) return;
    positionRef.current = idx;
    applyLayout(idx);
  }, [highlightId, applyLayout]);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => applyLayout(positionRef.current));
    ro.observe(root);
    if (track) ro.observe(track);
    return () => ro.disconnect();
  }, [applyLayout]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      if (wheelTimerRef.current) {
        clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = null;
      }
      pointerActiveRef.current = true;
      draggingRef.current = false;
      movedRef.current = false;
      tapHandledRef.current = false;
      pointerIdRef.current = e.pointerId;
      startXRef.current = e.clientX;
      startPosRef.current = positionRef.current;
      lastPosRef.current = positionRef.current;
      lastMoveXRef.current = e.clientX;
      lastMoveTRef.current = performance.now();
      velPxRef.current = 0;
      isTouchRef.current = e.pointerType === 'touch' || e.pointerType === 'pen';
      directionRef.current = null;
      const hit = (e.target as HTMLElement | null)?.closest?.('.ie-filter-item');
      const hitId = hit?.getAttribute('data-ie-mode') as FilterId | null;
      startHitIdRef.current = hitId && IDS.includes(hitId) ? hitId : null;

      // iOS/Safari will not send pointermove on <button> until capture is
      // taken. Do not preventDefault here — that would kill the tap-to-select
      // click on desktop.
      if (e.pointerType !== 'mouse') {
        try {
          root.setPointerCapture(e.pointerId);
        } catch {
          /* Safari */
        }
      }
      bindWindow();
    };

    const applyDrag = (clientX: number, ev?: Event) => {
      if (!pointerActiveRef.current) return;
      const dx = clientX - startXRef.current;
      if (!movedRef.current && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (!movedRef.current) {
        movedRef.current = true;
        draggingRef.current = true;
        root.setAttribute('data-ie-dragging', 'true');
        stopSnap();
        acquireChrome();
        if (pointerIdRef.current != null) {
          try {
            root.setPointerCapture(pointerIdRef.current);
          } catch {
            /* Safari */
          }
        }
      }
      ev?.preventDefault();

      const now = performance.now();
      const sampleDt = now - lastMoveTRef.current;
      if (sampleDt > 0 && sampleDt < VELOCITY_MAX_DT_MS) {
        const inst = (clientX - lastMoveXRef.current) / sampleDt;
        velPxRef.current = velPxRef.current * 0.62 + inst * 0.38;
      } else if (sampleDt >= VELOCITY_MAX_DT_MS) {
        velPxRef.current = 0;
      }
      lastMoveXRef.current = clientX;
      lastMoveTRef.current = now;

      const gain = isTouchRef.current ? TOUCH_DRAG_GAIN : 1;
      positionRef.current = rubberPosition(
        startPosRef.current - (dx * gain) / pitchRef.current,
      );
      noteDirection(positionRef.current);
      applyLayout(positionRef.current);
      syncThresholdFilter();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerActiveRef.current || e.pointerId !== pointerIdRef.current) return;
      if (e.pointerType === 'touch') return;
      applyDrag(e.clientX, e);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pointerActiveRef.current || e.touches.length === 0) return;
      isTouchRef.current = true;
      // Claim the gesture on the first move so iOS does not dampen later
      // samples into a page-scroll / tap.
      e.preventDefault();
      applyDrag(e.touches[0].clientX);
    };

    const endGesture = () => {
      if (!pointerActiveRef.current) {
        unbindWindow();
        return;
      }
      pointerActiveRef.current = false;
      const capturedId = pointerIdRef.current;
      pointerIdRef.current = null;
      root.removeAttribute('data-ie-dragging');
      if (capturedId != null) {
        try {
          root.releasePointerCapture(capturedId);
        } catch {
          /* ignore */
        }
      }
      unbindWindow();
      if (!movedRef.current) {
        releaseChrome();
        const tapped = startHitIdRef.current;
        startHitIdRef.current = null;
        if (tapped) {
          tapHandledRef.current = true;
          selectById(tapped);
        }
      return;
    }
      draggingRef.current = false;
      startHitIdRef.current = null;
      if (performance.now() - lastMoveTRef.current > 80) velPxRef.current = 0;
      coastThenSnap();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
      endGesture();
    };

    const onPointerCancel = (e: PointerEvent) => {
      // iOS fires pointercancel when it thinks the page is panning. Touch
      // listeners keep the drag alive; don't abort here.
      if (e.pointerType === 'touch') return;
      if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
      endGesture();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) return;
      endGesture();
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!movedRef.current && !tapHandledRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      movedRef.current = false;
      tapHandledRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopSnap();
      if (!interactionHeldRef.current) acquireChrome();
      const delta = normalizeWheelDelta(e);
      positionRef.current = rubberPosition(
        positionRef.current + delta / pitchRef.current,
      );
      noteDirection(positionRef.current);
      applyLayout(positionRef.current);
      syncThresholdFilter();
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        wheelTimerRef.current = null;
        finishGesture();
      }, WHEEL_IDLE_MS);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const current = nearestIndex(positionRef.current);
      snapTo(current + (e.key === 'ArrowRight' ? 1 : -1), true);
    };

    let windowBound = false;
    const bindWindow = () => {
      if (windowBound) return;
      windowBound = true;
      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchcancel', onTouchEnd);
    };
    const unbindWindow = () => {
      if (!windowBound) return;
      windowBound = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove, { passive: false });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    root.addEventListener('lostpointercapture', onPointerCancel);
    root.addEventListener('touchend', onTouchEnd);
    root.addEventListener('touchcancel', onTouchEnd);
    root.addEventListener('click', onClickCapture, true);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('keydown', onKeyDown);

    return () => {
      unbindWindow();
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('lostpointercapture', onPointerCancel);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('touchcancel', onTouchEnd);
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('keydown', onKeyDown);
    };
  }, [
    acquireChrome,
    applyLayout,
    coastThenSnap,
    finishGesture,
    noteDirection,
    releaseChrome,
    selectById,
    snapTo,
    stopSnap,
    syncThresholdFilter,
  ]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onChromeHoldFadeBegin) return;
    return attachPointerHeld(el, {
      onAcquire: () => {
        interactionHeldRef.current = true;
        onChromeHoldFadeBegin('filter-carousel', () => interactionHeldRef.current);
      },
      onRelease: () => {
        if (!draggingRef.current && !wheelTimerRef.current) releaseChrome();
      },
    });
  }, [onChromeHoldFadeBegin, releaseChrome]);

  useEffect(
    () => () => {
      stopSnap();
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [stopSnap],
  );

  return (
    <div
      ref={rootRef}
      className='ie-filter-strip'
      data-ie-part='filter-strip'
      tabIndex={0}
      role='listbox'
      aria-label='Filters'
      aria-activedescendant={`ie-filter-${highlightId}`}
    >
      <div ref={trackRef} className='ie-filter-track'>
      {IDS.map((id) => (
        <FilterItem
          key={id}
          id={id}
          label={labels[id]}
          thumbnail={thumbnails[id]}
            selected={highlightId === id}
            onSelect={() => selectById(id)}
        />
      ))}
        <div ref={frameRef} className='ie-filter-select' aria-hidden />
      </div>
    </div>
  );
}

export { IDS as FILTER_STRIP_IDS };
