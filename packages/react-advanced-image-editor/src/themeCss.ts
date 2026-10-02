import type { CSSProperties } from 'react';
import type { ImageEditorThemeColors } from './types';

/** CamelCase theme keys → `--ie-*` custom properties on `[data-ie-root]`. */
const THEME_COLOR_VARS: Record<keyof ImageEditorThemeColors, string> = {
  accent: '--ie-accent',
  accentHover: '--ie-accent-hover',
  accentSoft: '--ie-accent-soft',
  accentText: '--ie-accent-text',
  bg: '--ie-bg',
  bgMuted: '--ie-bg-muted',
  bgSidebar: '--ie-bg-sidebar',
  border: '--ie-border',
  text: '--ie-text',
  textMuted: '--ie-text-muted',
  overlay: '--ie-overlay',
  cropBorder: '--ie-crop-border',
  cropHandle: '--ie-crop-handle',
  grid: '--ie-grid',
  chromeHover: '--ie-chrome-hover',
  chromeActive: '--ie-chrome-active',
  rulerNegative: '--ie-ruler-negative',
  rulerPositive: '--ie-ruler-positive',
  rulerTick: '--ie-ruler-tick',
  rulerTickMajor: '--ie-ruler-tick-major',
};

/** Map optional theme color overrides to inline CSS variables. */
export function themeColorsToStyle(
  colors?: Partial<ImageEditorThemeColors>
): CSSProperties | undefined {
  if (!colors) return undefined;
  const style: Record<string, string> = {};
  for (const key of Object.keys(THEME_COLOR_VARS) as (keyof ImageEditorThemeColors)[]) {
    const value = colors[key];
    if (value != null && value !== '') {
      style[THEME_COLOR_VARS[key]] = value;
    }
  }
  return Object.keys(style).length ? (style as CSSProperties) : undefined;
}
