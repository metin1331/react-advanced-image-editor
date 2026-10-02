import type { ImageEditorLocale } from './i18n/messages';
import {
  ADJUST_CHANNELS,
  FILTER_IDS,
  type AdjustChannelKey,
  type ExportOptions,
  type FilterId,
  type ImageSource,
  type Rotation,
} from 'react-advanced-image-editor-core';

export type CropGuide = 'circle' | 'rect';

export type ImageEditorPreset = 'default' | 'selection' | 'outside' | 'profile';
export type ImageEditorLayout = 'full' | 'compact' | 'minimal';

/** Extra markup text fonts. `Default` is always prepended by the editor. */
export type ImageEditorFont = {
  id: string;
  label: string;
  /** CSS `font-family` stack, e.g. `"Georgia, serif"`. */
  family: string;
};

export const DEFAULT_PRESET_PICKER_OPTIONS: ReadonlyArray<ImageEditorPreset> = [
  'default',
  'selection',
  'outside',
  'profile',
];

export const defaultPresetLabels: Record<ImageEditorPreset, string> = {
  default: 'Default',
  selection: 'Drag selection',
  outside: 'Crop outside',
  profile: 'Profile',
};

/** Fixed preset bar under the topbar (optional). Drag/position props are deprecated no-ops. */
export interface PresetPickerConfig {
  /**
   * Presets listed in the picker (default: all four).
   * One option (or omitting the picker) hides the bar and locks that mode.
   */
  options?: ImageEditorPreset[];
  /** Display names; defaults to English `defaultPresetLabels`. */
  presetLabels?: Partial<Record<ImageEditorPreset, string>>;
  /** Group label shown beside the options. */
  label?: string;
  /** @deprecated Preset bar is fixed; ignored. */
  position?: { x: number; y: number };
  /** @deprecated Preset bar is fixed; ignored. */
  onPositionChange?: (position: { x: number; y: number }) => void;
  /** @deprecated Preset bar is fixed; ignored. */
  positionStorageKey?: string;
}

export interface ImageEditorFeatures {
  sidebar: boolean;
  sidebarTools: boolean;
  resetButton: boolean;
  topBar: boolean;
  undoRedo: boolean;
  subToolbar: boolean;
  rotateLeft: boolean;
  flipHorizontal: boolean;
  flipVertical: boolean;
  cropShape: boolean;
  bottomBar: boolean;
  rotationTab: boolean;
  scaleTab: boolean;
  /** Vertical / Horizontal perspective (keystone) circles in the mode strip. */
  perspectiveTab: boolean;
  cornerHandles: boolean;
}

export interface ImageEditorClassNames {
  root?: string;
  backdrop?: string;
  panel?: string;
  sidebar?: string;
  sidebarButton?: string;
  topbar?: string;
  workspace?: string;
  subToolbar?: string;
  header?: string;
  title?: string;
  viewport?: string;
  canvas?: string;
  cropOverlay?: string;
  cropGuide?: string;
  bottomBar?: string;
  toolbar?: string;
  button?: string;
  buttonActive?: string;
  doneButton?: string;
  footer?: string;
  presetPicker?: string;
}

export interface CropConfig {
  aspectRatio?: number | null;
  guides?: CropGuide[];
}

/** Chrome theme for `[data-ie-theme]` — selects light/dark CSS token sets. */
export type ImageEditorTheme = 'light' | 'dark';

/**
 * Overridable chrome / ruler colors. Maps 1:1 to `--ie-*` CSS variables on
 * `[data-ie-root]`. Pass via `colors` (light) or `darkColors` (dark) so hosts
 * can match black, zinc, purple, etc. dark shells.
 */
