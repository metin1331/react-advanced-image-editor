import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  finalizeSignatureTemplate,
  strokeSignaturePath,
  type MarkupPoint,
  type MarkupSignaturePath,
  type MarkupSignatureTemplate,
} from 'react-advanced-image-editor-core';
import {
  SHEET_MOTION_EASE,
  SHEET_MOTION_MS,
  sheetMotionDurationMs,
} from '../crop/sheetMotion';

type Props = {
  open: boolean;
  color: string;
  template: MarkupSignatureTemplate | null;
  title?: string;
  closeLabel?: string;
  doneLabel?: string;
  onChange: (template: MarkupSignatureTemplate | null) => void;
  onClose: () => void;
  onDone: () => void;
};

function eventPoint(canvas: HTMLCanvasElement, e: PointerEvent): MarkupPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height))),
  };
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.1 2.1 9.9 9.9M9.9 2.1 2.1 9.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="ie-topbar-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Slide-up signature sheet. Same motion and surface as the color picker. */
export function MarkupSignaturePad({
  open,
  color,
  template,
  title = 'Signature',
  closeLabel = 'Close',
  doneLabel = 'Done',
  onChange,
  onClose,
  onDone,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  /** Raw pad-space paths (full pad 0…1) while drawing. */
  const rawPathsRef = useRef<MarkupSignaturePath[]>([]);
  const liveRef = useRef<MarkupSignaturePath | null>(null);
  const drawing = useRef(false);
  const [ink, setInk] = useState(Boolean(template?.paths.length));
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
  }, [open]);

  useEffect(() => {
    if (open || !mounted) return;
    const t = window.setTimeout(() => setMounted(false), sheetMotionDurationMs());
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  const publish = useCallback(() => {
    const canvas = canvasRef.current;
    const cssW = canvas?.clientWidth || 280;
    const cssH = canvas?.clientHeight || 180;
    const padAspect = cssW / Math.max(1, cssH);
    const next = finalizeSignatureTemplate(rawPathsRef.current, padAspect);
    onChange(next);
    setInk(Boolean(next?.paths.length));
  }, [onChange]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 280;
    const cssH = canvas.clientHeight || 180;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(28, 28, 30, 0.16)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.72);
    ctx.lineTo(w * 0.92, h * 0.72);
    ctx.stroke();

    const drawRaw = (path: MarkupSignaturePath) => {
      strokeSignaturePath(ctx, path, 0, 0, w, h, color);
    };
    for (const p of rawPathsRef.current) drawRaw(p);
    if (liveRef.current) drawRaw(liveRef.current);
  }, [color]);

  useEffect(() => {
    if (!template) {
      rawPathsRef.current = [];
      setInk(false);
    } else {
      setInk(template.paths.length > 0);
    }
    paint();
  }, [template, paint]);

  useEffect(() => {
    if (!mounted) return;
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
  }, [mounted, paint, publish]);

  if (!mounted) return null;

  return (
    <div
      ref={overlayRef}
      className="ie-color-picker-overlay ie-markup-signature-overlay"
      data-ie-part="markup-signature-overlay"
      data-ie-open={shown ? 'true' : 'false'}
      style={
        {
          '--ie-sheet-duration': `${SHEET_MOTION_MS}ms`,
          '--ie-sheet-ease': SHEET_MOTION_EASE,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className="ie-color-picker-backdrop"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        className="ie-color-picker-sheet ie-markup-signature-sheet"
        data-ie-part="markup-signature-pad"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ie-color-picker-header">
          <button
            type="button"
            className="ie-color-picker-close ie-markup-signature-close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
          <h2 className="ie-color-picker-title">{title}</h2>
          <button
            type="button"
            data-ie-part="done-button"
            className="ie-markup-signature-done"
            aria-label={doneLabel}
            disabled={!ink}
            onClick={() => {
              if (rawPathsRef.current.length) publish();
              if (!ink && rawPathsRef.current.length === 0) return;
              onDone();
            }}
          >
            <CheckIcon />
          </button>
        </header>
        <canvas className="ie-markup-signature-canvas" ref={canvasRef} aria-label={title} />
      </div>
    </div>
  );
}
