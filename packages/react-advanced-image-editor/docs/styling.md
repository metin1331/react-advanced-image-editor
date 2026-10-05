# Styling

Import the sheet once:

```ts
import 'react-advanced-image-editor/styles.css';
```

The editor root is `[data-ie-root]`. Slot hooks are `[data-ie-part="..."]`. Class slots from `classNames` are listed in [API](./api.md). `unstyled` only drops the `ie-modal-root` class. It does not stop this stylesheet from applying.

## Override order

1. Tokens in `styles.css` on `[data-ie-root]`.
2. `brandColor`, which sets inline `--ie-brand`. Mixes in the stylesheet read that variable.
3. `colors` or `darkColors`, written as inline `--ie-*` on the root. They replace a token outright, so they win over the mix.
4. Your own CSS, if it is at least as specific as the stylesheet rule you are changing. Inline custom properties from `colors` still win over a stylesheet rule for that same variable.

The modal is portaled to `document.body`. A custom property set on a page wrapper does not inherit into the editor. Set it on `[data-ie-root]`, or pass `colors` / `brandColor`.

```css
[data-ie-root] {
  --ie-accent: #0f6e56;
  --ie-radius: 12px;
}
```

```tsx
<ImageEditor
  open={open}
  src={file}
  colors={{ accent: '#0f6e56', bgSidebar: '#f4f7f6' }}
  onExport={save}
  onCancel={close}
/>
```

## Accent and text

These are not mixed with the brand color:

| Variable | Light |
| --- | --- |
| `--ie-accent-text` | `#ffffff` |
| `--ie-text` | `#1c1c1e` |
| `--ie-text-muted` | `#8e8e93` |
| `--ie-crop-border` | `#1c1c1e` |
| `--ie-crop-handle` | `#1c1c1e` |
| `--ie-grid` | `rgb(255, 255, 255)` |
| `--ie-grid-inner` | `rgba(255, 255, 255, 0.42)` |

Accent colors are mixed. With no `--ie-brand`, the mix uses the base as the second color, so the result is the base.

| Variable | Light base | Mix |
| --- | --- | --- |
| `--ie-accent` | `oklch(55.5% 0.46 16.439)` | 68% base, 32% brand |
| `--ie-accent-hover` | `oklch(48% 0.4 16.439)` | 68% / 32% |
| `--ie-accent-soft` | `oklch(88% 0.08 16.439)` | 82% / 18% |

`--ie-gold` is an alias of `--ie-accent`. `--ie-ruler-positive` follows `--ie-accent`.

## Surfaces

These also mix 92% base / 8% brand whenever `--ie-brand` is set. `brandColorAffectsBackground` does not gate them.

| Variable | Light base | Dark base |
| --- | --- | --- |
| `--ie-bg` | `#ffffff` | `#09090b` |
| `--ie-bg-muted` | `#ffffff` | `#09090b` |
| `--ie-bg-sidebar` | `#f7f7f8` | `rgba(255, 255, 255, 0.1)` |
| `--ie-border` | `rgba(0, 0, 0, 0.06)` | `rgba(255, 255, 255, 0.1)` |
| `--ie-overlay` | `rgba(255, 255, 255, 0.75)` | `rgba(0, 0, 0, 0.45)` |
| `--ie-chrome-hover` | `rgba(0, 0, 0, 0.04)` | `rgba(255, 255, 255, 0.1)` |
| `--ie-chrome-active` | `rgba(0, 0, 0, 0.04)` | `rgba(255, 255, 255, 0.1)` |

Dark text is `#f5f5f7`. Dark crop border and handle are `#f5f5f7`. Dark muted text stays `#8e8e93`.

## Sheet backgrounds

Topbar, chrome slot, and viewport area use `--ie-sheet-bg`, not `--ie-bg`.

| Variable | Light | Dark |
| --- | --- | --- |
| `--ie-sheet-bg-base` | `#ffffff` | `#050404` |
| `--ie-sheet-bg` | the base, unless `data-ie-brand-bg="true"` | same |
| `--ie-sheet-overlay` | sheet color at 75% alpha | sheet color at 45% alpha |

`data-ie-brand-bg="true"` mixes sheet base 92% with `--ie-brand` 8%. `.ie-main` and `[data-ie-part="workspace"]` also use `--ie-sheet-bg`.

