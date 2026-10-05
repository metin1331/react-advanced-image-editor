import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createDefaultRuler,
  hitTestObject,
  objectBounds,
  adjHandleWorldPoints,
  pointInPolygon,
  projectOntoAngle,
  recognizeShape,
  renderMarkup,
  resolveMarkupFontFamily,
  shapeFromDrag,
  translateObject,
  type EraserMode,
  type MarkupDrawTool,
  type MarkupObject,
  type MarkupPoint,
  type MarkupRuler,
  type MarkupShape,
  type MarkupShapeKind,
  type MarkupSignatureTemplate,
  type MarkupState,
  type MarkupSticker,
  type MarkupLoupe,
  type MarkupStroke,
  type MarkupText,
  type MarkupTextAlign,
  type MarkupTool,
  preloadMarkupStickers,
} from 'react-advanced-image-editor-core';
import { parseCssColor, toHex6 } from '../color/cssColor';
import { MarkupShapeBadge } from './MarkupShapeBadge';
import type { MarkupShapeBadgeLabels } from './MarkupShapeBadge';
import { MarkupTextBadge } from './MarkupTextBadge';
import type { MarkupTextBadgeLabels } from './MarkupTextBadge';
import type { ImageEditorFont } from '../types';
import {
  applyAdjHandle,
  applyArrowHandle,
  applyBoxHandleResize,
  arrowHandlePoints,
  boxHandleWorldPoints,
  hitShapeHandle,
  isAdjHandle,
  shapeBadgeAnchor,
  syncShapeStyleMirrors,
  textBadgeAnchor,
  type ShapeHandle,
} from './shapeHandles';

export type MarkupLayerProps = {
  active: boolean;
  markup: MarkupState;
  tool: MarkupTool;
  eraserMode: EraserMode;
  color: string;
  strokeWidth: number;
  /** User ink alpha for new strokes, 0–1. */
  strokeOpacity?: number;
  shapeKind: MarkupShapeKind;
  textAlign: MarkupTextAlign;
  ruler: MarkupRuler;
  selectedIds: string[];
  signatureTemplate: MarkupSignatureTemplate | null;
  /** Optional i18n overrides for the shape selection badge. */
  shapeBadgeLabels?: Partial<MarkupShapeBadgeLabels>;
  textBadgeLabels?: Partial<MarkupTextBadgeLabels>;
  fonts?: ImageEditorFont[];
  /** Increment `key` to insert a text, shape, or loupe at the default placement. */
  placeRequest?: { kind: 'text' | 'shape' | 'loupe'; key: number } | null;
  /** Crop-frame bitmap so loupes can magnify the photo in preview. */
  photoSource?: CanvasImageSource | null;
  /** Calibrate-style CSS view pan/zoom while drawing tools own the pointer. */
  inspect?: import('./CropViewport').ViewInspectGestures | null;
  onRulerChange: (ruler: MarkupRuler) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onCommit: (next: MarkupState) => void;
  onChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onChromeHoldFadeEnd?: () => void;
};

