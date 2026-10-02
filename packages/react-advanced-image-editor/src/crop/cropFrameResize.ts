/**
 * iPhone Photos–style crop-frame geometry + handle resize.
 *
 * Gestures are expressed against an absolute viewport rectangle with a stable
 * opposite edge/corner. The centered `frameScale` model is derived from that
 * rectangle, and crop pan is compensated so the anchored edge stays put on
 * screen relative to the image.
 */

export type CropHandle =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se';

export type FrameRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const MIN_FRAME_SCALE = 0.35;
export const MAX_FRAME_SCALE = 1;
/**
 * Inset from the viewport band. Keep at 0 so the crop window can fill the
 * full viewport height/width; handles sit in overflow:visible chrome.
 */
export const FRAME_EDGE_PAD = 0;
const MIN_FRAME_PX = 48;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Axis-aligned crop window centered in the viewport.
 * Single source of truth for mask, overlay, and handles.
 */
export function computeIosFrameSize(
  vw: number,
  vh: number,
  aspectRatio: number | null,
  frameScale: number
): FrameRect {
  const pad = FRAME_EDGE_PAD;
  const maxW = Math.max(MIN_FRAME_PX, vw - pad * 2);
  const maxH = Math.max(MIN_FRAME_PX, vh - pad * 2);
  const scale = clamp(frameScale, MIN_FRAME_SCALE, MAX_FRAME_SCALE);

  let fw: number;
  let fh: number;

  if (aspectRatio && aspectRatio > 0) {
    if (maxW / maxH > aspectRatio) {
      fh = maxH * scale;
      fw = fh * aspectRatio;
    } else {
      fw = maxW * scale;
      fh = fw / aspectRatio;
    }
  } else {
    fw = maxW * scale;
    fh = maxH * scale;
  }

  fw = Math.min(fw, maxW);
  fh = Math.min(fh, maxH);
  return { width: fw, height: fh, left: (vw - fw) / 2, top: (vh - fh) / 2 };
}

/** Opposite corner / edge that stays anchored for a given handle. */
function anchorOf(handle: CropHandle, r: FrameRect): { x: number; y: number } {
  const { left, top, width, height } = r;
  const right = left + width;
  const bottom = top + height;
  const cx = left + width / 2;
  const cy = top + height / 2;
  switch (handle) {
    case 'nw':
      return { x: right, y: bottom };
    case 'ne':
      return { x: left, y: bottom };
    case 'sw':
      return { x: right, y: top };
    case 'se':
      return { x: left, y: top };
    case 'n':
      return { x: cx, y: bottom };
    case 's':
      return { x: cx, y: top };
    case 'w':
      return { x: right, y: cy };
    case 'e':
      return { x: left, y: cy };
  }
}

/**
 * Build a freeform rect from the start frame + pointer delta, keeping the
 * opposite edge/corner fixed in screen space.
 */
function resizeFreeform(
  start: FrameRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  maxW: number,
  maxH: number
): FrameRect {
  let left = start.left;
  let top = start.top;
  let width = start.width;
  let height = start.height;

  if (handle.includes('e')) width = start.width + dx;
  if (handle.includes('w')) {
    width = start.width - dx;
    left = start.left + dx;
  }
  if (handle.includes('s')) height = start.height + dy;
  if (handle.includes('n')) {
    height = start.height - dy;
    top = start.top + dy;
  }

  if (handle === 'e' || handle === 'w') {
    top = start.top;
    height = start.height;
  }
  if (handle === 'n' || handle === 's') {
    left = start.left;
    width = start.width;
  }

  width = clamp(width, MIN_FRAME_PX, maxW);
  height = clamp(height, MIN_FRAME_PX, maxH);

  const a = anchorOf(handle, start);
  if (handle.includes('w') || handle === 'w') left = a.x - width;
  else if (handle.includes('e') || handle === 'e') left = a.x;
  else left = a.x - width / 2;

  if (handle.includes('n') || handle === 'n') top = a.y - height;
  else if (handle.includes('s') || handle === 's') top = a.y;
  else top = a.y - height / 2;

  if (handle === 'e' || handle === 'w') {
    top = start.top;
    height = start.height;
  }
  if (handle === 'n' || handle === 's') {
    left = start.left;
    width = start.width;
  }

  return { left, top, width, height };
}

/**
 * Locked-aspect resize: opposite corner/edge stays fixed; secondary dimension
 * is derived from the aspect so the ratio never drifts mid-gesture.
 */