## Chrome metrics

| Variable | Default |
| --- | --- |
| `--ie-font` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif` |
| `--ie-radius` | `0` |
| `--ie-sidebar-w` | `76px` |
| `--ie-blur` | `20px` |
| `--ie-ruler-negative` | `#000000` (dark: `#f5f5f7`) |
| `--ie-ruler-tick` | `rgba(0, 0, 0, 0.22)` |
| `--ie-ruler-tick-major` | `rgba(0, 0, 0, 0.52)` |
| `--ie-ruler-tick-width` | `2.5px` in CSS, then overwritten by the `tickWidth` prop (`2.2`) |
| `--ie-ruler-tick-major-width` | same pattern, `majorTickWidth` |
| `--ie-ruler-px-per-degree` | `8px` |
| `--ie-bg-markup-tray` | `#f7f7f8` |
| `--ie-inline-padding` | `0` (read from the host, not the portaled root) |
| `--ie-inline-radius` | `0` |

## Mode rings

Set on `.ie-mode-strip`, and overridable with `modeRingColors`:

| Variable | Stylesheet value |
| --- | --- |
| `--ie-mode-rotation-negative-track` | `#a9a9a9` (dark `#8d8f87`) |
| `--ie-mode-rotation-negative-progress` | `#3f3f46` (dark `#fffffe`) |
| `--ie-mode-rotation-positive-track` | `var(--ie-accent-soft)` |
| `--ie-mode-rotation-positive-progress` | `var(--ie-accent)` |
| `--ie-mode-scale-track` / `--ie-mode-scale-progress` | accent soft / accent |
| `--ie-mode-horizontal-track` / `--ie-mode-horizontal-progress` | accent soft / accent |
| `--ie-mode-vertical-track` / `--ie-mode-vertical-progress` | accent soft / accent |
| `--ie-mode-calibrate-track` / `--ie-mode-calibrate-progress` | accent soft / accent |
| `--ie-mode-calibrate-negative-track` | dark block sets `#3f3f46` |
| `--ie-mode-calibrate-negative-progress` | dark block sets `#f5f5f7` |

The JSDoc table on `ModeRingColors` lists other defaults, including `#E4E4E7` and raw `oklch(...)` stops. Those comments are not the values in `default.css`.

## Motion tokens

`default.css` defines `--ie-mode-duration` and `--ie-mode-ease`. Those are not written as inline styles, so a rule on `[data-ie-root]` can change them.

`ImageEditor` does set these as inline styles from its own constants, so a stylesheet rule does not override them:

- `--ie-crop-fade-reveal-*` and `--ie-crop-fade-hide-*`
- `--ie-markup-mode-reveal-*` and `--ie-markup-mode-hide-*`
- `--ie-chrome-panel-reveal-*` and `--ie-chrome-panel-hide-*`
- `--ie-ruler-switch-reveal-*` and `--ie-ruler-switch-hide-*`
- `--ie-mode-strip-scroll-fade-duration`, `--ie-mode-strip-scroll-fade-ease`, `--ie-mode-strip-scroll-wash`
- `--ie-ruler-tick-width` and `--ie-ruler-tick-major-width` (from `tickWidth` and `majorTickWidth`)

## classNames

```tsx
<ImageEditor
  open={open}
  src={file}
  classNames={{ doneButton: 'save-photo', sidebar: 'tool-rail' }}
  onExport={save}
  onCancel={close}
/>
```

Keys on the type: `root`, `backdrop`, `panel`, `sidebar`, `sidebarButton`, `topbar`, `workspace`, `subToolbar`, `header`, `title`, `viewport`, `canvas`, `cropOverlay`, `cropGuide`, `bottomBar`, `toolbar`, `button`, `buttonActive`, `doneButton`, `footer`, `presetPicker`.

`ImageEditor` applies `root`, `backdrop`, `panel`, `sidebar`, `sidebarButton`, `topbar`, `workspace`, `subToolbar`, `viewport`, `canvas`, `cropOverlay`, `cropGuide`, `bottomBar`, `button`, and `doneButton`. `header`, `title`, `toolbar`, `footer`, `buttonActive`, and `presetPicker` are on the type and are not read.
