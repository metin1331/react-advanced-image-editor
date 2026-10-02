/** Crop / Calibrate: fade-out when leaving a badge's ruler. */
export const RULER_SWITCH_HIDE_FADE_DELAY_MS = 0;

export const RULER_SWITCH_HIDE_FADE_MS = 150;

export const RULER_SWITCH_HIDE_FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Pause before the incoming badge's ruler fades in. */
export const RULER_SWITCH_REVEAL_FADE_DELAY_MS = 0;

export const RULER_SWITCH_REVEAL_FADE_MS = 180;

export const RULER_SWITCH_REVEAL_FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Unmount / phase timeout — wait for the slower of hide and reveal. */
export function rulerSwitchFadeDurationMs(): number {
  const ms = Math.max(RULER_SWITCH_HIDE_FADE_MS, RULER_SWITCH_REVEAL_FADE_MS);
  if (typeof window === 'undefined') return ms;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : ms;
}
