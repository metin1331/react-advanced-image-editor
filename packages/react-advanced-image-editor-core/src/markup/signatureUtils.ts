import type { MarkupPoint, MarkupSignaturePath, MarkupSignatureTemplate } from './types';

/** Shared stroke scale so pad preview and placed stamp match. */
export const SIGNATURE_STROKE_SCALE = 2.2;

export function signatureLineWidth(pathWidth: number, boxShortSide: number): number {
  return Math.max(1, pathWidth * boxShortSide * SIGNATURE_STROKE_SCALE);
}

/**
 * Stroke a signature path into a box — same geometry for pad + photo stamp.
 * `boxW`/`boxH` are the pixel size of the unit (0…1) content box.
 */
export function strokeSignaturePath(
  ctx: CanvasRenderingContext2D,
  path: MarkupSignaturePath,
  ox: number,
  oy: number,
  boxW: number,
  boxH: number,
  color: string
) {
  if (!path.points.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = signatureLineWidth(path.width, Math.min(boxW, boxH));
  ctx.beginPath();
  ctx.moveTo(ox + path.points[0].x * boxW, oy + path.points[0].y * boxH);
  for (let i = 1; i < path.points.length; i++) {
    ctx.lineTo(ox + path.points[i].x * boxW, oy + path.points[i].y * boxH);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Tight-crop pad strokes into a content-normalized template.
 * `padAspect` = padCssWidth / padCssHeight so X/Y unit cells map to real pixels.
 */
export function finalizeSignatureTemplate(
  paths: MarkupSignaturePath[],
  padAspect: number
): MarkupSignatureTemplate | null {
  if (!paths.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const p of path.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX) || maxX - minX < 1e-6 || maxY - minY < 1e-6) {
    return null;
  }

  // Small padding so round caps aren't clipped.
  const padX = (maxX - minX) * 0.04 + 0.01;
  const padY = (maxY - minY) * 0.04 + 0.01;
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(1, maxX + padX);
  maxY = Math.min(1, maxY + padY);

  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  // Content size in "pad-height units" (Y unit = 1 pad height).
  const contentW = spanX * Math.max(0.2, padAspect);
  const contentH = spanY;
  const contentShort = Math.min(contentW, contentH);
  const padShort = Math.min(padAspect, 1); // in pad-height units

  const remap = (p: MarkupPoint): MarkupPoint => {
    const next: MarkupPoint = {
      x: (p.x - minX) / spanX,
      y: (p.y - minY) / spanY,
    };
    if (p.p != null) next.p = p.p;
    return next;
  };

  const normalized: MarkupSignaturePath[] = paths.map((path) => {
    // Re-express stroke width relative to content short side (was pad short).
    const lineInPadShort = path.width * padShort * SIGNATURE_STROKE_SCALE;
    const width = lineInPadShort / (contentShort * SIGNATURE_STROKE_SCALE);
    return {
      width: Math.max(0.004, width),
      points: path.points.map(remap),
    };
  });

  return {
    paths: normalized,
    aspect: contentW / contentH,
  };
}
