import { strokeStyleFor } from './strokeStyle';
import type {
  MarkupLoupe,
  MarkupObject,
  MarkupPoint,
  MarkupShape,
  MarkupSignature,
  MarkupSticker,
  MarkupState,
  MarkupStroke,
  MarkupText,
} from './types';
import { addShapePath, speechTailLocal } from './shapeGeometry';
import { pointInRect } from './geometry';
import { strokeSignaturePath } from './signatureUtils';
import { paintStickerEmoji, preloadStickerEmoji } from './stickerEmoji';
import {
  layoutTextLineMeta,
  textBlockHeightNorm,
  textFontString,
  textLineHeightPx,
} from './textLayout';
import { hasMarkup, isLoupe, isStroke } from './types';

function shortSide(width: number, height: number) {
  return Math.max(1, Math.min(width, height));
}

function pixelWidth(norm: number, width: number, height: number, scale = 1) {
  return Math.max(1, norm * shortSide(width, height) * scale);
}

/** Quadratic mid-point smoothing — keeps fast strokes from looking jagged. */
function strokePath(
  ctx: CanvasRenderingContext2D,
  points: MarkupPoint[],
  width: number,
  height: number
) {
  if (points.length === 0) return;
  const toX = (p: MarkupPoint) => p.x * width;
  const toY = (p: MarkupPoint) => p.y * height;

  ctx.beginPath();
  ctx.moveTo(toX(points[0]), toY(points[0]));
  if (points.length === 1) {
    ctx.lineTo(toX(points[0]) + 0.01, toY(points[0]));
    return;
  }
  if (points.length === 2) {
    ctx.lineTo(toX(points[1]), toY(points[1]));
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (toX(points[i]) + toX(points[i + 1])) / 2;
    const midY = (toY(points[i]) + toY(points[i + 1])) / 2;
    ctx.quadraticCurveTo(toX(points[i]), toY(points[i]), midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(toX(last), toY(last));
}

function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: MarkupStroke,
  width: number,
  height: number
) {
  const style = strokeStyleFor(stroke.tool);
  const lineW = pixelWidth(stroke.width, width, height, style.widthScale);

  ctx.save();
  ctx.globalCompositeOperation = style.composite;
  ctx.globalAlpha = style.opacity;
  ctx.strokeStyle = stroke.tool === 'eraser' ? '#000' : stroke.color;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style.softBlur > 0) {
    const ref = shortSide(width, height) / 400;
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = style.softBlur * 2.5 * ref * lineW;
  }

  strokePath(ctx, stroke.points, width, height);
  ctx.stroke();

  if (stroke.tool === 'pencil' && stroke.points.length > 1) {
    ctx.globalAlpha = style.opacity * 0.45;
    ctx.lineWidth = lineW * 0.55;
    ctx.shadowBlur = 0;
    strokePath(ctx, stroke.points, width, height);
    ctx.stroke();
  }

  ctx.restore();
}

function canvasTextAlign(align: MarkupText['align']): CanvasTextAlign {
  if (align === 'center') return 'center';
  if (align === 'right') return 'right';
  return 'left';
}

function fillJustifiedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  boxW: number
) {
  const words = line.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 2) {
    ctx.textAlign = 'left';
    ctx.fillText(line, x, y);
    return;
  }
  const total = words.reduce((sum, word) => sum + ctx.measureText(word).width, 0);
  const gap = (boxW - total) / (words.length - 1);
  let cx = x;
  ctx.textAlign = 'left';
  for (let i = 0; i < words.length; i++) {
    ctx.fillText(words[i], cx, y);
    cx += ctx.measureText(words[i]).width + gap;
  }
}

