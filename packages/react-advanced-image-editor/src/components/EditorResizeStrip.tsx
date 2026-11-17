import { useEffect, useRef, useState } from "react";

const RESIZE_MAX = 8192;

export type ResizeStripLabels = {
  width: string;
  height: string;
  lock: string;
  unlock: string;
  reset: string;
};

type Props = {
  width: number;
  height: number;
  linked: boolean;
  custom: boolean;
  labels: ResizeStripLabels;
  onWidth: (value: number) => void;
  onHeight: (value: number) => void;
  onToggleLink: () => void;
  onReset: () => void;
};

function clampResize(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(RESIZE_MAX, Math.max(1, Math.round(value)));
}

function SizeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <label className="ie-resize-field">
      <span>{label}</span>
      <input
        inputMode="numeric"
        aria-label={label}
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          setText(event.target.value.replace(/[^\d]/g, ""));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={() => {
          focused.current = false;
          if (!text) {
            setText(String(value));
            return;
          }
          const next = clampResize(Number(text));
          setText(String(next));
          onCommit(next);
        }}
      />
    </label>
  );
}

export function EditorResizeStrip({
  width,
  height,
  linked,
  custom,
  labels,
  onWidth,
  onHeight,
  onToggleLink,
  onReset,
}: Props) {
  return (
    <div className="ie-resize-strip">
      <SizeField label={labels.width} value={width} onCommit={onWidth} />
      <button
        type="button"
        className="ie-resize-link"
        data-ie-active={linked ? "true" : undefined}
        aria-pressed={linked}
        aria-label={linked ? labels.unlock : labels.lock}
        onClick={onToggleLink}
      >
        <LinkIcon linked={linked} />
      </button>
      <SizeField label={labels.height} value={height} onCommit={onHeight} />
      <button
        type="button"
        className="ie-resize-reset"
        disabled={!custom}
        onClick={onReset}
      >
        {labels.reset}
      </button>
    </div>
  );
}

function LinkIcon({ linked }: { linked: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {linked ? (
        <>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </>
      ) : (
        <>
          <path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="m5.16 11.75-1.72 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          <line x1="8" x2="8" y1="2" y2="5" />
          <line x1="2" x2="5" y1="8" y2="8" />
          <line x1="16" x2="16" y1="19" y2="22" />
          <line x1="19" x2="22" y1="16" y2="16" />
        </>
      )}
    </svg>
  );
}
