export const FRAME_PRESET_IDS = [
  'none',
  'thin',
  'solid',
  'thick',
  'double',
  'inner',
  'outer',
  'rounded',
  'soft-round',
  'polaroid',
  'film',
  'shadow',
  'offset',
  'editorial',
  'classic',
  'bleed',
  'asymmetric',
  'gallery',
  'white-mat',
  'black-mat',
  'soft-shadow',
  'hard-shadow',
  'offset-shadow',
  'floating',
  'raised',
  'inset',
  'beveled',
  'photo-card',
  'vintage',
  'modern-card',
  'minimal-mat',
  'double-shadow',
  'outline-offset',
  'layered',
  'inner-shadow',
  'outer-glow',
  'perspective',
  'compound',
  'metal',
  'center-shadow',
] as const;

export type FramePresetId = (typeof FRAME_PRESET_IDS)[number];

/** Office-inspired picture styles appended after the original frame library. */
export const PICTURE_STYLE_PRESET_IDS: ReadonlySet<FramePresetId> = new Set<FramePresetId>([
  'white-mat',
  'black-mat',
  'soft-shadow',
  'hard-shadow',
  'offset-shadow',
  'floating',
  'raised',
  'inset',
  'beveled',
  'photo-card',
  'vintage',
  'modern-card',
  'minimal-mat',
  'double-shadow',
  'outline-offset',
  'layered',
  'inner-shadow',
  'outer-glow',
  'perspective',
  'compound',
  'metal',
  'center-shadow',
]);

export type FrameControlId =
  | 'thickness'
  | 'color'
  | 'accent'
  | 'radius'
  | 'spacing'
  | 'shadow';

const LEGACY_PRESET: Record<string, FramePresetId> = {
  'thin-white': 'thin',
  'thick-white': 'thick',
  'thin-black': 'thin',
};

export interface FrameState {
  preset: FramePresetId;
  /** Outer / main stroke thickness (export px, unscaled). */
  borderWidth: number;
  color: string;
  /** Inner keyline, backing plate, gold bevel, etc. */
  accentColor: string;
  cornerRadius: number;
  /** Uniform pad fallback when a side is 0. */
  padding: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  shadow: boolean;
  /** 0–1 drop-shadow strength. */
  shadowIntensity: number;
  innerBorderWidth: number;
  innerGap: number;
  offsetX: number;
  offsetY: number;
  /** 0–1 inset shade on the photo (picture styles). */
  innerShadowIntensity: number;
  /** Bevel / 3D edge width in export px. */
  bevelWidth: number;
}

export function createDefaultFrame(): FrameState {
  return {
    preset: 'none',
    borderWidth: 0,
    color: '#ffffff',
    accentColor: '#1c1c1e',
    cornerRadius: 0,
    padding: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    shadow: false,
    shadowIntensity: 0,
    innerBorderWidth: 0,
    innerGap: 0,
    offsetX: 0,
    offsetY: 0,
    innerShadowIntensity: 0,
    bevelWidth: 0,
  };
}

function coercePreset(raw: unknown): FramePresetId {
  if (typeof raw === 'string' && LEGACY_PRESET[raw]) return LEGACY_PRESET[raw];
  if (typeof raw === 'string' && FRAME_PRESET_IDS.includes(raw as FramePresetId)) {
    return raw as FramePresetId;
  }
  return 'none';
}

export function normalizeFrame(raw?: Partial<FrameState> | null): FrameState {
  const base = createDefaultFrame();
  if (!raw) return base;
  const rawPreset = raw.preset as string | undefined;
  const preset = coercePreset(rawPreset);
  const legacyBlack = rawPreset === 'thin-black';
  return resolveFrameFromPreset(preset, {
    borderWidth: raw.borderWidth,
    color: legacyBlack ? '#1c1c1e' : raw.color,
    accentColor: raw.accentColor,
    cornerRadius: raw.cornerRadius,
    padding: raw.padding,
    paddingTop: raw.paddingTop,
    paddingRight: raw.paddingRight,
    paddingBottom: raw.paddingBottom,
    paddingLeft: raw.paddingLeft,
    shadow: raw.shadow,
    shadowIntensity: raw.shadowIntensity,
    innerBorderWidth: raw.innerBorderWidth,
    innerGap: raw.innerGap,
    offsetX: raw.offsetX,
    offsetY: raw.offsetY,
    innerShadowIntensity: raw.innerShadowIntensity,
    bevelWidth: raw.bevelWidth,
  });
}

