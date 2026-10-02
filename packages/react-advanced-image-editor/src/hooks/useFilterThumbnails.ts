import { useEffect, useRef, useState } from 'react';
import {
  applyAdjustments,
  createDefaultAdjust,
  FILTER_IDS,
  WebGLAdjustRenderer,
  renderToCanvas,
  isConstrainedDevice,
  type AdjustState,
  type CropArea,
  type FilterId,
  type LoadedImage,
  type TransformState,
} from 'react-advanced-image-editor-core';

/**
 * Short edge of a thumbnail bake, in CSS px. The strip renders these at ~62px,
 * so this covers 2x displays with room for the `cover` crop.
 */
const THUMB_SHORT_EDGE = 132;

/** Long edge cap: a 16:9 crop should not bake a wide strip of pixels. */
const THUMB_LONG_EDGE = 200;

/** Bump when the bake path changes so stale black data-URLs are discarded. */
const THUMB_BAKE_VERSION = 2;

export type FilterThumbnails = Partial<Record<FilterId, string>>;

type Options = {
  /** Skip all work unless the Filter tool is open. */
  enabled: boolean;
  image: LoadedImage | null;
  crop: CropArea;
  transform: TransformState;
  aspectRatio: number | null;
  frameWidth: number;
  frameHeight: number;
  cropOutsideImage?: boolean;
  /** Calibrate grade, so a thumbnail previews the look on the *edited* photo. */
  adjust?: AdjustState;
};

function compositionKey(o: Options) {
  const { image, crop, transform, adjust } = o;
  if (!image) return '';
  return [
    THUMB_BAKE_VERSION,
    image.element.src,
    crop.x.toFixed(3),
    crop.y.toFixed(3),
    crop.zoom.toFixed(4),
    transform.rotation,
    (transform.angle ?? 0).toFixed(3),
    transform.flipX ? 1 : 0,
    transform.flipY ? 1 : 0,
    (transform.perspectiveX ?? 0).toFixed(3),
    (transform.perspectiveY ?? 0).toFixed(3),
    o.aspectRatio ?? 'auto',
    o.cropOutsideImage ? 1 : 0,
    adjust ? Object.values(adjust).map((v) => v.toFixed(3)).join(',') : '',
  ].join('|');
}

/** Thumbnail bake size: frame aspect preserved, both edges bounded. */
function thumbSize(frameWidth: number, frameHeight: number) {
  const fw = Math.max(1, frameWidth);
  const fh = Math.max(1, frameHeight);
  const aspect = fw / fh;
  let w = aspect >= 1 ? THUMB_SHORT_EDGE * aspect : THUMB_SHORT_EDGE;
  let h = aspect >= 1 ? THUMB_SHORT_EDGE : THUMB_SHORT_EDGE / aspect;
  const long = Math.max(w, h);
  if (long > THUMB_LONG_EDGE) {
    const s = THUMB_LONG_EDGE / long;
    w *= s;
    h *= s;
  }
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/** Opaque JPEG: transparent / cleared pixels become black otherwise. */
function canvasToThumbUrl(source: HTMLCanvasElement): string {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (!ctx) return source.toDataURL('image/jpeg', 0.85);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);
  return out.toDataURL('image/jpeg', 0.85);
}

function gradeOnCpu(
  base: HTMLCanvasElement,
  adjust: AdjustState,
  filter: { id: FilterId; intensity: number }
): string {
  const copy = document.createElement('canvas');
  copy.width = base.width;
  copy.height = base.height;
  const ctx = copy.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvasToThumbUrl(base);
  ctx.drawImage(base, 0, 0);
  applyAdjustments(copy, adjust, filter);
  return canvasToThumbUrl(copy);
}

/**
 * One rendered preview per filter, always at intensity 1 (iPhone Photos shows
 * each look at full strength no matter where the slider sits — only the main
 * image follows the slider).
 *
 * Uses a **private** WebGL renderer for the bake. The shared export singleton
 * was fighting the live preview context and could read back a cleared buffer
 * (solid black JPEGs in the strip).
 */
export function useFilterThumbnails(options: Options): FilterThumbnails {
  const { enabled, image, crop, transform, aspectRatio, frameWidth, frameHeight } = options;
  const [thumbnails, setThumbnails] = useState<FilterThumbnails>({});
  const renderedKey = useRef('');

  const key = enabled ? compositionKey(options) : '';

  useEffect(() => {
    if (!key || !image || frameWidth < 1 || frameHeight < 1) return;
    if (renderedKey.current === key) return;

    let cancelled = false;
    let renderer: WebGLAdjustRenderer | null = null;

    const raf = requestAnimationFrame(() => {
      if (cancelled) return;

      try {
        const { width, height } = thumbSize(frameWidth, frameHeight);
        const adjust = options.adjust ?? createDefaultAdjust();

        let base: HTMLCanvasElement;
        try {
          base = renderToCanvas(
            image,
            crop,
            transform,
            aspectRatio,
            Math.max(1, Math.round(frameWidth)),
            Math.max(1, Math.round(frameHeight)),
            options.cropOutsideImage ?? false,
            width,
            height
          );
        } catch {
          return;
        }

        try {
          if (!isConstrainedDevice()) {
            renderer = new WebGLAdjustRenderer();
            if (!renderer.isSupported) {
              renderer.dispose();
              renderer = null;
            }
          }
        } catch {
          renderer = null;
        }

        const next: FilterThumbnails = {};
        const scratch = document.createElement('canvas');

        for (const id of FILTER_IDS) {
          if (cancelled) return;
          const filter = { id, intensity: 1 };
          try {
            if (renderer) {
              const graded = renderer.renderToCanvas2D(base, adjust, filter, scratch);
              next[id] = canvasToThumbUrl(graded);
            } else {
              next[id] = gradeOnCpu(base, adjust, filter);
            }
          } catch {
            try {
              next[id] = gradeOnCpu(base, adjust, filter);
            } catch {
              next[id] = canvasToThumbUrl(base);
            }
          }
        }

        renderer?.dispose();
        renderer = null;

        if (cancelled) return;
        renderedKey.current = key;
        setThumbnails(next);
      } catch {
        renderer?.dispose();
        renderer = null;
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      renderer?.dispose();
      renderer = null;
    };
    // `key` already encodes every input that changes the pixels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, frameWidth, frameHeight]);

  return thumbnails;
}
