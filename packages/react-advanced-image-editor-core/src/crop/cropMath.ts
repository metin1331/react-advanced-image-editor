import type { CropArea, CropComputeOptions, PixelCrop } from '../types';

/** Opening crop zoom (relative to cover). Overridable via `ImageEditor` `initialZoom`. */
export const DEFAULT_INITIAL_CROP_ZOOM = 2.5;

export function createDefaultCrop(zoom?: number): CropArea {
  return { x: 0, y: 0, zoom: zoom ?? DEFAULT_INITIAL_CROP_ZOOM };
}

/**
 * Convert crop area + fixed frame (container) to pixel crop on oriented image.
 *
 * Matches sheet-style preview: image covers the frame at zoom=1 via
 * `cover = max(frameW/mediaW, frameH/mediaH)`, then pan offsets apply.
 */
export function computePixelCrop(
  mediaWidth: number,
  mediaHeight: number,
  crop: CropArea,
  aspectRatio: number | null,
  containerWidth: number,
  containerHeight: number,
  options: CropComputeOptions = {}
): PixelCrop {
  const { cropOutsideImage = false } = options;
  const zoom = cropOutsideImage ? Math.max(0.25, crop.zoom) : Math.max(1, crop.zoom);

  const fw = Math.max(1, containerWidth);
  const fh = Math.max(1, containerHeight);

  // Prefer explicit frame size from the UI; fall back to aspect heuristics
  let frameW = fw;
  let frameH = fh;
  if (aspectRatio && aspectRatio > 0) {
    const frameAspect = fw / fh;
    if (Math.abs(frameAspect - aspectRatio) > 0.02) {
      if (fw / fh > aspectRatio) {
        frameH = fh;
        frameW = frameH * aspectRatio;
      } else {
        frameW = fw;
        frameH = frameW / aspectRatio;
      }
    }
  }

  const cover = Math.max(frameW / Math.max(mediaWidth, 1), frameH / Math.max(mediaHeight, 1));
  const scale = cover * zoom;

  let cropWidth = frameW / scale;
  let cropHeight = frameH / scale;

  if (!cropOutsideImage) {
    cropWidth = Math.min(cropWidth, mediaWidth);
    cropHeight = Math.min(cropHeight, mediaHeight);
  }

  const x = mediaWidth / 2 - crop.x - cropWidth / 2;
  const y = mediaHeight / 2 - crop.y - cropHeight / 2;

  if (cropOutsideImage) {
    return { x, y, width: cropWidth, height: cropHeight };
  }

  return {
    x: clamp(x, 0, Math.max(0, mediaWidth - cropWidth)),
    y: clamp(y, 0, Math.max(0, mediaHeight - cropHeight)),
    width: cropWidth,
    height: cropHeight,
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function rotateCropArea(crop: CropArea, _from: number, _to: number): CropArea {
  return { ...crop, x: -crop.y, y: crop.x };
}
