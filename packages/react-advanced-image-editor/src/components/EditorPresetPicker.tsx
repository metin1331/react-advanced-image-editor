import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_PRESET_PICKER_OPTIONS,
  defaultPresetLabels,
  type ImageEditorPreset,
  type PresetPickerConfig,
} from "../types";

type Props = {
  value: ImageEditorPreset;
  onChange: (preset: ImageEditorPreset) => void;
  config?: PresetPickerConfig;
  /** Compact icon trigger used in the crop sub-toolbar (≤480px). */
  variant?: "bar" | "toolbar";
  theme?: "light" | "dark";
};

function IconPresetMenu() {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1" />
      <circle cx="19" cy="5" r="1" />
      <circle cx="5" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
      <circle cx="19" cy="19" r="1" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  );
}

/** One-shot scale pulse on the icon only — keeps menus / native selects stable. */
function runSubtoolTapEffect(element: HTMLElement) {
  element.classList.remove("ie-subtool-tapped");
  void element.offsetWidth;
  element.classList.add("ie-subtool-tapped");
  window.setTimeout(() => {
    element.classList.remove("ie-subtool-tapped");
  }, 360);
}

function useMinWidth(minWidth: number) {
  const query = `(min-width: ${minWidth}px)`;
  const [matches, setMatches] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function EditorPresetPicker({
  value,
  onChange,
  config = {},
  variant = "bar",
  theme,
}: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const desktopTriggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
    maxHeight: number;
  } | null>(null);
  const isDesktop = useMinWidth(769);
  const options: ReadonlyArray<ImageEditorPreset> =
    config.options ?? DEFAULT_PRESET_PICKER_OPTIONS;
  const presetLabels = { ...defaultPresetLabels, ...config.presetLabels };
  const groupLabel = config.label ?? "Preset";
  const useDesktopMenu = variant === "toolbar" && isDesktop;

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleDesktopTriggerClick = useCallback(() => {
    setMenuOpen((open) => !open);
    requestAnimationFrame(() => {
      const icon = iconRef.current;
      if (icon) runSubtoolTapEffect(icon);
    });
  }, []);

  const handleSelectFocus = useCallback(() => {
    if (!useDesktopMenu) setMenuOpen(true);
  }, [useDesktopMenu]);

  const handleSelectBlur = useCallback(() => {
    if (!useDesktopMenu) closeMenu();
  }, [closeMenu, useDesktopMenu]);

  const handleSelectChange = useCallback(
    (next: ImageEditorPreset) => {
      onChange(next);
      closeMenu();
    },
    [onChange, closeMenu],
  );

  useEffect(() => {
    if (useDesktopMenu) return;
    closeMenu();
  }, [useDesktopMenu, closeMenu]);

  useLayoutEffect(() => {
    if (!menuOpen || !useDesktopMenu) {
      setMenuPos(null);
      return;
    }

    const update = () => {
      const btn = desktopTriggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const gap = 6;
      const estimated = menuRef.current?.offsetHeight ?? options.length * 36 + 8;
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openDown =
        spaceBelow >= Math.min(estimated, 120) || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(96, openDown ? spaceBelow : spaceAbove);
      const top = openDown
        ? rect.bottom + gap
        : rect.top - gap - Math.min(estimated, maxHeight);

      setMenuPos({
        top: Math.max(8, top),
        left: rect.left + rect.width / 2,
        minWidth: Math.max(rect.width, 168),
        maxHeight,
      });
    };

    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [menuOpen, useDesktopMenu, options.length]);

  useEffect(() => {
    if (!menuOpen || !useDesktopMenu) return;

    const onDocPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, useDesktopMenu, closeMenu]);

  const portalRoot =
    typeof document !== "undefined" ? document.body : null;

  return (
    <div
      data-ie-part="preset-picker"
      data-ie-variant={variant}
      className={
        variant === "toolbar"
          ? "ie-preset-picker ie-preset-picker--toolbar"
          : "ie-preset-picker"
      }
    >
      {variant === "bar" ? (
        <div
          className="ie-preset-picker-options"
          role="radiogroup"
          aria-label={groupLabel}
        >
          {options.map((key) => {
            const active = value === key;

            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                data-ie-active={active ? "true" : undefined}
                className="ie-preset-option"
                onClick={() => onChange(key)}
              >
                {presetLabels[key]}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        ref={triggerRef}
        className="ie-preset-picker-select ie-subtool"
        data-active={menuOpen ? "true" : undefined}
        data-ie-menu={useDesktopMenu ? "custom" : "native"}
      >
        {useDesktopMenu ? (
          <button
            ref={desktopTriggerRef}
            type="button"
            className="ie-preset-picker-trigger"
            aria-label={groupLabel}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={handleDesktopTriggerClick}
          >
            <span ref={iconRef} className="ie-preset-picker-select-icon">
              <IconPresetMenu />
            </span>
          </button>
        ) : (
          <>
            <select
              value={value}
              aria-label={groupLabel}
              aria-expanded={menuOpen}
              onFocus={handleSelectFocus}
              onBlur={handleSelectBlur}
              onChange={(event) =>
                handleSelectChange(event.target.value as ImageEditorPreset)
              }
            >
              {options.map((key) => (
                <option key={key} value={key}>
                  {presetLabels[key]}
                </option>
              ))}
            </select>
            <span ref={iconRef} className="ie-preset-picker-select-icon">
              <IconPresetMenu />
            </span>
          </>
        )}
      </div>

      {useDesktopMenu &&
        menuOpen &&
        portalRoot &&
        createPortal(
          <div
            ref={menuRef}
            className="ie-preset-picker-menu"
            data-ie-theme={theme}
            role="listbox"
            aria-label={groupLabel}
            style={{
              visibility: menuPos ? "visible" : "hidden",
              pointerEvents: menuPos ? "auto" : "none",
              top: menuPos?.top ?? 0,
              left: menuPos?.left ?? 0,
              minWidth: menuPos?.minWidth ?? 168,
              maxHeight: menuPos?.maxHeight ?? 240,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {options.map((key) => {
              const active = value === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  className="ie-preset-picker-menu-option"
                  data-ie-active={active ? "true" : undefined}
                  aria-selected={active}
                  onClick={() => handleSelectChange(key)}
                >
                  <span className="ie-preset-picker-menu-label">
                    {presetLabels[key]}
                  </span>
                  {active ? (
                    <svg
                      className="ie-preset-picker-menu-check"
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.5 7.25 5.5 10.25 11.5 3.75"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>,
          portalRoot,
        )}
    </div>
  );
}
