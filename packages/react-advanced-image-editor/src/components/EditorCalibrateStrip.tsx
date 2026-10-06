import {
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useModeBadgeStrip } from "../scroll/useModeBadgeStrip";
import {
  adjustChannels,
  type AdjustChannel,
  type ModeRingColors,
} from "../types";

const BADGE = 56;
const STROKE = 2;
const RADIUS = (BADGE - STROKE) / 2 - 0.5;
const CIRC = 2 * Math.PI * RADIUS;

const CHANNELS = adjustChannels;

const RING_COLOR_VARS: Partial<Record<keyof ModeRingColors, string>> = {
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
    if (value && varName) style[varName] = value;
  }
  return Object.keys(style).length ? (style as CSSProperties) : undefined;
}

function CalibrateGlyph({ channel }: { channel: AdjustChannel }) {
  switch (channel) {
    case "brightness":
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
        >
          <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      );
    case "exposure":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />

          <path d="M10 15h4" />
          <path d="M10 9h4" />
          <path d="M12 7v4" />
        </svg>
      );
    case "highlights":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 13 3.5-3.5 3.5 3.5" />
        </svg>
      );
    case "contrast":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="currentColor"
        >
          <path d="M17 3.34A10 10 0 1 1 2 12l.005-.324A10 10 0 0 1 17 3.34M8 5.072A8 8 0 0 0 12.001 20L12 4a8 8 0 0 0-4 1.072" />
        </svg>
      );
    case "blackPoint":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case "saturation":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path
            d="M7.5 5.3v13.4M12 3v18M16.5 5.3v13.4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "vibrance":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path
            d="M5.3 7.5h13.4M3 12h18M5.3 16.5h13.4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "brilliance":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path
            d="
            M12 3
            A9 9 0 0 1 12 21
            A4.5 4.5 0 0 1 12 12
            A4.5 4.5 0 0 0 12 3
            Z
          "
            fill="currentColor"
          />
        </svg>
      );
    case "shadows":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M12 5h5.7a1 1 0 0 1 0 2H12z" />
          <path d="M12 8h7.2a1 1 0 0 1 0 2H12z" />
          <path d="M12 11h8a1 1 0 0 1 0 2h-8z" />
          <path d="M12 14h7.2a1 1 0 0 1 0 2H12z" />
          <path d="M12 17h5.7a1 1 0 0 1 0 2H12z" />
        </svg>
      );
    case "vignette":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22.5"
          height="22.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.1 2.182a10 10 0 0 1 3.8 0" />
          <path d="M13.9 21.818a10 10 0 0 1-3.8 0" />
          <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7" />
          <path d="M2.182 13.9a10 10 0 0 1 0-3.8" />
          <path d="M20.279 17.609a10 10 0 0 1-2.7 2.69" />
          <path d="M21.818 10.1a10 10 0 0 1 0 3.8" />
          <path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" />
          <path d="M6.391 20.279a10 10 0 0 1-2.69-2.7" />

          <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "warmth":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            fill="currentColor"
            d="M12 2c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 17 10a5 5 0 1 1-10 0c0-.3 0-.6.1-.9a2 2 0 1 0 3.3-2C8 4.5 11 2 12 2Z"
            transform="translate(0 5)"
          />
        </svg>
      );
    case "definition":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M6.5 14.5c2 0 1.5-5 3.5-5s1.5 5 3.5 5 1.5-5 3.5-5" />
        </svg>
      );
    case "sharpness":
      // Pen-nib wedge: a hard edge coming to a point.
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M19.8 7.5A9 9 0 0 1 4.2 16.5L19.8 7.5Z"
            fill="currentColor"
          />
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path
            d="M19.8 7.5L4.2 16.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "tint":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M4.5 8.5q1.875 1.4 3.75 0t3.75 0 3.75 0 3.75 0" />{" "}
          <path d="M3.5 12q2.125 1.4 4.25 0t4.25 0 4.25 0 4.25 0" />{" "}
          <path d="M4.5 15.5q1.875 1.4 3.75 0t3.75 0 3.75 0 3.75 0" />{" "}
        </svg>
      );
  }
}

