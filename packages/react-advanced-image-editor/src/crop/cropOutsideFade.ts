/** Hold before outside-crop overlay reveals during handle / pan gestures. */
export const CROP_OUTSIDE_REVEAL_HOLD_MS = 0;

/** Pause after reveal hold before the fade-in animation starts. */
export const CROP_OUTSIDE_REVEAL_FADE_DELAY_MS = 0;

/** Fade-in duration for the outside overlay. */
export const CROP_OUTSIDE_REVEAL_FADE_MS = 400;

export const CROP_OUTSIDE_REVEAL_FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Hold after gesture ends before the outside overlay begins to hide. */
export const CROP_OUTSIDE_HIDE_HOLD_MS = 0;

/** Pause after hide hold before the fade-out animation starts. */
export const CROP_OUTSIDE_HIDE_FADE_DELAY_MS = 400;

/** Fade-out duration for the outside overlay. */
export const CROP_OUTSIDE_HIDE_FADE_MS = 400;

export const CROP_OUTSIDE_HIDE_FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
