import { useEffect, useId, useRef, useState } from "react";
import type {
  EraserMode,
  MarkupShapeKind,
  MarkupTextAlign,
  MarkupTool,
} from "react-advanced-image-editor-core";

export const MARKUP_PRESET_COLORS = [
  "#ffffff",
  "#000000",
  "#8e8e93",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#30b0c7",
  "#007aff",
  "#5856d6",
  "#af52de",
  "#ff2d55",
] as const;

export const MARKUP_STROKE_WIDTHS = [0.006, 0.012, 0.02, 0.032] as const;

export const MARKUP_SHAPE_KINDS = [
  "rect",
  "roundRect",
  "circle",
  "triangle",
  "hexagon",
  "blockArrow",
  "star",
  "speech",
  "arrow",
] as const satisfies readonly MarkupShapeKind[];

const SHAPE_MENU_LABELS: Record<(typeof MARKUP_SHAPE_KINDS)[number], string> = {
  rect: "Square",
  roundRect: "Rounded Rectangle",
  circle: "Circle",
  triangle: "Triangle",
  hexagon: "Hexagon",
  blockArrow: "Arrow",
  star: "Star",
  speech: "Speech Bubble",
  arrow: "Arrow (Diagonal)",
};

export type MarkupToolbarLabels = {
  move: string;
  pen: string;
  marker: string;
  pencil: string;
  eraser: string;
  lasso: string;
  ruler: string;
  text: string;
  shape: string;
  signature: string;
  sticker: string;
  loupe: string;
  add: string;
  addText: string;
  addSticker: string;
  addShape: string;
  addSignature: string;
  addLoupe: string;
  color: string;
  strokeWidth: string;
  pixelEraser: string;
  objectEraser: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
};

export const defaultMarkupLabels: MarkupToolbarLabels = {
  move: "Move",
  pen: "Pen",
  marker: "Marker",
  pencil: "Pencil",
  eraser: "Eraser",
  lasso: "Lasso",
  ruler: "Ruler",
  text: "Text",
  shape: "Shapes",
  signature: "Signature",
  sticker: "Sticker",
  loupe: "Loupe",
  add: "Add",
  addText: "Add Text",
  addSticker: "Add Sticker",
  addShape: "Add Shape",
  addSignature: "Add Signature",
  addLoupe: "Add Loupe",
  color: "Color",
  strokeWidth: "Stroke width",
  pixelEraser: "Pixel Eraser",
  objectEraser: "Object Eraser",
  alignLeft: "Align left",
  alignCenter: "Align center",
  alignRight: "Align right",
};

type Props = {
  tool: MarkupTool;
  eraserMode: EraserMode;
  color: string;
  strokeWidth: number;
  shapeKind: MarkupShapeKind;
  textAlign: MarkupTextAlign;
  rulerVisible: boolean;
  labels?: Partial<MarkupToolbarLabels>;
  onToolChange: (tool: MarkupTool) => void;
  onEraserModeChange: (mode: EraserMode) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onShapeKindChange: (kind: MarkupShapeKind) => void;
  onTextAlignChange: (align: MarkupTextAlign) => void;
  onToggleRuler: () => void;
  /** Opens the sheet-style sticker sheet (Markup → Sticker). */
  onOpenStickerSheet?: () => void;
  /** Opens the sheet-style Colors sheet (Markup color well). */
  onOpenColorPicker?: () => void;
  /** Places a magnifier on the photo (Markup → Add Loupe). */
  onAddLoupe?: () => void;
};

type AddMenuKind = "text" | "sticker" | "shape" | "signature" | "loupe";

const ADD_MENU_ITEMS: AddMenuKind[] = [
  "text",
  "sticker",
  "shape",
  "signature",
  "loupe",
];

