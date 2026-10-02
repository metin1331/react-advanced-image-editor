import type { FillState } from './fillState';
import { hasFill } from './fillState';

/**
 * Paint letterbox / transparent areas before the cropped image is composited.
 * Called on the output canvas prior to drawing the photo.
 */
export function paintFillBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fill: FillState,
  blurredSource?: CanvasImageSource | null
) {
  if (!hasFill(fill)) return;

  if (fill.mode === 'solid') {
    ctx.fillStyle = fill.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (fill.mode === 'edge-blur' && blurredSource) {
    ctx.save();
    ctx.filter = 'blur(28px) saturate(1.15)';
    const scale = 1.08;
    const sw = width * scale;
    const sh = height * scale;
    ctx.drawImage(blurredSource, (width - sw) / 2, (height - sh) / 2, sw, sh);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  ctx.fillStyle = fill.color;
  ctx.fillRect(0, 0, width, height);
}

/** Build a small blurred copy of a canvas for edge-blur fill preview/export. */
export function buildBlurFillSource(source: CanvasImageSource, maxSize = 128): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d');
  if (!pctx) return null;

  let sw = maxSize;
  let sh = maxSize;
  if (source instanceof HTMLCanvasElement) {
    const ar = source.width / Math.max(1, source.height);
    if (ar >= 1) {
      sw = maxSize;
      sh = Math.max(1, Math.round(maxSize / ar));
    } else {
      sh = maxSize;
      sw = Math.max(1, Math.round(maxSize * ar));
    }
  }

  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, sw, sh);
  return canvas;
}
