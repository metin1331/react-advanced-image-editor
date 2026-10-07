/**
 * =============================================================================
 * COLOR ADJUSTMENTS (built-in Calibrate / Adjust)
 * =============================================================================
 * Values live on `AdjustState` in [-1, 1] and are applied **after** the crop /
 * transform pipeline has produced the visible frame:
 *
 *   1. `renderToCanvas` builds the cropped composition (geometry only)
 *   2. WebGL adjust pipeline grades that texture (see `webglAdjust.ts`)
 *
 * Warmth / Tint are photographic white-balance (Bradford CAT), not CSS filters
 * and not RGB offsets — see `whiteBalance.ts`. The CPU path below mirrors the
 * shader so export still works if WebGL is unavailable.
 * =============================================================================
 */

import { ADJUST_CHANNELS, type AdjustState, type FilterState } from '../types';
import { hasFilter, resolveFilterLook } from '../filter/filterLooks';
import { buildBlurGuide, createGuideLumaSampler } from './blurGuide';
import { applyWbMatrix, whiteBalanceMatrix } from './whiteBalance';

export type { AdjustState };

export const ADJUST_EPSILON = 1e-4;

export function createDefaultAdjust(): AdjustState {
  const out = {} as AdjustState;
  for (const channel of ADJUST_CHANNELS) out[channel] = 0;
  return out;
}

export function hasAdjustments(a: AdjustState) {
  return ADJUST_CHANNELS.some((channel) => Math.abs(a[channel] ?? 0) > ADJUST_EPSILON);
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampUnit(v: number) {
  return Math.min(1, Math.max(-1, Number.isFinite(v) ? v : 0));
}

/**
 * How far the black floor may travel at slider ±1, in linear light. Kept well
 * under 1 so the `1 - t` rescale can never divide by zero.
 */
export const BLACK_POINT_RANGE = 0.25;

/**
 * Brightness is a gamma around the picture, not a linear add.
 * Positive opens shadows and midtones while white stays white.
 * Negative darkens the same way, so a small step like −10 stays slight.
 * The two exponents are stops of gamma at slider ±1.
 */
export const BRIGHTNESS = {
  positive: 1,
  negative: 0.7,
} as const;

/** Gamma applied to linear RGB for a brightness slider in [-1, 1]. */
export function brightnessGamma(t: number) {
  if (t >= 0) return Math.pow(2, -t * BRIGHTNESS.positive);
  return Math.pow(2, -t * BRIGHTNESS.negative);
}

/** Highlight gain at slider ±1 and full mask, in EV stops. */
export const HIGHLIGHTS_EV = 0.8;

/** Additive shadow lift at slider ±1 and full mask, in linear light. */
export const SHADOWS_LIFT = 0.2;

/**
 * Unsharp gain. Positive overshoots the local detail for a crisper edge;
 * negative is capped at 1 so full softening lands exactly on the local mean
 * instead of inverting the edge.
 */
export function sharpnessGain(v: number) {
  return v > 0 ? v * 1.5 : v;
}

/**
 * Brilliance constants, shared by the shader and the CPU mirror.
 *
 * Brilliance is a *local* operator: the weights come from the blurred guide's
 * luminance, not the pixel's own, so a face in shade opens up while the sky
 * behind it does not blow out. Above the highlight edge it pulls back instead.
 */
export const BRILLIANCE = {
  /** Guide luminance where the shadow weight has fully faded out. */
  shadowEdge: 0.25,
  /** Guide luminance where the highlight weight starts. */
  highlightEdge: 0.35,
  /** Additive lift in shaded regions at slider ±1. */
  shadowLift: 0.18,
  /** Multiplicative pull-back in bright regions at slider ±1. */
  highlightPull: 0.2,
  /** Opening shadows washes colour out; give part of it back. */
  chromaRestore: 0.25,
} as const;

/**
 * Definition constants, shared by the shader and the CPU mirror.
 *
 * Where Sharpness works on a one-pixel radius, Definition works against the
 * blurred guide, so it lifts the broad midtone structure that reads as
 * "clarity" rather than edge crispness.
 */
export const DEFINITION = {
  /** Strength of the local-contrast term at slider ±1. */
  gain: 0.8,
  /** Luminance above which the effect fades out, to keep highlights halo-free. */
  protectEdge: 0.8,
} as const;

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Weight of the bright end of the tone range, 0 below mid-gray. */
function highlightMask(y: number) {
  return smoothstep(0.35, 1, y);
}

/** Weight of the dark end of the tone range, 0 above mid-gray. */
function shadowMask(y: number) {
  return 1 - smoothstep(0, 0.5, y);
}

/** Rough orange-hue weight (red > green > blue) used to hold back skin tones. */
function skinWeight(r: number, g: number, b: number) {
  return clamp01(smoothstep(0, 0.15, r - g) * smoothstep(0, 0.12, g - b));
}

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number) {
  const x = clamp01(c);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** Normalize / clamp every channel so partial patches cannot poison state. */
export function normalizeAdjust(partial: Partial<AdjustState> | AdjustState): AdjustState {
  const out = {} as AdjustState;
  for (const channel of ADJUST_CHANNELS) out[channel] = clampUnit(partial[channel] ?? 0);
  return out;
}

/**
 * @deprecated Preview uses the WebGL pipeline. Kept only as a no-op stub so
 * older call sites that imported `adjustCssFilter` do not break — Warmth/Tint
 * cannot be expressed as CSS filters.
 */
export function adjustCssFilter(_a: AdjustState): string {
  return 'none';
}

/** @deprecated Vignette is drawn in the WebGL shader. */
export function vignetteOverlayStyle(_vignette: number): null {
  return null;
}

/**
 * sRGB luminance plane plus its 1-2-1 separable blur — the CPU twin of the
 * shader's 3x3 sharpen taps. Built once per export, not per pixel.
 */
function buildSharpenPlanes(data: Uint8ClampedArray, width: number, height: number) {
  const count = width * height;
  const source = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    source[p] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  }

  const horizontal = new Float32Array(count);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const left = source[row + Math.max(0, x - 1)];
      const right = source[row + Math.min(width - 1, x + 1)];
      horizontal[row + x] = (left + 2 * source[row + x] + right) / 4;
    }
  }

  const blurred = new Float32Array(count);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const up = Math.max(0, y - 1) * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      blurred[row + x] = (horizontal[up + x] + 2 * horizontal[row + x] + horizontal[down + x]) / 4;
    }
  }

  return { source, blurred };
}

