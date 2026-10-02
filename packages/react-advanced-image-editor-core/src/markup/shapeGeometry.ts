import type { MarkupPoint, MarkupShape } from './types';

export const DEFAULT_CORNER_RADIUS = 0.34;
export const DEFAULT_HEX_INSET = 0.5;
export const DEFAULT_ARROW_HEAD = 0.38;
export const DEFAULT_ARROW_SHAFT = 0.46;
export const DEFAULT_STAR_INSET = 0.45;
export const DEFAULT_TAIL_U = -0.2;
export const DEFAULT_TAIL_V = 0.74;
export const DEFAULT_TAIL_WIDTH = 0.18;

export type ShapeAdjHandle =
  | 'adj-corner'
  | 'adj-hex'
  | 'adj-arrow-head'
  | 'adj-arrow-shaft'
  | 'adj-star'
  | 'adj-tail-tip'
  | 'adj-tail-width';

export function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

export function isPolyLineShape(shape: MarkupShape) {
  return shape.shape === 'line' || shape.shape === 'arrow';
}

export function resolvedShapeParams(shape: MarkupShape) {
  return {
    cornerRadius: clamp(shape.cornerRadius ?? DEFAULT_CORNER_RADIUS, 0, 1),
    hexInset: clamp(shape.hexInset ?? DEFAULT_HEX_INSET, 0.12, 0.92),
    arrowHead: clamp(shape.arrowHead ?? DEFAULT_ARROW_HEAD, 0.16, 0.72),
    arrowShaft: clamp(shape.arrowShaft ?? DEFAULT_ARROW_SHAFT, 0.16, 0.9),
    starInset: clamp(shape.starInset ?? DEFAULT_STAR_INSET, 0.18, 0.82),
    tailU: Number.isFinite(shape.tailU) ? (shape.tailU as number) : DEFAULT_TAIL_U,
    tailV: Number.isFinite(shape.tailV) ? (shape.tailV as number) : DEFAULT_TAIL_V,
    tailWidth: clamp(shape.tailWidth ?? DEFAULT_TAIL_WIDTH, 0.06, 0.55),
  };
}

export function shapeLocalToWorld(shape: MarkupShape, lx: number, ly: number): MarkupPoint {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const rad = ((shape.rotation || 0) * Math.PI) / 180;
  return {
    x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: cy + lx * Math.sin(rad) + ly * Math.cos(rad),
  };
}

export type TailEdge = 'top' | 'right' | 'bottom' | 'left';

export function speechTailLocal(shape: MarkupShape, hw: number, hh: number) {
  const p = resolvedShapeParams(shape);
  const tip = { x: p.tailU * 2 * hw, y: p.tailV * 2 * hh };
  const beyondL = -hw - tip.x;
  const beyondR = tip.x - hw;
  const beyondT = -hh - tip.y;
  const beyondB = tip.y - hh;
  const maxBeyond = Math.max(beyondL, beyondR, beyondT, beyondB);
  let edge: TailEdge = 'bottom';
  if (maxBeyond > 1e-6) {
    if (maxBeyond === beyondB) edge = 'bottom';
    else if (maxBeyond === beyondT) edge = 'top';
    else if (maxBeyond === beyondR) edge = 'right';
    else edge = 'left';
  } else {
    const dL = Math.abs(tip.x + hw);
    const dR = Math.abs(hw - tip.x);
    const dT = Math.abs(tip.y + hh);
    const dB = Math.abs(hh - tip.y);
    const nearest = Math.min(dL, dR, dT, dB);
    if (nearest === dB) edge = 'bottom';
    else if (nearest === dT) edge = 'top';
    else if (nearest === dR) edge = 'right';
    else edge = 'left';
  }

  const half = Math.max(0.008, p.tailWidth * Math.min(hw, hh) * 2);
  let attach = { x: 0, y: 0 };
  let t0 = { x: 0, y: 0 };
  let t1 = { x: 0, y: 0 };
  if (edge === 'bottom' || edge === 'top') {
    const y = edge === 'bottom' ? hh : -hh;
    const cx = clamp(tip.x, -hw + half, hw - half);
    attach = { x: cx, y };
    t0 = { x: cx - half, y };
    t1 = { x: cx + half, y };
  } else {
    const x = edge === 'right' ? hw : -hw;
    const cy = clamp(tip.y, -hh + half, hh - half);
    attach = { x, y: cy };
    t0 = { x, y: cy - half };
    t1 = { x, y: cy + half };
  }
  return { tip, attach, t0, t1, edge };
}

