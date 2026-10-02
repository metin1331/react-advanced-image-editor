/** Pause before `.ie-main` fades out when entering or leaving Markup. */
export const MARKUP_MODE_HIDE_FADE_DELAY_MS = 0;

/** `.ie-main` fade-out duration (other mode ↔ Markup). */
export const MARKUP_MODE_HIDE_FADE_MS = 280;

export const MARKUP_MODE_HIDE_FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Wait after the layout/state switch (while still at opacity 0) so chrome,
 * image geometry, and floating bars can paint before fade-in.
 */
export const MARKUP_MODE_LAYOUT_SETTLE_MS = 48;

/** Pause before `.ie-main` fades in after the Markup layout switch. */
export const MARKUP_MODE_REVEAL_FADE_DELAY_MS = 0;

/** `.ie-main` fade-in duration (other mode ↔ Markup). */
export const MARKUP_MODE_REVEAL_FADE_MS = 280;

export const MARKUP_MODE_REVEAL_FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Fade duration for a Markup mode transition phase. */
export function markupModeFadeDurationMs(phase: 'hide' | 'reveal'): number {
  const ms =
    phase === 'hide' ? MARKUP_MODE_HIDE_FADE_MS : MARKUP_MODE_REVEAL_FADE_MS;
  return prefersReducedMotion() ? 1 : ms;
}

/** Fade delay for a Markup mode transition phase. */
export function markupModeFadeDelayMs(phase: 'hide' | 'reveal'): number {
  return phase === 'hide'
    ? MARKUP_MODE_HIDE_FADE_DELAY_MS
    : MARKUP_MODE_REVEAL_FADE_DELAY_MS;
}

/** Time to wait for a fade phase to finish (delay + duration). */
export function markupModeFadeWaitMs(phase: 'hide' | 'reveal'): number {
  return markupModeFadeDelayMs(phase) + markupModeFadeDurationMs(phase);
}

/** Hold after switching Markup layout, before fade-in starts. */
export function markupModeLayoutSettleMs(): number {
  return prefersReducedMotion() ? 0 : MARKUP_MODE_LAYOUT_SETTLE_MS;
}