export interface ImageEditorThemeColors {
  accent?: string;
  accentHover?: string;
  accentSoft?: string;
  accentText?: string;
  bg?: string;
  bgMuted?: string;
  bgSidebar?: string;
  border?: string;
  text?: string;
  textMuted?: string;
  overlay?: string;
  cropBorder?: string;
  cropHandle?: string;
  grid?: string;
  chromeHover?: string;
  chromeActive?: string;
  /** Ruler active color when value ≤ 0 (`--ie-ruler-negative`). */
  rulerNegative?: string;
  /** Ruler active color when value > 0 (`--ie-ruler-positive`). */
  rulerPositive?: string;
  /** Minor tick fill (`--ie-ruler-tick`). */
  rulerTick?: string;
  /** Major tick fill (`--ie-ruler-tick-major`). */
  rulerTickMajor?: string;
}

/** `modal` covers the viewport. `inline` fills a host element. */
export type ImageEditorPresentation = 'modal' | 'inline';

/**
 * What stays on screen after Done.
 * `preview` is the floating `.ie-export-preview` card.
 * `result` is an in-page `.ie-export-result` block instead of that card.
 */
export type ImageEditorExportView = 'preview' | 'result';

/**
 * Host for `presentation="inline"`.
 * A CSS selector (`.page`), an element, or a ref to an element.
 * The host needs a height — the editor fills that box and does not grow it.
 */
export type ImageEditorContainer =
  | string
  | HTMLElement
  | { readonly current: HTMLElement | null };

export interface ImageEditorProps {
  open: boolean;
  /**
   * Where the editor is shown. Default `modal` (viewport overlay).
   * `inline` fills `container`, or this component's place in the tree when
   * `container` is omitted.
   */
  presentation?: ImageEditorPresentation;
  /**
   * Element the editor fills when `presentation` is `inline`.
   * Example: `container=".page"`.
   */
  container?: ImageEditorContainer;
  src: ImageSource | null;
  preset?: ImageEditorPreset;
  features?: Partial<ImageEditorFeatures>;
  title?: string;
  crop?: CropConfig;
  exportOptions?: ExportOptions;
  cropOutsideImage?: boolean;
  interactionMode?: 'pan' | 'selection';
  layout?: ImageEditorLayout;
  className?: string;
  classNames?: ImageEditorClassNames;
  unstyled?: boolean;
  labels?: Partial<ImageEditorLabels>;
  /**
   * When set and more than one picker option is available, shows a fixed
   * preset bar under the topbar. Hidden automatically for a single option.
   */
  onPresetChange?: (preset: ImageEditorPreset) => void;
  presetPicker?: PresetPickerConfig;
  /**
   * Tick-height animation on the rotation ruler while dragging (default `true`).
   * Circular progress on the angle badge is always on and cannot be disabled.
   */
  animateTicks?: boolean;
  /** Width in px for `.ie-ruler-tick` (default `2`). */
  tickWidth?: number;
  /** Width in px for `.ie-ruler-tick-major` (default: same as `tickWidth`). */
  majorTickWidth?: number;
  /** Ruler active color when angle ≤ 0 (defaults to theme `--ie-ruler-negative`). */
  negativeColor?: string;
  /** Ruler active color when angle > 0 (defaults to `--ie-accent`). */
  positiveColor?: string;
  /** Flat colors for the Rotation / Scale mode rings (light / current theme). */
  modeRingColors?: Partial<ModeRingColors>;
  /** Mode ring colors used when `theme="dark"`. Falls back to `modeRingColors`. */
  darkModeRingColors?: Partial<ModeRingColors>;
  /** `light` | `dark` — switches the built-in token set (`data-ie-theme`). Default `light`. */
  theme?: ImageEditorTheme;
  /**
   * Built-in UI language. Default `en`. `labels` still overrides individual strings.
   * Bundled catalogs: `en`, `tr`, `jp`.
   */
  locale?: ImageEditorLocale;
  /** Overrides for light-theme `--ie-*` tokens (also used when `theme="light"`). */
  colors?: Partial<ImageEditorThemeColors>;
  /**
   * Overrides for dark-theme `--ie-*` tokens when `theme="dark"`.
   * Use this for host-specific dark shells (pure black, zinc-950, purple, …).
   */
  darkColors?: Partial<ImageEditorThemeColors>;
  /**
   * After Done, show a floating preview of the exported image (bottom-left)
   * with download + close. Default `true`. Stays up after the editor closes.
   * Ignored when `exportView` is `"result"`.
   */
  showExportPreview?: boolean;
  /**
   * `preview` (default) shows `.ie-export-preview`.
   * `result` shows `.ie-export-result` in the page instead of that card.
   */
  exportView?: ImageEditorExportView;
  /**
   * Where `.ie-export-result` is mounted when `exportView` is `"result"`.
   * Same shape as `container`: a CSS selector, an element, or a ref.
   * Example: `exportResultContainer=".stage"`.
   * Omit it to render the block where `<ImageEditor />` sits in the tree.
   */
  exportResultContainer?: ImageEditorContainer;
  /**
   * Opening crop zoom relative to cover (default `2.5`). Higher = more zoomed
   * in when the editor first opens. Clamped to the live min/max zoom bounds.
   */
  initialZoom?: number;
  /**
   * Extra fonts for Markup text (Aa → font row). The built-in Default
   * system font is always available and does not need to be listed.
   */
  fonts?: ImageEditorFont[];
  /** Show original media pixel size in the crop tool chrome. */
  showMediaSize?: boolean;
  onExport: (blob: Blob) => void | Promise<void>;
  onCancel: () => void;
}

