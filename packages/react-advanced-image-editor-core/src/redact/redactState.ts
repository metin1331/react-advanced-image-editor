export const REDACT_STYLES = ['pixelate', 'blur', 'solid'] as const;
export type RedactStyle = (typeof REDACT_STYLES)[number];

export interface RedactPoint {
  x: number;
  y: number;
}

export interface RedactRegion {
  id: string;
  style: RedactStyle;
  /** Used when style === 'solid'. */
  color: string;
  /**
   * Brush width as a fraction of the frame short side (≈0.02–0.22).
   * Also used as padding when computing the region AABB.
   */
  brushWidth: number;
  /**
   * 0…1 mode strength:
   * - pixelate → block coarseness (0 = finer, 1 = stronger censorship)
   * - blur → blur radius strength
   * - solid → unused (kept for forward-compat)
   */
  strength: number;
  /** Freehand stroke in normalized crop-frame space. Empty ⇒ legacy axis-aligned rect. */
  points: RedactPoint[];
  /** Axis-aligned bounds (normalized) — hit testing + legacy rect regions. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RedactState {
  regions: RedactRegion[];
}

export const DEFAULT_REDACT_BRUSH_WIDTH = 0.07;
export const DEFAULT_REDACT_STRENGTH = 0.55;

export function createDefaultRedact(): RedactState {
  return { regions: [] };
}

export function cloneRedact(state: RedactState): RedactState {
  return {
    regions: state.regions.map((r) => ({
      ...r,
      points: r.points.map((p) => ({ ...p })),
    })),
  };
}

export function boundsFromBrush(
  points: RedactPoint[],
  brushWidth: number
): { x: number; y: number; w: number; h: number } {
  if (!points.length) return { x: 0, y: 0, w: 0.01, h: 0.01 };
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = Math.max(0.01, brushWidth * 0.55);
  const x = clamp01(minX - pad);
  const y = clamp01(minY - pad);
  const right = Math.min(1, maxX + pad);
  const bottom = Math.min(1, maxY + pad);
  return {
    x,
    y,
    w: Math.max(0.01, right - x),
    h: Math.max(0.01, bottom - y),
  };
}

export function normalizeRedact(raw?: Partial<RedactState> | null): RedactState {
  if (!raw?.regions?.length) return createDefaultRedact();
  return {
    regions: raw.regions
      .filter((r) => r && (r.w > 0.004 || (r.points && r.points.length > 0)))
      .map((r) => {
        const brushWidth = clamp(
          Number.isFinite(r.brushWidth) ? r.brushWidth : DEFAULT_REDACT_BRUSH_WIDTH,
          0.015,
          0.28
        );
        const strength = clamp(
          Number.isFinite(r.strength) ? r.strength : DEFAULT_REDACT_STRENGTH,
          0,
          1
        );
        const points = Array.isArray(r.points)
          ? r.points
              .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
              .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
          : [];
        const box =
          points.length > 0
            ? boundsFromBrush(points, brushWidth)
            : {
                x: clamp01(r.x),
                y: clamp01(r.y),
                w: Math.max(0.01, Math.min(1, r.w)),
                h: Math.max(0.01, Math.min(1, r.h)),
              };
        return {
          id: String(r.id ?? ''),
          style: REDACT_STYLES.includes(r.style as RedactStyle)
            ? (r.style as RedactStyle)
            : 'pixelate',
          color: r.color && /^#[0-9a-f]{3,8}$/i.test(r.color) ? r.color : '#1c1c1e',
          brushWidth,
          strength,
          points,
          ...box,
        };
      })
      .filter((r) => r.w > 0.004 && r.h > 0.004),
  };
}

export function hasRedact(state: RedactState | undefined | null): boolean {
  return Boolean(state?.regions?.length);
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v ?? 0));
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
