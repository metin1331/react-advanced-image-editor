import type { CSSProperties } from 'react';

type Props = {
  /** Object URL or data URL of the exported image. */
  url: string;
  /** MIME type from the export blob (drives the download filename). */
  mimeType?: string;
  downloadLabel?: string;
  closeLabel?: string;
  onDownload?: () => void;
  onClose: () => void;
};

function IconDownload() {
  return (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M12 3v12' strokeLinecap='round' />
      <path d='m7 11 5 5 5-5' strokeLinecap='round' strokeLinejoin='round' />
      <path d='M5 21h14' strokeLinecap='round' />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M6 6l12 12M18 6 6 18' strokeLinecap='round' />
    </svg>
  );
}

function extensionForMime(mime?: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Floating result card after Done: preview bottom-left, download (top-left)
 * and close (top-right). Works on desktop and mobile via an `<a download>`.
 */
export function ExportResultPreview({
  url,
  mimeType,
  downloadLabel = 'Download',
  closeLabel = 'Close',
  onDownload,
  onClose,
}: Props) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited.${extensionForMime(mimeType)}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    onDownload?.();
  };

  return (
    <div
      data-ie-part='export-preview'
      className='ie-export-preview'
      role='dialog'
      aria-label='Edited image preview'
    >
      <div className='ie-export-preview-chrome'>
        <button
          type='button'
          data-ie-part='export-preview-download'
          className='ie-export-preview-btn'
          onClick={handleDownload}
          aria-label={downloadLabel}
          title={downloadLabel}
        >
          <IconDownload />
        </button>
        <button
          type='button'
          data-ie-part='export-preview-close'
          className='ie-export-preview-btn'
          onClick={onClose}
          aria-label={closeLabel}
          title={closeLabel}
        >
          <IconClose />
        </button>
      </div>
      <img src={url} alt='' className='ie-export-preview-img' draggable={false} />
    </div>
  );
}

type PageResultProps = Props & {
  theme?: 'light' | 'dark';
  brandColor?: string;
};

/** In-page export block. Shown instead of `.ie-export-preview` when requested. */
export function ExportPageResult({
  url,
  mimeType,
  downloadLabel = 'Download',
  closeLabel = 'Close',
  theme = 'light',
  brandColor,
  onClose,
}: PageResultProps) {
  const brand = brandColor?.trim();
  const brandStyle: CSSProperties | undefined = brand
    ? { ['--ie-brand' as string]: brand }
    : undefined;
  return (
    <section
      data-ie-part='export-result'
      data-ie-theme={theme}
      className='ie-export-result'
      style={brandStyle}
    >
      <img src={url} alt='' className='ie-export-result-img' draggable={false} />
      <div className='ie-export-result-actions'>
        <a
          href={url}
          download={`edited.${extensionForMime(mimeType)}`}
          className='ie-export-result-download'
        >
          {downloadLabel}
        </a>
        <button
          type='button'
          className='ie-export-result-close'
          onClick={onClose}
        >
          {closeLabel}
        </button>
      </div>
    </section>
  );
}
