/** Drawing / eraser tools (Phase 1) + Markup tools (Phase 2). */
export type MarkupDrawTool = 'pen' | 'marker' | 'pencil';
export type MarkupTool =
  | MarkupDrawTool
  | 'eraser'
  | 'lasso'
  | 'ruler'
  | 'text'
  | 'shape'
  | 'signature'
  | 'sticker'
  | 'loupe'
  | 'move';
export type EraserMode = 'pixel' | 'object';

/** One path inside a reusable signature template (coords 0…1 in template box). */
export interface MarkupSignaturePath {
  points: MarkupPoint[];
  width: number;
}
export type MarkupTextAlign = 'left' | 'center' | 'right' | 'justify';
export const DEFAULT_MARKUP_FONT_ID = 'default';
export const DEFAULT_MARKUP_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';
export type MarkupShapeKind =
  | 'line'
  | 'arrow'
  | 'rect'
  | 'roundRect'
  | 'circle'
  | 'triangle'
  | 'hexagon'
  | 'blockArrow'
  | 'star'
  | 'speech';

/** Point in crop-frame normalized space (0…1). Optional pressure `p` in 0…1. */
export interface MarkupPoint {
  x: number;
  y: number;
  p?: number;
}

export interface MarkupStroke {
  kind: 'stroke';
  id: string;
  tool: MarkupDrawTool | 'eraser';
  color: string;
  /** Stroke diameter as a fraction of the frame's short side. */
  width: number;
  points: MarkupPoint[];
}

export interface MarkupText {
  kind: 'text';
  id: string;
  text: string;
  /** Top-left of the text box in normalized frame space. */
  x: number;
  y: number;
  /** Box width in normalized frame space (height follows content). */
  w: number;
  /** Font size as a fraction of the frame short side. */
  fontSize: number;
  color: string;
  align: MarkupTextAlign;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** Host font id (`default` when omitted). */
  fontId?: string;
  /** CSS `font-family` stack used at paint/export time. */
  fontFamily?: string;
}

export interface MarkupShape {
  kind: 'shape';
  id: string;
  shape: MarkupShapeKind;
  /**
   * @deprecated Prefer `fill` / `stroke`. Kept for older snapshots; normalize
   * mirrors it into fill/stroke.
   */
  color: string;
  width: number;
  /** Axis-aligned box before rotation (normalized). For line/arrow = start. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Line/arrow end point. When omitted, end is (x+w, y+h). */
  x2?: number;
  y2?: number;
  /** Degrees, clockwise. */
  rotation: number;
  /**
   * @deprecated Prefer independent `fill` / `stroke`.
   */
  filled?: boolean;
  /** Fill color, or `null` for No Fill. */
  fill: string | null;
  /** Stroke color, or `null` for No Stroke. */
  stroke: string | null;
  /** Visual opacity 0…1 (does not affect geometry). */
  opacity: number;
  /**
   * Arrow bend control point (quadratic Bézier) in normalized frame space.
   * Omitted → straight midline between start and end.
   */
  cx?: number;
  cy?: number;
  /**
   * Rounded-rect corner radius as a fraction of min(w,h)/2 (0…1).
   */
  cornerRadius?: number;
  /**
   * Hexagon top/bottom flat width as a fraction of half-width (0.12…0.92).
   * 0.5 ≈ regular; 1 → rectangular; lower → more pointed sides.
   */
  hexInset?: number;
  /** Right-facing arrow: head depth as a fraction of width (0.16…0.72). */
  arrowHead?: number;
  /** Right-facing arrow: shaft height as a fraction of height (0.16…0.9). */
  arrowShaft?: number;
  /** Star inner radius as a fraction of the outer radius (0.18…0.82). */
  starInset?: number;
  /**
   * Speech-bubble tail tip in local box units from center
   * (× width / height). 0 is center; 0.5 is the bottom/right edge.
   */
  tailU?: number;
  tailV?: number;
  /** Speech-bubble tail base width as a fraction of min(w,h). */
  tailWidth?: number;
}

/**
 * Placed signature stamp. `paths` are in unit space (0…1) relative to the
 * stamp box `(x,y,w,h)` on the crop frame.
 */
