import { Logo } from "./Logo";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  computeFrameLayout,
  computePixelCrop,
  downscaleBlob,
  ensureFillImage,
  framePointToImage,
  markupPlaneFromCrop,
  migrateFrameMarkupToImage,
  normalizeEditorSnapshot,
} from "react-advanced-image-editor-core";
import { resizeBlob } from "../export/resizeBlob";
import { cssColorToHex, parseCssColor, toCssColor } from "../color/cssColor";
import { useImageEditor } from "../hooks/useImageEditor";
import { useFilterThumbnails } from "../hooks/useFilterThumbnails";
import { CropViewport } from "./CropViewport";
import {
  CROP_FADE_HIDE_FADE_DELAY_MS,
  CROP_FADE_HIDE_FADE_EASE,
  CROP_FADE_HIDE_FADE_MS,
  CROP_FADE_REVEAL_FADE_DELAY_MS,
  CROP_FADE_REVEAL_FADE_EASE,
  CROP_FADE_REVEAL_FADE_MS,
} from "../crop/cropFade";
import {
  MARKUP_MODE_HIDE_FADE_DELAY_MS,
  MARKUP_MODE_HIDE_FADE_EASE,
  MARKUP_MODE_HIDE_FADE_MS,
  MARKUP_MODE_REVEAL_FADE_DELAY_MS,
  MARKUP_MODE_REVEAL_FADE_EASE,
  MARKUP_MODE_REVEAL_FADE_MS,
  markupModeFadeWaitMs,
  markupModeLayoutSettleMs,
} from "../crop/markupModeFade";
import {
  CHROME_PANEL_HIDE_FADE_DELAY_MS,
  CHROME_PANEL_HIDE_FADE_EASE,
  CHROME_PANEL_HIDE_FADE_MS,
  CHROME_PANEL_REVEAL_FADE_DELAY_MS,
  CHROME_PANEL_REVEAL_FADE_EASE,
  CHROME_PANEL_REVEAL_FADE_MS,
} from "../crop/chromePanelFade";
import {
  RULER_SWITCH_HIDE_FADE_DELAY_MS,
  RULER_SWITCH_HIDE_FADE_EASE,
  RULER_SWITCH_HIDE_FADE_MS,
  RULER_SWITCH_REVEAL_FADE_DELAY_MS,
  RULER_SWITCH_REVEAL_FADE_EASE,
  RULER_SWITCH_REVEAL_FADE_MS,
} from "../crop/rulerSwitchFade";
import {
  MODE_STRIP_SCROLL_FADE_EASE,
  MODE_STRIP_SCROLL_FADE_MS,
  MODE_STRIP_SCROLL_WASH_PCT,
} from "../crop/modeStripScrollFade";
import {
  useChromeHoldFade,
  type ChromeFadeState,
} from "../crop/useChromeHoldFade";
import { EditorCalibrateStrip } from "./EditorCalibrateStrip";
import { EditorFilterStrip } from "./EditorFilterStrip";
import {
  EditorMarkupToolbar,
  MARKUP_STROKE_WIDTHS,
  defaultMarkupLabels,
} from "./EditorMarkupToolbar";
import { MarkupSignaturePad } from "./MarkupSignaturePad";
import { EditorStickerSheet, type StickerPick } from "./EditorStickerPicker";
import { EditorColorPicker } from "./EditorColorPicker";
import { EditorModeStrip } from "./EditorModeStrip";
import { EditorCropShapePanel } from "./EditorCropShapePanel";
import { EditorFrameStrip } from "./EditorFrameStrip";
import { EditorResizeStrip } from "./EditorResizeStrip";
import { EditorFillStrip } from "./EditorFillStrip";
import {
  FILL_SWATCH_NAMES,
  fillSwatchColor,
  fillSwatchHasRuler,
  fillSwatchLabel,
  type FillSwatchName,
} from "../color/tailwindPalette";
import { EditorRedactToolbar, RedactLayer } from "./RedactLayer";
import { EditorPresetPicker } from "./EditorPresetPicker";
import { EditorSidebarTools } from "./EditorSidebarTools";
import { ExportResultPreview, ExportPageResult } from "./ExportResultPreview";
import {
  ModeChromeSlot,
  ModePresence,
  ModeLabelFade,
  RulerSwitchFade,
} from "./ModeTransition";
import { RotationRuler } from "./RotationRuler";
import { MarkupShapeBadge } from "./MarkupShapeBadge";
import {
  applyCropOrientation,
  applyCropShapeId,
  createInitialCropShapeSelection,
  initialCropOrientation,
  normalizeCropShapeId,
  resolveCropShapeAspect,
  type CropShapeId,
  type CropShapeOrientation,
  type CropShapeSelection,
} from "../crop/cropShape";
import {
  cloneMarkup,
  createDefaultRuler,
  preloadStickerEmoji,
  type EraserMode,
  type MarkupRuler,
  type MarkupShape,
  type MarkupShapeKind,
  type MarkupSignatureTemplate,
  type MarkupState,
  type MarkupSticker,
  type MarkupTextAlign,
  type MarkupTool,
  type RedactStyle,
} from "react-advanced-image-editor-core";
import { resolveEditorLocale } from "../i18n/resolve";
import { resolveEditorConfig } from "../presets";
import { themeColorsToStyle } from "../themeCss";
import {
  adjustChannels,
  defaultAdjustLabels,
  defaultFilterLabels,
  defaultLabels,
  filterIds,
  DEFAULT_PRESET_PICKER_OPTIONS,
  type AdjustChannel,
  type EditorRulerMode,
  type FilterId,
  type ImageEditorClassNames,
  type ImageEditorContainer,
  type ImageEditorLabels,
  type ImageEditorProps,
  type ImageEditorState,
} from "../types";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter((p): p is string => Boolean(p)).join(" ");
}

function resolveEditorContainer(
  container: ImageEditorContainer,
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (typeof container === "string") {
    const node = document.querySelector(container);
    return node instanceof HTMLElement ? node : null;
  }
  if (container instanceof HTMLElement) return container;
  return container.current;
}

/** Resolve a host without changing its layout. Used by `.ie-export-result`. */
function useMountHost(
  container: ImageEditorContainer | undefined,
  enabled: boolean,
) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!enabled || container == null) {
      setHost(null);
      return;
    }
    setHost(resolveEditorContainer(container));
  }, [container, enabled]);

  return host;
}

/** Mount target for `presentation="inline"` + `container`. */
function useInlineHost(
  container: ImageEditorContainer | undefined,
  enabled: boolean,
  lockOverflow: boolean,
) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!enabled || container == null) {
      setHost(null);
      return;
    }
    setHost(resolveEditorContainer(container));
  }, [container, enabled]);

  useLayoutEffect(() => {
    if (!host) return;
    const previousPosition = host.style.position;
    const previousOverflow = host.style.overflow;
    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }
    if (lockOverflow) host.style.overflow = "hidden";
    return () => {
      host.style.position = previousPosition;
      host.style.overflow = previousOverflow;
    };
  }, [host, lockOverflow]);

  return host;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(
    el.closest('.ie-markup-text-editor, [contenteditable="true"]'),
  );
}

type RulerMode = EditorRulerMode;

/**
 * Perspective is stored in [-1, 1] on the transform but presented on a
 * -100…100 ruler, the same range photo editors use for its keystone sliders.
 */
const PERSPECTIVE_UI_SCALE = 100;

function perspectiveToUi(value: number) {
  return (value ?? 0) * PERSPECTIVE_UI_SCALE;
}

function uiToPerspective(value: number) {
  return Math.min(1, Math.max(-1, value / PERSPECTIVE_UI_SCALE));
}

/** Calibrate channels use the same −100…100 UI scale as perspective. */
const ADJUST_UI_SCALE = 100;

function adjustToUi(value: number) {
  return (value ?? 0) * ADJUST_UI_SCALE;
}

function uiToAdjust(value: number) {
  return Math.min(1, Math.max(-1, value / ADJUST_UI_SCALE));
}

/** Filter strength is 0…1 on state, 0–100 on the ruler (0–100 scale). */
const FILTER_UI_SCALE = 100;

function intensityToUi(value: number) {
  return (value ?? 0) * FILTER_UI_SCALE;
}

function uiToIntensity(value: number) {
  return Math.min(1, Math.max(0, value / FILTER_UI_SCALE));
}

const PARK_EPS = 0.001;

function isParkedZero(value: number) {
  return Math.abs(value) <= PARK_EPS;
}

function withoutParked<K extends string>(
  map: Partial<Record<K, number>>,
  key: K,
): Partial<Record<K, number>> {
  if (map[key] == null) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

/** Tap a non-zero badge to stash + zero; tap again at 0 to restore. */
function parkToggle(
  live: number,
  stored: number | undefined,
): { stored: number | undefined; apply: number | null } {
  if (stored != null && isParkedZero(live)) {
    return { stored: undefined, apply: stored };
  }
  if (!isParkedZero(live)) {
    return { stored: live, apply: 0 };
  }
  return { stored, apply: null };
}

const SIDEBAR_TOOL_IDS = [
  "crop",
  "calibrate",
  "filter",
  "annotate",
  "fill",
  "redact",
  "frame",
  "resize",
] as const;

type SidebarToolId = (typeof SIDEBAR_TOOL_IDS)[number];

type MarkupSession = {
  returnTool: SidebarToolId;
  baseline: MarkupState;
  past: MarkupState[];
  present: MarkupState;
  future: MarkupState[];
};

type MarkupFadePhase = "idle" | "out" | "in";

type MarkupFadePending =
  | { kind: "enter"; from: SidebarToolId }
  | { kind: "leave"; keep: boolean; to: SidebarToolId };

function markupStatesEqual(a: MarkupState, b: MarkupState) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function createMarkupSession(
  returnTool: SidebarToolId,
  markup: MarkupState,
): MarkupSession {
  const present = cloneMarkup(markup);
  return {
    returnTool: returnTool === "annotate" ? "crop" : returnTool,
    baseline: cloneMarkup(markup),
    past: [],
    present,
    future: [],
  };
}

function pushMarkupSession(
  prev: MarkupSession | null,
  next: MarkupState,
): MarkupSession | null {
  if (!prev) return prev;
  if (markupStatesEqual(prev.present, next)) return prev;
  return {
    ...prev,
    past: [...prev.past, prev.present],
    present: cloneMarkup(next),
    future: [],
  };
}

function undoMarkupSessionState(
  prev: MarkupSession | null,
): MarkupSession | null {
  if (!prev || prev.past.length === 0) return prev;
  const present = prev.past[prev.past.length - 1];
  if (!present) return prev;
  return {
    ...prev,
    past: prev.past.slice(0, -1),
    present,
    future: [prev.present, ...prev.future],
  };
}

function redoMarkupSessionState(
  prev: MarkupSession | null,
): MarkupSession | null {
  if (!prev || prev.future.length === 0) return prev;
  const present = prev.future[0];
  if (!present) return prev;
  return {
    ...prev,
    past: [...prev.past, prev.present],
    present,
    future: prev.future.slice(1),
  };
}

function IconUndo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

function IconRedo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  );
}

function IconReset() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function IconFullscreen() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4H4v5" />
      <path d="M15 4h5v5" />
      <path d="M20 15v5h-5" />
      <path d="M4 15v5h5" />
    </svg>
  );
}

function IconExitFullscreen() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M20 15v5h-5" />
      <path d="M4 15v5h5" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg
      className="ie-topbar-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      className="ie-topbar-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconRotateLeft() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />

      <path d="M15 2L12 5L15 8" />
    </svg>
  );
}

function IconFlipH() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.5 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2.5" />
      <path d="M15.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2.5" />
      <path d="M12 19v1" />
      <path d="M12 14v1" />
      <path d="M12 9v1" />
      <path d="M12 4v1" />
    </svg>
  );
}

function IconFlipV() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5" />
      <path d="M4 15.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
      <path d="M5 12h1" />
      <path d="M10 12h1" />
      <path d="M15 12h1" />
      <path d="M20 12h1" />
    </svg>
  );
}

function IconCropShape() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.55"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M12 9v11" />
      <path d="M2 9h13a2 2 0 0 1 2 2v9" />
    </svg>
  );
}

/** Slim line icons for the sidebar chrome — not used inside the canvas tools. */
function SidebarToolIcon({ id }: { id: SidebarToolId }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.55,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (id) {
    case "crop":
      return (
        <svg
          {...common}
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 2v14a2 2 0 0 0 2 2h14" />
          <path d="M18 22V8a2 2 0 0 0-2-2H2" />
        </svg>
      );
    case "calibrate":
      return (
        <svg
          {...common}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.55"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            fill="none"
            d="M12 21a9 9 0 0 0 2.32-.302a9 9 0 0 0 1.74-16.733A9 9 0 1 0 12 21m0-18v17m0-8h9m-9-3h8m-8-3h6m-6 12h6m-6-3h8"
          />
        </svg>
      );
    case "filter":
      return (
        <svg
          {...common}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <defs>
            <pattern
              id="diagonalLines"
              width="3"
              height="3"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="3"
                stroke="currentColor"
                stroke-width="1"
              />
            </pattern>

            <pattern
              id="dots"
              width="3"
              height="3"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1.5" cy="1.5" r="0.15" fill="currentColor" />
            </pattern>

            <mask id="rightMask">
              <rect width="24" height="24" fill="white" />
              <circle cx="8" cy="16" r="6" fill="black" />
              <circle cx="12" cy="8" r="6" fill="black" />
            </mask>

            <mask id="leftMask">
              <rect width="24" height="24" fill="white" />
              <circle cx="12" cy="8" r="6" fill="black" />
            </mask>
          </defs>

          <g mask="url(#rightMask)">
            <circle
              cx="16"
              cy="16"
              r="6"
              fill="url(#dots)"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </g>

          <g mask="url(#leftMask)">
            <circle
              cx="8"
              cy="16"
              r="6"
              fill="url(#diagonalLines)"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </g>

          <circle
            cx="12"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />

          <circle cx="12" cy="8" r="4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "fill":
      return (
        <svg
          {...common}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.55"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M11 7 6 2" />
          <path d="M18.992 12H2.041" />
          <path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595" />
          <path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33" />
        </svg>
      );
    case "annotate":
      return (
        <svg
          {...common}
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3H8" />
          <path d="m15.007 5.008 3.987 3.986" />
          <path d="M20 15v4" />
          <path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
          <path d="M22 17h-4" />
          <path d="M4 5v4" />
          <path d="M6 7H2" />
          <path d="M9 2v2" />
        </svg>
      );
    case "redact":
      return (
        <svg
          {...common}
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
          <path d="M15 3v18" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
        </svg>
      );
    case "frame":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="22" x2="2" y1="6" y2="6" />
          <line x1="22" x2="2" y1="18" y2="18" />
          <line x1="6" x2="6" y1="2" y2="22" />
          <line x1="18" x2="18" y1="2" y2="22" />
        </svg>
      );
    case "resize":
      return (
        <svg {...common}>
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M14 15H9v-5" />
          <path d="M16 3h5v5" />
          <path d="M21 3 9 15" />
        </svg>
      );
  }
}

