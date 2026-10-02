import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  applyAdjustments,
  hasAdjustments,
  hasFilter,
  renderToCanvas,
  type AdjustState,
  type CropArea,
  type FilterState,
  type LoadedImage,
  type TransformState,
} from 'react-advanced-image-editor-core';
import { rgb, toCssColor, type Rgba } from '../color/cssColor';

type Props = {
  active: boolean;
  loadedImage?: LoadedImage | null;
  crop: CropArea;
  transform: TransformState;
  adjust: AdjustState;
  filter?: FilterState;
  aspectRatio: number | null;
  cropOutsideImage?: boolean;
  onPick: (color: string) => void;
  onEnd: () => void;
};

type Sample = { color: string; x: number; y: number; touch: boolean };

const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (scratch) {
  scratch.width = 1;
  scratch.height = 1;
}

function readPixel(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  u: number,
  v: number,
): Rgba | null {
  if (!scratch || sw < 1 || sh < 1) return null;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const x = Math.max(0, Math.min(sw - 1, Math.round(u * (sw - 1))));
  const y = Math.max(0, Math.min(sh - 1, Math.round(v * (sh - 1))));
  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.drawImage(source, x, y, 1, 1, 0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    if (d[3] < 8) return null;
    return rgb(d[0], d[1], d[2], d[3] / 255);
  } catch {
    return null;
  }
}

function uvOf(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const u = (clientX - r.left) / r.width;
  const v = (clientY - r.top) / r.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v };
}

/** In-image color sampler. Closes the Colors sheet so the photo is visible (mobile-safe). */
export function MarkupEyedropLayer({
  active,
  loadedImage,
  crop,
  transform,
  adjust,
  filter,
  aspectRatio,
  cropOutsideImage = false,
  onPick,
  onEnd,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const snapRef = useRef<HTMLCanvasElement | null>(null);
  const pickRef = useRef(onPick);
  const endRef = useRef(onEnd);
  const uvRef = useRef({ u: 0.5, v: 0.5 });
  const pickedRef = useRef(false);
  pickRef.current = onPick;
  endRef.current = onEnd;
  const [sample, setSample] = useState<Sample | null>(null);

  useLayoutEffect(() => {
    if (!active || !loadedImage || !rootRef.current) {
      snapRef.current = null;
      return;
    }
    const w = Math.max(1, Math.round(rootRef.current.clientWidth));
    const h = Math.max(1, Math.round(rootRef.current.clientHeight));
    try {
      const canvas = renderToCanvas(
        loadedImage,
        crop,
        transform,
        aspectRatio,
        w,
        h,
        cropOutsideImage,
      );
      if (hasAdjustments(adjust) || hasFilter(filter)) {
        applyAdjustments(canvas, adjust, filter);
      }
      snapRef.current = canvas;
    } catch {
      snapRef.current = null;
    }
  }, [active, loadedImage, crop, transform, adjust, filter, aspectRatio, cropOutsideImage]);

  useEffect(() => {
    if (!active) setSample(null);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-ie-part="color-eyedrop"], .ie-color-eyedrop-loupe')) {
        return;
      }
      if (t?.closest?.('.ie-markup-toolbar, [data-ie-part="topbar"]')) {
        return;
      }
      endRef.current();
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [active]);

  const paintLoupe = useCallback((u: number, v: number, css: string) => {
    const canvas = loupeRef.current;
    const snap = snapRef.current;
    if (!canvas || !snap) return;
    const size = 88;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mag = 10;
    const src = Math.max(4, snap.width / mag);
    const sx = u * snap.width - src / 2;
    const sy = v * snap.height - src / 2;
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(snap, sx, sy, src, src, 0, 0, size, size);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2 - 7, size / 2);
    ctx.lineTo(size / 2 + 7, size / 2);
    ctx.moveTo(size / 2, size / 2 - 7);
    ctx.lineTo(size / 2, size / 2 + 7);
    ctx.stroke();
  }, []);

  const sampleAt = (clientX: number, clientY: number, touch: boolean) => {
    const root = rootRef.current;
    if (!root) return;
    const uv = uvOf(root, clientX, clientY);
    if (!uv) return;
    const snap = snapRef.current;
    let pixel: Rgba | null = snap
      ? readPixel(snap, snap.width, snap.height, uv.u, uv.v)
      : null;
    if (!pixel) {
      const gl = root
        .closest('[data-ie-part="adjust-view-inner"]')
        ?.querySelector('[data-ie-part="adjust-gl"]') as HTMLCanvasElement | null;
      if (gl && gl.width > 0 && gl.style.display !== 'none') {
        pixel = readPixel(gl, gl.width, gl.height, uv.u, uv.v);
      }
    }
    if (!pixel) return;
    const css = toCssColor({ ...pixel, a: 1 });
    uvRef.current = uv;
    pickedRef.current = true;
    pickRef.current(css);
    setSample({ color: css, x: clientX, y: clientY, touch });
  };

  useLayoutEffect(() => {
    if (!sample) return;
    paintLoupe(uvRef.current.u, uvRef.current.v, sample.color);
  }, [sample, paintLoupe]);

  if (!active) return null;

  const loupe = sample
    ? createPortal(
        <div
          className="ie-color-eyedrop-loupe"
          style={
            {
              left: sample.x,
              top: sample.y,
              ['--ie-eyedrop-color' as string]: sample.color,
              transform: sample.touch
                ? 'translate(-50%, calc(-100% - 28px))'
                : 'translate(-50%, -50%)',
            } as never
          }
          aria-hidden
        >
          <canvas ref={loupeRef} width={88} height={88} />
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        ref={rootRef}
        className="ie-color-eyedrop"
        data-ie-part="color-eyedrop"
        role="application"
        aria-label="Pick a color from the image"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          pickedRef.current = false;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* Safari */
          }
          sampleAt(e.clientX, e.clientY, e.pointerType !== 'mouse');
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          e.preventDefault();
          e.stopPropagation();
          sampleAt(e.clientX, e.clientY, e.pointerType !== 'mouse');
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pickedRef.current) endRef.current();
        }}
        onPointerCancel={() => endRef.current()}
      />
      {loupe}
    </>
  );
}
