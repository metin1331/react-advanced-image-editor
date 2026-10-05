import { useState } from 'react';
import type {
  CropShapeId,
  CropShapeOrientation,
  CropShapeSelection,
} from '../crop/cropShape';
import {
  defaultCropShapeLabels,
  getCropShapePanelOptionIds,
} from '../crop/cropShape';
import { useHorizontalStripDragScroll } from '../scroll/useHorizontalStripDragScroll';

export type EditorCropShapePanelProps = {
  selection: CropShapeSelection;
  /** Used to pick ratio chips when orientation is cleared (Freeform, etc.). */
  referenceOrientation: CropShapeOrientation;
  onOrientationChange: (orientation: CropShapeOrientation) => void;
  onShapeChange: (shape: CropShapeId) => void;
  verticalLabel?: string;
  horizontalLabel?: string;
  orientationAriaLabel?: string;
  cropShapeAriaLabel?: string;
  shapeLabels?: Partial<Record<CropShapeId, string>>;
};

function OrientationGlyph({
  orientation,
  active,
}: {
  orientation: CropShapeOrientation;
  active: boolean;
}) {
  const portrait = orientation === 'vertical';
  return (
    <span
      className='ie-crop-shape-orient-glyph'
      data-orientation={orientation}
      data-active={active ? 'true' : undefined}
      aria-hidden
    >
      <span
        className='ie-crop-shape-orient-rect'
        style={
          portrait
            ? { width: 21.6, height: 32.4 }
            : { width: 32.4, height: 21.6 }
        }
      />
    </span>
  );
}

/**
 * Crop-shape selector — replaces the bottom rotation/scale strip
 * while Crop Shape mode is open.
 */
export function EditorCropShapePanel({
  selection,
  referenceOrientation,
  onOrientationChange,
  onShapeChange,
  verticalLabel = 'Vertical',
  horizontalLabel = 'Horizontal',
  orientationAriaLabel = 'Orientation',
  cropShapeAriaLabel = 'Crop shape',
  shapeLabels,
}: EditorCropShapePanelProps) {
  const labels = { ...defaultCropShapeLabels, ...shapeLabels };
  const [ratioRowEl, setRatioRowEl] = useState<HTMLDivElement | null>(null);
  useHorizontalStripDragScroll(ratioRowEl);
  const orientationLocked = selection.orientation == null;
  const ratioOrientation = selection.orientation ?? referenceOrientation;
  const shapeOptionIds = getCropShapePanelOptionIds(ratioOrientation);

  return (
    <div data-ie-part='crop-shape-panel' className='ie-crop-shape-panel'>
      <div
        className='ie-crop-shape-orient-row'
        role='group'
        aria-label={orientationAriaLabel}
      >
        {(
          [
            ['vertical', verticalLabel],
            ['horizontal', horizontalLabel],
          ] as const
        ).map(([id, label]) => {
          const active = !orientationLocked && selection.orientation === id;
          return (
            <button
              key={id}
              type='button'
              className='ie-crop-shape-orient'
              data-active={active ? 'true' : undefined}
              aria-pressed={active}
              aria-label={label}
              title={label}
              disabled={orientationLocked}
              onClick={() => onOrientationChange(id)}
            >
              <OrientationGlyph orientation={id} active={active} />
            </button>
          );
        })}
      </div>

      <div
        ref={setRatioRowEl}
        className='ie-crop-shape-ratio-row'
        role='listbox'
        aria-label={cropShapeAriaLabel}
      >
        {shapeOptionIds.map((id) => {
          const active = selection.shape === id;
          const label = labels[id];
          return (
            <button
              key={id}
              type='button'
              role='option'
              className='ie-crop-shape-option'
              data-active={active ? 'true' : undefined}
              aria-selected={active}
              onClick={() => onShapeChange(id)}
            >
              <span className='ie-crop-shape-option-label'>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
