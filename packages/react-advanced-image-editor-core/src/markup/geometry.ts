import type {
  MarkupLoupe,
  MarkupObject,
  MarkupPoint,
  MarkupShape,
  MarkupSignature,
  MarkupSticker,
  MarkupStroke,
  MarkupText,
} from './types';
import { textBlockHeightNorm } from './textLayout';

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function strokeBounds(stroke: MarkupStroke): NormRect {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of stroke.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = stroke.width;
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(0.001, maxX - minX + pad * 2),
    h: Math.max(0.001, maxY - minY + pad * 2),
  };
}

export function textBounds(
  text: MarkupText,
  frameSize?: { width: number; height: number }
): NormRect {
  if (frameSize) {
    const h = textBlockHeightNorm(text, frameSize.width, frameSize.height);
    return { x: text.x, y: text.y, w: text.w, h };
  }
  // Fallback when frame size is unknown (no wrap measurement).
  const lines = Math.max(1, text.text.split('\n').length);
  const h = text.fontSize * 1.25 * lines;
  return { x: text.x, y: text.y, w: text.w, h };
}

export function shapeBounds(shape: MarkupShape): NormRect {
  if (shape.shape === 'line' || shape.shape === 'arrow') {
    const x2 = shape.x2 ?? shape.x + shape.w;
    const y2 = shape.y2 ?? shape.y + shape.h;
    let minX = Math.min(shape.x, x2);
    let minY = Math.min(shape.y, y2);
    let maxX = Math.max(shape.x, x2);
    let maxY = Math.max(shape.y, y2);
    if (shape.shape === 'arrow' && shape.cx != null && shape.cy != null) {
      minX = Math.min(minX, shape.cx);
      minY = Math.min(minY, shape.cy);
      maxX = Math.max(maxX, shape.cx);
      maxY = Math.max(maxY, shape.cy);
    }
    return {
      x: minX,
      y: minY,
      w: Math.max(0.01, maxX - minX),
      h: Math.max(0.01, maxY - minY),
    };
  }
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
}

export function signatureBounds(sig: MarkupSignature): NormRect {
  return { x: sig.x, y: sig.y, w: sig.w, h: sig.h };
}

export function stickerBounds(sticker: MarkupSticker): NormRect {
  return { x: sticker.x, y: sticker.y, w: sticker.w, h: sticker.h };
}

export function loupeBounds(
  loupe: MarkupLoupe,
  frameSize?: { width: number; height: number }
): NormRect {
  const fw = frameSize?.width ?? 1;
  const fh = frameSize?.height ?? 1;
  const short = Math.min(fw, fh);
  const rx = (loupe.radius * short) / Math.max(1e-6, fw);
  const ry = (loupe.radius * short) / Math.max(1e-6, fh);
  return {
    x: loupe.x - rx,
    y: loupe.y - ry,
    w: rx * 2,
    h: ry * 2,
  };
}

export function objectBounds(
  obj: MarkupObject,
  frameSize?: { width: number; height: number }
): NormRect {
  if (obj.kind === 'stroke') return strokeBounds(obj);
  if (obj.kind === 'text') return textBounds(obj, frameSize);
  if (obj.kind === 'signature') return signatureBounds(obj);
  if (obj.kind === 'sticker') return stickerBounds(obj);
  if (obj.kind === 'loupe') return loupeBounds(obj, frameSize);
  return shapeBounds(obj);
}

export function rectsIntersect(a: NormRect, b: NormRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(x: number, y: number, r: NormRect, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** Ray-casting point-in-polygon for lasso paths. */
export function pointInPolygon(x: number, y: number, poly: MarkupPoint[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function translateObject(obj: MarkupObject, dx: number, dy: number): MarkupObject {
  if (obj.kind === 'stroke') {
    return {
      ...obj,
      points: obj.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    };
  }
  if (obj.kind === 'shape' && (obj.shape === 'line' || obj.shape === 'arrow')) {
    return {
      ...obj,
      x: obj.x + dx,
      y: obj.y + dy,
      x2: (obj.x2 ?? obj.x + obj.w) + dx,
      y2: (obj.y2 ?? obj.y + obj.h) + dy,
      ...(obj.cx != null ? { cx: obj.cx + dx } : null),
      ...(obj.cy != null ? { cy: obj.cy + dy } : null),
    };
  }
  return { ...obj, x: obj.x + dx, y: obj.y + dy };
}

/** Project a point onto an infinite line through (cx,cy) at `angle` degrees. */
export function projectOntoAngle(
  x: number,
  y: number,
  cx: number,
  cy: number,
  angleDeg: number
): MarkupPoint {
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = x - cx;
  const vy = y - cy;
  const t = vx * ux + vy * uy;
  return { x: cx + t * ux, y: cy + t * uy };
}
