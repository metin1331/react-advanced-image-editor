/**
 * Tracks an in-progress pointer/touch on an element until release.
 *
 * Mouse/pen and touch are counted separately so Safari can fire both pointer
 * and touch for one gesture without double-ending.
 *
 * A two-finger touchpad scroll only emits wheel events while the fingers
 * move. Pausing with both fingers still down is silence, so a short idle
 * must not count as release. Chrome does not deliver the internal "phase
 * ended" wheel, and lifting the fingers does not move the cursor, so
 * pointerleave is not the lift. `scrollend` on the scroller is: trackpad
 * scrolling is not complete until the fingers leave, even when the cursor
 * stays over the element. A real mouse-wheel notch has no contact to wait
 * for, so only that kind of wheel releases after a short idle.
 */

const scriptScrollUntil = new WeakMap<HTMLElement, number>();
const SCRIPT_SCROLL_GUARD_MS = 80;

/** Programmatic scrollLeft must not be treated as the fingers leaving. */
export function markScriptScroll(el: HTMLElement) {
  scriptScrollUntil.set(el, performance.now() + SCRIPT_SCROLL_GUARD_MS);
}

function isScriptScroll(el: HTMLElement) {
  return performance.now() < (scriptScrollUntil.get(el) ?? 0);
}

export type AttachPointerHeldOptions = {
  /** Track touchpad / wheel bursts. */
  includeWheel?: boolean;
  /** Ms without wheel events before a mouse-wheel notch is treated as ended. */
  wheelIdleMs?: number;
};

const DEFAULT_WHEEL_IDLE_MS = 150;

function isZeroWheel(e: WheelEvent) {
  return e.deltaX === 0 && e.deltaY === 0 && e.deltaZ === 0;
}

/** Discrete mouse notch (±100 / ±120). Touchpad pans are smaller or fractional. */
function looksLikeMouseNotch(e: WheelEvent) {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE || e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return true;
  }
  const ax = Math.abs(e.deltaX);
  const ay = Math.abs(e.deltaY);
  if (ax > 0 && ay > 0) return false;
  const magnitude = ax || ay;
  return magnitude >= 40 && Math.abs(magnitude % 1) < 0.001;
}

/** Touchpad swipes emit several wheel events per frame; a mouse notch does not. */
const TOUCHPAD_BURST_WINDOW_MS = 80;
const TOUCHPAD_BURST_COUNT = 4;

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
  let touchpadGesture = false;
  let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;
  const recentWheelAt: number[] = [];
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
    touchpadGesture = false;
    recentWheelAt.length = 0;
    clearWheelIdle();
    if (!wheelHeld) return;
    wheelHeld = false;
    sync();
  };

  const noteTouchpadBurst = () => {
    const now = performance.now();
    recentWheelAt.push(now);
    while (recentWheelAt.length && now - recentWheelAt[0] > TOUCHPAD_BURST_WINDOW_MS) {
      recentWheelAt.shift();
    }
    if (recentWheelAt.length >= TOUCHPAD_BURST_COUNT) touchpadGesture = true;
  };

  const pulseWheelHold = (e: WheelEvent) => {
    if (!options?.includeWheel) return;
    // A zero delta is "still in contact, not moving" when it arrives at all.
    // Finger lift is not delivered as a DOM wheel event.
    if (isZeroWheel(e)) {
      touchpadGesture = true;
      wheelHeld = true;
      sync();
      clearWheelIdle();
      return;
    }
    noteTouchpadBurst();
    if (!looksLikeMouseNotch(e)) touchpadGesture = true;
    wheelHeld = true;
    sync();
    clearWheelIdle();
    if (touchpadGesture) return;
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
    const releasedButton = mousePen > 0;
    if (releasedButton) mousePen -= 1;
    if (releasedButton) {
      if (mousePen === 0 && wheelHeld) releaseWheelHold();
      else sync();
      return;
    }
    // Buttonless pointerup is how some trackpads report the scroll gesture
    // ending. It must not run on a pause — those emit no pointerup.
    if (touchpadGesture && e.buttons === 0) releaseWheelHold();
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

  const onWheel = (e: WheelEvent) => {
    pulseWheelHold(e);
  };

  const onScrollEnd = () => {
    if (isScriptScroll(el)) return;
    if (mousePen > 0 || touches.size > 0) return;
    if (!wheelHeld) return;
    releaseWheelHold();
  };

  const onPointerLeave = () => {
    if (mousePen > 0 || touches.size > 0 || !touchpadGesture) return;
    releaseWheelHold();
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointerleave', onPointerLeave);
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('wheel', onWheel, { passive: true });
  el.addEventListener('scrollend', onScrollEnd);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointerleave', onPointerLeave);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('scrollend', onScrollEnd);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    clearWheelIdle();
    mousePen = 0;
    touches.clear();
    wheelHeld = false;
    touchpadGesture = false;
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
