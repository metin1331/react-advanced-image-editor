import {
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useModeBadgeStrip } from "../scroll/useModeBadgeStrip";
import type { EditorRulerMode, ModeRingColors } from "../types";

const BADGE = 56;
const STROKE = 2;
const RADIUS = (BADGE - STROKE) / 2 - 0.5;
const CIRC = 2 * Math.PI * RADIUS;

const RING_COLOR_VARS: Record<keyof ModeRingColors, string> = {
  rotationNegativeTrack: "--ie-mode-rotation-negative-track",
  rotationNegativeProgress: "--ie-mode-rotation-negative-progress",
  rotationPositiveTrack: "--ie-mode-rotation-positive-track",
  rotationPositiveProgress: "--ie-mode-rotation-positive-progress",
  scaleTrack: "--ie-mode-scale-track",
  scaleProgress: "--ie-mode-scale-progress",
  horizontalTrack: "--ie-mode-horizontal-track",
  horizontalProgress: "--ie-mode-horizontal-progress",
  verticalTrack: "--ie-mode-vertical-track",
  verticalProgress: "--ie-mode-vertical-progress",
  calibrateTrack: "--ie-mode-calibrate-track",
  calibrateProgress: "--ie-mode-calibrate-progress",
  calibrateNegativeTrack: "--ie-mode-calibrate-negative-track",
  calibrateNegativeProgress: "--ie-mode-calibrate-negative-progress",
};

function ringColorStyle(colors?: Partial<ModeRingColors>) {
  if (!colors) return undefined;
  const style: Record<string, string> = {};
  for (const [key, varName] of Object.entries(RING_COLOR_VARS)) {
    const value = colors[key as keyof ModeRingColors];
    if (value) style[varName] = value;
  }
  return Object.keys(style).length ? (style as CSSProperties) : undefined;
}

export type ModeBadgeKind = "rotation" | "scale" | "horizontal" | "vertical";

type NumericBadgeProps = {
  mode: "rotation" | "scale";
  active: boolean;
  value: number;
  label: string;
  onSelect: () => void;
  rulerFocus?: boolean;
  /** Live value is 0 but a previous amount is stashed for the next tap. */
  parked?: boolean;
};

function RotationGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 12a8.5 8.5 0 1 1-8.5-8.5c2.35 0 4.59.93 6.24 2.5L20.5 8" />
      <path d="M20.5 3.5v4.5H16" />
    </svg>
  );
}

function ScaleGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 15 5.5 5.5" />
      <path d="m15 9 5.5-5.5" />
      <path d="M20.5 15.5v5h-5" />
      <path d="M20.5 8.5v-5h-5" />
      <path d="M3.5 15.5v5h5" />
      <path d="m3.5 20.5 5.5-5.5" />
      <path d="M3.5 8.5v-5h5" />
      <path d="m9 9  -5.5-5.5" />
    </svg>
  );
}