type BadgeProps = {
  channel: AdjustChannel;
  active: boolean;
  /** UI value −100…100. */
  value: number;
  label: string;
  onSelect: () => void;
  rulerFocus?: boolean;
  parked?: boolean;
};

function CalibrateBadge({
  channel,
  active,
  value,
  label,
  onSelect,
  rulerFocus = false,
  parked = false,
}: BadgeProps) {
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
      data-ie-mode={channel}
      data-ie-sign={isNeg ? "negative" : "positive"}
      data-ie-progress={hasProgress ? "true" : undefined}
      data-ie-active={active ? "true" : undefined}
      data-ie-ruler-focus={rulerFocus ? "true" : undefined}
      data-ie-parked={parked ? "true" : undefined}
      className="ie-mode-badge ie-mode-badge-calibrate"
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
      {/* Number only while this circle is active; inactive always shows the icon.
          Progress arc stays driven by `value` regardless of selection. */}
      {active && shown !== 0 ? (
        <span className="ie-mode-badge-value">{shown}</span>
      ) : (
        <span className="ie-mode-badge-icon">
          <CalibrateGlyph channel={channel} />
        </span>
      )}
    </button>
  );
}

type StripProps = {
  highlightChannel: AdjustChannel;
  values: Record<AdjustChannel, number>;
  labels: Record<AdjustChannel, string>;
  onHighlightChange: (channel: AdjustChannel) => void;
  onCommitChannel: (channel: AdjustChannel) => void;
  /** Tap the already-active circle to park (zero) or restore that channel. */
  onResetChannel: (channel: AdjustChannel) => void;
  /** Stashed UI values while a badge is parked at 0. */
  parkedValues?: Partial<Record<AdjustChannel, number>>;
  /**
   * Circle under the pointer, or `null` once it leaves the strip. Labels are
   * rendered outside the strip (over the preview), so the host needs to know
   * which one to show without the strip reserving a row for it.
   */
  onHoverChannelChange?: (channel: AdjustChannel | null) => void;
  ringColors?: Partial<ModeRingColors>;
  chromeFadeFocus?: string | null;
};

/**
 * built-in Adjust strip: Brightness / Contrast / Saturation / Exposure /
 * Vignette. Same snap-scroll circle language as the crop mode strip; the ruler
 * below mounts only after the strip settles.
 */
export function EditorCalibrateStrip({
  highlightChannel,
  values,
  labels,
  onHighlightChange,
  onCommitChannel,
  onResetChannel,
  onHoverChannelChange,
  ringColors,
  chromeFadeFocus = null,
  parkedValues,
}: StripProps) {
  const [stripEl, setStripEl] = useState<HTMLDivElement | null>(null);

  const { onScroll, onSelect } = useModeBadgeStrip(
    stripEl,
    CHANNELS,
    highlightChannel,
    onHighlightChange,
    onCommitChannel,
    CHANNELS[0],
  );

  const onPointerOver = (e: PointerEvent<HTMLDivElement>) => {
    if (!onHoverChannelChange) return;
    const badge = (e.target as HTMLElement).closest(
      "[data-ie-mode]",
    ) as HTMLElement | null;
    const channel = badge?.dataset.ieMode as AdjustChannel | undefined;
    onHoverChannelChange(
      channel && CHANNELS.includes(channel) ? channel : null,
    );
  };

  return (
    <div
      ref={setStripEl}
      className="ie-mode-strip ie-calibrate-strip"
      data-ie-part="calibrate-strip"
      data-ie-mode-count={CHANNELS.length}
      style={ringColorStyle(ringColors)}
      onScroll={onScroll}
      onPointerOver={onPointerOver}
      onPointerLeave={() => onHoverChannelChange?.(null)}
    >
      {CHANNELS.map((channel) => (
        <CalibrateBadge
          key={channel}
          channel={channel}
          active={highlightChannel === channel}
          value={values[channel]}
          label={labels[channel]}
          onSelect={() => onSelect(channel, onResetChannel)}
          rulerFocus={chromeFadeFocus === channel}
          parked={parkedValues?.[channel] != null}
        />
      ))}
    </div>
  );
}

export { CHANNELS as CALIBRATE_CHANNELS };
