import { useEffect, useRef, useState } from 'react';
import {
  computePixelCrop,
  getTransformedSize,
  hasAdjustments,
  hasFilter,
  WebGLAdjustRenderer,
  applyAdjustments,
  getMaxPreviewEdge,
  type AdjustState,
  type CropArea,
  type FilterState,
  type LoadedImage,
  type TransformState,
  renderToCanvas,
} from 'react-advanced-image-editor-core';

type Props = {
  /** When false the layer stays idle (crop tool with no grading). */
  enabled: boolean;
  /**
   * Show the cropped composition even when every adjust channel is 0.
   * Used by Calibrate / Filter so the faded source is never visible underneath
   * an empty grade. Bake size is capped to the screen (iOS cannot hold a
   * native-resolution texture of a 12–48MP photo).
   */
  forceVisible?: boolean;
  image: LoadedImage | null;
  crop: CropArea;
  transform: TransformState;
  adjust: AdjustState;
  /**
   * Filter look. Rides the same shader pass as `adjust`, so switching filters
   * or dragging intensity is a uniform update — the crop texture is not rebaked.
   */
  filter?: FilterState;
  frame: { left: number; top: number; width: number; height: number };
  aspectRatio: number | null;
  cropOutsideImage?: boolean;
};

/**
 * Resolve the pixel size of the bake.
 *
 * - Crop-tool grade preview: CSS frame size (cheap, matches on-screen pixels).
 * - Calibrate / forceVisible: source crop size (same math as export), so zooming
 *   into the graded frame stays sharp up to native resolution.
 */
function resolveBakeSize(
  image: LoadedImage,
  crop: CropArea,
  transform: TransformState,
  aspectRatio: number | null,
  frameW: number,
  frameH: number,
  cropOutsideImage: boolean,
  hires: boolean
) {
  if (!hires) {
    return { width: frameW, height: frameH };
  }

  const { width: mediaW, height: mediaH } = getTransformedSize(
    image.width,
    image.height,
    image.orientation,
    transform.rotation
  );
  const pixelCrop = computePixelCrop(
    mediaW,
    mediaH,
    crop,
    aspectRatio,
    frameW,
    frameH,
    { cropOutsideImage }
  );

  let width = Math.max(1, Math.round(pixelCrop.width));
  let height = Math.max(1, Math.round(pixelCrop.height));
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 2;
  const screenCap = Math.max(frameW, frameH) * dpr;
  const maxEdge = Math.max(Math.max(frameW, frameH), Math.min(getMaxPreviewEdge(), screenCap));
  const long = Math.max(width, height);
  if (long > maxEdge) {
    const s = maxEdge / long;
    width = Math.max(1, Math.round(width * s));
    height = Math.max(1, Math.round(height * s));
  }

  if (width < frameW || height < frameH) {
    return { width: frameW, height: frameH };
  }

  return { width, height };
}

/**
 * GPU adjust preview: grades the **cropped** frame via WebGL.
 *
 * - Crop/transform changes → re-bake geometry into the GL texture.
 * - Adjust slider drags → uniforms + draw only (no readback, no CSS filters).
 * - Always starts from the current crop composition + adjust state (non-destructive).
 * - Falls back to a CPU canvas that mirrors the shader if WebGL is missing.
 */
