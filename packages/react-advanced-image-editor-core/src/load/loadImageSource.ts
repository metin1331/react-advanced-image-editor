import type { ImageSource, LoadedImage } from '../types';
import { bakeImageOrientation } from './exifOrientation';
import { convertHeicToJpeg, isHeicSource, sniffHeicBrand } from './heic';
import { getMaxWorkingEdge, rasterizeToJpeg } from './imageLimits';

async function loadElement(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  const img = new Image();
  if (crossOrigin) img.crossOrigin = 'anonymous';
  img.src = src;
  try {
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cannot be decoded|decode/i.test(msg)) {
      throw new Error(
        'The source image cannot be decoded. If this is a HEIC/HEIF photo from a mobile device, the editor will try to convert it automatically — otherwise export it as JPEG and try again.'
      );
    }
    throw err instanceof Error ? err : new Error(msg);
  }
  return img;
}

async function constrainDecoded(
  element: HTMLImageElement,
  blobUrl: string
): Promise<{ element: HTMLImageElement; blobUrl: string }> {
  const maxEdge = getMaxWorkingEdge();
  if (Math.max(element.naturalWidth, element.naturalHeight) <= maxEdge) {
    return { element, blobUrl };
  }

  const jpeg = await rasterizeToJpeg(element, maxEdge);
  URL.revokeObjectURL(blobUrl);
  const nextUrl = URL.createObjectURL(jpeg);
  try {
    const next = await loadElement(nextUrl);
    return { element: next, blobUrl: nextUrl };
  } catch (err) {
    URL.revokeObjectURL(nextUrl);
    throw err;
  }
}

async function loadBlobAsImage(
  blob: Blob,
  fileName?: string
): Promise<{ element: HTMLImageElement; blobUrl: string; orientation: number }> {
  let working = blob;
  let convertedFromHeic = false;

  if (await isHeicSource(blob, fileName)) {
    working = await convertHeicToJpeg(blob);
    convertedFromHeic = true;
  } else {
    // mobile Safari auto-orients <img> but drawImage() also sees oriented pixels;
    // baking here keeps preview and export in sync and caps megapixels.
    working = await bakeImageOrientation(working);
  }

  const blobUrl = URL.createObjectURL(working);

  try {
    const element = await loadElement(blobUrl);
    const constrained = await constrainDecoded(element, blobUrl);
    return { ...constrained, orientation: 1 };
  } catch (err) {
    URL.revokeObjectURL(blobUrl);

    if (!convertedFromHeic && (await sniffHeicBrand(blob))) {
      const jpeg = await convertHeicToJpeg(blob);
      const retryUrl = URL.createObjectURL(jpeg);
      try {
        const element = await loadElement(retryUrl);
        const constrained = await constrainDecoded(element, retryUrl);
        return { ...constrained, orientation: 1 };
      } catch {
        URL.revokeObjectURL(retryUrl);
        throw err;
      }
    }

    throw err;
  }
}

export async function loadImageSource(source: ImageSource): Promise<LoadedImage> {
  let element: HTMLImageElement;
  let revoke: string | undefined;
  let orientation = 1;

  if (source instanceof HTMLImageElement) {
    element = source;
    if (!source.complete) {
      await new Promise<void>((resolve, reject) => {
        source.onload = () => resolve();
        source.onerror = () => reject(new Error('Failed to load image'));
      });
    }
    if (Math.max(element.naturalWidth, element.naturalHeight) > getMaxWorkingEdge()) {
      const jpeg = await rasterizeToJpeg(element);
      revoke = URL.createObjectURL(jpeg);
      element = await loadElement(revoke);
    }
  } else if (source instanceof HTMLCanvasElement) {
    element = await loadElement(source.toDataURL());
  } else if (typeof source === 'string') {
    const isRemote = /^https?:\/\//.test(source);
    if (isRemote) {
      try {
        element = await loadElement(source, true);
        if (Math.max(element.naturalWidth, element.naturalHeight) > getMaxWorkingEdge()) {
          const jpeg = await rasterizeToJpeg(element);
          revoke = URL.createObjectURL(jpeg);
          element = await loadElement(revoke);
        }
      } catch (err) {
        const res = await fetch(source);
        const blob = await res.blob();
        if (await isHeicSource(blob)) {
          const loaded = await loadBlobAsImage(blob);
          element = loaded.element;
          revoke = loaded.blobUrl;
          orientation = loaded.orientation;
        } else {
          throw err;
        }
      }
    } else {
      element = await loadElement(source, false);
    }
  } else {
    const fileName = source instanceof File ? source.name : undefined;
    const loaded = await loadBlobAsImage(source, fileName);
    element = loaded.element;
    revoke = loaded.blobUrl;
    orientation = loaded.orientation;
  }

  return {
    element,
    width: element.naturalWidth,
    height: element.naturalHeight,
    orientation,
    blobUrl: revoke,
  };
}