function paintTextDecorations(
  ctx: CanvasRenderingContext2D,
  text: MarkupText,
  x: number,
  y: number,
  width: number,
  size: number
) {
  if (!text.underline && !text.strikethrough) return;
  ctx.save();
  ctx.strokeStyle = text.color;
  ctx.lineWidth = Math.max(1, size * 0.055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (text.underline) {
    const uy = y + size * 0.92;
    ctx.moveTo(x, uy);
    ctx.lineTo(x + width, uy);
  }
  if (text.strikethrough) {
    const sy = y + size * 0.52;
    ctx.moveTo(x, sy);
    ctx.lineTo(x + width, sy);
  }
  ctx.stroke();
  ctx.restore();
}

function paintText(
  ctx: CanvasRenderingContext2D,
  text: MarkupText,
  width: number,
  height: number
) {
  const size = Math.max(10, text.fontSize * shortSide(width, height));
  const x = text.x * width;
  const y = text.y * height;
  const boxW = text.w * width;
  ctx.save();
  ctx.font = textFontString(text, size);
  ctx.fillStyle = text.color;
  ctx.textBaseline = 'top';
  const lines = layoutTextLineMeta(text, width, height);
  const lineStep = textLineHeightPx(text, width, height);
  lines.forEach((line, i) => {
    const top = y + i * lineStep;
    const justify = text.align === 'justify' && !line.endParagraph && /\s/.test(line.text);
    if (justify) {
      fillJustifiedLine(ctx, line.text, x, top, boxW);
      paintTextDecorations(ctx, text, x, top, boxW, size);
      return;
    }
    ctx.textAlign = canvasTextAlign(text.align);
    const lineW = ctx.measureText(line.text).width;
    const left =
      text.align === 'center' ? x + (boxW - lineW) / 2 : text.align === 'right' ? x + boxW - lineW : x;
    const anchorX =
      text.align === 'center' ? x + boxW / 2 : text.align === 'right' ? x + boxW : x;
    // Never pass maxWidth — that shrinks glyphs. Wrap instead.
    ctx.fillText(line.text, anchorX, top);
    paintTextDecorations(ctx, text, left, top, lineW, size);
  });
  ctx.restore();
}

function lineEnds(shape: MarkupShape) {
  return {
    x1: shape.x,
    y1: shape.y,
    x2: shape.x2 ?? shape.x + shape.w,
    y2: shape.y2 ?? shape.y + shape.h,
  };
}

function paintShape(
  ctx: CanvasRenderingContext2D,
  shape: MarkupShape,
  width: number,
  height: number
) {
  const lineW = pixelWidth(shape.width, width, height);
  const fill = shape.fill;
  const stroke = shape.stroke;
  const opacity = Number.isFinite(shape.opacity) ? shape.opacity : 1;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (shape.shape === 'line' || shape.shape === 'arrow') {
    const { x1, y1, x2, y2 } = lineEnds(shape);
    const ax = x1 * width;
    const ay = y1 * height;
    const bx = x2 * width;
    const by = y2 * height;
    const strokeColor = stroke ?? shape.color;
    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    if (
      shape.shape === 'arrow' &&
      shape.cx != null &&
      shape.cy != null &&
      (Math.abs(shape.cx - (x1 + x2) / 2) > 1e-4 ||
        Math.abs(shape.cy - (y1 + y2) / 2) > 1e-4)
    ) {
      const cpx = shape.cx * width;
      const cpy = shape.cy * height;
      ctx.quadraticCurveTo(cpx, cpy, bx, by);
      ctx.stroke();
      // Tangent at t=1 for quadratic: 2*(B - C)
      const tx = bx - cpx;
      const ty = by - cpy;
      const ang = Math.atan2(ty, tx);
      const head = Math.max(10, lineW * 4);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - head * Math.cos(ang - 0.4), by - head * Math.sin(ang - 0.4));
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - head * Math.cos(ang + 0.4), by - head * Math.sin(ang + 0.4));
      ctx.stroke();
    } else {
      ctx.lineTo(bx, by);
      ctx.stroke();
      if (shape.shape === 'arrow') {
        const ang = Math.atan2(by - ay, bx - ax);
        const head = Math.max(10, lineW * 4);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - head * Math.cos(ang - 0.4), by - head * Math.sin(ang - 0.4));
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - head * Math.cos(ang + 0.4), by - head * Math.sin(ang + 0.4));
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  const cx = (shape.x + shape.w / 2) * width;
  const cy = (shape.y + shape.h / 2) * height;
  const rw = shape.w * width;
  const rh = shape.h * height;
  ctx.translate(cx, cy);
  ctx.rotate((shape.rotation * Math.PI) / 180);

  addShapePath(ctx, shape, rw, rh);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    addShapePath(ctx, shape, rw, rh);
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  ctx.restore();
}

function paintSignature(
  ctx: CanvasRenderingContext2D,
  sig: MarkupSignature,
  width: number,
  height: number
) {
  const ox = sig.x * width;
  const oy = sig.y * height;
  const bw = Math.max(1, sig.w * width);
  const bh = Math.max(1, sig.h * height);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  for (const path of sig.paths) {
    strokeSignaturePath(ctx, path, ox, oy, bw, bh, sig.color);
  }
  ctx.restore();
}

