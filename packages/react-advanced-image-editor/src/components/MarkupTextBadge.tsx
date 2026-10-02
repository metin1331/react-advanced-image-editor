import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_MARKUP_FONT_FAMILY,
  DEFAULT_MARKUP_FONT_ID,
  type MarkupText,
  type MarkupTextAlign,
} from 'react-advanced-image-editor-core';
import type { ImageEditorFont } from '../types';
import { MARKUP_PRESET_COLORS } from './EditorMarkupToolbar';

export const MIN_TEXT_FONT_PX = 10;
export const MAX_TEXT_FONT_PX = 96;

export type MarkupTextBadgeLabels = {
  color: string;
  typography: string;
  bold: string;
  italic: string;
  underline: string;
  strikethrough: string;
  fontDefault: string;
  fontFamily: string;
  decreaseFontSize: string;
  increaseFontSize: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignJustify: string;
  duplicate: string;
  trash: string;
  colorPicker: string;
};

export const defaultTextBadgeLabels: MarkupTextBadgeLabels = {
  color: 'Color',
  typography: 'Text style',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  fontDefault: 'Default',
  fontFamily: 'Font',
  decreaseFontSize: 'Decrease text size',
  increaseFontSize: 'Increase text size',
  alignLeft: 'Align left',
  alignCenter: 'Align center',
  alignRight: 'Align right',
  alignJustify: 'Justify',
  duplicate: 'Duplicate',
  trash: 'Delete',
  colorPicker: 'Color picker',
};

export function resolveMarkupFonts(
  fonts: ImageEditorFont[] | undefined,
  defaultLabel: string
): ImageEditorFont[] {
  const extra = (fonts ?? []).filter((f) => f.id && f.id !== DEFAULT_MARKUP_FONT_ID);
  return [
    { id: DEFAULT_MARKUP_FONT_ID, label: defaultLabel, family: DEFAULT_MARKUP_FONT_FAMILY },
    ...extra,
  ];
}

export type MarkupTextBadgeProps = {
  text: MarkupText;
  anchorX: number;
  anchorY: number;
  labels?: Partial<MarkupTextBadgeLabels>;
  fonts?: ImageEditorFont[];
  /** CSS px of the markup frame's short side — converts normalized fontSize. */
  frameShortPx: number;
  onColorChange: (color: string) => void;
  onFontSizeChange: (fontSize: number) => void;
  onAlignChange: (align: MarkupTextAlign) => void;
  onBoldChange: (bold: boolean) => void;
  onItalicChange: (italic: boolean) => void;
  onUnderlineChange: (underline: boolean) => void;
  onStrikethroughChange: (strikethrough: boolean) => void;
  onFontChange: (font: ImageEditorFont) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Clear text selection when tapping outside the badge (bar-only state). */
  onDismissSelection?: () => void;
};

type Panel = 'none' | 'color' | 'typography';
type PanelPlacement = 'above' | 'below';

function displayFontPx(norm: number, shortPx: number): number {
  return Math.round(Math.min(MAX_TEXT_FONT_PX, Math.max(MIN_TEXT_FONT_PX, norm * Math.max(1, shortPx))));
}

/**
 * Contextual badge above a selected markup text — screen-axis aligned.
 */
