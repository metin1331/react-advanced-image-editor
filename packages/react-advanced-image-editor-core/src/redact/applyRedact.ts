import type { RedactPoint, RedactRegion, RedactState } from './redactState';
import { hasRedact } from './redactState';

/**
 * Bake redact regions into the image canvas (destructive for export / flatten).
 * Samples the underlying pixels — does not use cosmetic CSS overlays.
 */
export function applyRedact(canvas: HTMLCanvasElement, redact: RedactState): HTMLCanvasElement {
  if (!hasRedact(redact)) return canvas;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  // Snapshot once so successive regions still sample the pre-redact image.
  const source = document.createElement('canvas');
  source.width = w;
  source.height = h;
  const sctx = source.getContext('2d');
  if (!sctx) return canvas;
  sctx.drawImage(canvas, 0, 0);

  for (const region of redact.regions) {
    applyRegion(ctx, source, region, w, h);
  }

  return canvas;
}

let filterBlurWorks: boolean | null = null;

/**
 * iOS Safari ignores `ctx.filter` blur when a canvas is drawn onto itself,
 * and on some versions ignores it for every offscreen canvas. Probe once;
 * fall back to a separable box blur so the redact still reads on iPhone.
 */
function canvasFilterBlurWorks() {
  if (filterBlurWorks != null) return filterBlurWorks;
  try {
    const src = document.createElement('canvas');
    src.width = 6;
    src.height = 6;
    const sctx = src.getContext('2d');
    const out = document.createElement('canvas');
    out.width = 6;
    out.height = 6;
    const octx = out.getContext('2d');
    if (!sctx || !octx || !('filter' in octx)) {
      filterBlurWorks = false;
      return false;
    }
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, 6, 6);
    sctx.fillStyle = '#fff';
    sctx.fillRect(2, 2, 2, 2);
    octx.filter = 'blur(2px)';
    octx.drawImage(src, 0, 0);
    const corner = octx.getImageData(0, 0, 1, 1).data;
    filterBlurWorks = corner[0] > 8;
  } catch {
    filterBlurWorks = false;
  }
  return filterBlurWorks;
}

function blurCanvas(source: HTMLCanvasElement, radius: number) {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const octx = out.getContext('2d');
  if (!octx) return source;
  if (canvasFilterBlurWorks()) {
    octx.filter = `blur(${Math.max(1, radius)}px)`;
    octx.drawImage(source, 0, 0);
    return out;
  }
  const sctx = source.getContext('2d');
  if (!sctx) return source;
  const image = sctx.getImageData(0, 0, source.width, source.height);
  boxBlurImage(image, radius);
  octx.putImageData(image, 0, 0);
  return out;
}

function boxBlurImage(image: ImageData, radius: number) {
  const r = Math.max(1, Math.round(radius / 3));
  const { width, height, data } = image;
  const tmp = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurAxis(data, tmp, width, height, r, true);
    boxBlurAxis(tmp, data, width, height, r, false);
  }
}

function boxBlurAxis(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
) {
  const span = radius * 2 + 1;
  const clamp = (i: number, max: number) => (i < 0 ? 0 : i >= max ? max - 1 : i);
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let s3 = 0;
      for (let k = -radius; k <= radius; k++) {
        const i = (y * width + clamp(k, width)) * 4;
        s0 += src[i];
        s1 += src[i + 1];
        s2 += src[i + 2];
        s3 += src[i + 3];
      }
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        dst[o] = s0 / span;
        dst[o + 1] = s1 / span;
        dst[o + 2] = s2 / span;
        dst[o + 3] = s3 / span;
        const remove = (y * width + clamp(x - radius, width)) * 4;
        const add = (y * width + clamp(x + radius + 1, width)) * 4;
        s0 += src[add] - src[remove];
        s1 += src[add + 1] - src[remove + 1];
        s2 += src[add + 2] - src[remove + 2];
        s3 += src[add + 3] - src[remove + 3];
      }
    }
    return;
  }
  for (let x = 0; x < width; x++) {
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    for (let k = -radius; k <= radius; k++) {
      const i = (clamp(k, height) * width + x) * 4;
      s0 += src[i];
      s1 += src[i + 1];
      s2 += src[i + 2];
      s3 += src[i + 3];
    }
    for (let y = 0; y < height; y++) {
      const o = (y * width + x) * 4;
      dst[o] = s0 / span;
      dst[o + 1] = s1 / span;
      dst[o + 2] = s2 / span;
      dst[o + 3] = s3 / span;
      const remove = (clamp(y - radius, height) * width + x) * 4;
      const add = (clamp(y + radius + 1, height) * width + x) * 4;
      s0 += src[add] - src[remove];
      s1 += src[add + 1] - src[remove + 1];
      s2 += src[add + 2] - src[remove + 2];
      s3 += src[add + 3] - src[remove + 3];
    }
  }
}

function shortSide(w: number, h: number) {
  return Math.max(1, Math.min(w, h));
}

function brushPx(region: RedactRegion, frameW: number, frameH: number) {
  return Math.max(2, region.brushWidth * shortSide(frameW, frameH));
}

function pixelBlockPx(region: RedactRegion, frameW: number, frameH: number, rw: number, rh: number) {
  const short = shortSide(frameW, frameH);
  // strength 0 → ~4px blocks, strength 1 → ~min(48px, region/3)
  const minB = 4;
  const maxB = Math.max(minB + 2, Math.min(64, Math.round(Math.min(rw, rh, short) / 3)));
  return Math.round(minB + region.strength * (maxB - minB));
}

