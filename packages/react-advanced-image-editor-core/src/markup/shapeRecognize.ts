import type { MarkupPoint, MarkupShape, MarkupShapeKind } from './types';
import { withShapeDefaults } from './shapeGeometry';

function boundsOf(points: MarkupPoint[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function pathLength(points: MarkupPoint[]) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

function closedness(points: MarkupPoint[]) {
  if (points.length < 3) return 0;
  const a = points[0];
  const b = points[points.length - 1];
  const diag = Math.hypot(boundsOf(points).w, boundsOf(points).h) || 1;
  return 1 - Math.min(1, Math.hypot(a.x - b.x, a.y - b.y) / diag);
}

/** Circularity: 4πA / P² — 1 for a perfect circle. */
function circularity(points: MarkupPoint[]) {
  const b = boundsOf(points);
  const area = Math.max(1e-8, b.w * b.h);
  const last = points[points.length - 1];
  const peri = pathLength(points) + Math.hypot(points[0].x - last.x, points[0].y - last.y);
  return (4 * Math.PI * area) / (peri * peri + 1e-8);
}

function isLineLike(points: MarkupPoint[]) {
  const b = boundsOf(points);
  const span = Math.hypot(b.w, b.h);
  if (span < 0.04) return false;
  const a = points[0];
  const c = points[points.length - 1];
  const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
  let maxDev = 0;
  for (const p of points) {
    const t = ((p.x - a.x) * (c.x - a.x) + (p.y - a.y) * (c.y - a.y)) / (len * len);
    const px = a.x + t * (c.x - a.x);
    const py = a.y + t * (c.y - a.y);
    maxDev = Math.max(maxDev, Math.hypot(p.x - px, p.y - py));
  }
  return maxDev / span < 0.08;
}

function looksLikeArrow(points: MarkupPoint[]) {
  if (points.length < 6) return false;
  if (!isLineLike(points.slice(0, Math.floor(points.length * 0.7)))) return false;
  // Head: last ~30% fans out wider than the shaft
  const shaft = points.slice(0, Math.floor(points.length * 0.65));
  const head = points.slice(Math.floor(points.length * 0.65));
  const sb = boundsOf(shaft);
  const hb = boundsOf(head);
  const shaftW = Math.min(sb.w, sb.h);
  const headW = Math.max(hb.w, hb.h);
  return headW > shaftW * 1.8 && headW > 0.03;
}

function rectScore(points: MarkupPoint[]) {
  const b = boundsOf(points);
  if (b.w < 0.04 || b.h < 0.04) return 0;
  const close = closedness(points);
  if (close < 0.55) return 0;
  // Sample how close points sit to the AABB perimeter
  let onEdge = 0;
  for (const p of points) {
    const dx = Math.min(Math.abs(p.x - b.minX), Math.abs(p.x - b.maxX));
    const dy = Math.min(Math.abs(p.y - b.minY), Math.abs(p.y - b.maxY));
    if (dx < b.w * 0.12 || dy < b.h * 0.12) onEdge++;
  }
  const edgeRatio = onEdge / points.length;
  const aspect = b.w / (b.h + 1e-8);
  const squareBonus = aspect > 0.75 && aspect < 1.35 ? 0.1 : 0;
  return edgeRatio * close + squareBonus;
}

/**
 * Best-effort gesture → clean geometric shape.
 * Returns null when the stroke should stay freehand.
 */
export function recognizeShape(
  points: MarkupPoint[],
  id: string,
  color: string,
  width: number
): MarkupShape | null {
  if (points.length < 4) return null;
  const b = boundsOf(points);
  if (b.w < 0.02 && b.h < 0.02) return null;

  let shape: MarkupShapeKind | null = null;

  if (looksLikeArrow(points)) shape = 'arrow';
  else if (isLineLike(points) && closedness(points) < 0.35) shape = 'line';
  else {
    const circ = circularity(points) * closedness(points);
    const rect = rectScore(points);
    if (circ > 0.55 && circ >= rect) shape = 'circle';
    else if (rect > 0.55) shape = 'rect';
  }

  if (!shape) return null;

  if (shape === 'line' || shape === 'arrow') {
    const a = points[0];
    const c = points[points.length - 1];
    return {
      kind: 'shape',
      id,
      shape,
      color,
      width,
      x: a.x,
      y: a.y,
      w: Math.max(0.01, Math.abs(c.x - a.x)),
      h: Math.max(0.01, Math.abs(c.y - a.y)),
      x2: c.x,
      y2: c.y,
      rotation: 0,
      fill: null,
      stroke: color,
      opacity: 1,
      ...(shape === 'arrow'
        ? { cx: (a.x + c.x) / 2, cy: (a.y + c.y) / 2 }
        : null),
    };
  }

  return {
    kind: 'shape',
    id,
    shape,
    color,
    width,
    x: b.minX,
    y: b.minY,
    w: Math.max(0.02, b.w),
    h: Math.max(0.02, b.h),
    rotation: 0,
    fill: null,
    stroke: color,
    opacity: 1,
  };
}

/** Build a shape from a drag gesture (shape tool with explicit kind). */
export function shapeFromDrag(
  kind: MarkupShapeKind,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  id: string,
  color: string,
  width: number
): MarkupShape {
  const stroke = color;
  const fill = null;
  if (kind === 'line' || kind === 'arrow') {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return {
      kind: 'shape',
      id,
      shape: kind,
      color,
      width,
      x: x0,
      y: y0,
      w: Math.max(0.01, Math.abs(x1 - x0)),
      h: Math.max(0.01, Math.abs(y1 - y0)),
      x2: x1,
      y2: y1,
      rotation: 0,
      fill,
      stroke,
      opacity: 1,
      ...(kind === 'arrow' ? { cx, cy } : null),
    };
  }
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.max(0.01, Math.abs(x1 - x0));
  const h = Math.max(0.01, Math.abs(y1 - y0));
  return withShapeDefaults({
    kind: 'shape',
    id,
    shape: kind,
    color,
    width,
    x,
    y,
    w,
    h,
    rotation: 0,
    fill,
    stroke,
    opacity: 1,
  });
}