function uniformPads(n: number): Pick<
  FrameState,
  'padding' | 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'
> {
  return {
    padding: n,
    paddingTop: n,
    paddingRight: n,
    paddingBottom: n,
    paddingLeft: n,
  };
}

/** Resolve numeric frame params from a preset (short-edge relative base). */
export function resolveFrameFromPreset(
  preset: FramePresetId,
  overrides?: Partial<Omit<FrameState, 'preset'>>
): FrameState {
  const base = createDefaultFrame();
  let next: FrameState = { ...base, preset };

  switch (preset) {
    case 'none':
      break;
    case 'thin':
      next = { ...next, borderWidth: 6, color: '#ffffff', ...uniformPads(0) };
      break;
    case 'solid':
      next = { ...next, borderWidth: 14, color: '#ffffff', ...uniformPads(0) };
      break;
    case 'thick':
      next = { ...next, borderWidth: 32, color: '#f7f7f7', ...uniformPads(0) };
      break;
    case 'double':
      next = {
        ...next,
        borderWidth: 5,
        color: '#1c1c1e',
        accentColor: '#ffffff',
        innerBorderWidth: 2,
        innerGap: 6,
        ...uniformPads(10),
      };
      break;
    case 'inner':
      next = {
        ...next,
        borderWidth: 5,
        color: '#ffffff',
        innerGap: 10,
        ...uniformPads(0),
      };
      break;
    case 'outer':
      next = {
        ...next,
        borderWidth: 3,
        color: '#1c1c1e',
        accentColor: '#ffffff',
        ...uniformPads(12),
      };
      break;
    case 'rounded':
      next = {
        ...next,
        borderWidth: 14,
        color: '#ffffff',
        cornerRadius: 22,
        shadow: true,
        shadowIntensity: 0.28,
        ...uniformPads(0),
      };
      break;
    case 'soft-round':
      next = {
        ...next,
        borderWidth: 8,
        color: '#ffffff',
        cornerRadius: 36,
        shadow: true,
        shadowIntensity: 0.38,
        ...uniformPads(6),
      };
      break;
    case 'polaroid':
      next = {
        ...next,
        borderWidth: 0,
        color: '#f6f3ee',
        cornerRadius: 3,
        shadow: true,
        shadowIntensity: 0.42,
        padding: 14,
        paddingTop: 14,
        paddingRight: 14,
        paddingLeft: 14,
        paddingBottom: 54,
      };
      break;
    case 'film':
      next = {
        ...next,
        borderWidth: 0,
        color: '#141414',
        accentColor: '#d8d8d8',
        padding: 16,
        paddingTop: 16,
        paddingBottom: 16,
        paddingLeft: 30,
        paddingRight: 30,
      };
      break;
    case 'shadow':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        cornerRadius: 2,
        shadow: true,
        shadowIntensity: 0.72,
        ...uniformPads(28),
      };
      break;
    case 'offset':
      next = {
        ...next,
        borderWidth: 0,
        color: '#1c1c1e',
        accentColor: '#ffffff',
        offsetX: 12,
        offsetY: 12,
        ...uniformPads(8),
      };
      break;
    case 'editorial':
      next = {
        ...next,
        borderWidth: 0,
        color: '#fafafa',
        accentColor: '#111111',
        innerBorderWidth: 1,
        innerGap: 10,
        ...uniformPads(32),
      };
      break;
    case 'classic':
      next = {
        ...next,
        borderWidth: 22,
        color: '#3a2c20',
        accentColor: '#c4a265',
        innerBorderWidth: 2,
        innerGap: 6,
        ...uniformPads(14),
      };
      break;
    case 'bleed':
      next = { ...next, borderWidth: 3, color: '#111111', ...uniformPads(0) };
      break;
    case 'asymmetric':
      next = {
        ...next,
        borderWidth: 0,
        color: '#f3efe6',
        accentColor: '#1c1c1e',
        innerBorderWidth: 1,
        innerGap: 8,
        padding: 12,
        paddingTop: 12,
        paddingRight: 12,
        paddingLeft: 32,
        paddingBottom: 44,
      };
      break;
    case 'gallery':
      next = {
        ...next,
        borderWidth: 0,
        color: '#f4f0e8',
        accentColor: '#2a2a2a',
        innerBorderWidth: 1,
        innerGap: 5,
        ...uniformPads(26),
      };
      break;
    case 'white-mat':
      next = {
        ...next,
        borderWidth: 1,
        color: '#ffffff',
        accentColor: '#3a3a3c',
        ...uniformPads(36),
      };
      break;
    case 'black-mat':
      next = {
        ...next,
        borderWidth: 0,
        color: '#1c1c1e',
        accentColor: '#ffffff',
        innerBorderWidth: 3,
        innerGap: 0,
        ...uniformPads(32),
      };
      break;
    case 'soft-shadow':
      next = {
        ...next,
        borderWidth: 0,
        color: '#f2f2f7',
        cornerRadius: 3,
        shadow: true,
        shadowIntensity: 0.48,
        ...uniformPads(40),
      };
      break;
    case 'hard-shadow':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        accentColor: '#000000',
        offsetX: 14,
        offsetY: 14,
        ...uniformPads(18),
      };
      break;
    case 'offset-shadow':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        accentColor: '#c7c7cc',
        offsetX: 18,
        offsetY: 18,
        ...uniformPads(16),
      };
      break;
    case 'floating':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        cornerRadius: 10,
        shadow: true,
        shadowIntensity: 0.34,
        ...uniformPads(48),
      };
      break;
    case 'raised':
      next = {
        ...next,
        borderWidth: 1,
        color: '#ffffff',
        accentColor: '#e5e5ea',
        cornerRadius: 4,
        shadow: true,
        shadowIntensity: 0.55,
        ...uniformPads(26),
      };
      break;
    case 'inset':
      next = {
        ...next,
        borderWidth: 0,
        color: '#e5e5ea',
        accentColor: '#8e8e93',
        innerShadowIntensity: 0.7,
        ...uniformPads(28),
      };
      break;
    case 'beveled':
      next = {
        ...next,
        borderWidth: 0,
        color: '#d1d1d6',
        accentColor: '#636366',
        bevelWidth: 18,
        ...uniformPads(0),
      };
      break;
    case 'photo-card':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        cornerRadius: 18,
        shadow: true,
        shadowIntensity: 0.32,
        ...uniformPads(18),
      };
      break;
    case 'vintage':
      next = {
        ...next,
        borderWidth: 1,
        color: '#efe4cf',
        accentColor: '#8a6a45',
        innerBorderWidth: 1,
        innerGap: 8,
        innerShadowIntensity: 0.28,
        ...uniformPads(22),
      };
      break;
    case 'modern-card':
      next = {
        ...next,
        borderWidth: 1,
        color: '#ffffff',
        accentColor: '#e5e5ea',
        cornerRadius: 12,
        shadow: true,
        shadowIntensity: 0.2,
        ...uniformPads(12),
      };
      break;
    case 'minimal-mat':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        accentColor: '#111111',
        innerBorderWidth: 1,
        innerGap: 0,
        ...uniformPads(42),
      };
      break;
    case 'double-shadow':
      next = {
        ...next,
        borderWidth: 2,
        color: '#ffffff',
        accentColor: '#1c1c1e',
        innerBorderWidth: 1,
        innerGap: 5,
        shadow: true,
        shadowIntensity: 0.4,
        ...uniformPads(22),
      };
      break;
    case 'outline-offset':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        accentColor: '#1c1c1e',
        offsetX: 12,
        offsetY: 12,
        innerBorderWidth: 2,
        ...uniformPads(16),
      };
      break;
    case 'layered':
      next = {
        ...next,
        borderWidth: 0,
        color: '#e8e4dc',
        accentColor: '#ffffff',
        ...uniformPads(28),
        paddingTop: 28,
        paddingRight: 28,
        paddingBottom: 28,
        paddingLeft: 28,
        innerGap: 12,
      };
      break;
    case 'inner-shadow':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        innerShadowIntensity: 0.85,
        ...uniformPads(0),
      };
      break;
    case 'outer-glow':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        cornerRadius: 2,
        shadow: true,
        shadowIntensity: 0.62,
        ...uniformPads(36),
      };
      break;
    case 'perspective':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        accentColor: '#aeaeb2',
        offsetX: 22,
        offsetY: 36,
        ...uniformPads(20),
      };
      break;
    case 'compound':
      next = {
        ...next,
        borderWidth: 8,
        color: '#1c1c1e',
        accentColor: '#ffffff',
        innerBorderWidth: 2,
        innerGap: 6,
        ...uniformPads(6),
      };
      break;
    case 'metal':
      next = {
        ...next,
        borderWidth: 0,
        color: '#c5c9d0',
        accentColor: '#3a3a3c',
        bevelWidth: 16,
        innerBorderWidth: 2,
        innerGap: 4,
        ...uniformPads(0),
      };
      break;
    case 'center-shadow':
      next = {
        ...next,
        borderWidth: 0,
        color: '#ffffff',
        cornerRadius: 2,
        shadow: true,
        shadowIntensity: 0.58,
        ...uniformPads(32),
      };
      break;
  }

  if (overrides) {
    if (overrides.borderWidth != null) next.borderWidth = overrides.borderWidth;
    if (overrides.color) next.color = overrides.color;
    if (overrides.accentColor) next.accentColor = overrides.accentColor;
    if (overrides.cornerRadius != null) next.cornerRadius = overrides.cornerRadius;
    if (overrides.padding != null) next.padding = overrides.padding;
    if (overrides.paddingTop != null) next.paddingTop = overrides.paddingTop;
    if (overrides.paddingRight != null) next.paddingRight = overrides.paddingRight;
    if (overrides.paddingBottom != null) next.paddingBottom = overrides.paddingBottom;
    if (overrides.paddingLeft != null) next.paddingLeft = overrides.paddingLeft;
    if (overrides.shadow != null) next.shadow = overrides.shadow;
    if (overrides.shadowIntensity != null) next.shadowIntensity = overrides.shadowIntensity;
    if (overrides.innerBorderWidth != null) next.innerBorderWidth = overrides.innerBorderWidth;
    if (overrides.innerGap != null) next.innerGap = overrides.innerGap;
    if (overrides.offsetX != null) next.offsetX = overrides.offsetX;
    if (overrides.offsetY != null) next.offsetY = overrides.offsetY;
    if (overrides.innerShadowIntensity != null) {
      next.innerShadowIntensity = overrides.innerShadowIntensity;
    }
    if (overrides.bevelWidth != null) next.bevelWidth = overrides.bevelWidth;
  }

  return next;
}

