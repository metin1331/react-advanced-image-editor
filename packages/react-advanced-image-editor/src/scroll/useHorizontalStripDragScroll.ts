import { useEffect, useRef } from 'react';

const WHEEL_IDLE_MS = 280;

export type StripDragScrollOptions = {
  /** `didMove` is false for a tap so the button click can own selection. */
  onSessionEnd?: (didMove: boolean) => void;
};

/**
 * Pointer-drag so badge `<button>` strips still scroll on iOS. Native
 * `touch-action: pan-x` remains the mobile fallback — do not call
 * preventDefault until the pointer has actually moved.
 *
 * Pass the mounted DOM node (callback-ref state). A RefObject that was null
 * on the first effect never rebinds — that is why Crop used to stay frozen.
 */
export function useHorizontalStripDragScroll(
  el: HTMLElement | null,
  enabled = true,
  options?: StripDragScrollOptions,
) {
  const dragRef = useRef(false);
  const movedRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!el || !enabled) return;

    let windowBound = false;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    let justEnded = false;

    const applyScroll = (clientX: number, ev?: Event) => {
      if (!dragRef.current) return;
      const dx = clientX - startXRef.current;
      if (Math.abs(dx) > 4) {
        if (!movedRef.current) {
          movedRef.current = true;
          el.setAttribute('data-ie-dragging', 'true');
        }
        ev?.preventDefault();
      }
      el.scrollLeft = startScrollRef.current - dx;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current || e.pointerId !== pointerIdRef.current) return;
      if (e.pointerType === 'touch') return;
      applyScroll(e.clientX, e);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragRef.current || e.touches.length === 0) return;
      applyScroll(e.touches[0].clientX, e);
    };

    const unbindWindow = () => {
      if (!windowBound) return;
      windowBound = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('touchend', endDrag);
    };

    const endDrag = () => {
      if (!dragRef.current) {
        unbindWindow();
        return;
      }
      const didMove = movedRef.current;
      dragRef.current = false;
      pointerIdRef.current = null;
      el.removeAttribute('data-ie-dragging');
      unbindWindow();
      justEnded = true;
      optionsRef.current?.onSessionEnd?.(didMove);
      queueMicrotask(() => {
        justEnded = false;
      });
    };

    const bindWindow = () => {
      if (windowBound) return;
      windowBound = true;
      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
      window.addEventListener('touchend', endDrag);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      if (wheelTimer) {
        clearTimeout(wheelTimer);
        wheelTimer = null;
      }
      dragRef.current = true;
      movedRef.current = false;
      pointerIdRef.current = e.pointerId;
      startXRef.current = e.clientX;
      startScrollRef.current = el.scrollLeft;
      if (e.pointerType !== 'mouse') {
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* Safari */
        }
      }
      bindWindow();
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!movedRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      movedRef.current = false;
    };

    const onWheel = () => {
      if (dragRef.current) return;
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelTimer = null;
        if (dragRef.current) return;
        optionsRef.current?.onSessionEnd?.(true);
      }, WHEEL_IDLE_MS);
    };

    const onNativeTouchEnd = () => {
      if (dragRef.current || justEnded) return;
      if (Math.abs(el.scrollLeft - startScrollRef.current) > 1) {
        optionsRef.current?.onSessionEnd?.(true);
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchend', onNativeTouchEnd, { passive: true });

    return () => {
      if (wheelTimer) clearTimeout(wheelTimer);
      dragRef.current = false;
      pointerIdRef.current = null;
      el.removeAttribute('data-ie-dragging');
      unbindWindow();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchend', onNativeTouchEnd);
    };
  }, [el, enabled]);
}