function TipIcon({ tool, active }: { tool: MarkupTool; active: boolean }) {
  const common = {
    width: 28,
    height: 44,
    viewBox: "0 0 28 44",
    fill: "none",
    "aria-hidden": true as const,
  };
  const tip = active ? "var(--ie-markup-tip-active)" : "var(--ie-markup-tip)";
  const body = active
    ? "var(--ie-markup-body-active)"
    : "var(--ie-markup-body)";

  if (tool === "move") {
    const stroke = active ? "var(--ie-accent)" : "var(--ie-text-muted)";
    return (
      <svg {...common}>
        <path
          d="M11 14v10.5c0 1.1.9 2 2 2h.2c.8 0 1.5-.5 1.8-1.2l.6-1.5.9 4.2c.2 1 1.2 1.6 2.2 1.4.9-.2 1.5-1.1 1.3-2l-1.2-5.4 2.4 1.6c.9.6 2.1.3 2.6-.6.4-.8.2-1.8-.5-2.3L14.8 13.2A2.2 2.2 0 0 0 11 14Z"
          fill={stroke}
          opacity={active ? 1 : 0.85}
        />
        <path
          d="M12.2 12.5V8.8a1.6 1.6 0 0 1 3.2 0v2.2"
          stroke={stroke}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (tool === "pen") {
    return (
      <svg {...common}>
        <path d="M10 40h8l1.2-18H8.8L10 40Z" fill={body} />
        <path d="M9.2 22h9.6L16.2 6.5a2.4 2.4 0 0 0-4.4 0L9.2 22Z" fill={tip} />
        <path d="M14 6.2 12.6 2.8h2.8L14 6.2Z" fill={tip} />
      </svg>
    );
  }
  if (tool === "marker") {
    return (
      <svg {...common}>
        <path d="M9 40h10l1-16H8l1 16Z" fill={body} />
        <path d="M8.2 24h11.6l-1.4-14H9.6L8.2 24Z" fill={tip} opacity="0.85" />
        <path d="M10 10h8L16.5 4h-5L10 10Z" fill={tip} />
      </svg>
    );
  }
  if (tool === "pencil") {
    return (
      <svg {...common}>
        <path d="M11 40h6l.8-20h-7.6L11 40Z" fill={body} />
        <path d="M10.2 20h7.6L15.5 5.5 14 3.2 12.5 5.5 10.2 20Z" fill={tip} />
        <path d="M13.2 4.2h1.6L14 2.4 13.2 4.2Z" fill="#c4a574" />
      </svg>
    );
  }
  if (tool === "eraser") {
    return (
      <svg {...common}>
        <path
          d="M7.5 28.5 16.2 8.8a2.2 2.2 0 0 1 3 1.1l4.2 10.4a2.2 2.2 0 0 1-1.1 3L13.6 40H8.8a2 2 0 0 1-1.9-2.6l.6-8.9Z"
          fill={tip}
        />
        <path d="M9 32h12.5l1.2 4.2H9.8L9 32Z" fill={body} />
      </svg>
    );
  }
  if (tool === "lasso") {
    return (
      <svg {...common}>
        <path
          d="M8 30c0-8 4-16 10-18 4-1 7 2 6 6-1 5-6 7-6 12 0 3 2 5 5 5"
          stroke={tip}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="19" cy="35" r="2.2" fill={body} />
      </svg>
    );
  }
  if (tool === "ruler") {
    return (
      <svg {...common}>
        <rect
          x="6"
          y="18"
          width="16"
          height="10"
          rx="2"
          transform="rotate(-28 14 23)"
          fill={tip}
        />
        <path
          d="M8.5 26.5h2M11.5 24.8h2M14.5 23.1h2M17.5 21.4h2"
          stroke={body}
          strokeWidth="1.2"
        />
      </svg>
    );
  }
  if (tool === "text") {
    return (
      <svg {...common}>
        <path
          d="M9 14h10M14 14v18"
          stroke={tip}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M10 32h8"
          stroke={body}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (tool === "signature") {
    return (
      <svg {...common}>
        <path
          d="M6 32c3-8 6-14 9-14 2 0 3 3 2 7-1 5 2 8 5 5 2-2 3-6 4-10"
          stroke={tip}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 36h14"
          stroke={body}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (tool === "sticker") {
    return (
      <svg {...common}>
        <circle cx="14" cy="16" r="5.5" stroke={tip} strokeWidth="2" />
        <circle cx="11.5" cy="15" r="1.2" fill={tip} />
        <circle cx="16.5" cy="17" r="1.2" fill={tip} />
        <path
          d="M8 24c2-3 4-4 6-2l4 4"
          stroke={body}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M9 36h10"
          stroke={body}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  // shape
  return (
    <svg {...common}>
      <rect
        x="7"
        y="12"
        width="14"
        height="14"
        rx="2"
        stroke={tip}
        strokeWidth="2"
      />
      <circle cx="18" cy="30" r="5" stroke={body} strokeWidth="1.8" />
    </svg>
  );
}

function ShapeKindIcon({ kind }: { kind: MarkupShapeKind }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    "aria-hidden": true as const,
  };
  if (kind === "rect") {
    return <svg {...common}><rect x="5" y="5" width="14" height="14" /></svg>;
  }
  if (kind === "roundRect") {
    return <svg {...common}><rect x="5" y="5" width="14" height="14" rx="4" /></svg>;
  }
  if (kind === "circle") {
    return <svg {...common}><circle cx="12" cy="12" r="7" /></svg>;
  }
  if (kind === "triangle") {
    return <svg {...common}><path d="M12 5.5 19.5 18.5h-15Z" /></svg>;
  }
  if (kind === "hexagon") {
    return (
      <svg {...common}>
        <path d="M8 5.5h8L20.5 12 16 18.5H8L3.5 12Z" />
      </svg>
    );
  }
  if (kind === "blockArrow") {
    return (
      <svg {...common}>
        <path d="M4 9.2h9.2V6.2L20 12l-6.8 5.8v-3H4Z" />
      </svg>
    );
  }
  if (kind === "star") {
    return (
      <svg {...common}>
        <path d="M12 4.2 14.4 9.6l6 .5-4.6 3.9 1.5 5.8L12 16.8 6.7 19.8l1.5-5.8L3.6 10.1l6-.5Z" />
      </svg>
    );
  }
  if (kind === "speech") {
    return (
      <svg {...common}>
        <path d="M6.5 6.2h11a2.2 2.2 0 0 1 2.2 2.2v6.2a2.2 2.2 0 0 1-2.2 2.2H11L7 19.2v-2.4H6.5A2.2 2.2 0 0 1 4.3 14.6V8.4A2.2 2.2 0 0 1 6.5 6.2Z" />
      </svg>
    );
  }
  if (kind === "arrow") {
    return (
      <svg {...common}>
        <path d="M5 16.5c3.4-6.2 7.4-9.2 14-11" />
        <path d="M14.5 4.4 19 5.5l-1.8 4.3" />
      </svg>
    );
  }
  return <svg {...common}><path d="M5 12h14" /></svg>;
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function AddMenuIcon({ kind }: { kind: AddMenuKind }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (kind === "text") {
    return (
      <svg {...common}>
        <path d="M5 6h14" />
        <path d="M12 6v13" />
        <path d="M8 19h8" />
      </svg>
    );
  }
  if (kind === "sticker") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.2" />
        <path d="M8.4 13.6c1.1 1.5 2.3 2.2 3.6 2.2s2.5-.7 3.6-2.2" />
        <circle cx="9.2" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.8" cy="10" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "shape") {
    return (
      <svg {...common}>
        <rect x="4.5" y="6.5" width="10" height="10" rx="1.4" />
        <circle cx="16.2" cy="16.2" r="3.6" />
      </svg>
    );
  }
  if (kind === "signature") {
    return (
      <svg {...common}>
        <path d="M4 17c2.2-3.4 3.4-6.8 4.2-8.6.6-1.4 1.8-1.5 2.4-.2.7 1.6 1.4 4.6 1.8 6.8.2 1.3 1.1 1.5 1.7.4C15 13.4 16.4 10 18 8.4c1.1-1.1 2.4-.4 1.6 1.5-1.2 2.8-2.2 5.1-2.2 7.1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="11" cy="11" r="6.4" />
      <circle cx="11" cy="11" r="3.1" />
      <path d="M15.6 15.6 20 20" />
    </svg>
  );
}

export function EditorMarkupToolbar({
  tool,
  eraserMode,
  color,
  strokeWidth,
  shapeKind,
  textAlign,
  rulerVisible,
  labels: labelOverrides,
  onToolChange,
  onEraserModeChange,
  onColorChange,
  onStrokeWidthChange,
  onShapeKindChange,
  onTextAlignChange,
  onToggleRuler,
  onOpenStickerSheet,
  onOpenColorPicker,
  onAddLoupe,
}: Props) {
  const labels = { ...defaultMarkupLabels, ...labelOverrides };
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const panelId = useId();
  const addMenuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const tools: MarkupTool[] = [
    "move",
    "pen",
    "marker",
    "pencil",
    "eraser",
    "lasso",
    "ruler",
  ];

  useEffect(() => {
    if (!optionsOpen && !addMenuOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOptionsOpen(false);
        setAddMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOptionsOpen(false);
      setAddMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [optionsOpen, addMenuOpen]);

  const selectTool = (next: MarkupTool) => {
    setAddMenuOpen(false);
    if (next === "sticker") {
      onToolChange("sticker");
      onOpenStickerSheet?.();
      setOptionsOpen(false);
      return;
    }
    if (next === "ruler") {
      onToolChange("ruler");
      onToggleRuler();
      setOptionsOpen(false);
      return;
    }
    if (next === tool && next === "text") {
      // Re-pressing Text inserts another object at an offset.
      onToolChange(next);
      setOptionsOpen(true);
      return;
    }
    if (next === tool && next === "shape") {
      // Shape inserts only from the kind row — re-press just opens it.
      setOptionsOpen(true);
      return;
    }
    if (next === tool) {
      if (next === "move" || next === "lasso") return;
      setOptionsOpen((v) => !v);
      return;
    }
    onToolChange(next);
    setAddMenuOpen(false);
    setOptionsOpen(
      next === "eraser" ||
        next === "shape" ||
        next === "text" ||
        next === "pen" ||
        next === "marker" ||
        next === "pencil",
    );
  };

  const addLabel = (id: AddMenuKind) =>
    id === "text"
      ? labels.addText
      : id === "sticker"
        ? labels.addSticker
        : id === "shape"
          ? labels.addShape
          : id === "signature"
            ? labels.addSignature
            : labels.addLoupe;

  const pickAdd = (id: AddMenuKind) => {
    setAddMenuOpen(false);
    if (id === "loupe") {
      setOptionsOpen(false);
      onAddLoupe?.();
      return;
    }
    if (id === "sticker") {
      onToolChange("sticker");
      onOpenStickerSheet?.();
      setOptionsOpen(false);
      return;
    }
    if (id === "shape") {
      onToolChange("shape");
      setOptionsOpen(true);
      return;
    }
    if (id === "signature") {
      onToolChange("signature");
      setOptionsOpen(false);
      return;
    }
    onToolChange("text");
    setOptionsOpen(true);
  };

  const toolLabel = (id: MarkupTool) =>
    id === "move"
      ? labels.move
      : id === "pen"
        ? labels.pen
        : id === "marker"
          ? labels.marker
          : id === "pencil"
            ? labels.pencil
            : id === "eraser"
              ? labels.eraser
              : id === "lasso"
                ? labels.lasso
                : id === "ruler"
                  ? labels.ruler
                  : id === "text"
                    ? labels.text
                  : id === "signature"
                    ? labels.signature
                    : id === "sticker"
                      ? labels.sticker
                      : labels.shape;

  return (
    <div
      ref={rootRef}
      className="ie-markup-toolbar"
      data-ie-part="markup-toolbar"
    >
      {optionsOpen && (
        <div className="ie-markup-popover" id={panelId} role="dialog">
          {tool === "eraser" ? (
            <div
              className="ie-markup-eraser-modes"
              role="group"
              aria-label={labels.eraser}
            >
              <button
                type="button"
                data-ie-active={eraserMode === "pixel" ? "true" : undefined}
                onClick={() => onEraserModeChange("pixel")}
              >
                {labels.pixelEraser}
              </button>
              <button
                type="button"
                data-ie-active={eraserMode === "object" ? "true" : undefined}
                onClick={() => onEraserModeChange("object")}
              >
                {labels.objectEraser}
              </button>
            </div>
          ) : tool === "shape" ? (
            <div
              className="ie-markup-shapes"
              role="group"
              aria-label={labels.shape}
            >
              {MARKUP_SHAPE_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  data-ie-shape={kind}
                  data-ie-active={shapeKind === kind ? "true" : undefined}
                  aria-label={SHAPE_MENU_LABELS[kind]}
                  title={SHAPE_MENU_LABELS[kind]}
                  onClick={() => {
                    onShapeKindChange(kind);
                    setOptionsOpen(false);
                  }}
                >
                  <ShapeKindIcon kind={kind} />
                </button>
              ))}
            </div>
          ) : tool === "text" ? (
            <div className="ie-markup-text-opts" role="group">
              <button
                type="button"
                data-ie-active={textAlign === "left" ? "true" : undefined}
                onClick={() => onTextAlignChange("left")}
                aria-label={labels.alignLeft}
              >
                L
              </button>
              <button
                type="button"
                data-ie-active={textAlign === "center" ? "true" : undefined}
                onClick={() => onTextAlignChange("center")}
                aria-label={labels.alignCenter}
              >
                C
              </button>
              <button
                type="button"
                data-ie-active={textAlign === "right" ? "true" : undefined}
                onClick={() => onTextAlignChange("right")}
                aria-label={labels.alignRight}
              >
                R
              </button>
            </div>
          ) : (
            <div
              className="ie-markup-widths"
              role="group"
              aria-label={labels.strokeWidth}
            >
              {MARKUP_STROKE_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className="ie-markup-width"
                  data-ie-active={
                    Math.abs(strokeWidth - w) < 1e-6 ? "true" : undefined
                  }
                  onClick={() => onStrokeWidthChange(w)}
                  aria-label={`${Math.round(w * 1000)}`}
                >
                  <span style={{ width: 4 + w * 420, height: 4 + w * 420 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ie-markup-tray">
        <div className="ie-markup-tips" role="toolbar" aria-label="Markup">
          {tools.map((id) => {
            const active =
              tool === id ||
              (id === "ruler" && rulerVisible && tool === "ruler");
            return (
              <button
                key={id}
                type="button"
                className="ie-markup-tip"
                data-ie-tool={id}
                data-ie-active={active ? "true" : undefined}
                aria-label={toolLabel(id)}
                aria-pressed={active}
                onClick={() => selectTool(id)}
              >
                <TipIcon tool={id} active={!!active} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="ie-markup-color-well"
          aria-label={labels.color}
          aria-haspopup="dialog"
          onClick={() => {
            setOptionsOpen(false);
            setAddMenuOpen(false);
            onOpenColorPicker?.();
          }}
        >
          <span style={{ background: color }} />
        </button>

        <button
          type="button"
          className="ie-markup-add"
          aria-label={labels.add}
          aria-haspopup="menu"
          aria-expanded={addMenuOpen}
          aria-controls={addMenuOpen ? addMenuId : undefined}
          data-ie-open={addMenuOpen ? "true" : undefined}
          onClick={() => {
            setOptionsOpen(false);
            setAddMenuOpen((v) => !v);
          }}
        >
          <span>
            <PlusIcon />
          </span>
        </button>
      </div>

      {addMenuOpen && (
        <div
          id={addMenuId}
          className="ie-markup-add-menu"
          role="menu"
          aria-label={labels.add}
        >
          {ADD_MENU_ITEMS.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              data-ie-tool={id}
              data-ie-active={tool === id ? "true" : undefined}
              onClick={() => pickAdd(id)}
            >
              <AddMenuIcon kind={id} />
              <span>{addLabel(id)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
