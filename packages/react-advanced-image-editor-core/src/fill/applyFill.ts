import type { FillState } from './fillState';
import { fillBlurRadius, hasFill } from './fillState';

const fillImageCache = new Map<string, CanvasImageSource>();

export function getFillImage(url: string): CanvasImageSource | null {
  return fillImageCache.get(url) ?? null;
}

/** Decode a fill image so preview and export can paint it behind transparent pixels. */
export function ensureFillImage(url: string): Promise<CanvasImageSource | null> {
  const cached = fillImageCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      fillImageCache.set(url, image);
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number
) {
  let sourceW = width;
  let sourceH = height;
  if (image instanceof HTMLImageElement) {
    sourceW = image.naturalWidth || image.width;
    sourceH = image.naturalHeight || image.height;
  } else if (image instanceof HTMLCanvasElement || image instanceof ImageBitmap) {
    sourceW = image.width;
    sourceH = image.height;
  } else if (image instanceof HTMLVideoElement) {
    sourceW = image.videoWidth;
    sourceH = image.videoHeight;
  }
  const sw = Math.max(1, sourceW);
  const sh = Math.max(1, sourceH);
  const scale = Math.max(width / sw, height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

/**
 * Paint a color or image behind a photo's transparent pixels.
 * The caller draws the photo on top of this rect.
 */
export function paintFillBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fill: FillState,
  blurredSource?: CanvasImageSource | null,
  fillImage?: CanvasImageSource | null
) {
  if (!hasFill(fill)) return;

  if (fill.mode === 'image') {
    if (fillImage) drawCover(ctx, fillImage, width, height);
    return;
  }

  if (fill.mode === 'solid') {
    ctx.fillStyle = fill.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (fill.mode === 'edge-blur' && blurredSource) {
    ctx.save();
    ctx.filter = `blur(${fillBlurRadius(fill)}px) saturate(1.15)`;
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