function blurRadiusPx(region: RedactRegion, frameW: number, frameH: number) {
  const short = shortSide(frameW, frameH);
  // strength 0 → mild, 1 → heavy enough to hide faces/text
  return Math.max(4, Math.round((8 + region.strength * 36) * (short / 400)));
}

function strokeBrushPath(
  ctx: CanvasRenderingContext2D,
  points: RedactPoint[],
  frameW: number,
  frameH: number,
  lineWidth: number
) {
  if (!points.length) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(points[0].x * frameW, points[0].y * frameH);
  if (points.length === 1) {
    ctx.lineTo(points[0].x * frameW + 0.01, points[0].y * frameH);
  } else {
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * frameW, points[i].y * frameH);
    }
  }
  ctx.stroke();
}

function buildMask(
  region: RedactRegion,
  frameW: number,
  frameH: number,
  x: number,
  y: number,
  rw: number,
  rh: number
): HTMLCanvasElement {
  const mask = document.createElement('canvas');
  mask.width = rw;
  mask.height = rh;
  const mctx = mask.getContext('2d');
  if (!mctx) return mask;
  mctx.clearRect(0, 0, rw, rh);
  mctx.fillStyle = '#fff';
  mctx.strokeStyle = '#fff';

  if (!region.points.length) {
    mctx.fillRect(0, 0, rw, rh);
    return mask;
  }

  mctx.save();
  mctx.translate(-x, -y);
  strokeBrushPath(mctx, region.points, frameW, frameH, brushPx(region, frameW, frameH));
  mctx.restore();
  return mask;
}

function applyRegion(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  region: RedactRegion,
  frameW: number,
  frameH: number
) {
  const x = Math.max(0, Math.floor(region.x * frameW));
  const y = Math.max(0, Math.floor(region.y * frameH));
  const rw = Math.max(1, Math.ceil(region.w * frameW));
  const rh = Math.max(1, Math.ceil(region.h * frameH));
  if (x >= frameW || y >= frameH) return;
  const cw = Math.min(rw, frameW - x);
  const ch = Math.min(rh, frameH - y);
  if (cw < 1 || ch < 1) return;

  const mask = buildMask(region, frameW, frameH, x, y, cw, ch);

  if (region.style === 'solid') {
    const patch = document.createElement('canvas');
    patch.width = cw;
    patch.height = ch;
    const pctx = patch.getContext('2d');
    if (!pctx) return;
    pctx.fillStyle = region.color || '#1c1c1e';
    pctx.fillRect(0, 0, cw, ch);
    pctx.globalCompositeOperation = 'destination-in';
    pctx.drawImage(mask, 0, 0);
    ctx.drawImage(patch, x, y);
    return;
  }

  // Sample underlying (pre-redact) pixels for this AABB.
  const raw = document.createElement('canvas');
  raw.width = cw;
  raw.height = ch;
  const rctx = raw.getContext('2d');
  if (!rctx) return;
  rctx.drawImage(source, x, y, cw, ch, 0, 0, cw, ch);

  const effect = document.createElement('canvas');
  effect.width = cw;
  effect.height = ch;
  const ectx = effect.getContext('2d');
  if (!ectx) return;

  if (region.style === 'blur') {
    const radius = blurRadiusPx(region, frameW, frameH);
    // Pad so blur doesn't sample empty edges, then crop back.
    const pad = Math.ceil(radius * 2);
    const big = document.createElement('canvas');
    big.width = cw + pad * 2;
    big.height = ch + pad * 2;
    const bctx = big.getContext('2d');
    if (!bctx) return;
    bctx.drawImage(source, x - pad, y - pad, cw + pad * 2, ch + pad * 2, 0, 0, big.width, big.height);
    const blurred = blurCanvas(big, radius);
    ectx.drawImage(blurred, pad, pad, cw, ch, 0, 0, cw, ch);
  } else {
    // pixelate — downsample then nearest-neighbor upscale
    const block = pixelBlockPx(region, frameW, frameH, cw, ch);
    const sw = Math.max(1, Math.ceil(cw / block));
    const sh = Math.max(1, Math.ceil(ch / block));
    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d');
    if (!sctx) return;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(raw, 0, 0, sw, sh);
    ectx.imageSmoothingEnabled = false;
    ectx.drawImage(small, 0, 0, cw, ch);
  }

  // Clip effect to the brush / rect mask so only the painted area is censored.
  ectx.globalCompositeOperation = 'destination-in';
  ectx.drawImage(mask, 0, 0);
  ctx.drawImage(effect, x, y);
}

/** Paint redact preview onto a frame-sized canvas using a source bitmap. */
export function paintRedactPreview(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  redact: RedactState,
  width: number,
  height: number,
  live?: RedactRegion | null
) {
  ctx.clearRect(0, 0, width, height);
  if (!hasRedact(redact) && !live) return;

  // Build a source canvas snapshot at preview resolution.
  const src = document.createElement('canvas');
  src.width = width;
  src.height = height;
  const sctx = src.getContext('2d');
  if (!sctx) return;
  try {
    sctx.drawImage(source, 0, 0, width, height);
  } catch {
    return;
  }

  const regions = live ? [...redact.regions, live] : redact.regions;
  for (const region of regions) {
    applyRegion(ctx, src, region, width, height);
  }
}
