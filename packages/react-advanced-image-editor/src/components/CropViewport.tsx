import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  createDefaultAdjust,
  createDefaultFilter,
  createDefaultMarkup,
  createDefaultRuler,
  hasAdjustments,
  hasFill,
  hasFilter,
  hasFrame,
  hasMarkup,
  hasRedact,
  perspectiveCssTransform,
  computeFrameLayout,
  type AdjustState,
  type CropArea,
  type EraserMode,
  type FillState,
  type FilterState,
  type FrameState,
  type LoadedImage,
  type MarkupRuler,
  type MarkupShapeKind,
  type MarkupSignatureTemplate,
  type MarkupState,
  type MarkupTextAlign,
  type MarkupTool,
  type RedactState,
  type RedactStyle,
  type TransformState,
  renderToCanvas,
  DEFAULT_REDACT_BRUSH_WIDTH,
  DEFAULT_REDACT_STRENGTH,
} from 'react-advanced-image-editor-core';
import {
  constrainCropToImage,
  constrainZoomOnly,
  cropsEqual,
  zoomBounds,
  type CoverageGeometry,
} from '../crop/cropConstraint';
import {
  computeCropFrameSize,
  FRAME_EDGE_PAD,
  MAX_FRAME_SCALE,
  MIN_FRAME_SCALE,
  projectHandleResize,
  type CropHandle as FrameCropHandle,
  type FrameRect,
} from '../crop/cropFrameResize';
import { CROP_FADE_REVEAL_FADE_MS } from '../crop/cropFade';
import {
  MODE_TRANSITION_MS,
  sampleModeTransitionToLiveTarget,
  type ViewportRect,
} from '../crop/modeTransitionVisual';
import {
  CROP_OUTSIDE_HIDE_FADE_DELAY_MS,
  CROP_OUTSIDE_HIDE_FADE_EASE,
  CROP_OUTSIDE_HIDE_FADE_MS,
  CROP_OUTSIDE_HIDE_HOLD_MS,
  CROP_OUTSIDE_REVEAL_FADE_DELAY_MS,
  CROP_OUTSIDE_REVEAL_FADE_EASE,
  CROP_OUTSIDE_REVEAL_FADE_MS,
  CROP_OUTSIDE_REVEAL_HOLD_MS,
} from '../crop/cropOutsideFade';
import { attachPointerHeld } from '../crop/pointerHeld';
import type { CropGuide, ImageEditorFont } from '../types';
import { AdjustGlLayer } from './AdjustGlLayer';
import { FrameLiveChrome } from './FrameLiveChrome';
import { MarkupLayer } from './MarkupLayer';
import { MarkupEyedropLayer } from './MarkupEyedropLayer';
import { RedactLayer } from './RedactLayer';

export { computeCropFrameSize } from '../crop/cropFrameResize';

/** Hold before reveal / hold before hide — matches outside-crop overlay sequencing. */
function useTimedVisible(
  target: boolean,
  revealHoldMs: number,
  hideHoldMs: number,
): boolean {
  const [visible, setVisible] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!target) {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        setVisible(false);
      }, hideHoldMs);
      return () => {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      };
    }

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = null;
      setVisible(true);
    }, revealHoldMs);

    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [target, revealHoldMs, hideHoldMs]);

  return visible;
}

/**
 * =============================================================================
 * MOBILE / NATIVE PORT NOTES (read before adapting to React Native / Flutter)
 * =============================================================================
 * 1) IMAGE SCALE (crop.zoom ↔ Scale ruler 0–100)
 *    - Only change from gestures whose pointer/touch is INSIDE this preview
 *      viewport (wheel / trackpad / pinch). Never attach global window listeners
 *      for zoom — modal chrome, rulers, and topbar must not zoom the image.
 *    - Web: `pointerInsideRef` + wheel listener on the viewport node.
 *    - Mobile web / native: scope the pinch recognizer to the preview surface.
 *
 * 2) CROP FRAME HANDLES (8 L / edge bars)
 *    - Handles resize the crop WINDOW (`frameScale`), they must NOT feel like
 *      pinch-zoom. When the frame size changes, compensate `crop.zoom` so the
 *      on-screen image pixel size stays stable.
 *    - Preset-locked aspect (e.g. profile 1:1) stays locked. Freeform defaults
 *      to the *media* aspect so open looks correct without dragging handles.
 *
 * 3) DEFAULT FRAME ASPECT
 *    - If `aspectRatio` is null → use mediaWidth/mediaHeight (16:9 photo → 16:9
 *      preview). If the preset sets an aspect, honor it.
 *
 * 4) COVERAGE CONSTRAINT (rotation + scale + translation)
 *    - All three are solved together by `constrainCropToImage` (see
 *      `crop/cropConstraint.ts`) — a closed-form projection, not a clamp loop.
 *    - Every gesture frame computes the RAW transform from the gesture's start
 *      state plus the total delta, then projects it once. Never re-modify an
 *      already-projected transform: that is what causes drift and jitter.
 *    - Rendering always uses the projected transform, so an invalid frame is
 *      never painted and there is no one-frame overshoot to correct.
 *
 * 5) PERSPECTIVE (keystone)
 *    - `transform.perspectiveX/Y` are rendered as a real homography via CSS
 *      `matrix3d`, built by the core so preview and export cannot diverge.
 *      A native port needs the equivalent projective transform (e.g. an
 *      `SKMatrix` with persp0/persp1, or a CATransform3D with m14/m24 set) —
 *      an affine shear is NOT a substitute.
 *    - The keystoned outline is a convex quad, so the coverage constraint
 *      switches to its polygon path; both are driven by the same numbers.
 *
 * 6) CALIBRATE (Adjust) — color adjustments on the CROPPED frame
 *    - `adjust` is graded by `AdjustGlLayer` (WebGL): crop geometry is baked
 *      into a texture when framing changes; slider drags only update shader
 *      uniforms. No CSS filters. Warmth/Tint use Bradford CAT (see core
 *      `whiteBalance.ts`). Export uses the same shader after `renderToCanvas`.
 *    - In `calibrateMode` crop handles/grid/border are hidden; pan / pinch
 *      still zoom the graded composition for inspection.
 * =============================================================================
 */

export type CropHandle = FrameCropHandle;

function isCropHandleMode(
  mode: 'none' | 'pan' | 'pinch' | CropHandle,
): mode is CropHandle {
  return mode !== 'none' && mode !== 'pan' && mode !== 'pinch';
}

type HandleDragVisual = {
  desired: FrameRect;
  imageLeft: number;
  imageTop: number;
  imageW: number;
  imageH: number;
};

export type ViewInspectGestures = {
  beginPan: (clientX: number, clientY: number) => void;
  movePan: (clientX: number, clientY: number) => void;
  beginPinch: (a: { x: number; y: number }, b: { x: number; y: number }) => void;
  movePinch: (a: { x: number; y: number }, b: { x: number; y: number }) => void;
  end: () => void;
};