export function hasFrame(frame: FrameState | undefined | null): boolean {
  return Boolean(frame && frame.preset !== 'none');
}

export function getFrameControls(preset: FramePresetId): ReadonlyArray<FrameControlId> {
  switch (preset) {
    case 'none':
      return [];
    case 'thin':
    case 'solid':
    case 'thick':
    case 'bleed':
      return ['thickness', 'color'];
    case 'double':
    case 'gallery':
    case 'editorial':
      return ['color', 'accent', 'spacing'];
    case 'inner':
      return ['thickness', 'color'];
    case 'outer':
      return ['thickness', 'color', 'spacing'];
    case 'rounded':
    case 'soft-round':
      return ['thickness', 'color', 'radius', 'shadow'];
    case 'polaroid':
      return ['color', 'spacing', 'shadow'];
    case 'film':
      return ['color', 'spacing'];
    case 'shadow':
      return ['color', 'shadow'];
    case 'offset':
      return ['color', 'accent', 'spacing'];
    case 'classic':
      return ['color', 'accent', 'thickness'];
    case 'asymmetric':
      return ['color', 'spacing'];
    case 'white-mat':
    case 'black-mat':
    case 'minimal-mat':
    case 'vintage':
    case 'layered':
    case 'compound':
      return ['color', 'accent', 'spacing'];
    case 'soft-shadow':
    case 'floating':
    case 'raised':
    case 'outer-glow':
    case 'center-shadow':
      return ['color', 'shadow'];
    case 'hard-shadow':
    case 'offset-shadow':
    case 'outline-offset':
    case 'perspective':
      return ['color', 'accent'];
    case 'photo-card':
    case 'modern-card':
      return ['color', 'radius', 'shadow'];
    case 'beveled':
    case 'metal':
      return ['color', 'accent'];
    case 'inset':
    case 'inner-shadow':
      return ['shadow'];
    case 'double-shadow':
      return ['color', 'accent', 'shadow'];
    default:
      return [];
  }
}

