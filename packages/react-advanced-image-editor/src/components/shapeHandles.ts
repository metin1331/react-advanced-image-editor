import type { MarkupObject, MarkupPoint, MarkupShape, MarkupText } from 'react-advanced-image-editor-core';
import {
  adjHandleWorldPoints,
  objectBounds,
  speechTailLocal,
  type ShapeAdjHandle,
} from 'react-advanced-image-editor-core';

export type ShapeHandle =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'e'
  | 'w'
  | 'arrow-start'
  | 'arrow-end'
  | 'arrow-bend'
  | ShapeAdjHandle;

const HIT = 0.032;
const ADJ_HANDLES: ShapeAdjHandle[] = [
  'adj-corner',
  'adj-hex',
  'adj-arrow-head',
  'adj-arrow-shaft',
  'adj-star',
  'adj-tail-tip',
  'adj-tail-width',
];

function handleHitPx(frameSize?: { width: number; height: number }): number {
  const short = Math.min(frameSize?.width ?? 0, frameSize?.height ?? 0);
  return Math.max(36, short * 0.06);
}

function distPx(
  a: MarkupPoint,
  b: MarkupPoint,
  frameSize?: { width: number; height: number }
): number {
  const fw = Math.max(1, frameSize?.width ?? 1);
  const fh = Math.max(1, frameSize?.height ?? 1);
  return Math.hypot((a.x - b.x) * fw, (a.y - b.y) * fh);
}