type Props = {
  imageUrl: string;
  /** Needed for WebGL adjust preview (cropped-frame bake). */
  loadedImage?: LoadedImage | null;
  mediaWidth: number;
  mediaHeight: number;
  crop: CropArea;
  transform: TransformState;
  aspectRatio: number | null;
  /**
   * Freeform: corner/edge handles may change the frame aspect.
   * When false (default), handles only scale the window at a locked ratio.
   */
  freeform?: boolean;
  /** Fired while freeform handles change the live aspect (not a history step). */
  onFreeAspectChange?: (aspect: number) => void;
  guides?: CropGuide[];
  interactionMode?: 'pan' | 'selection';
  cropOutsideImage?: boolean;
  minZoom?: number;
  maxZoom?: number;
  showHandles?: boolean;
  showGrid?: boolean;
  /** True while the rotation ruler is being scrubbed — shows the 9×9 grid. */
  rotationInteracting?: boolean;
  /**
   * Color adjustments for the Calibrate tool. Graded on GPU over the cropped
   * frame; export uses the same WebGL path after `renderToCanvas`.
   */
  adjust?: AdjustState;
  /** Filter look for the Filter tool; graded in the same GPU pass as `adjust`. */
  filter?: FilterState;
  /**
   * Non-crop tool mode (Calibrate / Filter / Markup):
   * hide crop chrome + faded source, show the graded composition against the
   * mask edges. Pan/pinch stay on for Calibrate/Filter; Markup captures draw.
   */
  calibrateMode?: boolean;
  /** When true, drawing gestures go to MarkupLayer (inspect via layer callbacks). */
  markupActive?: boolean;
  /** When true, gestures go to RedactLayer (inspect via layer callbacks). */
  redactActive?: boolean;
  fill?: FillState;
  editorFrame?: FrameState;
  redact?: RedactState;
  redactStyle?: RedactStyle;
  redactInteractMode?: 'move' | 'draw';
  redactSelectedId?: string | null;
  redactBrushWidth?: number;
  redactStrength?: number;
  redactDrawMode?: import('./RedactLayer').RedactDrawMode;
  onRedactCommit?: (next: RedactState) => void;
  onRedactSelectedChange?: (id: string | null) => void;
  markup?: MarkupState;
  markupTool?: MarkupTool;
  markupEraserMode?: EraserMode;
  markupColor?: string;
  markupStrokeWidth?: number;
  markupStrokeOpacity?: number;
  markupShapeKind?: MarkupShapeKind;
  markupTextAlign?: MarkupTextAlign;
  markupRuler?: MarkupRuler;
  markupSelectedIds?: string[];
  markupSignatureTemplate?: MarkupSignatureTemplate | null;
  shapeBadgeLabels?: Partial<import('./MarkupShapeBadge').MarkupShapeBadgeLabels>;
  textBadgeLabels?: Partial<import('./MarkupTextBadge').MarkupTextBadgeLabels>;
  markupFonts?: ImageEditorFont[];
  placeRequest?: { kind: 'text' | 'shape' | 'loupe'; key: number } | null;
  eyedropActive?: boolean;
  onEyedropColor?: (color: string) => void;
  onEyedropEnd?: () => void;
  onMarkupRulerChange?: (ruler: MarkupRuler) => void;
  onMarkupSelectedIdsChange?: (ids: string[]) => void;
  onMarkupCommit?: (next: MarkupState) => void;
  /**
   * Label for the compare-original badge shown briefly after tapping the photo
   * in Calibrate / Filter to peek at the ungraded crop.
   */
  compareOriginalLabel?: string;
  /**
   * Resets the compare-original peek when the non-crop tool changes
   * (e.g. Calibrate ↔ Filter) without unmounting the viewport.
   */
  previewToolId?: string;
  /**
   * Ends the original peek when the user picks another calibrate channel or
   * filter tile — coming back later must show the graded image again.
   */
  compareResetKey?: string;
  frameScale?: number;
  onFrameScaleChange?: (scale: number) => void;
  onFrameSizeChange?: (size: { width: number; height: number }) => void;
  onCropChange: (crop: CropArea) => void;
  onCropCommit?: (crop: CropArea) => void;
  /**
   * Crop tool only: after a hold on a handle or pan gesture, fade chrome out;
   * fade back in when the gesture ends. Driven by the shared hold-fade hook.
   */
  onChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onChromeHoldFadeEnd?: () => void;
  /** Markup draw gestures — viewport chrome fade. */
  onMarkupChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onMarkupChromeHoldFadeEnd?: () => void;
  /** Redact canvas gestures — selective toolbar fade. */
  onRedactChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onRedactChromeHoldFadeEnd?: () => void;
  /** Mode id kept visible on the strip while chrome fades (crop tool). */
  chromeHoldFadeFocus?: string | null;
  /** Valid zoom range for the current geometry — drives the Scale ruler. */
  onZoomBoundsChange?: (bounds: { min: number; max: number }) => void;
  /**
   * Increment to arm a viewport-fit settle (Reset). The next `onCropFitArmed`
   * runs after transitions are enabled so the image animates instead of snapping.
   */
  cropFitNonce?: number;
  onCropFitArmed?: () => void;
  /**
   * Increment when switching Crop ↔ preview tools. Uses the same settle path as
   * Reset so frame/image motion stays center-based and proportional.
   */
  modeTransitionNonce?: number;
  /** Target mode for the in-flight `modeTransitionNonce` transition. */
  modeTransitionTarget?: 'crop' | 'preview';
  onModeTransitionArmed?: () => void;
  viewportRef: React.Ref<HTMLDivElement>;
  viewportWidth: number;
  viewportHeight: number;
  classNames?: {
    viewport?: string;
    canvas?: string;
    cropOverlay?: string;
    cropGuide?: string;
  };
};

/** Prefer preset lock; otherwise match the loaded image (16:9 → 16:9 frame). */
export function resolveFrameAspect(
  aspectRatio: number | null | undefined,
  mediaWidth: number,
  mediaHeight: number
): number | null {
  if (aspectRatio && aspectRatio > 0) return aspectRatio;
  if (mediaWidth > 0 && mediaHeight > 0) return mediaWidth / mediaHeight;
  return null;
}

type GestureStart = {
  crop: CropArea;
  frameScale: number;
  pointer: { x: number; y: number };
  pinchDist: number;
  /** Calibrate inspection view (CSS), not crop.zoom. */
  viewZoom: number;
  viewPan: { x: number; y: number };
  /** Frame aspect at gesture start (freeform handle drags). */
  aspect: number;
  /** Screen-space crop rect at gesture start (handle anchoring). */
  frame: FrameRect;
};

/** Inspection zoom in Calibrate — compositor-only, never rebakes the GL crop. */
const VIEW_ZOOM_MIN = 1;
const VIEW_ZOOM_MAX = 6;
/** Trackpad / wheel sensitivity for Calibrate inspection zoom (CSS only). */
const VIEW_WHEEL_SENS = 0.005;
/** Max pointer travel (px) that still counts as a tap for compare-original. */
const COMPARE_TAP_SLOP = 10;
/** How long the "Original" badge stays fully visible before fading out. */
const COMPARE_BADGE_MS = 100;