/** Keystone glyphs: a rectangle seen from off-axis, narrow on the far edge. */
function PerspectiveGlyph({ axis }: { axis: "horizontal" | "vertical" }) {
  return (
    <svg width="24" height="24" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d={
          axis === "vertical"
            ? "M6.2 4h7.6l2.7 12H3.5z"
            : "M4 6.2v7.6l12 2.7V3.5z"
        }
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Rotation / Scale: icon at rest, number while active and non-zero. */
function EditorModeBadge({
  mode,
  active,
  value,
  label,
  onSelect,
  rulerFocus = false,
  parked = false,
}: NumericBadgeProps) {
  const cx = BADGE / 2;
  const cy = BADGE / 2;

  const progress =
    mode === "rotation"
      ? Math.min(1, Math.abs(value) / 45)
      : Math.min(1, Math.max(0, value / 100));

  // At 0 / parked: negative (gray) pair. Accent only while the live value is > 0.
  const sign =
    parked || ((mode === "rotation" || mode === "scale") && value <= 0)
      ? "negative"
      : "positive";
  const isNeg =
    parked || ((mode === "rotation" || mode === "scale") && value <= 0);
  const hasProgress = progress > 0.001;
  const arcLen = progress * CIRC;
  const shown = Math.round(value);
  const showNumber = active && shown !== 0;

  return (
    <button
      type="button"
      data-ie-mode={mode}
      data-ie-sign={sign}
      data-ie-progress={hasProgress ? "true" : undefined}
      data-ie-active={active ? "true" : undefined}
      data-ie-ruler-focus={rulerFocus ? "true" : undefined}
      data-ie-parked={parked ? "true" : undefined}
      className="ie-mode-badge"
      onClick={onSelect}
      aria-label={label}
    >
      <svg
        className="ie-mode-badge-svg"
        width={BADGE}
        height={BADGE}
        viewBox={`0 0 ${BADGE} ${BADGE}`}
        aria-hidden
      >
        <circle
          className="ie-mode-badge-track"
          cx={cx}
          cy={cy}
          r={RADIUS + 0.5}
          fill="none"
          strokeWidth={STROKE}
        />
        {hasProgress && (
          <g
            transform={
              isNeg
                ? `translate(${cx} ${cy}) scale(-1 1) rotate(-90)`
                : `translate(${cx} ${cy}) rotate(-90)`
            }
          >
            <circle
              className="ie-mode-badge-progress"
              cx={0}
              cy={0}
              r={RADIUS + 0.5}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${arcLen} ${CIRC}`}
            />
          </g>
        )}
      </svg>
      {showNumber ? (
        <span className="ie-mode-badge-value">{shown}</span>
      ) : (
        <span className="ie-mode-badge-icon">
          {mode === "rotation" ? <RotationGlyph /> : <ScaleGlyph />}
        </span>
      )}
    </button>
  );
}

type PerspectiveBadgeProps = {
  mode: "horizontal" | "vertical";
  active: boolean;
  /** Keystone amount in -100…100. */
  value: number;
  label: string;
  onSelect: () => void;
  rulerFocus?: boolean;
  parked?: boolean;
};

/**
 * Vertical / Horizontal perspective. Same ring language as Rotation and Scale:
 * a flat track with a signed arc whose length encodes the amount. The keystone
 * glyph shows at rest and gives way to the number once the value moves.
 */
function EditorPerspectiveBadge({
  mode,
  active,
  value,
  label,
  onSelect,
  rulerFocus = false,
  parked = false,
}: PerspectiveBadgeProps) {
  const cx = BADGE / 2;
  const cy = BADGE / 2;
  const progress = Math.min(1, Math.abs(value) / 100);
  const hasProgress = progress > 0.001;
  const arcLen = progress * CIRC;
  const shown = Math.round(value);
  const isNeg = parked || value <= 0;

  return (
    <button
      type="button"
      data-ie-mode={mode}
      data-ie-sign={isNeg ? "negative" : "positive"}
      data-ie-progress={hasProgress ? "true" : undefined}
      data-ie-active={active ? "true" : undefined}
      data-ie-ruler-focus={rulerFocus ? "true" : undefined}
      data-ie-parked={parked ? "true" : undefined}
      className="ie-mode-badge ie-mode-badge-align"
      onClick={onSelect}
      aria-label={label}
    >
      <svg
        className="ie-mode-badge-svg"
        width={BADGE}
        height={BADGE}
        viewBox={`0 0 ${BADGE} ${BADGE}`}
        aria-hidden
      >
        <circle
          className="ie-mode-badge-track"
          cx={cx}
          cy={cy}
          r={RADIUS + 0.5}
          fill="none"
          strokeWidth={STROKE}
        />
        {hasProgress && (
          <g
            transform={
              isNeg
                ? `translate(${cx} ${cy}) scale(-1 1) rotate(-90)`
                : `translate(${cx} ${cy}) rotate(-90)`
            }
          >
            <circle
              className="ie-mode-badge-progress"
              cx={0}
              cy={0}
              r={RADIUS + 0.5}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${arcLen} ${CIRC}`}
            />
          </g>
        )}
      </svg>
      {active && shown !== 0 ? (
        <span className="ie-mode-badge-value">{shown}</span>
      ) : (
        <span className="ie-mode-badge-icon">
          <PerspectiveGlyph axis={mode} />
        </span>
      )}
    </button>
  );
}

type StripProps = {
  showRotation: boolean;
  showScale: boolean;
  /** Vertical / Horizontal perspective circles (default: same as showScale). */
  showPerspective?: boolean;
  highlightMode: EditorRulerMode;
  committedMode: EditorRulerMode;
  rotationValue: number;
  scaleValue: number;
  /** Vertical keystone in -100…100. */
  perspectiveYValue?: number;
  /** Horizontal keystone in -100…100. */
  perspectiveXValue?: number;
  rotationLabel: string;
  scaleLabel: string;
  horizontalLabel: string;
  verticalLabel: string;
  onHighlightChange: (mode: EditorRulerMode) => void;
  onCommitMode: (mode: EditorRulerMode) => void;
  /** Tap the already-active circle to park (zero) or restore that mode. */
  onResetMode?: (mode: EditorRulerMode) => void;
  /** Stashed UI values while a badge is parked at 0. */
  parkedValues?: Partial<Record<EditorRulerMode, number>>;
  /**
   * Circle under the pointer, or `null` once it leaves the strip. Labels are
   * rendered outside the strip (over the preview), so the host needs to know
   * which one to show without the strip reserving a row for it.
   */
  onHoverModeChange?: (mode: EditorRulerMode | null) => void;
  ringColors?: Partial<ModeRingColors>;
  /** Badge id kept visible while chrome fades during ruler holds. */
  chromeFadeFocus?: string | null;
};

/** Horizontal snap strip — active circle centers above the ruler; ruler swaps after settle. */
export function EditorModeStrip({
  showRotation,
  showScale,
  showPerspective = showScale,
  highlightMode,
  committedMode: _committedMode,
  rotationValue,
  scaleValue,
  perspectiveYValue = 0,
  perspectiveXValue = 0,
  rotationLabel,
  scaleLabel,
  horizontalLabel,
  verticalLabel,
  onHighlightChange,
  onCommitMode,
  onResetMode,
  onHoverModeChange,
  ringColors,
  chromeFadeFocus = null,
  parkedValues,
}: StripProps) {
  const [stripEl, setStripEl] = useState<HTMLDivElement | null>(null);

  // Perspective sits next to Scale, mirroring the usual tool ordering.
  const modes: EditorRulerMode[] = [
    ...(showRotation ? (["rotation"] as const) : []),
    ...(showScale ? (["scale"] as const) : []),
    ...(showPerspective ? (["vertical", "horizontal"] as const) : []),
  ];

  const { onScroll, onSelect } = useModeBadgeStrip(
    stripEl,
    modes,
    highlightMode,
    onHighlightChange,
    onCommitMode,
    "rotation",
  );

  const onPointerOver = (e: PointerEvent<HTMLDivElement>) => {
    if (!onHoverModeChange) return;
    const badge = (e.target as HTMLElement).closest(
      "[data-ie-mode]",
    ) as HTMLElement | null;
    const mode = badge?.dataset.ieMode as EditorRulerMode | undefined;
    onHoverModeChange(mode && modes.includes(mode) ? mode : null);
  };

  if (modes.length === 0) return null;

  return (
    <div
      ref={setStripEl}
      className="ie-mode-strip ie-calibrate-strip"
      data-ie-part="mode-strip"
      data-ie-mode-count={modes.length}
      style={ringColorStyle(ringColors)}
      onScroll={onScroll}
      onPointerOver={onPointerOver}
      onPointerLeave={() => onHoverModeChange?.(null)}
    >
      {showRotation && (
        <EditorModeBadge
          mode="rotation"
          active={highlightMode === "rotation"}
          value={rotationValue}
          label={rotationLabel}
          onSelect={() => onSelect("rotation", onResetMode)}
          rulerFocus={chromeFadeFocus === "rotation"}
          parked={parkedValues?.rotation != null}
        />
      )}
      {showScale && (
        <EditorModeBadge
          mode="scale"
          active={highlightMode === "scale"}
          value={scaleValue}
          label={scaleLabel}
          onSelect={() => onSelect("scale", onResetMode)}
          rulerFocus={chromeFadeFocus === "scale"}
          parked={parkedValues?.scale != null}
        />
      )}
      {showPerspective && (
        <>
          <EditorPerspectiveBadge
            mode="vertical"
            active={highlightMode === "vertical"}
            value={perspectiveYValue}
            label={verticalLabel}
            onSelect={() => onSelect("vertical", onResetMode)}
            rulerFocus={chromeFadeFocus === "vertical"}
            parked={parkedValues?.vertical != null}
          />
          <EditorPerspectiveBadge
            mode="horizontal"
            active={highlightMode === "horizontal"}
            value={perspectiveXValue}
            label={horizontalLabel}
            onSelect={() => onSelect("horizontal", onResetMode)}
            rulerFocus={chromeFadeFocus === "horizontal"}
            parked={parkedValues?.horizontal != null}
          />
        </>
      )}
    </div>
  );
}

export { EditorModeBadge, EditorPerspectiveBadge };
