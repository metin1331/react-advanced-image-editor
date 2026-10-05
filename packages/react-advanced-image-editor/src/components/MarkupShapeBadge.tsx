import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { MarkupShape } from "react-advanced-image-editor-core";
import { MARKUP_PRESET_COLORS } from "./EditorMarkupToolbar";

export type MarkupShapeBadgeLabels = {
  color: string;
  border: string;
  opacity: string;
  duplicate: string;
  trash: string;
  noFill: string;
  noStroke: string;
  colorPicker: string;
};

export const defaultShapeBadgeLabels: MarkupShapeBadgeLabels = {
  color: "Color",
  border: "Border",
  opacity: "Opacity",
  duplicate: "Duplicate",
  trash: "Delete",
  noFill: "No Fill",
  noStroke: "No Stroke",
  colorPicker: "Color picker",
};

export type MarkupShapeBadgeProps = {
  shape: MarkupShape;
  /** Normalized frame AABB top-center (0…1) for badge anchoring. */
  anchorX: number;
  anchorY: number;
  labels?: Partial<MarkupShapeBadgeLabels>;
  onFillChange: (fill: string | null) => void;
  onStrokeChange: (stroke: string | null) => void;
  onOpacityChange: (opacity: number, commit: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Clear shape selection when tapping outside the badge (bar-only state). */
  onDismissSelection?: () => void;
};

type Panel = "none" | "fill" | "stroke" | "opacity";
type PanelPlacement = "above" | "below";

/**
 * built-in contextual badge above a selected markup shape.
 * Screen-axis aligned — does not rotate/scale with the shape.
 * Secondary panels are absolutely positioned so they never move the main bar.
 */
export function MarkupShapeBadge({
  shape,
  anchorX,
  anchorY,
  labels: labelOverrides,
  onFillChange,
  onStrokeChange,
  onOpacityChange,
  onDuplicate,
  onDelete,
  onDismissSelection,
}: MarkupShapeBadgeProps) {
  const labels = { ...defaultShapeBadgeLabels, ...labelOverrides };
  const [panel, setPanel] = useState<Panel>("none");
  const [placement, setPlacement] = useState<PanelPlacement>("above");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fillInputRef = useRef<HTMLInputElement>(null);
  const strokeInputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  useEffect(() => {
    setPanel("none");
  }, [shape.id]);

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      // Canvas lives under this badge — don't steal move / resize.
      if ((e.target as HTMLElement | null)?.closest?.('[data-ie-part="markup-layer"]')) {
        return;
      }

      if (panel !== 'none') {
        setPanel('none');
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onDismissSelection?.();
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [panel, onDismissSelection]);

  // Prefer secondary popup above the bar; flip below if clipped by adjust-view top.
  useLayoutEffect(() => {
    if (panel === "none") {
      setPlacement("above");
      return;
    }
    const root = rootRef.current;
    const panelEl = panelRef.current;
    if (!root || !panelEl) return;

    // Clip against adjust-view (overflow:hidden), not only the inner wrapper.
    const view =
      (root.closest('[data-ie-part="adjust-view"]') as HTMLElement | null) ??
      (root.closest(
        '[data-ie-part="adjust-view-inner"]',
      ) as HTMLElement | null);
    const bar = root.querySelector(".ie-shape-badge-bar") as HTMLElement | null;
    const viewTop = view?.getBoundingClientRect().top ?? 0;
    const barTop = (bar ?? root).getBoundingClientRect().top;
    const gap = 8;
    const need = panelEl.offsetHeight + gap;
    const spaceAbove = barTop - viewTop;
    setPlacement(spaceAbove < need + 4 ? "below" : "above");
  }, [panel, shape.id, anchorX, anchorY]);

  const toggle = (next: Panel) => setPanel((p) => (p === next ? "none" : next));

  const fill = shape.fill;
  const stroke = shape.stroke;
  const opacity = Number.isFinite(shape.opacity) ? shape.opacity : 1;

  return (
    <div
      ref={rootRef}
      className="ie-shape-badge"
      data-ie-part="shape-badge"
      data-ie-panel={panel !== "none" ? panel : undefined}
      data-ie-placement={panel !== "none" ? placement : undefined}
      style={{
        left: `${anchorX * 100}%`,
        top: `${Math.max(0.02, anchorY) * 100}%`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="ie-shape-badge-bar"
        role="toolbar"
        aria-label="Shape actions"
      >
        <button
          type="button"
          className="ie-shape-badge-btn"
          data-active={panel === "fill" ? "true" : undefined}
          aria-expanded={panel === "fill"}
          aria-controls={panelId}
          aria-label={labels.color}
          title={labels.color}
          onClick={() => toggle("fill")}
        >
          <span
            className="ie-shape-badge-swatch"
            data-none={fill == null ? "true" : undefined}
            style={fill ? { background: fill } : undefined}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="ie-shape-badge-btn"
          data-active={panel === "stroke" ? "true" : undefined}
          aria-expanded={panel === "stroke"}
          aria-controls={panelId}
          aria-label={labels.border}
          title={labels.border}
          onClick={() => toggle("stroke")}
        >
          <span
            className="ie-shape-badge-swatch ie-shape-badge-swatch-stroke"
            data-none={stroke == null ? "true" : undefined}
            style={stroke ? { borderColor: stroke } : undefined}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="ie-shape-badge-btn"
          data-active={panel === "opacity" ? "true" : undefined}
          aria-expanded={panel === "opacity"}
          aria-controls={panelId}
          aria-label={labels.opacity}
          title={labels.opacity}
          onClick={() => toggle("opacity")}
        >
          <OpacityIcon />
        </button>
        <span className="ie-shape-badge-sep" aria-hidden />
        <button
          type="button"
          className="ie-shape-badge-btn"
          aria-label={labels.duplicate}
          title={labels.duplicate}
          onClick={onDuplicate}
        >
          <DupIcon />
        </button>
        <button
          type="button"
          className="ie-shape-badge-btn ie-shape-badge-btn-danger"
          aria-label={labels.trash}
          title={labels.trash}
          onClick={onDelete}
        >
          <TrashIcon />
        </button>

        {panel !== "none" && (
          <div
            ref={panelRef}
            className="ie-shape-badge-panel"
            id={panelId}
            role="dialog"
            data-ie-placement={placement}
          >
            {panel === "fill" && (
              <ColorPanel
                value={fill}
                noneLabel={labels.noFill}
                pickerLabel={labels.colorPicker}
                inputRef={fillInputRef}
                onPick={onFillChange}
                onNone={() => onFillChange(null)}
              />
            )}
            {panel === "stroke" && (
              <ColorPanel
                value={stroke}
                noneLabel={labels.noStroke}
                pickerLabel={labels.colorPicker}
                inputRef={strokeInputRef}
                onPick={onStrokeChange}
                onNone={() => onStrokeChange(null)}
              />
            )}
            {panel === "opacity" && (
              <div className="ie-shape-badge-opacity">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(opacity * 100)}
                  aria-label={labels.opacity}
                  className="ie-shape-opacity-slider"
                  onChange={(e) =>
                    onOpacityChange(Number(e.target.value) / 100, false)
                  }
                  onPointerUp={(e) =>
                    onOpacityChange(
                      Number((e.target as HTMLInputElement).value) / 100,
                      true,
                    )
                  }
                  onKeyUp={(e) =>
                    onOpacityChange(
                      Number((e.target as HTMLInputElement).value) / 100,
                      true,
                    )
                  }
                />
                <span className="ie-shape-badge-opacity-val">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ColorPanel({
  value,
  noneLabel,
  pickerLabel,
  inputRef,
  onPick,
  onNone,
}: {
  value: string | null;
  noneLabel: string;
  pickerLabel: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (c: string) => void;
  onNone: () => void;
}) {
  const active = (value ?? "").toLowerCase();
  return (
    <div className="ie-shape-badge-colors">
      <div
        className="ie-markup-color-row ie-markup-color-grid"
        role="listbox"
        aria-label={noneLabel}
      >
        {MARKUP_PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="option"
            className="ie-markup-swatch"
            data-ie-active={active === c ? "true" : undefined}
            style={{ background: c }}
            aria-label={c}
            aria-selected={active === c}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
      <div className="ie-shape-badge-color-actions">
        <button
          type="button"
          className="ie-markup-swatch ie-shape-badge-none"
          data-ie-active={value == null ? "true" : undefined}
          data-active={value == null ? "true" : undefined}
          aria-label={noneLabel}
          title={noneLabel}
          onClick={onNone}
        >
          <span className="ie-shape-badge-none-slash" aria-hidden />
        </button>
        <button
          type="button"
          className="ie-markup-swatch ie-markup-swatch-custom"
          aria-label={pickerLabel}
          title={pickerLabel}
          onClick={() => inputRef.current?.click()}
        >
          <span className="ie-markup-swatch-custom-face" aria-hidden />
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="color"
            value={value && value.startsWith("#") ? value : "#007aff"}
            onChange={(e) => onPick(e.target.value)}
            tabIndex={-1}
            aria-hidden
          />
        </button>
      </div>
    </div>
  );
}

function OpacityIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17V3.5Z" fill="currentColor" />
    </svg>
  );
}

function DupIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="8"
        y="8"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M4 14V6a2 2 0 0 1 2-2h8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}