/** @deprecated Use `ImageEditorProps`. */
export type ImageEditorModalProps = ImageEditorProps;

/**
 * Colors of the two circular mode rings above the ruler.
 *
 * Every ring is drawn with exactly two flat colors and no gradient: the
 * `Track` is the full faint circle, the `Progress` is the arc on top of it.
 * The arc is the solid color from its very first degree — `+1` looks exactly
 * as saturated as `+45`, only shorter.
 *
 * Each key maps 1:1 to a CSS custom property, so these can be set either as a
 * prop or in CSS (see `image-editor-library.md` → "Mode ring colors"):
 *
 * | Key                        | CSS variable                             | Default   |
 * | -------------------------- | ---------------------------------------- | --------- |
 * | `rotationNegativeTrack`    | `--ie-mode-rotation-negative-track`      | `#E4E4E7` |
 * | `rotationNegativeProgress` | `--ie-mode-rotation-negative-progress`   | `#3F3F46` |
 * | `rotationPositiveTrack`    | `--ie-mode-rotation-positive-track`      | `oklch(88% 0.08 16.439)` |
 * | `rotationPositiveProgress` | `--ie-mode-rotation-positive-progress`   | `oklch(55.5% 0.46 16.439)` |
 * | `scaleTrack`               | `--ie-mode-scale-track`                  | `oklch(88% 0.08 16.439)` |
 * | `scaleProgress`            | `--ie-mode-scale-progress`               | `oklch(55.5% 0.46 16.439)` |
 * | `horizontalTrack`          | `--ie-mode-horizontal-track`             | `oklch(88% 0.08 16.439)` |
 * | `horizontalProgress`       | `--ie-mode-horizontal-progress`          | `oklch(55.5% 0.46 16.439)` |
 * | `verticalTrack`            | `--ie-mode-vertical-track`               | `oklch(88% 0.08 16.439)` |
 * | `verticalProgress`         | `--ie-mode-vertical-progress`            | `oklch(55.5% 0.46 16.439)` |
 * | `calibrateTrack`           | `--ie-mode-calibrate-track`              | `oklch(88% 0.08 16.439)` |
 * | `calibrateProgress`        | `--ie-mode-calibrate-progress`           | `oklch(55.5% 0.46 16.439)` |
 * | `calibrateNegativeTrack`   | `--ie-mode-calibrate-negative-track`     | `#E4E4E7` |
 * | `calibrateNegativeProgress`| `--ie-mode-calibrate-negative-progress`  | `#3F3F46` |
 */