/** Local-space handle positions (same units as `shape.w` / `shape.h`). */
export function adjHandleLocalPoints(
  shape: MarkupShape
): Partial<Record<ShapeAdjHandle, MarkupPoint>> {
  const hw = shape.w / 2;
  const hh = shape.h / 2;
  const p = resolvedShapeParams(shape);
  if (shape.shape === 'roundRect') {
    const r = p.cornerRadius * Math.min(hw, hh);
    return { 'adj-corner': { x: -hw + r, y: -hh } };
  }
  if (shape.shape === 'hexagon') {
    return { 'adj-hex': { x: hw * p.hexInset, y: -hh } };
  }
  if (shape.shape === 'blockArrow') {
    const neckX = hw * (1 - 2 * p.arrowHead);
    return {
      'adj-arrow-head': { x: neckX, y: -hh },
      'adj-arrow-shaft': { x: neckX, y: -p.arrowShaft * hh },
    };
  }
  if (shape.shape === 'star') {
    const a = Math.PI / 5 - Math.PI / 2;
    return {
      'adj-star': {
        x: Math.cos(a) * hw * p.starInset,
        y: Math.sin(a) * hh * p.starInset,
      },
    };
  }
  if (shape.shape === 'speech') {
    const tail = speechTailLocal(shape, hw, hh);
    return {
      'adj-tail-tip': tail.tip,
      'adj-tail-width': tail.t1,
    };
  }
  return {};
}

export function adjHandleWorldPoints(
  shape: MarkupShape
): Partial<Record<ShapeAdjHandle, MarkupPoint>> {
  const local = adjHandleLocalPoints(shape);
  const out: Partial<Record<ShapeAdjHandle, MarkupPoint>> = {};
  for (const key of Object.keys(local) as ShapeAdjHandle[]) {
    const p = local[key];
    if (p) out[key] = shapeLocalToWorld(shape, p.x, p.y);
  }
  return out;
}

