import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_STICKER_EMOJIS,
  KAOMOJI_CATEGORIES,
  preloadStickerEmoji,
  twemojiPngUrl,
  type KaomojiCategoryId,
} from 'react-advanced-image-editor-core';

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

/** iOS Markup–style sticker sheet: emoji grid + kaomoji categories. */
export function EditorStickerSheet({
  open,
  emojis = DEFAULT_STICKER_EMOJIS,
  onPick,
  onClose,
  title = 'Add Sticker',
  emojiTabLabel = 'Emoji',
  kaomojiTabLabel = 'Kaomoji',
  doneLabel = 'Done',
}: EditorStickerSheetProps) {
  const [tab, setTab] = useState<SheetTab>('emoji');
  const [kaomojiCat, setKaomojiCat] = useState<KaomojiCategoryId>('classic');
  const [emojiReady, setEmojiReady] = useState<Record<string, boolean>>({});

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

  if (!open) return null;

  return (
    <div className='ie-sticker-overlay' data-ie-part='sticker-overlay'>
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
          <span className='ie-sticker-sheet-title'>{title}</span>
          <button type='button' className='ie-sticker-sheet-done' onClick={onClose}>
            {doneLabel}
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