function IconRedactRectangle() {
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
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M9 21h1" />
      <path d="M14 3h1" />
      <path d="M14 21h1" />
      <path d="M3 9v1" />
      <path d="M21 9v1" />
      <path d="M3 14v1" />
      <path d="M21 14v1" />
    </svg>
  );
}

function IconRedactBrush() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M10 2v2" />
      <path d="M14 2v4" />
      <path d="M17 2a1 1 0 0 1 1 1v9H6V3a1 1 0 0 1 1-1z" />
      <path d="M6 12a1 1 0 0 0-1 1v1a2 2 0 0 0 2 2h2a1 1 0 0 1 1 1v2.9a2 2 0 1 0 4 0V17a1 1 0 0 1 1-1h2a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1" />
    </svg>
  );
}

function IconFillColor() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden
    >
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

function IconFillImage() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-image-up preview-icon"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/></svg>
  );
}

function IconFillBlur() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m14.31 8 5.74 9.94" />
      <path d="M9.69 8h11.48" />
      <path d="m7.38 12 5.74-9.94" />
      <path d="M9.69 16 3.95 6.06" />
      <path d="M14.31 16H2.83" />
      <path d="m16.62 12-5.74 9.94" />
    </svg>
  );
}

function buildSidebarTools(
  labels: ImageEditorLabels,
  enableResize: boolean,
  enableFill: boolean,
) {
  const toolLabels = { ...defaultLabels.tools, ...labels.tools };
  const calibrateLabel =
    toolLabels.calibrate ??
    toolLabels.finetune ??
    defaultLabels.tools?.calibrate ??
    "Calibrate";
  return SIDEBAR_TOOL_IDS.filter(
    (id) => (enableResize || id !== "resize") && (enableFill || id !== "fill"),
  ).map((id) => ({
    id,
    label: id === "calibrate" ? calibrateLabel : (toolLabels[id] ?? id),
    enabled: true,
  }));
}

async function readStickerImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let transparent = false;
  for (let i = 3; i < pixels.length; i += 64) {
    if (pixels[i] < 250) {
      transparent = true;
      break;
    }
  }
  return {
    url: canvas.toDataURL(transparent ? "image/png" : "image/jpeg", 0.86),
    width,
    height,
  };
}

async function readFillImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return "";
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

function zoomToScaleValue(zoom: number, minZoom: number, maxZoom: number) {
  const span = Math.max(0.0001, maxZoom - minZoom);
  return Math.round(((zoom - minZoom) / span) * 100);
}

function clampResizePx(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(8192, Math.max(1, Math.round(value)));
}

function readSavedResize(state: ImageEditorState) {
  const raw = state.resize;
  if (!raw || typeof raw !== "object") return null;
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width: clampResizePx(width), height: clampResizePx(height) };
}

function readFillChrome(state: ImageEditorState) {
  const family = state.fillFamily;
  if (
    typeof family !== "string" ||
    !(FILL_SWATCH_NAMES as readonly string[]).includes(family)
  ) {
    return null;
  }
  const shade = Number(state.fillShade);
  return {
    family: family as FillSwatchName,
    shade: Number.isFinite(shade) ? Math.min(100, Math.max(0, shade)) : 50,
  };
}

function scaleValueToZoom(value: number, minZoom: number, maxZoom: number) {
  return (
    minZoom + (Math.min(100, Math.max(0, value)) / 100) * (maxZoom - minZoom)
  );
}