function addRoundRectPath(
  ctx: CanvasRenderingContext2D,
  hw: number,
  hh: number,
  radius: number
) {
  const r = Math.min(radius, hw, hh);
  const x = -hw;
  const y = -hh;
  const w = hw * 2;
  const h = hh * 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function addSpeechPath(
  ctx: CanvasRenderingContext2D,
  shape: MarkupShape,
  hw: number,
  hh: number
) {
  const p = resolvedShapeParams(shape);
  const r = Math.min(p.cornerRadius * Math.min(hw, hh), hw * 0.9, hh * 0.9);
  const tail = speechTailLocal(shape, hw, hh);
  const x = -hw;
  const y = -hh;
  const w = hw * 2;
  const h = hh * 2;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  if (tail.edge === 'top') {
    ctx.lineTo(Math.min(tail.t0.x, tail.t1.x), y);
    ctx.lineTo(tail.tip.x, tail.tip.y);
    ctx.lineTo(Math.max(tail.t0.x, tail.t1.x), y);
  }
  ctx.arcTo(x + w, y, x + w, y + h, r);
  if (tail.edge === 'right') {
    ctx.lineTo(x + w, Math.min(tail.t0.y, tail.t1.y));
    ctx.lineTo(tail.tip.x, tail.tip.y);
    ctx.lineTo(x + w, Math.max(tail.t0.y, tail.t1.y));
  }
  ctx.arcTo(x + w, y + h, x, y + h, r);
  if (tail.edge === 'bottom') {
    ctx.lineTo(Math.max(tail.t0.x, tail.t1.x), y + h);
    ctx.lineTo(tail.tip.x, tail.tip.y);
    ctx.lineTo(Math.min(tail.t0.x, tail.t1.x), y + h);
  }
  ctx.arcTo(x, y + h, x, y, r);
  if (tail.edge === 'left') {
    ctx.lineTo(x, Math.max(tail.t0.y, tail.t1.y));
    ctx.lineTo(tail.tip.x, tail.tip.y);
    ctx.lineTo(x, Math.min(tail.t0.y, tail.t1.y));
  }
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Build the local-pixel path. Caller must already translate to center + rotate. */
export function addShapePath(
  ctx: CanvasRenderingContext2D,
  shape: MarkupShape,
  rw: number,
  rh: number
) {
  const hw = rw / 2;
  const hh = rh / 2;
  const p = resolvedShapeParams(shape);

  if (shape.shape === 'rect') {
    ctx.beginPath();
    ctx.rect(-hw, -hh, rw, rh);
    return;
  }
  if (shape.shape === 'roundRect') {
    addRoundRectPath(ctx, hw, hh, p.cornerRadius * Math.min(hw, hh));
    return;
  }
  if (shape.shape === 'circle') {
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    return;
  }
  if (shape.shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(hw, hh);
    ctx.lineTo(-hw, hh);
    ctx.closePath();
    return;
  }
  if (shape.shape === 'hexagon') {
    const k = p.hexInset;
    ctx.beginPath();
    ctx.moveTo(-hw * k, -hh);
    ctx.lineTo(hw * k, -hh);
    ctx.lineTo(hw, 0);
    ctx.lineTo(hw * k, hh);
    ctx.lineTo(-hw * k, hh);
    ctx.lineTo(-hw, 0);
    ctx.closePath();
    return;
  }
  if (shape.shape === 'blockArrow') {
    const neckX = hw * (1 - 2 * p.arrowHead);
    const sy = p.arrowShaft * hh;
    ctx.beginPath();
    ctx.moveTo(-hw, -sy);
    ctx.lineTo(neckX, -sy);
    ctx.lineTo(neckX, -hh);
    ctx.lineTo(hw, 0);
    ctx.lineTo(neckX, hh);
    ctx.lineTo(neckX, sy);
    ctx.lineTo(-hw, sy);
    ctx.closePath();
    return;
  }
  if (shape.shape === 'star') {
    const spikes = 5;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i * Math.PI) / spikes - Math.PI / 2;
      const px = Math.cos(a) * (i % 2 === 0 ? hw : hw * p.starInset);
      const py = Math.sin(a) * (i % 2 === 0 ? hh : hh * p.starInset);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    return;
  }
  if (shape.shape === 'speech') {
    addSpeechPath(ctx, shape, hw, hh);
  }
}

export function withShapeDefaults(shape: MarkupShape): MarkupShape {
  if (shape.shape === 'roundRect' && shape.cornerRadius == null) {
    return { ...shape, cornerRadius: DEFAULT_CORNER_RADIUS };
  }
  if (shape.shape === 'hexagon' && shape.hexInset == null) {
    return { ...shape, hexInset: DEFAULT_HEX_INSET };
  }
  if (shape.shape === 'blockArrow') {
    return {
      ...shape,
      arrowHead: shape.arrowHead ?? DEFAULT_ARROW_HEAD,
      arrowShaft: shape.arrowShaft ?? DEFAULT_ARROW_SHAFT,
    };
  }
  if (shape.shape === 'star' && shape.starInset == null) {
    return { ...shape, starInset: DEFAULT_STAR_INSET };
  }
  if (shape.shape === 'speech') {
    return {
      ...shape,
      tailU: shape.tailU ?? DEFAULT_TAIL_U,
      tailV: shape.tailV ?? DEFAULT_TAIL_V,
      tailWidth: shape.tailWidth ?? DEFAULT_TAIL_WIDTH,
      cornerRadius: shape.cornerRadius ?? 0.28,
    };
  }
  return shape;
}
