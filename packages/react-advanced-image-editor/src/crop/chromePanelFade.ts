/** Pause before outgoing tool chrome (`[data-ie-chrome-panel]`) fades out. */
export const CHROME_PANEL_HIDE_FADE_DELAY_MS = 0;

/** Fade-out duration when leaving a sidebar tool. */
export const CHROME_PANEL_HIDE_FADE_MS = 480;

export const CHROME_PANEL_HIDE_FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Pause before incoming tool chrome fades in. */
export const CHROME_PANEL_REVEAL_FADE_DELAY_MS = 0;

/** Fade-in duration when entering a sidebar tool. */
export const CHROME_PANEL_REVEAL_FADE_MS = 1280;

export const CHROME_PANEL_REVEAL_FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Unmount / phase timeout — wait for the slower of hide and reveal. */
export function chromePanelFadeDurationMs(): number {
  const ms = Math.max(CHROME_PANEL_HIDE_FADE_MS, CHROME_PANEL_REVEAL_FADE_MS);
  if (typeof window === 'undefined') return ms;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : ms;
}
