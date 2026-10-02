import {
  DEFAULT_MARKUP_FONT_FAMILY,
  type MarkupText,
} from './types';

export function shortSide(width: number, height: number): number {
  return Math.max(1, Math.min(width, height));
}

export function resolveMarkupFontFamily(text: Pick<MarkupText, 'fontFamily'>): string {
  const family = text.fontFamily?.trim();
  return family || DEFAULT_MARKUP_FONT_FAMILY;
}

export function textFontString(text: MarkupText, pixelSize: number): string {
  const weight = text.bold ? '600' : '400';
  const italic = text.italic ? 'italic ' : '';
  return `${italic}${weight} ${pixelSize}px ${resolveMarkupFontFamily(text)}`;
}

export type LayoutTextLine = {
  text: string;
  endParagraph: boolean;
};

export type TextMeasureFn = (text: string, font: string) => number;

let measureCanvas: HTMLCanvasElement | null = null;

export function createCanvasTextMeasure(): TextMeasureFn {
  if (typeof document === 'undefined') {
    return (text) => text.length * 8;
  }
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return (text) => text.length * 8;
  return (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

const defaultMeasure = createCanvasTextMeasure();

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  measure: (s: string) => number
): string[] {
  if (!paragraph) return [''];
  const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
  if (!words.length) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (measure(test) <= maxWidth || !current) {
      current = test;
      // If a single word is wider than the box, hard-break by character.
      if (!current.includes(' ') && measure(current) > maxWidth) {
        let chunk = '';
        for (const ch of current) {
          const next = chunk + ch;
          if (measure(next) <= maxWidth || !chunk) chunk = next;
          else {
            lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      }
      continue;
    }
    lines.push(current);
    current = word;
    if (measure(current) > maxWidth) {
      let chunk = '';
      for (const ch of word) {
        const next = chunk + ch;
        if (measure(next) <= maxWidth || !chunk) chunk = next;
        else {
          lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** Lay out text with word wrap inside the markup box (frame pixel coords). */
export function layoutTextLineMeta(
  text: MarkupText,
  frameWidth: number,
  frameHeight: number,
  measure: TextMeasureFn = defaultMeasure
): LayoutTextLine[] {
  const size = Math.max(10, text.fontSize * shortSide(frameWidth, frameHeight));
  const boxW = Math.max(1, text.w * frameWidth);
  const font = textFontString(text, size);
  const measureWithFont = (s: string) => measure(s, font);

  const paragraphs = text.text.split('\n');
  const out: LayoutTextLine[] = [];
  for (const para of paragraphs) {
    if (para === '') {
      out.push({ text: '', endParagraph: true });
      continue;
    }
    const wrapped = wrapParagraph(para, boxW, measureWithFont);
    wrapped.forEach((line, i) => {
      out.push({ text: line, endParagraph: i === wrapped.length - 1 });
    });
  }
  return out.length ? out : [{ text: '', endParagraph: true }];
}

export function layoutTextLines(
  text: MarkupText,
  frameWidth: number,
  frameHeight: number,
  measure: TextMeasureFn = defaultMeasure
): string[] {
  return layoutTextLineMeta(text, frameWidth, frameHeight, measure).map((line) => line.text);
}

export function textLineHeightPx(
  text: MarkupText,
  frameWidth: number,
  frameHeight: number
): number {
  const size = Math.max(10, text.fontSize * shortSide(frameWidth, frameHeight));
  return size * 1.25;
}

export function textBlockHeightNorm(
  text: MarkupText,
  frameWidth: number,
  frameHeight: number,
  measure?: TextMeasureFn
): number {
  const lines = layoutTextLines(text, frameWidth, frameHeight, measure);
  const lineH = textLineHeightPx(text, frameWidth, frameHeight);
  return (lines.length * lineH) / Math.max(1, frameHeight);
}