function resizeLocked(
  start: FrameRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  aspect: number,
  maxW: number,
  maxH: number
): FrameRect {
  const a = anchorOf(handle, start);
  const freeX =
    start.left +
    (handle.includes('w') ? 0 : handle.includes('e') ? start.width : start.width / 2) +
    dx;
  const freeY =
    start.top +
    (handle.includes('n') ? 0 : handle.includes('s') ? start.height : start.height / 2) +
    dy;

  let width: number;
  let height: number;

  const isCorner = handle.length === 2;
  const isHorizontalEdge = handle === 'e' || handle === 'w';
  const isVerticalEdge = handle === 'n' || handle === 's';

  if (isCorner) {
    const rawW = Math.max(MIN_FRAME_PX, Math.abs(freeX - a.x));
    const rawH = Math.max(MIN_FRAME_PX, Math.abs(freeY - a.y));
    const fromW = { w: rawW, h: rawW / aspect };
    const fromH = { w: rawH * aspect, h: rawH };
    const errW = Math.hypot(fromW.w - rawW, fromW.h - rawH);
    const errH = Math.hypot(fromH.w - rawW, fromH.h - rawH);
    ({ w: width, h: height } = errW <= errH ? fromW : fromH);
  } else if (isHorizontalEdge) {
    width = Math.max(MIN_FRAME_PX, Math.abs(freeX - a.x));
    height = width / aspect;
  } else if (isVerticalEdge) {
    height = Math.max(MIN_FRAME_PX, Math.abs(freeY - a.y));
    width = height * aspect;
  } else {
    width = start.width;
    height = start.height;
  }

  if (width > maxW) {
    width = maxW;
    height = width / aspect;
  }
  if (height > maxH) {
    height = maxH;
    width = height * aspect;
  }
  if (width > maxW) {
    width = maxW;
    height = width / aspect;
  }

  width = Math.max(MIN_FRAME_PX, width);
  height = Math.max(MIN_FRAME_PX, height);

  let left: number;
  let top: number;

  if (handle.includes('w') || handle === 'w') left = a.x - width;
  else if (handle.includes('e') || handle === 'e') left = a.x;
  else left = a.x - width / 2;

  if (handle.includes('n') || handle === 'n') top = a.y - height;
  else if (handle.includes('s') || handle === 's') top = a.y;
  else top = a.y - height / 2;

  return { left, top, width, height };
}

export type FrameResizeResult = {
  /** Desired screen-space crop rect (anchored opposite edge). */
  desired: FrameRect;
  /** Centered frame that the renderer can draw. */
  centered: FrameRect;
  aspect: number;
  frameScale: number;
  /** Screen-space shift from desired → centered (apply to crop pan). */
  panScreenDelta: { x: number; y: number };
};

/**
 * Project a handle drag onto a valid crop frame + pan compensation.
 */
export function projectHandleResize(opts: {
  startFrame: FrameRect;
  handle: CropHandle;
  dx: number;
  dy: number;
  /** Locked aspect (w/h), or null for freeform. */
  aspect: number | null;
  viewportWidth: number;
  viewportHeight: number;
  pad?: number;
  minFrameScale?: number;
  maxFrameScale?: number;
}): FrameResizeResult {
  const {
    startFrame,
    handle,
    dx,
    dy,
    aspect,
    viewportWidth: vw,
    viewportHeight: vh,
    pad = FRAME_EDGE_PAD,
    minFrameScale = MIN_FRAME_SCALE,
    maxFrameScale = MAX_FRAME_SCALE,
  } = opts;

  const maxW = Math.max(MIN_FRAME_PX, vw - pad * 2);
  const maxH = Math.max(MIN_FRAME_PX, vh - pad * 2);

  const desired =
    aspect != null && aspect > 0
      ? resizeLocked(startFrame, handle, dx, dy, aspect, maxW, maxH)
      : resizeFreeform(startFrame, handle, dx, dy, maxW, maxH);

  const nextAspect =
    aspect != null && aspect > 0
      ? aspect
      : desired.height > 0
        ? desired.width / desired.height
        : 1;

  const atFull = computeIosFrameSize(vw, vh, nextAspect, 1);
  let frameScale =
    atFull.width > 0 ? desired.width / atFull.width : maxFrameScale;
  frameScale = clamp(frameScale, minFrameScale, maxFrameScale);

  const centered = computeIosFrameSize(vw, vh, nextAspect, frameScale);

  return {
    desired,
    centered,
    aspect: nextAspect,
    frameScale,
    panScreenDelta: {
      x: centered.left - desired.left,
      y: centered.top - desired.top,
    },
  };
}
