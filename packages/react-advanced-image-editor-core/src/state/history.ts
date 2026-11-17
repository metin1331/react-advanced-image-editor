import type {
  AdjustState,
  CropArea,
  CropShapeSnapshot,
  EditorSnapshot,
  FilterState,
  MarkupState,
  Rotation,
  TransformState,
} from '../types';
import { createDefaultCrop } from '../crop/cropMath';
import { createDefaultAdjust, normalizeAdjust } from '../adjust/adjustments';
import { createDefaultFilter, normalizeFilter } from '../filter/filterLooks';
import { cloneMarkup, createDefaultMarkup, normalizeMarkup } from '../markup/types';
import { createDefaultFill, normalizeFill, type FillState } from '../fill/fillState';
import { cloneRedact, createDefaultRedact, normalizeRedact, type RedactState } from '../redact/redactState';
import { createDefaultFrame, normalizeFrame, type FrameState } from '../frame/frameState';

export function createDefaultTransform(): TransformState {
  return {
    rotation: 0,
    angle: 0,
    flipX: false,
    flipY: false,
    perspectiveX: 0,
    perspectiveY: 0,
  };
}

export { createDefaultAdjust, createDefaultFilter, createDefaultMarkup };

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

function finite(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCrop(raw: unknown, fallback: CropArea): CropArea {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const crop = raw as Partial<CropArea>;
  return {
    x: finite(crop.x, fallback.x),
    y: finite(crop.y, fallback.y),
    zoom: finite(crop.zoom, fallback.zoom),
  };
}

function normalizeTransform(raw: unknown): TransformState {
  const base = createDefaultTransform();
  if (!raw || typeof raw !== 'object') return base;
  const t = raw as Partial<TransformState>;
  const rotation = finite(t.rotation, 0);
  const perspectiveX = finite(t.perspectiveX, 0);
  const perspectiveY = finite(t.perspectiveY, 0);
  return {
    rotation: (ROTATIONS as readonly number[]).includes(rotation) ? (rotation as Rotation) : 0,
    angle: finite(t.angle, 0),
    flipX: Boolean(t.flipX),
    flipY: Boolean(t.flipY),
    perspectiveX: Math.min(1, Math.max(-1, perspectiveX)),
    perspectiveY: Math.min(1, Math.max(-1, perspectiveY)),
  };
}

function normalizeCropShape(raw: unknown): CropShapeSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const shape = raw as Partial<CropShapeSnapshot>;
  if (typeof shape.shape !== 'string' || !shape.shape) return undefined;
  const orientation =
    shape.orientation === 'vertical' || shape.orientation === 'horizontal'
      ? shape.orientation
      : null;
  const aspect = shape.aspect == null ? null : finite(shape.aspect, NaN);
  return {
    shape: shape.shape,
    orientation,
    aspect: aspect != null && Number.isFinite(aspect) && aspect > 0 ? aspect : null,
  };
}

/**
 * Repair a saved edit so a partial or corrupt object cannot poison history.
 * Unknown fields are dropped. Missing tools fall back to a fresh edit.
 */
export function normalizeEditorSnapshot(raw: unknown): EditorSnapshot {
  const base = createInitialSnapshot();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<EditorSnapshot>;
  const cropShape = normalizeCropShape(input.cropShape);
  return {
    crop: normalizeCrop(input.crop, base.crop),
    transform: normalizeTransform(input.transform),
    adjust: normalizeAdjust(input.adjust ?? {}),
    filter: normalizeFilter(input.filter),
    markup: normalizeMarkup(input.markup),
    fill: normalizeFill(input.fill),
    redact: normalizeRedact(input.redact),
    frame: normalizeFrame(input.frame),
    ...(cropShape ? { cropShape } : {}),
  };
}

export function createInitialSnapshot(options?: { zoom?: number }): EditorSnapshot {
  return {
    crop: createDefaultCrop(options?.zoom),
    transform: createDefaultTransform(),
    adjust: createDefaultAdjust(),
    filter: createDefaultFilter(),
    markup: createDefaultMarkup(),
    fill: createDefaultFill(),
    redact: createDefaultRedact(),
    frame: createDefaultFrame(),
  };
}

export interface HistoryState {
  past: EditorSnapshot[];
  present: EditorSnapshot;
  future: EditorSnapshot[];
}

export function createHistory(present?: EditorSnapshot): HistoryState {
  return {
    past: [],
    present: present ?? createInitialSnapshot(),
    future: [],
  };
}

