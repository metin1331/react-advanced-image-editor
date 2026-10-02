export const FILL_MODES = ['none', 'solid', 'edge-blur'] as const;
export type FillMode = (typeof FILL_MODES)[number];

export interface FillState {
  mode: FillMode;
  color: string;
}

export function createDefaultFill(): FillState {
  return { mode: 'none', color: '#ffffff' };
}

export function normalizeFill(raw?: Partial<FillState> | null): FillState {
  const base = createDefaultFill();
  if (!raw) return base;
  const mode = FILL_MODES.includes(raw.mode as FillMode) ? (raw.mode as FillMode) : base.mode;
  const color = raw.color && /^#[0-9a-f]{3,8}$/i.test(raw.color) ? raw.color : base.color;
  return { mode, color };
}

export function hasFill(fill: FillState | undefined | null): boolean {
  return Boolean(fill && fill.mode !== 'none');
}
