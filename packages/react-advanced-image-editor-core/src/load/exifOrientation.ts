import { canvasToJpeg, clampCanvasSize, getMaxWorkingEdge } from './imageLimits';

/** EXIF orientation tag 1–8 */
export async function readExifOrientation(file: File | Blob): Promise<number> {
  try {
    const buffer = await file.slice(0, 65536).arrayBuffer();
    return parseJpegExifOrientation(buffer);
  } catch {
    return 1;
  }
}

function parseJpegExifOrientation(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    offset += 2;

    if (marker === 0xd9 || marker === 0xda) break;

    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;

    if (marker === 0xe1) {
      const orientation = readExifSegment(view, offset + 2, segmentLength - 2);
      if (orientation) return orientation;
    }

    offset += segmentLength;
  }

  return 1;
}

function readExifSegment(
  view: DataView,
  start: number,
  length: number
): number | null {
  if (length < 8) return null;
  if (
    view.getUint8(start) !== 0x45 ||
    view.getUint8(start + 1) !== 0x78 ||
    view.getUint8(start + 2) !== 0x69 ||
    view.getUint8(start + 3) !== 0x66 ||
    view.getUint8(start + 4) !== 0x00 ||
    view.getUint8(start + 5) !== 0x00
  ) {
    return null;
  }

  const tiffStart = start + 6;
  if (tiffStart + 8 > view.byteLength) return null;

  const littleEndian = view.getUint16(tiffStart) === 0x4949;
  const ifd0Offset = tiffStart + view.getUint32(tiffStart + 4, littleEndian);
  if (ifd0Offset + 2 > view.byteLength) return null;

  const numEntries = view.getUint16(ifd0Offset, littleEndian);
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag !== 0x0112) continue;

    const value = view.getUint16(entryOffset + 8, littleEndian);
    if (value >= 1 && value <= 8) return value;
  }

  return null;
}

/** Size after applying EXIF orientation (before user rotation) */
export function getOrientedSize(
  width: number,
  height: number,
  orientation: number
): { width: number; height: number } {
  if (orientation >= 5 && orientation <= 8) {
    return { width: height, height: width };
  }
  return { width, height };
}

/** Canvas transform matching EXIF orientation tags 2–8. */
export function applyExifTransform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  orientation: number
) {
  switch (orientation) {
    case 2:
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    case 5:
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6:
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -height);
      break;
    case 7:
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(width, -height);
      ctx.scale(-1, 1);
      break;
    case 8:
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-width, 0);
      break;
    default:
      break;
  }
}

async function bakeWithManualExif(blob: Blob, orientation: number): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load image'));
      el.src = url;
    });

    const oriented = getOrientedSize(img.naturalWidth, img.naturalHeight, orientation);
    const { width, height } = clampCanvasSize(oriented.width, oriented.height);
    const scale = width / Math.max(1, oriented.width);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    ctx.save();
    ctx.scale(scale, scale);
    applyExifTransform(ctx, img.naturalWidth, img.naturalHeight, orientation);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    return canvasToJpeg(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Bake EXIF orientation into pixel data, strip the tag, and cap long-edge
 * so later Calibrate/Filter bakes cannot allocate a 12–48MP canvas.
 */
export async function bakeImageOrientation(blob: Blob): Promise<Blob> {
  const orientation = await readExifOrientation(blob);
  const maxEdge = getMaxWorkingEdge();

  if (typeof createImageBitmap === 'function') {
    try {
      const opts: ImageBitmapOptions = { imageOrientation: 'from-image' };
      let bitmap = await createImageBitmap(blob, opts);
      const { width, height } = clampCanvasSize(bitmap.width, bitmap.height, maxEdge);
      if (bitmap.width !== width || bitmap.height !== height) {
        bitmap.close();
        bitmap = await createImageBitmap(blob, {
          ...opts,
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'high',
        });
      } else if (orientation === 1) {
        bitmap.close();
        return blob;
      }

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        throw new Error('Canvas not supported');
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return canvasToJpeg(canvas);
    } catch {
      // Fall back to Image + manual EXIF transform.
    }
  }

  if (orientation === 1) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Failed to load image'));
        el.src = url;
      });
      if (Math.max(img.naturalWidth, img.naturalHeight) <= maxEdge) return blob;
      const { width, height } = clampCanvasSize(img.naturalWidth, img.naturalHeight, maxEdge);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      return canvasToJpeg(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return bakeWithManualExif(blob, orientation);
}
