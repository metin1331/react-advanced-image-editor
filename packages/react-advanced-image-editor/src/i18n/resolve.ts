import type { ImageEditorLabels, ImageEditorPreset } from '../types';
import {
  editorMessages,
  type EditorMessages,
  type ImageEditorLocale,
} from './messages';

const FRAME_KEY: Record<string, string> = {
  softRound: 'soft-round',
  whiteMat: 'white-mat',
  blackMat: 'black-mat',
  softShadow: 'soft-shadow',
  hardShadow: 'hard-shadow',
  offsetShadow: 'offset-shadow',
  photoCard: 'photo-card',
  modernCard: 'modern-card',
  minimalMat: 'minimal-mat',
  doubleShadow: 'double-shadow',
  outlineOffset: 'outline-offset',
  innerShadow: 'inner-shadow',
  outerGlow: 'outer-glow',
  centerShadow: 'center-shadow',
};

function mapFrames(frames: EditorMessages['frames']): ImageEditorLabels['frames'] {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(frames)) {
    mapped[FRAME_KEY[key] ?? key] = value;
  }
  return mapped;
}

export type ResolvedEditorLocale = {
  labels: ImageEditorLabels;
  presetLabel: string;
  presetLabels: Record<ImageEditorPreset, string>;
};

export function resolveEditorLocale(locale: ImageEditorLocale): ResolvedEditorLocale {
  const messages = editorMessages[locale] ?? editorMessages.en;
  return {
    presetLabel: messages.presetLabel,
    presetLabels: messages.presets,
    labels: {
      undo: messages.undo,
      redo: messages.redo,
      reset: messages.reset,
      rotateLeft: messages.rotateLeft,
      rotateRight: messages.rotateRight,
      flipHorizontal: messages.flipH,
      flipVertical: messages.flipV,
      cancel: messages.cancel,
      save: messages.save,
      loading: messages.loading,
      download: messages.download,
      close: messages.close,
      fullscreen: messages.fullscreen,
      exitFullscreen: messages.exitFullscreen,
      rotation: messages.rotation,
      scale: messages.scale,
      horizontal: messages.horizontal,
      vertical: messages.vertical,
      orientation: messages.orientation,
      cropShape: messages.cropShape,
      compareOriginal: messages.compareOriginal,
      filterSection: messages.filterSection,
      tools: messages.tools,
      frames: mapFrames(messages.frames),
      frameProps: messages.frameProps,
      fillModes: messages.fillModes,
      redact: messages.redact,
      cropShapes: messages.cropShapes,
      filters: messages.filters,
      markup: messages.markup,
      ...messages.calibrate,
    },
  };
}
