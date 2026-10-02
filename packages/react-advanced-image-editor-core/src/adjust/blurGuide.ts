/**
 * =============================================================================
 * BLUR GUIDE
 * =============================================================================
 * A small, heavily blurred copy of the cropped frame that answers one question
 * per pixel: "how bright is the neighbourhood around me?".
 *
 * Brilliance and Definition are local operators, so they need that answer. The
 * usual way to get it is a multi-pass framebuffer blur, which would mean
 * ping-ponging FBOs on every slider tick. Instead the guide is built once per
 * crop/geometry change on a 2D canvas and uploaded as a second texture, so a
 * slider drag stays a uniform update plus one `drawArrays`.
 *
 * The guide is deliberately tiny: bilinear filtering on the GPU turns a 256px
 * blurred thumbnail into a smooth full-resolution field for free.
 * =============================================================================
 */

/** Long edge of the guide in pixels. Small on purpose — it is a low-pass. */
const GUIDE_MAX_EDGE = 256;

/** Blur radius as a fraction of the guide's long edge. */
const GUIDE_BLUR_FRACTION = 0.04;

/** Downscale factor of the `ctx.filter`-less fallback path. */
const FALLBACK_DIVISOR = 8;

let canvasFilterSupported: boolean | null = null;

/** Safari only gained `ctx.filter` in 16.4, so this stays feature-detected. */
function supportsCanvasFilter() {
  if (canvasFilterSupported === null) {
    if (typeof document === 'undefined') return false;
    const probe = document.createElement('canvas').getContext('2d');
    canvasFilterSupported = !!probe && typeof probe.filter === 'string';
  }
  return canvasFilterSupported;
}

/** `TexImageSource` also covers `ImageData`, which `drawImage` cannot take. */
function isDrawable(source: TexImageSource): source is Exclude<TexImageSource, ImageData> {
  return typeof ImageData === 'undefined' || !(source instanceof ImageData);
}

/**
 * Build the blurred neighbourhood guide for a cropped frame.
 * Returns `null` when the source cannot be drawn (e.g. raw `ImageData`) or no
 * 2D context is available; callers then treat the guide as inactive.
 */
export function buildBlurGuide(
  source: TexImageSource,
  width: number,
  height: number
): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !isDrawable(source)) return null;

  const scale = Math.min(1, GUIDE_MAX_EDGE / Math.max(1, Math.max(width, height)));
  const guideW = Math.max(1, Math.round(width * scale));
  const guideH = Math.max(1, Math.round(height * scale));

  const guide = document.createElement('canvas');
  guide.width = guideW;
  guide.height = guideH;
  const ctx = guide.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (supportsCanvasFilter()) {
    ctx.filter = `blur(${Math.max(1, Math.round(Math.max(guideW, guideH) * GUIDE_BLUR_FRACTION))}px)`;
    ctx.drawImage(source, 0, 0, guideW, guideH);
    ctx.filter = 'none';
    return guide;
  }

  // Fallback: an aggressive downscale followed by a bilinear upscale is a
  // serviceable low-pass and needs nothing beyond `drawImage`.
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(guideW / FALLBACK_DIVISOR));
  small.height = Math.max(1, Math.round(guideH / FALLBACK_DIVISOR));
  const smallCtx = small.getContext('2d');
  if (!smallCtx) return null;
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = 'high';
  smallCtx.drawImage(source, 0, 0, small.width, small.height);
  ctx.drawImage(small, 0, 0, guideW, guideH);
  return guide;
}

/**
 * Full-resolution sampler over a guide canvas, for the CPU export path.
 * Reads the guide once, then answers bilinearly interpolated **linear**
 * luminance for any pixel of the original frame — the same quantity the shader
 * gets for free from a bilinear texture fetch.
 *
 * `toLinear` is injected so the sRGB transfer function keeps living next to the
 * rest of the colour maths instead of being duplicated here.
 */
export function createGuideLumaSampler(
  guide: HTMLCanvasElement,
  width: number,
  height: number,
  toLinear: (channel: number) => number
): ((x: number, y: number) => number) | null {
  const ctx = guide.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const { width: gw, height: gh } = guide;
  const pixels = ctx.getImageData(0, 0, gw, gh).data;
  const luma = new Float32Array(gw * gh);
  for (let p = 0; p < luma.length; p++) {
    const i = p * 4;
    luma[p] =
      0.2126 * toLinear(pixels[i] / 255) +
      0.7152 * toLinear(pixels[i + 1] / 255) +
      0.0722 * toLinear(pixels[i + 2] / 255);
  }

  const scaleX = gw / Math.max(1, width);
  const scaleY = gh / Math.max(1, height);

  return (x: number, y: number) => {
    const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(gw - 1, x0 + 1);
    const y1 = Math.min(gh - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;

    const top = luma[y0 * gw + x0] * (1 - tx) + luma[y0 * gw + x1] * tx;
    const bottom = luma[y1 * gw + x0] * (1 - tx) + luma[y1 * gw + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  };
}