export interface ModeRingColors {
  /** Rotation ring, angle ≤ 0: faint full circle. */
  rotationNegativeTrack: string;
  /** Rotation ring, angle < 0: solid arc (counter-clockwise). */
  rotationNegativeProgress: string;
  /** Rotation ring, angle > 0: faint full circle. */
  rotationPositiveTrack: string;
  /** Rotation ring, angle > 0: solid arc (clockwise). */
  rotationPositiveProgress: string;
  /** Scale ring, 0…100: faint full circle. */
  scaleTrack: string;
  /** Scale ring, 0…100: solid arc. */
  scaleProgress: string;
  /** Horizontal perspective ring, -100…100: faint full circle. */
  horizontalTrack: string;
  /** Horizontal perspective ring, -100…100: solid arc. */
  horizontalProgress: string;
  /** Vertical perspective ring, -100…100: faint full circle. */
  verticalTrack: string;
  /** Vertical perspective ring, -100…100: solid arc. */
  verticalProgress: string;
  /** Calibrate ring, value ≥ 0: faint full circle. */
  calibrateTrack: string;
  /** Calibrate ring, value > 0: solid arc. */
  calibrateProgress: string;
  /** Calibrate ring, value < 0: faint full circle. */
  calibrateNegativeTrack: string;
  /** Calibrate ring, value < 0: solid arc (counter-clockwise). */
  calibrateNegativeProgress: string;
}

/**
 * Channels in the Calibrate (Adjust) tool — UI −100…100, stored −1…1.
 * Derived from the core registry, so the strip order and this union can never
 * drift apart. Add new channels to `ADJUST_CHANNELS` in the core package.
 */
export type AdjustChannel = AdjustChannelKey;

/**
 * Bottom-bar mode: which circle is centered and which ruler is mounted.
 * `horizontal` / `vertical` are the perspective (keystone) sliders.
 */
export type EditorRulerMode = 'rotation' | 'scale' | 'horizontal' | 'vertical';

/**
 * English fallbacks for every calibrate channel. Typed as a total record, so a
 * new entry in `ADJUST_CHANNELS` fails to compile until it gets a label here.
 */
export const defaultAdjustLabels: Record<AdjustChannel, string> = {
  brightness: 'Brightness',
  exposure: 'Exposure',
  highlights: 'Highlights',
  contrast: 'Contrast',
  blackPoint: 'Black Point',
  saturation: 'Saturation',
  vibrance: 'Vibrance',
  brilliance: 'Brilliance',
  shadows: 'Shadows',
  vignette: 'Vignette',
  warmth: 'Warmth',
  tint: 'Tint',
  sharpness: 'Sharpness',
  definition: 'Definition',
};

/** Strip order for the Calibrate tool — the core registry order. */
export const adjustChannels: readonly AdjustChannel[] = ADJUST_CHANNELS;

/** Carousel order for the Filter tool — the core registry order. */
export const filterIds: readonly FilterId[] = FILTER_IDS;

/**
 * English fallbacks for every filter look. Typed as a total record, so a new
 * entry in `FILTER_IDS` fails to compile until it gets a label here.
 */
export const defaultFilterLabels: Record<FilterId, string> = {
  original: 'Original',
  vivid: 'Vivid',
  vividWarm: 'Vivid Warm',
  vividCool: 'Vivid Cool',
  dramatic: 'Dramatic',
  dramaticWarm: 'Dramatic Warm',
  dramaticCool: 'Dramatic Cool',
  mono: 'Mono',
  silvertone: 'Silvertone',
  noir: 'Noir',
};

