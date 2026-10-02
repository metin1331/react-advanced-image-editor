import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MARKUP_PRESET_COLORS } from "./EditorMarkupToolbar";
import {
  SHEET_MOTION_EASE,
  SHEET_MOTION_MS,
  sheetMotionDurationMs,
} from "../crop/sheetMotion";
import {
  COLOR_GRID,
  GRID_COLS,
  GRID_ROWS,
  hsvToRgb,
  parseCssColor,
  rgb,
  rgbToHsv,
  rgbToSpectrum,
  sameRgb,
  spectrumToRgb,
  toCssColor,
  toHex6,
  type Rgba,
} from "../color/cssColor";

export type ColorPickerTab = "grid" | "spectrum" | "sliders";

export type ColorPickerLabels = {
  title?: string;
  grid?: string;
  spectrum?: string;
  sliders?: string;
  close?: string;
  eyedropper?: string;
  red?: string;
  green?: string;
  blue?: string;
  hex?: string;
  hdrBoost?: string;
  opacity?: string;
  addColor?: string;
};

const DEFAULT_LABELS: Required<ColorPickerLabels> = {
  title: "Colors",
  grid: "Grid",
  spectrum: "Spectrum",
  sliders: "Sliders",
  close: "Close",
  eyedropper: "Eyedropper",
  red: "Red",
  green: "Green",
  blue: "Blue",
  hex: "sRGB Hex Color #",
  hdrBoost: "HDR Boost",
  opacity: "Opacity",
  addColor: "Add color",
};

export type EditorColorPickerProps = {
  open: boolean;
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
  /** Close the sheet and sample a color from the photo (mobile-safe). */
  onEyedropper?: () => void;
  labels?: ColorPickerLabels;
  presets?: readonly string[];
};

function emit(c: Rgba, onChange: (color: string) => void) {
  onChange(toCssColor(c));
}

function EyedropperIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12.4 6.9 4.8 14.5c-.5.5-.8 1.2-.8 1.9V19h2.6c.7 0 1.4-.3 1.9-.8l7.6-7.6-3.7-3.7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4 16.4V19h2.6c.3 0 .5-.1.7-.2l-3.1-3.1c-.1.2-.2.5-.2.7Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 4.8 16.7 2.6l3.7 3.7-2.2 2.2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.1 2.1 9.9 9.9M9.9 2.1 2.1 9.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      strokeWidth="3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function ColorSlider({
  label,
  value,
  min,
  max,
  gradient,
  swatch,
  checker,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  gradient: string;
  swatch: string;
  checker?: boolean;
  format?: (n: number) => string;
  onChange: (next: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const span = Math.max(1, max - min);
  const t = Math.max(0, Math.min(1, (value - min) / span));

  const valueAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const pad = 18;
    const u = (clientX - rect.left - pad) / Math.max(1, rect.width - pad * 2);
    return Math.round(min + Math.max(0, Math.min(1, u)) * span);
  };

  const bind = (e: {
    currentTarget: HTMLElement;
    pointerId: number;
    clientX: number;
  }) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(valueAt(e.clientX));
  };

  return (
    <div className="ie-color-picker-slider-row">
      <span className="ie-color-picker-slider-label">{label}</span>
      <div
        ref={trackRef}
        className="ie-color-picker-slider-track"
        data-checker={checker ? "true" : undefined}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        style={
          {
            "--ie-color-slider-track": gradient,
            "--ie-color-slider-thumb": swatch,
            "--ie-slider-t": String(t),
          } as never
        }
        onPointerDown={(e) => {
          e.preventDefault();
          bind(e);
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          onChange(valueAt(e.clientX));
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(Math.max(min, value - step));
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(Math.min(max, value + step));
          } else if (e.key === "Home") {
            e.preventDefault();
            onChange(min);
          } else if (e.key === "End") {
            e.preventDefault();
            onChange(max);
          }
        }}
      >
        <span className="ie-color-picker-slider-thumb" aria-hidden />
      </div>
      <span className="ie-color-picker-value">
        {format ? format(value) : String(value)}
      </span>
    </div>
  );
}

