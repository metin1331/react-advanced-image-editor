import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canRedo,
  canUndo,
  createDefaultAdjust,
  createDefaultFilter,
  createDefaultMarkup,
  exportImage,
  getTransformedSize,
  loadImageSource,
  normalizeAdjust,
  normalizeFilter,
  normalizeMarkup,
  patchAdjust,
  patchCrop,
  patchFilter,
  patchMarkup,
  patchFill,
  patchRedact,
  patchFrame,
  redoHistory,
  resetHistory,
  commitReset,
  undoHistory,
  updateAdjust,
  updateCrop,
  updateFilter,
  updateFill,
  updateRedact,
  updateFrame,
  updateMarkup,
  updateCropShape,
  updateTransform,
  type AdjustState,
  type CropArea,
  type CropShapeSnapshot,
  type EditorState,
  type FilterId,
  type FilterState,
  type HistoryState,
  type ImageSource,
  type LoadedImage,
  type MarkupState,
  type Rotation,
  type TransformState,
  type FillState,
  type RedactState,
  type FrameState,
  type FramePresetId,
  createDefaultFill,
  normalizeFill,
  createDefaultRedact,
  normalizeRedact,
  createDefaultFrame,
  normalizeFrame,
  resolveFrameFromPreset,
} from 'react-advanced-image-editor-core';
import type { ExportOptions } from '../types';