export interface ImageEditorLabels extends Partial<Record<AdjustChannel, string>> {
  undo: string;
  redo: string;
  reset: string;
  rotateLeft: string;
  rotateRight: string;
  flipHorizontal: string;
  flipVertical: string;
  cancel: string;
  save: string;
  loading: string;
  /** Export-preview download button (aria / title). */
  download?: string;
  /** Export-preview close button (aria / title). */
  close?: string;
  /** Sidebar control that fills the screen with the editor. */
  fullscreen?: string;
  /** Sidebar control that leaves fullscreen. */
  exitFullscreen?: string;
  rotation?: string;
  scale?: string;
  horizontal?: string;
  vertical?: string;
  /** Aria / group label for Vertical↔Horizontal crop orientation. */
  orientation?: string;
  cropShape?: string;
  /** Heading above the filter carousel. */
  filterSection?: string;
  /** Badge shown when tapping the photo to peek at the ungraded crop. */
  compareOriginal?: string;
  /** Per-look names in the filter carousel. */
  filters?: Partial<Record<FilterId, string>>;
  /** Crop Shape chip labels (Original, Freeform, Square, Wallpaper, ratios…). */
  cropShapes?: Partial<{
    original: string;
    freeform: string;
    square: string;
    wallpaper: string;
    '16:9': string;
    '9:16': string;
    '4:5': string;
    '5:4': string;
    '5:7': string;
    '7:5': string;
    '3:4': string;
    '4:3': string;
    '3:5': string;
    '5:3': string;
    '2:3': string;
    '3:2': string;
  }>;
  /** Markup toolbar / shape badge / signature pad strings. */
  markup?: Partial<{
    move: string;
    pen: string;
    marker: string;
    pencil: string;
    eraser: string;
    lasso: string;
    ruler: string;
    text: string;
    shape: string;
    signature: string;
    sticker: string;
    loupe: string;
    add: string;
    addText: string;
    addSticker: string;
    addShape: string;
    addSignature: string;
    addLoupe: string;
    stickerEmojiTab: string;
    stickerKaomojiTab: string;
    color: string;
    strokeWidth: string;
    pixelEraser: string;
    objectEraser: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    typography: string;
    bold: string;
    italic: string;
    underline: string;
    strikethrough: string;
    fontDefault: string;
    fontFamily: string;
    decreaseFontSize: string;
    increaseFontSize: string;
    alignJustify: string;
    clear: string;
    done: string;
    border: string;
    opacity: string;
    duplicate: string;
    trash: string;
    noFill: string;
    noStroke: string;
    colorPicker: string;
    colors: string;
    colorGrid: string;
    colorSpectrum: string;
    colorSliders: string;
    eyedropper: string;
    srgbHex: string;
    hdrBoost: string;
    addColor: string;
  }>;
  /** Sidebar tool names (optional) */
  tools?: {
    crop?: string;
    /** iOS Photos Adjust — formerly "finetune". */
    calibrate?: string;
    /** @deprecated Use `calibrate`. */
    finetune?: string;
    filter?: string;
    annotate?: string;
    fill?: string;
    redact?: string;
    frame?: string;
  };
  frames?: Partial<Record<
    import('react-advanced-image-editor-core').FramePresetId,
    string
  >>;
  frameProps?: Partial<{
    thickness: string;
    color: string;
    accent: string;
    radius: string;
    spacing: string;
    shadow: string;
  }>;
  fillModes?: {
    none?: string;
    solid?: string;
    edgeBlur?: string;
    color?: string;
  };
  redact?: {
    move?: string;
    pixelate?: string;
    blur?: string;
    solid?: string;
    delete?: string;
    brushSize?: string;
    blockSize?: string;
    blurStrength?: string;
    rectangle?: string;
    brush?: string;
  };
}

