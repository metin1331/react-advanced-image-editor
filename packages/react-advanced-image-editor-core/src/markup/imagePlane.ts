import type { CropArea, TransformState } from '../types';
import { renderMarkup } from './renderMarkup';
import type { MarkupObject, MarkupShape, MarkupState } from './types';
import {
  applyMat3,
  drawPerspectiveImage,
  hasPerspective,
  perspectiveCssTransform,
  perspectiveHomography,
  perspectiveQuad,
  type Mat3,
} from '../transform/perspective';

/**
 * The photo's on-screen box before CSS rotation, in crop-frame pixels.
 * Markup coordinates live in this box (0…1), so they rotate and flip with the photo.
 */
export type MarkupPlane = {
  frameW: number;
  frameH: number;
  imgW: number;
  imgH: number;
  /** Image center in crop-frame pixels. */
  cx: number;
  cy: number;
  angleDeg: number;
  flipX: boolean;
  flipY: boolean;
  perspectiveX: number;
  perspectiveY: number;
};

export function markupPlaneFromCrop(
  frameW: number,
  frameH: number,
  mediaW: number,
  mediaH: number,
  crop: CropArea,
  transform: TransformState,
  cropOutsideImage = false
): MarkupPlane {
  const fw = Math.max(1, frameW);
  const fh = Math.max(1, frameH);
  const zoom = cropOutsideImage ? Math.max(0.25, crop.zoom) : Math.max(1, crop.zoom);
  const cover = Math.max(fw / Math.max(mediaW, 1), fh / Math.max(mediaH, 1));
  const scale = cover * zoom;
  return {
    frameW: fw,
    frameH: fh,
    imgW: Math.max(1, mediaW * scale),
    imgH: Math.max(1, mediaH * scale),
    cx: fw / 2 + crop.x * scale,
    cy: fh / 2 + crop.y * scale,
    angleDeg: (transform.angle ?? 0) + transform.rotation,
    flipX: Boolean(transform.flipX),
    flipY: Boolean(transform.flipY),
    perspectiveX: transform.perspectiveX ?? 0,
    perspectiveY: transform.perspectiveY ?? 0,
  };
}

