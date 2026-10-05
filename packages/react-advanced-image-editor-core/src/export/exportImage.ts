import type { CropArea, EditorState, ExportOptions, FillState, LoadedImage, TransformState } from '../types';
import { applyAdjustments, createDefaultAdjust, hasAdjustments } from '../adjust/adjustments';
import { getExportAdjustRenderer } from '../adjust/webglAdjust';
import { createDefaultFilter, hasFilter } from '../filter/filterLooks';
import { buildBlurFillSource, paintFillBackground } from '../fill/applyFill';
import { createDefaultFill, hasFill } from '../fill/fillState';
import { applyFrame } from '../frame/applyFrame';
import { createDefaultFrame, hasFrame } from '../frame/frameState';
import { createDefaultMarkup, hasMarkup } from '../markup/types';
import { renderMarkup } from '../markup/renderMarkup';
import { preloadMarkupStickers } from '../markup/stickerEmoji';
import { applyRedact } from '../redact/applyRedact';
import { createDefaultRedact, hasRedact } from '../redact/redactState';
import { computePixelCrop } from '../crop/cropMath';
import { applyExifTransform } from '../load/exifOrientation';
import { clampCanvasSize, getMaxWorkingEdge } from '../load/imageLimits';
import { getTransformedSize } from '../transform/drawOriented';
import {
  drawPerspectiveImage,
  hasPerspective,
  perspectiveQuad,
  type Point,
} from '../transform/perspective';

/**
 * Render the visible crop frame to a canvas, matching the live preview model:
 * fixed frame, image translated/scaled/rotated underneath.
 *
 * `containerWidth` / `containerHeight` must be the crop **frame** size in CSS pixels
 * (same values used by CropViewport), not the full viewport.
 */
export function renderToCanvas(
  image: LoadedImage,
  crop: CropArea,
  transform: TransformState,
  _aspectRatio: number | null,
  containerWidth: number,
  containerHeight: number,
  cropOutsideImage = false,
  outputWidth?: number,
  outputHeight?: number,
  fill?: FillState
): HTMLCanvasElement {
  const angle = transform.angle ?? 0;
  const { width: mediaW, height: mediaH } = getTransformedSize(
    image.width,
    image.height,
    image.orientation,
    transform.rotation
  );

  const fw = Math.max(1, containerWidth);
  const fh = Math.max(1, containerHeight);
  const zoom = cropOutsideImage ? Math.max(0.25, crop.zoom) : Math.max(1, crop.zoom);
  const cover = Math.max(fw / Math.max(mediaW, 1), fh / Math.max(mediaH, 1));
  const scale = cover * zoom;

  const rawOutW = outputWidth ?? fw;
  const rawOutH = outputHeight ?? fh;
  const clampedOut = clampCanvasSize(rawOutW, rawOutH, getMaxWorkingEdge());
  const outW = clampedOut.width;
  const outH = clampedOut.height;

  // Never rasterize the full phone-camera bitmap. Size the oriented buffer to
  // what the output will actually sample (and cap for mobile Safari).
  const destW = mediaW * scale * (outW / fw);
  const destH = mediaH * scale * (outH / fh);
  const orientedSize = clampCanvasSize(
    Math.min(mediaW, Math.max(1, destW)),
    Math.min(mediaH, Math.max(1, destH)),
    getMaxWorkingEdge()
  );

  const oriented = document.createElement('canvas');
  oriented.width = orientedSize.width;
  oriented.height = orientedSize.height;
  const octx = oriented.getContext('2d');
  if (!octx) throw new Error('Canvas not supported');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  drawOrientedOnly(octx, image, transform);

  const pxScale = outW / fw;

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(outW));
  out.height = Math.max(1, Math.round(outH));
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const fillState = fill ?? createDefaultFill();
  if (hasFill(fillState)) {
    const blurSource =
      fillState.mode === 'edge-blur' ? buildBlurFillSource(oriented) : null;
    paintFillBackground(ctx, out.width, out.height, fillState, blurSource);
  } else if (cropOutsideImage) {
    ctx.fillStyle = '#00000000';
    ctx.clearRect(0, 0, out.width, out.height);
  }

  ctx.save();
  ctx.scale(pxScale, pxScale);

  // Frame-centered composition identical to CropViewport preview
  ctx.translate(fw / 2 + crop.x * scale, fh / 2 + crop.y * scale);
  if (angle) ctx.rotate((angle * Math.PI) / 180);

  const displayW = mediaW * scale;
  const displayH = mediaH * scale;

  if (hasPerspective(transform.perspectiveX, transform.perspectiveY)) {
    // Same homography the preview feeds to CSS matrix3d, sampled onto canvas.
    const quad = perspectiveQuad(transform.perspectiveX, transform.perspectiveY);
    const dest = quad.map((p) => ({
      x: p.x * displayW,
      y: p.y * displayH,
    })) as [Point, Point, Point, Point];
    drawPerspectiveImage(ctx, oriented, oriented.width, oriented.height, dest);
  } else {
    ctx.drawImage(oriented, -displayW / 2, -displayH / 2, displayW, displayH);
  }
  ctx.restore();

  return out;
}

