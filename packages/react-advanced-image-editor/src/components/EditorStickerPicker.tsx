import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_STICKER_EMOJIS,
  KAOMOJI_CATEGORIES,
  preloadStickerEmoji,
  twemojiPngUrl,
  type KaomojiCategoryId,
} from 'react-advanced-image-editor-core';
import {
  SHEET_MOTION_EASE,
  SHEET_MOTION_MS,
  sheetMotionDurationMs,
} from '../crop/sheetMotion';

export type StickerPick = {
  emoji: string;
  style: 'emoji' | 'kaomoji';
};

export type EditorStickerSheetProps = {
  open: boolean;
  emojis?: readonly string[];
  onPick: (pick: StickerPick) => void;
  onClose: () => void;
  title?: string;
  emojiTabLabel?: string;
  kaomojiTabLabel?: string;
  doneLabel?: string;
};

type SheetTab = 'emoji' | 'kaomoji';

/** Markup–style sticker sheet: emoji grid + kaomoji categories. */
export function EditorStickerSheet({
  open,
  emojis = DEFAULT_STICKER_EMOJIS,
  onPick,
  onClose,
  title = 'Add Sticker',
  emojiTabLabel = 'Emoji',
  kaomojiTabLabel = 'Kaomoji',
}: EditorStickerSheetProps) {
  const [tab, setTab] = useState<SheetTab>('emoji');
  const [kaomojiCat, setKaomojiCat] = useState<KaomojiCategoryId>('classic');
  const [emojiReady, setEmojiReady] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
  }, [open]);

  useEffect(() => {
    if (open || !mounted) return;
    const t = window.setTimeout(() => setMounted(false), sheetMotionDurationMs());
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  const emojiList = useMemo(() => [...emojis], [emojis]);
  const activeKaomoji = useMemo(
    () => KAOMOJI_CATEGORIES.find((c) => c.id === kaomojiCat) ?? KAOMOJI_CATEGORIES[0],
    [kaomojiCat]
  );

  useEffect(() => {
    if (!open || tab !== 'emoji') return;
    let cancelled = false;
    const batch = emojiList.slice(0, 120);
    for (const emoji of batch) {
      void preloadStickerEmoji(emoji).then((img) => {
        if (cancelled || !img) return;
        setEmojiReady((prev) => (prev[emoji] ? prev : { ...prev, [emoji]: true }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open, tab, emojiList]);

  if (!mounted) return null;

  return (
    <div
      ref={overlayRef}
      className='ie-sticker-overlay'
      data-ie-part='sticker-overlay'
      data-ie-open={shown ? 'true' : 'false'}
      style={
        {
          '--ie-sheet-duration': `${SHEET_MOTION_MS}ms`,
          '--ie-sheet-ease': SHEET_MOTION_EASE,
        } as React.CSSProperties
      }
    >
      <button
        type='button'
        className='ie-sticker-overlay-backdrop'
        aria-label='Close stickers'
        onClick={onClose}
      />
      <div
        className='ie-sticker-sheet'
        data-ie-part='sticker-sheet'
        role='dialog'
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type='button'
          className='ie-sticker-sheet-handle'
          aria-label='Close'
          onClick={onClose}
        />
        <header className='ie-sticker-sheet-header'>
          <span aria-hidden />
          <h2 className='ie-sticker-sheet-title'>{title}</h2>
          <button
            type='button'
            className='ie-color-picker-close'
            aria-label='Close'
            onClick={onClose}
          >
            <svg width='12' height='12' viewBox='0 0 12 12' fill='none' aria-hidden>
              <path
                d='M2.1 2.1 9.9 9.9M9.9 2.1 2.1 9.9'
                stroke='currentColor'
                strokeWidth='1.7'
                strokeLinecap='round'
              />
            </svg>
          </button>
        </header>

        <div className='ie-sticker-sheet-tabs' role='tablist'>
          <button
            type='button'
            role='tab'
            className='ie-sticker-sheet-tab'
            data-active={tab === 'emoji' ? 'true' : undefined}
            aria-selected={tab === 'emoji'}
            onClick={() => setTab('emoji')}
          >
            {emojiTabLabel}
          </button>
          <button
            type='button'
            role='tab'
            className='ie-sticker-sheet-tab'
            data-active={tab === 'kaomoji' ? 'true' : undefined}
            aria-selected={tab === 'kaomoji'}
            onClick={() => setTab('kaomoji')}
          >
            {kaomojiTabLabel}
          </button>
        </div>

        {tab === 'emoji' ? (
          <div className='ie-sticker-emoji-grid' role='listbox' aria-label='Emoji'>
            {emojiList.map((emoji) => (
              <button
                key={emoji}
                type='button'
                role='option'
                className='ie-sticker-emoji-chip'
                aria-label={emoji}
                onClick={() => onPick({ emoji, style: 'emoji' })}
                onPointerEnter={() => {
                  if (emojiReady[emoji]) return;
                  void preloadStickerEmoji(emoji).then((img) => {
                    if (!img) return;
                    setEmojiReady((prev) => (prev[emoji] ? prev : { ...prev, [emoji]: true }));
                  });
                }}
              >
                {emojiReady[emoji] ? (
                  <img src={twemojiPngUrl(emoji)} alt='' draggable={false} />
                ) : (
                  <span>{emoji}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className='ie-sticker-kaomoji-cats' role='tablist' aria-label='Kaomoji categories'>
              {KAOMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type='button'
                  role='tab'
                  className='ie-sticker-kaomoji-cat'
                  data-active={kaomojiCat === cat.id ? 'true' : undefined}
                  aria-selected={kaomojiCat === cat.id}
                  onClick={() => setKaomojiCat(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className='ie-sticker-kaomoji-grid' role='listbox' aria-label={activeKaomoji.label}>
              {activeKaomoji.items.map((item) => (
                <button
                  key={item}
                  type='button'
                  role='option'
                  className='ie-sticker-kaomoji-chip'
                  onClick={() => onPick({ emoji: item, style: 'kaomoji' })}
                >
                  {item}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** @deprecated Use EditorStickerSheet */
export const EditorStickerPicker = EditorStickerSheet;