function rotLocal(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rotationDeg: number
): { lx: number; ly: number } {
  const rad = (-rotationDeg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    lx: dx * Math.cos(rad) - dy * Math.sin(rad),
    ly: dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

/** Screen-space (normalized) positions of the 6 box handles in world coords. */
export function boxHandleWorldPoints(shape: MarkupShape): Record<'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w', MarkupPoint> {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const hw = shape.w / 2;
  const hh = shape.h / 2;
  const rad = ((shape.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const map = (lx: number, ly: number): MarkupPoint => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  });
  return {
    nw: map(-hw, -hh),
    ne: map(hw, -hh),
    sw: map(-hw, hh),
    se: map(hw, hh),
    e: map(hw, 0),
    w: map(-hw, 0),
  };
}

export function arrowHandlePoints(shape: MarkupShape): {
  start: MarkupPoint;
  end: MarkupPoint;
  bend: MarkupPoint;
} {
  const x2 = shape.x2 ?? shape.x + shape.w;
  const y2 = shape.y2 ?? shape.y + shape.h;
  const bend = {
    x: shape.cx ?? (shape.x + x2) / 2,
    y: shape.cy ?? (shape.y + y2) / 2,
  };
  return { start: { x: shape.x, y: shape.y }, end: { x: x2, y: y2 }, bend };
}

export function isAdjHandle(handle: ShapeHandle): handle is ShapeAdjHandle {
  return ADJ_HANDLES.includes(handle as ShapeAdjHandle);
}

export function hitShapeHandle(
  pt: MarkupPoint,
  obj: MarkupObject,
  frameSize?: { width: number; height: number }
): ShapeHandle | null {
  if (obj.kind !== 'shape') return null;
  const hit = frameSize ? handleHitPx(frameSize) : HIT;
  const near = (p: MarkupPoint) =>
    frameSize ? distPx(p, pt, frameSize) <= hit : Math.hypot(p.x - pt.x, p.y - pt.y) <= HIT;

  if (obj.shape === 'arrow' || obj.shape === 'line') {
    const { start, end, bend } = arrowHandlePoints(obj);
    if (near(start)) return 'arrow-start';
    if (near(end)) return 'arrow-end';
    if (obj.shape === 'arrow' && near(bend)) return 'arrow-bend';
    return null;
  }

  const adj = adjHandleWorldPoints(obj);
  for (const name of ADJ_HANDLES) {
    const p = adj[name];
    if (p && near(p)) return name;
  }

  const handles = boxHandleWorldPoints(obj);
  for (const name of ['nw', 'ne', 'sw', 'se', 'e', 'w'] as const) {
    if (near(handles[name])) return name;
  }
  return null;
}

export function applyBoxHandleResize(
  shape: MarkupShape,
  handle: ShapeHandle,
  start: { x: number; y: number; w: number; h: number; rotation: number },
  pt: MarkupPoint
): MarkupShape {
  if (
    handle === 'arrow-start' ||
    handle === 'arrow-end' ||
    handle === 'arrow-bend' ||
    isAdjHandle(handle)
  ) {
    return shape;
  }

  const cx = start.x + start.w / 2;
  const cy = start.y + start.h / 2;
  const { lx, ly } = rotLocal(pt.x, pt.y, cx, cy, start.rotation);
  let left = -start.w / 2;
  let right = start.w / 2;
  let top = -start.h / 2;
  let bottom = start.h / 2;

  if (handle.includes('e') || handle === 'e') right = Math.max(left + 0.04, lx);
  if (handle.includes('w') || handle === 'w') left = Math.min(right - 0.04, lx);
  if (handle.includes('s')) bottom = Math.max(top + 0.04, ly);
  if (handle.includes('n')) top = Math.min(bottom - 0.04, ly);
  if (handle === 'e' || handle === 'w') {
    // width-only: keep vertical extents
    top = -start.h / 2;
    bottom = start.h / 2;
  }

  const nw = right - left;
  const nh = bottom - top;
  const lcx = (left + right) / 2;
  const lcy = (top + bottom) / 2;
  const rad = (start.rotation * Math.PI) / 180;
  const wcx = cx + lcx * Math.cos(rad) - lcy * Math.sin(rad);
  const wcy = cy + lcx * Math.sin(rad) + lcy * Math.cos(rad);

  return {
    ...shape,
    x: wcx - nw / 2,
    y: wcy - nh / 2,
    w: nw,
    h: nh,
  };
}

export function applyArrowHandle(
  shape: MarkupShape,
  handle: 'arrow-start' | 'arrow-end' | 'arrow-bend',
  pt: MarkupPoint
): MarkupShape {
  if (handle === 'arrow-start') {
    const x2 = shape.x2 ?? shape.x + shape.w;
    const y2 = shape.y2 ?? shape.y + shape.h;
    return {
      ...shape,
      x: pt.x,
      y: pt.y,
      w: Math.max(0.01, Math.abs(x2 - pt.x)),
      h: Math.max(0.01, Math.abs(y2 - pt.y)),
      x2,
      y2,
    };
  }
  if (handle === 'arrow-end') {
    return {
      ...shape,
      w: Math.max(0.01, Math.abs(pt.x - shape.x)),
      h: Math.max(0.01, Math.abs(pt.y - shape.y)),
      x2: pt.x,
      y2: pt.y,
    };
  }
  return { ...shape, cx: pt.x, cy: pt.y };
}

export function applyAdjHandle(
  shape: MarkupShape,
  handle: ShapeAdjHandle,
  pt: MarkupPoint
): MarkupShape {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const { lx, ly } = rotLocal(pt.x, pt.y, cx, cy, shape.rotation || 0);
  const hw = Math.max(1e-6, shape.w / 2);
  const hh = Math.max(1e-6, shape.h / 2);

  if (handle === 'adj-corner') {
    const maxR = Math.min(hw, hh);
    return { ...shape, cornerRadius: clamp((lx + hw) / maxR, 0, 1) };
  }
  if (handle === 'adj-hex') {
    return { ...shape, hexInset: clamp(lx / hw, 0.12, 0.92) };
  }
  if (handle === 'adj-arrow-head') {
    return { ...shape, arrowHead: clamp((hw - lx) / (2 * hw), 0.16, 0.72) };
  }
  if (handle === 'adj-arrow-shaft') {
    return { ...shape, arrowShaft: clamp(Math.abs(ly) / hh, 0.16, 0.9) };
  }
  if (handle === 'adj-star') {
    const a = Math.PI / 5 - Math.PI / 2;
    const outer = Math.hypot(Math.cos(a) * hw, Math.sin(a) * hh) || 1e-6;
    return { ...shape, starInset: clamp(Math.hypot(lx, ly) / outer, 0.18, 0.82) };
  }
  if (handle === 'adj-tail-tip') {
    return {
      ...shape,
      tailU: clamp(lx / (2 * hw), -1.15, 1.15),
      tailV: clamp(ly / (2 * hh), -1.15, 1.15),
    };
  }
  if (handle === 'adj-tail-width') {
    const tail = speechTailLocal(shape, hw, hh);
    const dist = Math.hypot(lx - tail.attach.x, ly - tail.attach.y);
    return { ...shape, tailWidth: clamp(dist / Math.min(hw, hh), 0.06, 0.55) };
  }
  return shape;
}

export function shapeBadgeAnchor(shape: MarkupShape): { x: number; y: number } {
  const b = objectBounds(shape);
  return { x: b.x + b.w / 2, y: Math.max(0.02, b.y - 0.02) };
}

export function textBadgeAnchor(
  text: MarkupText,
  frameSize?: { width: number; height: number }
): { x: number; y: number } {
  const b = objectBounds(text, frameSize);
  return { x: b.x + b.w / 2, y: Math.max(0.02, b.y - 0.02) };
}

export function syncShapeStyleMirrors(shape: MarkupShape): MarkupShape {
  const color = shape.stroke ?? shape.fill ?? shape.color ?? '#007aff';
  return {
    ...shape,
    color,
    filled: shape.fill != null && shape.stroke == null,
  };
}
