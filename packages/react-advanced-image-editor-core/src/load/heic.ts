/**
 * HEIC/HEIF support.
 *
 * iOS Safari (and every iOS browser, all WebKit) can decode HEIC in `<img>`.
 * `heic-to` (libheif WASM) is a last resort for desktop Chrome/Firefox — it is
 * far too heavy to run on an iPhone and will OOM the tab.
 */

import { rasterizeToJpeg } from './imageLimits';

const HEIC_BRANDS = new Set(['heic', 'heif', 'mif1', 'msf1', 'hevc', 'hevx']);

function fileNameLooksHeic(name?: string) {
  return !!name && /\.hei[cf]$/i.test(name);
}

function mimeLooksHeic(type?: string) {
  const t = (type || '').toLowerCase();
  return t.includes('heic') || t.includes('heif');
}

/** ISO BMFF `ftyp` brand sniff — catches mislabeled `application/octet-stream`. */
export async function sniffHeicBrand(blob: Blob): Promise<boolean> {
  try {
    const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    if (head.length < 12) return false;
    const box = String.fromCharCode(head[4], head[5], head[6], head[7]);
    if (box !== 'ftyp') return false;
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (HEIC_BRANDS.has(brand)) return true;
    // Compatible brands follow the major brand; scan the rest of the box.
    for (let i = 16; i + 4 <= head.length; i += 4) {
      const compat = String.fromCharCode(head[i], head[i + 1], head[i + 2], head[i + 3]);
      if (HEIC_BRANDS.has(compat)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function isHeicSource(blob: Blob, fileName?: string): Promise<boolean> {
  if (fileNameLooksHeic(fileName)) return true;
  if (mimeLooksHeic(blob.type)) return true;
  return sniffHeicBrand(blob);
}

/** Safari / iOS: decode HEIC natively, then bake a JPEG working copy. */
async function convertHeicNatively(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
      });
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('HEIC decoded with empty dimensions');
    }
    return rasterizeToJpeg(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decode HEIC → JPEG blob. Prefers the browser decoder (iPhone). WASM is
 * only used when native decode fails (desktop Chrome/Firefox).
 *
 * The result is orientation = 1 (pixels already upright).
 */
export async function convertHeicToJpeg(blob: Blob, quality = 0.92): Promise<Blob> {
  try {
    return await convertHeicNatively(blob);
  } catch {
    // Native decode unavailable — try libheif.
  }

  try {
    const { heicTo } = await import('heic-to');
    const jpeg = await heicTo({
      blob,
      type: 'image/jpeg',
      quality,
    });
    return convertHeicNatively(jpeg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not decode HEIC/HEIF image. Convert it to JPEG on your device, or try again. (${msg})`
    );
  }
}
