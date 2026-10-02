import {
  MODE_TRANSITION_FADE_EASE,
  MODE_TRANSITION_FADE_MS,
} from './modeTransitionFade';

export type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Crop ↔ preview photo-size lerp. Tune in `modeTransitionFade.ts`. */
export const MODE_TRANSITION_MS = MODE_TRANSITION_FADE_MS;

export function cropFadeEase(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const bez = MODE_TRANSITION_FADE_EASE.match(
    /cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/,
  );
  if (!bez) return t;
  const [, x1, y1, x2, y2] = bez.map(Number);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const x =
      3 * (1 - mid) * (1 - mid) * mid * x1 +
      3 * (1 - mid) * mid * mid * x2 +
      mid * mid * mid;
    if (x < t) lo = mid;
    else hi = mid;
  }
  const u = (lo + hi) / 2;
  return (
    3 * (1 - u) * (1 - u) * u * y1 +
    3 * (1 - u) * u * u * y2 +
    u * u * u
  );
}

/** Interpolate width/height around the shared visual center. */
export function lerpCenterRect(
  from: ViewportRect,
  to: ViewportRect,
  t: number,
): ViewportRect {
  const fcx = from.left + from.width / 2;
  const fcy = from.top + from.height / 2;
  const tcx = to.left + to.width / 2;
  const tcy = to.top + to.height / 2;
  const cx = fcx + (tcx - fcx) * t;
  const cy = fcy + (tcy - fcy) * t;
  const width = from.width + (to.width - from.width) * t;
  const height = from.height + (to.height - from.height) * t;
  return {
    left: cx - width / 2,
    top: cy - height / 2,
    width,
    height,
  };
}

/** Keep the rect inside the viewport band during the in-flight transition. */
export function clampRectWithinViewport(
  rect: ViewportRect,
  vw: number,
  vh: number,
): ViewportRect {
  let { left, top, width, height } = rect;
  if (width <= 0 || height <= 0) return rect;

  if (width > vw || height > vh) {
    const scale = Math.min(vw / width, vh / height);
    width *= scale;
    height *= scale;
  }

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  left = cx - width / 2;
  top = cy - height / 2;
  left = Math.min(Math.max(left, 0), Math.max(0, vw - width));
  top = Math.min(Math.max(top, 0), Math.max(0, vh - height));
  return { left, top, width, height };
}

export function sampleModeTransition(
  from: { frame: ViewportRect; img: ViewportRect },
  to: { frame: ViewportRect; img: ViewportRect },
  t: number,
  vw: number,
  vh: number,
): { frame: ViewportRect; img: ViewportRect } {
  if (t >= 1) return to;
  const eased = cropFadeEase(t);
  const frame = clampRectWithinViewport(
    lerpCenterRect(from.frame, to.frame, eased),
    vw,
    vh,
  );
  const img = clampRectWithinViewport(
    lerpCenterRect(from.img, to.img, eased),
    vw,
    vh,
  );
  return { frame, img };
}

/**
 * Preview → Crop: recompute the destination from the live viewport each frame
 * so the image tracks chrome-driven viewport resize instead of a static end state.
 */
export function sampleModeTransitionToLiveTarget(
  from: { frame: ViewportRect; img: ViewportRect },
  liveTarget: { frame: ViewportRect; img: ViewportRect },
  t: number,
  vw: number,
  vh: number,
): { frame: ViewportRect; img: ViewportRect } {
  if (t >= 1) return liveTarget;
  return sampleModeTransition(from, liveTarget, t, vw, vh);
}
