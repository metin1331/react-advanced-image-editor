import { useCallback, useEffect, useRef, useState } from 'react';
import {
  boundsFromBrush,
  DEFAULT_REDACT_BRUSH_WIDTH,
  DEFAULT_REDACT_STRENGTH,
  paintRedactPreview,
  type LoadedImage,
  type RedactPoint,
  type RedactRegion,
  type RedactState,
  type RedactStyle,
} from 'react-advanced-image-editor-core';
import { rangeHoldFadeHandlers } from '../crop/pointerHeld';

export type RedactDrawMode = 'rect' | 'brush';

type Props = {
  active: boolean;
  redact: RedactState;
  style: RedactStyle;
  /** When `move`, one-finger pans the view; otherwise draws rect/brush. */
  interactMode?: 'move' | 'draw';
  drawMode?: RedactDrawMode;
  brushWidth?: number;
  strength?: number;
  solidColor?: string;
  /** Crop-frame source for real pixelate/blur preview (already framed). */
  previewSource?: CanvasImageSource | null;
  /** Fallback: bake from loaded media if previewSource missing. */
  loadedImage?: LoadedImage | null;
  /** Calibrate-style CSS view pan/zoom while redact owns the pointer. */
  inspect?: import('./CropViewport').ViewInspectGestures | null;
  onCommit: (next: RedactState) => void;
  onSelectedChange?: (id: string | null) => void;
  selectedId?: string | null;
  onChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onChromeHoldFadeEnd?: () => void;
};

function eventPoint(root: HTMLElement, e: PointerEvent): RedactPoint {
  const r = root.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  };
}

