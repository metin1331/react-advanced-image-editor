import { useCallback, useEffect, useRef } from 'react';
import {
  finalizeSignatureTemplate,
  strokeSignaturePath,
  type MarkupPoint,
  type MarkupSignaturePath,
  type MarkupSignatureTemplate,
} from 'react-advanced-image-editor-core';

type Props = {
  open: boolean;
  color: string;
  template: MarkupSignatureTemplate | null;
  clearLabel?: string;
  doneLabel?: string;
  onChange: (template: MarkupSignatureTemplate | null) => void;
  onDone: () => void;
};

function eventPoint(canvas: HTMLCanvasElement, e: PointerEvent): MarkupPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height))),
  };
}

/** iOS-style signature capture strip shown above the markup tray. */
export function MarkupSignaturePad({
  open,
  color,
  template,
  clearLabel = 'Clear',
  doneLabel = 'Done',
  onChange,
  onDone,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Raw pad-space paths (full pad 0…1) while drawing. */
  const rawPathsRef = useRef<MarkupSignaturePath[]>([]);
  const liveRef = useRef<MarkupSignaturePath | null>(null);
  const drawing = useRef(false);
  const finalizedRef = useRef<MarkupSignatureTemplate | null>(template);

  const publish = useCallback(() => {
    const canvas = canvasRef.current;
    const cssW = canvas?.clientWidth || 280;
    const cssH = canvas?.clientHeight || 100;
    const padAspect = cssW / Math.max(1, cssH);
    const next = finalizeSignatureTemplate(rawPathsRef.current, padAspect);
    finalizedRef.current = next;
    onChange(next);
  }, [onChange]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 280;
    const cssH = canvas.clientHeight || 100;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Baseline guide
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.72);
    ctx.lineTo(w * 0.92, h * 0.72);
    ctx.stroke();

    // Live drawing uses full-pad coords; same stroke helper as photo stamp.
    const drawRaw = (path: MarkupSignaturePath) => {
      strokeSignaturePath(ctx, path, 0, 0, w, h, color);
    };
    for (const p of rawPathsRef.current) drawRaw(p);
    if (liveRef.current) drawRaw(liveRef.current);
  }, [color]);

  useEffect(() => {
    // External clear
    if (!template) {
      rawPathsRef.current = [];
      finalizedRef.current = null;
    }
    paint();
  }, [template, paint]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing.current = true;
      liveRef.current = {
        width: 0.022,
        points: [eventPoint(canvas, e)],
      };
      paint();
    };
    const onMove = (e: PointerEvent) => {
      if (!drawing.current || !liveRef.current) return;
      liveRef.current.points.push(eventPoint(canvas, e));
      paint();
    };
    const onUp = () => {
      if (!drawing.current) return;
      drawing.current = false;
      if (liveRef.current && liveRef.current.points.length > 1) {
        rawPathsRef.current = [...rawPathsRef.current, liveRef.current];
        publish();
      }
      liveRef.current = null;
      paint();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    const ro = new ResizeObserver(() => paint());
    ro.observe(canvas);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      ro.disconnect();
    };
  }, [open, paint, publish]);

  if (!open) return null;

  const hasInk = rawPathsRef.current.length > 0 || Boolean(template?.paths.length);

  return (
    <div className='ie-markup-signature-pad' data-ie-part='markup-signature-pad'>
      <canvas ref={canvasRef} aria-label='Signature' />
      <div className='ie-markup-signature-actions'>
        <button
          type='button'
          onClick={() => {
            rawPathsRef.current = [];
            liveRef.current = null;
            finalizedRef.current = null;
            onChange(null);
            paint();
          }}
        >
          {clearLabel}
        </button>
        <button
          type='button'
          data-ie-primary='true'
          disabled={!hasInk}
          onClick={() => {
            if (rawPathsRef.current.length) publish();
            onDone();
          }}
        >
          {doneLabel}
        </button>
      </div>
    </div>
  );
}