function SpectrumField({
  color,
  onPick,
}: {
  color: Rgba;
  onPick: (next: Rgba) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pos = rgbToSpectrum(color);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hue = ctx.createLinearGradient(0, 0, 0, h);
    hue.addColorStop(0, "#ff0000");
    hue.addColorStop(1 / 6, "#ffff00");
    hue.addColorStop(2 / 6, "#00ff00");
    hue.addColorStop(3 / 6, "#00ffff");
    hue.addColorStop(4 / 6, "#0000ff");
    hue.addColorStop(5 / 6, "#ff00ff");
    hue.addColorStop(1, "#ff0000");
    ctx.fillStyle = hue;
    ctx.fillRect(0, 0, w, h);
    const wash = ctx.createLinearGradient(0, 0, w, 0);
    wash.addColorStop(0, "rgba(255,255,255,1)");
    wash.addColorStop(0.5, "rgba(255,255,255,0)");
    wash.addColorStop(0.5, "rgba(0,0,0,0)");
    wash.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  }, []);

  useLayoutEffect(() => {
    paint();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [paint]);

  const pickAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onPick(spectrumToRgb(x, y, color.a));
  };

  return (
    <div
      className="ie-color-picker-spectrum"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pickAt(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        pickAt(e.clientX, e.clientY);
      }}
    >
      <canvas ref={canvasRef} aria-label="Spectrum" />
      <span
        className="ie-color-picker-spectrum-knob"
        style={{
          left: `${pos.x * 100}%`,
          top: `${pos.y * 100}%`,
          background: toHex6(color),
        }}
      />
    </div>
  );
}

function gridCorner(
  row: number,
  col: number,
): "tl" | "tr" | "bl" | "br" | undefined {
  if (row === 0 && col === 0) return "tl";
  if (row === 0 && col === GRID_COLS - 1) return "tr";
  if (row === GRID_ROWS - 1 && col === 0) return "bl";
  if (row === GRID_ROWS - 1 && col === GRID_COLS - 1) return "br";
  return undefined;
}

function cellAtPoint(
  grid: HTMLElement,
  clientX: number,
  clientY: number,
): { row: number; col: number } {
  const rect = grid.getBoundingClientRect();
  const col = Math.max(
    0,
    Math.min(
      GRID_COLS - 1,
      Math.floor(((clientX - rect.left) / Math.max(1, rect.width)) * GRID_COLS),
    ),
  );
  const row = Math.max(
    0,
    Math.min(
      GRID_ROWS - 1,
      Math.floor(((clientY - rect.top) / Math.max(1, rect.height)) * GRID_ROWS),
    ),
  );
  return { row, col };
}

function selectedGridCell(color: Rgba): { row: number; col: number } | null {
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (sameRgb(parseCssColor(COLOR_GRID[row][col]), color)) {
        return { row, col };
      }
    }
  }
  return null;
}

function ColorGrid({
  color,
  label,
  onPick,
}: {
  color: Rgba;
  label: string;
  onPick: (next: Rgba) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const colorRef = useRef(color);
  colorRef.current = color;
  const selected = selectedGridCell(color);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const syncBox = useCallback(() => {
    const host = hostRef.current;
    const grid = gridRef.current;
    const pos = selectedGridCell(colorRef.current);
    if (!host || !grid || !pos) {
      setBox(null);
      return;
    }
    const cell = grid.children[pos.row * GRID_COLS + pos.col] as
      | HTMLElement
      | undefined;
    if (!cell) {
      setBox(null);
      return;
    }
    const hr = host.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    const pad = 2;
    setBox({
      left: cr.left - hr.left - pad,
      top: cr.top - hr.top - pad,
      width: cr.width + pad * 2,
      height: cr.height + pad * 2,
    });
  }, []);

  useLayoutEffect(() => {
    syncBox();
    const host = hostRef.current;
    const grid = gridRef.current;
    if (!host || !grid) return;
    const ro = new ResizeObserver(() => syncBox());
    ro.observe(host);
    ro.observe(grid);
    window.addEventListener("resize", syncBox);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncBox);
    };
  }, [syncBox, selected?.row, selected?.col]);

  const onSelectPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef.current;
    if (!grid) return;

    const last = { row: -1, col: -1 };
    const pick = (clientX: number, clientY: number) => {
      const { row, col } = cellAtPoint(grid, clientX, clientY);
      if (last.row === row && last.col === col) return;
      last.row = row;
      last.col = col;
      onPickRef.current(parseCssColor(COLOR_GRID[row][col]));
    };

    pick(e.clientX, e.clientY);

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      pick(ev.clientX, ev.clientY);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const corner = selected ? gridCorner(selected.row, selected.col) : undefined;

  return (
    <div ref={hostRef} className="ie-color-picker-grid-host">
      <div
        ref={gridRef}
        className="ie-color-picker-grid"
        role="listbox"
        aria-label={label}
      >
        {Array.from({ length: GRID_ROWS }, (_, row) =>
          Array.from({ length: GRID_COLS }, (__, col) => {
            const hex = COLOR_GRID[row][col];
            const cell = parseCssColor(hex);
            const isOn = selected
              ? selected.row === row && selected.col === col
              : false;
            return (
              <button
                key={`${row}-${col}`}
                type="button"
                role="option"
                className="ie-color-picker-cell"
                aria-selected={isOn}
                aria-label={hex}
                style={{ background: hex }}
                onClick={() => onPick(cell)}
              />
            );
          }),
        )}
      </div>
      {box ? (
        <span
          className="ie-color-picker-cell-select"
          data-ie-corner={corner}
          aria-hidden
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
          onPointerDown={onSelectPointerDown}
        />
      ) : null}
    </div>
  );
}

