/**
 * =============================================================================
 * FILTER LOOKS (iPhone Photos "Filters" strip)
 * =============================================================================
 * A look is a small set of photographic parameters, not a baked LUT. Two
 * reasons:
 *
 *   1) Intensity has to interpolate continuously. Every parameter is lerped
 *      against its identity value in `resolveFilterLook`, so the shader and the
 *      CPU mirror only ever see a finished look — no blending in GLSL, and no
 *      visible stepping while the slider moves.
 *   2) The look composes with the Calibrate grade instead of replacing it: it
 *      runs after the adjust pipeline in the same linear-light pass, so the
 *      user's own edits survive picking a filter.
 *
 * Values below are at intensity 1 and are expressed in the same units the
 * adjust pipeline uses (linear light, Bradford white-balance axes in [-1, 1]).
 * =============================================================================
 */

import { FILTER_IDS, type FilterId, type FilterState } from '../types';

export interface FilterLook {
  /** Chroma multiplier; 1 leaves saturation untouched. */
  saturation: number;
  /** Contrast multiplier about mid-gray; 1 is neutral. */
  contrast: number;
  /** Additive lift in linear light. */
  brightness: number;
  /** Bradford white-balance temperature axis, −cool ↔ +warm. */
  warmth: number;
  /** Bradford white-balance tint axis, −green ↔ +magenta. */
  tint: number;
  /** Gain on the bright end only, in EV. Negative recovers highlights. */
  highlights: number;
  /** Additive lift on the dark end only. Negative deepens shadows. */
  shadows: number;
  /** Black floor offset; positive crushes, negative lifts. */
  blackPoint: number;
  /** 0 keeps colour, 1 is fully monochrome. */
  mono: number;
  /** Linear RGB gain applied to the monochrome result (toning). */
  monoTint: readonly [number, number, number];
  /** Edge darkening, matching the Calibrate vignette curve. */
  vignette: number;
}

/** Every parameter at its no-op value — the target `intensity: 0` lerps to. */
export const IDENTITY_LOOK: FilterLook = {
  saturation: 1,
  contrast: 1,
  brightness: 0,
  warmth: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  blackPoint: 0,
  mono: 0,
  monoTint: [1, 1, 1],
  vignette: 0,
};

function look(partial: Partial<FilterLook>): FilterLook {
  return { ...IDENTITY_LOOK, ...partial };
}

/**
 * The Vivid family opens chroma and firms up the tone curve without tinting
 * skin; the Warm / Cool variants add a white-balance shift on top of the exact
 * same base, which is why they read as the *same* look at a different
 * temperature rather than three unrelated presets.
 */
const VIVID = look({
  saturation: 1.3,
  contrast: 1.14,
  highlights: -0.14,
  shadows: 0.03,
  blackPoint: 0.025,
});

/**
 * Dramatic trades chroma for tone: deeper blacks, recovered highlights, and a
 * noticeably steeper mid-curve.
 */
const DRAMATIC = look({
  saturation: 0.86,
  contrast: 1.38,
  brightness: -0.012,
  highlights: -0.24,
  shadows: -0.05,
  blackPoint: 0.06,
});

export const FILTER_LOOKS: Record<FilterId, FilterLook> = {
  original: IDENTITY_LOOK,

  vivid: VIVID,
  vividWarm: { ...VIVID, warmth: 0.32, tint: 0.04 },
  vividCool: { ...VIVID, warmth: -0.32, tint: -0.03 },

  dramatic: DRAMATIC,
  dramaticWarm: { ...DRAMATIC, warmth: 0.36, tint: 0.05 },
  dramaticCool: { ...DRAMATIC, warmth: -0.36, tint: -0.04 },

  // Neutral black & white: no toning, gentle contrast.
  mono: look({ mono: 1, contrast: 1.14, blackPoint: 0.03 }),

  // Silver-gelatin feel: lifted, slightly warm blacks and a brighter mid.
  silvertone: look({
    mono: 1,
    monoTint: [1.045, 1.0, 0.93],
    contrast: 1.24,
    shadows: 0.035,
    blackPoint: -0.02,
    highlights: -0.1,
  }),

  // Hard black & white: crushed blacks, cold whites, heavy contrast.
  noir: look({
    mono: 1,
    monoTint: [0.97, 0.99, 1.03],
    contrast: 1.62,
    blackPoint: 0.12,
    highlights: 0.06,
    vignette: 0.18,
  }),
};

/** Apple selects a filter at full strength; the slider only pulls it back. */
export const DEFAULT_FILTER_INTENSITY = 1;

export const FILTER_EPSILON = 1e-4;

export function createDefaultFilter(): FilterState {
  return { id: 'original', intensity: DEFAULT_FILTER_INTENSITY };
}

function isFilterId(value: unknown): value is FilterId {
  return typeof value === 'string' && (FILTER_IDS as readonly string[]).includes(value);
}

/** Clamp / repair a partial patch so unknown ids cannot poison state. */
export function normalizeFilter(partial?: Partial<FilterState> | null): FilterState {
  const id = isFilterId(partial?.id) ? partial.id : 'original';
  const raw = partial?.intensity;
  const intensity = Number.isFinite(raw)
    ? Math.min(1, Math.max(0, raw as number))
    : DEFAULT_FILTER_INTENSITY;
  return { id, intensity };
}

/** True when the look would actually change a pixel. */
export function hasFilter(filter?: Partial<FilterState> | null): boolean {
  if (!filter) return false;
  const { id, intensity } = normalizeFilter(filter);
  return id !== 'original' && intensity > FILTER_EPSILON;
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

/**
 * The look actually handed to the renderers: the preset interpolated against
 * identity by `intensity`. Both the shader and the CPU mirror consume this, so
 * they cannot drift apart in how intensity is applied.
 */
export function resolveFilterLook(filter?: Partial<FilterState> | null): FilterLook {
  const { id, intensity } = normalizeFilter(filter);
  const target = FILTER_LOOKS[id];
  if (id === 'original' || intensity <= FILTER_EPSILON) return IDENTITY_LOOK;
  if (intensity >= 1 - FILTER_EPSILON) return target;

  return {
    saturation: lerp(IDENTITY_LOOK.saturation, target.saturation, intensity),
    contrast: lerp(IDENTITY_LOOK.contrast, target.contrast, intensity),
    brightness: lerp(IDENTITY_LOOK.brightness, target.brightness, intensity),
    warmth: lerp(IDENTITY_LOOK.warmth, target.warmth, intensity),
    tint: lerp(IDENTITY_LOOK.tint, target.tint, intensity),
    highlights: lerp(IDENTITY_LOOK.highlights, target.highlights, intensity),
    shadows: lerp(IDENTITY_LOOK.shadows, target.shadows, intensity),
    blackPoint: lerp(IDENTITY_LOOK.blackPoint, target.blackPoint, intensity),
    mono: lerp(IDENTITY_LOOK.mono, target.mono, intensity),
    monoTint: [
      lerp(1, target.monoTint[0], intensity),
      lerp(1, target.monoTint[1], intensity),
      lerp(1, target.monoTint[2], intensity),
    ],
    vignette: lerp(IDENTITY_LOOK.vignette, target.vignette, intensity),
  };
}