function newId() {
  return `redact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Interpolate dense samples so fast strokes stay continuous. */
function densify(a: RedactPoint, b: RedactPoint, brushWidth: number): RedactPoint[] {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const step = Math.max(0.004, brushWidth * 0.22);
  if (dist <= step) return [b];
  const n = Math.ceil(dist / step);
  const out: RedactPoint[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function rectFromPoints(a: RedactPoint, b: RedactPoint) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(0.001, Math.abs(b.x - a.x)),
    h: Math.max(0.001, Math.abs(b.y - a.y)),
  };
}

function hitRegion(regions: RedactRegion[], pt: RedactPoint): RedactRegion | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) {
      if (r.points.length) {
        const rad = r.brushWidth * 0.55;
        for (const p of r.points) {
          if (Math.hypot(pt.x - p.x, pt.y - p.y) <= rad) return r;
        }
        continue;
      }
      return r;
    }
  }
  return null;
}

export function RedactLayer({
  active,
  redact,
  style,
  interactMode = 'draw',
  drawMode = 'rect',
  brushWidth = DEFAULT_REDACT_BRUSH_WIDTH,
  strength = DEFAULT_REDACT_STRENGTH,
  solidColor = '#1c1c1e',
  previewSource = null,
  loadedImage = null,
  inspect = null,
  onCommit,
  onSelectedChange,
  selectedId = null,
  onChromeHoldFadeBegin,
  onChromeHoldFadeEnd,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const redactRef = useRef(redact);
  const styleRef = useRef(style);
  const drawModeRef = useRef(drawMode);
  const interactRef = useRef(interactMode);
  const brushRef = useRef(brushWidth);
  const strengthRef = useRef(strength);
  const colorRef = useRef(solidColor);
  const inspectRef = useRef(inspect);
  const spaceHeld = useRef(false);
  const inspectMode = useRef<'pan' | 'pinch' | null>(null);
  const pointers = useRef(new Set<number>());
  const clientPos = useRef(new Map<number, { x: number; y: number }>());
  const drawing = useRef(false);
  const livePoints = useRef<RedactPoint[]>([]);
  const liveRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const startPt = useRef<RedactPoint | null>(null);
  const lastPt = useRef<RedactPoint | null>(null);
  const draggingId = useRef<string | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const dragPos = useRef<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [overRect, setOverRect] = useState(false);
  const [liveTick, setLiveTick] = useState(0);
  const rafPaint = useRef<number | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    redactRef.current = redact;
  }, [redact]);
  useEffect(() => {
    styleRef.current = style;
  }, [style]);
  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);
  useEffect(() => {
    interactRef.current = interactMode;
  }, [interactMode]);
  useEffect(() => {
    brushRef.current = brushWidth;
  }, [brushWidth]);
  useEffect(() => {
    strengthRef.current = strength;
  }, [strength]);
  useEffect(() => {
    colorRef.current = solidColor;
  }, [solidColor]);
  useEffect(() => {
    inspectRef.current = inspect;
  }, [inspect]);

  useEffect(() => {
    if (!active) {
      spaceHeld.current = false;
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.('input, textarea, [contenteditable="true"]')) return;
        spaceHeld.current = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    const onBlur = () => {
      spaceHeld.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      spaceHeld.current = false;
    };
  }, [active]);

  const ensureSource = useCallback(() => {
    const root = rootRef.current;
    if (!root) return null;
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    let src = sourceCanvasRef.current;
    if (!src) {
      src = document.createElement('canvas');
      sourceCanvasRef.current = src;
    }
    if (src.width !== w || src.height !== h) {
      src.width = w;
      src.height = h;
    }
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    sctx.clearRect(0, 0, w, h);
    const from = previewSource ?? loadedImage?.element ?? null;
    if (from) {
      try {
        sctx.drawImage(from as CanvasImageSource, 0, 0, w, h);
      } catch {
        /* tainted / not ready */
      }
    }
    return src;
  }, [previewSource, loadedImage]);

  const paint = useCallback(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const src = ensureSource();
    let live: RedactRegion | null = null;
    if (liveRect.current) {
      live = {
        id: '__live__',
        style: styleRef.current,
        color: colorRef.current,
        brushWidth: brushRef.current,
        strength: strengthRef.current,
        points: [],
        ...liveRect.current,
      };
    } else if (livePoints.current.length > 0) {
      live = {
        id: '__live__',
        style: styleRef.current,
        color: colorRef.current,
        brushWidth: brushRef.current,
        strength: strengthRef.current,
        points: livePoints.current,
        ...boundsFromBrush(livePoints.current, brushRef.current),
      };
    }

    const previewRegions = redactRef.current.regions.map((region) =>
      draggingId.current && dragPos.current && region.id === draggingId.current
        ? { ...region, x: dragPos.current.x, y: dragPos.current.y }
        : region,
    );

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (src) {
      paintRedactPreview(ctx, src, { regions: previewRegions }, w, h, live);
    }

    const dragged = draggingId.current
      ? previewRegions.find((region) => region.id === draggingId.current)
      : null;
    const outline = liveRect.current
      ? liveRect.current
      : dragged
        ? dragged
        : selectedId
          ? previewRegions.find((x) => x.id === selectedId)
          : null;
    if (outline) {
      ctx.save();
      ctx.strokeStyle = 'rgba(10,132,255,0.95)';
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash(liveRect.current ? [6 * dpr, 4 * dpr] : [5 * dpr, 4 * dpr]);
      ctx.strokeRect(outline.x * w, outline.y * h, outline.w * w, outline.h * h);
      ctx.restore();
    }
  }, [ensureSource, selectedId]);

  const schedulePaint = useCallback(() => {
    if (rafPaint.current != null) return;
    rafPaint.current = requestAnimationFrame(() => {
      rafPaint.current = null;
      paint();
    });
  }, [paint]);

  useEffect(() => {
    schedulePaint();
  }, [redact, style, drawMode, brushWidth, strength, solidColor, selectedId, liveTick, schedulePaint]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => schedulePaint());
    ro.observe(root);
    return () => ro.disconnect();
  }, [schedulePaint]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !active) return;

    const onPointerDown = (e: PointerEvent) => {
      pointers.current.add(e.pointerId);
      clientPos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2 && inspectRef.current) {
        e.preventDefault();
        e.stopPropagation();
        root.setPointerCapture(e.pointerId);
        drawing.current = false;
        livePoints.current = [];
        liveRect.current = null;
        startPt.current = null;
        lastPt.current = null;
        inspectMode.current = 'pinch';
        const clients = [...clientPos.current.values()];
        inspectRef.current.beginPinch(clients[0], clients[1]);
        setLiveTick((t) => t + 1);
        schedulePaint();
        return;
      }

      const wantPan =
        interactRef.current === 'move' ||
        spaceHeld.current ||
        e.button === 1 ||
        (e.pointerType === 'mouse' && e.buttons === 4);
      if (wantPan && inspectRef.current) {
        e.preventDefault();
        e.stopPropagation();
        root.setPointerCapture(e.pointerId);
        drawing.current = false;
        inspectMode.current = 'pan';
        onChromeHoldFadeBegin?.('move', () => pointers.current.size > 0);
        inspectRef.current.beginPan(e.clientX, e.clientY);
        return;
      }

      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      root.setPointerCapture(e.pointerId);
      inspectMode.current = null;
      onChromeHoldFadeBegin?.(styleRef.current, () => pointers.current.size > 0);
      const pt = eventPoint(root, e);
      setCursor(pt);
      if (drawModeRef.current === 'rect') {
        const hit = hitRegion(redactRef.current.regions, pt);
        if (hit && hit.points.length === 0) {
          drawing.current = false;
          livePoints.current = [];
          liveRect.current = null;
          startPt.current = null;
          lastPt.current = null;
          draggingId.current = hit.id;
          dragOrigin.current = { x: hit.x, y: hit.y, px: pt.x, py: pt.y };
          dragPos.current = { x: hit.x, y: hit.y };
          setOverRect(true);
          onSelectedChange?.(hit.id);
          setLiveTick((t) => t + 1);
          schedulePaint();
          return;
        }
      }
      onSelectedChange?.(null);
      drawing.current = true;
      startPt.current = pt;
      lastPt.current = pt;
      livePoints.current = [];
      liveRect.current = null;
      if (drawModeRef.current === 'brush') {
        livePoints.current = [pt];
      } else {
        liveRect.current = { x: pt.x, y: pt.y, w: 0, h: 0 };
      }
      setLiveTick((t) => t + 1);
      schedulePaint();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointers.current.has(e.pointerId)) {
        clientPos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (inspectMode.current === 'pan' && inspectRef.current) {
        inspectRef.current.movePan(e.clientX, e.clientY);
        return;
      }
      if (inspectMode.current === 'pinch' && inspectRef.current && clientPos.current.size >= 2) {
        const clients = [...clientPos.current.values()];
        inspectRef.current.movePinch(clients[0], clients[1]);
        return;
      }

      const pt = eventPoint(root, e);
      setCursor(pt);
      if (draggingId.current && dragOrigin.current) {
        const region = redactRef.current.regions.find((item) => item.id === draggingId.current);
        if (region) {
          const maxX = Math.max(0, 1 - region.w);
          const maxY = Math.max(0, 1 - region.h);
          dragPos.current = {
            x: Math.min(maxX, Math.max(0, dragOrigin.current.x + (pt.x - dragOrigin.current.px))),
            y: Math.min(maxY, Math.max(0, dragOrigin.current.y + (pt.y - dragOrigin.current.py))),
          };
          setLiveTick((t) => t + 1);
          schedulePaint();
        }
        return;
      }
      if (
        !drawing.current &&
        drawModeRef.current === 'rect' &&
        interactRef.current !== 'move'
      ) {
        const hit = hitRegion(redactRef.current.regions, pt);
        const next = Boolean(hit && hit.points.length === 0);
        setOverRect((prev) => (prev === next ? prev : next));
      }
      if (!drawing.current || !startPt.current) return;

      if (drawModeRef.current === 'rect') {
        liveRect.current = rectFromPoints(startPt.current, pt);
        lastPt.current = pt;
        setLiveTick((t) => t + 1);
        schedulePaint();
        return;
      }

      if (!lastPt.current) return;
      const densified = densify(lastPt.current, pt, brushRef.current);
      livePoints.current = [...livePoints.current, ...densified];
      lastPt.current = pt;
      setLiveTick((t) => t + 1);
      schedulePaint();
    };

    const endDraw = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      clientPos.current.delete(e.pointerId);

      if (inspectMode.current) {
        if (pointers.current.size === 0) {
          inspectRef.current?.end();
          inspectMode.current = null;
          onChromeHoldFadeEnd?.();
        } else if (inspectMode.current === 'pinch' && pointers.current.size === 1) {
          const remaining = [...clientPos.current.values()][0];
          if (remaining && inspectRef.current) {
            inspectMode.current = 'pan';
            inspectRef.current.beginPan(remaining.x, remaining.y);
          } else {
            inspectRef.current?.end();
            inspectMode.current = null;
          }
        }
        if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
        return;
      }

      setCursor(eventPoint(root, e));
      if (draggingId.current) {
        const id = draggingId.current;
        const pos = dragPos.current;
        const origin = dragOrigin.current;
        draggingId.current = null;
        dragOrigin.current = null;
        dragPos.current = null;
        drawing.current = false;
        if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
        if (pointers.current.size === 0) onChromeHoldFadeEnd?.();
        if (
          pos &&
          origin &&
          (Math.abs(pos.x - origin.x) > 0.001 || Math.abs(pos.y - origin.y) > 0.001)
        ) {
          onCommit({
            regions: redactRef.current.regions.map((region) =>
              region.id === id ? { ...region, x: pos.x, y: pos.y } : region,
            ),
          });
        } else {
          schedulePaint();
        }
        return;
      }
      if (!drawing.current) {
        if (pointers.current.size === 0) {
          onChromeHoldFadeEnd?.();
        }
        if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
        return;
      }
      drawing.current = false;
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
      if (pointers.current.size === 0) {
        onChromeHoldFadeEnd?.();
      }

      const mode = drawModeRef.current;
      const points = livePoints.current;
      const rect = liveRect.current;
      livePoints.current = [];
      liveRect.current = null;
      startPt.current = null;
      lastPt.current = null;
      setLiveTick((t) => t + 1);

      if (mode === 'rect') {
        if (!rect || (rect.w < 0.012 && rect.h < 0.012)) {
          const tap = eventPoint(root, e);
          const hit = hitRegion(redactRef.current.regions, tap);
          if (hit) onSelectedChange?.(hit.id);
          schedulePaint();
          return;
        }
        const region: RedactRegion = {
          id: newId(),
          style: styleRef.current,
          color: colorRef.current,
          brushWidth: brushRef.current,
          strength: strengthRef.current,
          points: [],
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
        };
        onCommit({ regions: [...redactRef.current.regions, region] });
        onSelectedChange?.(region.id);
        return;
      }

      let pathLen = 0;
      for (let i = 1; i < points.length; i++) {
        pathLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      }
      if (points.length && pathLen < brushRef.current * 0.35) {
        const hit = hitRegion(redactRef.current.regions, points[0]);
        if (hit) {
          onSelectedChange?.(hit.id);
          schedulePaint();
          return;
        }
      }

      if (points.length < 1) {
        schedulePaint();
        return;
      }
      const brush = brushRef.current;
      const box = boundsFromBrush(points, brush);
      const region: RedactRegion = {
        id: newId(),
        style: styleRef.current,
        color: colorRef.current,
        brushWidth: brush,
        strength: strengthRef.current,
        points,
        ...box,
      };
      onCommit({ regions: [...redactRef.current.regions, region] });
      onSelectedChange?.(region.id);
    };

    const onPointerLeave = () => {
      if (!drawing.current && !inspectMode.current && !draggingId.current) {
        setCursor(null);
        setOverRect(false);
      }
    };

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', endDraw);
    root.addEventListener('pointercancel', endDraw);
    root.addEventListener('pointerleave', onPointerLeave);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', endDraw);
      root.removeEventListener('pointercancel', endDraw);
      root.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [active, onCommit, onSelectedChange, onChromeHoldFadeBegin, onChromeHoldFadeEnd, schedulePaint]);

  return (
    <div
      ref={rootRef}
      data-ie-part='redact-layer'
      data-ie-active={active ? 'true' : undefined}
      data-ie-draw-mode={drawMode}
      data-ie-interact={interactMode}
      className='ie-redact-layer'
      style={{
        cursor:
          active && interactMode === 'move'
            ? 'grab'
            : active && overRect && drawMode === 'rect'
              ? 'move'
              : active && drawMode === 'brush'
                ? 'none'
                : active
                  ? 'crosshair'
                  : undefined,
      }}
    >
      <canvas
        ref={canvasRef}
        data-ie-part='redact-canvas'
        aria-hidden
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
      {active && interactMode === 'draw' && drawMode === 'brush' && cursor && (
        <div
          className='ie-redact-brush-cursor'
          aria-hidden
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            width: `${brushWidth * 100}%`,
            height: `${brushWidth * 100}%`,
          }}
        />
      )}
    </div>
  );
}

export function EditorRedactToolbar({
  style,
  interactMode,
  drawMode,
  brushWidth,
  strength,
  labels,
  onStyleChange,
  onInteractModeChange,
  onBrushWidthChange,
  onStrengthChange,
  onDeleteSelected,
  hasSelection,
  chromeFadeFocus = null,
  onChromeHoldFadeBegin,
  onChromeHoldFadeEnd,
}: {
  style: RedactStyle;
  interactMode: 'move' | 'draw';
  drawMode: RedactDrawMode;
  brushWidth: number;
  strength: number;
  labels: {
    move: string;
    pixelate: string;
    blur: string;
    solid: string;
    delete: string;
    brushSize: string;
    blockSize: string;
    blurStrength: string;
    rectangle?: string;
    brush?: string;
  };
  onStyleChange: (s: RedactStyle) => void;
  onInteractModeChange: (m: 'move' | 'draw') => void;
  onBrushWidthChange: (v: number) => void;
  onStrengthChange: (v: number) => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  chromeFadeFocus?: string | null;
  onChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onChromeHoldFadeEnd?: () => void;
}) {
  const brushHeldRef = useRef(false);
  const blockHeldRef = useRef(false);
  const blurHeldRef = useRef(false);

  const brushRangeHandlers =
    onChromeHoldFadeBegin && onChromeHoldFadeEnd
      ? rangeHoldFadeHandlers(
          'brush',
          onChromeHoldFadeBegin,
          onChromeHoldFadeEnd,
          brushHeldRef,
        )
      : null;
  const blockRangeHandlers =
    onChromeHoldFadeBegin && onChromeHoldFadeEnd
      ? rangeHoldFadeHandlers(
          'pixelate',
          onChromeHoldFadeBegin,
          onChromeHoldFadeEnd,
          blockHeldRef,
        )
      : null;
  const blurRangeHandlers =
    onChromeHoldFadeBegin && onChromeHoldFadeEnd
      ? rangeHoldFadeHandlers(
          'blur',
          onChromeHoldFadeBegin,
          onChromeHoldFadeEnd,
          blurHeldRef,
        )
      : null;

  return (
    <div className='ie-redact-toolbar' data-ie-part='redact-toolbar'>
      {/* Existing Pixelate / Blur / Solid / Delete — do not restyle these buttons. */}
      <div className='ie-redact-styles' role='toolbar' aria-label='Redact style'>
        <button
          type='button'
          className='ie-redact-move'
          data-ie-chrome-fade-target=''
          data-ie-chrome-focus={chromeFadeFocus === 'move' ? 'true' : undefined}
          data-ie-active={interactMode === 'move' ? 'true' : undefined}
          aria-pressed={interactMode === 'move'}
          aria-label={labels.move}
          title={labels.move}
          onClick={() => onInteractModeChange('move')}
        >
          {labels.move}
        </button>
        {(['pixelate', 'blur', 'solid'] as RedactStyle[]).map((s) => (
          <button
            key={s}
            type='button'
            className='ie-redact-style'
            data-ie-chrome-fade-target=''
            data-ie-chrome-focus={chromeFadeFocus === s ? 'true' : undefined}
            data-ie-active={
              interactMode === 'draw' && style === s ? 'true' : undefined
            }
            onClick={() => {
              onInteractModeChange('draw');
              onStyleChange(s);
            }}
          >
            {s === 'pixelate' ? labels.pixelate : s === 'blur' ? labels.blur : labels.solid}
          </button>
        ))}
        {hasSelection && (
          <button type='button' className='ie-redact-delete' onClick={onDeleteSelected}>
            {labels.delete}
          </button>
        )}
      </div>

      {interactMode === 'draw' && drawMode === 'brush' && (
        <label
          className='ie-redact-slider'
          data-ie-chrome-fade-target=''
          data-ie-chrome-focus={chromeFadeFocus === 'brush' ? 'true' : undefined}
        >
          <span>{labels.brushSize}</span>
          <input
            type='range'
            min={0.02}
            max={0.2}
            step={0.005}
            value={brushWidth}
            aria-label={labels.brushSize}
            onChange={(e) => onBrushWidthChange(Number(e.target.value))}
            {...brushRangeHandlers}
          />
        </label>
      )}

      {interactMode === 'draw' && style === 'pixelate' && (
        <label
          className='ie-redact-slider'
          data-ie-chrome-fade-target=''
          data-ie-chrome-focus={chromeFadeFocus === 'pixelate' ? 'true' : undefined}
        >
          <span>{labels.blockSize}</span>
          <input
            type='range'
            min={0}
            max={1}
            step={0.01}
            value={strength}
            aria-label={labels.blockSize}
            onChange={(e) => onStrengthChange(Number(e.target.value))}
            {...blockRangeHandlers}
          />
        </label>
      )}

      {interactMode === 'draw' && style === 'blur' && (
        <label
          className='ie-redact-slider'
          data-ie-chrome-fade-target=''
          data-ie-chrome-focus={chromeFadeFocus === 'blur' ? 'true' : undefined}
        >
          <span>{labels.blurStrength}</span>
          <input
            type='range'
            min={0}
            max={1}
            step={0.01}
            value={strength}
            aria-label={labels.blurStrength}
            onChange={(e) => onStrengthChange(Number(e.target.value))}
            {...blurRangeHandlers}
          />
        </label>
      )}
    </div>
  );
}
