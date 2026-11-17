export const FILL_MODES = ['none', 'solid', 'image', 'edge-blur'] as const;
export type FillMode = (typeof FILL_MODES)[number];

export interface FillState {
  mode: FillMode;
  color: string;
  /** Data URL of the image placed behind transparent pixels. Used when `mode` is `image`. */
  image?: string;
  /** Edge-blur strength, 0…1. Default 0.55 when omitted. */
  blur?: number;
}

export function fillBlurAmount(fill: FillState | undefined | null) {
  const value = fill?.blur;
  if (value == null || !Number.isFinite(value)) return 0.55;
  return Math.min(1, Math.max(0, value));
}

/** Pixel radius used by the edge-blur fill. */
export function fillBlurRadius(fill: FillState | undefined | null) {
  return 4 + fillBlurAmount(fill) * 44;
}

function isFillColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return true;
  return /^oklch\(\s*\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?\s+(?:\d+(?:\.\d+)?|none)\s*\)$/i.test(
    value,
  );
}

export function createDefaultFill(): FillState {
  return { mode: 'none', color: '#ffffff' };
}

export function normalizeFill(raw?: Partial<FillState> | null): FillState {
  const base = createDefaultFill();
  if (!raw) return base;
  let mode = FILL_MODES.includes(raw.mode as FillMode) ? (raw.mode as FillMode) : base.mode;
  const color = isFillColor(raw.color) ? raw.color.replace(/\bnone\b/g, '0') : base.color;
  const image =
    typeof raw.image === 'string' &&
    raw.image.startsWith('data:image/') &&
    raw.image.length < 12_000_000
      ? raw.image
      : undefined;
  const blur =
    typeof raw.blur === 'number' && Number.isFinite(raw.blur)
      ? Math.min(1, Math.max(0, raw.blur))
      : undefined;
  return { mode, color, image, blur };
}

export function hasFill(fill: FillState | undefined | null): boolean {
  if (!fill || fill.mode === 'none') return false;
  if (fill.mode === 'image') return Boolean(fill.image);
  return true;
}
