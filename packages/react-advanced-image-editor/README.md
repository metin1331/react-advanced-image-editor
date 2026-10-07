# React Advanced Image Editor

React component that loads a photo, edits it, and returns a `Blob` from Done.

[![version](https://img.shields.io/badge/version-0.1.0-blue)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![react](https://img.shields.io/badge/react-%3E%3D18-61dafb)](./package.json)

A modern, responsive image editor with cropping, straightening, color adjustments, filters, drawing, redaction, and frames. Supports multilingual interfaces, light and dark themes, undo/redo, and seamless use across desktop and mobile—as a modal or inline on the page.

Live demo: [react-advanced-image-editor.vercel.app](https://react-advanced-image-editor.vercel.app/)

![demo](https://github.com/metin1331/react-advanced-image-editor/raw/main/packages/react-advanced-image-editor/demo.gif)

![demo mobile](https://github.com/metin1331/react-advanced-image-editor/raw/main/packages/react-advanced-image-editor/demo-mobile.jpeg)

## Features

- Crop with pan, handles, aspect ratio, guides, rotation, scale, and perspective
- Calibrate (14 adjust channels, WebGL preview)
- Filters: original, vivid, dramatic, mono, and the warm/cool variants in `FILTER_IDS`
- Markup: pen, marker, pencil, eraser, lasso, ruler, text, shapes, stickers, signature
- Redact (`pixelate`, `blur`, `solid`) and frame presets
- Undo, redo, reset
- JPEG, PNG, or WebP export, with optional `maxWidth` / `maxHeight`
- Multilingual UI. Pass `labels` with your own strings and the editor uses that language
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
  locale="es"
  exportOptions={{ format: 'image/webp', quality: 0.85, maxWidth: 1600 }}
  onExport={(blob) => upload(blob)}
  onCancel={() => setOpen(false)}
/>
```

`src` accepts `File`, `Blob`, a URL string, `HTMLImageElement`, or `HTMLCanvasElement`. HEIC and HEIF are converted in the core loader.

After Done, `exportView="preview"` (the default) shows a floating card. `exportView="result"` shows an in-flow block instead. `showExportPreview={false}` hides the card. It has no effect when `exportView` is `"result"`.

`ImageEditorModal` is a deprecated alias of `ImageEditor`.

## API overview

Every `ImageEditor` prop. Defaults are the ones in the component, not older comments on the type.

| Prop | Values | Required | Default |
| --- | --- | --- | --- |
| `open` | `boolean` | yes | — |
| `src` | `File`, `Blob`, URL `string`, `HTMLImageElement`, `HTMLCanvasElement`, or `null` | yes | — |
| `onExport` | `(blob: Blob) => void \| Promise<void>` | yes | — |
| `onCancel` | `() => void`. Cancel and backdrop click. Does not set `open`. | yes | — |
| `presentation` | `'modal'` \| `'inline'`. Modal portals to `document.body`. Inline fills `container`, or this component's place in the tree. | no | `'modal'` |
| `container` | CSS selector, `HTMLElement`, or `{ current: HTMLElement \| null }` | no | — |
| `preset` | `'default'` \| `'selection'` \| `'outside'` \| `'profile'` | no | `'default'` |
| `features` | `Partial<ImageEditorFeatures>`. Each key is a `boolean` that shows or hides chrome: `sidebar`, `sidebarTools`, `resetButton`, `topBar`, `undoRedo`, `subToolbar`, `rotateLeft`, `flipHorizontal`, `flipVertical`, `cropShape`, `bottomBar`, `rotationTab`, `scaleTab`, `perspectiveTab`, `cornerHandles`. | no | preset |
| `title` | `string`. On the props type. The component does not read it. | no | — |
| `crop` | `{ aspectRatio?: number \| null; guides?: ('circle' \| 'rect')[] }` | no | preset |
| `exportOptions` | `{ format?: 'image/jpeg' \| 'image/png' \| 'image/webp'; quality?: number; maxWidth?: number; maxHeight?: number; cropOutsideImage?: boolean }` | no | preset |
| `cropOutsideImage` | `boolean`. Also copied into export when `exportOptions.cropOutsideImage` is omitted. | no | preset |
| `interactionMode` | `'pan'` \| `'selection'` | no | `'pan'` |
| `layout` | `'full'` \| `'compact'` \| `'minimal'` | no | preset |
| `className` | `string` on the root | no | — |
| `classNames` | Extra classes per slot: `root`, `backdrop`, `panel`, `sidebar`, `sidebarButton`, `topbar`, `workspace`, `subToolbar`, `viewport`, `canvas`, `cropOverlay`, `cropGuide`, `bottomBar`, `button`, `doneButton`. `header`, `title`, `toolbar`, `footer`, `buttonActive`, and `presetPicker` are on the type and are not read. | no | `{}` |
| `unstyled` | `boolean`. `true` drops the `ie-modal-root` class. The stylesheet is unchanged. | no | `false` |
| `labels` | `Partial<ImageEditorLabels>`. Your own UI strings, merged on top of `locale`. Pass a full set to attach another language. | no | locale catalog |
| `onPresetChange` | `(preset) => void`. When set, Crop is active, and more than one picker option exists, the preset bar is shown. | no | — |
| `presetPicker` | `{ options?: ImageEditorPreset[]; presetLabels?: Partial<Record<ImageEditorPreset, string>>; label?: string }`. `position`, `onPositionChange`, and `positionStorageKey` are ignored. | no | — |
| `animateTicks` | `boolean`. Tick-height animation on the rotation ruler while dragging. | no | `true` |
| `tickWidth` | `number`. Minor ruler tick width in px. | no | `2.2` |
| `majorTickWidth` | `number`. Major ruler tick width in px. | no | `2.2` |
| `negativeColor` | CSS color. Ruler when the value is `<= 0`. | no | `--ie-ruler-negative` |
| `positiveColor` | CSS color. Ruler when the value is `> 0`. | no | `--ie-accent` |
| `modeRingColors` | `Partial<ModeRingColors>`. Track and progress colors for the mode rings. | no | CSS tokens |
| `darkModeRingColors` | `Partial<ModeRingColors>`. Used when `theme` is `'dark'`. | no | `modeRingColors` |
| `theme` | `'light'` \| `'dark'` | no | `'light'` |
| `locale` | Built-in catalog used as the base before `labels`. | no | `'en'` |
| `colors` | `Partial<ImageEditorThemeColors>`. Light `--ie-*` overrides. | no | — |
| `darkColors` | `Partial<ImageEditorThemeColors>`. Dark `--ie-*` overrides. | no | — |
| `brandColor` | CSS color. Sets `--ie-brand` when the string is non-empty. | no | — |
| `brandColorAffectsBackground` | `boolean`. With a non-empty `brandColor`, tints topbar, chrome-slot, and viewport-area backgrounds. | no | `false` |
| `showExportPreview` | `boolean`. Floating card after Done. Ignored when `exportView` is `'result'`. | no | `true` |
| `exportView` | `'preview'` \| `'result'`. `'preview'` is the floating card. `'result'` is an in-flow block instead of that card. | no | `'preview'` |
| `exportResultContainer` | Same shape as `container`. Mount point for the result block. | no | — |
| `initialZoom` | `number`. Opening zoom relative to cover, clamped to the preset min and max. | no | `1` |
| `fonts` | `{ id: string; label: string; family: string }[]`. Extra markup text fonts. | no | — |
| `showMediaSize` | `boolean`. Original pixel size in the crop chrome. | no | `true` |

Presets: `default`, `selection`, `outside`, `profile`. All four use `interactionMode: 'pan'`. `outside` allows crop outside the image and exports PNG. `profile` locks aspect `1`, draws a circle guide, and turns the crop-shape control off. It does not set a max output size.

`colors` gives you full control over individual color tokens, while `brandColor` provides a simpler way to apply your brand color across the editor. See [Theming](#theming) for the difference. For feature-flag defaults, available color keys, and the core export list, see [docs/api.md](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/api.md).

## Styling

Override tokens on `[data-ie-root]`, or pass `colors` / `darkColors`. The modal is portaled to `document.body`, so variables on a page wrapper do not inherit.

```css
[data-ie-root] {
  --ie-accent: #0f6e56;
}
```

Inline hosts read `--ie-inline-padding` and `--ie-inline-radius` (both default `0`). Slot hooks use `data-ie-part`. Details: [docs/styling.md](https://github.com/metin1331/react-advanced-image-editor/blob/main/packages/react-advanced-image-editor/docs/styling.md).

## Theming

`theme="light" | "dark"` switches the built-in light and dark sets.

`colors` and `darkColors` are for a custom palette. You name the piece and pass the exact color. `colors.accent = "#0f6e56"` makes the accent that green. `colors` applies in light theme. `darkColors` applies in dark theme. Anything you omit stays on the built-in value.

`brandColor` is one color, usually your product color. You do not list accent, sidebar, and border separately. The editor keeps its own colors and stirs yours in: accent, the Done button, and progress pick up about 32%; sidebar, borders, and similar surfaces pick up about 8%. Text, the crop border, and the grid are left alone. Omit `brandColor` and the editor looks as it shipped.

If a token is set in `colors` or `darkColors`, that exact value wins over the `brandColor` mix.

`brandColorAffectsBackground` defaults to `false`. The top bar, the bottom chrome, and the area around the photo stay `#ffffff` in light and `#050404` in dark. Set it to `true` when those panels should take about 8% of `brandColor` as well.

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