function newId() {
  return `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function eventPoint(el: HTMLElement, e: PointerEvent): MarkupPoint {
  const rect = el.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / w)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / h)),
    p: e.pressure > 0 ? e.pressure : 0.5,
  };
}

function constrainPoint(pt: MarkupPoint, ruler: MarkupRuler): MarkupPoint {
  if (!ruler.visible) return pt;
  return { ...pt, ...projectOntoAngle(pt.x, pt.y, ruler.cx, ruler.cy, ruler.angle) };
}

function cloneObjects(objects: MarkupObject[]): MarkupObject[] {
  return objects.map((o) =>
    o.kind === 'stroke' ? { ...o, points: o.points.map((p) => ({ ...p })) } : { ...o }
  );
}

function isBoxShape(obj: MarkupObject): obj is MarkupShape {
  return obj.kind === 'shape' && obj.shape !== 'line' && obj.shape !== 'arrow';
}

type DragMode =
  | 'draw'
  | 'erase-object'
  | 'lasso'
  | 'move'
  | 'resize'
  | 'sticker-pinch'
  | 'shape-pinch'
  | 'shape'
  | 'ruler-move'
  | 'ruler-rotate'
  | null;

type CornerHandle = 'nw' | 'ne' | 'sw' | 'se';
type TextWidthHandle = 'w' | 'e';

const RESIZE_HIT = 0.028;
const STICKER_RESIZE_HIT = 0.055;
const PLACE_OFFSET = { dx: 0.045, dy: 0.045 };
const DEFAULT_TEXT_W = 0.36;
const DEFAULT_SHAPE_W = 0.24;
const DEFAULT_SHAPE_H = 0.24;

function resizableBounds(
  obj: MarkupObject,
  frameSize?: { width: number; height: number }
) {
  if (obj.kind === 'sticker') return null;
  if (obj.kind === 'text' || obj.kind === 'signature') {
    return objectBounds(obj, frameSize);
  }
  return null;
}

function applyTextWidthResize(
  obj: MarkupText,
  handle: TextWidthHandle,
  start: { x: number; y: number; w: number; h: number },
  pt: MarkupPoint
): MarkupText {
  const right = start.x + start.w;
  let nx = start.x;
  let nw = start.w;
  if (handle === 'e') nw = Math.max(0.05, pt.x - start.x);
  if (handle === 'w') {
    nw = Math.max(0.05, right - pt.x);
    nx = right - nw;
  }
  nx = Math.min(0.95, Math.max(0.01, nx));
  nw = Math.min(0.95 - nx, nw);
  // Width only — never touch fontSize.
  return { ...obj, x: nx, y: start.y, w: nw };
}

function applyResize(
  obj: MarkupObject,
  handle: CornerHandle,
  start: { x: number; y: number; w: number; h: number },
  pt: MarkupPoint
): MarkupObject {
  if (obj.kind !== 'signature' && obj.kind !== 'sticker') return obj;
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  let nx = start.x;
  let ny = start.y;
  let nw = start.w;
  let nh = start.h;

  if (handle.includes('e')) nw = Math.max(0.05, pt.x - start.x);
  if (handle.includes('w')) {
    nw = Math.max(0.05, right - pt.x);
    nx = right - nw;
  }
  if (handle.includes('s')) nh = Math.max(0.035, pt.y - start.y);
  if (handle.includes('n')) {
    nh = Math.max(0.035, bottom - pt.y);
    ny = bottom - nh;
  }

  // Signatures + stickers keep aspect so they don't stretch.
  const aspect = start.w / Math.max(1e-6, start.h);
  if (obj.kind === 'sticker') {
    const cx = start.x + start.w / 2;
    const cy = start.y + start.h / 2;
    const fromX = Math.abs(pt.x - cx) * 2;
    const fromY = Math.abs(pt.y - cy) * 2;
    nw = Math.max(0.06, Math.min(0.75, Math.max(fromX, fromY * aspect)));
    nh = nw / aspect;
    if (nw / aspect > 0.75) {
      nh = 0.75;
      nw = nh * aspect;
    }
    return {
      ...obj,
      x: cx - nw / 2,
      y: cy - nh / 2,
      w: nw,
      h: nh,
    };
  }

  const fromX = Math.abs(nw - start.w) * aspect >= Math.abs(nh - start.h);
  if (fromX) {
    nh = nw / aspect;
    if (handle.includes('n')) ny = bottom - nh;
    else ny = start.y;
  } else {
    nw = nh * aspect;
    if (handle.includes('w')) nx = right - nw;
    else nx = start.x;
  }

  nx = Math.min(0.95, Math.max(0.01, nx));
  ny = Math.min(0.95, Math.max(0.01, ny));
  nw = Math.min(0.95 - nx, nw);
  nh = Math.min(0.95 - ny, nh);

  return { ...obj, x: nx, y: ny, w: nw, h: nh };
}

function applyLoupeResize(
  obj: MarkupLoupe,
  pt: MarkupPoint,
  frameSize: { width: number; height: number }
): MarkupLoupe {
  const fw = Math.max(1e-6, frameSize.width);
  const fh = Math.max(1e-6, frameSize.height);
  const short = Math.min(fw, fh);
  const dx = (pt.x - obj.x) * fw;
  const dy = (pt.y - obj.y) * fh;
  const radius = Math.min(0.46, Math.max(0.05, Math.hypot(dx, dy) / short));
  return { ...obj, radius };
}

const HANDLE_BLUE = 'rgba(10,132,255,0.95)';
const HANDLE_GREEN = 'rgba(52,199,89,0.98)';

function drawCircularHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hs: number,
  stroke = HANDLE_BLUE
) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, hs / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * Overlay that captures freehand markup + Phase 2 tools in crop-frame space.
 */
export function MarkupLayer({
  active,
  markup,
  tool,
  eraserMode,
  color,
  strokeWidth,
  strokeOpacity = 1,
  shapeKind,
  textAlign,
  ruler,
  selectedIds,
  signatureTemplate,
  shapeBadgeLabels,
  textBadgeLabels,
  fonts,
  placeRequest,
  photoSource = null,
  inspect = null,
  onRulerChange,
  onSelectedIdsChange,
  onCommit,
  onChromeHoldFadeBegin,
  onChromeHoldFadeEnd,
}: MarkupLayerProps) {
  const signatureRef = useRef(signatureTemplate);
  signatureRef.current = signatureTemplate;
  const inspectRef = useRef(inspect);
  inspectRef.current = inspect;
  const photoSourceRef = useRef(photoSource);
  photoSourceRef.current = photoSource;
  const spaceHeld = useRef(false);
  const inspectMode = useRef<'pan' | 'pinch' | null>(null);
  const clientPos = useRef(new Map<number, { x: number; y: number }>());
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markupRef = useRef(markup);
  markupRef.current = markup;
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const rulerRef = useRef(ruler);
  rulerRef.current = ruler;

  const drawing = useRef(false);
  const modeRef = useRef<DragMode>(null);
  const liveStroke = useRef<MarkupStroke | null>(null);
  const liveShape = useRef<MarkupObject | null>(null);
  const lassoPts = useRef<MarkupPoint[]>([]);
  const objectScratch = useRef<MarkupState | null>(null);
  const moveStart = useRef<{ x: number; y: number; objects: MarkupObject[] } | null>(null);
  const resizeStart = useRef<{
    handle: ShapeHandle;
    id: string;
    bounds: { x: number; y: number; w: number; h: number };
    rotation: number;
    objects: MarkupObject[];
  } | null>(null);
  const shapePinch = useRef<{
    id: string;
    dist0: number;
    angle0: number;
    rot0: number;
    w0: number;
    h0: number;
    cx0: number;
    cy0: number;
    objects: MarkupObject[];
  } | null>(null);
  const stickerPinch = useRef<{
    id: string;
    dist0: number;
    angle0: number;
    rot0: number;
    w0: number;
    h0: number;
    cx0: number;
    cy0: number;
    objects: MarkupObject[];
  } | null>(null);
  const shapeStart = useRef<MarkupPoint | null>(null);
  const rulerDrag = useRef<{ x: number; y: number; ruler: MarkupRuler } | null>(null);
  const pointers = useRef(new Set<number>());
  const pointerPos = useRef(new Map<number, MarkupPoint>());
  const raf = useRef<number | null>(null);
  const moveSlop = useRef(false);
  const suppressStickerMenu = useRef(false);
  const schedulePaintRef = useRef<() => void>(() => {});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [stickerMenuId, setStickerMenuId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  editingIdRef.current = editingId;
  const textEditorRef = useRef<HTMLTextAreaElement>(null);
  const beginTextEditRef = useRef<(id: string) => void>(() => {});
  /** Live DOM bounds of the text editor (normalized) — used for handles while editing. */
  const editingBoundsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const lastTextTap = useRef<{ id: string; t: number } | null>(null);
  const lastPlacedRef = useRef<{
    text?: { x: number; y: number };
    shape?: { x: number; y: number };
    loupe?: { x: number; y: number };
  }>({});
  const TEXT_DOUBLE_TAP_MS = 380;
  /** Live opacity while dragging the badge slider (canvas via scratch + badge via merge). */
  const [liveOpacity, setLiveOpacity] = useState<{ id: string; opacity: number } | null>(null);
  /** Hide shape badge/popups immediately when transforming the selection. */
  const [chromeHidden, setChromeHidden] = useState(false);
  const [frameShortPx, setFrameShortPx] = useState(280);

  const getFrameSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { width: 1000, height: 1000 };
    return { width: canvas.width, height: canvas.height };
  }, []);

  const nextPlacement = useCallback((kind: 'text' | 'shape' | 'loupe', objW: number, objH: number) => {
    const last = lastPlacedRef.current[kind];
    if (!last) {
      return {
        x: Math.min(0.98 - objW, Math.max(0.02, 0.5 - objW / 2)),
        y: Math.min(0.98 - objH, Math.max(0.02, 0.5 - objH / 2)),
      };
    }
    return {
      x: Math.min(0.98 - objW, Math.max(0.02, last.x + PLACE_OFFSET.dx)),
      y: Math.min(0.98 - objH, Math.max(0.02, last.y + PLACE_OFFSET.dy)),
    };
  }, []);

  const insertTextAtPlacement = useCallback(() => {
    const w = DEFAULT_TEXT_W;
    const fontSize = 16 / Math.max(1, frameShortPx);
    const h = fontSize * 1.25;
    const { x, y } = nextPlacement('text', w, h);
    const id = newId();
    const textObj: MarkupText = {
      kind: 'text',
      id,
      text: 'Text',
      x,
      y,
      w,
      fontSize,
      color,
      align: textAlign,
    };
    onCommit({ objects: [...markupRef.current.objects, textObj] });
    onSelectedIdsChange([id]);
    lastPlacedRef.current.text = { x, y };
    lastTextTap.current = { id, t: performance.now() };
    beginTextEditRef.current(id);
  }, [color, frameShortPx, nextPlacement, onCommit, onSelectedIdsChange, textAlign]);

  const insertShapeAtPlacement = useCallback(() => {
    const w = DEFAULT_SHAPE_W;
    const h = DEFAULT_SHAPE_H;
    const { x, y } = nextPlacement('shape', w, h);
    const id = newId();
    const shape =
      shapeKind === 'line' || shapeKind === 'arrow'
        ? shapeFromDrag(shapeKind, x, y + h / 2, x + w, y + h / 2, id, color, strokeWidth)
        : {
            ...shapeFromDrag(shapeKind, x, y, x + w, y + h, id, color, strokeWidth),
            fill: color,
          };
    onCommit({ objects: [...markupRef.current.objects, shape] });
    onSelectedIdsChange([id]);
    lastPlacedRef.current.shape = { x, y };
  }, [color, nextPlacement, onCommit, onSelectedIdsChange, shapeKind, strokeWidth]);

  const insertLoupeAtPlacement = useCallback(() => {
    const radius = 0.14;
    const size = radius * 2;
    const { x: left, y: top } = nextPlacement('loupe', size, size);
    const x = left + radius;
    const y = top + radius;
    const id = newId();
    const loupe: MarkupLoupe = {
      kind: 'loupe',
      id,
      x,
      y,
      radius,
      mag: 2.2,
    };
    onCommit({ objects: [...markupRef.current.objects, loupe] });
    onSelectedIdsChange([id]);
    lastPlacedRef.current.loupe = { x: left, y: top };
  }, [nextPlacement, onCommit, onSelectedIdsChange]);

  useEffect(() => {
    if (!placeRequest?.key || !active) return;
    if (placeRequest.kind === 'text') insertTextAtPlacement();
    else if (placeRequest.kind === 'shape') insertShapeAtPlacement();
    else insertLoupeAtPlacement();
    // Only react to a new place request key — not to color/tool identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [placeRequest?.key, active]);

  const focusTextEditor = useCallback((selectAll = true) => {
    const ta = textEditorRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    if (!selectAll) return;
    const len = ta.value.length;
    try {
      ta.setSelectionRange(0, len);
    } catch {
      /* Safari */
    }
  }, []);

  beginTextEditRef.current = (id: string) => {
    editingIdRef.current = id;
    setEditingId(id);
    onSelectedIdsChange([id]);
    drawing.current = false;
    modeRef.current = null;
    focusTextEditor();
    requestAnimationFrame(() => focusTextEditor());
  };

  useEffect(() => {
    if (!active) {
      setEditingId(null);
      editingBoundsRef.current = null;
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const armKeyboard = (e: PointerEvent) => {
      const tip = (e.target as HTMLElement | null)?.closest?.(
        '.ie-markup-tip[data-ie-tool="text"]',
      );
      if (!tip) return;
      textEditorRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', armKeyboard, true);
    return () => document.removeEventListener('pointerdown', armKeyboard, true);
  }, [active]);

  useLayoutEffect(() => {
    const ta = textEditorRef.current;
    if (!ta || !editingId) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [editingId, markup, selectedIds]);

  useLayoutEffect(() => {
    if (!editingId) return;
    focusTextEditor();
  }, [editingId, focusTextEditor]);

  const syncEditingBounds = useCallback(() => {
    const ta = textEditorRef.current;
    const root = rootRef.current;
    if (!ta || !root || !editingIdRef.current) {
      editingBoundsRef.current = null;
      return;
    }
    const rr = root.getBoundingClientRect();
    const tr = ta.getBoundingClientRect();
    if (rr.width < 1 || rr.height < 1) {
      editingBoundsRef.current = null;
      return;
    }
    editingBoundsRef.current = {
      x: (tr.left - rr.left) / rr.width,
      y: (tr.top - rr.top) / rr.height,
      w: tr.width / rr.width,
      h: tr.height / rr.height,
    };
  }, []);

  useLayoutEffect(() => {
    if (!editingId) {
      editingBoundsRef.current = null;
      schedulePaintRef.current();
      return;
    }
    syncEditingBounds();
    schedulePaintRef.current();
    const ta = textEditorRef.current;
    if (!ta) return;
    const ro = new ResizeObserver(() => {
      syncEditingBounds();
      schedulePaintRef.current();
    });
    ro.observe(ta);
    return () => ro.disconnect();
  }, [editingId, markup, syncEditingBounds]);

  const sizeCanvas = useCallback(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Layout box only — inspect pinch/wheel applies CSS scale on an ancestor.
    // Sizing from getBoundingClientRect() double-applies that scale so strokes
    // land below / beside the pointer.
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    root.style.setProperty('--ie-markup-frame-short', `${Math.min(width, height)}px`);
    const short = Math.max(1, Math.min(width, height));
    setFrameShortPx((prev) => (Math.abs(prev - short) > 0.5 ? short : prev));
  }, []);

  const paintRuler = (
    ctx: CanvasRenderingContext2D,
    r: MarkupRuler,
    width: number,
    height: number
  ) => {
    if (!r.visible) return;
    const short = Math.min(width, height);
    const rad = (r.angle * Math.PI) / 180;
    const half = r.halfLength * short;
    const cx = r.cx * width;
    const cy = r.cy * height;
    const dx = Math.cos(rad) * half;
    const dy = Math.sin(rad) * half;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.fillStyle = 'rgba(245,245,247,0.22)';
    ctx.lineWidth = Math.max(10, short * 0.028);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - dx, cy - dy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();
    // Tick marks
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(60,60,67,0.55)';
    const ticks = 24;
    for (let i = 0; i <= ticks; i++) {
      const t = i / ticks;
      const px = cx - dx + 2 * dx * t;
      const py = cy - dy + 2 * dy * t;
      const nx = -Math.sin(rad);
      const ny = Math.cos(rad);
      const len = i % 4 === 0 ? 9 : 5;
      ctx.beginPath();
      ctx.moveTo(px - nx * len, py - ny * len);
      ctx.lineTo(px + nx * len, py + ny * len);
      ctx.stroke();
    }
    ctx.restore();
  };

  const paintSelection = (
    ctx: CanvasRenderingContext2D,
    ids: string[],
    objects: MarkupObject[],
    width: number,
    height: number,
    frameSize: { width: number; height: number }
  ) => {
    if (!ids.length) return;
    const hs = Math.max(10, Math.min(width, height) * 0.028);
    ctx.save();
    for (const id of ids) {
      const obj = objects.find((o) => o.id === id);
      if (!obj) continue;

      if (obj.kind === 'loupe') {
        const short = Math.min(width, height);
        const r = obj.radius * short;
        const cx = obj.x * width;
        const cy = obj.y * height;
        ctx.strokeStyle = 'rgba(10,132,255,0.95)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        drawCircularHandle(
          ctx,
          cx + r * Math.SQRT1_2,
          cy + r * Math.SQRT1_2,
          hs
        );
        continue;
      }

      // Stickers: soft ring + corner handles (pinch also scales/rotates).
      if (obj.kind === 'sticker') {
        const cx = (obj.x + obj.w / 2) * width;
        const cy = (obj.y + obj.h / 2) * height;
        const rw = obj.w * width;
        const rh = obj.h * height;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(((obj.rotation || 0) * Math.PI) / 180);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.shadowColor = 'rgba(10,132,255,0.45)';
        ctx.shadowBlur = 8;
        const pad = Math.max(6, Math.min(width, height) * 0.012);
        ctx.beginPath();
        const r = Math.min(rw, rh) * 0.18;
        const x0 = -rw / 2 - pad;
        const y0 = -rh / 2 - pad;
        const ww = rw + pad * 2;
        const hh = rh + pad * 2;
        ctx.moveTo(x0 + r, y0);
        ctx.arcTo(x0 + ww, y0, x0 + ww, y0 + hh, r);
        ctx.arcTo(x0 + ww, y0 + hh, x0, y0 + hh, r);
        ctx.arcTo(x0, y0 + hh, x0, y0, r);
        ctx.arcTo(x0, y0, x0 + ww, y0, r);
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
        const stickerHs = Math.max(10, Math.min(width, height) * 0.028);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(10,132,255,0.95)';
        ctx.lineWidth = 1.5;
        for (const [lx, ly] of [
          [-rw / 2, -rh / 2],
          [rw / 2, -rh / 2],
          [-rw / 2, rh / 2],
          [rw / 2, rh / 2],
        ] as const) {
          ctx.beginPath();
          ctx.arc(lx, ly, stickerHs / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }

      if (obj.kind === 'shape') {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(10,132,255,0.95)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);

        if (obj.shape === 'arrow' || obj.shape === 'line') {
          const pts = arrowHandlePoints(obj);
          if (obj.shape === 'arrow') {
            ctx.beginPath();
            ctx.moveTo(pts.start.x * width, pts.start.y * height);
            ctx.quadraticCurveTo(
              pts.bend.x * width,
              pts.bend.y * height,
              pts.end.x * width,
              pts.end.y * height
            );
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            drawCircularHandle(ctx, pts.start.x * width, pts.start.y * height, hs);
            drawCircularHandle(
              ctx,
              pts.bend.x * width,
              pts.bend.y * height,
              hs,
              HANDLE_GREEN
            );
            drawCircularHandle(ctx, pts.end.x * width, pts.end.y * height, hs);
          } else {
            ctx.beginPath();
            ctx.moveTo(pts.start.x * width, pts.start.y * height);
            ctx.lineTo(pts.end.x * width, pts.end.y * height);
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            drawCircularHandle(ctx, pts.start.x * width, pts.start.y * height, hs);
            drawCircularHandle(ctx, pts.end.x * width, pts.end.y * height, hs);
          }
          continue;
        }

        // Box shapes: outline in rotated local space + 6 circular handles.
        const cx = (obj.x + obj.w / 2) * width;
        const cy = (obj.y + obj.h / 2) * height;
        const rw = obj.w * width;
        const rh = obj.h * height;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(((obj.rotation || 0) * Math.PI) / 180);
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);
        ctx.restore();

        ctx.setLineDash([]);
        const handles = boxHandleWorldPoints(obj);
        for (const key of ['nw', 'ne', 'sw', 'se', 'e', 'w'] as const) {
          const p = handles[key];
          drawCircularHandle(ctx, p.x * width, p.y * height, hs);
        }
        const adj = adjHandleWorldPoints(obj);
        for (const p of Object.values(adj)) {
          if (p) drawCircularHandle(ctx, p.x * width, p.y * height, hs, HANDLE_GREEN);
        }
        continue;
      }

      // Text: dashed box + left/right width handles only. Signature: 4 corners.
      ctx.strokeStyle = 'rgba(10,132,255,0.95)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      const editingBounds =
        obj.kind === 'text' && obj.id === editingIdRef.current
          ? editingBoundsRef.current
          : null;
      const b =
        editingBounds ??
        objectBounds(obj, obj.kind === 'text' ? frameSize : undefined);
      ctx.strokeRect(b.x * width, b.y * height, b.w * width, b.h * height);
      if (obj.kind === 'text') {
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(10,132,255,0.95)';
        const midY = (b.y + b.h / 2) * height;
        drawCircularHandle(ctx, b.x * width, midY, hs);
        drawCircularHandle(ctx, (b.x + b.w) * width, midY, hs);
        ctx.setLineDash([5, 4]);
        continue;
      }
      if (!resizableBounds(obj, frameSize)) continue;
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(10,132,255,0.95)';
      const corners = [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x, b.y + b.h],
        [b.x + b.w, b.y + b.h],
      ];
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx * width - hs / 2, cy * height - hs / 2, hs, hs);
        ctx.strokeRect(cx * width - hs / 2, cy * height - hs / 2, hs, hs);
      }
      ctx.setLineDash([5, 4]);
    }
    ctx.restore();
  };

  const hitResizeHandle = (
    pt: MarkupPoint,
    frameSize: { width: number; height: number }
  ): {
    id: string;
    handle: ShapeHandle;
    bounds: { x: number; y: number; w: number; h: number };
    rotation: number;
  } | null => {
    const objects = objectScratch.current?.objects ?? markupRef.current.objects;
    for (const id of selectedRef.current) {
      const obj = objects.find((o) => o.id === id);
      if (!obj) continue;

      if (obj.kind === 'shape') {
        const css = rootRef.current?.getBoundingClientRect();
        const handle = hitShapeHandle(
          pt,
          obj,
          css && css.width > 0
            ? { width: css.width, height: css.height }
            : frameSize
        );
        if (handle) {
          return {
            id,
            handle,
            bounds: { x: obj.x, y: obj.y, w: obj.w, h: obj.h },
            rotation: obj.rotation || 0,
          };
        }
        continue;
      }

      if (obj.kind === 'sticker') {
        const cx = obj.x + obj.w / 2;
        const cy = obj.y + obj.h / 2;
        const rad = (-(obj.rotation || 0) * Math.PI) / 180;
        const dx = pt.x - cx;
        const dy = pt.y - cy;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
        const hw = obj.w / 2;
        const hh = obj.h / 2;
        const corners: Record<CornerHandle, MarkupPoint> = {
          nw: { x: -hw, y: -hh },
          ne: { x: hw, y: -hh },
          sw: { x: -hw, y: hh },
          se: { x: hw, y: hh },
        };
        for (const handle of Object.keys(corners) as CornerHandle[]) {
          const c = corners[handle];
          if (Math.hypot(lx - c.x, ly - c.y) <= STICKER_RESIZE_HIT) {
            return {
              id,
              handle,
              bounds: { x: obj.x, y: obj.y, w: obj.w, h: obj.h },
              rotation: 0,
            };
          }
        }
        continue;
      }

      if (obj.kind === 'loupe') {
        const short = Math.min(frameSize.width, frameSize.height);
        const rx = (obj.radius * short) / Math.max(1e-6, frameSize.width);
        const ry = (obj.radius * short) / Math.max(1e-6, frameSize.height);
        const c = {
          x: obj.x + rx * Math.SQRT1_2,
          y: obj.y + ry * Math.SQRT1_2,
        };
        if (Math.hypot(pt.x - c.x, pt.y - c.y) <= RESIZE_HIT * 1.35) {
          return {
            id,
            handle: 'se',
            bounds: { x: obj.x - rx, y: obj.y - ry, w: rx * 2, h: ry * 2 },
            rotation: 0,
          };
        }
        continue;
      }

      if (obj.kind === 'text') {
        const b =
          (obj.id === editingIdRef.current && editingBoundsRef.current) ||
          objectBounds(obj, frameSize);
        const midY = b.y + b.h / 2;
        const handles: Record<TextWidthHandle, MarkupPoint> = {
          w: { x: b.x, y: midY },
          e: { x: b.x + b.w, y: midY },
        };
        for (const handle of ['w', 'e'] as const) {
          const c = handles[handle];
          if (Math.hypot(pt.x - c.x, pt.y - c.y) <= RESIZE_HIT) {
            return { id, handle, bounds: b, rotation: 0 };
          }
        }
        continue;
      }

      const b = resizableBounds(obj, frameSize);
      if (!b) continue;
      const corners: Record<CornerHandle, MarkupPoint> = {
        nw: { x: b.x, y: b.y },
        ne: { x: b.x + b.w, y: b.y },
        sw: { x: b.x, y: b.y + b.h },
        se: { x: b.x + b.w, y: b.y + b.h },
      };
      for (const handle of Object.keys(corners) as CornerHandle[]) {
        const c = corners[handle];
        if (Math.hypot(pt.x - c.x, pt.y - c.y) <= RESIZE_HIT) {
          return { id, handle, bounds: b, rotation: 0 };
        }
      }
    }
    return null;
  };

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const base = objectScratch.current ?? markupRef.current;
    const extras: MarkupObject[] = [];
    if (liveStroke.current) extras.push(liveStroke.current);
    if (liveShape.current) extras.push(liveShape.current);
    const editId = editingIdRef.current;
    const paintObjects = [...base.objects, ...extras].filter((o) => o.id !== editId);
    renderMarkup(
      ctx,
      { objects: paintObjects },
      canvas.width,
      canvas.height,
      photoSourceRef.current
    );

    if (lassoPts.current.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(10,132,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(lassoPts.current[0].x * canvas.width, lassoPts.current[0].y * canvas.height);
      for (let i = 1; i < lassoPts.current.length; i++) {
        ctx.lineTo(lassoPts.current[i].x * canvas.width, lassoPts.current[i].y * canvas.height);
      }
      ctx.stroke();
      ctx.restore();
    }

    paintSelection(ctx, selectedRef.current, base.objects, canvas.width, canvas.height, {
      width: canvas.width,
      height: canvas.height,
    });
    paintRuler(ctx, rulerRef.current, canvas.width, canvas.height);
  }, []);

  const schedulePaint = useCallback(() => {
    if (raf.current != null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      paint();
    });
  }, [paint]);
  schedulePaintRef.current = schedulePaint;

  useEffect(() => {
    setLiveOpacity(null);
  }, [selectedIds]);

  useEffect(() => {
    if (suppressStickerMenu.current) return;
    const id = selectedIds[0];
    if (!id) {
      setStickerMenuId(null);
      return;
    }
    const obj = markup.objects.find((o) => o.id === id);
    if (obj?.kind === 'sticker') setStickerMenuId(id);
    else setStickerMenuId(null);
  }, [selectedIds, markup.objects]);

  useEffect(() => {
    sizeCanvas();
    paint();
  }, [markup, selectedIds, ruler, sizeCanvas, paint, photoSource]);

  // Twemoji loads async — repaint when legacy sticker bitmaps arrive so preview matches export.
  useEffect(() => {
    let cancelled = false;
    void preloadMarkupStickers(markup).then(() => {
      if (!cancelled) schedulePaint();
    });
    return () => {
      cancelled = true;
    };
  }, [markup, schedulePaint]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      sizeCanvas();
      schedulePaint();
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [sizeCanvas, schedulePaint]);

  const hitRuler = (pt: MarkupPoint): 'move' | 'rotate' | null => {
    const r = rulerRef.current;
    if (!r.visible) return null;
    const rad = (r.angle * Math.PI) / 180;
    const half = r.halfLength;
    // Approximate in normalized space (ignore aspect for hit slop)
    const dx = Math.cos(rad) * half;
    const dy = Math.sin(rad) * half;
    const ends = [
      { x: r.cx - dx, y: r.cy - dy },
      { x: r.cx + dx, y: r.cy + dy },
    ];
    for (const e of ends) {
      if (Math.hypot(pt.x - e.x, pt.y - e.y) < 0.045) return 'rotate';
    }
    const proj = projectOntoAngle(pt.x, pt.y, r.cx, r.cy, r.angle);
    const along = (proj.x - r.cx) * Math.cos(rad) + (proj.y - r.cy) * Math.sin(rad);
    if (Math.abs(along) <= half + 0.02 && Math.hypot(pt.x - proj.x, pt.y - proj.y) < 0.03) {
      return 'move';
    }
    return null;
  };

  const beginMove = (pt: MarkupPoint, ids: string[]) => {
    modeRef.current = 'move';
    // Chrome stays until movement past slop — tap-to-select must not hide the badge.
    onSelectedIdsChange(ids);
    moveStart.current = {
      x: pt.x,
      y: pt.y,
      objects: cloneObjects(markupRef.current.objects),
    };
    schedulePaint();
  };

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

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !active) return;

    const onPointerDown = (e: PointerEvent) => {
      // Sticker context menu owns its own clicks — never capture those.
      if ((e.target as HTMLElement | null)?.closest?.('.ie-sticker-context-menu')) {
        return;
      }

      // Shape / text badge + portaled font menu own their own clicks.
      if (
        (e.target as HTMLElement | null)?.closest?.(
          '.ie-shape-badge, .ie-text-badge, [data-ie-part="text-font-menu"]'
        )
      ) {
        return;
      }

      // Let the textarea keep focus and receive caret clicks.
      if ((e.target as HTMLElement | null)?.closest?.('.ie-markup-text-editor')) {
        return;
      }

      const pt = eventPoint(root, e);
      const frameSize = getFrameSize();
      const frameAspect = frameSize.width / Math.max(1, frameSize.height);
      const hitObject = (o: MarkupObject, px: number, py: number) =>
        hitTestObject(o, px, py, frameAspect, frameSize);
      pointers.current.add(e.pointerId);
      pointerPos.current.set(e.pointerId, pt);
      clientPos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger pinch/rotate on sticker or box shape — else inspect zoom/pan.
      if (pointers.current.size === 2) {
        drawing.current = false;
        liveStroke.current = null;
        liveShape.current = null;
        lassoPts.current = [];
        inspectMode.current = null;
        const pts = [...pointerPos.current.values()];
        if (pts.length >= 2) {
          const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          const selected = selectedRef.current[0];
          let stickerTarget = markupRef.current.objects.find(
            (o) => o.kind === 'sticker' && o.id === selected
          ) as MarkupSticker | undefined;
          if (!stickerTarget) {
            stickerTarget = [...markupRef.current.objects]
              .reverse()
              .find((o) => o.kind === 'sticker' && hitTestObject(o, mid.x, mid.y)) as
              | MarkupSticker
              | undefined;
          }
          if (stickerTarget) {
            const dist0 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1e-6;
            const angle0 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
            modeRef.current = 'sticker-pinch';
            suppressStickerMenu.current = true;
            setStickerMenuId(null);
            onSelectedIdsChange([stickerTarget.id]);
            stickerPinch.current = {
              id: stickerTarget.id,
              dist0,
              angle0,
              rot0: stickerTarget.rotation || 0,
              w0: stickerTarget.w,
              h0: stickerTarget.h,
              cx0: stickerTarget.x + stickerTarget.w / 2,
              cy0: stickerTarget.y + stickerTarget.h / 2,
              objects: cloneObjects(markupRef.current.objects),
            };
            schedulePaint();
            return;
          }

          let target = markupRef.current.objects.find(
            (o) => isBoxShape(o) && o.id === selected
          );
          if (!target) {
            target = [...markupRef.current.objects]
              .reverse()
              .find((o) => isBoxShape(o) && hitTestObject(o, mid.x, mid.y));
          }
          if (target && isBoxShape(target)) {
            const dist0 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1e-6;
            const angle0 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
            modeRef.current = 'shape-pinch';
            setChromeHidden(true);
            onSelectedIdsChange([target.id]);
            shapePinch.current = {
              id: target.id,
              dist0,
              angle0,
              rot0: target.rotation || 0,
              w0: target.w,
              h0: target.h,
              cx0: target.x + target.w / 2,
              cy0: target.y + target.h / 2,
              objects: cloneObjects(markupRef.current.objects),
            };
            schedulePaint();
            return;
          }
        }
        const clients = [...clientPos.current.values()];
        if (clients.length >= 2 && inspectRef.current) {
          e.preventDefault();
          e.stopPropagation();
          root.setPointerCapture(e.pointerId);
          modeRef.current = null;
          inspectMode.current = 'pinch';
          inspectRef.current.beginPinch(clients[0], clients[1]);
          schedulePaint();
          return;
        }
        modeRef.current = null;
        schedulePaint();
        return;
      }

      // Loupes stay interactive even with the Move tool (magnifier).
      {
        const selectedLoupe = selectedRef.current
          .map((id) => markupRef.current.objects.find((o) => o.id === id))
          .find((o) => o?.kind === 'loupe');
        const loupeResize = selectedLoupe ? hitResizeHandle(pt, frameSize) : null;
        const resizeIsLoupe =
          Boolean(loupeResize) &&
          markupRef.current.objects.some(
            (o) => o.id === loupeResize!.id && o.kind === 'loupe'
          );
        if (resizeIsLoupe && loupeResize) {
          e.preventDefault();
          e.stopPropagation();
          try {
            root.setPointerCapture(e.pointerId);
          } catch {
            /* Safari */
          }
          drawing.current = true;
          moveSlop.current = false;
          inspectMode.current = null;
          modeRef.current = 'resize';
          setChromeHidden(true);
          resizeStart.current = {
            handle: loupeResize.handle,
            id: loupeResize.id,
            bounds: loupeResize.bounds,
            rotation: loupeResize.rotation,
            objects: cloneObjects(markupRef.current.objects),
          };
          schedulePaint();
          return;
        }
        const loupeHit = [...markupRef.current.objects]
          .reverse()
          .find((o) => o.kind === 'loupe' && hitObject(o, pt.x, pt.y));
        if (loupeHit) {
          e.preventDefault();
          e.stopPropagation();
          try {
            root.setPointerCapture(e.pointerId);
          } catch {
            /* Safari */
          }
          drawing.current = true;
          moveSlop.current = false;
          inspectMode.current = null;
          beginMove(pt, [loupeHit.id]);
          return;
        }
      }

      // Move tool / Space / middle-mouse → pan the CSS view.
      const wantPan =
        tool === 'move' ||
        spaceHeld.current ||
        e.button === 1 ||
        (e.pointerType === 'mouse' && e.buttons === 4);
      if (wantPan && inspectRef.current) {
        e.preventDefault();
        e.stopPropagation();
        root.setPointerCapture(e.pointerId);
        drawing.current = false;
        modeRef.current = null;
        inspectMode.current = 'pan';
        inspectRef.current.beginPan(e.clientX, e.clientY);
        return;
      }

      if (e.pointerType === 'mouse' && e.button !== 0) return;

      const textHit = [...markupRef.current.objects]
        .reverse()
        .find((o) => o.kind === 'text' && hitObject(o, pt.x, pt.y));
      const textHandleHit = textHit ? hitResizeHandle(pt, frameSize) : null;
      const allowTextCaret =
        Boolean(textHit) &&
        !textHandleHit &&
        (tool === 'text' || selectedRef.current.includes(textHit!.id));

      // Tapping empty canvas (or another object) while editing closes the editor.
      // Tapping the same text must keep it so pointerup can restore the caret.
      if (
        editingIdRef.current &&
        !(allowTextCaret && textHit?.id === editingIdRef.current)
      ) {
        editingIdRef.current = null;
        editingBoundsRef.current = null;
        setEditingId(null);
      }

      if (!allowTextCaret) {
        e.preventDefault();
        e.stopPropagation();
      }
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        /* Safari */
      }
      drawing.current = true;
      moveSlop.current = false;
      inspectMode.current = null;

      // Handles on selected shape / text / signature / sticker.
      const resizeHit = hitResizeHandle(pt, frameSize);
      if (resizeHit) {
        modeRef.current = 'resize';
        setChromeHidden(true);
        suppressStickerMenu.current = true;
        setStickerMenuId(null);
        resizeStart.current = {
          handle: resizeHit.handle,
          id: resizeHit.id,
          bounds: resizeHit.bounds,
          rotation: resizeHit.rotation,
          objects: cloneObjects(markupRef.current.objects),
        };
        schedulePaint();
        return;
      }

      // Stickers are always interactive (any markup tool): tap to select/move.
      {
        const hit = [...markupRef.current.objects]
          .reverse()
          .find((o) => o.kind === 'sticker' && hitObject(o, pt.x, pt.y));
        if (hit) {
          modeRef.current = 'move';
          suppressStickerMenu.current = false;
          onSelectedIdsChange([hit.id]);
          setStickerMenuId(hit.id);
          moveStart.current = {
            x: pt.x,
            y: pt.y,
            objects: cloneObjects(markupRef.current.objects),
          };
          schedulePaint();
          return;
        }
        if (tool === 'sticker') {
          onSelectedIdsChange([]);
          setStickerMenuId(null);
          drawing.current = false;
          schedulePaint();
          return;
        }
      }

      if (tool === 'loupe') {
        onSelectedIdsChange([]);
        drawing.current = false;
        schedulePaint();
        return;
      }

      // Ruler interaction wins when visible (except while placing text).
      if (tool === 'ruler' || rulerRef.current.visible) {
        const hit = hitRuler(pt);
        if (tool === 'ruler' && !rulerRef.current.visible) {
          onRulerChange({ ...createDefaultRuler(), visible: true, cx: pt.x, cy: pt.y });
          modeRef.current = 'ruler-move';
          rulerDrag.current = { x: pt.x, y: pt.y, ruler: { ...rulerRef.current, visible: true, cx: pt.x, cy: pt.y } };
          schedulePaint();
          return;
        }
        if (hit === 'rotate') {
          modeRef.current = 'ruler-rotate';
          rulerDrag.current = { x: pt.x, y: pt.y, ruler: { ...rulerRef.current } };
          schedulePaint();
          return;
        }
        if (hit === 'move' && tool === 'ruler') {
          modeRef.current = 'ruler-move';
          rulerDrag.current = { x: pt.x, y: pt.y, ruler: { ...rulerRef.current } };
          schedulePaint();
          return;
        }
      }

      if (tool === 'text') {
        const hit = [...markupRef.current.objects]
          .reverse()
          .find((o) => o.kind === 'text' && hitObject(o, pt.x, pt.y));
        if (hit && hit.kind === 'text') {
          const now = performance.now();
          const last = lastTextTap.current;
          if (last && last.id === hit.id && now - last.t < TEXT_DOUBLE_TAP_MS) {
            beginTextEditRef.current(hit.id);
            lastTextTap.current = null;
            drawing.current = false;
            return;
          }
          // One press: select + show badge; keep drawing=true so drag moves the text.
          beginMove(pt, [hit.id]);
          lastTextTap.current = { id: hit.id, t: now };
          return;
        }
        // Empty canvas tap does not place text — use the Text button.
        drawing.current = false;
        return;
      }

      if (tool === 'signature') {
        const tmpl = signatureRef.current;
        if (!tmpl?.paths.length) {
          drawing.current = false;
          return;
        }
        // Drag existing stamp; otherwise place a new one centered on tap.
        const hit = [...markupRef.current.objects]
          .reverse()
          .find((o) => o.kind === 'signature' && hitTestObject(o, pt.x, pt.y));
        if (hit) {
          beginMove(pt, [hit.id]);
          return;
        }
        const id = newId();
        // Match pad content aspect so the stamp isn't stretched.
        const aspect = Math.max(0.5, tmpl.aspect || 2.8);
        const w = 0.42;
        const h = Math.min(0.35, w / aspect);
        onCommit({
          objects: [
            ...markupRef.current.objects,
            {
              kind: 'signature',
              id,
              paths: tmpl.paths.map((p) => ({
                width: p.width,
                points: p.points.map((q) => ({ ...q })),
              })),
              x: Math.min(0.98 - w, Math.max(0.02, pt.x - w / 2)),
              y: Math.min(0.98 - h, Math.max(0.02, pt.y - h / 2)),
              w,
              h,
              color,
            },
          ],
        });
        onSelectedIdsChange([id]);
        drawing.current = false;
        return;
      }

      if (tool === 'lasso') {
        // Prefer hit on existing shapes (tap-to-select + move).
        const hitShape = [...markupRef.current.objects]
          .reverse()
          .find((o) => o.kind === 'shape' && hitTestObject(o, pt.x, pt.y));
        if (hitShape) {
          beginMove(pt, [hitShape.id]);
          return;
        }

        // If pressing inside selection, move; else draw lasso
        const ids = selectedRef.current;
        if (ids.length) {
          const hitSel = markupRef.current.objects.some(
            (o) => ids.includes(o.id) && hitTestObject(o, pt.x, pt.y)
          );
          if (hitSel) {
            beginMove(pt, ids);
            return;
          }
        }
        modeRef.current = 'lasso';
        onChromeHoldFadeBegin?.('markup', () => pointers.current.size > 0);
        lassoPts.current = [pt];
        schedulePaint();
        return;
      }

      if (tool === 'shape') {
        const hitShape = [...markupRef.current.objects]
          .reverse()
          .find((o) => o.kind === 'shape' && hitObject(o, pt.x, pt.y));
        if (hitShape) {
          onSelectedIdsChange([hitShape.id]);
          beginMove(pt, [hitShape.id]);
          return;
        }
        // Empty canvas tap does not place shapes — use the Shape button.
        drawing.current = false;
        return;
      }

      if (tool === 'eraser' && eraserMode === 'object') {
        modeRef.current = 'erase-object';
        onChromeHoldFadeBegin?.('markup', () => pointers.current.size > 0);
        objectScratch.current = {
          objects: markupRef.current.objects.filter((s) => !hitTestObject(s, pt.x, pt.y)),
        };
        schedulePaint();
        return;
      }

      if (tool === 'pen' || tool === 'marker' || tool === 'pencil' || (tool === 'eraser' && eraserMode === 'pixel')) {
        onChromeHoldFadeBegin?.('markup', () => pointers.current.size > 0);
        const drawPt = constrainPoint(pt, rulerRef.current);
        modeRef.current = 'draw';
        const drawTool: MarkupDrawTool | 'eraser' =
          tool === 'eraser' ? 'eraser' : (tool as MarkupDrawTool);
        liveStroke.current = {
          kind: 'stroke',
          id: newId(),
          tool: drawTool,
          color: toHex6(parseCssColor(color)),
          width: strokeWidth,
          opacity: drawTool === 'eraser' ? 1 : strokeOpacity,
          points: [drawPt],
        };
        schedulePaint();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const pt = eventPoint(root, e);
      if (pointers.current.has(e.pointerId)) {
        pointerPos.current.set(e.pointerId, pt);
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

      // Pinch / rotate stickers with two fingers.
      if (modeRef.current === 'sticker-pinch' && stickerPinch.current && pointerPos.current.size >= 2) {
        const pts = [...pointerPos.current.values()];
        const a = pts[0];
        const b = pts[1];
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const start = stickerPinch.current;
        const scale = Math.min(3.5, Math.max(0.35, dist / start.dist0));
        const rot = start.rot0 + ((ang - start.angle0) * 180) / Math.PI;
        const nw = Math.min(0.72, Math.max(0.06, start.w0 * scale));
        const nh = Math.min(0.72, Math.max(0.06, start.h0 * scale));
        objectScratch.current = {
          objects: start.objects.map((o) =>
            o.id === start.id && o.kind === 'sticker'
              ? {
                  ...o,
                  w: nw,
                  h: nh,
                  x: start.cx0 - nw / 2,
                  y: start.cy0 - nh / 2,
                  rotation: rot,
                }
              : o
          ),
        };
        schedulePaint();
        return;
      }

      // Pinch / rotate box shapes with two fingers.
      if (modeRef.current === 'shape-pinch' && shapePinch.current && pointerPos.current.size >= 2) {
        const pts = [...pointerPos.current.values()];
        const a = pts[0];
        const b = pts[1];
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const start = shapePinch.current;
        const scale = Math.min(3.5, Math.max(0.35, dist / start.dist0));
        const rot = start.rot0 + ((ang - start.angle0) * 180) / Math.PI;
        const nw = Math.min(0.72, Math.max(0.06, start.w0 * scale));
        const nh = Math.min(0.72, Math.max(0.06, start.h0 * scale));
        objectScratch.current = {
          objects: start.objects.map((o) =>
            o.id === start.id && o.kind === 'shape'
              ? {
                  ...o,
                  w: nw,
                  h: nh,
                  x: start.cx0 - nw / 2,
                  y: start.cy0 - nh / 2,
                  rotation: rot,
                }
              : o
          ),
        };
        schedulePaint();
        return;
      }

      if (!drawing.current || pointers.current.size > 1) return;
      let ptMove = pt;
      const mode = modeRef.current;

      if (mode === 'ruler-move' && rulerDrag.current) {
        const dx = ptMove.x - rulerDrag.current.x;
        const dy = ptMove.y - rulerDrag.current.y;
        const base = rulerDrag.current.ruler;
        onRulerChange({
          ...base,
          cx: Math.min(0.95, Math.max(0.05, base.cx + dx)),
          cy: Math.min(0.95, Math.max(0.05, base.cy + dy)),
        });
        schedulePaint();
        return;
      }
      if (mode === 'ruler-rotate' && rulerDrag.current) {
        const base = rulerDrag.current.ruler;
        const ang = (Math.atan2(ptMove.y - base.cy, ptMove.x - base.cx) * 180) / Math.PI;
        onRulerChange({ ...base, angle: ang });
        schedulePaint();
        return;
      }

      if (mode === 'lasso') {
        lassoPts.current.push(ptMove);
        schedulePaint();
        return;
      }

      if (mode === 'move' && moveStart.current) {
        const dx = ptMove.x - moveStart.current.x;
        const dy = ptMove.y - moveStart.current.y;
        if (Math.hypot(dx, dy) > 0.008) {
          if (!moveSlop.current) {
            moveSlop.current = true;
            suppressStickerMenu.current = true;
            setStickerMenuId(null);
            // Hide badge + secondary popup at the start of actual dragging.
            setChromeHidden(true);
          }
        }
        const ids = new Set(selectedRef.current);
        objectScratch.current = {
          objects: moveStart.current.objects.map((o) =>
            ids.has(o.id) ? translateObject(o, dx, dy) : o
          ),
        };
        schedulePaint();
        return;
      }

      if (mode === 'resize' && resizeStart.current) {
        const start = resizeStart.current;
        objectScratch.current = {
          objects: start.objects.map((o) => {
            if (o.id !== start.id) return o;
            if (o.kind === 'shape') {
              if (
                start.handle === 'arrow-start' ||
                start.handle === 'arrow-end' ||
                start.handle === 'arrow-bend'
              ) {
                return applyArrowHandle(o, start.handle, ptMove);
              }
              if (isAdjHandle(start.handle)) {
                return applyAdjHandle(o, start.handle, ptMove);
              }
              return applyBoxHandleResize(
                o,
                start.handle,
                { ...start.bounds, rotation: start.rotation },
                ptMove
              );
            }
            if (o.kind === 'loupe') {
              return applyLoupeResize(o, ptMove, getFrameSize());
            }
            if (
              start.handle === 'nw' ||
              start.handle === 'ne' ||
              start.handle === 'sw' ||
              start.handle === 'se'
            ) {
              return applyResize(o, start.handle, start.bounds, ptMove);
            }
            if (o.kind === 'text' && (start.handle === 'w' || start.handle === 'e')) {
              return applyTextWidthResize(o, start.handle, start.bounds, ptMove);
            }
            return o;
          }),
        };
        schedulePaint();
        return;
      }

      if (mode === 'shape' && shapeStart.current) {
        liveShape.current = shapeFromDrag(
          shapeKind,
          shapeStart.current.x,
          shapeStart.current.y,
          ptMove.x,
          ptMove.y,
          liveShape.current?.id ?? newId(),
          color,
          strokeWidth
        );
        schedulePaint();
        return;
      }

      if (mode === 'erase-object') {
        const base = objectScratch.current ?? markupRef.current;
        objectScratch.current = {
          objects: base.objects.filter((s) => !hitTestObject(s, ptMove.x, ptMove.y)),
        };
        schedulePaint();
        return;
      }

      if (mode === 'draw') {
        ptMove = constrainPoint(ptMove, rulerRef.current);
        const stroke = liveStroke.current;
        if (!stroke) return;
        const last = stroke.points[stroke.points.length - 1];
        const dx = ptMove.x - last.x;
        const dy = ptMove.y - last.y;
        if (dx * dx + dy * dy < 1e-7) return;
        stroke.points.push(ptMove);
        schedulePaint();
      }
    };

    const endStroke = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      pointerPos.current.delete(e.pointerId);
      clientPos.current.delete(e.pointerId);

      if (inspectMode.current) {
        if (pointers.current.size === 0) {
          inspectRef.current?.end();
          inspectMode.current = null;
          drawing.current = false;
          modeRef.current = null;
          onChromeHoldFadeEnd?.();
        } else if (inspectMode.current === 'pinch' && pointers.current.size === 1) {
          // Drop to pan with remaining finger.
          const remaining = [...clientPos.current.values()][0];
          if (remaining && inspectRef.current) {
            inspectMode.current = 'pan';
            inspectRef.current.beginPan(remaining.x, remaining.y);
          } else {
            inspectRef.current?.end();
            inspectMode.current = null;
          }
        }
        return;
      }

      if (modeRef.current === 'sticker-pinch') {
        if (pointers.current.size > 0) return;
        const next = objectScratch.current;
        objectScratch.current = null;
        stickerPinch.current = null;
        modeRef.current = null;
        drawing.current = false;
        if (next) onCommit(next);
        else schedulePaint();
        return;
      }

      if (modeRef.current === 'shape-pinch') {
        if (pointers.current.size > 0) return;
        const next = objectScratch.current;
        objectScratch.current = null;
        shapePinch.current = null;
        modeRef.current = null;
        drawing.current = false;
        setChromeHidden(false);
        if (next) onCommit(next);
        else schedulePaint();
        return;
      }

      if (!drawing.current) {
        if (pointers.current.size === 0) {
          liveStroke.current = null;
          liveShape.current = null;
          lassoPts.current = [];
          objectScratch.current = null;
          modeRef.current = null;
          onChromeHoldFadeEnd?.();
          schedulePaint();
        }
        return;
      }
      if (pointers.current.size > 0) return;
      onChromeHoldFadeEnd?.();
      drawing.current = false;
      const mode = modeRef.current;
      modeRef.current = null;

      if (mode === 'ruler-move' || mode === 'ruler-rotate') {
        rulerDrag.current = null;
        schedulePaint();
        return;
      }

      if (mode === 'lasso') {
        const poly = lassoPts.current;
        lassoPts.current = [];
        if (poly.length > 2) {
          const ids = markupRef.current.objects
            .filter((o) => {
              const b = objectBounds(o);
              const cx = b.x + b.w / 2;
              const cy = b.y + b.h / 2;
              return pointInPolygon(cx, cy, poly);
            })
            .map((o) => o.id);
          onSelectedIdsChange(ids);
        } else {
          onSelectedIdsChange([]);
        }
        schedulePaint();
        return;
      }

      if (mode === 'move') {
        const next = objectScratch.current;
        objectScratch.current = null;
        moveStart.current = null;
        setChromeHidden(false);
        if (next) {
          onCommit(next);
        } else schedulePaint();
        if (!moveSlop.current && selectedRef.current[0]) {
          const id = selectedRef.current[0];
          const obj = markupRef.current.objects.find((o) => o.id === id);
          if (obj?.kind === 'sticker') {
            suppressStickerMenu.current = false;
            setStickerMenuId(id);
          }
          if (obj?.kind === 'text') {
            try {
              root.releasePointerCapture(e.pointerId);
            } catch {
              /* Safari */
            }
            beginTextEditRef.current(id);
          }
        }
        return;
      }

      if (mode === 'resize') {
        const next = objectScratch.current;
        objectScratch.current = null;
        resizeStart.current = null;
        setChromeHidden(false);
        if (next) onCommit(next);
        else schedulePaint();
        return;
      }

      if (mode === 'shape') {
        const shape = liveShape.current;
        liveShape.current = null;
        shapeStart.current = null;
        if (shape && shape.kind === 'shape' && (shape.w > 0.015 || shape.h > 0.015 || shape.x2 != null)) {
          onCommit({ objects: [...markupRef.current.objects, shape] });
          onSelectedIdsChange([shape.id]);
        } else schedulePaint();
        return;
      }

      if (mode === 'erase-object') {
        const next = objectScratch.current;
        objectScratch.current = null;
        if (next && next.objects.length !== markupRef.current.objects.length) onCommit(next);
        else schedulePaint();
        return;
      }

      if (mode === 'draw') {
        const stroke = liveStroke.current;
        liveStroke.current = null;
        if (stroke && stroke.points.length > 0) {
          // gesture: snap closed geometric gestures to clean shapes (pen only).
          let obj: MarkupObject = stroke;
          if (stroke.tool === 'pen' && stroke.points.length >= 10) {
            const snapped = recognizeShape(
              stroke.points,
              stroke.id,
              stroke.color,
              stroke.width
            );
            if (snapped) obj = snapped;
          }
          onCommit({ objects: [...markupRef.current.objects, obj] });
        } else schedulePaint();
      }
    };

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', endStroke);
    root.addEventListener('pointercancel', endStroke);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', endStroke);
      root.removeEventListener('pointercancel', endStroke);
    };
  }, [
    active,
    tool,
    eraserMode,
    color,
    strokeWidth,
    strokeOpacity,
    shapeKind,
    textAlign,
    signatureTemplate,
    onCommit,
    onChromeHoldFadeBegin,
    onChromeHoldFadeEnd,
    onRulerChange,
    onSelectedIdsChange,
    schedulePaint,
    getFrameSize,
  ]);

  const editingText =
    editingId != null
      ? (markup.objects.find((o) => o.id === editingId && o.kind === 'text') as MarkupText | undefined)
      : undefined;

  const commitText = (next: Partial<MarkupText>) => {
    if (!editingText) return;
    onCommit({
      objects: markupRef.current.objects.map((o) =>
        o.id === editingText.id && o.kind === 'text' ? { ...o, ...next } : o
      ),
    });
  };

  const selectedShape = useMemo((): MarkupShape | null => {
    if (selectedIds.length !== 1) return null;
    const obj = markup.objects.find((o) => o.id === selectedIds[0]);
    if (obj?.kind !== 'shape') return null;
    if (liveOpacity && liveOpacity.id === obj.id) {
      return { ...obj, opacity: liveOpacity.opacity };
    }
    return obj;
  }, [selectedIds, markup.objects, liveOpacity]);

  const selectedText = useMemo((): MarkupText | null => {
    if (selectedIds.length !== 1 || editingId) return null;
    const obj = markup.objects.find((o) => o.id === selectedIds[0]);
    return obj?.kind === 'text' ? obj : null;
  }, [selectedIds, markup.objects, editingId]);

  const selectedSticker = useMemo((): MarkupSticker | null => {
    if (!stickerMenuId) return null;
    const obj = markup.objects.find((o) => o.id === stickerMenuId);
    return obj?.kind === 'sticker' ? obj : null;
  }, [stickerMenuId, markup.objects]);

  const copySticker = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const src =
      selectedSticker ??
      (markupRef.current.objects.find(
        (o) => o.id === selectedRef.current[0] && o.kind === 'sticker'
      ) as MarkupSticker | undefined);
    if (!src) return;
    const id = newId();
    const dup: MarkupSticker = {
      ...src,
      id,
      x: Math.min(0.92, src.x + 0.04),
      y: Math.min(0.92, src.y + 0.04),
    };
    onCommit({ objects: [...markupRef.current.objects, dup] });
    suppressStickerMenu.current = false;
    onSelectedIdsChange([id]);
    setStickerMenuId(id);
  };

  const trashSticker = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const id = stickerMenuId ?? selectedRef.current[0];
    if (!id) return;
    objectScratch.current = null;
    modeRef.current = null;
    drawing.current = false;
    onCommit({ objects: markupRef.current.objects.filter((o) => o.id !== id) });
    onSelectedIdsChange([]);
    setStickerMenuId(null);
    suppressStickerMenu.current = true;
    schedulePaint();
  };

  const patchShapeStyle = (id: string, patch: Partial<MarkupShape>, commit: boolean) => {
    const apply = (objects: MarkupObject[]) =>
      objects.map((o) =>
        o.id === id && o.kind === 'shape'
          ? syncShapeStyleMirrors({ ...o, ...patch })
          : o
      );
    if (commit) {
      objectScratch.current = null;
      setLiveOpacity(null);
      onCommit({ objects: apply(markupRef.current.objects) });
    } else {
      const nextObjects = apply(objectScratch.current?.objects ?? markupRef.current.objects);
      objectScratch.current = { objects: nextObjects };
      if (patch.opacity != null) setLiveOpacity({ id, opacity: patch.opacity });
      schedulePaintRef.current();
    }
  };

  const patchTextStyle = (id: string, patch: Partial<MarkupText>, commit: boolean) => {
    const apply = (objects: MarkupObject[]) =>
      objects.map((o) => (o.id === id && o.kind === 'text' ? { ...o, ...patch } : o));
    if (commit) {
      objectScratch.current = null;
      onCommit({ objects: apply(markupRef.current.objects) });
    } else {
      objectScratch.current = {
        objects: apply(objectScratch.current?.objects ?? markupRef.current.objects),
      };
      schedulePaintRef.current();
    }
  };

  const duplicateShape = (shape: MarkupShape) => {
    const id = newId();
    const dup: MarkupShape = {
      ...shape,
      id,
      x: Math.min(0.92, shape.x + 0.04),
      y: Math.min(0.92, shape.y + 0.04),
      ...(shape.x2 != null ? { x2: Math.min(1, shape.x2 + 0.04) } : null),
      ...(shape.y2 != null ? { y2: Math.min(1, shape.y2 + 0.04) } : null),
      ...(shape.cx != null ? { cx: Math.min(1, shape.cx + 0.04) } : null),
      ...(shape.cy != null ? { cy: Math.min(1, shape.cy + 0.04) } : null),
    };
    onCommit({ objects: [...markupRef.current.objects, dup] });
    onSelectedIdsChange([id]);
  };

  const duplicateText = (text: MarkupText) => {
    const id = newId();
    const dup: MarkupText = {
      ...text,
      id,
      x: Math.min(0.92, text.x + 0.04),
      y: Math.min(0.92, text.y + 0.04),
    };
    onCommit({ objects: [...markupRef.current.objects, dup] });
    onSelectedIdsChange([id]);
  };

  const deleteShape = (id: string) => {
    objectScratch.current = null;
    modeRef.current = null;
    drawing.current = false;
    onCommit({ objects: markupRef.current.objects.filter((o) => o.id !== id) });
    onSelectedIdsChange([]);
    schedulePaint();
  };

  const deleteText = (id: string) => {
    setEditingId(null);
    deleteShape(id);
  };

  const badgeAnchor = selectedShape ? shapeBadgeAnchor(selectedShape) : null;
  const textBadgeAnchorPt = selectedText
    ? textBadgeAnchor(selectedText, getFrameSize())
    : null;

  return (
    <div
      ref={rootRef}
      data-ie-part='markup-layer'
      data-ie-active={active ? 'true' : undefined}
      data-ie-tool={tool}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4,
        pointerEvents: active ? 'auto' : 'none',
        touchAction: 'none',
        cursor: active && tool === 'move' ? 'grab' : undefined,
      }}
    >
      <canvas
        ref={canvasRef}
        data-ie-part='markup-canvas'
        aria-hidden
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />

      <textarea
          ref={textEditorRef}
          className='ie-markup-text-editor'
          data-ie-idle={editingText ? undefined : 'true'}
          value={editingText?.text ?? ''}
          inputMode='text'
          enterKeyHint='done'
          autoCapitalize='sentences'
          autoCorrect='on'
          spellCheck
          aria-hidden={editingText ? undefined : true}
          tabIndex={editingText ? 0 : -1}
          style={
            editingText
              ? {
                  left: `${editingText.x * 100}%`,
                  top: `${editingText.y * 100}%`,
                  width: `${editingText.w * 100}%`,
                  fontSize: `calc(var(--ie-markup-frame-short, 280px) * ${editingText.fontSize})`,
                  color: editingText.color,
                  textAlign: editingText.align,
                  fontWeight: editingText.bold ? 600 : 400,
                  fontStyle: editingText.italic ? 'italic' : 'normal',
                  fontFamily: resolveMarkupFontFamily(editingText),
                  textDecoration: [
                    editingText.underline ? 'underline' : '',
                    editingText.strikethrough ? 'line-through' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || 'none',
                }
              : undefined
          }
          onChange={(e) => {
            if (!editingIdRef.current) return;
            commitText({ text: e.target.value });
            const ta = textEditorRef.current;
            if (ta) {
              ta.style.height = 'auto';
              ta.style.height = `${ta.scrollHeight}px`;
            }
            requestAnimationFrame(() => {
              syncEditingBounds();
              schedulePaintRef.current();
            });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setEditingId(null);
              editingBoundsRef.current = null;
            }
          }}
        />

      {selectedShape && badgeAnchor && !chromeHidden && (
        <MarkupShapeBadge
          shape={selectedShape}
          anchorX={badgeAnchor.x}
          anchorY={badgeAnchor.y}
          labels={shapeBadgeLabels}
          onFillChange={(fill) => patchShapeStyle(selectedShape.id, { fill }, true)}
          onStrokeChange={(stroke) => patchShapeStyle(selectedShape.id, { stroke }, true)}
          onOpacityChange={(opacity, commit) =>
            patchShapeStyle(selectedShape.id, { opacity }, commit)
          }
          onDuplicate={() => duplicateShape(selectedShape)}
          onDelete={() => deleteShape(selectedShape.id)}
          onDismissSelection={() => onSelectedIdsChange([])}
        />
      )}

      {selectedText && textBadgeAnchorPt && !chromeHidden && (
        <MarkupTextBadge
          text={selectedText}
          anchorX={textBadgeAnchorPt.x}
          anchorY={textBadgeAnchorPt.y}
          labels={textBadgeLabels}
          fonts={fonts}
          frameShortPx={frameShortPx}
          onColorChange={(c) => patchTextStyle(selectedText.id, { color: c }, true)}
          onFontSizeChange={(fontSize) => patchTextStyle(selectedText.id, { fontSize }, true)}
          onAlignChange={(align) => patchTextStyle(selectedText.id, { align }, true)}
          onBoldChange={(bold) => patchTextStyle(selectedText.id, { bold }, true)}
          onItalicChange={(italic) => patchTextStyle(selectedText.id, { italic }, true)}
          onUnderlineChange={(underline) =>
            patchTextStyle(selectedText.id, { underline }, true)
          }
          onStrikethroughChange={(strikethrough) =>
            patchTextStyle(selectedText.id, { strikethrough }, true)
          }
          onFontChange={(font) =>
            patchTextStyle(
              selectedText.id,
              { fontId: font.id, fontFamily: font.family },
              true
            )
          }
          onDuplicate={() => duplicateText(selectedText)}
          onDelete={() => deleteText(selectedText.id)}
          onDismissSelection={() => onSelectedIdsChange([])}
        />
      )}

      {selectedSticker && (
        <div
          className='ie-sticker-context-menu'
          style={{
            left: `${(selectedSticker.x + selectedSticker.w / 2) * 100}%`,
            top: `${Math.max(0.04, selectedSticker.y) * 100}%`,
          }}
          role='toolbar'
          aria-label='Sticker actions'
        >
          <button
            type='button'
            className='ie-sticker-context-btn'
            title='Copy'
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              copySticker(e);
            }}
          >
            <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7'>
              <rect x='9' y='9' width='11' height='11' rx='2' />
              <path d='M5 15V5a2 2 0 0 1 2-2h10' />
            </svg>
          </button>
          <span className='ie-sticker-context-sep' aria-hidden />
          <button
            type='button'
            className='ie-sticker-context-btn'
            title='Delete'
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              trashSticker(e);
            }}
          >
            <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7'>
              <path d='M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12' />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
