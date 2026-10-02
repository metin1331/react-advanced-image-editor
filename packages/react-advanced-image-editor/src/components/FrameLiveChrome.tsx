import type { CSSProperties } from 'react';
import type { FrameLayout, FrameState } from 'react-advanced-image-editor-core';

/** Decorative layers that sit around the live crop so frame styles match export. */
export function FrameLiveChrome({
  frame,
  layout,
  layer = 'front',
}: {
  frame: FrameState;
  layout: FrameLayout;
  layer?: 'back' | 'front';
}) {
  const { photoX, photoY, photoW, photoH, metrics: f } = layout;
  const preset = frame.preset;
  if (preset === 'none') return null;

  if (layer === 'back') {
    if (preset === 'offset') {
      return (
        <span
          className='ie-frame-chrome-offset'
          style={{
            position: 'absolute',
            left: photoX + f.offsetX,
            top: photoY + f.offsetY,
            width: photoW,
            height: photoH,
            background: f.color,
          }}
        />
      );
    }
    if (preset === 'outer' || preset === 'classic') {
      const inset = Math.max(0, f.borderWidth);
      return (
        <span
          className='ie-frame-chrome-mat'
          style={{
            position: 'absolute',
            left: inset,
            top: inset,
            right: inset,
            bottom: inset,
            background: preset === 'classic' ? '#f1e6d2' : f.accentColor,
            boxShadow:
              preset === 'classic'
                ? `inset 0 0 0 ${Math.max(2, Math.round(f.borderWidth * 0.12))}px ${f.accentColor}`
                : undefined,
          }}
        />
      );
    }
    if (preset === 'hard-shadow' || preset === 'offset-shadow') {
      return (
        <span
          className='ie-frame-chrome-offset'
          style={{
            position: 'absolute',
            left: photoX + f.offsetX,
            top: photoY + f.offsetY,
            width: photoW,
            height: photoH,
            background: f.accentColor,
          }}
        />
      );
    }
    if (preset === 'outline-offset') {
      return (
        <span
          className='ie-frame-chrome-offset'
          style={{
            position: 'absolute',
            left: photoX + f.offsetX,
            top: photoY + f.offsetY,
            width: photoW,
            height: photoH,
            boxShadow: `inset 0 0 0 ${Math.max(2, f.innerBorderWidth || 2)}px ${f.accentColor}`,
            background: 'transparent',
          }}
        />
      );
    }
    if (preset === 'perspective') {
      return (
        <span
          className='ie-frame-chrome-perspective'
          style={{
            position: 'absolute',
            left: photoX + f.offsetX * 0.2,
            top: photoY + photoH,
            width: photoW + f.offsetX * 0.8,
            height: f.offsetY,
            background: f.accentColor,
            clipPath: 'polygon(8% 0, 100% 0, 100% 100%, 2% 100%)',
          }}
        />
      );
    }
    if (preset === 'layered') {
      const gap = Math.max(8, f.innerGap);
      return (
        <span
          className='ie-frame-chrome-mat'
          style={{
            position: 'absolute',
            left: photoX - gap,
            top: photoY - gap,
            width: photoW + gap * 2,
            height: photoH + gap * 2,
            background: f.accentColor,
          }}
        />
      );
    }
    if (preset === 'beveled' || preset === 'metal') {
      const b = Math.max(6, f.bevelWidth);
      return (
        <span
          className='ie-frame-chrome-bevel'
          style={{
            position: 'absolute',
            inset: 0,
            background: f.color,
            boxShadow: `inset ${b}px ${b}px 0 rgba(255,255,255,0.35), inset -${b}px -${b}px 0 rgba(0,0,0,0.28)`,
          }}
        />
      );
    }
    return null;
  }

  const photo: CSSProperties = {
    position: 'absolute',
    left: photoX,
    top: photoY,
    width: photoW,
    height: photoH,
    pointerEvents: 'none',
  };

  return (
    <div className='ie-frame-chrome' data-ie-frame={preset} aria-hidden>
      {(preset === 'double' ||
        preset === 'editorial' ||
        preset === 'gallery' ||
        preset === 'asymmetric' ||
        preset === 'classic' ||
        preset === 'vintage' ||
        preset === 'double-shadow' ||
        preset === 'compound') && (
        <span
          className='ie-frame-chrome-keyline'
          data-ie-double={
            preset === 'double' ||
            preset === 'gallery' ||
            preset === 'double-shadow' ||
            preset === 'compound'
              ? 'true'
              : undefined
          }
          style={{
            ...photo,
            left: photoX - f.innerGap,
            top: photoY - f.innerGap,
            width: photoW + f.innerGap * 2,
            height: photoH + f.innerGap * 2,
            boxShadow:
              preset === 'gallery' || preset === 'double'
                ? `0 0 0 ${Math.max(1, f.innerBorderWidth)}px ${f.accentColor}, 0 0 0 ${Math.max(1, f.innerBorderWidth) + 4}px ${f.accentColor}`
                : `0 0 0 ${Math.max(1, f.innerBorderWidth || 1)}px ${f.accentColor}`,
          }}
        />
      )}

      {preset === 'inner' && (
        <span
          className='ie-frame-chrome-inner'
          style={{
            ...photo,
            left: f.innerGap,
            top: f.innerGap,
            width: photoW - f.innerGap * 2,
            height: photoH - f.innerGap * 2,
            boxShadow: `inset 0 0 0 ${Math.max(1, f.borderWidth)}px ${f.color}`,
          }}
        />
      )}

      {(preset === 'inner-shadow' || preset === 'inset' || preset === 'vintage') &&
        f.innerShadowIntensity > 0 && (
          <span
            className='ie-frame-chrome-inner'
            style={{
              ...photo,
              boxShadow: `inset 0 ${6 + f.innerShadowIntensity * 10}px ${14 + f.innerShadowIntensity * 22}px rgba(0,0,0,${0.28 + f.innerShadowIntensity * 0.35})`,
            }}
          />
        )}

      {(preset === 'black-mat' || preset === 'minimal-mat') && (
        <span
          className='ie-frame-chrome-inner'
          style={{
            ...photo,
            boxShadow: `inset 0 0 0 ${Math.max(1, f.innerBorderWidth || 1)}px ${f.accentColor}`,
          }}
        />
      )}

      {preset === 'white-mat' && (
        <span
          className='ie-frame-chrome-inner'
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: `inset 0 0 0 1px ${f.accentColor}`,
          }}
        />
      )}

      {preset === 'film' && (
        <>
          <span
            className='ie-frame-chrome-sprocket ie-frame-chrome-sprocket-l'
            style={{ left: Math.max(2, photoX / 2 - 4), width: Math.max(5, photoX * 0.38) }}
          />
          <span
            className='ie-frame-chrome-sprocket ie-frame-chrome-sprocket-r'
            style={{
              left: photoX + photoW + Math.max(2, (layout.outW - photoX - photoW) / 2 - 4),
              right: 'auto',
              width: Math.max(5, photoX * 0.38),
            }}
          />
        </>
      )}
    </div>
  );
}
