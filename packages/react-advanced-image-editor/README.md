# react-advanced-image-editor

React component that loads a photo, edits it, and returns a `Blob` from Done.

[![version](https://img.shields.io/badge/version-0.1.0-blue)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![react](https://img.shields.io/badge/react-%3E%3D18-61dafb)](./package.json)

The UI is one component, `ImageEditor`. Crop, calibrate, filters, markup, redact, and frames are sidebar tools. Undo and redo are in the top bar. Light and dark token sets ship in CSS. One `brandColor` can be mixed into that chrome.

This repository has a Vite demo at `apps/demo`. It does not include screenshot files.

## Features

- Crop with pan, handles, aspect ratio, guides, rotation, scale, and perspective
- Calibrate (14 adjust channels, WebGL preview)
- Filters: original, vivid, dramatic, mono, and the warm/cool variants in `FILTER_IDS`
- Markup: pen, marker, pencil, eraser, lasso, ruler, text, shapes, stickers, signature
- Redact (`pixelate`, `blur`, `solid`) and frame presets
- Undo, redo, reset
- JPEG, PNG, or WebP export, with optional `maxWidth` / `maxHeight`
- Locales `en`, `tr`, `jp`
- Modal (portaled to `document.body`) or inline in a host element

There is no Fill tool in the sidebar. Fill APIs exist on `react-advanced-image-editor-core` only.

## Install

```bash
npm install react-advanced-image-editor
```

Peer dependencies: `react` and `react-dom` at `>=18`. The package depends on `react-advanced-image-editor-core`, which depends on `heic-to`.

```ts
import { ImageEditor } from 'react-advanced-image-editor';
import 'react-advanced-image-editor/styles.css';
```

The stylesheet is a separate export. The component does not inject it.

## Quick start

```tsx
import { useState } from 'react';
import { ImageEditor } from 'react-advanced-image-editor';
import 'react-advanced-image-editor/styles.css';

export function PhotoField() {
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <input
        type="file"
        accept="image/*,.heic,.heif"
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          setFile(next);
          setOpen(next != null);
        }}
      />
      <ImageEditor
        open={open}
        src={file}
        onExport={(blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'edited.jpg';
          a.click();
          URL.revokeObjectURL(url);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
```

`open`, `src`, `onExport`, and `onCancel` are required. `src` may be `null`. Default presentation is a modal. Default preset is `default` (JPEG quality `0.92`). Default `initialZoom` is `1`.

## Basic usage

Close the editor yourself. `onCancel` runs for Cancel and for a backdrop click. It does not set `open`.

```tsx
<ImageEditor
  open={open}
  src={file}
  presentation="inline"
  container=".stage"
  preset="profile"
  theme="dark"
  locale="tr"
  exportOptions={{ format: 'image/webp', quality: 0.85, maxWidth: 1600 }}
  onExport={(blob) => upload(blob)}
  onCancel={() => setOpen(false)}
/>
```

`src` accepts `File`, `Blob`, a URL string, `HTMLImageElement`, or `HTMLCanvasElement`. HEIC and HEIF are converted in the core loader.

After Done, `exportView="preview"` (the default) shows a floating card. `exportView="result"` shows an in-flow block instead. `showExportPreview={false}` hides the card. It has no effect when `exportView` is `"result"`.

`ImageEditorModal` is a deprecated alias of `ImageEditor`.

## API overview

| Prop | Required | Default |
| --- | --- | --- |
| `open` | yes | — |
| `src` | yes | — |
| `onExport` | yes | — |
| `onCancel` | yes | — |
| `presentation` | no | `'modal'` |
| `preset` | no | `'default'` |
| `theme` | no | `'light'` |
| `locale` | no | `'en'` |
| `initialZoom` | no | `1` |
| `exportView` | no | `'preview'` |
| `showExportPreview` | no | `true` |
| `brandColorAffectsBackground` | no | `false` |

Presets: `default`, `selection`, `outside`, `profile`. All four use `interactionMode: 'pan'`. `outside` allows crop outside the image and exports PNG. `profile` locks aspect `1`, draws a circle guide, and turns the crop-shape control off. It does not set a max output size.

`colors` and `darkColors` map to inline `--ie-*` variables. `labels` overrides strings from the locale catalog. `features` turns chrome off. The full table, callbacks, and the core export list are in [docs/api.md](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/api.md).

## Styling

Override tokens on `[data-ie-root]`, or pass `colors` / `darkColors`. The modal is portaled to `document.body`, so variables on a page wrapper do not inherit.

```css
[data-ie-root] {
  --ie-accent: #0f6e56;
}
```

Inline hosts read `--ie-inline-padding` and `--ie-inline-radius` (both default `0`). Slot hooks use `data-ie-part`. Details: [docs/styling.md](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/styling.md).

## Theming

`theme="light" | "dark"` switches `data-ie-theme`. `brandColor` sets `--ie-brand`. Accent mixes about 32% of that color. Surfaces such as `--ie-bg` and `--ie-bg-sidebar` mix about 8%. Text, crop border, and grid are not mixed.

`brandColorAffectsBackground` defaults to `false`. Topbar, chrome-slot, and viewport-area stay `#ffffff` in light and `#050404` in dark until you set it to `true`.

`data-ie-skin` is always `default`. There is no skin prop. [docs/theming.md](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/theming.md).

## TypeScript

`dist/index.d.ts` is the `types` entry. `ImageEditorProps`, presets, labels, and theme keys are exported from this package. `ImageSource` and `ExportOptions` are exported from `react-advanced-image-editor-core`.

[docs/typescript.md](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/typescript.md)

## Package structure

| Package | Role |
| --- | --- |
| `react-advanced-image-editor` | React UI. Install this. |
| `react-advanced-image-editor-core` | Headless load, history, adjust, filter, markup, redact, frame, export. Installed as a dependency. |

Both publish one ESM file and one CJS file (`dist/index.js`, `dist/index.cjs`) plus declarations. The React package also exports `./styles.css`. `sideEffects` is `["*.css"]` on the React package and `false` on core. `files` is `["dist"]`, so this `docs/` directory is not in the npm tarball. npm still packs this README, `LICENSE`, and `package.json`.

The repo root package `react-advanced-image-editor-workspace` is private.

## Browser and framework support

The component needs React 18+ and `react-dom` (`createPortal`). It is not a framework-agnostic widget. In the Next.js App Router, render it from a Client Component.

The stylesheet uses `oklch()`, `color-mix(in oklch)`, and relative color syntax `rgb(from ...)`. Calibrate and filters use WebGL. There is no `browserslist` file in the repo, and this document does not claim a minimum browser version.

The loader caps the long edge at 2048px on constrained devices (`isConstrainedDevice()`: mobile WebKit user agents or `navigator.deviceMemory` of 4 or less). Otherwise the cap is 4096px. Canvas area is also kept at or below 16,777,216 pixels.

## Examples

Copy-paste samples for a minimal editor, presets, export, styling, theming, and TypeScript: [docs/examples.md](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/examples.md).

| Doc | Contents |
| --- | --- |
| [Getting started](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/getting-started.md) | Smallest editor |
| [Installation](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/installation.md) | Packages, peers, files |
| [Usage](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/usage.md) | Open, close, export, presets |
| [Features](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/features.md) | Tools |
| [API](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/api.md) | Props and exports |
| [Styling](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/styling.md) | CSS variables |
| [Theming](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/theming.md) | Light, dark, brand |
| [TypeScript](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/typescript.md) | Types |
| [Examples](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/examples.md) | Samples |
| [Troubleshooting](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/troubleshooting.md) | Common failures |
| [Migration](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/migration.md) | Aliases only. No prior release. |
| [Contributing](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/contributing.md) | Workspace scripts |

## Contributing

From the repository root: `npm install`, `npm run dev`, `npm run typecheck`, `npm run build`. Core tests: `npm test --workspace=react-advanced-image-editor-core`. See [docs/contributing.md](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/contributing.md).

## License

MIT. Copyright 2026 Metin Kuran.
