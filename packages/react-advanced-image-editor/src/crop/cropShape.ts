/**
 * iPhone Photos crop-shape model: orientation (Vertical/Horizontal) is a
 * separate selection from the aspect preset (Original, Freeform, Square, …).
 */

export type CropShapeOrientation = 'vertical' | 'horizontal';

export type CropShapeId =
  | 'original'
  | 'freeform'
  | 'square'
  | 'wallpaper'
  | '16:9'
  | '9:16'
  | '4:5'
  | '5:4'
  | '5:7'
  | '7:5'
  | '3:4'
  | '4:3'
  | '3:5'
  | '5:3'
  | '2:3'
  | '3:2';

/** Presets that clear Vertical/Horizontal when chosen. */
export const CROP_SHAPES_CLEAR_ORIENTATION: ReadonlySet<CropShapeId> = new Set([
  'freeform',
  'square',
  'wallpaper',
]);

/** Vertical orientation ratio chips (portrait forms). */
export const CROP_SHAPE_VERTICAL_RATIOS: ReadonlyArray<CropShapeId> = [
  '9:16',
  '4:5',
  '5:7',
  '3:4',
  '3:5',
  '2:3',
];

/** Horizontal orientation ratio chips (landscape forms). */
export const CROP_SHAPE_HORIZONTAL_RATIOS: ReadonlyArray<CropShapeId> = [
  '16:9',
  '5:4',
  '7:5',
  '4:3',
  '5:3',
  '3:2',
];

/** All numbered ratio ids (both orientations). */
export const CROP_SHAPE_RATIOS: ReadonlyArray<CropShapeId> = [
  ...CROP_SHAPE_VERTICAL_RATIOS,
  ...CROP_SHAPE_HORIZONTAL_RATIOS,
];

const CROP_SHAPE_VERTICAL_RATIO_SET = new Set<CropShapeId>(
  CROP_SHAPE_VERTICAL_RATIOS,
);
const CROP_SHAPE_HORIZONTAL_RATIO_SET = new Set<CropShapeId>(
  CROP_SHAPE_HORIZONTAL_RATIOS,
);

/** Fixed width/height aspect for each numbered ratio chip. */
const SHAPE_ASPECT: Partial<Record<CropShapeId, number>> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:5': 4 / 5,
  '5:4': 5 / 4,
  '5:7': 5 / 7,
  '7:5': 7 / 5,
  '3:4': 3 / 4,
  '4:3': 4 / 3,
  '3:5': 3 / 5,
  '5:3': 5 / 3,
  '2:3': 2 / 3,
  '3:2': 3 / 2,
};

/** Maps a ratio chip to its counterpart when toggling orientation. */
const ORIENTATION_SHAPE_MAP: Partial<Record<CropShapeId, CropShapeId>> = {
  '9:16': '16:9',
  '16:9': '9:16',
  '4:5': '5:4',
  '5:4': '4:5',
  '5:7': '7:5',
  '7:5': '5:7',
  '3:4': '4:3',
  '4:3': '3:4',
  '3:5': '5:3',
  '5:3': '3:5',
  '2:3': '3:2',
  '3:2': '2:3',
};

/** iPhone lock-screen style wallpaper aspect (≈ modern Super Retina). */
export const WALLPAPER_ASPECT = 9 / 19.5;

export interface CropShapeSelection {
  shape: CropShapeId;
  /** null when Freeform / Square / Wallpaper cleared orientation. */
  orientation: CropShapeOrientation | null;
}

const ALL_CROP_SHAPE_IDS: ReadonlyArray<CropShapeId> = [
  'original',
  'freeform',
  'square',
  'wallpaper',
  ...CROP_SHAPE_RATIOS,
];

export function normalizeCropShapeId(shape: string): CropShapeId {
  return (ALL_CROP_SHAPE_IDS as readonly string[]).includes(shape)
    ? (shape as CropShapeId)
    : 'original';
}

export function initialCropOrientation(
  mediaWidth: number,
  mediaHeight: number
): CropShapeOrientation {
  if (mediaWidth > 0 && mediaHeight > 0 && mediaWidth > mediaHeight) {
    return 'horizontal';
  }
  return 'vertical';
}

export function createInitialCropShapeSelection(
  mediaWidth: number,
  mediaHeight: number,
  presetAspect: number | null | undefined
): CropShapeSelection {
  const orientation = initialCropOrientation(mediaWidth, mediaHeight);
  if (presetAspect != null && presetAspect > 0 && Math.abs(presetAspect - 1) < 1e-4) {
    return { shape: 'square', orientation: null };
  }
  return { shape: 'original', orientation };
}

