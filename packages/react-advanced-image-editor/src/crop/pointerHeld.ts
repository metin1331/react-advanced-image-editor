/**
 * Tracks an in-progress pointer/touch on an element until release.
 *
 * Mouse/pen and touch are counted separately so Safari can fire both pointer
 * and touch for one gesture without double-ending.
 *
 * Wheel / touchpad: held while wheel events arrive; release after a short idle
 * when scrolling stops — not when the cursor stays over the element.
 */

export type AttachPointerHeldOptions = {
  /** Track touchpad / wheel bursts; release after idle, not on pointerleave. */
  includeWheel?: boolean;
  /** Ms without wheel events before touchpad contact is treated as ended. */
  wheelIdleMs?: number;
};

const DEFAULT_WHEEL_IDLE_MS = 150;

export function attachPointerHeld(
  el: HTMLElement,
  callbacks: {
    onAcquire?: () => void;
    onRelease?: () => void;
  },
  options?: AttachPointerHeldOptions,
): () => void {
  let mousePen = 0;
  const touches = new Set<number>();
  let wheelHeld = false;
  let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  const wheelIdleMs = options?.wheelIdleMs ?? DEFAULT_WHEEL_IDLE_MS;

  const clearWheelIdle = () => {
    if (wheelIdleTimer) {
      clearTimeout(wheelIdleTimer);
      wheelIdleTimer = null;
    }
  };

  const sync = () => {
    const next = mousePen > 0 || touches.size > 0 || wheelHeld;
    if (next === active) return;
    active = next;
    if (next) callbacks.onAcquire?.();
    else callbacks.onRelease?.();
  };

  const releaseWheelHold = () => {
    if (!wheelHeld) return;
    wheelHeld = false;
    sync();
  };

  const pulseWheelHold = () => {
    if (!options?.includeWheel) return;
    wheelHeld = true;
    sync();
    clearWheelIdle();
    wheelIdleTimer = setTimeout(releaseWheelHold, wheelIdleMs);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    mousePen += 1;
    sync();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (mousePen > 0) mousePen -= 1;
    clearWheelIdle();
    wheelHeld = false;
    sync();
  };

  const onTouchStart = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      touches.add(e.changedTouches[i].identifier);
    }
    sync();
  };

  const onTouchEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      touches.delete(e.changedTouches[i].identifier);
    }
    sync();
  };

  const onWheel = () => {
    pulseWheelHold();
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('wheel', onWheel);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    clearWheelIdle();
    mousePen = 0;
    touches.clear();
    wheelHeld = false;
    active = false;
  };
}

/** Range / slider hold — release only when the actual touch/pointer ends. */
export function rangeHoldFadeHandlers(
  focus: string,
  requestHoldFade: (focus: string | null, stillActive?: () => boolean) => void,
  releaseHoldFade: () => void,
  heldRef: { current: boolean },
) {
  const acquire = () => {
    heldRef.current = true;
    requestHoldFade(focus, () => heldRef.current);
  };
  const release = () => {
    heldRef.current = false;
    releaseHoldFade();
  };
  return {
    onPointerDown: acquire,
    onPointerUp: release,
    onPointerCancel: release,
    onTouchStart: acquire,
    onTouchEnd: release,
    onTouchCancel: release,
  };
}