/** Same blurred neighbourhood guide the shader binds to `u_guide`. */
function createSourceGuideSampler(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): ((x: number, y: number) => number) | null {
  const guide = buildBlurGuide(canvas, width, height);
  return guide ? createGuideLumaSampler(guide, width, height, srgbToLinear) : null;
}

/**
 * CPU fallback mirroring the WebGL fragment shader (linear light, Bradford WB,
 * luma restore). Used when WebGL is unavailable at export time.
 *
 * The optional filter look runs last, exactly as it does in the shader.
 */
export function applyAdjustments(
  canvas: HTMLCanvasElement,
  adjust: AdjustState,
  filter?: Partial<FilterState> | null
): HTMLCanvasElement {
  const filterActive = hasFilter(filter);
  if (!hasAdjustments(adjust) && !filterActive) return canvas;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const { width, height } = canvas;
  if (width < 1 || height < 1) return canvas;

  const a = normalizeAdjust(adjust);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const exposure = Math.pow(2, a.exposure * 2);
  const brightGamma = brightnessGamma(a.brightness);
  const brightActive = Math.abs(a.brightness) > ADJUST_EPSILON;
  const contrast = 1 + a.contrast;
  const highlights = a.highlights * HIGHLIGHTS_EV;
  const highlightsActive = Math.abs(highlights) > ADJUST_EPSILON;
  const shadows = a.shadows * SHADOWS_LIFT;
  const shadowsActive = Math.abs(shadows) > ADJUST_EPSILON;
  const blackPoint = a.blackPoint * BLACK_POINT_RANGE;
  const blackPointActive = Math.abs(blackPoint) > ADJUST_EPSILON;
  const sat = 1 + a.saturation;
  const vibrance = a.vibrance;
  const vibranceActive = Math.abs(vibrance) > ADJUST_EPSILON;
  const sharpness = sharpnessGain(a.sharpness);
  const sharpen =
    Math.abs(sharpness) > ADJUST_EPSILON ? buildSharpenPlanes(data, width, height) : null;
  const brilliance = a.brilliance;
  const brillianceActive = Math.abs(brilliance) > ADJUST_EPSILON;
  const definition = a.definition;
  const definitionActive = Math.abs(definition) > ADJUST_EPSILON;
  const sampleGuide =
    brillianceActive || definitionActive
      ? createSourceGuideSampler(canvas, width, height)
      : null;
  const vig = a.vignette;
  const wb = whiteBalanceMatrix(a.warmth, a.tint);
  const wbActive = Math.abs(a.warmth) > ADJUST_EPSILON || Math.abs(a.tint) > ADJUST_EPSILON;

  // Filter look — already interpolated by intensity, same as the shader.
  const look = resolveFilterLook(filter);
  const fHighlights = look.highlights * HIGHLIGHTS_EV;
  const fShadows = look.shadows * SHADOWS_LIFT;
  const fBlackPoint = look.blackPoint * BLACK_POINT_RANGE;
  const fWb = whiteBalanceMatrix(look.warmth, look.tint);
  const fWbActive =
    Math.abs(look.warmth) > ADJUST_EPSILON || Math.abs(look.tint) > ADJUST_EPSILON;

  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxR = Math.hypot(cx, cy) || 1;

  for (let i = 0; i < data.length; i += 4) {
    const pixel = i / 4;
    const px = pixel % width;
    const py = (pixel / width) | 0;

    let r = srgbToLinear(data[i] / 255);
    let g = srgbToLinear(data[i + 1] / 255);
    let b = srgbToLinear(data[i + 2] / 255);

    if (wbActive) {
      [r, g, b] = applyWbMatrix(wb, r, g, b, true);
    }

    r *= exposure;
    g *= exposure;
    b *= exposure;

    if (sampleGuide && brillianceActive) {
      const yg = sampleGuide(px, py);
      const shadowW = 1 - smoothstep(0, BRILLIANCE.shadowEdge, yg);
      const highW = smoothstep(BRILLIANCE.highlightEdge, 1, yg);
      const lift = brilliance * shadowW * BRILLIANCE.shadowLift;
      const pull = 1 - brilliance * highW * BRILLIANCE.highlightPull;
      r = Math.max(0, r + lift) * pull;
      g = Math.max(0, g + lift) * pull;
      b = Math.max(0, b + lift) * pull;

      const restore = 1 + Math.max(0, brilliance) * shadowW * BRILLIANCE.chromaRestore;
      const yb = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = yb + (r - yb) * restore;
      g = yb + (g - yb) * restore;
      b = yb + (b - yb) * restore;
    }

    if (highlightsActive) {
      const gain = Math.pow(2, highlights * highlightMask(0.2126 * r + 0.7152 * g + 0.0722 * b));
      r *= gain;
      g *= gain;
      b *= gain;
    }

    if (shadowsActive) {
      const lift = shadows * shadowMask(0.2126 * r + 0.7152 * g + 0.0722 * b);
      r = Math.max(0, r + lift);
      g = Math.max(0, g + lift);
      b = Math.max(0, b + lift);
    }

    if (brightActive) {
      r = Math.pow(Math.max(0, r), brightGamma);
      g = Math.pow(Math.max(0, g), brightGamma);
      b = Math.pow(Math.max(0, b), brightGamma);
    }

    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    if (blackPointActive) {
      if (blackPoint > 0) {
        const inv = 1 / (1 - blackPoint);
        r = (r - blackPoint) * inv;
        g = (g - blackPoint) * inv;
        b = (b - blackPoint) * inv;
      } else {
        const k = 1 + blackPoint;
        r = r * k - blackPoint;
        g = g * k - blackPoint;
        b = b * k - blackPoint;
      }
    }

    if (sampleGuide && definitionActive) {
      const yd = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const ygd = sampleGuide(px, py);
      const protect = 1 - smoothstep(DEFINITION.protectEdge, 1, yd);
      const target = yd + (yd - ygd) * definition * DEFINITION.gain * protect;
      const scale = Math.min(4, Math.max(0.25, Math.max(0, target) / Math.max(yd, 1e-4)));
      r *= scale;
      g *= scale;
      b *= scale;
    }

    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = gray + (r - gray) * sat;
    g = gray + (g - gray) * sat;
    b = gray + (b - gray) * sat;

    if (vibranceActive) {
      const chroma = clamp01(Math.max(r, g, b) - Math.min(r, g, b));
      const amount = vibrance * (1 - chroma) * (1 - 0.5 * skinWeight(r, g, b));
      const yv = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = yv + (r - yv) * (1 + amount);
      g = yv + (g - yv) * (1 + amount);
      b = yv + (b - yv) * (1 + amount);
    }

    if (sharpen) {
      const c = sharpen.source[pixel];
      const detail = Math.min(0.25, Math.max(-0.25, c - sharpen.blurred[pixel]));
      const target = clamp01(c + detail * sharpness);
      const scale = Math.min(
        4,
        Math.max(0.25, srgbToLinear(target) / Math.max(srgbToLinear(c), 1e-5))
      );
      r *= scale;
      g *= scale;
      b *= scale;
    }

    if (Math.abs(vig) > ADJUST_EPSILON) {
      const t = Math.min(1, Math.hypot(px - cx, py - cy) / maxR);
      const falloff = t * t * (3 - 2 * t);
      const amount = vig * falloff * 0.85;
      if (amount > 0) {
        r *= 1 - amount;
        g *= 1 - amount;
        b *= 1 - amount;
      } else {
        const lift = -amount;
        r = r + (1 - r) * lift;
        g = g + (1 - g) * lift;
        b = b + (1 - b) * lift;
      }
    }

    if (filterActive) {
      if (fWbActive) {
        [r, g, b] = applyWbMatrix(fWb, r, g, b, true);
      }

      if (Math.abs(fHighlights) > ADJUST_EPSILON) {
        const gain = Math.pow(
          2,
          fHighlights * highlightMask(0.2126 * r + 0.7152 * g + 0.0722 * b)
        );
        r *= gain;
        g *= gain;
        b *= gain;
      }

      if (Math.abs(fShadows) > ADJUST_EPSILON) {
        const lift = fShadows * shadowMask(0.2126 * r + 0.7152 * g + 0.0722 * b);
        r = Math.max(0, r + lift);
        g = Math.max(0, g + lift);
        b = Math.max(0, b + lift);
      }

      r += look.brightness;
      g += look.brightness;
      b += look.brightness;

      r = (r - 0.5) * look.contrast + 0.5;
      g = (g - 0.5) * look.contrast + 0.5;
      b = (b - 0.5) * look.contrast + 0.5;

      if (Math.abs(fBlackPoint) > ADJUST_EPSILON) {
        if (fBlackPoint > 0) {
          const inv = 1 / (1 - fBlackPoint);
          r = (r - fBlackPoint) * inv;
          g = (g - fBlackPoint) * inv;
          b = (b - fBlackPoint) * inv;
        } else {
          const k = 1 + fBlackPoint;
          r = r * k - fBlackPoint;
          g = g * k - fBlackPoint;
          b = b * k - fBlackPoint;
        }
      }

      const fy = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = fy + (r - fy) * look.saturation;
      g = fy + (g - fy) * look.saturation;
      b = fy + (b - fy) * look.saturation;

      if (look.mono > ADJUST_EPSILON) {
        const m = Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b);
        r += (m * look.monoTint[0] - r) * look.mono;
        g += (m * look.monoTint[1] - g) * look.mono;
        b += (m * look.monoTint[2] - b) * look.mono;
      }

      if (Math.abs(look.vignette) > ADJUST_EPSILON) {
        const t = Math.min(1, Math.hypot(px - cx, py - cy) / maxR);
        const amount = look.vignette * (t * t * (3 - 2 * t)) * 0.85;
        if (amount > 0) {
          r *= 1 - amount;
          g *= 1 - amount;
          b *= 1 - amount;
        } else {
          const lift = -amount;
          r = r + (1 - r) * lift;
          g = g + (1 - g) * lift;
          b = b + (1 - b) * lift;
        }
      }
    }

    data[i] = Math.round(clamp01(linearToSrgb(r)) * 255);
    data[i + 1] = Math.round(clamp01(linearToSrgb(g)) * 255);
    data[i + 2] = Math.round(clamp01(linearToSrgb(b)) * 255);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