function asPortrait(ratio: number): number {
  return ratio <= 1 ? ratio : 1 / ratio;
}

function asLandscape(ratio: number): number {
  return ratio >= 1 ? ratio : 1 / ratio;
}

/**
 * Resolve the crop frame aspect (width / height).
 * `null` means freeform (unlocked).
 */
export function resolveCropShapeAspect(
  selection: CropShapeSelection,
  mediaWidth: number,
  mediaHeight: number
): number | null {
  const { shape, orientation } = selection;
  if (shape === 'freeform') return null;
  if (shape === 'square') return 1;
  if (shape === 'wallpaper') return WALLPAPER_ASPECT;

  const fixedAspect = SHAPE_ASPECT[shape];
  if (fixedAspect != null) return fixedAspect;

  if (shape === 'original') {
    const native =
      mediaWidth > 0 && mediaHeight > 0 ? mediaWidth / mediaHeight : 1;
    if (orientation === 'horizontal') return asLandscape(native);
    if (orientation === 'vertical') return asPortrait(native);
    return native;
  }

  return mediaWidth > 0 && mediaHeight > 0 ? mediaWidth / mediaHeight : 1;
}

export function getCropShapeRatioOptionIds(
  orientation: CropShapeOrientation
): ReadonlyArray<CropShapeId> {
  return orientation === 'horizontal'
    ? CROP_SHAPE_HORIZONTAL_RATIOS
    : CROP_SHAPE_VERTICAL_RATIOS;
}

/** Base chips plus orientation-specific ratio chips for the crop-shape panel. */
export function getCropShapePanelOptionIds(
  orientation: CropShapeOrientation
): ReadonlyArray<CropShapeId> {
  return [
    'original',
    'freeform',
    'square',
    'wallpaper',
    ...getCropShapeRatioOptionIds(orientation),
  ];
}

export function applyCropShapeId(
  prev: CropShapeSelection,
  shape: CropShapeId,
  mediaWidth: number,
  mediaHeight: number
): CropShapeSelection {
  if (CROP_SHAPES_CLEAR_ORIENTATION.has(shape)) {
    return { shape, orientation: null };
  }

  let orientation = prev.orientation;
  if (orientation == null) {
    orientation = initialCropOrientation(mediaWidth, mediaHeight);
  }

  if (CROP_SHAPE_HORIZONTAL_RATIO_SET.has(shape)) {
    orientation = 'horizontal';
  } else if (CROP_SHAPE_VERTICAL_RATIO_SET.has(shape)) {
    orientation = 'vertical';
  }

  return { shape, orientation };
}

export function applyCropOrientation(
  prev: CropShapeSelection,
  orientation: CropShapeOrientation,
  mediaWidth: number,
  mediaHeight: number
): CropShapeSelection {
  if (prev.orientation == null) return prev;

  // Tapping the already-active orientation restores Original + the photo's native ratio.
  if (prev.orientation === orientation) {
    return {
      shape: 'original',
      orientation: initialCropOrientation(mediaWidth, mediaHeight),
    };
  }

  let shape = prev.shape;
  const mapped = ORIENTATION_SHAPE_MAP[shape];
  if (mapped != null) {
    shape = mapped;
  }

  return { shape, orientation };
}

/** Stable base option ids — ratio chips are orientation-dependent. */
export const CROP_SHAPE_BASE_OPTION_IDS: ReadonlyArray<CropShapeId> = [
  'original',
  'freeform',
  'square',
  'wallpaper',
];

/**
 * @deprecated Prefer `getCropShapePanelOptionIds(orientation)` for UI lists.
 * Kept for backwards compatibility — includes all ratio ids.
 */
export const CROP_SHAPE_OPTION_IDS: ReadonlyArray<CropShapeId> = [
  ...CROP_SHAPE_BASE_OPTION_IDS,
  ...CROP_SHAPE_RATIOS,
];

/** English fallbacks for crop-shape chips. */
export const defaultCropShapeLabels: Record<CropShapeId, string> = {
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
};

/** @deprecated Prefer `CROP_SHAPE_OPTION_IDS` + label map. */
export const CROP_SHAPE_OPTIONS: ReadonlyArray<{
  id: CropShapeId;
  label: string;
}> = CROP_SHAPE_OPTION_IDS.map((id) => ({
  id,
  label: defaultCropShapeLabels[id],
}));
