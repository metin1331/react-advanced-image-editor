import type { ExportOptions } from 'react-advanced-image-editor-core';
import type {
  CropConfig,
  ImageEditorFeatures,
  ImageEditorLayout,
  ImageEditorPreset,
} from './types';

export interface ImageEditorPresetDefinition {
  crop: CropConfig;
  exportOptions: ExportOptions;
  features: ImageEditorFeatures;
  cropOutsideImage: boolean;
  interactionMode: 'pan' | 'selection';
  layout: ImageEditorLayout;
  minZoom: number;
  maxZoom: number;
}

const FULL_FEATURES: ImageEditorFeatures = {
  sidebar: true,
  sidebarTools: true,
  resetButton: true,
  topBar: true,
  undoRedo: true,
  subToolbar: true,
  rotateLeft: true,
  flipHorizontal: true,
  flipVertical: true,
  cropShape: true,
  bottomBar: true,
  rotationTab: true,
  scaleTab: true,
  perspectiveTab: true,
  cornerHandles: true,
};

export const editorPresets: Record<ImageEditorPreset, ImageEditorPresetDefinition> = {
  default: {
    crop: { aspectRatio: null, guides: [] },
    exportOptions: { format: 'image/jpeg', quality: 0.92 },
    features: {
      ...FULL_FEATURES,
      scaleTab: true,
    },
    cropOutsideImage: false,
    interactionMode: 'pan',
    layout: 'full',
    minZoom: 1,
    maxZoom: 4,
  },
  selection: {
    crop: { aspectRatio: null, guides: ['rect'] },
    exportOptions: { format: 'image/jpeg', quality: 0.92 },
    features: {
      ...FULL_FEATURES,
      scaleTab: true,
    },
    cropOutsideImage: false,
    interactionMode: 'pan',
    layout: 'compact',
    minZoom: 1,
    maxZoom: 4,
  },
  outside: {
    crop: { aspectRatio: null, guides: [] },
    exportOptions: { format: 'image/png', quality: 1 },
    features: {
      ...FULL_FEATURES,
      scaleTab: true,
    },
    cropOutsideImage: true,
    interactionMode: 'pan',
    layout: 'full',
    minZoom: 0.25,
    maxZoom: 4,
  },
  profile: {
    crop: { aspectRatio: 1, guides: ['circle'] },
    // No maxWidth/maxHeight by default — pass exportOptions to opt in to downscale.
    exportOptions: {
      format: 'image/jpeg',
      quality: 0.9,
    },
    features: {
      ...FULL_FEATURES,
      scaleTab: true,
      cropShape: false,
    },
    cropOutsideImage: false,
    interactionMode: 'pan',
    layout: 'compact',
    minZoom: 1,
    maxZoom: 4,
  },
};

export interface ResolvedEditorConfig {
  preset: ImageEditorPreset;
  crop: CropConfig;
  exportOptions: ExportOptions;
  features: ImageEditorFeatures;
  cropOutsideImage: boolean;
  interactionMode: 'pan' | 'selection';
  layout: ImageEditorLayout;
  minZoom: number;
  maxZoom: number;
}

export interface ResolveEditorConfigInput {
  preset?: ImageEditorPreset;
  crop?: CropConfig;
  exportOptions?: ExportOptions;
  features?: Partial<ImageEditorFeatures>;
  cropOutsideImage?: boolean;
  interactionMode?: 'pan' | 'selection';
  layout?: ImageEditorLayout;
}

export function resolveEditorConfig(input: ResolveEditorConfigInput = {}): ResolvedEditorConfig {
  const presetName = input.preset ?? 'default';
  const base = editorPresets[presetName];

  const crop: CropConfig = {
    ...base.crop,
    ...input.crop,
    guides: input.crop?.guides ?? base.crop.guides,
  };

  const exportOptions: ExportOptions = {
    ...base.exportOptions,
    ...input.exportOptions,
    cropOutsideImage:
      input.exportOptions?.cropOutsideImage ??
      input.cropOutsideImage ??
      base.cropOutsideImage,
  };

  const features: ImageEditorFeatures = {
    ...base.features,
    ...input.features,
  };

  return {
    preset: presetName,
    crop,
    exportOptions,
    features,
    cropOutsideImage:
      input.cropOutsideImage ?? exportOptions.cropOutsideImage ?? base.cropOutsideImage,
    interactionMode: input.interactionMode ?? base.interactionMode,
    layout: input.layout ?? base.layout,
    minZoom: base.minZoom,
    maxZoom: base.maxZoom,
  };
}

/** Pick only the features you need — merges onto the default preset. */
export function createEditorConfig(
  features: Partial<ImageEditorFeatures>,
  overrides: Omit<ResolveEditorConfigInput, 'features'> = {}
): ResolvedEditorConfig {
  return resolveEditorConfig({ preset: 'default', features, ...overrides });
}

