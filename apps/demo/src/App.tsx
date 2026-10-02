import { useCallback, useEffect, useRef, useState } from "react";
import {
  ImageEditor,
  editorLocaleNames,
  editorLocales,
  editorMessages,
  type ImageEditorExportView,
  type ImageEditorLocale,
  type ImageEditorPresentation,
  type ImageEditorPreset,
} from "react-advanced-image-editor";
import "react-advanced-image-editor/styles.css";
import { siteCopy } from "./i18n/site";

const PRESETS: ImageEditorPreset[] = [
  "default",
  "selection",
  "outside",
  "profile",
];

type OptionMenuId = "placement" | "preset" | "export" | "language";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ImageEditorPreset>("default");
  const [presentation, setPresentation] =
    useState<ImageEditorPresentation>("modal");
  const [exportView, setExportView] =
    useState<ImageEditorExportView>("preview");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [locale, setLocale] = useState<ImageEditorLocale>("en");
  const [openMenu, setOpenMenu] = useState<OptionMenuId | null>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        optionsRef.current?.contains(target) ||
        langRef.current?.contains(target)
      ) {
        return;
      }
      setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const toggleMenu = (id: OptionMenuId) => {
    setOpenMenu((current) => (current === id ? null : id));
  };

  const onPick = useCallback((next: File | null) => {
    setFile(next);
    if (next) setOpen(true);
  }, []);

  const copy = siteCopy[locale];
  const presetNames = editorMessages[locale].presets;

  return (
    <div className="page" data-theme={theme}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <IconCrop />
            </span>
            <div>
              <h1>React Image Editor</h1>
              <p>{copy.tagline}</p>
            </div>
          </div>

          <div className="header-tools">
            <div className="lang" ref={langRef}>
              <OptionMenu
                className="lang-control"
                label={copy.language}
                valueLabel={editorLocaleNames[locale]}
                open={openMenu === "language"}
                onToggle={() => toggleMenu("language")}
                options={editorLocales.map((id) => ({
                  id,
                  label: editorLocaleNames[id],
                  selected: locale === id,
                  onSelect: () => {
                    setLocale(id);
                    setOpenMenu(null);
                  },
                }))}
              />
            </div>
            <button
              type="button"
              className="theme-btn"
              aria-label={
                theme === "light" ? copy.switchDark : copy.switchLight
              }
              onClick={() =>
                setTheme((t) => (t === "light" ? "dark" : "light"))
              }
            >
              {theme === "light" ? <IconMoon /> : <IconSun />}
            </button>
          </div>
        </div>
      </header>

      <main className="stage">
        <div className="hero">
          <h2>{copy.headline}</h2>
          <p>{copy.lead}</p>
        </div>

        <section className="chooser">
          <div className="options" ref={optionsRef}>
            <OptionMenu
              label={copy.placement}
              valueLabel={presentation === "modal" ? copy.modal : copy.inline}
              open={openMenu === "placement"}
              onToggle={() => toggleMenu("placement")}
              options={[
                {
                  id: "modal",
                  label: copy.modal,
                  selected: presentation === "modal",
                  onSelect: () => {
                    setPresentation("modal");
                    setOpenMenu(null);
                  },
                },
                {
                  id: "inline",
                  label: copy.inline,
                  selected: presentation === "inline",
                  onSelect: () => {
                    setPresentation("inline");
                    setOpenMenu(null);
                  },
                },
              ]}
            />
            <OptionMenu
              label={copy.preset}
              valueLabel={presetNames[preset]}
              open={openMenu === "preset"}
              onToggle={() => toggleMenu("preset")}
              options={PRESETS.map((id) => ({
                id,
                label: presetNames[id],
                selected: preset === id,
                onSelect: () => {
                  setPreset(id);
                  setOpenMenu(null);
                },
              }))}
            />
            <OptionMenu
              label={copy.afterExport}
              valueLabel={exportView === "preview" ? copy.preview : copy.onPage}
              open={openMenu === "export"}
              onToggle={() => toggleMenu("export")}
              options={[
                {
                  id: "preview",
                  label: copy.preview,
                  selected: exportView === "preview",
                  onSelect: () => {
                    setExportView("preview");
                    setOpenMenu(null);
                  },
                },
                {
                  id: "result",
                  label: copy.onPage,
                  selected: exportView === "result",
                  onSelect: () => {
                    setExportView("result");
                    setOpenMenu(null);
                  },
                },
              ]}
            />
          </div>
          <div className="chooser-main">
            <span className="chooser-icon" aria-hidden>
              <IconFramePlus />
            </span>
            <div className="chooser-copy">
              <h3>{copy.addPhoto}</h3>
              <p>{copy.fileHint}</p>
              {file ? (
                <p className="file-meta">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </p>
              ) : null}
            </div>
            <div className="chooser-actions">
              <label className="select-image">
                <input
                  type="file"
                  accept="image/*,.heic,.heif,image/heic,image/heif"
                  onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                />
                <IconUpload />
                {copy.chooseImage}
              </label>
              {file ? (
                <button
                  type="button"
                  className="reopen"
                  onClick={() => setOpen(true)}
                >
                  {copy.reopen}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <ImageEditor
        open={open}
        presentation={presentation}
        container={presentation === "inline" ? ".stage" : undefined}
        exportView={exportView}
        exportResultContainer=".stage"
        src={file}
        preset={preset}
        theme={theme}
        locale={locale}
        title="Edit photo"
        onPresetChange={setPreset}
        presetPicker={{
          options: PRESETS,
        }}
        onExport={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />

      <footer className="foot">
        <div className="foot-inner">
          <p>
            {copy.builtBy}{" "}
            <a
              className="foot-author"
              href="https://github.com/metin1331"
              target="_blank"
              rel="noreferrer"
            >
              @metin1331
            </a>
          </p>
          <p>{copy.footerBlurb}</p>
        </div>
      </footer>
    </div>
  );
}

function OptionMenu({
  className,
  label,
  valueLabel,
  open,
  onToggle,
  options,
}: {
  className?: string;
  label: string;
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
  options: {
    id: string;
    label: string;
    selected: boolean;
    onSelect: () => void;
  }[];
}) {
  return (
    <div
      className={className ? `option-control ${className}` : "option-control"}
    >
      <div
        className="option-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{valueLabel}</span>
        <IconChevron />
      </div>
      {open ? (
        <div className="option-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.selected}
              onClick={option.onSelect}
            >
              <span>{option.label}</span>
              {option.selected ? <IconMenuCheck /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9.5 12 15.5 18 9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMenuCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5 9.2 17 19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCrop() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconFramePlus() {
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
      <path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16" />
      <path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2" />
      <circle cx="13" cy="7" r="1" fill="currentColor" />
      <rect x="8" y="2" width="14" height="14" rx="2" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </svg>
  );
}

function IconUpload() {
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
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m16 12-4-4-4 4" />
      <path d="M12 16V8" />
    </svg>
  );
}