export const defaultLabels: ImageEditorLabels = {
  undo: 'Undo',
  redo: 'Redo',
  reset: 'Reset',
  rotateLeft: 'Rotate left',
  rotateRight: 'Rotate right',
  flipHorizontal: 'Flip H',
  flipVertical: 'Flip V',
  cancel: 'Cancel',
  save: 'Done',
  loading: 'Loading…',
  download: 'Download',
  close: 'Close',
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  rotation: 'Rotation',
  scale: 'Scale',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  orientation: 'Orientation',
  cropShape: 'Crop shape',
  filterSection: 'Filter',
  compareOriginal: 'Original',
  filters: defaultFilterLabels,
  cropShapes: {
    original: 'Original',
    freeform: 'Freeform',
    square: 'Square',
    wallpaper: 'Wallpaper',
    '16:9': '16:9',
    '9:16': '9:16',
    '4:5': '4:5',
    '5:4': '5:4',
    '5:7': '5:7',
    '7:5': '7:5',
    '3:4': '3:4',
    '4:3': '4:3',
    '3:5': '3:5',
    '5:3': '5:3',
    '2:3': '2:3',
    '3:2': '3:2',
  },
  markup: {
    move: 'Move',
    pen: 'Pen',
    marker: 'Marker',
    pencil: 'Pencil',
    eraser: 'Eraser',
    lasso: 'Lasso',
    ruler: 'Ruler',
    text: 'Text',
    shape: 'Shapes',
    signature: 'Signature',
    sticker: 'Sticker',
    stickerEmojiTab: 'Emoji',
    stickerKaomojiTab: 'Kaomoji',
    color: 'Color',
    strokeWidth: 'Stroke width',
    pixelEraser: 'Pixel Eraser',
    objectEraser: 'Object Eraser',
    alignLeft: 'Align left',
    alignCenter: 'Align center',
    alignRight: 'Align right',
    typography: 'Text style',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strikethrough: 'Strikethrough',
    fontDefault: 'Default',
    fontFamily: 'Font',
    decreaseFontSize: 'Decrease text size',
    increaseFontSize: 'Increase text size',
    alignJustify: 'Justify',
    clear: 'Clear',
    done: 'Use',
    border: 'Border',
    opacity: 'Opacity',
    duplicate: 'Duplicate',
    trash: 'Delete',
    noFill: 'No Fill',
    noStroke: 'No Stroke',
    colorPicker: 'Color picker',
    colors: 'Colors',
    colorGrid: 'Grid',
    colorSpectrum: 'Spectrum',
    colorSliders: 'Sliders',
    eyedropper: 'Eyedropper',
    srgbHex: 'sRGB Hex Color #',
    hdrBoost: 'HDR Boost',
    addColor: 'Add color',
  },
  ...defaultAdjustLabels,
  tools: {
    crop: 'Crop',
    calibrate: 'Calibrate',
    filter: 'Filter',
    annotate: 'Markup',
    fill: 'Fill',
    redact: 'Redact',
    frame: 'Frame',
  },
  frames: {
    none: 'None',
    thin: 'Thin',
    solid: 'Solid',
    thick: 'Thick',
    double: 'Double',
    inner: 'Inner',
    outer: 'Outer',
    rounded: 'Rounded',
    'soft-round': 'Soft round',
    polaroid: 'Polaroid',
    film: 'Film',
    shadow: 'Shadow',
    offset: 'Offset',
    editorial: 'Editorial',
    classic: 'Classic',
    bleed: 'Full bleed',
    asymmetric: 'Asymmetric',
    gallery: 'Gallery',
    'white-mat': 'White mat',
    'black-mat': 'Black mat',
    'soft-shadow': 'Soft shadow',
    'hard-shadow': 'Hard shadow',
    'offset-shadow': 'Offset shadow',
    floating: 'Floating',
    raised: 'Raised',
    inset: 'Inset',
    beveled: 'Beveled',
    'photo-card': 'Photo card',
    vintage: 'Vintage',
    'modern-card': 'Modern card',
    'minimal-mat': 'Minimal',
    'double-shadow': 'Double + shadow',
    'outline-offset': 'Offset outline',
    layered: 'Layered',
    'inner-shadow': 'Inner shadow',
    'outer-glow': 'Outer glow',
    perspective: 'Perspective',
    compound: 'Compound',
    metal: 'Metal',
    'center-shadow': 'Center shadow',
  },
  frameProps: {
    thickness: 'Thickness',
    color: 'Color',
    accent: 'Accent',
    radius: 'Radius',
    spacing: 'Spacing',
    shadow: 'Shadow',
  },
  fillModes: {
    none: 'None',
    solid: 'Solid',
    edgeBlur: 'Blur',
    color: 'Color',
  },
  redact: {
    move: 'Move',
    pixelate: 'Pixelate',
    blur: 'Blur',
    solid: 'Solid',
    delete: 'Delete',
    brushSize: 'Brush',
    blockSize: 'Blocks',
    blurStrength: 'Blur',
    rectangle: 'Rectangle',
    brush: 'Brush',
  },
};

export type { ImageSource, ExportOptions, Rotation, FilterId };