export interface MarkupSignature {
  kind: 'signature';
  id: string;
  paths: MarkupSignaturePath[];
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/**
 * Emoji / kaomoji sticker stamp on the crop frame.
 * Twemoji bitmaps for emoji; canvas text for kaomoji — both stay editable objects.
 */
export interface MarkupSticker {
  kind: 'sticker';
  id: string;
  /** Unicode emoji or kaomoji string. */
  emoji: string;
  /** Rendering mode — emoji uses Twemoji; kaomoji uses text. */
  style: 'emoji' | 'kaomoji';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
}

/**
 * Circular magnifier (markup loupe).
 * `x` / `y` are the center in normalized frame space; `radius` is a fraction
 * of the frame's short side; `mag` is the zoom inside the glass.
 */
export interface MarkupLoupe {
  kind: 'loupe';
  id: string;
  x: number;
  y: number;
  radius: number;
  mag: number;
}

/** Session template drawn in the signature pad (not on the photo until placed). */
export interface MarkupSignatureTemplate {
  paths: MarkupSignaturePath[];
  /** Content width / height after tight crop — placement must honor this. */
  aspect: number;
}

export type MarkupObject =
  | MarkupStroke
  | MarkupText
  | MarkupShape
  | MarkupSignature
  | MarkupSticker
  | MarkupLoupe;

/** Session-only ruler; not part of undo history / export. */
export interface MarkupRuler {
  visible: boolean;
  /** Center in normalized frame space. */
  cx: number;
  cy: number;
  /** Degrees. */
  angle: number;
  /** Half-length in normalized short-side units (mapped to x via aspect). */
  halfLength: number;
}

export interface MarkupState {
  objects: MarkupObject[];
}

export function createDefaultMarkup(): MarkupState {
  return { objects: [] };
}

export function createDefaultRuler(): MarkupRuler {
  return {
    visible: false,
    cx: 0.5,
    cy: 0.55,
    angle: -12,
    halfLength: 0.38,
  };
}

export function isStroke(o: MarkupObject): o is MarkupStroke {
  return o.kind === 'stroke';
}

export function isText(o: MarkupObject): o is MarkupText {
  return o.kind === 'text';
}

export function isShape(o: MarkupObject): o is MarkupShape {
  return o.kind === 'shape';
}

export function isSignature(o: MarkupObject): o is MarkupSignature {
  return o.kind === 'signature';
}

export function isSticker(o: MarkupObject): o is MarkupSticker {
  return o.kind === 'sticker';
}

export function isLoupe(o: MarkupObject): o is MarkupLoupe {
  return o.kind === 'loupe';
}

export function cloneMarkup(markup: MarkupState): MarkupState {
  return {
    objects: markup.objects.map((obj) => {
      if (obj.kind === 'stroke') {
        return { ...obj, points: obj.points.map((p) => ({ ...p })) };
      }
      if (obj.kind === 'signature') {
        return {
          ...obj,
          paths: obj.paths.map((path) => ({
            width: path.width,
            points: path.points.map((p) => ({ ...p })),
          })),
        };
      }
      if (obj.kind === 'sticker') {
        return { ...obj };
      }
      return { ...obj };
    }),
  };
}

function normalizeStroke(raw: Record<string, unknown>): MarkupStroke | null {
  const points = raw.points as MarkupPoint[] | undefined;
  if (!Array.isArray(points) || points.length === 0) return null;
  return {
    kind: 'stroke',
    id: String(raw.id ?? ''),
    tool: (raw.tool as MarkupStroke['tool']) || 'pen',
    color: String(raw.color || '#000000'),
    width: Math.max(0.001, Number(raw.width) || 0.01),
    points: points.map((p) => {
      const point: MarkupPoint = { x: Number(p.x), y: Number(p.y) };
      if (p.p != null) point.p = Number(p.p);
      return point;
    }),
  };
}

function normalizeAlign(raw: unknown): MarkupTextAlign {
  if (raw === 'center' || raw === 'right' || raw === 'justify') return raw;
  return 'left';
}

function normalizeText(raw: Record<string, unknown>): MarkupText | null {
  const text = String(raw.text ?? 'Text');
  const fontId = typeof raw.fontId === 'string' && raw.fontId.trim() ? raw.fontId.trim() : undefined;
  const fontFamily =
    typeof raw.fontFamily === 'string' && raw.fontFamily.trim() ? raw.fontFamily.trim() : undefined;
  return {
    kind: 'text',
    id: String(raw.id ?? ''),
    text: text || 'Text',
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    w: Math.max(0.08, Number(raw.w) || 0.35),
    fontSize: Math.max(0.02, Number(raw.fontSize) || 0.05),
    color: String(raw.color || '#000000'),
    align: normalizeAlign(raw.align),
    bold: Boolean(raw.bold),
    italic: Boolean(raw.italic),
    underline: Boolean(raw.underline),
    strikethrough: Boolean(raw.strikethrough),
    ...(fontId ? { fontId } : null),
    ...(fontFamily ? { fontFamily } : null),
  };
}

function normalizeShape(raw: Record<string, unknown>): MarkupShape | null {
  const shape = raw.shape as MarkupShapeKind | undefined;
  if (!shape) return null;
  const color = String(raw.color || '#000000');
  const legacyFilled = Boolean(raw.filled);
  const hasFill = Object.prototype.hasOwnProperty.call(raw, 'fill');
  const hasStroke = Object.prototype.hasOwnProperty.call(raw, 'stroke');
  let fill: string | null;
  let stroke: string | null;
  if (hasFill || hasStroke) {
    fill = raw.fill == null || raw.fill === '' ? null : String(raw.fill);
    stroke = raw.stroke == null || raw.stroke === '' ? null : String(raw.stroke);
  } else if (legacyFilled) {
    fill = color;
    stroke = null;
  } else {
    fill = null;
    stroke = color;
  }
  // Line/arrow always need a visible stroke if both are empty.
  if ((shape === 'line' || shape === 'arrow') && stroke == null && fill == null) {
    stroke = color;
  }
  const opacityRaw = Number(raw.opacity);
  const opacity =
    Number.isFinite(opacityRaw) ? Math.min(1, Math.max(0, opacityRaw)) : 1;
  return {
    kind: 'shape',
    id: String(raw.id ?? ''),
    shape,
    color,
    width: Math.max(0.001, Number(raw.width) || 0.01),
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    w: Math.max(0.01, Number(raw.w) || 0.1),
    h: Math.max(0.01, Number(raw.h) || 0.1),
    ...(raw.x2 != null ? { x2: Number(raw.x2) } : null),
    ...(raw.y2 != null ? { y2: Number(raw.y2) } : null),
    rotation: Number(raw.rotation) || 0,
    filled: fill != null && stroke == null,
    fill,
    stroke,
    opacity,
    ...(raw.cx != null ? { cx: Number(raw.cx) } : null),
    ...(raw.cy != null ? { cy: Number(raw.cy) } : null),
    ...(raw.cornerRadius != null ? { cornerRadius: Number(raw.cornerRadius) } : null),
    ...(raw.hexInset != null ? { hexInset: Number(raw.hexInset) } : null),
    ...(raw.arrowHead != null ? { arrowHead: Number(raw.arrowHead) } : null),
    ...(raw.arrowShaft != null ? { arrowShaft: Number(raw.arrowShaft) } : null),
    ...(raw.starInset != null ? { starInset: Number(raw.starInset) } : null),
    ...(raw.tailU != null ? { tailU: Number(raw.tailU) } : null),
    ...(raw.tailV != null ? { tailV: Number(raw.tailV) } : null),
    ...(raw.tailWidth != null ? { tailWidth: Number(raw.tailWidth) } : null),
  };
}

function normalizeSignature(raw: Record<string, unknown>): MarkupSignature | null {
  const paths = raw.paths as MarkupSignaturePath[] | undefined;
  if (!Array.isArray(paths) || paths.length === 0) return null;
  const w = Math.max(0.05, Number(raw.w) || 0.35);
  const aspect = Number(raw.aspect) > 0 ? Number(raw.aspect) : w / Math.max(0.04, Number(raw.h) || 0.12);
  const h = Math.max(0.04, Number(raw.h) || w / aspect);
  return {
    kind: 'signature',
    id: String(raw.id ?? ''),
    color: String(raw.color || '#000000'),
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    w,
    h,
    paths: paths
      .filter((p) => p && Array.isArray(p.points) && p.points.length > 0)
      .map((p) => ({
        width: Math.max(0.001, Number(p.width) || 0.02),
        points: p.points.map((pt) => {
          const point: MarkupPoint = { x: Number(pt.x), y: Number(pt.y) };
          if (pt.p != null) point.p = Number(pt.p);
          return point;
        }),
      })),
  };
}

function normalizeSticker(raw: Record<string, unknown>): MarkupSticker | null {
  const emoji = String(raw.emoji ?? '').trim();
  if (!emoji) return null;
  const style = raw.style === 'kaomoji' ? 'kaomoji' : 'emoji';
  const size = Math.max(0.06, Number(raw.w) || Number(raw.h) || 0.18);
  const w = Math.max(0.06, Number(raw.w) || (style === 'kaomoji' ? size * 1.8 : size));
  const h = Math.max(0.06, Number(raw.h) || size);
  return {
    kind: 'sticker',
    id: String(raw.id ?? ''),
    emoji,
    style,
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    w,
    h,
    rotation: Number(raw.rotation) || 0,
  };
}

function normalizeLoupe(raw: Record<string, unknown>): MarkupLoupe | null {
  const radius = Math.min(0.46, Math.max(0.05, Number(raw.radius) || 0.14));
  const mag = Math.min(8, Math.max(1.2, Number(raw.mag) || 2.2));
  return {
    kind: 'loupe',
    id: String(raw.id ?? ''),
    x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : 0.5,
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : 0.5,
    radius,
    mag,
  };
}

export function normalizeMarkup(input?: Partial<MarkupState> | null): MarkupState {
  if (!input?.objects?.length) return createDefaultMarkup();
  const objects: MarkupObject[] = [];
  for (const raw of input.objects as unknown as Record<string, unknown>[]) {
    if (!raw) continue;
    const kind = raw.kind as string | undefined;
    // Phase 1 strokes had no `kind` — treat as stroke when `points` exist.
    if (kind === 'text') {
      const t = normalizeText(raw);
      if (t) objects.push(t);
    } else if (kind === 'shape') {
      const s = normalizeShape(raw);
      if (s) objects.push(s);
    } else if (kind === 'signature') {
      const s = normalizeSignature(raw);
      if (s) objects.push(s);
    } else if (kind === 'sticker') {
      const s = normalizeSticker(raw);
      if (s) objects.push(s);
    } else if (kind === 'loupe') {
      const s = normalizeLoupe(raw);
      if (s) objects.push(s);
    } else if (kind === 'stroke' || Array.isArray(raw.points)) {
      const s = normalizeStroke(raw);
      if (s) objects.push(s);
    }
  }
  return { objects };
}

export function hasMarkup(markup?: MarkupState | null): boolean {
  return Boolean(markup?.objects?.length);
}