function paintSticker(
  ctx: CanvasRenderingContext2D,
  sticker: MarkupSticker,
  width: number,
  height: number
) {
  const w = Math.max(1, sticker.w * width);
  const h = Math.max(1, sticker.h * height);
  const cx = (sticker.x + sticker.w / 2) * width;
  const cy = (sticker.y + sticker.h / 2) * height;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.translate(cx, cy);
  ctx.rotate(((sticker.rotation || 0) * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  if (sticker.style === 'kaomoji') {
    const size = Math.max(10, Math.min(w, h) * 0.55);
    ctx.font = `600 ${size}px "Segoe UI", "Hiragino Sans", "Apple SD Gothic Neo", "Noto Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f5f5f7';
    // Soft shadow so light kaomoji stay readable on bright photos.
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = Math.max(2, size * 0.08);
    ctx.fillText(sticker.emoji, w / 2, h / 2 + size * 0.04, w * 0.96);
  } else {
    paintStickerEmoji(ctx, sticker.emoji, 0, 0, w, h);
    void preloadStickerEmoji(sticker.emoji);
  }
  ctx.restore();
}

export function paintLoupe(
  ctx: CanvasRenderingContext2D,
  loupe: MarkupLoupe,
  width: number,
  height: number,
  source: CanvasImageSource | null
) {
  const short = shortSide(width, height);
  const r = Math.max(8, loupe.radius * short);
  const cx = loupe.x * width;
  const cy = loupe.y * height;
  const mag = Math.min(8, Math.max(1.2, loupe.mag || 2.2));

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(0,0,0,0.38)';
  ctx.shadowBlur = Math.max(6, r * 0.16);
  ctx.shadowOffsetY = Math.max(2, r * 0.05);

  if (source) {
    ctx.save();
    ctx.clip();
    ctx.shadowColor = 'transparent';
    const srcR = r / mag;
    ctx.drawImage(
      source,
      cx - srcR,
      cy - srcR,
      srcR * 2,
      srcR * 2,
      cx - r,
      cy - r,
      r * 2,
      r * 2
    );
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
  }

  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(3.5, r * 0.07);
  ctx.strokeStyle = 'rgba(248,248,250,0.96)';
  ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.018);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.stroke();
  ctx.restore();
}

export function paintObject(
  ctx: CanvasRenderingContext2D,
  obj: MarkupObject,
  width: number,
  height: number
) {
  if (obj.kind === 'stroke') paintStroke(ctx, obj, width, height);
  else if (obj.kind === 'text') paintText(ctx, obj, width, height);
  else if (obj.kind === 'signature') paintSignature(ctx, obj, width, height);
  else if (obj.kind === 'sticker') paintSticker(ctx, obj, width, height);
  else if (obj.kind === 'loupe') paintLoupe(ctx, obj, width, height, null);
  else paintShape(ctx, obj, width, height);
}

/** Paint all markup objects onto an existing 2D context (export / preview bake). */
export function renderMarkup(
  ctx: CanvasRenderingContext2D,
  markup: MarkupState | null | undefined,
  width: number,
  height: number,
  photoSource?: CanvasImageSource | null
) {
  if (!hasMarkup(markup) || !markup) return;
  const rest = markup.objects.filter((o) => o.kind !== 'loupe');
  const loupes = markup.objects.filter(isLoupe);
  for (const obj of rest) {
    paintObject(ctx, obj, width, height);
  }
  if (!loupes.length) return;

  const snap = document.createElement('canvas');
  snap.width = Math.max(1, Math.round(width));
  snap.height = Math.max(1, Math.round(height));
  const sctx = snap.getContext('2d');
  if (sctx) {
    if (photoSource) {
      try {
        sctx.drawImage(photoSource, 0, 0, snap.width, snap.height);
      } catch {
        /* tainted / not ready */
      }
      for (const obj of rest) paintObject(sctx, obj, width, height);
    } else {
      try {
        sctx.drawImage(ctx.canvas, 0, 0);
      } catch {
        /* tainted */
      }
    }
  }
  for (const loupe of loupes) {
    paintLoupe(ctx, loupe, width, height, sctx ? snap : null);
  }
}

/**
 * Distance from a point to a polyline in normalized space, scaled so stroke
 * half-width is comparable across aspect ratios.
 */
export function distanceToStroke(
  stroke: MarkupStroke,
  x: number,
  y: number,
  frameAspect = 1
): number {
  const pts = stroke.points;
  if (!pts.length) return Infinity;
  let best = Infinity;
  const ax = frameAspect >= 1 ? frameAspect : 1;
  const ay = frameAspect >= 1 ? 1 : 1 / frameAspect;
  for (let i = 0; i < pts.length; i++) {
    const dx = (pts[i].x - x) * ax;
    const dy = (pts[i].y - y) * ay;
    best = Math.min(best, Math.hypot(dx, dy));
    if (i === 0) continue;
    const x1 = pts[i - 1].x;
    const y1 = pts[i - 1].y;
    const x2 = pts[i].x;
    const y2 = pts[i].y;
    const vx = x2 - x1;
    const vy = y2 - y1;
    const len2 = vx * vx * ax * ax + vy * vy * ay * ay;
    if (len2 < 1e-12) continue;
    let t = ((x - x1) * vx * ax * ax + (y - y1) * vy * ay * ay) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * vx;
    const py = y1 + t * vy;
    best = Math.min(best, Math.hypot((px - x) * ax, (py - y) * ay));
  }
  return best;
}

/** True when the probe sits within the stroke's visual radius (+ slop). */
export function hitTestStroke(
  stroke: MarkupStroke,
  x: number,
  y: number,
  frameAspect = 1,
  slop = 0.012
): boolean {
  const style = strokeStyleFor(stroke.tool === 'eraser' ? 'pen' : stroke.tool);
  const radius = (stroke.width * style.widthScale) / 2 + slop;
  return distanceToStroke(stroke, x, y, frameAspect) <= radius;
}

export function hitTestObject(
  obj: MarkupObject,
  x: number,
  y: number,
  frameAspect = 1,
  frameSize?: { width: number; height: number }
): boolean {
  if (isStroke(obj)) {
    if (obj.tool === 'eraser') return false;
    return hitTestStroke(obj, x, y, frameAspect);
  }
  if (obj.kind === 'text') {
    const fw = frameSize?.width ?? 1000;
    const fh = frameSize?.height ?? 1000;
    const h = textBlockHeightNorm(obj, fw, fh);
    return x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + h;
  }
  if (obj.kind === 'signature') {
    return pointInRect(x, y, { x: obj.x, y: obj.y, w: obj.w, h: obj.h }, 0.01);
  }
  if (obj.kind === 'sticker') {
    // Inverse-rotate probe into sticker local space for accurate hit testing.
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    const rad = (-(obj.rotation || 0) * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    const pad = 0.012;
    return Math.abs(lx) <= obj.w / 2 + pad && Math.abs(ly) <= obj.h / 2 + pad;
  }
  if (obj.kind === 'loupe') {
    const fw = frameSize?.width ?? 1;
    const fh = frameSize?.height ?? 1;
    const short = Math.min(fw, fh);
    const dx = (x - obj.x) * fw;
    const dy = (y - obj.y) * fh;
    const r = obj.radius * short;
    return Math.hypot(dx, dy) <= r + Math.max(10, short * 0.02);
  }
  // shapes: AABB (good enough for Phase 2 hit testing)
  if (obj.shape === 'line' || obj.shape === 'arrow') {
    const x2 = obj.x2 ?? obj.x + obj.w;
    const y2 = obj.y2 ?? obj.y + obj.h;
    const points =
      obj.shape === 'arrow' && obj.cx != null && obj.cy != null
        ? (() => {
            const pts: { x: number; y: number }[] = [];
            for (let i = 0; i <= 16; i++) {
              const t = i / 16;
              const mt = 1 - t;
              pts.push({
                x: mt * mt * obj.x + 2 * mt * t * obj.cx! + t * t * x2,
                y: mt * mt * obj.y + 2 * mt * t * obj.cy! + t * t * y2,
              });
            }
            return pts;
          })()
        : [
            { x: obj.x, y: obj.y },
            { x: x2, y: y2 },
          ];
    const fake: MarkupStroke = {
      kind: 'stroke',
      id: obj.id,
      tool: 'pen',
      color: obj.color,
      width: obj.width,
      points,
    };
    return hitTestStroke(fake, x, y, frameAspect, 0.02);
  }
  // Rotated box shapes — inverse-rotate probe into local space.
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  const rad = (-(obj.rotation || 0) * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  const lx = obj.rotation
    ? dx * Math.cos(rad) - dy * Math.sin(rad)
    : dx;
  const ly = obj.rotation
    ? dx * Math.sin(rad) + dy * Math.cos(rad)
    : dy;
  const pad = 0.012;
  const inBody =
    Math.abs(lx) <= obj.w / 2 + pad && Math.abs(ly) <= obj.h / 2 + pad;
  if (obj.shape === 'speech') {
    const tail = speechTailLocal(obj, obj.w / 2, obj.h / 2);
    const ax = tail.tip.x;
    const ay = tail.tip.y;
    const bx = tail.t0.x;
    const by = tail.t0.y;
    const cxT = tail.t1.x;
    const cyT = tail.t1.y;
    const d1 = (lx - bx) * (ay - by) - (ax - bx) * (ly - by);
    const d2 = (lx - cxT) * (by - cyT) - (bx - cxT) * (ly - cyT);
    const d3 = (lx - ax) * (cyT - ay) - (cxT - ax) * (ly - ay);
    const inTail =
      (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
    return inBody || inTail;
  }
  if (obj.rotation) return inBody;
  return (
    x >= obj.x - 0.01 &&
    x <= obj.x + obj.w + 0.01 &&
    y >= obj.y - 0.01 &&
    y <= obj.y + obj.h + 0.01
  );
}