export function CropViewport({
  imageUrl,
  loadedImage = null,
  mediaWidth,
  mediaHeight,
  crop,
  transform,
  aspectRatio,
  freeform = false,
  onFreeAspectChange,
  guides = [],
  cropOutsideImage = false,
  minZoom = 1,
  maxZoom = 4,
  showHandles = true,
  showGrid = true,
  rotationInteracting = false,
  adjust: adjustProp,
  filter,
  calibrateMode = false,
  markupActive = false,
  redactActive = false,
  fill,
  editorFrame,
  redact,
  redactStyle = 'pixelate',
  redactInteractMode = 'draw',
  redactSelectedId = null,
  redactBrushWidth = DEFAULT_REDACT_BRUSH_WIDTH,
  redactStrength = DEFAULT_REDACT_STRENGTH,
  redactDrawMode = 'rect',
  onRedactCommit,
  onRedactSelectedChange,
  markup: markupProp,
  markupTool = 'move',
  markupEraserMode = 'pixel',
  markupColor = '#ff3b30',
  markupStrokeWidth = 0.012,
  markupStrokeOpacity = 1,
  markupShapeKind = 'rect',
  markupTextAlign = 'left',
  markupRuler,
  markupSelectedIds = [],
  markupSignatureTemplate = null,
  shapeBadgeLabels,
  textBadgeLabels,
  markupFonts,
  placeRequest,
  eyedropActive = false,
  onEyedropColor,
  onEyedropEnd,
  onMarkupRulerChange,
  onMarkupSelectedIdsChange,
  onMarkupCommit,
  compareOriginalLabel = 'Original',
  previewToolId,
  compareResetKey,
  frameScale = 1,
  onFrameScaleChange,
  onFrameSizeChange,
  onCropChange,
  onCropCommit,
  onChromeHoldFadeBegin,
  onChromeHoldFadeEnd,
  onMarkupChromeHoldFadeBegin,
  onMarkupChromeHoldFadeEnd,
  onRedactChromeHoldFadeBegin,
  onRedactChromeHoldFadeEnd,
  chromeHoldFadeFocus = null,
  onZoomBoundsChange,
  cropFitNonce = 0,
  onCropFitArmed,
  modeTransitionNonce = 0,
  modeTransitionTarget = 'crop',
  onModeTransitionArmed,
  viewportRef,
  viewportWidth,
  viewportHeight,
  classNames = {},
}: Props) {
  const adjust = adjustProp ?? createDefaultAdjust();
  const grading = hasAdjustments(adjust) || hasFilter(filter);
  /**
   * Tap-to-compare in Calibrate / Filter: show the crop with no grade/filter
   * until the user taps again. The badge fades on its own; the peek does not.
   */
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [compareBadgeVisible, setCompareBadgeVisible] = useState(false);
  const compareBadgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragMode = useRef<'none' | 'pan' | 'pinch' | CropHandle>('none');
  const gestureStart = useRef<GestureStart | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [interacting, setInteracting] = useState(false);
  const [handleDragVisual, setHandleDragVisual] = useState<HandleDragVisual | null>(
    null,
  );
  const [cropSettling, setCropSettling] = useState(false);
  /** Crop overlay chrome visibility — sequenced during Crop ↔ preview transitions. */
  const [cropOverlayVisible, setCropOverlayVisible] = useState(true);
  /** Center-lerped frame/img rects during Crop ↔ preview mode transitions. */
  const [modeTransitionVisual, setModeTransitionVisual] = useState<{
    frame: ViewportRect;
    img: ViewportRect;
  } | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleRafRef = useRef<number | null>(null);
  const settleCompleteRef = useRef<(() => void) | null>(null);
  const modeTransitionAnimRef = useRef<number | null>(null);
  const modeTransitionPendingRef = useRef<{
    nonce: number;
    start: { frame: ViewportRect; img: ViewportRect };
  } | null>(null);
  const modeTransitionArmedRef = useRef(false);
  const modeTransitionTargetRef = useRef(modeTransitionTarget);
  modeTransitionTargetRef.current = modeTransitionTarget;
  const [modeTransitionGo, setModeTransitionGo] = useState(0);
  const glBakeRef = useRef({ width: 1, height: 1 });
  const viewportNodeRef = useRef<HTMLDivElement | null>(null);
  const handleDragVisualRef = useRef<HandleDragVisual | null>(null);
  handleDragVisualRef.current = handleDragVisual;
  const onCropFitArmedRef = useRef(onCropFitArmed);
  onCropFitArmedRef.current = onCropFitArmed;
  const onModeTransitionArmedRef = useRef(onModeTransitionArmed);
  onModeTransitionArmedRef.current = onModeTransitionArmed;
  /**
   * True while the cursor/finger is over the preview. Wheel/trackpad zoom is
   * gated on this so scrolling the ruler or page chrome never scales the image.
   */
  const pointerInsideRef = useRef(false);
  const wheelFadeActiveRef = useRef(false);
  const wheelFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wheelScaleActive, setWheelScaleActive] = useState(false);
  const wheelScaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chromeHoldFadeEnabled =
    !calibrateMode && !markupActive && !redactActive && Boolean(onChromeHoldFadeBegin);

  const beginHoldFade = useCallback(() => {
    if (!chromeHoldFadeEnabled) return;
    onChromeHoldFadeBegin?.(chromeHoldFadeFocus, () =>
      dragMode.current !== 'none' ||
      pointers.current.size > 0 ||
      wheelFadeActiveRef.current,
    );
  }, [
    chromeHoldFadeEnabled,
    onChromeHoldFadeBegin,
    chromeHoldFadeFocus,
  ]);

  const endHoldFadeGesture = useCallback(() => {
    if (!onChromeHoldFadeEnd) return;
    onChromeHoldFadeEnd();
  }, [onChromeHoldFadeEnd]);

  const pulseWheelHoldFade = useCallback(() => {
    if (!chromeHoldFadeEnabled) return;
    beginHoldFade();
    // Fingers / touchpad contact still down — movement stopping is not release.
    if (dragMode.current !== 'none' || pointers.current.size > 0) {
      wheelFadeActiveRef.current = false;
      if (wheelFadeTimerRef.current) {
        clearTimeout(wheelFadeTimerRef.current);
        wheelFadeTimerRef.current = null;
      }
      return;
    }
    wheelFadeActiveRef.current = true;
    if (wheelFadeTimerRef.current) clearTimeout(wheelFadeTimerRef.current);
    wheelFadeTimerRef.current = setTimeout(() => {
      wheelFadeTimerRef.current = null;
      wheelFadeActiveRef.current = false;
      if (dragMode.current !== 'none' || pointers.current.size > 0) return;
      endHoldFadeGesture();
    }, 140);
  }, [chromeHoldFadeEnabled, beginHoldFade, endHoldFadeGesture]);

  const pulseWheelScaleActive = useCallback(() => {
    setWheelScaleActive(true);
    if (wheelScaleTimerRef.current) clearTimeout(wheelScaleTimerRef.current);
    wheelScaleTimerRef.current = setTimeout(() => {
      wheelScaleTimerRef.current = null;
      setWheelScaleActive(false);
    }, 140);
  }, []);

  const clearSettleTimers = useCallback(() => {
    if (settleRafRef.current != null) {
      cancelAnimationFrame(settleRafRef.current);
      settleRafRef.current = null;
    }
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const armCropSettle = useCallback(() => {
    clearSettleTimers();
    setCropSettling(true);
  }, [clearSettleTimers]);

  const finishCropSettle = useCallback((onComplete?: () => void) => {
    if (onComplete) settleCompleteRef.current = onComplete;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setCropSettling(false);
      settleCompleteRef.current?.();
      settleCompleteRef.current = null;
    }, CROP_FADE_REVEAL_FADE_MS);
  }, []);

  useEffect(
    () => () => {
      clearSettleTimers();
      if (modeTransitionAnimRef.current) {
        cancelAnimationFrame(modeTransitionAnimRef.current);
        modeTransitionAnimRef.current = null;
      }
    },
    [clearSettleTimers],
  );

  const vw = viewportWidth;
  const vh = viewportHeight;
  const mw = mediaWidth;
  const mh = mediaHeight;

  const mediaAspect = mw > 0 && mh > 0 ? mw / mh : 1;
  /** Live freeform aspect while unlocked; reset when leaving freeform. */
  const [freeAspect, setFreeAspect] = useState<number | null>(null);

  useEffect(() => {
    if (!freeform) setFreeAspect(null);
  }, [freeform]);

  const frameAspect = useMemo(() => {
    if (freeform) {
      if (freeAspect && freeAspect > 0) return freeAspect;
      if (aspectRatio && aspectRatio > 0) return aspectRatio;
      return mediaAspect;
    }
    return resolveFrameAspect(aspectRatio, mw, mh);
  }, [freeform, freeAspect, aspectRatio, mediaAspect, mw, mh]);

  const angleDeg = (transform.angle ?? 0) + transform.rotation;
  const perspectiveX = transform.perspectiveX ?? 0;
  const perspectiveY = transform.perspectiveY ?? 0;

  /** Geometry for a given frame scale — the single source of truth for limits. */
  const geometryFor = useCallback(
    (fScale: number, aspect = frameAspect): CoverageGeometry & { frame: ReturnType<typeof computeCropFrameSize> } => {
      const frame = computeCropFrameSize(vw, vh, aspect, fScale);
      const cover =
        mw > 0 && mh > 0 ? Math.max(frame.width / mw, frame.height / mh) : 1;
      return {
        mediaWidth: mw,
        mediaHeight: mh,
        frameWidth: frame.width,
        frameHeight: frame.height,
        angleDeg,
        cover,
        maxZoom,
        perspectiveX,
        perspectiveY,
        frame,
      };
    },
    [vw, vh, frameAspect, mw, mh, angleDeg, maxZoom, perspectiveX, perspectiveY]
  );

  /** Single projection used during the gesture and after it — identical math. */
  const project = useCallback(
    (raw: CropArea, g: CoverageGeometry): CropArea =>
      cropOutsideImage
        ? constrainZoomOnly(raw, minZoom, maxZoom)
        : constrainCropToImage(raw, g),
    [cropOutsideImage, minZoom, maxZoom]
  );

  const boundsFor = useCallback(
    (g: CoverageGeometry) =>
      cropOutsideImage ? { min: minZoom, max: maxZoom } : zoomBounds(g),
    [cropOutsideImage, minZoom, maxZoom]
  );

  const geometry = geometryFor(frameScale);
  const frame = geometry.frame;

  /**
   * The zoom the user actually asked for, kept separate from the coverage
   * minimum. Rotating raises the rendered zoom to keep the frame covered;
   * rotating back must release it again instead of ratcheting up on every
   * sweep of the ruler.
   */
  const userZoomRef = useRef(crop.zoom);
  const lastAppliedZoomRef = useRef(crop.zoom);
  if (Math.abs(crop.zoom - lastAppliedZoomRef.current) > 1e-6) {
    // Zoom was set from outside (scale ruler, reset, undo) → new intent.
    userZoomRef.current = crop.zoom;
  }

  // Render from the projected transform: an invalid frame is never painted.
  const safeCrop = project({ ...crop, zoom: userZoomRef.current }, geometry);
  lastAppliedZoomRef.current = safeCrop.zoom;

  const latestCrop = useRef(safeCrop);
  latestCrop.current = safeCrop;
  const latestFrameScale = useRef(frameScale);
  latestFrameScale.current = frameScale;

  const fitCropToViewport = useCallback(
    (source: CropArea) => {
      const aspect =
        freeform && freeAspect && freeAspect > 0 ? freeAspect : frameAspect;
      const fullGeom = geometryFor(MAX_FRAME_SCALE, aspect);
      const fitted = project(source, fullGeom);
      latestFrameScale.current = MAX_FRAME_SCALE;
      latestCrop.current = fitted;
      userZoomRef.current = fitted.zoom;
      lastAppliedZoomRef.current = fitted.zoom;
      onFrameScaleChange?.(MAX_FRAME_SCALE);
      onCropChange(fitted);
      onCropCommit?.(fitted);
    },
    [
      freeform,
      freeAspect,
      frameAspect,
      geometryFor,
      project,
      onFrameScaleChange,
      onCropChange,
      onCropCommit,
    ],
  );

  useEffect(() => {
    if (cropFitNonce === 0) return;
    armCropSettle();
    settleRafRef.current = requestAnimationFrame(() => {
      settleRafRef.current = requestAnimationFrame(() => {
        settleRafRef.current = null;
        setFreeAspect(null);
        onCropFitArmedRef.current?.();
        finishCropSettle();
      });
    });
  }, [cropFitNonce, armCropSettle, finishCropSettle]);

  useEffect(() => {
    if (modeTransitionNonce === 0) return;
    if (modeTransitionTarget === 'preview') {
      setCropOverlayVisible(true);
    } else {
      setCropOverlayVisible(false);
    }

    const metrics = frameMetricsRef.current;
    const start = {
      frame: {
        left: metrics.frame.left,
        top: metrics.frame.top,
        width: metrics.frame.width,
        height: metrics.frame.height,
      },
      img: {
        left: metrics.imgLeft,
        top: metrics.imgTop,
        width: metrics.displayW,
        height: metrics.displayH,
      },
    };
    modeTransitionPendingRef.current = {
      nonce: modeTransitionNonce,
      start,
    };
    modeTransitionArmedRef.current = false;
    if (modeTransitionAnimRef.current) {
      cancelAnimationFrame(modeTransitionAnimRef.current);
      modeTransitionAnimRef.current = null;
    }
    // Hold the outgoing rect immediately so ResizeObserver / chrome-slot
    // height ticks cannot jump the photo before the lerp starts.
    setModeTransitionVisual(start);

    armCropSettle();
    settleRafRef.current = requestAnimationFrame(() => {
      settleRafRef.current = requestAnimationFrame(() => {
        settleRafRef.current = null;
        onModeTransitionArmedRef.current?.();
        modeTransitionArmedRef.current = true;
        setModeTransitionGo((n) => n + 1);
        if (modeTransitionTarget === 'preview') {
          setCropOverlayVisible(false);
          finishCropSettle();
        }
      });
    });
  }, [
    modeTransitionNonce,
    modeTransitionTarget,
    armCropSettle,
    finishCropSettle,
  ]);

  /**
   * Calibrate inspection zoom/pan is applied directly to the DOM so wheel /
   * pinch never re-render React. Changing crop.zoom would re-bake GL every tick.
   */
  const viewZoomRef = useRef(1);
  const viewPanRef = useRef({ x: 0, y: 0 });
  const viewInnerRef = useRef<HTMLDivElement | null>(null);
  const wheelCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyViewTransform = useCallback(() => {
    const el = viewInnerRef.current;
    if (!el) return;
    const z = viewZoomRef.current;
    const { x, y } = viewPanRef.current;
    el.style.transform =
      z <= 1.001 && Math.abs(x) < 0.5 && Math.abs(y) < 0.5
        ? ''
        : `translate(${x}px, ${y}px) scale(${z})`;
    el.style.willChange = z > 1.001 ? 'transform' : '';

    // Crisp samples past 1:1 with the baked pixels.
    const canvas = el.querySelector(
      '[data-ie-part="adjust-gl"]'
    ) as HTMLCanvasElement | null;
    if (canvas) {
      const native = Number(canvas.dataset.ieNativeScale || '1');
      canvas.style.imageRendering =
        z > native * 1.02 ? 'pixelated' : 'auto';
    }
  }, []);

  /** Shared by Markup/Redact layers: Space/middle-drag pan + two-finger pinch. */
  const inspectGesture = useRef<{
    mode: 'pan' | 'pinch' | null;
    originX: number;
    originY: number;
    panX: number;
    panY: number;
    zoom: number;
    dist: number;
    midX: number;
    midY: number;
  } | null>(null);

  const beginInspectPan = useCallback((clientX: number, clientY: number) => {
    inspectGesture.current = {
      mode: 'pan',
      originX: clientX,
      originY: clientY,
      panX: viewPanRef.current.x,
      panY: viewPanRef.current.y,
      zoom: viewZoomRef.current,
      dist: 0,
      midX: clientX,
      midY: clientY,
    };
  }, []);

  const moveInspectPan = useCallback(
    (clientX: number, clientY: number) => {
      const g = inspectGesture.current;
      if (!g || g.mode !== 'pan') return;
      if (viewZoomRef.current <= 1.001) return;
      viewPanRef.current = {
        x: g.panX + (clientX - g.originX),
        y: g.panY + (clientY - g.originY),
      };
      applyViewTransform();
    },
    [applyViewTransform]
  );

  const beginInspectPinch = useCallback(
    (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
      inspectGesture.current = {
        mode: 'pinch',
        originX: a.x,
        originY: a.y,
        panX: viewPanRef.current.x,
        panY: viewPanRef.current.y,
        zoom: viewZoomRef.current,
        dist,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
    },
    []
  );

  const moveInspectPinch = useCallback(
    (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const g = inspectGesture.current;
      if (!g || g.mode !== 'pinch' || g.dist <= 0) return;
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const next = Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, g.zoom * (dist / g.dist)));
      viewZoomRef.current = next;
      if (next <= 1.001) {
        viewPanRef.current = { x: 0, y: 0 };
      } else {
        viewPanRef.current = {
          x: g.panX + (midX - g.midX),
          y: g.panY + (midY - g.midY),
        };
      }
      applyViewTransform();
    },
    [applyViewTransform]
  );

  const endInspectGesture = useCallback(() => {
    inspectGesture.current = null;
  }, []);

  const inspect = useMemo(
    () => ({
      beginPan: beginInspectPan,
      movePan: moveInspectPan,
      beginPinch: beginInspectPinch,
      movePinch: moveInspectPinch,
      end: endInspectGesture,
    }),
    [beginInspectPan, moveInspectPan, beginInspectPinch, moveInspectPinch, endInspectGesture]
  );

  const resetViewTransform = useCallback(() => {
    viewZoomRef.current = 1;
    viewPanRef.current = { x: 0, y: 0 };
    applyViewTransform();
  }, [applyViewTransform]);

  /** Crop-frame bitmap for real pixelate/blur preview sampling. */
  const redactPreviewSource = useMemo(() => {
    if (!loadedImage || !(redactActive || hasRedact(redact))) return null;
    const w = Math.max(2, Math.round(frame.width));
    const h = Math.max(2, Math.round(frame.height));
    try {
      return renderToCanvas(
        loadedImage,
        safeCrop,
        transform,
        frameAspect,
        w,
        h,
        cropOutsideImage
      );
    } catch {
      return null;
    }
    // Intentionally omit `redact` — only re-bake when framing/media changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loadedImage,
    redactActive,
    redact?.regions.length,
    safeCrop,
    transform,
    frame.width,
    frame.height,
    frameAspect,
    cropOutsideImage,
  ]);

  const hasLoupe = Boolean(markupProp?.objects.some((o) => o.kind === 'loupe'));
  const markupPhotoSource = useMemo(() => {
    if (!loadedImage || !hasLoupe) return null;
    const w = Math.max(2, Math.round(frame.width));
    const h = Math.max(2, Math.round(frame.height));
    try {
      return renderToCanvas(
        loadedImage,
        safeCrop,
        transform,
        frameAspect,
        w,
        h,
        cropOutsideImage
      );
    } catch {
      return null;
    }
  }, [
    loadedImage,
    hasLoupe,
    safeCrop,
    transform,
    frame.width,
    frame.height,
    frameAspect,
    cropOutsideImage,
  ]);

  useEffect(() => {
    if (!calibrateMode) {
      resetViewTransform();
      return;
    }
    resetViewTransform();
  }, [calibrateMode, resetViewTransform]);

  const clearCompareBadgeTimer = useCallback(() => {
    if (compareBadgeTimer.current) {
      clearTimeout(compareBadgeTimer.current);
      compareBadgeTimer.current = null;
    }
  }, []);

  const exitCompareOriginal = useCallback(() => {
    clearCompareBadgeTimer();
    setCompareOriginal(false);
    setCompareBadgeVisible(false);
  }, [clearCompareBadgeTimer]);

  const enterCompareOriginal = useCallback(() => {
    clearCompareBadgeTimer();
    setCompareOriginal(true);
    setCompareBadgeVisible(true);
    compareBadgeTimer.current = setTimeout(() => {
      compareBadgeTimer.current = null;
      setCompareBadgeVisible(false);
    }, COMPARE_BADGE_MS);
  }, [clearCompareBadgeTimer]);

  /** Stable content fingerprint — ignores object identity from history clones. */
  const gradeKey = useMemo(() => {
    const a = adjust;
    const f = filter;
    const adjustPart = Object.values(a)
      .map((v) => (typeof v === 'number' ? v.toFixed(4) : '0'))
      .join(',');
    return `${f?.id ?? 'original'}:${(f?.intensity ?? 1).toFixed(4)}|${adjustPart}`;
  }, [adjust, filter]);

  // Leave peek when the tool/channel changes or the grade/filter values change.
  // Key off a content fingerprint — not object identity — so a history clone
  // cannot clear the peek on the same tap that opened it.
  useEffect(() => {
    exitCompareOriginal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional reset keys only
  }, [calibrateMode, grading, previewToolId, compareResetKey, gradeKey]);

  useEffect(
    () => () => {
      clearCompareBadgeTimer();
    },
    [clearCompareBadgeTimer]
  );

  useEffect(() => {
    onFrameSizeChange?.({ width: frame.width, height: frame.height });
  }, [frame.width, frame.height, onFrameSizeChange]);

  const activeBounds = boundsFor(geometry);

  useEffect(() => {
    onZoomBoundsChange?.({ min: activeBounds.min, max: activeBounds.max });
  }, [activeBounds.min, activeBounds.max, onZoomBoundsChange]);

  /**
   * Keep the stored crop in sync with what is rendered (e.g. after the angle
   * changes). Live patch only — committing here would push a history entry on
   * every rotation frame. The projection is idempotent, so this settles in one
   * pass and cannot ping-pong between valid and invalid states.
   */
  useEffect(() => {
    if (cropsEqual(crop, safeCrop)) return;
    onCropChange(safeCrop);
  });

  const scale = geometry.cover * safeCrop.zoom;
  const displayW = mw * scale;
  const displayH = mh * scale;
  const imgLeft = vw / 2 - displayW / 2 + safeCrop.x * scale;
  const imgTop = vh / 2 - displayH / 2 + safeCrop.y * scale;

  const frameMetricsRef = useRef({
    frame,
    imgLeft,
    imgTop,
    displayW,
    displayH,
  });
  frameMetricsRef.current = { frame, imgLeft, imgTop, displayW, displayH };

  const readLiveViewportSize = useCallback(() => {
    const node = viewportNodeRef.current;
    if (!node) return { w: vw, h: vh };
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { w: vw, h: vh };
    return { w: rect.width, h: rect.height };
  }, [vw, vh]);

  /** Frame + image rects for an arbitrary viewport band size. */
  const computeMetricsForViewport = useCallback(
    (viewW: number, viewH: number, fScale: number) => {
      const aspect = frameAspect;
      const nextFrame = computeCropFrameSize(viewW, viewH, aspect, fScale);
      const cover =
        mw > 0 && mh > 0
          ? Math.max(nextFrame.width / mw, nextFrame.height / mh)
          : 1;
      const g: CoverageGeometry = {
        mediaWidth: mw,
        mediaHeight: mh,
        frameWidth: nextFrame.width,
        frameHeight: nextFrame.height,
        angleDeg,
        cover,
        maxZoom,
        perspectiveX,
        perspectiveY,
      };
      const safe = project({ ...latestCrop.current, zoom: userZoomRef.current }, g);
      const imgScale = cover * safe.zoom;
      const imgW = mw * imgScale;
      const imgH = mh * imgScale;
      return {
        frame: nextFrame,
        img: {
          left: viewW / 2 - imgW / 2 + safe.x * imgScale,
          top: viewH / 2 - imgH / 2 + safe.y * imgScale,
          width: imgW,
          height: imgH,
        },
      };
    },
    [
      frameAspect,
      mw,
      mh,
      angleDeg,
      maxZoom,
      perspectiveX,
      perspectiveY,
      project,
    ],
  );

  const finishEnterCropTransition = useCallback(() => {
    modeTransitionAnimRef.current = null;
    setModeTransitionVisual(null);
    setCropOverlayVisible(true);
    finishCropSettle();
  }, [finishCropSettle]);

  const finishLeaveCropTransition = useCallback(() => {
    modeTransitionAnimRef.current = null;
    setModeTransitionVisual(null);
  }, []);

  useLayoutEffect(() => {
    const pending = modeTransitionPendingRef.current;
    if (!modeTransitionArmedRef.current || !pending) return;
    if (pending.nonce !== modeTransitionNonce) return;

    modeTransitionArmedRef.current = false;
    modeTransitionPendingRef.current = null;

    const start = pending.start;
    const enteringCrop = modeTransitionTargetRef.current === 'crop';

    if (modeTransitionAnimRef.current) {
      cancelAnimationFrame(modeTransitionAnimRef.current);
      modeTransitionAnimRef.current = null;
    }

    const t0 = performance.now();
    let lastLiveW = 0;
    let lastLiveH = 0;
    let stableFrames = 0;

    const tick = (now: number) => {
      const { w: liveW, h: liveH } = readLiveViewportSize();
      // Destination is always the full-band frame (Reset / preview settle).
      const liveTarget = computeMetricsForViewport(liveW, liveH, 1);
      const raw = Math.min(1, (now - t0) / MODE_TRANSITION_MS);
      setModeTransitionVisual(
        sampleModeTransitionToLiveTarget(start, liveTarget, raw, liveW, liveH),
      );

      const sizeStable =
        Math.abs(liveW - lastLiveW) < 0.5 && Math.abs(liveH - lastLiveH) < 0.5;
      if (raw >= 1 && sizeStable) stableFrames += 1;
      else stableFrames = 0;
      lastLiveW = liveW;
      lastLiveH = liveH;

      const timedOut = now - t0 > MODE_TRANSITION_MS + 480;
      if (stableFrames >= 2 || timedOut) {
        if (enteringCrop) finishEnterCropTransition();
        else finishLeaveCropTransition();
        return;
      }
      modeTransitionAnimRef.current = requestAnimationFrame(tick);
    };
    modeTransitionAnimRef.current = requestAnimationFrame(tick);
  }, [
    modeTransitionNonce,
    modeTransitionGo,
    readLiveViewportSize,
    computeMetricsForViewport,
    finishEnterCropTransition,
    finishLeaveCropTransition,
  ]);

  // Applied right-to-left: flips happen in image space, then the keystone
  // homography, then the on-screen rotation — the same order the exporter uses.
  const perspectiveMatrix = perspectiveCssTransform(
    displayW,
    displayH,
    perspectiveX,
    perspectiveY
  );

  const transformStyle = [
    `rotate(${angleDeg}deg)`,
    perspectiveMatrix ?? '',
    transform.flipX ? 'scaleX(-1)' : '',
    transform.flipY ? 'scaleY(-1)' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const wheelTargetRef = useRef<HTMLDivElement | null>(null);

  const setViewportNode = useCallback(
    (node: HTMLDivElement | null) => {
      viewportNodeRef.current = node;
      wheelTargetRef.current = node;
      if (typeof viewportRef === 'function') {
        viewportRef(node);
      } else if (viewportRef) {
        (viewportRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [viewportRef]
  );

  const onWheel = useCallback(
    (e: WheelEvent) => {
      // Scale only while the pointer is over the preview — not over the ruler,
      // mode badges, or modal chrome.
      if (!pointerInsideRef.current) return;
      e.preventDefault();
      pulseWheelHoldFade();
      if (!calibrateMode) pulseWheelScaleActive();

      // Markup / Redact still use Calibrate-style CSS view zoom so the user can
      // inspect while drawing (wheel). Drawing layers own one-finger pointers.
      if (calibrateMode) {
        const next = Math.min(
          VIEW_ZOOM_MAX,
          Math.max(
            VIEW_ZOOM_MIN,
            viewZoomRef.current * Math.exp(-e.deltaY * VIEW_WHEEL_SENS)
          )
        );
        viewZoomRef.current = next;
        if (next <= 1.001) {
          viewPanRef.current = { x: 0, y: 0 };
        }
        applyViewTransform();
        return;
      }

      const g = geometryFor(latestFrameScale.current);
      const bounds = boundsFor(g);
      const current = latestCrop.current.zoom;
      const intent = Math.min(
        bounds.max,
        Math.max(bounds.min, current * Math.exp(-e.deltaY * 0.0018))
      );
      if (Math.abs(intent - current) < 1e-6) return;
      if (intent <= bounds.min + 1e-6 && current <= bounds.min + 1e-6) return;
      if (intent >= bounds.max - 1e-6 && current >= bounds.max - 1e-6) return;

      const next = project({ ...latestCrop.current, zoom: intent }, g);
      if (cropsEqual(next, latestCrop.current)) return;
      userZoomRef.current = intent;
      lastAppliedZoomRef.current = next.zoom;
      latestCrop.current = next;
      onCropChange(next);
      // Commit once the wheel burst settles — not on every pixel of delta.
      if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current);
      wheelCommitTimer.current = setTimeout(() => {
        wheelCommitTimer.current = null;
        onCropCommit?.(latestCrop.current);
      }, 140);
    },
    [
      calibrateMode,
      geometryFor,
      boundsFor,
      project,
      onCropChange,
      onCropCommit,
      applyViewTransform,
      pulseWheelHoldFade,
      pulseWheelScaleActive,
    ]
  );

  useEffect(() => {
    const el = wheelTargetRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    const detachHeld = chromeHoldFadeEnabled
      ? attachPointerHeld(
          el,
          {
            onAcquire: () => beginHoldFade(),
            onRelease: () => {
              if (pointers.current.size > 0) return;
              endHoldFadeGesture();
            },
          },
          { includeWheel: true },
        )
      : undefined;
    return () => {
      el.removeEventListener('wheel', onWheel);
      detachHeld?.();
      if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current);
      if (wheelFadeTimerRef.current) clearTimeout(wheelFadeTimerRef.current);
      if (wheelScaleTimerRef.current) clearTimeout(wheelScaleTimerRef.current);
    };
  }, [
    onWheel,
    imageUrl,
    chromeHoldFadeEnabled,
    beginHoldFade,
    endHoldFadeGesture,
  ]);

  const pointerDistance = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return 0;
    const [a, b] = pts;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const captureGestureStart = (pointer: { x: number; y: number }, pinchDist = 0) => {
    const aspect = frameAspect ?? mediaAspect;
    const fScale = latestFrameScale.current;
    gestureStart.current = {
      crop: { ...latestCrop.current },
      frameScale: fScale,
      pointer,
      pinchDist,
      viewZoom: viewZoomRef.current,
      viewPan: { ...viewPanRef.current },
      aspect,
      frame: computeCropFrameSize(vw, vh, aspect, fScale),
    };
  };

  const beginPointer = (e: React.PointerEvent, mode: 'pan' | CropHandle) => {
    // Markup / Redact own one-finger drawing; they call `inspect` for pan/pinch.
    if (markupActive || redactActive) return;
    // Non-crop tools keep pan/pinch so the user can inspect the composition;
    // crop handles are simply not rendered in that mode.
    if (calibrateMode && mode !== 'pan') return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setInteracting(true);
    beginHoldFade();
    clearSettleTimers();
    setCropSettling(false);

    if (pointers.current.size === 2) {
      dragMode.current = 'pinch';
      captureGestureStart({ x: e.clientX, y: e.clientY }, pointerDistance());
      setHandleDragVisual(null);
      return;
    }

    dragMode.current = mode;
    captureGestureStart({ x: e.clientX, y: e.clientY });

    if (isCropHandleMode(mode) && !calibrateMode) {
      const visual: HandleDragVisual = {
        desired: { ...frame },
        imageLeft: imgLeft,
        imageTop: imgTop,
        imageW: displayW,
        imageH: displayH,
      };
      handleDragVisualRef.current = visual;
      setHandleDragVisual(visual);
    }
  };

  /**
   * Project a RAW gesture transform once and publish it. The raw value always
   * derives from the gesture start state, so nothing accumulates and the same
   * input always yields the same output.
   */
  const applyRaw = (raw: CropArea, g: CoverageGeometry) => {
    // Record intent inside the currently reachable range, so a blocked gesture
    // never stores a value that would surface later as a jump.
    const b = boundsFor(g);
    userZoomRef.current = Math.min(b.max, Math.max(b.min, raw.zoom));
    const next = project({ ...raw, zoom: userZoomRef.current }, g);
    lastAppliedZoomRef.current = next.zoom;
    if (cropsEqual(next, latestCrop.current)) return;
    latestCrop.current = next;
    onCropChange(next);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = gestureStart.current;
    if (!start || dragMode.current === 'none') return;
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-to-scale — only active for touches that began on this viewport.
    if (dragMode.current === 'pinch' && pointers.current.size >= 2) {
      if (start.pinchDist <= 0) return;
      const ratio = pointerDistance() / start.pinchDist;
      if (calibrateMode) {
        const next = Math.min(
          VIEW_ZOOM_MAX,
          Math.max(VIEW_ZOOM_MIN, start.viewZoom * ratio)
        );
        viewZoomRef.current = next;
        if (next <= 1.001) {
          viewPanRef.current = { x: 0, y: 0 };
        }
        applyViewTransform();
        return;
      }
      const g = geometryFor(start.frameScale);
      // Raw value derives from the gesture start, never from the last frame.
      applyRaw({ ...start.crop, zoom: start.crop.zoom * ratio }, g);
      return;
    }

    if (dragMode.current === 'pan') {
      const dx = e.clientX - start.pointer.x;
      const dy = e.clientY - start.pointer.y;
      if (calibrateMode) {
        // Pan only meaningful once zoomed in past 1×.
        if (viewZoomRef.current <= 1.001) return;
        viewPanRef.current = {
          x: start.viewPan.x + dx,
          y: start.viewPan.y + dy,
        };
        applyViewTransform();
        return;
      }
      const g = geometryFor(start.frameScale);
      const s = g.cover * start.crop.zoom;
      applyRaw(
        { ...start.crop, x: start.crop.x + dx / s, y: start.crop.y + dy / s },
        g
      );
      return;
    }

    // ---- Handle drag: sheet-style opposite-edge resize ----
    // pan / pinch already returned — remaining modes are the 8 crop handles.
    const handle = dragMode.current as CropHandle;

    const dx = e.clientX - start.pointer.x;
    const dy = e.clientY - start.pointer.y;
    const lockedAspect = freeform ? null : start.aspect > 0 ? start.aspect : mediaAspect;

    const projected = projectHandleResize({
      startFrame: start.frame,
      handle,
      dx,
      dy,
      aspect: lockedAspect,
      viewportWidth: vw,
      viewportHeight: vh,
      pad: FRAME_EDGE_PAD,
      minFrameScale: MIN_FRAME_SCALE,
      maxFrameScale: MAX_FRAME_SCALE,
    });

    if (freeform) {
      setFreeAspect(projected.aspect);
      onFreeAspectChange?.(projected.aspect);
    }

    if (projected.frameScale !== latestFrameScale.current) {
      latestFrameScale.current = projected.frameScale;
      onFrameScaleChange?.(projected.frameScale);
    }

    const startGeom = geometryFor(start.frameScale, start.aspect);
    const nextGeom = geometryFor(projected.frameScale, projected.aspect);
    // Keep on-screen image pixel size stable while the window resizes.
    const displayScale = startGeom.cover * start.crop.zoom;
    const compensatedZoom =
      nextGeom.cover > 0 ? displayScale / nextGeom.cover : start.crop.zoom;
    // Pan so the anchored edge keeps the same image content (centered frame
    // would otherwise expand both sides).
    const panScale = displayScale > 0 ? displayScale : 1;
    applyRaw(
      {
        ...start.crop,
        zoom: compensatedZoom,
        x: start.crop.x + projected.panScreenDelta.x / panScale,
        y: start.crop.y + projected.panScreenDelta.y / panScale,
      },
      nextGeom
    );

    const prev = handleDragVisualRef.current;
    if (prev) {
      const nextVisual: HandleDragVisual = { ...prev, desired: projected.desired };
      handleDragVisualRef.current = nextVisual;
      setHandleDragVisual(nextVisual);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const cancelled = e.type === 'pointercancel';

    if (pointers.current.size === 0) {
      const start = gestureStart.current;
      const mode = dragMode.current;
      // Calibrate / Filter: a stationary tap toggles the ungraded crop peek.
      // Markup never peeks — drawing would fight the compare toggle.
      if (
        calibrateMode &&
        !markupActive &&
        !redactActive &&
        grading &&
        mode === 'pan' &&
        start &&
        Math.hypot(e.clientX - start.pointer.x, e.clientY - start.pointer.y) <=
          COMPARE_TAP_SLOP
      ) {
        if (compareOriginal) exitCompareOriginal();
        else enterCompareOriginal();
      }

      // Crop commits only in Crop tool — Calibrate/Filter taps must not push
      // history (a cloned adjust/filter would fight the compare peek).
      const handleVisual = isCropHandleMode(mode)
        ? handleDragVisualRef.current
        : null;
      if (mode !== 'none' && !calibrateMode && !handleVisual) {
        onCropCommit?.(latestCrop.current);
      }

      dragMode.current = 'none';
      gestureStart.current = null;
      if (!calibrateMode && !cancelled) {
        endHoldFadeGesture();
      }

      if (handleVisual && !calibrateMode) {
        const cropAtRelease = latestCrop.current;
        setInteracting(false);
        armCropSettle();
        settleRafRef.current = requestAnimationFrame(() => {
          settleRafRef.current = requestAnimationFrame(() => {
            settleRafRef.current = null;
            setHandleDragVisual(null);
            handleDragVisualRef.current = null;
            fitCropToViewport(cropAtRelease);
            finishCropSettle();
          });
        });
      } else {
        setInteracting(false);
        setHandleDragVisual(null);
        handleDragVisualRef.current = null;
        setCropSettling(false);
      }

      const node = wheelTargetRef.current;
      if (node) {
        const r = node.getBoundingClientRect();
        pointerInsideRef.current =
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
      }
      return;
    }

    if (pointers.current.size === 1) {
      // Pinch → pan handoff: restart the gesture so deltas stay absolute.
      dragMode.current = 'pan';
      const remaining = [...pointers.current.values()][0];
      captureGestureStart(remaining);
      setHandleDragVisual(null);
      handleDragVisualRef.current = null;
    }
  };

  const handles: CropHandle[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];

  const handlesVisible = showHandles && !calibrateMode;
  const gridVisible = showGrid && !calibrateMode;
  const cropChromeOn =
    !calibrateMode || (cropSettling && cropOverlayVisible);
  const cropGridActive =
    interacting || rotationInteracting || wheelScaleActive;
  const fillState = fill;
  const frameStyle = editorFrame;
  const showFillBackdrop = fillState && hasFill(fillState);
  const framePreview = frameStyle && hasFrame(frameStyle);
  const layoutFrame = modeTransitionVisual?.frame ?? frame;
  const frameLayout = framePreview
    ? computeFrameLayout(layoutFrame.width, layoutFrame.height, frameStyle!)
    : null;
  const identityAdjust = useMemo(() => createDefaultAdjust(), []);
  const identityFilter = useMemo(() => createDefaultFilter(), []);
  const previewAdjust = compareOriginal ? identityAdjust : adjust;
  const previewFilter = compareOriginal ? identityFilter : filter;
  const displayFrame =
    modeTransitionVisual?.frame ?? handleDragVisual?.desired ?? frame;
  const renderImgLeft =
    modeTransitionVisual?.img.left ?? handleDragVisual?.imageLeft ?? imgLeft;
  const renderImgTop =
    modeTransitionVisual?.img.top ?? handleDragVisual?.imageTop ?? imgTop;
  const renderImgW =
    modeTransitionVisual?.img.width ?? handleDragVisual?.imageW ?? displayW;
  const renderImgH =
    modeTransitionVisual?.img.height ?? handleDragVisual?.imageH ?? displayH;
  const modeTransitionActive = modeTransitionVisual !== null;
  if (!modeTransitionVisual) {
    glBakeRef.current = { width: frame.width, height: frame.height };
  }
  /** Semi-transparent outside-crop overlay while handle held or pan/pinch. */
  const revealOutsideTarget =
    !calibrateMode &&
    (Boolean(handleDragVisual) || interacting || rotationInteracting);
  const revealOutside = useTimedVisible(
    revealOutsideTarget,
    CROP_OUTSIDE_REVEAL_HOLD_MS,
    CROP_OUTSIDE_HIDE_HOLD_MS,
  );
  const cropGridVisible = useTimedVisible(
    cropGridActive,
    CROP_OUTSIDE_REVEAL_HOLD_MS,
    CROP_OUTSIDE_HIDE_HOLD_MS,
  );
  const cropGridInnerVisible = useTimedVisible(
    rotationInteracting && cropGridActive,
    CROP_OUTSIDE_REVEAL_HOLD_MS,
    CROP_OUTSIDE_REVEAL_HOLD_MS,
  );

  const viewportRevealStyle = useMemo(
    () =>
      ({
        ['--ie-crop-outside-reveal-duration' as string]: `${CROP_OUTSIDE_REVEAL_FADE_MS}ms`,
        ['--ie-crop-outside-reveal-ease' as string]: CROP_OUTSIDE_REVEAL_FADE_EASE,
        ['--ie-crop-outside-reveal-delay' as string]: `${CROP_OUTSIDE_REVEAL_FADE_DELAY_MS}ms`,
        ['--ie-crop-outside-hide-duration' as string]: `${CROP_OUTSIDE_HIDE_FADE_MS}ms`,
        ['--ie-crop-outside-hide-ease' as string]: CROP_OUTSIDE_HIDE_FADE_EASE,
        ['--ie-crop-outside-hide-delay' as string]: `${CROP_OUTSIDE_HIDE_FADE_DELAY_MS}ms`,
      }) as CSSProperties,
    [],
  );

  return (
    <div
      ref={setViewportNode}
      data-ie-part='viewport'
      data-ie-skin='default'
      data-ie-interacting={interacting ? 'true' : 'false'}
      data-ie-crop-settling={cropSettling ? 'true' : undefined}
      data-ie-mode-transition={modeTransitionActive ? 'true' : undefined}
      data-ie-crop-reveal-outside={revealOutside ? 'true' : undefined}
      data-ie-calibrate={calibrateMode ? 'true' : undefined}
      data-ie-compare={compareOriginal ? 'true' : undefined}
      className={classNames.viewport}
      style={viewportRevealStyle}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
      }}
      onPointerLeave={() => {
        if (dragMode.current === 'none' && pointers.current.size === 0) {
          pointerInsideRef.current = false;
        }
      }}
      onPointerDown={(e) => {
        pointerInsideRef.current = true;
        if ((e.target as HTMLElement).closest('[data-ie-handle]')) return;
        beginPointer(e, 'pan');
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div data-ie-part='canvas' className={classNames.canvas}>
        <img
          src={imageUrl}
          alt=''
          draggable={false}
          style={{
            width: renderImgW,
            height: renderImgH,
            transform: transformStyle,
            position: 'absolute',
            left: renderImgLeft,
            top: renderImgTop,
            transformOrigin: 'center center',
            // Non-crop tools show only the graded composition — hide the
            // uncropped source that would otherwise bleed through the mask.
            opacity: calibrateMode ? 0 : 1,
          }}
        />
      </div>

      {showFillBackdrop && (
        <div
          className='ie-fill-backdrop'
          data-ie-fill-mode={fillState!.mode}
          aria-hidden
          style={
            fillState!.mode === 'solid'
              ? { background: fillState!.color }
              : undefined
          }
        />
      )}

      {/*
        Opaque graded crop sits on top of the frame only. Outside the frame the
        ungraded img still shows through the dimmed mask (Crop). In Calibrate
        the source img is hidden and this layer stays forced-visible; wheel /
        pinch pan the graded frame via CSS so zoom never re-bakes the texture.
      */}
      <div
        className={framePreview ? 'ie-frame-preview-wrap' : undefined}
        data-ie-part="crop-photo"
        data-ie-frame={framePreview ? frameStyle!.preset : undefined}
        style={
          framePreview && frameLayout
            ? {
                position: 'absolute',
                left: layoutFrame.left - frameLayout.photoX,
                top: layoutFrame.top - frameLayout.photoY,
                width: frameLayout.outW,
                height: frameLayout.outH,
                background:
                  frameStyle!.preset === 'inner' ||
                  frameStyle!.preset === 'inner-shadow'
                    ? 'transparent'
                    : frameStyle!.preset === 'offset'
                      ? '#ffffff'
                      : frameStyle!.color,
                borderRadius:
                  frameStyle!.preset === 'rounded' ||
                  frameStyle!.preset === 'soft-round' ||
                  frameStyle!.preset === 'polaroid' ||
                  frameStyle!.preset === 'photo-card' ||
                  frameStyle!.preset === 'modern-card' ||
                  frameStyle!.preset === 'floating' ||
                  frameStyle!.preset === 'raised'
                    ? frameLayout.metrics.cornerRadius +
                      frameLayout.metrics.borderWidth +
                      frameLayout.metrics.padding
                    : frameLayout.metrics.cornerRadius,
                boxShadow:
                  frameStyle!.shadow &&
                  frameStyle!.preset !== 'shadow' &&
                  frameStyle!.preset !== 'center-shadow' &&
                  frameStyle!.preset !== 'outer-glow'
                    ? `0 ${6 + frameLayout.metrics.shadowIntensity * 18}px ${16 + frameLayout.metrics.shadowIntensity * 28}px rgba(0,0,0,${0.16 + frameLayout.metrics.shadowIntensity * 0.28})`
                    : frameStyle!.preset === 'outer-glow'
                      ? `0 0 ${24 + frameLayout.metrics.shadowIntensity * 36}px rgba(0,0,0,${0.22 + frameLayout.metrics.shadowIntensity * 0.28})`
                      : undefined,
                overflow: 'visible',
                zIndex: 2,
                pointerEvents: markupActive || redactActive ? 'auto' : 'none',
              }
            : {
                position: 'absolute',
                left: displayFrame.left,
                top: displayFrame.top,
                width: displayFrame.width,
                height: displayFrame.height,
                overflow: 'hidden',
                zIndex: 2,
                pointerEvents: markupActive || redactActive ? 'auto' : 'none',
              }
        }
      >
        {framePreview && frameLayout && (
          <FrameLiveChrome frame={frameStyle!} layout={frameLayout} layer='back' />
        )}
        <div
          data-ie-part='adjust-view'
          style={
            framePreview && frameLayout
              ? {
                  position: 'absolute',
                  left: frameLayout.photoX,
                  top: frameLayout.photoY,
                  width: layoutFrame.width,
                  height: layoutFrame.height,
                  overflow: 'hidden',
                  borderRadius: frameLayout.metrics.cornerRadius,
                  zIndex: 1,
                  boxShadow:
                    frameStyle!.preset === 'shadow'
                      ? `0 ${4 + frameLayout.metrics.shadowIntensity * 14}px ${12 + frameLayout.metrics.shadowIntensity * 24}px rgba(0,0,0,${0.2 + frameLayout.metrics.shadowIntensity * 0.35})`
                      : frameStyle!.preset === 'center-shadow'
                        ? `0 ${14 + frameLayout.metrics.shadowIntensity * 10}px ${18 + frameLayout.metrics.shadowIntensity * 16}px rgba(0,0,0,${0.28 + frameLayout.metrics.shadowIntensity * 0.28})`
                        : undefined,
                }
              : {
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                }
          }
        >
        <div
          ref={viewInnerRef}
          data-ie-part='adjust-view-inner'
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformOrigin: 'center center',
          }}
        >
          <AdjustGlLayer
            enabled={grading || calibrateMode}
            forceVisible={calibrateMode}
            image={loadedImage}
            crop={safeCrop}
            transform={transform}
            adjust={previewAdjust}
            filter={previewFilter}
            frame={{
              left: 0,
              top: 0,
              width: glBakeRef.current.width,
              height: glBakeRef.current.height,
            }}
            aspectRatio={frameAspect}
            cropOutsideImage={cropOutsideImage}
          />
          {(markupActive || hasMarkup(markupProp)) && (
            <MarkupLayer
              active={markupActive}
              markup={markupProp ?? createDefaultMarkup()}
              tool={markupTool}
              eraserMode={markupEraserMode}
              color={markupColor}
              strokeWidth={markupStrokeWidth}
              strokeOpacity={markupStrokeOpacity}
              shapeKind={markupShapeKind}
              textAlign={markupTextAlign}
              ruler={markupRuler ?? createDefaultRuler()}
              selectedIds={markupSelectedIds}
              signatureTemplate={markupSignatureTemplate}
              shapeBadgeLabels={shapeBadgeLabels}
              textBadgeLabels={textBadgeLabels}
              fonts={markupFonts}
              placeRequest={placeRequest}
              photoSource={markupPhotoSource}
              inspect={inspect}
              onRulerChange={(r) => onMarkupRulerChange?.(r)}
              onSelectedIdsChange={(ids) => onMarkupSelectedIdsChange?.(ids)}
              onCommit={(next) => onMarkupCommit?.(next)}
              onChromeHoldFadeBegin={onMarkupChromeHoldFadeBegin}
              onChromeHoldFadeEnd={onMarkupChromeHoldFadeEnd}
            />
          )}
          <MarkupEyedropLayer
            active={Boolean(eyedropActive && markupActive)}
            loadedImage={loadedImage}
            crop={safeCrop}
            transform={transform}
            adjust={previewAdjust}
            filter={previewFilter}
            aspectRatio={frameAspect}
            cropOutsideImage={cropOutsideImage}
            onPick={(color) => onEyedropColor?.(color)}
            onEnd={() => onEyedropEnd?.()}
          />
          {(redactActive || hasRedact(redact)) && (
            <RedactLayer
              active={redactActive}
              redact={redact ?? { regions: [] }}
              style={redactStyle}
              interactMode={redactInteractMode}
              drawMode={redactDrawMode}
              brushWidth={redactBrushWidth}
              strength={redactStrength}
              selectedId={redactSelectedId}
              loadedImage={loadedImage}
              previewSource={redactPreviewSource}
              inspect={inspect}
              onSelectedChange={onRedactSelectedChange}
              onCommit={(next) => onRedactCommit?.(next)}
              onChromeHoldFadeBegin={onRedactChromeHoldFadeBegin}
              onChromeHoldFadeEnd={onRedactChromeHoldFadeEnd}
            />
          )}
        </div>
        </div>
        {framePreview && frameLayout && (
          <FrameLiveChrome frame={frameStyle!} layout={frameLayout} layer='front' />
        )}
      </div>

      {calibrateMode && compareOriginal && (
        <div
          data-ie-part='compare-badge'
          data-ie-visible={compareBadgeVisible ? 'true' : 'false'}
          aria-live='polite'
        >
          {compareOriginalLabel}
        </div>
      )}

      {/*
        Frame-sized hole via box-shadow (not clip-path) so left/top/width/height
        can transition when switching Crop ↔ Calibrate.
      */}
      <div
        data-ie-part='crop-mask'
        aria-hidden
        style={{
          left: displayFrame.left,
          top: displayFrame.top,
          width: displayFrame.width,
          height: displayFrame.height,
        }}
      />

      <div
        data-ie-part='cropOverlay'
        data-ie-skin='default'
        data-ie-chrome={cropChromeOn ? 'on' : 'off'}
        data-ie-overlay-visible={cropOverlayVisible ? 'true' : 'false'}
        className={classNames.cropOverlay}
        style={{
          left: displayFrame.left,
          top: displayFrame.top,
          width: displayFrame.width,
          height: displayFrame.height,
        }}
      >
        {gridVisible && (
          <div
            data-ie-part='crop-grid'
            data-ie-visible={cropGridVisible ? 'true' : 'false'}
            aria-hidden
          >
            <span />
            <span />
            <span />
            <span />
            <div
              data-ie-part='crop-grid-inner'
              data-ie-visible={cropGridInnerVisible ? 'true' : 'false'}
              aria-hidden
            >
              {Array.from({ length: 9 }, (_, cell) => (
                <div key={cell} data-ie-part='crop-grid-cell'>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          </div>
        )}

        {guides.includes('circle') && (
          <div
            data-ie-part='cropGuide'
            data-ie-guide='circle'
            className={classNames.cropGuide}
          />
        )}

        {handlesVisible &&
          handles.map((h) => (
            <span
              key={h}
              data-ie-handle={h}
              onPointerDown={(e) => {
                e.stopPropagation();
                beginPointer(e, h);
              }}
            />
          ))}
      </div>
    </div>
  );
}