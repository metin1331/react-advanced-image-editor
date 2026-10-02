import type { Rotation, TransformState } from '../types';
import { applyExifTransform } from '../load/exifOrientation';

/** Axis-aligned size after EXIF + discrete 90° rotation (ignores fine `angle`). */
export function getTransformedSize(
  naturalWidth: number,
  naturalHeight: number,
  orientation: number,
  rotation: Rotation
): { width: number; height: number } {
  let w = naturalWidth;
  let h = naturalHeight;

  if (orientation >= 5 && orientation <= 8) [w, h] = [h, w];

  const rot = ((rotation % 360) + 360) % 360 as Rotation;
  if (rot === 90 || rot === 270) [w, h] = [h, w];

  return { width: w, height: h };
}

/** Bounding box of a rectangle rotated by `angleDeg` around its center. */
export function rotatedBounds(width: number, height: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

/**
 * Draw image with EXIF orientation, discrete rotation, flips, and fine angle.
 * Canvas must already be sized to the AABB of the final transform.
 */
export function drawImageWithTransforms(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  naturalWidth: number,
  naturalHeight: number,
  orientation: number,
  transform: TransformState
) {
  const { rotation, flipX, flipY, angle = 0 } = transform;
  const rot = ((rotation % 360) + 360) % 360 as Rotation;

  let mediaW = naturalWidth;
  let mediaH = naturalHeight;

  if (orientation >= 5 && orientation <= 8) {
    mediaW = naturalHeight;
    mediaH = naturalWidth;
  }

  if (rot === 90 || rot === 270) {
    [mediaW, mediaH] = [mediaH, mediaW];
  }

  const bounds = rotatedBounds(mediaW, mediaH, angle);
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;

  ctx.save();
  ctx.translate(canvasW / 2, canvasH / 2);
  if (angle) ctx.rotate((angle * Math.PI) / 180);
  if (flipX) ctx.scale(-1, 1);
  if (flipY) ctx.scale(1, -1);

  if (rot === 90) ctx.rotate(Math.PI / 2);
  else if (rot === 180) ctx.rotate(Math.PI);
  else if (rot === 270) ctx.rotate(-Math.PI / 2);

  ctx.translate(-naturalWidth / 2, -naturalHeight / 2);
  applyExifTransform(ctx, naturalWidth, naturalHeight, orientation);
  ctx.drawImage(image, 0, 0, naturalWidth, naturalHeight);
  ctx.restore();

  return { mediaW, mediaH, bounds };
}
