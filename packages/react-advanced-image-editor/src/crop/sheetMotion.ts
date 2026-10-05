/** sheet-style bottom-sheet present / dismiss. Same duration and curve both ways. */
export const SHEET_MOTION_MS = 480;
export const SHEET_MOTION_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function sheetMotionDurationMs() {
  if (typeof window === 'undefined') return SHEET_MOTION_MS;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 1
    : SHEET_MOTION_MS;
}