export function ImageEditor({
  open,
  presentation = "modal",
  container,
  src,
  preset = "default",
  features: featureOverrides,
  crop: cropOverride,
  exportOptions: exportOverride,
  cropOutsideImage,
  interactionMode,
  layout,
  className,
  classNames = {},
  unstyled = false,
  labels: labelOverrides,
  onPresetChange,
  presetPicker,
  animateTicks = true,
  tickWidth = 2.2,
  majorTickWidth = 2.2,
  negativeColor,
  positiveColor,
  modeRingColors,
  darkModeRingColors,
  theme = "light",
  locale = "en",
  colors,
  darkColors,
  brandColor,
  brandColorAffectsBackground = false,
  showExportPreview = true,
  exportView = "preview",
  exportResultContainer,
  initialZoom = 1,
  fonts,
  onExport,
  onCancel,
  showMediaSize = true,
  enableResize = true,
  enableFill = true,
  imageState = null,
  onImageStateChange,
}: ImageEditorProps) {
  const resolvedMajorTickWidth = majorTickWidth ?? tickWidth;
  const pickerOptions = presetPicker?.options ?? DEFAULT_PRESET_PICKER_OPTIONS;
  const resolvedPreset =
    pickerOptions.length === 1 ? (pickerOptions[0] ?? preset) : preset;
  const activeRingColors =
    theme === "dark" ? (darkModeRingColors ?? modeRingColors) : modeRingColors;
  const rootThemeStyle = useMemo(() => {
    const tokenStyle = themeColorsToStyle(
      theme === "dark" ? darkColors : colors,
    );
    const brand = brandColor?.trim();
    return {
      ...(brand ? { ["--ie-brand" as string]: brand } : {}),
      ...tokenStyle,
      ["--ie-ruler-tick-width" as string]: `${tickWidth}px`,
      ["--ie-ruler-tick-major-width" as string]: `${resolvedMajorTickWidth}px`,
      ["--ie-crop-fade-reveal-duration" as string]: `${CROP_FADE_REVEAL_FADE_MS}ms`,
      ["--ie-crop-fade-reveal-ease" as string]: CROP_FADE_REVEAL_FADE_EASE,
      ["--ie-crop-fade-reveal-delay" as string]: `${CROP_FADE_REVEAL_FADE_DELAY_MS}ms`,
      ["--ie-crop-fade-hide-duration" as string]: `${CROP_FADE_HIDE_FADE_MS}ms`,
      ["--ie-crop-fade-hide-ease" as string]: CROP_FADE_HIDE_FADE_EASE,
      ["--ie-crop-fade-hide-delay" as string]: `${CROP_FADE_HIDE_FADE_DELAY_MS}ms`,
      ["--ie-markup-mode-reveal-duration" as string]: `${MARKUP_MODE_REVEAL_FADE_MS}ms`,
      ["--ie-markup-mode-reveal-ease" as string]: MARKUP_MODE_REVEAL_FADE_EASE,
      ["--ie-markup-mode-reveal-delay" as string]: `${MARKUP_MODE_REVEAL_FADE_DELAY_MS}ms`,
      ["--ie-markup-mode-hide-duration" as string]: `${MARKUP_MODE_HIDE_FADE_MS}ms`,
      ["--ie-markup-mode-hide-ease" as string]: MARKUP_MODE_HIDE_FADE_EASE,
      ["--ie-markup-mode-hide-delay" as string]: `${MARKUP_MODE_HIDE_FADE_DELAY_MS}ms`,
      ["--ie-chrome-panel-reveal-duration" as string]: `${CHROME_PANEL_REVEAL_FADE_MS}ms`,
      ["--ie-chrome-panel-reveal-ease" as string]:
        CHROME_PANEL_REVEAL_FADE_EASE,
      ["--ie-chrome-panel-reveal-delay" as string]: `${CHROME_PANEL_REVEAL_FADE_DELAY_MS}ms`,
      ["--ie-chrome-panel-hide-duration" as string]: `${CHROME_PANEL_HIDE_FADE_MS}ms`,
      ["--ie-chrome-panel-hide-ease" as string]: CHROME_PANEL_HIDE_FADE_EASE,
      ["--ie-chrome-panel-hide-delay" as string]: `${CHROME_PANEL_HIDE_FADE_DELAY_MS}ms`,
      ["--ie-ruler-switch-reveal-duration" as string]: `${RULER_SWITCH_REVEAL_FADE_MS}ms`,
      ["--ie-ruler-switch-reveal-ease" as string]:
        RULER_SWITCH_REVEAL_FADE_EASE,
      ["--ie-ruler-switch-reveal-delay" as string]: `${RULER_SWITCH_REVEAL_FADE_DELAY_MS}ms`,
      ["--ie-ruler-switch-hide-duration" as string]: `${RULER_SWITCH_HIDE_FADE_MS}ms`,
      ["--ie-ruler-switch-hide-ease" as string]: RULER_SWITCH_HIDE_FADE_EASE,
      ["--ie-ruler-switch-hide-delay" as string]: `${RULER_SWITCH_HIDE_FADE_DELAY_MS}ms`,
      ["--ie-mode-strip-scroll-fade-duration" as string]: `${MODE_STRIP_SCROLL_FADE_MS}ms`,
      ["--ie-mode-strip-scroll-fade-ease" as string]:
        MODE_STRIP_SCROLL_FADE_EASE,
      ["--ie-mode-strip-scroll-wash" as string]: `${MODE_STRIP_SCROLL_WASH_PCT}%`,
    } as CSSProperties;
  }, [
    theme,
    colors,
    darkColors,
    brandColor,
    tickWidth,
    resolvedMajorTickWidth,
  ]);
  const config = useMemo(
    () =>
      resolveEditorConfig({
        preset: resolvedPreset,
        features: featureOverrides,
        crop: cropOverride,
        exportOptions: exportOverride,
        cropOutsideImage,
        interactionMode,
        layout,
      }),
    [
      resolvedPreset,
      featureOverrides,
      cropOverride,
      exportOverride,
      cropOutsideImage,
      interactionMode,
      layout,
    ],
  );

  const { features } = config;
  const localePack = useMemo(() => resolveEditorLocale(locale), [locale]);
  const resolvedPresetPicker = useMemo(
    () => ({
      ...presetPicker,
      label: presetPicker?.label ?? localePack.presetLabel,
      presetLabels: {
        ...localePack.presetLabels,
        ...presetPicker?.presetLabels,
      },
    }),
    [presetPicker, localePack],
  );
  const labels: ImageEditorLabels = useMemo(
    () => ({
      ...defaultLabels,
      ...localePack.labels,
      ...labelOverrides,
      tools: {
        ...defaultLabels.tools,
        ...localePack.labels.tools,
        ...labelOverrides?.tools,
      },
      filters: {
        ...defaultFilterLabels,
        ...localePack.labels.filters,
        ...labelOverrides?.filters,
      },
      cropShapes: {
        ...defaultLabels.cropShapes,
        ...localePack.labels.cropShapes,
        ...labelOverrides?.cropShapes,
      },
      markup: {
        ...defaultLabels.markup,
        ...localePack.labels.markup,
        ...labelOverrides?.markup,
      },
      frames: {
        ...defaultLabels.frames,
        ...localePack.labels.frames,
        ...labelOverrides?.frames,
      },
      frameProps: {
        ...defaultLabels.frameProps,
        ...localePack.labels.frameProps,
        ...labelOverrides?.frameProps,
      },
      fillModes: {
        ...defaultLabels.fillModes,
        ...localePack.labels.fillModes,
        ...labelOverrides?.fillModes,
      },
      fillColors: {
        ...defaultLabels.fillColors,
        ...localePack.labels.fillColors,
        ...labelOverrides?.fillColors,
      },
      redact: {
        ...defaultLabels.redact,
        ...localePack.labels.redact,
        ...labelOverrides?.redact,
      },
      resize: {
        ...defaultLabels.resize,
        ...localePack.labels.resize,
        ...labelOverrides?.resize,
      },
    }),
    [labelOverrides, localePack],
  );
  const markupLabels = useMemo(
    () => ({ ...defaultMarkupLabels, ...labels.markup }),
    [labels.markup],
  );
  const frameLabels = useMemo(
    () =>
      ({
        ...defaultLabels.frames,
        ...labels.frames,
        ...defaultLabels.frameProps,
        ...labels.frameProps,
      }) as import("./EditorFrameStrip").FrameStripLabels,
    [labels.frames, labels.frameProps],
  );
  const redactLabels = useMemo(
    () => ({ ...defaultLabels.redact, ...labels.redact }),
    [labels.redact],
  );
  const sidebarTools = useMemo(
    () => buildSidebarTools(labels, enableResize, enableFill),
    [labels, enableResize, enableFill],
  );
  const presetAspectRatio = config.crop.aspectRatio ?? null;
  const guides = config.crop.guides ?? [];

  const [pastedSource, setPastedSource] = useState<File | null>(null);
  const [stickerBusy, setStickerBusy] = useState(false);
  useEffect(() => {
    setPastedSource(null);
  }, [src, open]);
  const editor = useImageEditor(open ? (pastedSource ?? src) : null, {
    initialZoom,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** Floating result after Done — kept even when the parent closes the editor. */
  const [exportResult, setExportResult] = useState<{
    url: string;
    mimeType: string;
  } | null>(null);
  const [activeTool, setActiveTool] = useState<SidebarToolId>("crop");
  const [markupSession, setMarkupSession] = useState<MarkupSession | null>(
    null,
  );
  const [markupFade, setMarkupFade] = useState<MarkupFadePhase>("idle");
  const markupSessionRef = useRef<MarkupSession | null>(null);
  const markupFadeRef = useRef<MarkupFadePhase>("idle");
  const markupFadePendingRef = useRef<MarkupFadePending | null>(null);
  markupSessionRef.current = markupSession;
  markupFadeRef.current = markupFade;
  const editorMarkupRef = useRef(editor.markup);
  const commitMarkupRef = useRef(editor.commitMarkup);
  editorMarkupRef.current = editor.markup;
  commitMarkupRef.current = editor.commitMarkup;
  /** Crop frame inset within the viewport band (~half the previous margin). */
  const [frameScale, setFrameScale] = useState(1);
  const [cropFitNonce, setCropFitNonce] = useState(0);
  const [modeTransitionNonce, setModeTransitionNonce] = useState(0);
  const [modeTransitionTarget, setModeTransitionTarget] = useState<
    "crop" | "preview"
  >("crop");
  const [highlightAdjust, setHighlightAdjust] =
    useState<AdjustChannel>("brightness");
  const [committedAdjust, setCommittedAdjust] =
    useState<AdjustChannel>("brightness");
  /**
   * Look under the carousel centre line. Applied to the preview immediately;
   * `editor.filter.id` is the same value, but this drives the strip so a
   * mid-scroll highlight never waits on a history round-trip.
   */
  const [highlightFilter, setHighlightFilter] = useState<FilterId>("original");
  const [fillFamily, setFillFamily] = useState<FillSwatchName>("white");
  const [fillShade, setFillShade] = useState(50);
  /**
   * Valid zoom range reported by the viewport. The lower bound is the minimum
   * covering scale for the current rotation/frame, so ruler value 0 maps onto
   * the exact geometric limit instead of an unreachable value.
   */
  const [zoomRange, setZoomRange] = useState({
    min: config.minZoom,
    max: config.maxZoom,
  });
  /** Follows scroll / tap highlight (circle centering). */
  const [highlightMode, setHighlightMode] = useState<RulerMode>("rotation");
  /** Ruler content — only updates after mode strip settles. */
  const [committedMode, setCommittedMode] = useState<RulerMode>("rotation");
  const [parkedCrop, setParkedCrop] = useState<
    Partial<Record<RulerMode, number>>
  >({});
  const [parkedAdjust, setParkedAdjust] = useState<
    Partial<Record<AdjustChannel, number>>
  >({});
  /**
   * Circle under the pointer in the Crop / Calibrate strip. Its label takes
   * over the floating pill over the preview; `null` falls back to the selected
   * circle. Hover never moves the pill, so nothing in the layout shifts.
   */
  const [hoveredBadgeLabel, setHoveredBadgeLabel] = useState<string | null>(
    null,
  );
  const [markupTool, setMarkupTool] = useState<MarkupTool>("move");
  const [markupEraserMode, setMarkupEraserMode] = useState<EraserMode>("pixel");
  const [markupColor, setMarkupColor] = useState("#ff3b30");
  const [markupStrokeWidth, setMarkupStrokeWidth] = useState<number>(
    MARKUP_STROKE_WIDTHS[1],
  );
  const markupStrokeOpacity = parseCssColor(markupColor).a;
  const setMarkupStrokeOpacity = useCallback((opacity: number) => {
    setMarkupColor((current) =>
      toCssColor({ ...parseCssColor(current), a: opacity }),
    );
  }, []);
  const [markupShapeKind, setMarkupShapeKind] =
    useState<MarkupShapeKind>("rect");
  const [markupTextAlign, setMarkupTextAlign] =
    useState<MarkupTextAlign>("left");
  const [markupRuler, setMarkupRuler] = useState<MarkupRuler>(() =>
    createDefaultRuler(),
  );
  const [markupSelectedIds, setMarkupSelectedIds] = useState<string[]>([]);
  const [markupSignatureTemplate, setMarkupSignatureTemplate] =
    useState<MarkupSignatureTemplate | null>(null);
  const [markupSignaturePadOpen, setMarkupSignaturePadOpen] = useState(false);
  const [stickerSheetOpen, setStickerSheetOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorEyedropActive, setColorEyedropActive] = useState(false);
  const [fillColorPickerOpen, setFillColorPickerOpen] = useState(false);
  const [fillEyedropActive, setFillEyedropActive] = useState(false);
  const [fillPickerColor, setFillPickerColor] = useState("#ffffff");
  const fillPickerColorRef = useRef("#ffffff");
  const fillPickerDirtyRef = useRef(false);
  const [cropShapeOpen, setCropShapeOpen] = useState(false);
  const [rotationInteracting, setRotationInteracting] = useState(false);
  const [chromeFade, setChromeFade] = useState<ChromeFadeState>({
    faded: false,
    focus: null,
    kind: null,
  });
  const { beginHoldFade, endHoldFade, resetHoldFade } =
    useChromeHoldFade(setChromeFade);
  const chromeFadeFocus = chromeFade.focus;

  const beginViewportChromeHoldFade = useCallback(
    (focus: string | null, stillActive?: () => boolean) => {
      beginHoldFade(focus, "viewport", true, stillActive);
    },
    [beginHoldFade],
  );

  const beginRulerChromeHoldFade = useCallback(
    (focus: string | null, stillActive?: () => boolean) => {
      beginHoldFade(focus, "ruler", true, stillActive);
    },
    [beginHoldFade],
  );

  const beginSelectiveChromeHoldFade = useCallback(
    (focus: string | null, stillActive?: () => boolean) => {
      beginHoldFade(focus, "selective", true, stillActive);
    },
    [beginHoldFade],
  );
  const [cropShapeSelection, setCropShapeSelection] =
    useState<CropShapeSelection | null>(null);
  const [redactStyle, setRedactStyle] = useState<RedactStyle>("pixelate");
  const [resizeCustom, setResizeCustom] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [resizeLinked, setResizeLinked] = useState(true);
  const resizeAxisRef = useRef<"width" | "height">("width");
  const [emitReady, setEmitReady] = useState(false);
  const imageStateRef = useRef(imageState);
  imageStateRef.current = imageState;
  const onImageStateChangeRef = useRef(onImageStateChange);
  onImageStateChangeRef.current = onImageStateChange;
  const appliedImageRef = useRef<typeof editor.loaded>(null);
  const stateSessionRef = useRef(0);
  const [redactInteractMode, setRedactInteractMode] = useState<"move" | "draw">(
    "move",
  );
  const [redactSelectedId, setRedactSelectedId] = useState<string | null>(null);
  const [redactBrushWidth, setRedactBrushWidth] = useState(0.07);
  const [redactStrength, setRedactStrength] = useState(0.55);
  const [redactDrawMode, setRedactDrawMode] = useState<"rect" | "brush">(
    "rect",
  );
  const [placeRequestKey, setPlaceRequestKey] = useState(0);
  const [placeRequestKind, setPlaceRequestKind] = useState<
    "text" | "shape" | "loupe" | null
  >(null);
  const [mobileViewport, setMobileViewport] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!editor.loaded) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(editor.loaded.blobUrl ?? editor.loaded.element.src);
  }, [editor.loaded]);

  // Seed crop-shape selection once media size is known; keep in sync with undo/redo.
  useEffect(() => {
    if (!editor.loaded) return;
    const mw = editor.getMediaSize().width;
    const mh = editor.getMediaSize().height;
    if (editor.cropShape) {
      setCropShapeSelection({
        shape: normalizeCropShapeId(editor.cropShape.shape),
        orientation: editor.cropShape.orientation,
      });
      return;
    }
    setCropShapeSelection(
      createInitialCropShapeSelection(mw, mh, config.crop.aspectRatio),
    );
  }, [
    editor.loaded,
    editor.cropShape,
    editor.getMediaSize,
    config.crop.aspectRatio,
  ]);

  useEffect(() => {
    if (!open) return;
    setCropShapeOpen(false);
  }, [open, src, resolvedPreset]);

  // Profile preset locks aspect — drop any crop-shape override and UI state.
  useEffect(() => {
    if (!editor.loaded || features.cropShape) return;
    if (editor.cropShape) {
      editor.setCropShape(undefined, editor.crop);
    }
    setCropShapeSelection(null);
  }, [
    editor.loaded,
    editor.cropShape,
    editor.crop,
    editor.setCropShape,
    features.cropShape,
    resolvedPreset,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && features.undoRedo && !isTypingTarget(e.target)) {
        if (key === "z" && !e.altKey) {
          e.preventDefault();
          const session = markupSessionRef.current;
          if (e.shiftKey) {
            if (session) {
              setMarkupSession((prev) => {
                const updated = redoMarkupSessionState(prev);
                markupSessionRef.current = updated;
                return updated;
              });
            } else if (editor.canRedo) {
              editor.redo();
            }
          } else if (session) {
            setMarkupSession((prev) => {
              const updated = undoMarkupSessionState(prev);
              markupSessionRef.current = updated;
              return updated;
            });
          } else if (editor.canUndo) {
            editor.undo();
          }
          return;
        }
        if (key === "y" && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          if (markupSessionRef.current) {
            setMarkupSession((prev) => {
              const updated = redoMarkupSessionState(prev);
              markupSessionRef.current = updated;
              return updated;
            });
          } else if (editor.canRedo) {
            editor.redo();
          }
          return;
        }
      }

      if (e.key === "Escape") {
        if (colorEyedropActive) {
          setColorEyedropActive(false);
          return;
        }
        if (fillEyedropActive) {
          setFillEyedropActive(false);
          return;
        }
        if (colorPickerOpen) {
          setColorPickerOpen(false);
          return;
        }
        if (fillColorPickerOpen) {
          if (fillPickerDirtyRef.current) {
            editor.setFill(
              { mode: "solid", color: fillPickerColorRef.current },
              true,
            );
            fillPickerDirtyRef.current = false;
          }
          setFillColorPickerOpen(false);
          return;
        }
        if (stickerSheetOpen) {
          setStickerSheetOpen(false);
          return;
        }
        if (cropShapeOpen) {
          setCropShapeOpen(false);
          return;
        }
        const session = markupSessionRef.current;
        if (session && markupFadeRef.current === "idle") {
          markupFadePendingRef.current = {
            kind: "leave",
            keep: false,
            to: session.returnTool,
          };
          setMarkupFade("out");
          return;
        }
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    onCancel,
    cropShapeOpen,
    stickerSheetOpen,
    colorPickerOpen,
    colorEyedropActive,
    fillColorPickerOpen,
    fillEyedropActive,
    features.undoRedo,
    editor.canUndo,
    editor.canRedo,
    editor.undo,
    editor.redo,
    editor.setFill,
  ]);

  useEffect(() => {
    setHighlightMode("rotation");
    setCommittedMode("rotation");
    setFrameScale(1);
    setActiveTool("crop");
    setHighlightAdjust("brightness");
    setCommittedAdjust("brightness");
    setHighlightFilter("original");
    setCropShapeSelection(null);
    setCropShapeOpen(false);
    setParkedCrop({});
    setParkedAdjust({});
    setColorPickerOpen(false);
    setColorEyedropActive(false);
    setFillColorPickerOpen(false);
    setFillEyedropActive(false);
    fillPickerDirtyRef.current = false;
    setStickerSheetOpen(false);
    markupSessionRef.current = null;
    markupFadePendingRef.current = null;
    setMarkupSession(null);
    setMarkupFade("idle");
  }, [src, resolvedPreset]);

  const handleReset = useCallback(() => {
    setCropFitNonce((n) => n + 1);
  }, []);

  const applyCropFit = useCallback(() => {
    editor.reset();
    setFrameScale(1);
    setParkedCrop({});
    setParkedAdjust({});
  }, [editor.reset]);

  const applyModeTransition = useCallback(() => {
    setFrameScale(1);
  }, []);

  const armModeTransition = useCallback((target: "crop" | "preview") => {
    setModeTransitionTarget(target);
    setModeTransitionNonce((n) => n + 1);
  }, []);

  const applySidebarTool = useCallback(
    (
      from: SidebarToolId,
      to: SidebarToolId,
      opts?: { animateMode?: boolean },
    ) => {
      const animateMode = opts?.animateMode !== false;
      setCropShapeOpen(false);
      setActiveTool(to);
      const leavingCrop = from === "crop";
      const enteringCrop = to === "crop";
      if (enteringCrop) {
        setHighlightMode("rotation");
        setCommittedMode("rotation");
        if (!leavingCrop && animateMode) {
          armModeTransition("crop");
        } else {
          setFrameScale(1);
        }
      } else if (leavingCrop) {
        if (animateMode) {
          armModeTransition("preview");
        } else {
          setFrameScale(1);
        }
      } else {
        setFrameScale(1);
      }
      if (to === "calibrate") {
        setHighlightAdjust("brightness");
        setCommittedAdjust("brightness");
      } else if (to === "filter") {
        setHighlightFilter(editor.filter.id);
      } else if (to === "annotate") {
        setMarkupTool("move");
      } else if (to === "redact") {
        setRedactSelectedId(null);
        setRedactInteractMode("move");
      } else if (to === "fill" && editor.fill.mode === "none") {
        setFillFamily("white");
        setFillShade(50);
        editor.setFill({ mode: "solid", color: "#ffffff" }, false);
      }
    },
    [armModeTransition, editor.filter.id, editor.fill.mode, editor.setFill],
  );

  const clearMarkupOverlays = useCallback(() => {
    setMarkupSelectedIds([]);
    setColorPickerOpen(false);
    setColorEyedropActive(false);
    setStickerSheetOpen(false);
    setMarkupSignaturePadOpen(false);
  }, []);

  const requestMarkupEnter = useCallback((from: SidebarToolId) => {
    if (markupFadeRef.current !== "idle") return;
    markupFadePendingRef.current = { kind: "enter", from };
    setMarkupFade("out");
  }, []);

  const requestMarkupLeave = useCallback((keep: boolean, to: SidebarToolId) => {
    if (markupFadeRef.current !== "idle") return;
    markupFadePendingRef.current = { kind: "leave", keep, to };
    setMarkupFade("out");
  }, []);

  useEffect(() => {
    if (markupFade !== "out") return;
    let cancelled = false;
    let settleTimer = 0;
    const hideTimer = window.setTimeout(() => {
      if (cancelled) return;
      const pending = markupFadePendingRef.current;
      markupFadePendingRef.current = null;
      if (pending?.kind === "enter") {
        const session = createMarkupSession(
          pending.from,
          editorMarkupRef.current,
        );
        markupSessionRef.current = session;
        setMarkupSession(session);
        clearMarkupOverlays();
        setPlaceRequestKind(null);
        applySidebarTool(pending.from, "annotate", { animateMode: false });
      } else if (pending?.kind === "leave") {
        const session = markupSessionRef.current;
        if (
          session &&
          pending.keep &&
          !markupStatesEqual(session.present, session.baseline)
        ) {
          commitMarkupRef.current(session.present);
        }
        markupSessionRef.current = null;
        setMarkupSession(null);
        clearMarkupOverlays();
        setPlaceRequestKind(null);
        applySidebarTool("annotate", pending.to, { animateMode: false });
      }
      settleTimer = window.setTimeout(() => {
        if (cancelled) return;
        setMarkupFade("in");
      }, markupModeLayoutSettleMs());
    }, markupModeFadeWaitMs("hide"));
    return () => {
      cancelled = true;
      window.clearTimeout(hideTimer);
      window.clearTimeout(settleTimer);
    };
  }, [markupFade, applySidebarTool, clearMarkupOverlays]);

  useEffect(() => {
    if (markupFade !== "in") return;
    const revealTimer = window.setTimeout(() => {
      setMarkupFade("idle");
    }, markupModeFadeWaitMs("reveal"));
    return () => window.clearTimeout(revealTimer);
  }, [markupFade]);

  const commitSessionMarkup = useCallback((next: MarkupState) => {
    setMarkupSession((prev) => {
      const updated = pushMarkupSession(prev, next);
      markupSessionRef.current = updated;
      return updated;
    });
  }, []);

  const undoMarkupSession = useCallback(() => {
    setMarkupSession((prev) => {
      const updated = undoMarkupSessionState(prev);
      markupSessionRef.current = updated;
      return updated;
    });
  }, []);

  const redoMarkupSession = useCallback(() => {
    setMarkupSession((prev) => {
      const updated = redoMarkupSessionState(prev);
      markupSessionRef.current = updated;
      return updated;
    });
  }, []);

  const handleZoomBoundsChange = useCallback(
    (bounds: { min: number; max: number }) => {
      setZoomRange((prev) =>
        Math.abs(prev.min - bounds.min) < 1e-6 &&
        Math.abs(prev.max - bounds.max) < 1e-6
          ? prev
          : bounds,
      );
    },
    [],
  );

  const parts: ImageEditorClassNames = useMemo(
    () => ({
      root: cn(!unstyled && "ie-modal-root", className, classNames.root),
      backdrop: classNames.backdrop,
      panel: classNames.panel,
      sidebar: classNames.sidebar,
      sidebarButton: classNames.sidebarButton,
      topbar: classNames.topbar,
      workspace: classNames.workspace,
      subToolbar: classNames.subToolbar,
      viewport: classNames.viewport,
      canvas: classNames.canvas,
      cropOverlay: classNames.cropOverlay,
      cropGuide: classNames.cropGuide,
      bottomBar: classNames.bottomBar,
      button: classNames.button,
      doneButton: classNames.doneButton,
    }),
    [className, classNames, unstyled],
  );

  const mediaSize = editor.getMediaSize();
  const showPresetPicker =
    Boolean(onPresetChange) &&
    activeTool === "crop" &&
    pickerOptions.length > 1;
  const showRotation = features.bottomBar && features.rotationTab;
  const showScale = features.bottomBar && features.scaleTab;
  /** Pinch-to-zoom replaces the Scale badge on narrow viewports. */
  const showScaleOnStrip = showScale && !mobileViewport;
  const showPerspective =
    features.bottomBar && features.perspectiveTab !== false;
  const isCalibrate = activeTool === "calibrate";
  const isFilter = activeTool === "filter";
  const isMarkup = activeTool === "annotate";
  const isRedact = activeTool === "redact";
  const isFill = enableFill && activeTool === "fill";
  const isFrame = activeTool === "frame";
  const isResize = enableResize && activeTool === "resize";
  const liveMarkup = markupSession?.present ?? editor.markup;
  const markupCanUndo = isMarkup
    ? Boolean(markupSession && markupSession.past.length > 0)
    : editor.canUndo;
  const markupCanRedo = isMarkup
    ? Boolean(markupSession && markupSession.future.length > 0)
    : editor.canRedo;
  const handleMarkupUndo = isMarkup ? undoMarkupSession : editor.undo;
  const handleMarkupRedo = isMarkup ? redoMarkupSession : editor.redo;
  const handleMarkupCommit = markupSession
    ? commitSessionMarkup
    : editor.commitMarkup;
  /** Every non-crop tool previews the graded frame against the mask edges. */
  const isPreviewTool =
    isCalibrate ||
    isFilter ||
    isMarkup ||
    isFill ||
    isRedact ||
    isFrame ||
    isResize;
  const showCropFloatingTools =
    !isPreviewTool &&
    (features.flipHorizontal ||
      features.flipVertical ||
      features.rotateLeft ||
      features.cropShape);
  const showRedactFloatingTools = isRedact && features.subToolbar !== false;
  const showFillFloatingTools = isFill && features.subToolbar !== false;
  /** Ruler/scale strip — hidden while the Crop Shape selector owns the bottom bar. */
  const showCropBottomBar =
    !isPreviewTool &&
    !cropShapeOpen &&
    (showRotation || showScaleOnStrip || showPerspective);
  const showCropShapePanel =
    !isPreviewTool && cropShapeOpen && features.cropShape;
  const showCalibrateBottomBar = isCalibrate && features.bottomBar !== false;
  const showFilterBottomBar = isFilter && features.bottomBar !== false;
  const showMarkupBottomBar = isMarkup && features.bottomBar !== false;
  const showRedactBottomBar = isRedact && features.bottomBar !== false;
  const showFillBottomBar = isFill && features.bottomBar !== false;
  const showFrameBottomBar = isFrame && features.bottomBar !== false;
  const showResizeBottomBar = isResize && features.bottomBar !== false;
  const chromeId = showCropShapePanel
    ? "crop-shape"
    : showCropBottomBar
      ? "crop"
      : showCalibrateBottomBar
        ? "calibrate"
        : showFilterBottomBar
          ? "filter"
          : showMarkupBottomBar
            ? "annotate"
            : showFillBottomBar
              ? "fill"
              : showRedactBottomBar
                ? "redact"
                : showFrameBottomBar
                  ? "frame"
                  : showResizeBottomBar
                    ? "resize"
                    : "none";
  const subToolbarId = showCropFloatingTools
    ? "crop"
    : showRedactFloatingTools
      ? "redact"
      : showFillFloatingTools
        ? "fill"
        : "none";

  const activeCropShape =
    cropShapeSelection ??
    createInitialCropShapeSelection(
      mediaSize.width,
      mediaSize.height,
      presetAspectRatio,
    );

  const aspectRatio = editor.cropShape
    ? editor.cropShape.aspect
    : cropShapeSelection
      ? resolveCropShapeAspect(
          cropShapeSelection,
          mediaSize.width,
          mediaSize.height,
        )
      : presetAspectRatio;

  const freeform = activeCropShape.shape === "freeform" || aspectRatio == null;

  const nativeOutput = useMemo(() => {
    const mw = mediaSize.width;
    const mh = mediaSize.height;
    if (mw < 1 || mh < 1) return { width: 0, height: 0 };
    const cw = editor.cropFrameSize?.width || editor.viewportSize.width;
    const ch = editor.cropFrameSize?.height || editor.viewportSize.height;
    if (cw < 1 || ch < 1) {
      return { width: Math.round(mw), height: Math.round(mh) };
    }
    const pixel = computePixelCrop(mw, mh, editor.crop, aspectRatio, cw, ch, {
      cropOutsideImage: config.cropOutsideImage,
    });
    const cropW = Math.max(1, Math.round(pixel.width));
    const cropH = Math.max(1, Math.round(pixel.height));
    const layout = computeFrameLayout(cropW, cropH, editor.frame);
    return {
      width: Math.max(1, layout.outW),
      height: Math.max(1, layout.outH),
    };
  }, [
    mediaSize.width,
    mediaSize.height,
    editor.crop,
    editor.cropFrameSize,
    editor.viewportSize,
    editor.frame,
    aspectRatio,
    config.cropOutsideImage,
  ]);

  useEffect(() => {
    setResizeCustom(null);
  }, [src]);

  useEffect(() => {
    stateSessionRef.current += 1;
  }, [src, pastedSource]);

  useEffect(() => {
    if (!open || !editor.loaded) {
      if (!open) appliedImageRef.current = null;
      setEmitReady(false);
      return;
    }
    if (appliedImageRef.current === editor.loaded) {
      setEmitReady(!pastedSource);
      return;
    }
    appliedImageRef.current = editor.loaded;
    stateSessionRef.current += 1;
    if (!pastedSource) {
      const saved = imageStateRef.current;
      if (saved) {
        const snapshot = normalizeEditorSnapshot(saved);
        editor.replaceSnapshot(snapshot);
        setHighlightFilter(snapshot.filter.id);
        const chrome = readFillChrome(saved);
        if (chrome) {
          setFillFamily(chrome.family);
          setFillShade(chrome.shade);
        }
        setResizeLinked(saved.resizeLinked !== false);
        setResizeCustom(enableResize ? readSavedResize(saved) : null);
      } else {
        setHighlightFilter("original");
        setFillFamily("white");
        setFillShade(50);
        setResizeLinked(true);
        setResizeCustom(null);
      }
    }
    setEmitReady(!pastedSource);
  }, [open, editor.loaded, editor.replaceSnapshot, pastedSource, enableResize]);

  useEffect(() => {
    if (!emitReady) return;
    const session = stateSessionRef.current;
    const frame = requestAnimationFrame(() => {
      if (stateSessionRef.current !== session) return;
      const emit = onImageStateChangeRef.current;
      if (!emit) return;
      emit({
        ...normalizeEditorSnapshot({
          crop: editor.crop,
          transform: editor.transform,
          adjust: editor.adjust,
          filter: editor.filter,
          markup: editor.markup,
          fill: editor.fill,
          redact: editor.redact,
          frame: editor.frame,
          cropShape: editor.cropShape,
        }),
        resize: resizeCustom
          ? { width: resizeCustom.width, height: resizeCustom.height }
          : null,
        resizeLinked,
        fillFamily,
        fillShade,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    emitReady,
    editor.crop,
    editor.transform,
    editor.adjust,
    editor.filter,
    editor.markup,
    editor.fill,
    editor.redact,
    editor.frame,
    editor.cropShape,
    resizeCustom,
    resizeLinked,
    fillFamily,
    fillShade,
  ]);

  useEffect(() => {
    if (enableResize) return;
    setResizeCustom(null);
    setActiveTool((tool) => (tool === "resize" ? "crop" : tool));
  }, [enableResize]);

  useEffect(() => {
    if (enableFill) return;
    setActiveTool((tool) => (tool === "fill" ? "crop" : tool));
    if (editor.fill.mode !== "none") editor.setFill({ mode: "none" }, false);
  }, [enableFill, editor.fill.mode, editor.setFill]);

  const fillImageInputRef = useRef<HTMLInputElement>(null);
  const stickerImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFill || editor.fill.mode !== "none") return;
    setFillFamily("white");
    setFillShade(50);
    editor.setFill({ mode: "solid", color: "#ffffff" }, false);
  }, [isFill, editor.fill.mode, editor.setFill]);

  useEffect(() => {
    if (!resizeLinked) return;
    if (nativeOutput.width < 1 || nativeOutput.height < 1) return;
    setResizeCustom((prev) => {
      if (!prev) return prev;
      if (resizeAxisRef.current === "height") {
        const width = clampResizePx(
          Math.round((prev.height * nativeOutput.width) / nativeOutput.height),
        );
        return width === prev.width ? prev : { width, height: prev.height };
      }
      const height = clampResizePx(
        Math.round((prev.width * nativeOutput.height) / nativeOutput.width),
      );
      return height === prev.height ? prev : { width: prev.width, height };
    });
  }, [nativeOutput.width, nativeOutput.height, resizeLinked]);

  const commitResizeWidth = (width: number) => {
    resizeAxisRef.current = "width";
    const nextWidth = clampResizePx(width);
    setResizeCustom((prev) => {
      const baseHeight = prev?.height || nativeOutput.height || 1;
      if (!resizeLinked || nativeOutput.width < 1 || nativeOutput.height < 1) {
        return { width: nextWidth, height: Math.max(1, baseHeight) };
      }
      return {
        width: nextWidth,
        height: clampResizePx(
          Math.round((nextWidth * nativeOutput.height) / nativeOutput.width),
        ),
      };
    });
  };

  const commitResizeHeight = (height: number) => {
    resizeAxisRef.current = "height";
    const nextHeight = clampResizePx(height);
    setResizeCustom((prev) => {
      const baseWidth = prev?.width || nativeOutput.width || 1;
      if (!resizeLinked || nativeOutput.width < 1 || nativeOutput.height < 1) {
        return { width: Math.max(1, baseWidth), height: nextHeight };
      }
      return {
        width: clampResizePx(
          Math.round((nextHeight * nativeOutput.width) / nativeOutput.height),
        ),
        height: nextHeight,
      };
    });
  };

  const activeGuides =
    guides.includes("circle") &&
    !(aspectRatio != null && Math.abs(aspectRatio - 1) < 0.02)
      ? guides.filter((g) => g !== "circle")
      : guides;

  const commitCropShapeSelection = useCallback(
    (next: CropShapeSelection) => {
      const mw = editor.getMediaSize().width;
      const mh = editor.getMediaSize().height;
      const aspect = resolveCropShapeAspect(next, mw, mh);
      setCropShapeSelection(next);
      editor.setCropShape(
        {
          shape: next.shape,
          orientation: next.orientation,
          aspect,
        },
        editor.crop,
      );
    },
    [editor],
  );

  const handleCropOrientation = useCallback(
    (orientation: CropShapeOrientation) => {
      if (activeCropShape.orientation == null) return;
      const mw = editor.getMediaSize().width;
      const mh = editor.getMediaSize().height;
      commitCropShapeSelection(
        applyCropOrientation(activeCropShape, orientation, mw, mh),
      );
    },
    [activeCropShape, commitCropShapeSelection, editor],
  );

  const handleCropShapeId = useCallback(
    (shape: CropShapeId) => {
      const mw = editor.getMediaSize().width;
      const mh = editor.getMediaSize().height;
      commitCropShapeSelection(
        applyCropShapeId(activeCropShape, shape, mw, mh),
      );
    },
    [activeCropShape, commitCropShapeSelection, editor],
  );

  useEffect(() => {
    if (activeTool !== "crop") setCropShapeOpen(false);
    resetHoldFade();
    if (activeTool !== "annotate") setStickerSheetOpen(false);
    setHoveredBadgeLabel(null);
  }, [activeTool, resetHoldFade]);

  useEffect(() => {
    if (!mobileViewport || committedMode !== "scale") return;
    setCommittedMode("rotation");
    setHighlightMode("rotation");
  }, [mobileViewport, committedMode]);

  useEffect(() => {
    if (!open) return;
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        event.preventDefault();
        setPastedSource(file);
        return;
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const markupPlane = useMemo(() => {
    const frame = editor.cropFrameSize;
    const media = editor.getMediaSize();
    if (!frame || media.width < 1 || media.height < 1) return null;
    return markupPlaneFromCrop(
      frame.width,
      frame.height,
      media.width,
      media.height,
      editor.crop,
      editor.transform,
      config.cropOutsideImage,
    );
  }, [
    editor.cropFrameSize,
    editor.crop,
    editor.transform,
    editor.getMediaSize,
    config.cropOutsideImage,
  ]);

  const placeOnPhoto = useCallback(
    (w: number, h: number) => {
      const base =
        liveMarkup.space === "image" || !markupPlane
          ? liveMarkup
          : migrateFrameMarkupToImage(liveMarkup, markupPlane);
      if (!markupPlane) {
        return { base, x: 0.5 - w / 2, y: 0.5 - h / 2, w, h };
      }
      const focus = framePointToImage(0.5, 0.5, markupPlane);
      const pw = (w * markupPlane.frameW) / markupPlane.imgW;
      const ph = (h * markupPlane.frameH) / markupPlane.imgH;
      return { base, x: focus.x - pw / 2, y: focus.y - ph / 2, w: pw, h: ph };
    },
    [liveMarkup, markupPlane],
  );

  const placeStickerFromSheet = useCallback(
    (pick: StickerPick) => {
      const id = `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const isKaomoji = pick.style === "kaomoji";
      const h = isKaomoji ? 0.12 : 0.2;
      const w = isKaomoji
        ? Math.min(0.72, 0.12 + pick.emoji.length * 0.018)
        : 0.2;
      const box = placeOnPhoto(w, h);
      const sticker: MarkupSticker = {
        kind: "sticker",
        id,
        emoji: pick.emoji,
        style: pick.style,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        rotation: 0,
      };
      if (pick.style === "emoji") void preloadStickerEmoji(pick.emoji);
      handleMarkupCommit({ objects: [...box.base.objects, sticker], space: "image" });
      setMarkupTool("sticker");
      setMarkupSelectedIds([id]);
      setStickerSheetOpen(false);
      setMarkupSignaturePadOpen(false);
    },
    [handleMarkupCommit, placeOnPhoto],
  );

  const placeImageSticker = useCallback(
    (image: string, pixelW: number, pixelH: number) => {
      const id = `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const aspect = pixelW / Math.max(1, pixelH);
      const max = 0.42;
      const w = aspect >= 1 ? max : max * aspect;
      const h = aspect >= 1 ? max / aspect : max;
      const box = placeOnPhoto(w, h);
      const sticker: MarkupSticker = {
        kind: "sticker",
        id,
        emoji: "",
        style: "image",
        image,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        rotation: 0,
      };
      handleMarkupCommit({ objects: [...box.base.objects, sticker], space: "image" });
      setMarkupTool("sticker");
      setMarkupSelectedIds([id]);
      setStickerSheetOpen(false);
      setMarkupSignaturePadOpen(false);
    },
    [handleMarkupCommit, placeOnPhoto],
  );

  const isPerspectiveMode = (m: RulerMode) =>
    m === "horizontal" || m === "vertical";

  const resolveMode = (m: RulerMode): RulerMode => {
    if (isPerspectiveMode(m) && showPerspective) return m;
    if (m === "scale" && showScale) return "scale";
    if (showRotation) return "rotation";
    if (showScale) return "scale";
    return showPerspective ? "vertical" : "rotation";
  };

  const activeMode = resolveMode(committedMode);

  useEffect(() => {
    if (activeMode !== "rotation") setRotationInteracting(false);
  }, [activeMode]);

  const scaleValue = zoomToScaleValue(
    editor.crop.zoom,
    zoomRange.min,
    zoomRange.max,
  );
  const perspectiveXUi = perspectiveToUi(editor.transform.perspectiveX);
  const perspectiveYUi = perspectiveToUi(editor.transform.perspectiveY);
  const perspectiveAxis: "x" | "y" = activeMode === "horizontal" ? "x" : "y";
  const perspectiveUiValue =
    activeMode === "horizontal" ? perspectiveXUi : perspectiveYUi;

  const adjustUiValues = Object.fromEntries(
    adjustChannels.map((channel) => [
      channel,
      adjustToUi(editor.adjust[channel]),
    ]),
  ) as Record<AdjustChannel, number>;
  const adjustLabels = Object.fromEntries(
    adjustChannels.map((channel) => [
      channel,
      labels[channel] ?? defaultAdjustLabels[channel],
    ]),
  ) as Record<AdjustChannel, string>;
  const activeAdjustChannel = committedAdjust;
  const activeAdjustUi = adjustUiValues[activeAdjustChannel];

  useEffect(() => {
    const rotation = editor.transform.angle ?? 0;
    setParkedCrop((prev) => {
      let next = prev;
      const pairs: Array<[RulerMode, number]> = [
        ["rotation", rotation],
        ["scale", scaleValue],
        ["vertical", perspectiveYUi],
        ["horizontal", perspectiveXUi],
      ];
      for (const [mode, live] of pairs) {
        if (next[mode] != null && !isParkedZero(live)) {
          next = withoutParked(next, mode);
        }
      }
      return next;
    });
  }, [editor.transform.angle, scaleValue, perspectiveXUi, perspectiveYUi]);

  useEffect(() => {
    setParkedAdjust((prev) => {
      let next = prev;
      for (const channel of adjustChannels) {
        if (
          next[channel] != null &&
          !isParkedZero(adjustToUi(editor.adjust[channel]))
        ) {
          next = withoutParked(next, channel);
        }
      }
      return next;
    });
  }, [editor.adjust]);

  const modeLabels: Record<RulerMode, string> = {
    rotation: labels.rotation ?? "Rotation",
    scale: labels.scale ?? "Scale",
    horizontal: labels.horizontal ?? "Horizontal",
    vertical: labels.vertical ?? "Vertical",
  };

  const filterLabels = Object.fromEntries(
    filterIds.map((id) => [
      id,
      labels.filters?.[id] ?? defaultFilterLabels[id],
    ]),
  ) as Record<FilterId, string>;
  /**
   * Crop, Calibrate, and Filter float their labels over the preview instead of
   * reserving a caption row under the strip — that row is what the enlarged
   * preview reclaims.
   */
  const showFillColorPill = showFillBottomBar && editor.fill.mode === "solid";
  const derivedFillLabel = fillSwatchLabel(fillFamily);
  const [liveFillLabel, setLiveFillLabel] = useState<string | null>(null);
  const showBadgeLabelPill =
    showCropBottomBar ||
    showCalibrateBottomBar ||
    showFilterBottomBar ||
    showFillColorPill;
  const badgePillId = showCalibrateBottomBar
    ? "calibrate"
    : showFilterBottomBar
      ? "filter"
      : showFillColorPill
        ? "fill"
        : "crop";
  const selectedBadgeLabel = showCalibrateBottomBar
    ? adjustLabels[highlightAdjust]
    : showFilterBottomBar
      ? filterLabels[highlightFilter]
      : showFillColorPill
        ? (liveFillLabel ?? derivedFillLabel)
        : modeLabels[resolveMode(highlightMode)];
  const badgeLabelText = hoveredBadgeLabel ?? selectedBadgeLabel;

  const filterIntensityUi = intensityToUi(editor.filter.intensity);
  const filterThumbnails = useFilterThumbnails({
    enabled: isFilter,
    image: editor.loaded,
    crop: editor.crop,
    transform: editor.transform,
    adjust: editor.adjust,
    aspectRatio,
    frameWidth: editor.cropFrameSize?.width ?? 0,
    frameHeight: editor.cropFrameSize?.height ?? 0,
    cropOutsideImage: config.cropOutsideImage,
  });

  const dismissExportResult = useCallback(() => {
    setExportResult((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (exportResult?.url) URL.revokeObjectURL(exportResult.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    try {
      setExporting(true);
      const { maxWidth, maxHeight, quality, ...fullExportOptions } =
        config.exportOptions;
      const fullBlob = await editor.exportEdited(
        aspectRatio,
        fullExportOptions,
      );
      const blob =
        enableResize && resizeCustom
          ? await resizeBlob(
              fullBlob,
              resizeCustom.width,
              resizeCustom.height,
              quality ?? 0.92,
            )
          : fullBlob;
      if (
        (exportView === "preview" && showExportPreview) ||
        exportView === "result"
      ) {
        setExportResult((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return {
            url: URL.createObjectURL(blob),
            mimeType: blob.type || "image/jpeg",
          };
        });
      }
      const uploadBlob =
        maxWidth || maxHeight
          ? await downscaleBlob(blob, maxWidth, maxHeight, quality ?? 0.92)
          : blob;
      await onExport(uploadBlob);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!isMarkup) {
      setColorPickerOpen(false);
      setColorEyedropActive(false);
    }
  }, [isMarkup]);

  useEffect(() => {
    if (isFill) return;
    if (fillPickerDirtyRef.current) {
      editor.setFill(
        { mode: "solid", color: fillPickerColorRef.current },
        true,
      );
      fillPickerDirtyRef.current = false;
    }
    setFillColorPickerOpen(false);
    setFillEyedropActive(false);
  }, [isFill, editor]);

  useEffect(() => {
    if (!open) setFullscreen(false);
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 480px)");
    const leaveOnNarrow = () => {
      if (query.matches) setFullscreen(false);
    };
    query.addEventListener("change", leaveOnNarrow);
    return () => query.removeEventListener("change", leaveOnNarrow);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  const toggleFullscreen = useCallback(() => {
    if (window.matchMedia("(max-width: 480px)").matches) return;
    setFullscreen((on) => !on);
  }, []);

  const inline = presentation === "inline";
  const showPreview =
    exportView === "preview" && showExportPreview && Boolean(exportResult);
  const showResult = exportView === "result" && Boolean(exportResult);
  const inlineHost = useInlineHost(
    inline ? container : undefined,
    Boolean(open || showPreview),
    !fullscreen,
  );
  const resultHost = useMountHost(
    exportView === "result" ? exportResultContainer : undefined,
    showResult,
  );

  const prevThemeRef = useRef(theme);
  const [themeInstant, setThemeInstant] = useState(false);

  useLayoutEffect(() => {
    if (prevThemeRef.current === theme) return;
    prevThemeRef.current = theme;
    setThemeInstant(true);
  }, [theme]);

  useEffect(() => {
    if (!themeInstant) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setThemeInstant(false));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [themeInstant]);

  const resultNode =
    showResult && exportResult ? (
      <ExportPageResult
        url={exportResult.url}
        mimeType={exportResult.mimeType}
        theme={theme}
        brandColor={brandColor}
        downloadLabel={labels.download ?? "Download"}
        closeLabel={labels.close ?? "Close"}
        onClose={dismissExportResult}
      />
    ) : null;

  if (!open && !showPreview && !showResult) return null;

  const tree = (
    <>
      {open && (
        <div
          ref={rootRef}
          data-ie-root
          data-ie-fullscreen={fullscreen ? "true" : undefined}
          data-ie-presentation={inline ? "inline" : "modal"}
          data-ie-theme={theme}
          data-ie-brand-bg={
            brandColor?.trim() && brandColorAffectsBackground
              ? "true"
              : undefined
          }
          data-ie-theme-instant={themeInstant ? "true" : undefined}
          data-ie-skin="default"
          data-ie-layout={config.layout}
          data-ie-preset={config.preset}
          data-ie-crop-faded={chromeFade.faded ? "true" : undefined}
          data-ie-markup-mode={isMarkup ? "true" : undefined}
          data-ie-markup-fade={markupFade !== "idle" ? markupFade : undefined}
          data-ie-eyedrop={colorEyedropActive ? "true" : undefined}
          data-ie-chrome-fade-kind={
            chromeFade.faded && chromeFade.kind ? chromeFade.kind : undefined
          }
          className={parts.root}
          style={rootThemeStyle}
        >
          <div
            data-ie-part="backdrop"
            className={parts.backdrop}
            onClick={(e) => e.target === e.currentTarget && onCancel()}
          >
            <div
              data-ie-part="panel"
              className={parts.panel}
              onClick={(e) => e.stopPropagation()}
            >
              {features.sidebar && (
                <aside
                  data-ie-part="sidebar"
                  data-ie-crop-fade=""
                  className={parts.sidebar}
                >
                  <div data-ie-part="sidebar-logo" onClick={handleReset}>
                    <Logo />
                  </div>

                  {features.sidebarTools && (
                    <EditorSidebarTools
                      tools={sidebarTools}
                      activeId={activeTool}
                      buttonClassName={parts.sidebarButton}
                      renderIcon={(id) => (
                        <SidebarToolIcon id={id as SidebarToolId} />
                      )}
                      onSelect={(id) => {
                        const toolId = id as SidebarToolId;

                        if (markupFade !== "idle") return;

                        if (toolId === activeTool) {
                          if (toolId === "crop" && features.cropShape) {
                            setCropShapeOpen((open) => !open);
                          }
                          return;
                        }

                        if (toolId === "annotate") {
                          requestMarkupEnter(activeTool);
                          return;
                        }

                        if (activeTool === "annotate") {
                          requestMarkupLeave(true, toolId);
                          return;
                        }

                        applySidebarTool(activeTool, toolId);
                      }}
                    />
                  )}
                  <button
                    type="button"
                    data-ie-part="sidebar-fullscreen"
                    data-ie-active={fullscreen ? "true" : undefined}
                    aria-label={
                      fullscreen
                        ? (labels.exitFullscreen ?? "Exit full screen")
                        : (labels.fullscreen ?? "Full screen")
                    }
                    aria-pressed={fullscreen}
                    onClick={toggleFullscreen}
                  >
                    {fullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
                  </button>
                </aside>
              )}

              <div data-ie-part="main" className="ie-main">
                {features.topBar && (
                  <header
                    data-ie-part="topbar"
                    data-ie-crop-fade=""
                    className={parts.topbar}
                  >
                    <button
                      type="button"
                      data-ie-part="button"
                      data-ie-action="cancel"
                      className={parts.button}
                      onClick={() => {
                        if (isMarkup) {
                          requestMarkupLeave(
                            false,
                            markupSession?.returnTool ?? "crop",
                          );
                          return;
                        }
                        onCancel();
                      }}
                      disabled={isMarkup && markupFade !== "idle"}
                      aria-label={labels.cancel}
                    >
                      <span className="ie-topbar-label">{labels.cancel}</span>
                      <IconClose />
                    </button>

                    <div className="ie-topbar-center">
                      {features.undoRedo && (
                        <>
                          <button
                            type="button"
                            data-ie-part="button"
                            data-ie-action="undo"
                            className={parts.button}
                            disabled={!markupCanUndo}
                            onClick={handleMarkupUndo}
                            title={labels.undo}
                          >
                            <IconUndo />
                          </button>
                          <button
                            type="button"
                            data-ie-part="button"
                            data-ie-action="redo"
                            className={parts.button}
                            disabled={!markupCanRedo}
                            onClick={handleMarkupRedo}
                            title={labels.redo}
                          >
                            <IconRedo />
                          </button>
                        </>
                      )}
                      {features.resetButton !== false && !isMarkup && (
                        <button
                          type="button"
                          data-ie-part="button"
                          data-ie-action="reset"
                          className={parts.button}
                          onClick={handleReset}
                          title={labels.reset}
                          aria-label={labels.reset}
                        >
                          <IconReset />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      data-ie-part="done-button"
                      className={parts.doneButton}
                      onClick={() => {
                        if (isMarkup) {
                          requestMarkupLeave(
                            true,
                            markupSession?.returnTool ?? "crop",
                          );
                          return;
                        }
                        void handleSave();
                      }}
                      disabled={
                        isMarkup
                          ? markupFade !== "idle" ||
                            editor.loading ||
                            !!editor.error
                          : exporting || editor.loading || !!editor.error
                      }
                      aria-label={labels.save}
                    >
                      <span className="ie-topbar-label">{labels.save}</span>
                      <IconCheck />
                    </button>
                  </header>
                )}

                <ModePresence
                  show={showPresetPicker && Boolean(onPresetChange)}
                  collapse
                >
                  {onPresetChange ? (
                    <EditorPresetPicker
                      theme={theme}
                      brandColor={brandColor}
                      value={resolvedPreset}
                      onChange={onPresetChange}
                      config={resolvedPresetPicker}
                    />
                  ) : null}
                </ModePresence>

                <div data-ie-part="workspace" className={parts.workspace}>
                  {(editor.loading || stickerBusy) && (
                    <div
                      data-ie-part="loading"
                      className="ie-loader-overlay"
                      aria-label={labels.loading}
                    >
                      <div className="ie-loader" />
                    </div>
                  )}

                  {editor.error && (
                    <div data-ie-part="loading" data-ie-variant="error">
                      {editor.error}
                    </div>
                  )}

                  {!editor.loading &&
                    !editor.error &&
                    previewUrl &&
                    editor.loaded && (
                      <>
                        <ModeChromeSlot id={subToolbarId}>
                          {showCropFloatingTools ? (
                            <div
                              data-ie-part="sub-toolbar"
                              className={parts.subToolbar}
                            >
                              <div
                                className="ie-subtool-group"
                                data-ie-align="start"
                              >
                                {features.rotateLeft && (
                                  <button
                                    type="button"
                                    className="ie-subtool"
                                    onClick={(event) => {
                                      const button = event.currentTarget;
                                      button.classList.remove(
                                        "ie-subtool-tapped",
                                      );
                                      void button.offsetWidth;
                                      button.classList.add("ie-subtool-tapped");
                                      window.setTimeout(() => {
                                        button.classList.remove(
                                          "ie-subtool-tapped",
                                        );
                                      }, 220);

                                      editor.rotate(-90);
                                    }}
                                    title={labels.rotateLeft}
                                    aria-label={labels.rotateLeft}
                                  >
                                    <IconRotateLeft />
                                  </button>
                                )}
                                {features.flipHorizontal && (
                                  <button
                                    type="button"
                                    className="ie-subtool"
                                    onClick={(event) => {
                                      const button = event.currentTarget;
                                      button.classList.remove(
                                        "ie-subtool-tapped",
                                      );
                                      void button.offsetWidth;
                                      button.classList.add("ie-subtool-tapped");

                                      window.setTimeout(() => {
                                        button.classList.remove(
                                          "ie-subtool-tapped",
                                        );
                                      }, 360);

                                      editor.flip("x");
                                    }}
                                    title={labels.flipHorizontal}
                                    aria-label={labels.flipHorizontal}
                                  >
                                    <IconFlipH />
                                  </button>
                                )}
                                {features.flipVertical && (
                                  <button
                                    type="button"
                                    className="ie-subtool"
                                    onClick={(event) => {
                                      const button = event.currentTarget;
                                      button.classList.remove(
                                        "ie-subtool-tapped",
                                      );
                                      void button.offsetWidth;
                                      button.classList.add("ie-subtool-tapped");

                                      window.setTimeout(() => {
                                        button.classList.remove(
                                          "ie-subtool-tapped",
                                        );
                                      }, 360);

                                      editor.flip("y");
                                    }}
                                    title={labels.flipVertical}
                                    aria-label={labels.flipVertical}
                                  >
                                    <IconFlipV />
                                  </button>
                                )}
                              </div>
                              {(features.cropShape ||
                                (showPresetPicker && onPresetChange)) && (
                                <div
                                  className="ie-subtool-group"
                                  data-ie-align="end"
                                >
                                  {features.cropShape && (
                                    <button
                                      type="button"
                                      className="ie-subtool"
                                      data-active={
                                        cropShapeOpen ? "true" : undefined
                                      }
                                      onClick={(event) => {
                                        const button = event.currentTarget;
                                        button.classList.remove(
                                          "ie-subtool-tapped",
                                        );
                                        void button.offsetWidth;
                                        button.classList.add(
                                          "ie-subtool-tapped",
                                        );

                                        window.setTimeout(() => {
                                          button.classList.remove(
                                            "ie-subtool-tapped",
                                          );
                                        }, 360);

                                        setCropShapeOpen((v) => !v);
                                      }}
                                      title={labels.cropShape}
                                      aria-label={labels.cropShape}
                                      aria-pressed={cropShapeOpen}
                                    >
                                      <IconCropShape />
                                    </button>
                                  )}
                                  {showPresetPicker && onPresetChange ? (
                                    <EditorPresetPicker
                                      theme={theme}
                                      brandColor={brandColor}
                                      value={resolvedPreset}
                                      onChange={onPresetChange}
                                      config={resolvedPresetPicker}
                                      variant="toolbar"
                                    />
                                  ) : null}
                                </div>
                              )}
                            </div>
                          ) : null}

                          {showRedactFloatingTools ? (
                            <div
                              data-ie-part="sub-toolbar"
                              className={parts.subToolbar}
                            >
                              <div
                                className="ie-redact-draw-mode"
                                role="tablist"
                                aria-label="Selection method"
                              >
                                <button
                                  type="button"
                                  role="tab"
                                  className="ie-redact-draw-mode-btn"
                                  data-ie-active={
                                    redactDrawMode === "rect"
                                      ? "true"
                                      : undefined
                                  }
                                  aria-selected={redactDrawMode === "rect"}
                                  onClick={() => {
                                    setRedactInteractMode("draw");
                                    setRedactDrawMode("rect");
                                  }}
                                >
                                  {IconRedactRectangle ? (
                                    <IconRedactRectangle />
                                  ) : (
                                    "Rectangle"
                                  )}
                                </button>
                                <button
                                  type="button"
                                  role="tab"
                                  className="ie-redact-draw-mode-btn"
                                  data-ie-active={
                                    redactDrawMode === "brush"
                                      ? "true"
                                      : undefined
                                  }
                                  aria-selected={redactDrawMode === "brush"}
                                  onClick={() => {
                                    setRedactInteractMode("draw");
                                    setRedactDrawMode("brush");
                                  }}
                                >
                                  {IconRedactBrush ? (
                                    <IconRedactBrush />
                                  ) : (
                                    "Brush"
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {showFillFloatingTools ? (
                            <div
                              data-ie-part="sub-toolbar"
                              className={parts.subToolbar}
                            >
                              <div
                                className="ie-redact-draw-mode"
                                role="tablist"
                                aria-label={labels.tools?.fill ?? "Fill"}
                              >
                                <button
                                  type="button"
                                  role="tab"
                                  className="ie-redact-draw-mode-btn"
                                  data-ie-active={
                                    editor.fill.mode === "solid"
                                      ? "true"
                                      : undefined
                                  }
                                  aria-selected={editor.fill.mode === "solid"}
                                  aria-label={
                                    labels.fillModes?.solid ?? "Color"
                                  }
                                  onClick={() => {
                                    if (editor.fill.mode !== "solid") {
                                      editor.setFill({ mode: "solid" });
                                    }
                                  }}
                                >
                                  <IconFillColor />
                                </button>
                                <button
                                  type="button"
                                  role="tab"
                                  className="ie-redact-draw-mode-btn"
                                  data-ie-active={
                                    editor.fill.mode === "edge-blur"
                                      ? "true"
                                      : undefined
                                  }
                                  aria-selected={
                                    editor.fill.mode === "edge-blur"
                                  }
                                  aria-label={
                                    labels.fillModes?.edgeBlur ?? "Blur"
                                  }
                                  onClick={() => {
                                    if (editor.fill.mode !== "edge-blur") {
                                      editor.setFill({
                                        mode: "edge-blur",
                                        blur: editor.fill.blur ?? 0.55,
                                      });
                                    }
                                  }}
                                >
                                  <IconFillBlur />
                                </button>
                                <button
                                  type="button"
                                  role="tab"
                                  className="ie-redact-draw-mode-btn"
                                  data-ie-active={
                                    editor.fill.mode === "image"
                                      ? "true"
                                      : undefined
                                  }
                                  aria-selected={editor.fill.mode === "image"}
                                  aria-label={
                                    labels.fillModes?.image ?? "Image"
                                  }
                                  onClick={() => {
                                    if (editor.fill.mode !== "image") {
                                      editor.setFill({ mode: "image" });
                                    }
                                    fillImageInputRef.current?.click();
                                  }}
                                >
                                  <IconFillImage />
                                </button>
                              </div>
                              <input
                                ref={fillImageInputRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = "";
                                  if (!file) return;
                                  void readFillImage(file).then(
                                    async (image) => {
                                      if (!image) return;
                                      await ensureFillImage(image);
                                      editor.setFill({ mode: "image", image });
                                    },
                                  );
                                }}
                              />
                            </div>
                          ) : null}
                        </ModeChromeSlot>

                        <div
                          data-ie-part="viewport-area"
                          className="ie-viewport-area"
                        >
                          <CropViewport
                            imageUrl={previewUrl}
                            loadedImage={editor.loaded}
                            mediaWidth={mediaSize.width}
                            mediaHeight={mediaSize.height}
                            crop={editor.crop}
                            transform={editor.transform}
                            adjust={editor.adjust}
                            filter={editor.filter}
                            calibrateMode={isPreviewTool}
                            previewToolId={
                              isPreviewTool ? activeTool : undefined
                            }
                            markupActive={isMarkup}
                            redactActive={isRedact}
                            fill={
                              enableFill
                                ? editor.fill
                                : { mode: "none", color: "#ffffff" }
                            }
                            editorFrame={editor.frame}
                            redact={editor.redact}
                            redactStyle={redactStyle}
                            redactInteractMode={redactInteractMode}
                            redactSelectedId={redactSelectedId}
                            redactBrushWidth={redactBrushWidth}
                            redactStrength={redactStrength}
                            redactDrawMode={redactDrawMode}
                            onRedactCommit={editor.commitRedact}
                            onRedactSelectedChange={setRedactSelectedId}
                            markup={liveMarkup}
                            markupTool={markupTool}
                            markupEraserMode={markupEraserMode}
                            markupColor={markupColor}
                            markupStrokeWidth={markupStrokeWidth}
                            markupStrokeOpacity={markupStrokeOpacity}
                            markupShapeKind={markupShapeKind}
                            markupTextAlign={markupTextAlign}
                            markupRuler={markupRuler}
                            markupSelectedIds={markupSelectedIds}
                            markupSignatureTemplate={markupSignatureTemplate}
                            shapeBadgeLabels={{
                              color: labels.markup?.color ?? "Color",
                              border: labels.markup?.border ?? "Border",
                              opacity: labels.markup?.opacity ?? "Opacity",
                              duplicate:
                                labels.markup?.duplicate ?? "Duplicate",
                              trash: labels.markup?.trash ?? "Delete",
                              noFill: labels.markup?.noFill ?? "No Fill",
                              noStroke: labels.markup?.noStroke ?? "No Stroke",
                              colorPicker:
                                labels.markup?.colorPicker ?? "Color picker",
                            }}
                            textBadgeLabels={{
                              color: labels.markup?.color ?? "Color",
                              typography:
                                labels.markup?.typography ?? "Text style",
                              bold: labels.markup?.bold ?? "Bold",
                              italic: labels.markup?.italic ?? "Italic",
                              underline:
                                labels.markup?.underline ?? "Underline",
                              strikethrough:
                                labels.markup?.strikethrough ?? "Strikethrough",
                              fontDefault:
                                labels.markup?.fontDefault ?? "Default",
                              fontFamily: labels.markup?.fontFamily ?? "Font",
                              decreaseFontSize:
                                labels.markup?.decreaseFontSize ??
                                "Decrease text size",
                              increaseFontSize:
                                labels.markup?.increaseFontSize ??
                                "Increase text size",
                              alignLeft:
                                labels.markup?.alignLeft ?? "Align left",
                              alignCenter:
                                labels.markup?.alignCenter ?? "Align center",
                              alignRight:
                                labels.markup?.alignRight ?? "Align right",
                              alignJustify:
                                labels.markup?.alignJustify ?? "Justify",
                              duplicate:
                                labels.markup?.duplicate ?? "Duplicate",
                              trash: labels.markup?.trash ?? "Delete",
                              colorPicker:
                                labels.markup?.colorPicker ?? "Color picker",
                            }}
                            markupFonts={fonts}
                            placeRequest={
                              placeRequestKind
                                ? {
                                    kind: placeRequestKind,
                                    key: placeRequestKey,
                                  }
                                : null
                            }
                            eyedropActive={
                              (isMarkup && colorEyedropActive) ||
                              (isFill && fillEyedropActive)
                            }
                            onEyedropColor={(color) => {
                              if (isFill) {
                                fillPickerColorRef.current = color;
                                fillPickerDirtyRef.current = true;
                                setFillPickerColor(color);
                                setLiveFillLabel(color.toUpperCase());
                                editor.setFill(
                                  { mode: "solid", color },
                                  false,
                                );
                                return;
                              }
                              setMarkupColor(color);
                            }}
                            onEyedropEnd={() => {
                              if (fillEyedropActive) {
                                if (fillPickerDirtyRef.current) {
                                  editor.setFill(
                                    {
                                      mode: "solid",
                                      color: fillPickerColorRef.current,
                                    },
                                    true,
                                  );
                                  fillPickerDirtyRef.current = false;
                                }
                                setFillEyedropActive(false);
                                return;
                              }
                              setColorEyedropActive(false);
                            }}
                            onMarkupRulerChange={setMarkupRuler}
                            onMarkupSelectedIdsChange={setMarkupSelectedIds}
                            onMarkupCommit={handleMarkupCommit}
                            onMarkupAdopt={(next) => {
                              const session = markupSessionRef.current;
                              if (session) {
                                const updated = {
                                  ...session,
                                  present: next,
                                  baseline: next,
                                };
                                markupSessionRef.current = updated;
                                setMarkupSession(updated);
                                return;
                              }
                              editor.setMarkup(next, false);
                            }}
                            compareResetKey={
                              isCalibrate
                                ? `calibrate:${highlightAdjust}`
                                : isFilter
                                  ? `filter:${highlightFilter}`
                                  : isMarkup
                                    ? "markup"
                                    : isFill
                                      ? `fill:${editor.fill.mode}`
                                      : isRedact
                                        ? `redact:${redactStyle}`
                                        : isFrame
                                          ? `frame:${editor.frame.preset}`
                                          : isResize
                                            ? "resize"
                                            : undefined
                            }
                            compareOriginalLabel={
                              labels.compareOriginal ??
                              labels.filters?.original ??
                              defaultFilterLabels.original
                            }
                            aspectRatio={aspectRatio}
                            freeform={freeform}
                            guides={activeGuides}
                            interactionMode={config.interactionMode}
                            cropOutsideImage={config.cropOutsideImage}
                            minZoom={config.minZoom}
                            maxZoom={config.maxZoom}
                            showHandles={features.cornerHandles}
                            showGrid
                            rotationInteracting={rotationInteracting}
                            frameScale={frameScale}
                            onFrameScaleChange={setFrameScale}
                            onFrameSizeChange={editor.setCropFrameSize}
                            onCropChange={editor.patchCropLive}
                            onCropCommit={editor.commitCrop}
                            chromeHoldFadeFocus={activeMode}
                            onChromeHoldFadeBegin={
                              !isPreviewTool
                                ? beginViewportChromeHoldFade
                                : undefined
                            }
                            onChromeHoldFadeEnd={
                              !isPreviewTool ? endHoldFade : undefined
                            }
                            onMarkupChromeHoldFadeBegin={
                              isMarkup ? beginViewportChromeHoldFade : undefined
                            }
                            onMarkupChromeHoldFadeEnd={
                              isMarkup ? endHoldFade : undefined
                            }
                            onRedactChromeHoldFadeBegin={
                              isRedact
                                ? beginSelectiveChromeHoldFade
                                : undefined
                            }
                            onRedactChromeHoldFadeEnd={
                              isRedact ? endHoldFade : undefined
                            }
                            onZoomBoundsChange={handleZoomBoundsChange}
                            cropFitNonce={cropFitNonce}
                            onCropFitArmed={applyCropFit}
                            modeTransitionNonce={modeTransitionNonce}
                            modeTransitionTarget={modeTransitionTarget}
                            onModeTransitionArmed={applyModeTransition}
                            viewportRef={editor.setViewportRef}
                            viewportWidth={editor.viewportSize.width}
                            viewportHeight={editor.viewportSize.height}
                            classNames={{
                              viewport: parts.viewport,
                              canvas: parts.canvas,
                              cropOverlay: parts.cropOverlay,
                              cropGuide: parts.cropGuide,
                            }}
                          />
                        </div>

                        <ModePresence
                          show={showBadgeLabelPill}
                          collapse
                          className="ie-mode-label-pill"
                          data-ie-part="mode-label"
                          data-ie-crop-fade={
                            isFilter || showFillColorPill ? undefined : ""
                          }
                          data-ie-filter-label={isFilter ? "true" : undefined}
                          data-ie-fill-label={
                            showFillColorPill ? "true" : undefined
                          }
                          aria-hidden
                        >
                          <ModeLabelFade
                            id={badgePillId}
                            text={badgeLabelText}
                          />
                        </ModePresence>

                        <ModeChromeSlot id={chromeId} lockBottomBarHeight>
                          {showCropShapePanel && (
                            <div
                              data-ie-part="bottom-bar"
                              data-ie-tool="crop-shape"
                              className={parts.bottomBar}
                            >
                              <EditorCropShapePanel
                                selection={activeCropShape}
                                referenceOrientation={initialCropOrientation(
                                  mediaSize.width,
                                  mediaSize.height,
                                )}
                                onOrientationChange={handleCropOrientation}
                                onShapeChange={handleCropShapeId}
                                verticalLabel={
                                  labels.vertical ?? defaultLabels.vertical
                                }
                                horizontalLabel={
                                  labels.horizontal ?? defaultLabels.horizontal
                                }
                                orientationAriaLabel={
                                  labels.orientation ??
                                  defaultLabels.orientation
                                }
                                cropShapeAriaLabel={
                                  labels.cropShape ?? defaultLabels.cropShape
                                }
                                shapeLabels={labels.cropShapes}
                              />
                            </div>
                          )}

                          {showCropBottomBar && (
                            <div
                              data-ie-part="bottom-bar"
                              data-ie-tool="crop"
                              className={parts.bottomBar}
                            >
                              <EditorModeStrip
                                showRotation={showRotation}
                                showScale={showScaleOnStrip}
                                showPerspective={showPerspective}
                                highlightMode={resolveMode(highlightMode)}
                                committedMode={activeMode}
                                rotationValue={editor.transform.angle ?? 0}
                                scaleValue={scaleValue}
                                perspectiveYValue={perspectiveYUi}
                                perspectiveXValue={perspectiveXUi}
                                rotationLabel={labels.rotation ?? "Rotation"}
                                scaleLabel={labels.scale ?? "Scale"}
                                horizontalLabel={
                                  labels.horizontal ?? "Horizontal"
                                }
                                verticalLabel={labels.vertical ?? "Vertical"}
                                onHighlightChange={setHighlightMode}
                                onCommitMode={setCommittedMode}
                                parkedValues={parkedCrop}
                                onResetMode={(mode) => {
                                  const live =
                                    mode === "rotation"
                                      ? (editor.transform.angle ?? 0)
                                      : mode === "scale"
                                        ? scaleValue
                                        : mode === "vertical"
                                          ? perspectiveYUi
                                          : perspectiveXUi;
                                  const { stored, apply } = parkToggle(
                                    live,
                                    parkedCrop[mode],
                                  );
                                  if (apply == null) return;
                                  setParkedCrop((prev) =>
                                    stored == null
                                      ? withoutParked(prev, mode)
                                      : { ...prev, [mode]: stored },
                                  );
                                  if (mode === "rotation")
                                    editor.setAngle(apply, true);
                                  else if (mode === "scale") {
                                    editor.commitCrop({
                                      ...editor.crop,
                                      zoom: scaleValueToZoom(
                                        apply,
                                        zoomRange.min,
                                        zoomRange.max,
                                      ),
                                    });
                                  } else if (mode === "vertical")
                                    editor.setPerspective(
                                      "y",
                                      uiToPerspective(apply),
                                      true,
                                    );
                                  else
                                    editor.setPerspective(
                                      "x",
                                      uiToPerspective(apply),
                                      true,
                                    );
                                }}
                                onHoverModeChange={(mode) =>
                                  setHoveredBadgeLabel(
                                    mode ? modeLabels[mode] : null,
                                  )
                                }
                                ringColors={activeRingColors}
                                chromeFadeFocus={chromeFadeFocus}
                              />

                              <RulerSwitchFade id={activeMode}>
                                {activeMode === "rotation" && showRotation && (
                                  <RotationRuler
                                    key="rotation-ruler"
                                    value={editor.transform.angle ?? 0}
                                    parked={parkedCrop.rotation != null}
                                    onChange={(angle) =>
                                      editor.setAngle(angle, false)
                                    }
                                    onCommit={(angle) =>
                                      editor.setAngle(angle, true)
                                    }
                                    animateTicks={animateTicks}
                                    tickWidth={tickWidth}
                                    majorTickWidth={resolvedMajorTickWidth}
                                    negativeColor={negativeColor}
                                    positiveColor={positiveColor}
                                    showBadge={false}
                                    imageRotation={editor.transform.rotation}
                                    alignSnap
                                    showAlignIndicators
                                    ariaLabel={
                                      labels.rotation ?? defaultLabels.rotation
                                    }
                                    chromeHoldFadeEnabled
                                    chromeHoldFadeFocus="rotation"
                                    rulerFocusActive={
                                      chromeFadeFocus === "rotation"
                                    }
                                    onChromeHoldFadeBegin={
                                      beginRulerChromeHoldFade
                                    }
                                    onChromeHoldFadeEnd={endHoldFade}
                                    onInteractChange={setRotationInteracting}
                                  />
                                )}

                                {activeMode === "scale" && showScaleOnStrip && (
                                  <RotationRuler
                                    key="scale-ruler"
                                    value={scaleValue}
                                    parked={parkedCrop.scale != null}
                                    min={0}
                                    max={100}
                                    majorEvery={10}
                                    formatValue={(v) => String(Math.round(v))}
                                    onChange={(v) => {
                                      const zoom = scaleValueToZoom(
                                        v,
                                        zoomRange.min,
                                        zoomRange.max,
                                      );
                                      editor.patchCropLive({
                                        ...editor.crop,
                                        zoom,
                                      });
                                    }}
                                    onCommit={(v) => {
                                      const zoom = scaleValueToZoom(
                                        v,
                                        zoomRange.min,
                                        zoomRange.max,
                                      );
                                      editor.commitCrop({
                                        ...editor.crop,
                                        zoom,
                                      });
                                    }}
                                    alignSnap={false}
                                    showAlignIndicators
                                    animateTicks={animateTicks}
                                    tickWidth={tickWidth}
                                    majorTickWidth={resolvedMajorTickWidth}
                                    negativeColor={negativeColor}
                                    positiveColor={positiveColor}
                                    showBadge={false}
                                    ariaLabel={
                                      labels.scale ?? defaultLabels.scale
                                    }
                                    chromeHoldFadeEnabled
                                    chromeHoldFadeFocus="scale"
                                    rulerFocusActive={
                                      chromeFadeFocus === "scale"
                                    }
                                    onChromeHoldFadeBegin={
                                      beginRulerChromeHoldFade
                                    }
                                    onChromeHoldFadeEnd={endHoldFade}
                                  />
                                )}

                                {isPerspectiveMode(activeMode) &&
                                  showPerspective && (
                                    <RotationRuler
                                      key={`perspective-${perspectiveAxis}`}
                                      value={perspectiveUiValue}
                                      parked={
                                        activeMode === "horizontal"
                                          ? parkedCrop.horizontal != null
                                          : parkedCrop.vertical != null
                                      }
                                      min={-100}
                                      max={100}
                                      majorEvery={10}
                                      formatValue={(v) => String(Math.round(v))}
                                      onChange={(v) =>
                                        editor.setPerspective(
                                          perspectiveAxis,
                                          uiToPerspective(v),
                                          false,
                                        )
                                      }
                                      onCommit={(v) =>
                                        editor.setPerspective(
                                          perspectiveAxis,
                                          uiToPerspective(v),
                                          true,
                                        )
                                      }
                                      alignSnap
                                      showAlignIndicators
                                      animateTicks={animateTicks}
                                      tickWidth={tickWidth}
                                      majorTickWidth={resolvedMajorTickWidth}
                                      negativeColor={negativeColor}
                                      positiveColor={positiveColor}
                                      showBadge={false}
                                      chromeHoldFadeEnabled
                                      chromeHoldFadeFocus={activeMode}
                                      rulerFocusActive={
                                        chromeFadeFocus === activeMode
                                      }
                                      onChromeHoldFadeBegin={
                                        beginRulerChromeHoldFade
                                      }
                                      onChromeHoldFadeEnd={endHoldFade}
                                    />
                                  )}
                              </RulerSwitchFade>
                            </div>
                          )}

                          {showCalibrateBottomBar && (
                            <div
                              data-ie-part="bottom-bar"
                              data-ie-tool="calibrate"
                              className={parts.bottomBar}
                            >
                              <EditorCalibrateStrip
                                highlightChannel={highlightAdjust}
                                values={adjustUiValues}
                                labels={adjustLabels}
                                onHighlightChange={setHighlightAdjust}
                                onCommitChannel={setCommittedAdjust}
                                parkedValues={parkedAdjust}
                                onResetChannel={(channel) => {
                                  const live = adjustUiValues[channel];
                                  const { stored, apply } = parkToggle(
                                    live,
                                    parkedAdjust[channel],
                                  );
                                  if (apply == null) return;
                                  setParkedAdjust((prev) =>
                                    stored == null
                                      ? withoutParked(prev, channel)
                                      : { ...prev, [channel]: stored },
                                  );
                                  editor.setAdjustChannel(
                                    channel,
                                    uiToAdjust(apply),
                                    true,
                                  );
                                }}
                                onHoverChannelChange={(channel) =>
                                  setHoveredBadgeLabel(
                                    channel ? adjustLabels[channel] : null,
                                  )
                                }
                                ringColors={activeRingColors}
                                chromeFadeFocus={chromeFadeFocus}
                              />
                              <RulerSwitchFade id={activeAdjustChannel}>
                                <RotationRuler
                                  key={`calibrate-${activeAdjustChannel}`}
                                  value={activeAdjustUi}
                                  parked={
                                    parkedAdjust[activeAdjustChannel] != null
                                  }
                                  min={-100}
                                  max={100}
                                  majorEvery={10}
                                  formatValue={(v) => String(Math.round(v))}
                                  onChange={(v) =>
                                    editor.setAdjustChannel(
                                      activeAdjustChannel,
                                      uiToAdjust(v),
                                      false,
                                    )
                                  }
                                  onCommit={(v) =>
                                    editor.setAdjustChannel(
                                      activeAdjustChannel,
                                      uiToAdjust(v),
                                      true,
                                    )
                                  }
                                  alignSnap={false}
                                  showAlignIndicators
                                  animateTicks={animateTicks}
                                  tickWidth={tickWidth}
                                  majorTickWidth={resolvedMajorTickWidth}
                                  negativeColor={negativeColor}
                                  positiveColor={positiveColor}
                                  showBadge={false}
                                  chromeHoldFadeEnabled
                                  chromeHoldFadeFocus={activeAdjustChannel}
                                  rulerFocusActive={
                                    chromeFadeFocus === activeAdjustChannel
                                  }
                                  onChromeHoldFadeBegin={
                                    beginRulerChromeHoldFade
                                  }
                                  onChromeHoldFadeEnd={endHoldFade}
                                />
                              </RulerSwitchFade>
                            </div>
                          )}

                          {showFilterBottomBar && (
                            <div
                              data-ie-part="bottom-bar"
                              data-ie-tool="filter"
                              className={parts.bottomBar}
                            >
                              <EditorFilterStrip
                                highlightId={highlightFilter}
                                labels={filterLabels}
                                thumbnails={filterThumbnails}
                                thumbAspect={
                                  editor.cropFrameSize &&
                                  editor.cropFrameSize.height > 0
                                    ? editor.cropFrameSize.width /
                                      editor.cropFrameSize.height
                                    : 1
                                }
                                chromeFadeFocus={chromeFadeFocus}
                                onChromeHoldFadeBegin={
                                  beginSelectiveChromeHoldFade
                                }
                                onChromeHoldFadeEnd={endHoldFade}
                                onHighlightChange={(id) => {
                                  setHighlightFilter(id);
                                  editor.setFilterId(id, false);
                                }}
                                onCommitFilter={(id) => {
                                  setHighlightFilter(id);
                                  editor.setFilterId(id, true);
                                }}
                                onResetIntensity={(id) => {
                                  setHighlightFilter(id);
                                  if (editor.filter.intensity < 1) {
                                    editor.setFilter(
                                      { id, intensity: 1 },
                                      true,
                                    );
                                  }
                                }}
                              />

                              {editor.filter.id !== "original" && (
                                <RotationRuler
                                  key="filter-intensity"
                                  value={filterIntensityUi}
                                  min={0}
                                  max={100}
                                  majorEvery={10}
                                  formatValue={(v) => String(Math.round(v))}
                                  onChange={(v) =>
                                    editor.setFilterIntensity(
                                      uiToIntensity(v),
                                      false,
                                    )
                                  }
                                  onCommit={(v) =>
                                    editor.setFilterIntensity(
                                      uiToIntensity(v),
                                      true,
                                    )
                                  }
                                  alignSnap={false}
                                  showAlignIndicators
                                  animateTicks={animateTicks}
                                  tickWidth={tickWidth}
                                  majorTickWidth={resolvedMajorTickWidth}
                                  negativeColor={negativeColor}
                                  positiveColor={positiveColor}
                                  showBadge={false}
                                  chromeHoldFadeEnabled
                                  chromeHoldFadeFocus="filter-intensity"
                                  chromeFadeAsSelective
                                  rulerFocusActive={
                                    chromeFadeFocus === "filter-intensity"
                                  }
                                  onChromeHoldFadeBegin={
                                    beginSelectiveChromeHoldFade
                                  }
                                  onChromeHoldFadeEnd={endHoldFade}
                                />
                              )}
                            </div>
                          )}

                          {showMarkupBottomBar && (
                            <div
                              data-ie-part="bottom-bar"
                              data-ie-tool="annotate"
                              className={parts.bottomBar}
                            >
                              <EditorMarkupToolbar
                                tool={markupTool}
                                eraserMode={markupEraserMode}
                                color={markupColor}
                                strokeWidth={markupStrokeWidth}
                                strokeOpacity={markupStrokeOpacity}
                                shapeKind={markupShapeKind}
                                textAlign={markupTextAlign}
                                rulerVisible={markupRuler.visible}
                                labels={markupLabels}
                                onToolChange={(t) => {
                                  setMarkupTool(t);
                                  if (t === "text") {
                                    setPlaceRequestKind("text");
                                    setPlaceRequestKey((k) => k + 1);
                                  }
                                  if (
                                    t !== "lasso" &&
                                    t !== "shape" &&
                                    t !== "text" &&
                                    t !== "sticker"
                                  ) {
                                    setMarkupSelectedIds([]);
                                  }
                                  if (t === "signature") {
                                    setMarkupSignaturePadOpen(true);
                                    setStickerSheetOpen(false);
                                    setColorPickerOpen(false);
                                  } else if (t === "sticker") {
                                    setMarkupSignaturePadOpen(false);
                                    setStickerSheetOpen(true);
                                    setColorPickerOpen(false);
                                  } else {
                                    setMarkupSignaturePadOpen(false);
                                    setStickerSheetOpen(false);
                                  }
                                }}
                                onOpenStickerSheet={() => {
                                  setMarkupSignaturePadOpen(false);
                                  setColorPickerOpen(false);
                                  setStickerSheetOpen(true);
                                }}
                                onOpenColorPicker={() => {
                                  setColorEyedropActive(false);
                                  setMarkupSignaturePadOpen(false);
                                  setStickerSheetOpen(false);
                                  setColorPickerOpen(true);
                                }}
                                onAddLoupe={() => {
                                  setMarkupTool("move");
                                  setMarkupSignaturePadOpen(false);
                                  setStickerSheetOpen(false);
                                  setColorPickerOpen(false);
                                  setPlaceRequestKind("loupe");
                                  setPlaceRequestKey((k) => k + 1);
                                }}
                                onAddImage={() =>
                                  stickerImageInputRef.current?.click()
                                }
                                onEraserModeChange={setMarkupEraserMode}
                                onColorChange={setMarkupColor}
                                onStrokeWidthChange={setMarkupStrokeWidth}
                                onStrokeOpacityChange={setMarkupStrokeOpacity}
                                onShapeKindChange={(kind) => {
                                  setMarkupShapeKind(kind);
                                  setPlaceRequestKind("shape");
                                  setPlaceRequestKey((k) => k + 1);
                                }}
                                onTextAlignChange={setMarkupTextAlign}
                                onToggleRuler={() =>
                                  setMarkupRuler((r) => ({
                                    ...r,
                                    visible: !r.visible,
                                  }))
                                }
                              />
                              <input
                                ref={stickerImageInputRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = "";
                                  if (!file) return;
                                  setStickerBusy(true);
                                  void readStickerImage(file)
                                    .then((image) => {
                                      if (!image) return;
                                      placeImageSticker(
                                        image.url,
                                        image.width,
                                        image.height,
                                      );
                                    })
                                    .finally(() => setStickerBusy(false));
                                }}
                              />
                            </div>
                          )}

                          {showRedactBottomBar && (
                            <div
                              data-ie-part="bottom-bar"
                              data-ie-tool="redact"
                              className={parts.bottomBar}
                            >
                              <EditorRedactToolbar
                                style={redactStyle}
                                interactMode={redactInteractMode}
                                drawMode={redactDrawMode}
                                brushWidth={redactBrushWidth}
                                strength={redactStrength}
                                chromeFadeFocus={chromeFadeFocus}
                                onChromeHoldFadeBegin={
                                  beginSelectiveChromeHoldFade
                                }
                                onChromeHoldFadeEnd={endHoldFade}
                                labels={{
                                  move: redactLabels.move ?? "Move",
                                  pixelate: redactLabels.pixelate ?? "Pixelate",
                                  blur: redactLabels.blur ?? "Blur",
                                  solid: redactLabels.solid ?? "Solid",
                                  delete: redactLabels.delete ?? "Delete",
                                  brushSize:
                                    redactLabels.brushSize ?? "Brush size",
                                  blockSize: redactLabels.blockSize ?? "Blocks",
                                  blurStrength:
                                    redactLabels.blurStrength ?? "Blur",
                                }}
                                hasSelection={Boolean(redactSelectedId)}
                                onStyleChange={setRedactStyle}
                                onInteractModeChange={setRedactInteractMode}
                                onBrushWidthChange={setRedactBrushWidth}
                                onStrengthChange={(v) => {
                                  setRedactStrength(v);
                                  if (!redactSelectedId) return;
                                  editor.commitRedact({
                                    regions: editor.redact.regions.map((r) =>
                                      r.id === redactSelectedId
                                        ? { ...r, strength: v }
                                        : r,
                                    ),
                                  });
                                }}
                                onDeleteSelected={() => {
                                  if (!redactSelectedId) return;
                                  editor.commitRedact({
                                    regions: editor.redact.regions.filter(
                                      (r) => r.id !== redactSelectedId,
                                    ),
                                  });
                                  setRedactSelectedId(null);
                                }}
                              />
                            </div>
                          )}

                          {showFillBottomBar && (
                            <div
                              data-ie-part="bottom-bar"
                              data-ie-tool="fill"
                              className={parts.bottomBar}
                            >
                              <EditorFillStrip
                                mode={editor.fill.mode}
                                family={fillFamily}
                                shade={fillShade}
                                blur={editor.fill.blur ?? 0.55}
                                labels={{
                                  color: labels.fillModes?.color ?? "Color",
                                  blur: labels.fillModes?.edgeBlur ?? "Blur",
                                  addColor:
                                    labels.fillModes?.addColor ??
                                    "Custom color",
                                }}
                                onHighlight={setLiveFillLabel}
                                onSelectFamily={(name, commit) => {
                                  setFillFamily(name);
                                  setLiveFillLabel(fillSwatchLabel(name));
                                  if (fillSwatchHasRuler(name)) setFillShade(50);
                                  editor.setFill(
                                    {
                                      mode: "solid",
                                      color: fillSwatchColor(name, 50),
                                    },
                                    commit,
                                  );
                                }}
                                onResetShade={() => {
                                  if (!fillSwatchHasRuler(fillFamily)) return;
                                  setFillShade(50);
                                  setLiveFillLabel(fillSwatchLabel(fillFamily));
                                  editor.setFill(
                                    {
                                      mode: "solid",
                                      color: fillSwatchColor(fillFamily, 50),
                                    },
                                    true,
                                  );
                                }}
                                onBlurAmount={(value, commit) =>
                                  editor.setFill(
                                    { mode: "edge-blur", blur: value },
                                    commit,
                                  )
                                }
                                onOpenColorPicker={() => {
                                  const color = cssColorToHex(editor.fill.color);
                                  fillPickerColorRef.current = color;
                                  fillPickerDirtyRef.current = false;
                                  setFillPickerColor(color);
                                  setFillEyedropActive(false);
                                  setFillColorPickerOpen(true);
                                }}
                                onChromeHoldFadeBegin={
                                  beginSelectiveChromeHoldFade
                                }
                                onChromeHoldFadeEnd={endHoldFade}
                              />
                              {editor.fill.mode === "solid" &&
                              !fillSwatchHasRuler(fillFamily) ? (
                                <div
                                  className="ie-fill-ruler-spacer"
                                  aria-hidden
                                />
                              ) : editor.fill.mode === "solid" &&
                                fillSwatchHasRuler(fillFamily) ? (
                                <RotationRuler
                                  key="fill-shade"
                                  value={fillShade}
                                  min={0}
                                  max={100}
                                  majorEvery={10}
                                  formatValue={(value) =>
                                    String(Math.round(value))
                                  }
                                  onChange={(value) => {
                                    setFillShade(value);
                                    setLiveFillLabel(fillSwatchLabel(fillFamily));
                                    editor.setFill(
                                      {
                                        mode: "solid",
                                        color: fillSwatchColor(fillFamily, value),
                                      },
                                      false,
                                    );
                                  }}
                                  onCommit={(value) => {
                                    setFillShade(value);
                                    editor.setFill(
                                      {
                                        mode: "solid",
                                        color: fillSwatchColor(fillFamily, value),
                                      },
                                      true,
                                    );
                                  }}
                                  alignSnap={false}
                                  showAlignIndicators={false}
                                  animateTicks={animateTicks}
                                  tickWidth={tickWidth}
                                  majorTickWidth={resolvedMajorTickWidth}
                                  negativeColor={negativeColor}
                                  positiveColor={positiveColor}
                                  showBadge={false}
                                  ariaLabel={labels.fillModes?.color ?? "Color"}
                                  chromeHoldFadeEnabled
                                  chromeHoldFadeFocus="fill-shade"
                                  chromeFadeAsSelective
                                  rulerFocusActive={
                                    chromeFadeFocus === "fill-shade"
                                  }
                                  onChromeHoldFadeBegin={
                                    beginSelectiveChromeHoldFade
                                  }
                                  onChromeHoldFadeEnd={endHoldFade}
                                />
                              ) : null}
                            </div>
                          )}

                          {showFrameBottomBar && (
                            <div
                              data-ie-part="bottom-bar"
                              data-ie-tool="frame"
                              className={parts.bottomBar}
                            >
                              <EditorFrameStrip
                                frame={editor.frame}
                                labels={frameLabels}
                                chromeFadeFocus={chromeFadeFocus}
                                onChromeHoldFadeBegin={
                                  beginSelectiveChromeHoldFade
                                }
                                onChromeHoldFadeEnd={endHoldFade}
                                onPresetChange={(id) =>
                                  editor.setFramePreset(id, true)
                                }
                                onFrameChange={(patch, commit) =>
                                  editor.setFrame(patch, commit !== false)
                                }
                              />
                            </div>
                          )}

                          {showResizeBottomBar && (
                            <div
                              data-ie-part="bottom-bar"
                              data-ie-tool="resize"
                              className={parts.bottomBar}
                            >
                              <EditorResizeStrip
                                width={
                                  resizeCustom?.width || nativeOutput.width
                                }
                                height={
                                  resizeCustom?.height || nativeOutput.height
                                }
                                linked={resizeLinked}
                                custom={resizeCustom != null}
                                labels={{
                                  width: labels.resize?.width ?? "Width",
                                  height: labels.resize?.height ?? "Height",
                                  lock:
                                    labels.resize?.lock ?? "Lock aspect ratio",
                                  unlock:
                                    labels.resize?.unlock ??
                                    "Unlock aspect ratio",
                                  reset: labels.resize?.reset ?? "Reset",
                                }}
                                onWidth={commitResizeWidth}
                                onHeight={commitResizeHeight}
                                onToggleLink={() =>
                                  setResizeLinked((linked) => !linked)
                                }
                                onReset={() => setResizeCustom(null)}
                              />
                            </div>
                          )}
                        </ModeChromeSlot>
                        {showMediaSize && (
                          <ModePresence
                            show={
                              !isPreviewTool &&
                              mediaSize.width > 0 &&
                              mediaSize.height > 0
                            }
                            className="ie-media-size"
                            data-ie-part="media-size"
                            data-ie-crop-fade=""
                            aria-hidden
                          >
                            {Math.round(mediaSize.width)}×
                            {Math.round(mediaSize.height)}
                          </ModePresence>
                        )}
                      </>
                    )}
                </div>
                <EditorStickerSheet
                  open={isMarkup && stickerSheetOpen}
                  onClose={() => setStickerSheetOpen(false)}
                  onPick={placeStickerFromSheet}
                  title={markupLabels.sticker}
                  emojiTabLabel={labels.markup?.stickerEmojiTab ?? "Emoji"}
                  kaomojiTabLabel={
                    labels.markup?.stickerKaomojiTab ?? "Kaomoji"
                  }
                  doneLabel={labels.markup?.done ?? "Done"}
                />
                <MarkupSignaturePad
                  open={
                    isMarkup &&
                    markupSignaturePadOpen &&
                    markupTool === "signature"
                  }
                  color={markupColor}
                  template={markupSignatureTemplate}
                  title={labels.markup?.signature ?? "Signature"}
                  closeLabel={labels.close ?? "Close"}
                  doneLabel={labels.markup?.done ?? "Done"}
                  onChange={setMarkupSignatureTemplate}
                  onClose={() => setMarkupSignaturePadOpen(false)}
                  onDone={() => setMarkupSignaturePadOpen(false)}
                />
              </div>
              <EditorColorPicker
                open={
                  (isMarkup && colorPickerOpen) ||
                  (isFill && fillColorPickerOpen)
                }
                color={
                  isFill && fillColorPickerOpen ? fillPickerColor : markupColor
                }
                onChange={(color) => {
                  if (isFill && fillColorPickerOpen) {
                    fillPickerColorRef.current = color;
                    fillPickerDirtyRef.current = true;
                    setFillPickerColor(color);
                    setLiveFillLabel(color.toUpperCase());
                    editor.setFill({ mode: "solid", color }, false);
                    return;
                  }
                  setMarkupColor(color);
                }}
                onClose={() => {
                  if (fillColorPickerOpen) {
                    if (fillPickerDirtyRef.current) {
                      editor.setFill(
                        { mode: "solid", color: fillPickerColorRef.current },
                        true,
                      );
                      fillPickerDirtyRef.current = false;
                    }
                    setFillColorPickerOpen(false);
                    return;
                  }
                  setColorPickerOpen(false);
                }}
                onEyedropper={() => {
                  if (fillColorPickerOpen) {
                    setFillColorPickerOpen(false);
                    setFillEyedropActive(true);
                    return;
                  }
                  setColorPickerOpen(false);
                  setColorEyedropActive(true);
                }}
                labels={{
                  title: labels.markup?.colors ?? "Colors",
                  grid: labels.markup?.colorGrid ?? "Grid",
                  spectrum: labels.markup?.colorSpectrum ?? "Spectrum",
                  sliders: labels.markup?.colorSliders ?? "Sliders",
                  close: labels.close ?? "Close",
                  eyedropper: labels.markup?.eyedropper ?? "Eyedropper",
                  hex: labels.markup?.srgbHex ?? "sRGB Hex Color #",
                  hdrBoost: labels.markup?.hdrBoost ?? "HDR Boost",
                  opacity: labels.markup?.opacity ?? "Opacity",
                  addColor: labels.markup?.addColor ?? "Add color",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showPreview && exportResult ? (
        <ExportResultPreview
          url={exportResult.url}
          mimeType={exportResult.mimeType}
          downloadLabel={labels.download ?? "Download"}
          closeLabel={labels.close ?? "Close"}
          onClose={dismissExportResult}
        />
      ) : null}
    </>
  );

  let editorNode: ReactNode = null;
  if (open || showPreview) {
    if (!inline) {
      editorNode =
        typeof document === "undefined"
          ? null
          : createPortal(tree, document.body);
    } else if (container == null) {
      editorNode = <div data-ie-inline-slot="">{tree}</div>;
    } else if (inlineHost) {
      editorNode = createPortal(tree, inlineHost);
    }
  }

  const placedResult =
    exportResultContainer == null
      ? resultNode
      : resultHost
        ? createPortal(resultNode, resultHost)
        : null;

  return (
    <>
      {editorNode}
      {placedResult}
    </>
  );
}

/** @deprecated Use `ImageEditor`. */
export const ImageEditorModal = ImageEditor;