export function useImageEditor(
  source: ImageSource | null,
  options?: { initialZoom?: number }
) {
  const initialZoom = options?.initialZoom;
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryState>(() =>
    resetHistory({ zoom: initialZoom })
  );
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const blobUrlRef = useRef<string | undefined>();
  const [viewportSize, setViewportSize] = useState({ width: 400, height: 400 });

  const setViewportRef = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    viewportRef.current = node;

    if (!node) return;

    const updateSize = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) setViewportSize({ width, height });
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(node);
    resizeObserverRef.current = ro;
  }, []);

  useEffect(() => {
    const revokeBlob = () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = undefined;
      }
    };

    if (!source) {
      revokeBlob();
      setLoaded(null);
      setHistory(resetHistory({ zoom: initialZoom }));
      return;
    }

    let cancelled = false;
    setLoaded(null);
    setLoading(true);
    setError(null);

    loadImageSource(source)
      .then((img) => {
        if (cancelled) {
          if (img.blobUrl) URL.revokeObjectURL(img.blobUrl);
          return;
        }
        revokeBlob();
        blobUrlRef.current = img.blobUrl;
        setLoaded(img);
        setHistory(resetHistory({ zoom: initialZoom }));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      revokeBlob();
    };
  }, [source, initialZoom]);

  useEffect(() => {
    return () => resizeObserverRef.current?.disconnect();
  }, []);

  const setCrop = useCallback((crop: CropArea) => {
    setHistory((h) => updateCrop(h, crop));
  }, []);

  const patchCropLive = useCallback((crop: CropArea) => {
    setHistory((h) => patchCrop(h, crop));
  }, []);

  const commitCrop = useCallback((crop: CropArea) => {
    setHistory((h) => updateCrop(h, crop));
  }, []);

  const setTransform = useCallback((transform: TransformState) => {
    setHistory((h) => updateTransform(h, transform));
  }, []);

  const patchTransformLive = useCallback((transform: TransformState) => {
    setHistory((h) => ({
      ...h,
      present: { ...h.present, transform: { ...transform } },
    }));
  }, []);

  const undo = useCallback(() => setHistory((h) => undoHistory(h)), []);
  const redo = useCallback(() => setHistory((h) => redoHistory(h)), []);
  const reset = useCallback(
    () =>
      setHistory((h) => {
        const keepFreeform: CropShapeSnapshot | undefined =
          h.present.cropShape?.shape === 'freeform'
            ? { shape: 'freeform', orientation: null, aspect: null }
            : undefined;
        return commitReset(h, { zoom: initialZoom, cropShape: keepFreeform });
      }),
    [initialZoom],
  );

  const setAngle = useCallback(
    (angle: number, commit = false) => {
      const next = { ...history.present.transform, angle };
      if (commit) setTransform(next);
      else patchTransformLive(next);
    },
    [history.present.transform, setTransform, patchTransformLive]
  );

  /**
   * Keystone correction in [-1, 1] per axis. Stored alongside rotation and
   * flips; the source pixels are never touched, so the value is fully
   * reversible and undo/redo works like any other transform.
   */
  const setPerspective = useCallback(
    (axis: 'x' | 'y', value: number, commit = false) => {
      const clamped = Math.min(1, Math.max(-1, value));
      const next: TransformState = {
        ...history.present.transform,
        perspectiveX: axis === 'x' ? clamped : history.present.transform.perspectiveX,
        perspectiveY: axis === 'y' ? clamped : history.present.transform.perspectiveY,
      };
      if (commit) setTransform(next);
      else patchTransformLive(next);
    },
    [history.present.transform, setTransform, patchTransformLive]
  );

  const setAdjust = useCallback((adjust: AdjustState) => {
    setHistory((h) => updateAdjust(h, normalizeAdjust(adjust)));
  }, []);

  const patchAdjustLive = useCallback((adjust: AdjustState) => {
    setHistory((h) => patchAdjust(h, normalizeAdjust(adjust)));
  }, []);

  /**
   * Single calibrate channel in [-1, 1]. Applied to the cropped frame only —
   * never mutates the original source pixels.
   */
  const setAdjustChannel = useCallback(
    (channel: keyof AdjustState, value: number, commit = false) => {
      const current = history.present.adjust ?? createDefaultAdjust();
      const next = normalizeAdjust({ ...current, [channel]: value });
      if (commit) setAdjust(next);
      else patchAdjustLive(next);
    },
    [history.present.adjust, setAdjust, patchAdjustLive]
  );

  const filter = history.present.filter ?? createDefaultFilter();

  const setFilter = useCallback((next: Partial<FilterState>, commit = false) => {
    const value = normalizeFilter(next);
    setHistory((h) => (commit ? updateFilter(h, value) : patchFilter(h, value)));
  }, []);

  /**
   * Pick a look. Selecting a different filter restores full intensity — the
   * where the slider jumps back to 100 on every new
   * pick and only the *current* look remembers a pulled-back value.
   */
  const setFilterId = useCallback(
    (id: FilterId, commit = false) => {
      const current = history.present.filter ?? createDefaultFilter();
      const intensity = id === current.id ? current.intensity : 1;
      setFilter({ id, intensity }, commit);
    },
    [history.present.filter, setFilter]
  );

  /** Look strength in [0, 1]. Live during the drag, committed on release. */
  const setFilterIntensity = useCallback(
    (intensity: number, commit = false) => {
      const current = history.present.filter ?? createDefaultFilter();
      setFilter({ id: current.id, intensity }, commit);
    },
    [history.present.filter, setFilter]
  );

  const markup = history.present.markup ?? createDefaultMarkup();

  /** Replace markup (commit = history step; false = live patch). */
  const setMarkup = useCallback((next: MarkupState, commit = true) => {
    const value = normalizeMarkup(next);
    setHistory((h) => (commit ? updateMarkup(h, value) : patchMarkup(h, value)));
  }, []);

  /** Commit a completed stroke / erase (always one undo step). */
  const commitMarkup = useCallback((next: MarkupState) => {
    setHistory((h) => updateMarkup(h, normalizeMarkup(next)));
  }, []);

  const setCropShape = useCallback((cropShape: CropShapeSnapshot | undefined, crop?: CropArea) => {
    setHistory((h) => updateCropShape(h, cropShape, crop));
  }, []);

  const fill = history.present.fill ?? createDefaultFill();

  const setFill = useCallback((next: Partial<FillState>, commit = true) => {
    const value = normalizeFill({ ...history.present.fill, ...next });
    setHistory((h) => (commit ? updateFill(h, value) : patchFill(h, value)));
  }, [history.present.fill]);

  const redact = history.present.redact ?? createDefaultRedact();

  const setRedact = useCallback((next: RedactState, commit = true) => {
    const value = normalizeRedact(next);
    setHistory((h) => (commit ? updateRedact(h, value) : patchRedact(h, value)));
  }, []);

  const commitRedact = useCallback((next: RedactState) => {
    setHistory((h) => updateRedact(h, normalizeRedact(next)));
  }, []);

  const frame = history.present.frame ?? createDefaultFrame();

  const setFramePreset = useCallback((preset: FramePresetId, commit = true) => {
    const value = resolveFrameFromPreset(preset);
    setHistory((h) => (commit ? updateFrame(h, value) : patchFrame(h, value)));
  }, []);

  const setFrame = useCallback((next: Partial<FrameState>, commit = true) => {
    const value = normalizeFrame({ ...history.present.frame, ...next });
    setHistory((h) => (commit ? updateFrame(h, value) : patchFrame(h, value)));
  }, [history.present.frame]);

  const rotate = useCallback(
    (delta: 90 | -90) => {
      const rot = history.present.transform.rotation;
      const next = (((rot + delta) % 360) + 360) % 360 as Rotation;
      setTransform({ ...history.present.transform, rotation: next });
    },
    [history.present.transform, setTransform]
  );

  const flip = useCallback(
    (axis: 'x' | 'y') => {
      const t = history.present.transform;
      setTransform({
        ...t,
        flipX: axis === 'x' ? !t.flipX : t.flipX,
        flipY: axis === 'y' ? !t.flipY : t.flipY,
      });
    },
    [history.present.transform, setTransform]
  );

  const getEditorState = useCallback((): EditorState | null => {
    if (!loaded) return null;
    return { image: loaded, ...history.present };
  }, [loaded, history.present]);

  const getMediaSize = useCallback(() => {
    if (!loaded) return { width: 0, height: 0 };
    return getTransformedSize(
      loaded.width,
      loaded.height,
      loaded.orientation,
      history.present.transform.rotation
    );
  }, [loaded, history.present.transform.rotation]);

  const [cropFrameSize, setCropFrameSize] = useState<{ width: number; height: number } | null>(
    null
  );

  const exportEdited = useCallback(
    async (aspectRatio: number | null, options?: ExportOptions) => {
      const state = getEditorState();
      if (!state) throw new Error('No image loaded');
      const cw = cropFrameSize?.width || viewportSize.width;
      const ch = cropFrameSize?.height || viewportSize.height;
      return exportImage(state, aspectRatio, cw, ch, options);
    },
    [getEditorState, viewportSize, cropFrameSize]
  );

  return {
    loaded,
    loading,
    error,
    crop: history.present.crop,
    transform: history.present.transform,
    adjust: history.present.adjust ?? createDefaultAdjust(),
    filter,
    markup,
    fill,
    redact,
    frame,
    setCrop,
    patchCropLive,
    commitCrop,
    setTransform,
    patchTransformLive,
    setAngle,
    setPerspective,
    setAdjust,
    patchAdjustLive,
    setAdjustChannel,
    setFilter,
    setFilterId,
    setFilterIntensity,
    setMarkup,
    commitMarkup,
    setFill,
    setRedact,
    commitRedact,
    setFramePreset,
    setFrame,
    setCropShape,
    undo,
    redo,
    reset,
    rotate,
    flip,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    cropShape: history.present.cropShape,
    viewportRef,
    setViewportRef,
    viewportSize,
    cropFrameSize,
    setCropFrameSize,
    getMediaSize,
    exportEdited,
  };
}

export type UseImageEditorReturn = ReturnType<typeof useImageEditor>;
