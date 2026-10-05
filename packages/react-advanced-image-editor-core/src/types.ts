import type { MarkupState } from './markup/types';
import type { FillState } from './fill/fillState';
import type { RedactState } from './redact/redactState';
import type { FrameState } from './frame/frameState';
export type { FillState, FillMode } from './fill/fillState';
export type { RedactState, RedactRegion, RedactStyle } from './redact/redactState';
export type { FrameState, FramePresetId } from './frame/frameState';

export type {
  MarkupState,
  MarkupStroke,
  MarkupText,
  MarkupShape,
  MarkupSignature,
  MarkupSignaturePath,
  MarkupSignatureTemplate,
  MarkupSticker,
  MarkupLoupe,
  MarkupObject,
  MarkupRuler,
  MarkupPoint,
  MarkupTool,
  MarkupDrawTool,
  MarkupShapeKind,
  MarkupTextAlign,
  EraserMode,
} from './markup/types';

export type ImageSource =
  | File
  | Blob
  | string
  | HTMLImageElement
  | HTMLCanvasElement;

export type Rotation = 0 | 90 | 180 | 270;

export interface TransformState {
  /** Discrete quarter turns applied before fine angle */
  rotation: Rotation;
  /**
   * Continuous rotation in degrees (typically -45…45 for sheet-style crop).
   * Applied after `rotation` around the image center.
   */
  angle: number;
  flipX: boolean;
  flipY: boolean;
  /**
   * Horizontal perspective (keystone) in [-1, 1]. Positive shortens the left
   * edge and lengthens the right one, as if panning the camera.
   * Applied as a true homography, never as a shear.
   */
  perspectiveX: number;
  /**
   * Vertical perspective (keystone) in [-1, 1]. Positive narrows the top edge
   * and widens the bottom one, as if tilting the camera up.
   */
  perspectiveY: number;
}

export interface CropArea {
  /** Horizontal offset of crop center from image center (natural px) */
  x: number;
  /** Vertical offset of crop center from image center (natural px) */
  y: number;
  /** Zoom factor >= 1 (or lower when cropOutsideImage) */
  zoom: number;
}

export interface CropOptions {
  aspectRatio?: number | null;
  /** Allow crop rect to extend beyond image bounds */
  cropOutsideImage?: boolean;
}

export interface CropComputeOptions {
  cropOutsideImage?: boolean;
}

export interface LoadedImage {
  element: HTMLImageElement;
  width: number;
  height: number;
  orientation: number;
  /** Object URL for File/Blob sources; revoke when discarding */
  blobUrl?: string;
}

/**
 * Every calibrate channel, in Adjust-strip display order.
 *
 * This is the single source of truth: adding a key here wires the channel
 * through `createDefaultAdjust`, `normalizeAdjust`, `hasAdjustments`, the GL
 * uniform lookup (`u_<channel>`) and the React strip/label lists. What still
 * needs writing per channel is the actual math (shader block + CPU mirror),
 * a glyph and a default label.
 *
 * | Channel      | Meaning                                              |
 * | ------------ | ---------------------------------------------------- |
 * | `brightness` | Midtone lift / crush                                 |
 * | `contrast`   | Expand / compress around mid-gray                    |
 * | `blackPoint` | Where the darkest tone lands: crush (+) / lift (−)    |
 * | `saturation` | Chroma; −1 ≈ grayscale                               |
 * | `vibrance`   | Chroma weighted toward muted colours, skin protected  |
 * | `exposure`   | ≈ ±2 EV stops                                        |
 * | `brilliance` | Local tone map: opens shaded regions, tames bright ones|
 * | `highlights` | Gain on the bright end only: recover (−) / open (+)   |
 * | `shadows`    | Lift (+) / deepen (−) the dark end only               |
 * | `vignette`   | Edge darken (+) / lighten (−)                         |
 * | `warmth`     | White-balance temperature: −cool/blue ↔ +warm/amber   |
 * | `tint`       | White-balance tint: −green ↔ +magenta                 |
 * | `sharpness`  | Unsharp mask on luminance: soften (−) / sharpen (+)   |
 * | `definition` | Wide-radius local contrast (midtone clarity)          |
 */
export const ADJUST_CHANNELS = [
  'brightness',
  'contrast',
  'blackPoint',
  'saturation',
  'vibrance',
  'exposure',
  'brilliance',
  'highlights',
  'shadows',
  'vignette',
  'warmth',
  'tint',
  'sharpness',
  'definition',
] as const;

export type AdjustChannelKey = (typeof ADJUST_CHANNELS)[number];

/**
 * Color adjustments applied **after** crop/transform to the visible frame.
 * Each channel is normalized to [-1, 1]; graded on GPU via WebGL
 * (`adjust/webglAdjust.ts`). Warmth/Tint are Bradford white-balance axes.
 */
export type AdjustState = Record<AdjustChannelKey, number>;

/**
 * Filter looks, in carousel order (Filters row).
 *
 * `original` is the identity entry and always sits first — selecting it is how
 * the user removes the look. The remaining ids are the built-in look set used
 * by the filter strip.
 *
 * Adding an id here wires it through `normalizeFilter` and the React strip;
 * what still needs writing is its `FilterLook` in `filter/filterLooks.ts` and
 * a display label.
 */
export const FILTER_IDS = [
  'original',
  'vivid',
  'vividWarm',
  'vividCool',
  'dramatic',
  'dramaticWarm',
  'dramaticCool',
  'mono',
  'silvertone',
  'noir',
] as const;

export type FilterId = (typeof FILTER_IDS)[number];

/**
 * The selected look plus how strongly it is mixed in.
 *
 * `intensity` is [0, 1] (UI shows 0–100) and interpolates every parameter of
 * the look against identity, so dragging it is continuous with no stepping.
 */
export interface FilterState {
  id: FilterId;
  intensity: number;
}

/**
 * Crop-shape selection stored in history so Undo/Redo restores
 * Vertical/Horizontal + aspect preset together with pan/zoom.
 */
export interface CropShapeSnapshot {
  shape: string;
  /** `null` when Freeform / Square / Wallpaper cleared orientation. */
  orientation: 'vertical' | 'horizontal' | null;
  /** Resolved frame aspect (w/h). `null` = freeform (unlocked). */
  aspect: number | null;
}

export interface EditorSnapshot {
  crop: CropArea;
  transform: TransformState;
  adjust: AdjustState;
  filter: FilterState;
  /** Freehand markup drawn over the graded crop (Phase 1: strokes). */
  markup: MarkupState;
  /** Letterbox / background fill behind the crop frame. */
  fill: FillState;
  /** Destructive privacy regions (blur / pixelate / solid). */
  redact: RedactState;
  /** Decorative outer frame baked on export. */
  frame: FrameState;
  /** Crop-shape UI selection; omitted until the user opens Crop Shape. */
  cropShape?: CropShapeSnapshot;
}

export interface EditorState extends EditorSnapshot {
  image: LoadedImage;
}

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ExportOptions {
  format?: ExportFormat;
  quality?: number;
  /**
   * Opt-in output caps. Omit both to keep full crop resolution.
   * When set, the host may downscale the upload blob while the download
   * preview stays full-res (see ImageEditor).
   */
  maxWidth?: number;
  maxHeight?: number;
  cropOutsideImage?: boolean;
}

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}