/** Same CSS transform the photo element uses, origin at the box center. */
export function markupPlaneTransform(
  plane: Pick<MarkupPlane, 'angleDeg' | 'flipX' | 'flipY' | 'perspectiveX' | 'perspectiveY' | 'imgW' | 'imgH'>
): string {
  const perspective = perspectiveCssTransform(
    plane.imgW,
    plane.imgH,
    plane.perspectiveX,
    plane.perspectiveY
  );
  return [
    `rotate(${plane.angleDeg}deg)`,
    perspective ?? '',
    plane.flipX ? 'scaleX(-1)' : '',
    plane.flipY ? 'scaleY(-1)' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function invertMat3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const inv = 1 / det;
  return [
    A * inv,
    (c * h - b * i) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    (c * d - a * f) * inv,
    C * inv,
    (b * g - a * h) * inv,
    (a * e - b * d) * inv,
  ];
}

/**
 * Pointer in the photo-box element → 0…1 in that box, undoing CSS rotation,
 * perspective, and flip. `el` is the transformed box.
 */
export function pointerToImagePoint(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  plane: Pick<MarkupPlane, 'angleDeg' | 'flipX' | 'flipY' | 'perspectiveX' | 'perspectiveY'>
): { x: number; y: number } {
  const parent = el.offsetParent as HTMLElement | null;
  const w = Math.max(1, el.clientWidth);
  const h = Math.max(1, el.clientHeight);
  let px: number;
  let py: number;
  if (parent) {
    const prect = parent.getBoundingClientRect();
    px = ((clientX - prect.left) / Math.max(1, prect.width)) * Math.max(1, parent.clientWidth);
    py = ((clientY - prect.top) / Math.max(1, prect.height)) * Math.max(1, parent.clientHeight);
  } else {
    const rect = el.getBoundingClientRect();
    px = ((clientX - rect.left) / Math.max(1, rect.width)) * w;
    py = ((clientY - rect.top) / Math.max(1, rect.height)) * h;
  }
  let x = px - (el.offsetLeft + w / 2);
  let y = py - (el.offsetTop + h / 2);
  const rad = (-plane.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  x = rx;
  y = ry;
  if (hasPerspective(plane.perspectiveX, plane.perspectiveY)) {
    const H = perspectiveHomography(w, h, plane.perspectiveX, plane.perspectiveY);
    const p = applyMat3(invertMat3(H), x + w / 2, y + h / 2);
    x = p.x - w / 2;
    y = p.y - h / 2;
  }
  if (plane.flipX) x = -x;
  if (plane.flipY) y = -y;
  return {
    x: Math.min(1, Math.max(0, x / w + 0.5)),
    y: Math.min(1, Math.max(0, y / h + 0.5)),
  };
}

/** Crop-frame normalized point → photo-box normalized point. */
export function framePointToImage(
  nx: number,
  ny: number,
  plane: MarkupPlane
): { x: number; y: number } {
  let x = nx * plane.frameW - plane.cx;
  let y = ny * plane.frameH - plane.cy;
  const rad = (-plane.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  x = rx;
  y = ry;
  if (hasPerspective(plane.perspectiveX, plane.perspectiveY)) {
    const H = perspectiveHomography(
      plane.imgW,
      plane.imgH,
      plane.perspectiveX,
      plane.perspectiveY
    );
    const p = applyMat3(invertMat3(H), x + plane.imgW / 2, y + plane.imgH / 2);
    x = p.x - plane.imgW / 2;
    y = p.y - plane.imgH / 2;
  }
  if (plane.flipX) x = -x;
  if (plane.flipY) y = -y;
  return { x: x / plane.imgW + 0.5, y: y / plane.imgH + 0.5 };
}

/** Photo-box normalized point → crop-frame normalized point. Inverse of `framePointToImage`. */
export function imagePointToFrame(
  nx: number,
  ny: number,
  plane: MarkupPlane
): { x: number; y: number } {
  let x = (nx - 0.5) * plane.imgW;
  let y = (ny - 0.5) * plane.imgH;
  if (plane.flipX) x = -x;
  if (plane.flipY) y = -y;
  if (hasPerspective(plane.perspectiveX, plane.perspectiveY)) {
    const H = perspectiveHomography(
      plane.imgW,
      plane.imgH,
      plane.perspectiveX,
      plane.perspectiveY
    );
    const p = applyMat3(H, x + plane.imgW / 2, y + plane.imgH / 2);
    x = p.x - plane.imgW / 2;
    y = p.y - plane.imgH / 2;
  }
  const rad = (plane.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  return {
    x: (rx + plane.cx) / plane.frameW,
    y: (ry + plane.cy) / plane.frameH,
  };
}

function frameRotationFromImage(imageDeg: number, plane: MarkupPlane) {
  return mirrorAngle(imageDeg, plane) + plane.angleDeg;
}

/** Move a photo-stuck shape onto the crop frame without changing where it sits on screen. */
export function stickShapeToFrame(shape: MarkupShape, plane: MarkupPlane): MarkupShape {
  if (shape.stick === 'frame') return shape;
  if (shape.shape === 'line' || shape.shape === 'arrow') {
    const a = imagePointToFrame(shape.x, shape.y, plane);
    const b = imagePointToFrame(
      shape.x2 ?? shape.x + shape.w,
      shape.y2 ?? shape.y + shape.h,
      plane
    );
    const bend =
      shape.cx != null && shape.cy != null
        ? imagePointToFrame(shape.cx, shape.cy, plane)
        : null;
    return {
      ...shape,
      stick: 'frame',
      x: a.x,
      y: a.y,
      x2: b.x,
      y2: b.y,
      w: b.x - a.x,
      h: b.y - a.y,
      ...(bend ? { cx: bend.x, cy: bend.y } : {}),
      rotation: frameRotationFromImage(shape.rotation || 0, plane),
    };
  }
  const center = imagePointToFrame(shape.x + shape.w / 2, shape.y + shape.h / 2, plane);
  const w = (shape.w * plane.imgW) / plane.frameW;
  const h = (shape.h * plane.imgH) / plane.frameH;
  return {
    ...shape,
    stick: 'frame',
    x: center.x - w / 2,
    y: center.y - h / 2,
    w,
    h,
    rotation: frameRotationFromImage(shape.rotation || 0, plane),
  };
}

/** Move a frame-stuck shape back onto the photo, keeping its current screen position. */
export function stickShapeToPhoto(shape: MarkupShape, plane: MarkupPlane): MarkupShape {
  if (shape.stick !== 'frame') {
    const { stick: _stick, ...rest } = shape;
    return rest;
  }
  const shortScale =
    Math.min(plane.frameW, plane.frameH) / Math.max(1, Math.min(plane.imgW, plane.imgH));
  const migrated = migrateObject({ ...shape }, plane, shortScale);
  if (migrated.kind !== 'shape') return shape;
  const { stick: _stick, ...rest } = migrated;
  return rest;
}

function mirrorAngle(deg: number, plane: MarkupPlane) {
  return plane.flipX !== plane.flipY ? -deg : deg;
}

/**
 * Older markup was stored on the crop frame. Rewrite it onto the photo box
 * so the current view does not jump, then later transforms carry it along.
 */
export function migrateFrameMarkupToImage(markup: MarkupState, plane: MarkupPlane): MarkupState {
  if (markup.space === 'image') return markup;
  const shortScale =
    Math.min(plane.frameW, plane.frameH) / Math.max(1, Math.min(plane.imgW, plane.imgH));
  const objects = markup.objects.map((obj) => migrateObject(obj, plane, shortScale));
  return { objects, space: 'image' };
}

function migrateObject(obj: MarkupObject, plane: MarkupPlane, shortScale: number): MarkupObject {
  if (obj.kind === 'stroke') {
    return {
      ...obj,
      width: obj.width * shortScale,
      points: obj.points.map((p) => ({ ...p, ...framePointToImage(p.x, p.y, plane) })),
    };
  }
  if (obj.kind === 'text') {
    const p = framePointToImage(obj.x, obj.y, plane);
    return {
      ...obj,
      x: p.x,
      y: p.y,
      w: (obj.w * plane.frameW) / plane.imgW,
      fontSize: obj.fontSize * shortScale,
    };
  }
  if (obj.kind === 'loupe') {
    const p = framePointToImage(obj.x, obj.y, plane);
    return { ...obj, x: p.x, y: p.y, radius: obj.radius * shortScale };
  }
  if (obj.kind === 'shape' && (obj.shape === 'line' || obj.shape === 'arrow')) {
    const a = framePointToImage(obj.x, obj.y, plane);
    const b = framePointToImage(obj.x2 ?? obj.x + obj.w, obj.y2 ?? obj.y + obj.h, plane);
    const bend =
      obj.cx != null && obj.cy != null ? framePointToImage(obj.cx, obj.cy, plane) : null;
    return {
      ...obj,
      x: a.x,
      y: a.y,
      x2: b.x,
      y2: b.y,
      w: b.x - a.x,
      h: b.y - a.y,
      ...(bend ? { cx: bend.x, cy: bend.y } : {}),
      rotation: mirrorAngle(obj.rotation - plane.angleDeg, plane),
    };
  }
  if (obj.kind === 'shape' || obj.kind === 'sticker' || obj.kind === 'signature') {
    const center = framePointToImage(obj.x + obj.w / 2, obj.y + obj.h / 2, plane);
    const w = (obj.w * plane.frameW) / plane.imgW;
    const h = (obj.h * plane.frameH) / plane.imgH;
    const rotation =
      obj.kind === 'signature'
        ? undefined
        : mirrorAngle((obj.rotation || 0) - plane.angleDeg, plane);
    return {
      ...obj,
      x: center.x - w / 2,
      y: center.y - h / 2,
      w,
      h,
      ...(rotation != null ? { rotation } : {}),
    };
  }
  return obj;
}

/** Draw photo-space markup into a crop-frame context, matching the on-screen photo transform. */
export function paintMarkupInPlane(
  ctx: CanvasRenderingContext2D,
  markup: MarkupState,
  plane: MarkupPlane,
  pixelScale: number
) {
  const s = pixelScale > 0 ? pixelScale : 1;
  ctx.save();
  ctx.translate(plane.cx * s, plane.cy * s);
  if (plane.angleDeg) ctx.rotate((plane.angleDeg * Math.PI) / 180);
  const pw = Math.max(1, plane.imgW * s);
  const ph = Math.max(1, plane.imgH * s);
  if (hasPerspective(plane.perspectiveX, plane.perspectiveY)) {
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(pw));
    off.height = Math.max(1, Math.round(ph));
    const octx = off.getContext('2d');
    if (octx) {
      octx.translate(off.width / 2, off.height / 2);
      if (plane.flipX) octx.scale(-1, 1);
      if (plane.flipY) octx.scale(1, -1);
      octx.translate(-off.width / 2, -off.height / 2);
      renderMarkup(octx, markup, off.width, off.height);
      const quad = perspectiveQuad(plane.perspectiveX, plane.perspectiveY);
      const dest = quad.map((p) => ({ x: p.x * pw, y: p.y * ph })) as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ];
      drawPerspectiveImage(ctx, off, off.width, off.height, dest);
    }
  } else {
    if (plane.flipX) ctx.scale(-1, 1);
    if (plane.flipY) ctx.scale(1, -1);
    ctx.translate(-pw / 2, -ph / 2);
    renderMarkup(ctx, markup, pw, ph);
  }
  ctx.restore();
}