export function AdjustGlLayer({
  enabled,
  forceVisible = false,
  image,
  crop,
  transform,
  adjust,
  filter,
  frame,
  aspectRatio,
  cropOutsideImage = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLAdjustRenderer | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const baseKeyRef = useRef('');
  /** Geometry key last uploaded to the GL texture (may lag baseKey on init). */
  const texKeyRef = useRef('');
  const bakeSizeRef = useRef({ width: 1, height: 1 });
  const [ready, setReady] = useState(false);
  const [useCpu, setUseCpu] = useState(false);
  const [bakeSize, setBakeSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onLost = (e: Event) => {
      e.preventDefault();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setUseCpu(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    try {
      const r = new WebGLAdjustRenderer(canvas);
      if (!r.isSupported) {
        r.dispose();
        setUseCpu(true);
        setReady(true);
        return;
      }
      rendererRef.current = r;
      setUseCpu(false);
      setReady(true);
    } catch {
      rendererRef.current = null;
      setUseCpu(true);
      setReady(true);
    }
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !image || !ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fw = Math.max(1, Math.round(frame.width));
    const fh = Math.max(1, Math.round(frame.height));
    let bake = resolveBakeSize(
      image,
      crop,
      transform,
      aspectRatio,
      fw,
      fh,
      cropOutsideImage,
      forceVisible && !useCpu
    );
    bakeSizeRef.current = bake;
    if (bake.width !== bakeSize.width || bake.height !== bakeSize.height) {
      setBakeSize(bake);
    }

    const key = [
      image.element.src,
      fw,
      fh,
      bake.width,
      bake.height,
      forceVisible ? 1 : 0,
      crop.x.toFixed(4),
      crop.y.toFixed(4),
      crop.zoom.toFixed(5),
      transform.rotation,
      (transform.angle ?? 0).toFixed(4),
      transform.flipX ? 1 : 0,
      transform.flipY ? 1 : 0,
      (transform.perspectiveX ?? 0).toFixed(4),
      (transform.perspectiveY ?? 0).toFixed(4),
      cropOutsideImage ? 1 : 0,
    ].join('|');

    let geometryChanged = false;
    if (key !== baseKeyRef.current || !baseRef.current) {
      try {
        baseRef.current = renderToCanvas(
          image,
          crop,
          transform,
          aspectRatio,
          fw,
          fh,
          cropOutsideImage,
          bake.width,
          bake.height
        );
        baseKeyRef.current = key;
        geometryChanged = true;
      } catch {
        try {
          bake = { width: fw, height: fh };
          bakeSizeRef.current = bake;
          baseRef.current = renderToCanvas(
            image,
            crop,
            transform,
            aspectRatio,
            fw,
            fh,
            cropOutsideImage,
            fw,
            fh
          );
          baseKeyRef.current = key;
          geometryChanged = true;
        } catch {
          return;
        }
      }
    }

    const base = baseRef.current;
    if (!base) return;

    canvas.dataset.ieNativeScale = String(bake.width / Math.max(1, fw));
    canvas.dataset.ieHires =
      bake.width > fw + 1 || bake.height > fh + 1 ? 'true' : 'false';

    if (!useCpu && rendererRef.current) {
      try {
        if (geometryChanged || texKeyRef.current !== key) {
          rendererRef.current.setSource(base, bake.width, bake.height);
          texKeyRef.current = key;
        }
        rendererRef.current.draw(adjust, filter);
        return;
      } catch {
        rendererRef.current.dispose();
        rendererRef.current = null;
        setUseCpu(true);
      }
    }

    try {
      if (canvas.width !== bake.width) canvas.width = bake.width;
      if (canvas.height !== bake.height) canvas.height = bake.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, bake.width, bake.height);
      ctx.drawImage(base, 0, 0);
      applyAdjustments(canvas, adjust, filter);
    } catch {
      /* iOS may kill the canvas; leave the previous frame. */
    }
  }, [
    enabled,
    ready,
    useCpu,
    image,
    crop,
    transform,
    adjust,
    filter,
    frame.width,
    frame.height,
    aspectRatio,
    cropOutsideImage,
    forceVisible,
    bakeSize.width,
    bakeSize.height,
  ]);

  const visible =
    enabled && ready && (forceVisible || hasAdjustments(adjust) || hasFilter(filter));

  return (
    <canvas
      ref={canvasRef}
      data-ie-part='adjust-gl'
      data-ie-backend={useCpu ? 'cpu' : 'webgl'}
      data-ie-hires={forceVisible ? 'true' : undefined}
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        display: visible ? 'block' : 'none',
        zIndex: 2,
      }}
    />
  );
}
