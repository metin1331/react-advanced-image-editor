import type { MarkupDrawTool } from './types';

export interface StrokeStyle {
  /** Multiplier applied to the user-selected width. */
  widthScale: number;
  /** Base alpha for the stroke ink. */
  opacity: number;
  /** Soft edge blur in CSS px at a 400px-short-side reference (0 = hard). */
  softBlur: number;
  /** Canvas composite for the stroke layer. */
  composite: GlobalCompositeOperation;
}

const STYLES: Record<MarkupDrawTool | 'eraser', StrokeStyle> = {
  pen: {
    widthScale: 1,
    opacity: 1,
    softBlur: 0,
    composite: 'source-over',
  },
  marker: {
    // source-over + alpha so the translucent tip works on both the transparent
    // preview overlay and the graded export canvas (multiply fails on empty α).
    widthScale: 2.4,
    opacity: 0.4,
    softBlur: 0.4,
    composite: 'source-over',
  },
  pencil: {
    widthScale: 1.15,
    opacity: 0.72,
    softBlur: 0.85,
    composite: 'source-over',
  },
  eraser: {
    widthScale: 1.6,
    opacity: 1,
    softBlur: 0,
    composite: 'destination-out',
  },
};

export function strokeStyleFor(tool: MarkupDrawTool | 'eraser'): StrokeStyle {
  return STYLES[tool];
}