function drawOrientedOnly(
  ctx: CanvasRenderingContext2D,
  image: LoadedImage,
  transform: TransformState
) {
  const { rotation, flipX, flipY } = transform;
  const rot = ((rotation % 360) + 360) % 360;
  const naturalWidth = image.width;
  const naturalHeight = image.height;
  const orientation = image.orientation;
  const { width: mediaW, height: mediaH } = getTransformedSize(
    naturalWidth,
    naturalHeight,
    orientation,
    transform.rotation
  );
  const sx = ctx.canvas.width / Math.max(1, mediaW);
  const sy = ctx.canvas.height / Math.max(1, mediaH);

  ctx.save();
  ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
  if (flipX) ctx.scale(-1, 1);
  if (flipY) ctx.scale(1, -1);
  if (rot === 90) ctx.rotate(Math.PI / 2);
  else if (rot === 180) ctx.rotate(Math.PI);
  else if (rot === 270) ctx.rotate(-Math.PI / 2);
  ctx.scale(sx, sy);
  ctx.translate(-naturalWidth / 2, -naturalHeight / 2);
  applyExifTransform(ctx, naturalWidth, naturalHeight, orientation);
  ctx.drawImage(image.element, 0, 0, naturalWidth, naturalHeight);
  ctx.restore();
}

export async function exportImage(
  state: EditorState,
  aspectRatio: number | null,
  containerWidth: number,
  containerHeight: number,
  options: ExportOptions = {}
): Promise<Blob> {
  const {
    format = 'image/jpeg',
    quality = 0.92,
    maxWidth,
    maxHeight,
    cropOutsideImage = false,
  } = options;

  const { width: mediaW, height: mediaH } = getTransformedSize(
    state.image.width,
    state.image.height,
    state.image.orientation,
    state.transform.rotation
  );
  const pixelCrop = computePixelCrop(
    mediaW,
    mediaH,
    state.crop,
    aspectRatio,
    containerWidth,
    containerHeight,
    { cropOutsideImage }
  );
  const outputWidth = Math.max(1, Math.round(pixelCrop.width));
  const outputHeight = Math.max(1, Math.round(pixelCrop.height));

  // Crop + geometry first — adjustments never touch the original source.
  let canvas = renderToCanvas(
    state.image,
    state.crop,
    state.transform,
    aspectRatio,
    containerWidth,
    containerHeight,
    cropOutsideImage,
    outputWidth,
    outputHeight,
    state.fill ?? createDefaultFill()
  );

  const adjust = state.adjust ?? createDefaultAdjust();
  const filter = state.filter ?? createDefaultFilter();
  if (hasAdjustments(adjust) || hasFilter(filter)) {
    // Prefer the same WebGL shader used for live preview; CPU mirrors it.
    const gl = getExportAdjustRenderer();
    if (gl?.isSupported) {
      canvas = gl.renderToCanvas2D(canvas, adjust, filter);
    } else {
      canvas = applyAdjustments(canvas, adjust, filter);
    }
  }

  const redact = state.redact ?? createDefaultRedact();
  if (hasRedact(redact)) {
    canvas = applyRedact(canvas, redact);
  }

  const markup = state.markup ?? createDefaultMarkup();
  if (hasMarkup(markup)) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Twemoji stickers must be cached before bake so export matches preview.
      await preloadMarkupStickers(markup);
      // renderToCanvas leaves a frame-space transform on this context; reset
      // so markup's normalized 0…1 coords map to output pixels.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      renderMarkup(ctx, markup, canvas.width, canvas.height);
      ctx.restore();
    }
  }

  const frame = state.frame ?? createDefaultFrame();
  if (hasFrame(frame)) {
    canvas = applyFrame(canvas, frame);
  }

  if (maxWidth || maxHeight) {
    canvas = scaleCanvas(canvas, maxWidth, maxHeight);
  }

  return canvasToBlob(canvas, format, quality);
}

function fitDimensions(
  width: number,
  height: number,
  maxWidth?: number,
  maxHeight?: number
): { width: number; height: number } {
  let w = width;
  let h = height;
  if (maxWidth && w > maxWidth) {
    h = (h * maxWidth) / w;
    w = maxWidth;
  }
  if (maxHeight && h > maxHeight) {
    w = (w * maxHeight) / h;
    h = maxHeight;
  }
  return { width: w, height: h };
}

function scaleCanvas(
  source: HTMLCanvasElement,
  maxWidth?: number,
  maxHeight?: number
): HTMLCanvasElement {
  const { width, height } = fitDimensions(source.width, source.height, maxWidth, maxHeight);
  if (width === source.width && height === source.height) return source;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Downscale an exported blob for upload limits while keeping full-res for download. */
export async function downscaleBlob(
  blob: Blob,
  maxWidth?: number,
  maxHeight?: number,
  quality = 0.92
): Promise<Blob> {
  if (!maxWidth && !maxHeight) return blob;

  const bitmap = await createImageBitmap(blob);
  const { width, height } = fitDimensions(bitmap.width, bitmap.height, maxWidth, maxHeight);
  if (width === bitmap.width && height === bitmap.height) {
    bitmap.close();
    return blob;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return blob;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToBlob(canvas, blob.type || 'image/jpeg', quality);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      format,
      quality
    );
  });
}