const SCALE_KEYS = [
  'borderWidth',
  'cornerRadius',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'innerBorderWidth',
  'innerGap',
  'offsetX',
  'offsetY',
  'bevelWidth',
] as const;

/** Scale frame px values for a given output short edge (reference 1080). */
export function scaleFrameMetrics(frame: FrameState, shortEdge: number): FrameState {
  const scale = Math.max(0.25, shortEdge / 1080);
  const next = { ...frame };
  for (const key of SCALE_KEYS) {
    next[key] = Math.round(frame[key] * scale);
  }
  return next;
}

export interface FrameLayout {
  outW: number;
  outH: number;
  photoX: number;
  photoY: number;
  photoW: number;
  photoH: number;
  metrics: FrameState;
}

function sidePads(f: FrameState) {
  return {
    t: f.paddingTop || f.padding,
    r: f.paddingRight || f.padding,
    b: f.paddingBottom || f.padding,
    l: f.paddingLeft || f.padding,
  };
}

/**
 * Canvas size and photo origin for a framed export / live preview wrap.
 * `sourceW/H` is the unframed crop (display or export pixels).
 */
export function computeFrameLayout(
  sourceW: number,
  sourceH: number,
  frame: FrameState
): FrameLayout {
  const metrics = scaleFrameMetrics(frame, Math.min(sourceW, sourceH));
  const photoW = sourceW;
  const photoH = sourceH;
  if (!hasFrame(metrics) || metrics.preset === 'inner') {
    return { outW: sourceW, outH: sourceH, photoX: 0, photoY: 0, photoW, photoH, metrics };
  }
  if (metrics.preset === 'inner-shadow') {
    return { outW: sourceW, outH: sourceH, photoX: 0, photoY: 0, photoW, photoH, metrics };
  }

  const p = sidePads(metrics);
  const b = metrics.borderWidth;
  const shadowPad = metrics.shadow
    ? Math.round(12 + metrics.shadowIntensity * 28)
    : 0;
  const ox = Math.max(0, metrics.offsetX);
  const oy = Math.max(0, metrics.offsetY);

  const photoX = shadowPad + b + p.l;
  const photoY = shadowPad + b + p.t;
  const outW = photoW + photoX + (b + p.r + shadowPad) + ox;
  const outH = photoH + photoY + (b + p.b + shadowPad) + oy;

  return {
    outW: Math.max(1, Math.round(outW)),
    outH: Math.max(1, Math.round(outH)),
    photoX: Math.round(photoX),
    photoY: Math.round(photoY),
    photoW,
    photoH,
    metrics,
  };
}