/** iPhone Photos / Markup color picker sheet. */
export function EditorColorPicker({
  open,
  color,
  onChange,
  onClose,
  onEyedropper,
  labels: labelOverrides,
  presets = MARKUP_PRESET_COLORS,
}: EditorColorPickerProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const parsed = useMemo(() => parseCssColor(color), [color]);
  const swatch = toHex6(parsed);
  const hsv = rgbToHsv(parsed);
  const hdr = Math.round(hsv.v * 100);
  const hsvHoldRef = useRef(hsv);
  if (hsv.v > 0.001) hsvHoldRef.current = hsv;
  const [tab, setTab] = useState<ColorPickerTab>("grid");
  const [hexDraft, setHexDraft] = useState(
    toHex6(parsed).slice(1).toUpperCase(),
  );
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [custom, setCustom] = useState<string[]>([]);

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
  }, [open]);

  useEffect(() => {
    if (open || !mounted) return;
    const t = window.setTimeout(
      () => setMounted(false),
      sheetMotionDurationMs(),
    );
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    setHexDraft(toHex6(parsed).slice(1).toUpperCase());
  }, [parsed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const setRgb = (next: Rgba) => {
    emit({ ...next, a: parsed.a }, onChange);
  };

  const setHdr = (v: number) => {
    const hold = hsvHoldRef.current;
    emit(
      hsvToRgb(hold.h, hold.s, Math.max(0, Math.min(100, v)) / 100, parsed.a),
      onChange,
    );
  };

  const startEyedropper = () => {
    setShown(false);
    setMounted(false);
    onEyedropper?.();
    onClose();
  };

  const commitHex = () => {
    const cleaned = hexDraft.replace(/[^0-9a-f]/gi, "");
    if (cleaned.length === 3 || cleaned.length === 6) {
      setRgb(parseCssColor(`#${cleaned}`));
      return;
    }
    setHexDraft(toHex6(parsed).slice(1).toUpperCase());
  };

  const opacityPct = Math.round(parsed.a * 100);
  const hdrTrack = `linear-gradient(to right, #111, ${swatch})`;
  const opacityTrack = swatch;

  if (!mounted) return null;

  return (
    <div
      className="ie-color-picker-overlay"
      data-ie-part="color-picker-overlay"
      data-ie-open={shown ? "true" : "false"}
      style={
        {
          "--ie-sheet-duration": `${SHEET_MOTION_MS}ms`,
          "--ie-sheet-ease": SHEET_MOTION_EASE,
        } as never
      }
    >
      <button
        type="button"
        className="ie-color-picker-backdrop"
        aria-label={labels.close}
        onClick={onClose}
      />
      <div
        className="ie-color-picker-sheet"
        data-ie-part="color-picker"
        role="dialog"
        aria-label={labels.title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ie-color-picker-header">
          <button
            type="button"
            className="ie-color-picker-icon-btn"
            aria-label={labels.eyedropper}
            onClick={startEyedropper}
          >
            <EyedropperIcon />
          </button>
          <h2 className="ie-color-picker-title">{labels.title}</h2>
          <button
            type="button"
            className="ie-color-picker-close"
            aria-label={labels.close}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div
          className="ie-color-picker-tabs"
          role="tablist"
          aria-label={labels.title}
        >
          {(["grid", "spectrum", "sliders"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="ie-color-picker-tab"
              aria-selected={tab === id}
              data-active={tab === id ? "true" : undefined}
              onClick={() => setTab(id)}
            >
              {id === "grid"
                ? labels.grid
                : id === "spectrum"
                  ? labels.spectrum
                  : labels.sliders}
            </button>
          ))}
        </div>

        <div className="ie-color-picker-stage">
          {tab === "grid" && (
            <ColorGrid
              color={parsed}
              label={labels.grid}
              onPick={(next) => setRgb(next)}
            />
          )}

          {tab === "spectrum" && (
            <SpectrumField color={parsed} onPick={(next) => setRgb(next)} />
          )}

          {tab === "sliders" && (
            <div className="ie-color-picker-rgb">
              <ColorSlider
                label={labels.red}
                min={0}
                max={255}
                value={parsed.r}
                swatch={swatch}
                gradient={`linear-gradient(to right, ${toHex6(rgb(0, parsed.g, parsed.b))}, ${toHex6(rgb(255, parsed.g, parsed.b))})`}
                onChange={(r) => setRgb(rgb(r, parsed.g, parsed.b, parsed.a))}
              />
              <ColorSlider
                label={labels.green}
                min={0}
                max={255}
                value={parsed.g}
                swatch={swatch}
                gradient={`linear-gradient(to right, ${toHex6(rgb(parsed.r, 0, parsed.b))}, ${toHex6(rgb(parsed.r, 255, parsed.b))})`}
                onChange={(g) => setRgb(rgb(parsed.r, g, parsed.b, parsed.a))}
              />
              <ColorSlider
                label={labels.blue}
                min={0}
                max={255}
                value={parsed.b}
                swatch={swatch}
                gradient={`linear-gradient(to right, ${toHex6(rgb(parsed.r, parsed.g, 0))}, ${toHex6(rgb(parsed.r, parsed.g, 255))})`}
                onChange={(b) => setRgb(rgb(parsed.r, parsed.g, b, parsed.a))}
              />
              <label className="ie-color-picker-hex-row">
                <span>{labels.hex}</span>
                <input
                  value={hexDraft}
                  spellCheck={false}
                  autoCapitalize="characters"
                  aria-label={labels.hex}
                  onChange={(e) =>
                    setHexDraft(
                      e.target.value
                        .replace(/[^0-9a-f]/gi, "")
                        .slice(0, 6)
                        .toUpperCase(),
                    )
                  }
                  onBlur={commitHex}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitHex();
                    }
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <div className="ie-color-picker-adjust">
          <ColorSlider
            label={labels.hdrBoost}
            min={0}
            max={100}
            value={hdr}
            swatch={swatch}
            gradient={hdrTrack}
            format={(n) => `${n}%`}
            onChange={setHdr}
          />
          <ColorSlider
            label={labels.opacity}
            min={0}
            max={100}
            value={opacityPct}
            swatch={swatch}
            gradient={opacityTrack}
            checker
            format={(n) => `${n}%`}
            onChange={(v) => emit({ ...parsed, a: v / 100 }, onChange)}
          />
        </div>

        <div className="ie-color-picker-presets">
          <span
            className="ie-color-picker-well"
            style={{ ["--well" as string]: toCssColor(parsed) }}
            aria-hidden
          />
          <div className="ie-color-picker-swatches">
            {presets.map((c) => {
              const item = parseCssColor(c);
              const selected = sameRgb(item, parsed);
              return (
                <button
                  key={c}
                  type="button"
                  className="ie-color-picker-dot"
                  data-ie-active={selected ? "true" : undefined}
                  style={{ background: c }}
                  aria-label={c}
                  aria-pressed={selected}
                  onClick={() => setRgb(item)}
                />
              );
            })}
            {custom.map((c) => {
              const item = parseCssColor(c);
              const selected = sameRgb(item, parsed);
              return (
                <button
                  key={c}
                  type="button"
                  className="ie-color-picker-dot"
                  data-ie-active={selected ? "true" : undefined}
                  style={{ background: c }}
                  aria-label={c}
                  aria-pressed={selected}
                  onClick={() => setRgb(item)}
                />
              );
            })}
            <button
              type="button"
              className="ie-color-picker-dot ie-color-picker-add"
              aria-label={labels.addColor}
              onClick={() => {
                const hex = toHex6(parsed);
                setCustom((prev) =>
                  prev.includes(hex) ? prev : [...prev, hex].slice(-8),
                );
              }}
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