export function MarkupTextBadge({
  text,
  anchorX,
  anchorY,
  labels: labelOverrides,
  fonts: extraFonts,
  frameShortPx,
  onColorChange,
  onFontSizeChange,
  onAlignChange,
  onBoldChange,
  onItalicChange,
  onUnderlineChange,
  onStrikethroughChange,
  onFontChange,
  onDuplicate,
  onDelete,
  onDismissSelection,
}: MarkupTextBadgeProps) {
  const labels = { ...defaultTextBadgeLabels, ...labelOverrides };
  const fonts = useMemo(
    () => resolveMarkupFonts(extraFonts, labels.fontDefault),
    [extraFonts, labels.fontDefault]
  );
  const [panel, setPanel] = useState<Panel>('none');
  const [placement, setPlacement] = useState<PanelPlacement>('above');
  const [fontOpen, setFontOpen] = useState(false);
  const [fontMenuPos, setFontMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fontBtnRef = useRef<HTMLButtonElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const currentFont =
    fonts.find((f) => f.id === (text.fontId || DEFAULT_MARKUP_FONT_ID)) ?? fonts[0];
  const fontPx = displayFontPx(text.fontSize, frameShortPx);

  useEffect(() => {
    setPanel('none');
    setFontOpen(false);
  }, [text.id]);

  useEffect(() => {
    if (panel !== 'typography') setFontOpen(false);
  }, [panel]);

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || fontMenuRef.current?.contains(t)) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-ie-part="markup-layer"]')) {
        return;
      }

      if (fontOpen) {
        setFontOpen(false);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (panel !== 'none') {
        setPanel('none');
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onDismissSelection?.();
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [panel, fontOpen, onDismissSelection]);

  useLayoutEffect(() => {
    if (panel === 'none') {
      setPlacement('above');
      return;
    }
    const root = rootRef.current;
    const panelEl = panelRef.current;
    if (!root || !panelEl) return;
    const view =
      (root.closest('[data-ie-part="adjust-view"]') as HTMLElement | null) ??
      (root.closest('[data-ie-part="adjust-view-inner"]') as HTMLElement | null);
    const bar = root.querySelector('.ie-shape-badge-bar') as HTMLElement | null;
    const viewTop = view?.getBoundingClientRect().top ?? 0;
    const barTop = (bar ?? root).getBoundingClientRect().top;
    const need = panelEl.offsetHeight + 8;
    setPlacement(barTop - viewTop < need + 4 ? 'below' : 'above');
  }, [panel, text.id, anchorX, anchorY]);

  useLayoutEffect(() => {
    if (!fontOpen) {
      setFontMenuPos(null);
      return;
    }
    const update = () => {
      const btn = fontBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const gap = 4;
      const estimated = fontMenuRef.current?.offsetHeight ?? 160;
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const openDown = spaceBelow >= Math.min(estimated, 96) || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(88, openDown ? spaceBelow : spaceAbove);
      const top = openDown ? r.bottom + gap : r.top - gap - Math.min(estimated, maxHeight);
      setFontMenuPos({
        top: Math.max(8, top),
        left: r.left,
        width: r.width,
        maxHeight,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [fontOpen, fonts.length, currentFont.id]);

  const toggle = (next: Panel) => {
    setFontOpen(false);
    setPanel((p) => (p === next ? 'none' : next));
  };

  const stepFont = (delta: number) => {
    const nextPx = Math.min(MAX_TEXT_FONT_PX, Math.max(MIN_TEXT_FONT_PX, fontPx + delta));
    if (nextPx === fontPx) return;
    onFontSizeChange(nextPx / Math.max(1, frameShortPx));
  };

  const portalRoot =
    typeof document !== 'undefined'
      ? (rootRef.current?.closest('[data-ie-root]') as HTMLElement | null)
      : null;

  return (
    <div
      ref={rootRef}
      className='ie-shape-badge ie-text-badge'
      data-ie-part='text-badge'
      data-ie-panel={panel !== 'none' ? panel : undefined}
      data-ie-placement={panel !== 'none' ? placement : undefined}
      style={{
        left: `${anchorX * 100}%`,
        top: `${Math.max(0.02, anchorY) * 100}%`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className='ie-shape-badge-bar' role='toolbar' aria-label='Text actions'>
        <button
          type='button'
          className='ie-shape-badge-btn'
          data-active={panel === 'color' ? 'true' : undefined}
          aria-expanded={panel === 'color'}
          aria-controls={panelId}
          aria-label={labels.color}
          title={labels.color}
          onClick={() => toggle('color')}
        >
          <span
            className='ie-shape-badge-swatch'
            style={{ background: text.color }}
            aria-hidden
          />
        </button>
        <button
          type='button'
          className='ie-shape-badge-btn ie-text-badge-aa'
          data-active={panel === 'typography' ? 'true' : undefined}
          aria-expanded={panel === 'typography'}
          aria-controls={panelId}
          aria-label={labels.typography}
          title={labels.typography}
          onClick={() => toggle('typography')}
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='24'
            height='24'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.55'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16' />
            <path d='M22 9v7' />
            <path d='M3.304 13h6.392' />
            <circle cx='18.5' cy='12.5' r='3.5' />
          </svg>
        </button>
        <span className='ie-shape-badge-sep' aria-hidden />
        <button
          type='button'
          className='ie-shape-badge-btn'
          aria-label={labels.duplicate}
          title={labels.duplicate}
          onClick={onDuplicate}
        >
          <DupIcon />
        </button>
        <button
          type='button'
          className='ie-shape-badge-btn ie-shape-badge-btn-danger'
          aria-label={labels.trash}
          title={labels.trash}
          onClick={onDelete}
        >
          <TrashIcon />
        </button>

        {panel !== 'none' && (
          <div
            ref={panelRef}
            className='ie-shape-badge-panel'
            id={panelId}
            role='dialog'
            data-ie-placement={placement}
            data-ie-aa={panel === 'typography' ? 'true' : undefined}
          >
            {panel === 'color' && (
              <div className='ie-shape-badge-colors'>
                <div className='ie-markup-color-row ie-markup-color-grid' role='listbox'>
                  {MARKUP_PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type='button'
                      role='option'
                      className='ie-markup-swatch'
                      data-ie-active={text.color.toLowerCase() === c ? 'true' : undefined}
                      style={{ background: c }}
                      aria-label={c}
                      onClick={() => onColorChange(c)}
                    />
                  ))}
                </div>
                <div className='ie-shape-badge-color-actions'>
                  <button
                    type='button'
                    className='ie-markup-swatch ie-markup-swatch-custom'
                    aria-label={labels.colorPicker}
                    title={labels.colorPicker}
                    onClick={() => colorInputRef.current?.click()}
                  >
                    <span className='ie-markup-swatch-custom-face' aria-hidden />
                    <input
                      ref={colorInputRef}
                      type='color'
                      value={/^#[0-9a-f]{6}$/i.test(text.color) ? text.color : '#007aff'}
                      onChange={(e) => onColorChange(e.target.value)}
                      tabIndex={-1}
                      aria-hidden
                    />
                  </button>
                </div>
              </div>
            )}

            {panel === 'typography' && (
              <div className='ie-text-aa'>
                <div className='ie-text-aa-row' role='group' aria-label={labels.typography}>
                  <button
                    type='button'
                    className='ie-text-aa-seg'
                    data-ie-active={text.bold ? 'true' : undefined}
                    aria-pressed={!!text.bold}
                    aria-label={labels.bold}
                    title={labels.bold}
                    onClick={() => onBoldChange(!text.bold)}
                  >
                    <span className='ie-text-aa-letter'>B</span>
                  </button>
                  <button
                    type='button'
                    className='ie-text-aa-seg'
                    data-ie-active={text.italic ? 'true' : undefined}
                    aria-pressed={!!text.italic}
                    aria-label={labels.italic}
                    title={labels.italic}
                    onClick={() => onItalicChange(!text.italic)}
                  >
                    <span className='ie-text-aa-letter ie-text-aa-letter-italic'>I</span>
                  </button>
                  <button
                    type='button'
                    className='ie-text-aa-seg'
                    data-ie-active={text.underline ? 'true' : undefined}
                    aria-pressed={!!text.underline}
                    aria-label={labels.underline}
                    title={labels.underline}
                    onClick={() => onUnderlineChange(!text.underline)}
                  >
                    <span className='ie-text-aa-letter ie-text-aa-letter-underline'>U</span>
                  </button>
                  <button
                    type='button'
                    className='ie-text-aa-seg'
                    data-ie-active={text.strikethrough ? 'true' : undefined}
                    aria-pressed={!!text.strikethrough}
                    aria-label={labels.strikethrough}
                    title={labels.strikethrough}
                    onClick={() => onStrikethroughChange(!text.strikethrough)}
                  >
                    <span className='ie-text-aa-letter ie-text-aa-letter-strike'>S</span>
                  </button>
                </div>

                <div className='ie-text-aa-size' role='group' aria-label={labels.increaseFontSize}>
                  <button
                    type='button'
                    className='ie-text-aa-step'
                    aria-label={labels.decreaseFontSize}
                    title={labels.decreaseFontSize}
                    disabled={fontPx <= MIN_TEXT_FONT_PX}
                    onClick={() => stepFont(-1)}
                  >
                    −
                  </button>
                  <span className='ie-text-aa-size-val'>{fontPx}</span>
                  <button
                    type='button'
                    className='ie-text-aa-step'
                    aria-label={labels.increaseFontSize}
                    title={labels.increaseFontSize}
                    disabled={fontPx >= MAX_TEXT_FONT_PX}
                    onClick={() => stepFont(1)}
                  >
                    +
                  </button>
                </div>

                <button
                  ref={fontBtnRef}
                  type='button'
                  className='ie-text-aa-font'
                  aria-haspopup='listbox'
                  aria-expanded={fontOpen}
                  aria-label={labels.fontFamily}
                  title={labels.fontFamily}
                  data-ie-open={fontOpen ? 'true' : undefined}
                  onClick={() => setFontOpen((v) => !v)}
                >
                  <span
                    className='ie-text-aa-font-label'
                    style={{ fontFamily: currentFont.family }}
                  >
                    {currentFont.label}
                  </span>
                  <ChevronIcon open={fontOpen} />
                </button>

                <div className='ie-text-aa-row' role='group' aria-label={labels.alignLeft}>
                  <button
                    type='button'
                    className='ie-text-aa-seg'
                    data-ie-active={text.align === 'left' ? 'true' : undefined}
                    aria-pressed={text.align === 'left'}
                    aria-label={labels.alignLeft}
                    title={labels.alignLeft}
                    onClick={() => onAlignChange('left')}
                  >
                    <AlignLeftIcon />
                  </button>
                  <button
                    type='button'
                    className='ie-text-aa-seg'
                    data-ie-active={text.align === 'center' ? 'true' : undefined}
                    aria-pressed={text.align === 'center'}
                    aria-label={labels.alignCenter}
                    title={labels.alignCenter}
                    onClick={() => onAlignChange('center')}
                  >
                    <AlignCenterIcon />
                  </button>
                  <button
                    type='button'
                    className='ie-text-aa-seg'
                    data-ie-active={text.align === 'right' ? 'true' : undefined}
                    aria-pressed={text.align === 'right'}
                    aria-label={labels.alignRight}
                    title={labels.alignRight}
                    onClick={() => onAlignChange('right')}
                  >
                    <AlignRightIcon />
                  </button>
                  <button
                    type='button'
                    className='ie-text-aa-seg'
                    data-ie-active={text.align === 'justify' ? 'true' : undefined}
                    aria-pressed={text.align === 'justify'}
                    aria-label={labels.alignJustify}
                    title={labels.alignJustify}
                    onClick={() => onAlignChange('justify')}
                  >
                    <AlignJustifyIcon />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {fontOpen &&
        fontMenuPos &&
        portalRoot &&
        createPortal(
          <div
            ref={fontMenuRef}
            className='ie-text-aa-font-menu'
            role='listbox'
            aria-label={labels.fontFamily}
            data-ie-part='text-font-menu'
            style={{
              top: fontMenuPos.top,
              left: fontMenuPos.left,
              width: fontMenuPos.width,
              maxHeight: fontMenuPos.maxHeight,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {fonts.map((font) => (
              <button
                key={font.id}
                type='button'
                role='option'
                className='ie-text-aa-font-option'
                data-ie-active={font.id === currentFont.id ? 'true' : undefined}
                aria-selected={font.id === currentFont.id}
                style={{ fontFamily: font.family }}
                onClick={() => {
                  onFontChange(font);
                  setFontOpen(false);
                }}
              >
                {font.label}
              </button>
            ))}
          </div>,
          portalRoot
        )}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width='12'
      height='12'
      viewBox='0 0 12 12'
      fill='none'
      aria-hidden
      className='ie-text-aa-font-chevron'
      data-ie-open={open ? 'true' : undefined}
    >
      <path d='M2.5 4.5 6 8l3.5-3.5' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function AlignLeftIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' aria-hidden>
      <path d='M4 6h16M4 11h10M4 16h16M4 21h10' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
    </svg>
  );
}

function AlignCenterIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' aria-hidden>
      <path d='M4 6h16M7 11h10M4 16h16M7 21h10' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
    </svg>
  );
}

function AlignRightIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' aria-hidden>
      <path d='M4 6h16M10 11h10M4 16h16M10 21h10' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
    </svg>
  );
}

function AlignJustifyIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' aria-hidden>
      <path d='M4 6h16M4 11h16M4 16h16M4 21h16' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
    </svg>
  );
}

function DupIcon() {
  return (
    <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden>
      <rect x='8' y='8' width='12' height='12' rx='2' stroke='currentColor' strokeWidth='1.7' />
      <path
        d='M4 14V6a2 2 0 0 1 2-2h8'
        stroke='currentColor'
        strokeWidth='1.7'
        strokeLinecap='round'
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='20'
      height='20'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <circle cx='12' cy='12' r='10' />
      <path d='m15 9-6 6' />
      <path d='m9 9 6 6' />
    </svg>
  );
}
