# Installation

```bash
npm install react-advanced-image-editor
```

That installs `react-advanced-image-editor` at the version you select and its dependency `react-advanced-image-editor-core`.

Peer dependencies, from `packages/react-advanced-image-editor/package.json`:

| Package | Range |
| --- | --- |
| `react` | `>=18` |
| `react-dom` | `>=18` |

Install those in the app if they are not already there.

```bash
npm install react react-dom
```

## Styles

The component does not inject CSS. Import the shipped sheet once:

```ts
import 'react-advanced-image-editor/styles.css';
```

The package export is `react-advanced-image-editor/styles.css`, which resolves to `dist/styles.css`.

## Packages

| Package | Install it when |
| --- | --- |
| `react-advanced-image-editor` | You want the React editor. This is the package most apps install. |
| `react-advanced-image-editor-core` | You want the headless engine without the React UI. It is already a dependency of the React package, so a second install is optional. |

Core also depends on `heic-to`, which is how HEIC/HEIF files are converted during load.

## Module format

Both packages publish ESM (`dist/index.js`) and CJS (`dist/index.cjs`) plus TypeScript declarations (`dist/index.d.ts`).

`sideEffects` on the React package is `["*.css"]`. The core package sets `sideEffects` to `false`.

## What npm publishes

`files` in each package is `["dist"]`. npm still includes `README.md`, `LICENSE`, and `package.json`. The `docs/` directory in this repository is not listed in `files`, so it is not part of the tarball unless that field changes.

Current version in both package manifests: `0.1.0`. This repository does not record a public npm release in its package metadata.