function cloneSnapshot(s: EditorSnapshot): EditorSnapshot {
  return {
    crop: { ...s.crop },
    transform: { ...s.transform },
    adjust: { ...(s.adjust ?? createDefaultAdjust()) },
    filter: { ...(s.filter ?? createDefaultFilter()) },
    markup: cloneMarkup(s.markup ?? createDefaultMarkup()),
    fill: { ...(s.fill ?? createDefaultFill()) },
    redact: cloneRedact(s.redact ?? createDefaultRedact()),
    frame: { ...(s.frame ?? createDefaultFrame()) },
    cropShape: s.cropShape ? { ...s.cropShape } : undefined,
  };
}

export function pushHistory(
  history: HistoryState,
  next: EditorSnapshot
): HistoryState {
  return {
    past: [...history.past, cloneSnapshot(history.present)],
    present: cloneSnapshot(next),
    future: [],
  };
}

export function undoHistory(history: HistoryState): HistoryState {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: cloneSnapshot(previous),
    future: [cloneSnapshot(history.present), ...history.future],
  };
}

export function redoHistory(history: HistoryState): HistoryState {
  if (!history.future.length) return history;
  const next = history.future[0];
  return {
    past: [...history.past, cloneSnapshot(history.present)],
    present: cloneSnapshot(next),
    future: history.future.slice(1),
  };
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

export function updateCrop(history: HistoryState, crop: CropArea): HistoryState {
  return pushHistory(history, { ...history.present, crop: { ...crop } });
}

export function updateTransform(
  history: HistoryState,
  transform: TransformState
): HistoryState {
  return pushHistory(history, { ...history.present, transform: { ...transform } });
}

export function updateAdjust(history: HistoryState, adjust: AdjustState): HistoryState {
  return pushHistory(history, { ...history.present, adjust: { ...adjust } });
}

export function patchCrop(history: HistoryState, crop: CropArea): HistoryState {
  return {
    ...history,
    present: { ...history.present, crop: { ...crop } },
  };
}

export function patchAdjust(history: HistoryState, adjust: AdjustState): HistoryState {
  return {
    ...history,
    present: { ...history.present, adjust: { ...adjust } },
  };
}

export function updateFilter(history: HistoryState, filter: FilterState): HistoryState {
  return pushHistory(history, { ...history.present, filter: { ...filter } });
}

export function patchFilter(history: HistoryState, filter: FilterState): HistoryState {
  return {
    ...history,
    present: { ...history.present, filter: { ...filter } },
  };
}

export function updateMarkup(history: HistoryState, markup: MarkupState): HistoryState {
  return pushHistory(history, {
    ...history.present,
    markup: cloneMarkup(markup),
  });
}

export function updateCropShape(
  history: HistoryState,
  cropShape: EditorSnapshot['cropShape'],
  crop?: CropArea
): HistoryState {
  return pushHistory(history, {
    ...history.present,
    cropShape: cropShape ? { ...cropShape } : undefined,
    ...(crop ? { crop: { ...crop } } : {}),
  });
}

export function patchMarkup(history: HistoryState, markup: MarkupState): HistoryState {
  return {
    ...history,
    present: { ...history.present, markup: cloneMarkup(markup) },
  };
}

export function updateFill(history: HistoryState, fill: FillState): HistoryState {
  return pushHistory(history, { ...history.present, fill: normalizeFill(fill) });
}

export function patchFill(history: HistoryState, fill: FillState): HistoryState {
  return {
    ...history,
    present: { ...history.present, fill: normalizeFill(fill) },
  };
}

export function updateRedact(history: HistoryState, redact: RedactState): HistoryState {
  return pushHistory(history, { ...history.present, redact: normalizeRedact(redact) });
}

export function patchRedact(history: HistoryState, redact: RedactState): HistoryState {
  return {
    ...history,
    present: { ...history.present, redact: normalizeRedact(redact) },
  };
}

export function updateFrame(history: HistoryState, frame: FrameState): HistoryState {
  return pushHistory(history, { ...history.present, frame: normalizeFrame(frame) });
}

export function patchFrame(history: HistoryState, frame: FrameState): HistoryState {
  return {
    ...history,
    present: { ...history.present, frame: normalizeFrame(frame) },
  };
}

export function resetHistory(options?: { zoom?: number }): HistoryState {
  return createHistory(createInitialSnapshot(options));
}

/** Reset as an undoable step; optional cropShape (e.g. keep Freeform). */
export function commitReset(
  history: HistoryState,
  options?: { zoom?: number; cropShape?: EditorSnapshot['cropShape'] },
): HistoryState {
  const next = createInitialSnapshot({ zoom: options?.zoom });
  if (options?.cropShape) {
    next.cropShape = { ...options.cropShape };
  }
  return pushHistory(history, next);
}
