# Image Editor Library — Developer Documentation

> **Maintained living doc.** Update this file whenever the image editor packages or Chatimio integration change.

**Last updated:** 2026-10-05 (site color: `brandColor`)

This file lives at `packages/react-advanced-image-editor/image-editor-library.md`.  

**License:** MIT  
**Monorepo path:** `packages/image-editor-core`, `packages/react-image-editor`

---

## Overview

Chatimio ships a custom image editor built around crop and rotate, built from scratch. It is split into:

| Package | Role |
|---------|------|
| `@chatimio/image-editor-core` | Headless engine: load, crop math, EXIF, rotate/flip, fine angle, export, undo/redo |
| `@chatimio/react-image-editor` | React UI: crop viewport, rotation ruler, modal shell, optional preset picker |

**Not used:** Pintura, react-easy-crop, exifr, or any i18n library inside the packages.

The visual UI is designed around a fixed crop frame: image pans/zooms underneath, L-shaped handles, rule-of-thirds grid, gold angle badge + tick-mark rotation ruler (−45°…+45°). The modal is only one host — consumers can embed the same components anywhere.

---

## Host shell (current)

The public component is `ImageEditor`. `ImageEditorModal` is a deprecated alias of the same component.

Packages in this repo:

| Package | Role |
|---------|------|
| `react-advanced-image-editor-core` | Headless engine |
| `react-advanced-image-editor` | React UI |

```tsx
import { ImageEditor } from 'react-advanced-image-editor';
import 'react-advanced-image-editor/styles.css';
```

### Placement

`presentation` defaults to `"modal"` (viewport overlay, portaled to `document.body`).

`"inline"` fills a host element. `container` is a CSS selector, an element, or a ref. The host needs a height; the editor fills that box and does not grow it. Omit `container` to render the editor where `<ImageEditor />` sits in the tree.

Padding and corner radius are optional and default to none. Set them on the host (they inherit into the editor):

```css
.stage {
  --ie-inline-padding: 16px;
  --ie-inline-radius: 18px;
}
```

`--ie-inline-padding` insets the editor from the host edges. `--ie-inline-radius` rounds the editor. Fullscreen ignores both and covers the page edge to edge.

```tsx
<ImageEditor
  open={open}
  src={file}
  presentation="inline"
  container=".page"
  onExport={save}
  onCancel={close}
/>
```

### Theme

`theme` is `"light"` (default) or `"dark"`. It switches the `--ie-*` token set on `[data-ie-root]` via `data-ie-theme`.

The demo page starts light. Its header icon toggles the page and passes the same value as `theme`, so the editor follows the site.

### Accent and other chrome colors

Yes. Light overrides go on `colors`, dark overrides on `darkColors`. Both are `Partial<ImageEditorThemeColors>` and map onto `--ie-*` variables. The brand accent defaults are:

| Token | Light | Dark |
|-------|-------|------|
| `--ie-accent` | `oklch(55.5% 0.46 16.439)` | `oklch(62% 0.42 16.439)` |
| `--ie-accent-hover` | `oklch(48% 0.4 16.439)` | `oklch(55.5% 0.46 16.439)` |
| `--ie-accent-soft` | `oklch(88% 0.08 16.439)` | `oklch(38% 0.12 16.439)` |

```tsx
<ImageEditor
  theme="light"
  colors={{
    accent: 'oklch(55.5% 0.46 16.439)',
    accentHover: 'oklch(48% 0.4 16.439)',
    accentSoft: 'oklch(88% 0.08 16.439)',
  }}
  darkColors={{
    accent: 'oklch(62% 0.42 16.439)',
    accentHover: 'oklch(55.5% 0.46 16.439)',
    accentSoft: 'oklch(38% 0.12 16.439)',
  }}
/>
```

The same keys exist for background, text, crop chrome, and ruler ticks (`bg`, `text`, `rulerPositive`, …). Mode-ring flats are separate: `modeRingColors` and `darkModeRingColors` (see **Mode ring colors**).

To stay close to the defaults, pass one site color as `brandColor`. It becomes `--ie-brand` and is mixed in `oklch` with the built-in bases. Omit it and each mix falls back to its own base, so the editor looks unchanged. The same color is used in light and dark; the dark theme only replaces the `--ie-*-base` values. `colors` and `darkColors` are inline and still replace a token outright.

| Token | Brand share |
|-------|-------------|
| `--ie-accent`, `--ie-accent-hover` | 32% |
| `--ie-accent-soft` | 18% |
| `--ie-bg`, `--ie-bg-muted`, `--ie-bg-sidebar`, `--ie-border`, `--ie-overlay`, `--ie-chrome-hover`, `--ie-chrome-active` | 8% |
| `topbar`, `chrome-slot`, `viewport-area` backgrounds | 8%, only when `brandColorAffectsBackground` |

Text, crop lines, the grid, and `--ie-accent-text` stay unmixed. `--ie-ruler-positive` and `--ie-gold` follow `--ie-accent`.

`topbar`, `chrome-slot`, and `viewport-area` keep `#ffffff` in light and `#050404` in dark even when `brandColor` is set. `brandColorAffectsBackground` defaults to `false`. Set it to `true` to mix the brand into those three backgrounds.

```tsx
<ImageEditor
  brandColor="oklch(55.5% 0.46 16.439)"
/>
```

The modal is portaled to `document.body`, so a page custom property does not inherit. Pass the color on the prop. The demo does that with its light and dark `--accent`.

The demo site uses these same accent tokens for its buttons and marks.

### After export

`exportView` defaults to `"preview"`: the floating `.ie-export-preview` card (download + close), kept after the editor closes. `showExportPreview={false}` hides that card.

`"result"` shows an in-page `.ie-export-result` block instead of the floating card. By default that block renders where `<ImageEditor />` sits in the tree.

`exportResultContainer` moves it into another element, the same way `container` places the inline editor. It accepts a CSS selector, an element, or a ref. The block is portaled into that host and grows with its content. It does not fill the host the way the inline editor does.

```tsx
<ImageEditor
  exportView="result"
  exportResultContainer=".stage"
  open={open}
  src={file}
  onExport={save}
  onCancel={close}
/>
```

Omit `exportResultContainer` to keep the result next to `<ImageEditor />`. The prop is ignored when `exportView` is `"preview"`.

---

## Architecture

```
packages/
├── image-editor-core/          # Zero UI, zero CSS
│   └── src/
│       ├── load/               # loadImageSource, EXIF, HEIC→JPEG (heic-to)
│       ├── crop/               # computePixelCrop, cropOutsideImage
│       ├── transform/          # drawOriented canvas pipeline
│       │   └── perspective.ts  # 4-point homography (matrix3d + canvas warp)
│       ├── adjust/             # WebGL grade + Bradford Warmth/Tint WB
│       ├── export/             # exportImage → Blob (crop first, then GL adjust)
│       └── state/              # history (undo/redo)
│
└── react-image-editor/         # React 18+ UI layer
    └── src/
        ├── components/
        │   ├── ImageEditorModal.tsx
        │   ├── CropViewport.tsx         # fixed frame, L-handles, thirds grid
        │   ├── RotationRuler.tsx        # tick-mark dial (−45…45)
        │   ├── EditorModeStrip.tsx      # Rotation / Scale / Perspective circles
        │   ├── EditorCalibrateStrip.tsx # Adjust circles (Brightness…)
        │   ├── MarkupLayer.tsx          # annotate canvas + selection badges
        │   ├── MarkupTextBadge.tsx      # text badge + Aa typography panel
        │   └── EditorPresetPicker.tsx   # fixed bar under topbar
        ├── crop/cropConstraint.ts       # coverage projection (box + quad paths)
        ├── crop/alignSnap.ts            # ruler magnetism + proximity
        ├── hooks/useImageEditor.ts
        ├── presets.ts          # default | selection | outside | profile
        ├── types.ts            # props, labels, defaultPresetLabels
        └── styles/default.css  # optional theme (--ie-* tokens)
```

**Chatimio dogfood integration:**

- `frontend/src/features/settings/SettingsProfileEdit.tsx` — profile photo pick → editor → upload
- `frontend/src/config/imageEditor.ts` — app-level preset map
- `frontend/vite.config.ts` — aliases package **source** for HMR during dev

---

## Installation & dev setup

### Package dependencies (Chatimio frontend)

```json
"@chatimio/image-editor-core": "file:../packages/image-editor-core",
"@chatimio/react-image-editor": "file:../packages/react-image-editor"
```

### Vite aliases (development)

Point imports at source so CSS and TS hot-reload:

```ts
"@chatimio/react-image-editor": "../packages/react-image-editor/src/index.ts",
"@chatimio/react-image-editor/styles.css": "../packages/react-image-editor/src/styles/default.css",
"@chatimio/image-editor-core": "../packages/image-editor-core/src/index.ts",
```

### Build packages

```bash
npm run build --prefix packages/image-editor-core
npm run build --prefix packages/react-image-editor
# or from repo root:
npm run build:packages
```

### Use in React

```tsx
import { ImageEditorModal } from '@chatimio/react-image-editor';
import '@chatimio/react-image-editor/styles.css';
```

---

## Presets

Presets bundle crop rules, export format, UI features, and interaction mode.

| Preset | Layout | Interaction | Crop | Export | Notes |
|--------|--------|-------------|------|--------|-------|
| `default` | full | pan | free aspect | JPEG 0.92 | Sidebar, all tools |
| `selection` | compact | drag selection box | free + rect guide | JPEG 0.92 | No sidebar |
| `outside` | full | pan | free, **outside image** | PNG | minZoom 0.25 |
| `profile` | compact | pan | 1:1 + circle guide | JPEG 512×512 | Profile avatar |

### Basic usage

```tsx
<ImageEditorModal
  open={open}
  src={file}
  preset="profile"
  onExport={handleExport}
  onCancel={handleClose}
/>
```

### Spread a preset config (Chatimio pattern)

```tsx
import { imageEditorPresets } from '@/config/imageEditor';

const [preset, setPreset] = useState<'profile' | 'default'>('profile');

<ImageEditorModal
  {...imageEditorPresets[preset]}
  onPresetChange={setPreset}
  presetPicker={{ positionStorageKey: 'my-app-preset-pos' }}
  src={file}
  open
  onExport={save}
  onCancel={close}
/>
```

### Override preset fields

Any prop on `ImageEditorModal` overrides the resolved preset:

```tsx
<ImageEditorModal
  preset="default"
  crop={{ aspectRatio: 16 / 9 }}
  exportOptions={{ maxWidth: 1920, maxHeight: 1920, quality: 0.85 }} // opt-in downscale
  features={{ flipHorizontal: false }}
  fonts={[{ id: 'serif', label: 'Serif', family: 'Georgia, serif' }]} // Markup text only
  ...
/>
```

See **Markup** for the `fonts` prop and text **Aa** menu.

### Programmatic config

```ts
import { resolveEditorConfig, createEditorConfig, editorPresets } from '@chatimio/react-image-editor';

const config = resolveEditorConfig({ preset: 'outside', features: { cropShape: false } });
```

---

## Preset picker (fixed bar)

When `onPresetChange` is provided, a **preset switcher** appears as a **fixed bar under the topbar**, above the workspace. It is not draggable.

### API

```tsx
<ImageEditorModal
  preset={currentPreset}
  onPresetChange={setCurrentPreset}
  presetPicker={{
    options: ['default', 'selection', 'outside', 'profile'],
    presetLabels: { profile: 'Avatar' },
    label: 'Editor preset',
  }}
  ...
/>
```

### English default preset names (library)

```ts
import { defaultPresetLabels } from '@chatimio/react-image-editor';
// { default: 'Default', selection: 'Drag selection', outside: 'Crop outside', profile: 'Profile' }
```

Without `onPresetChange`, the picker is **hidden** (production apps typically fix one preset).

---

## Labels & i18n policy

Built-in catalogs ship with the library: `en` (default), `tr`, and `jp`. Pass `locale` and the editor, including preset names, follows that language. There is no i18n framework dependency.

`labels` still overrides individual strings on top of the catalog.

```tsx
<ImageEditor locale="tr" open={open} src={file} onExport={save} onCancel={close} />
```

Consumers can also pass copy directly:

```tsx
// English only — omit labels
<ImageEditorModal preset="default" ... />

// Static overrides
<ImageEditorModal labels={{ save: 'Apply', cancel: 'Dismiss' }} ... />

// Extra overrides on top of `locale`
const { t } = useTranslation();
<ImageEditorModal
  labels={{
    save: t('settings.editor.save'),
    undo: t('settings.editor.undo'),
  }}
  presetPicker={{
    label: t('settings.editor.presetLabel'),
    presetLabels: {
      default: t('settings.editor.presets.default'),
      profile: t('settings.editor.presets.profile'),
    },
  }}
  ...
/>
```

### `ImageEditorLabels` fields

| Key | Default (EN) |
|-----|----------------|
| `undo`, `redo`, `reset` | Undo, Redo, Reset |
| `rotateLeft`, `rotateRight` | Rotate left, Rotate right |
| `flipHorizontal`, `flipVertical` | Flip H, Flip V |
| `cancel`, `save`, `loading` | Cancel, Done, Loading… |
| `rotation`, `scale`, `cropShape` | Rotation, Scale, Crop shape |
| `brightness`…`vignette` | Brightness, Contrast, Saturation, Exposure, Vignette |
| `tools.*` | Crop, Calibrate, Filter, Markup, … (sidebar; `finetune` is a deprecated alias for Calibrate) |
| `markup.*` | Markup toolbar + text/shape badge strings (see **Markup**) |

---

## Styling

- Default theme: `styles/default.css` imported by the consumer.
- Design tokens: `--ie-accent`, `--ie-bg`, `--ie-radius`, etc. on `[data-ie-root]`.
- Override light tokens with the `colors` prop and dark tokens with `darkColors` (`accent`, `accentHover`, `accentSoft`, and the rest of `ImageEditorThemeColors`). See **Host shell (current)**.
- Layout variants: `data-ie-layout="full" | "compact" | "minimal"`.
- Slot styling: `classNames` prop on `ImageEditor` (e.g. `button`, `viewport`, `presetPicker`).
- Unstyled mode: `unstyled` prop — no default layout classes; bring your own CSS.

---

## Core API (headless)

```ts
import {
  loadImageSource,
  computePixelCrop,
  exportImage,
  createHistory,
  undo,
  redo,
  patchCrop,
} from '@chatimio/image-editor-core';
```

### HEIC / HEIF

Chrome and Firefox cannot decode HEIC natively. `loadImageSource` detects HEIC
(mime, `.heic`/`.heif` name, or `ftyp` brand) and converts to JPEG in the browser
via `heic-to` (libheif WASM, loaded only when needed) before the editor opens.
Safari may decode HEIC directly; conversion still runs when detection is positive
so the pipeline always sees a standard bitmap.

### Load

```ts
const loaded = await loadImageSource(fileOrUrlOrBlob);
// loaded: { element, width, height, blobUrl, orientation }
```

Keep `blobUrl` alive while showing preview; revoke on cleanup (handled in `useImageEditor`).

### Export

```ts
const blob = await exportImage(loaded, crop, transform, {
  format: 'image/jpeg',
  quality: 0.9,
  maxWidth: 512,
  cropOutsideImage: false,
});
```

---

## Chatimio integration (Settings → Profile)

**File:** `frontend/src/features/settings/SettingsProfileEdit.tsx`

Flow:

1. User clicks avatar → file input → `pendingFile` state.
2. `ImageEditorModal` opens with `{...imageEditorPresets[editorPreset]}`.
3. Fixed preset bar under topbar (`onPresetChange` + `presetPicker`).
4. `labels` passed from Chatimio `@/i18n` (optional for the library).
5. On export: upload file → `updateMe({ profileImage })` → `updateUser` in Redux (does not overwrite JWT).

**Config:** `frontend/src/config/imageEditor.ts`

---

## Phase roadmap (reference)

| Phase | Version | Scope |
|-------|---------|-------|
| 0 | — | Monorepo, tsup, Vitest |
| 1 | 0.1.0 | Crop MVP, React modal, profile dogfood ✅ |
| 2 | 0.2.0 | Crop UX, inline/overlay modes |
| 2b | 0.2.x | Vue package |
| 3+ | 0.3+ | Resize, filters, annotations, npm publish |

Full plan: `.cursor/plans/image_editor_library_7741d6ea.plan.md`

---

## Crop / rotate UI

Visual source of truth: crop screen.

### Interaction model

- **Fixed crop frame** centered in the viewport (not transformed with the image).
- **Image** pans, pinches/zooms, and rotates *under* the frame (`translate` + `scale` + `rotate`).
- **Handles:** thick black L-corners + mid-edge segments (not square/circle knobs).
- **Grid:** subtle 3×3 rule-of-thirds inside the frame.
- **Dim mask:** semi-transparent white over areas outside the crop.
- **Rotation ruler:** circular angle badge + horizontal tick scale (−45°…+45°) with smooth animations.
- **Responsive:** full-bleed on mobile; centered card on desktop (`≥768px`).

### Core: fine angle

`TransformState.angle` (degrees, continuous) is separate from discrete `rotation` (0/90/180/270). Export applies both.

### Components

| Component | Role |
|-----------|------|
| `CropViewport` | Fixed frame, grid, handles, pan/pinch/wheel |
| `RotationRuler` | Angle badge + draggable tick ruler (ruler behavior) |
| `ImageEditorModal` | Optional host shell (Cancel / Reset / Done) |

### Placement

The modal is optional. Consumers can mount `CropViewport` + `RotationRuler` in any layout; Chatimio currently hosts them inside `ImageEditorModal`.

---

## Rotation ruler (scale behavior)

`RotationRuler` mirrors straighten control.

### Horizontal scroll (desktop + mobile)

The ruler is a **native horizontal scroller** (scrollbar visually hidden):

- **Mobile:** touch pan left/right with momentum (`touch-action: pan-x`, `-webkit-overflow-scrolling: touch`).
- **Desktop:** click-drag, trackpad horizontal swipe, and mouse wheel (vertical wheel is mapped to horizontal scroll).
- **Keyboard:** ← / → step by 1°.
- Scroll position maps 1:1 to angle (`PX_PER_DEGREE`); edge ticks can center via side padding.

### Tick / column animation (`animateTicks`)

- **Default:** `true` (on).
- **Not** a bell curve around the screen center.
- The **main tick** is the one under the fixed center mark (live `scrollLeft` → angle).
- Other ticks form a **one-sided trail** behind the scroll direction:
  - Scrolling toward **+x:** trail on the **left (−x)** of main (tall near main → short further left).
  - Scrolling toward **−x:** trail on the **right (+x)** of main.
- **Main tick** is always the nearest degree (`Math.round`) and always **2×** tall — trail neighbors peak below main so it stays distinctly tallest.
- **Main handoff:** when the center crosses to a new tick, the new main grows to full height quickly and the previous main shrinks quickly.
- **Trail is continuous and velocity-driven** (smoothed for weight):
  - Slow drag → ~8-tick descending trail; faster → longer slope.
  - Micro-stillness / release → trail collapses to defaults; main stays tall.
- **Uniform ticks:** all non-main ticks share the same height and width (`14px` × `1px`); main tick is **2×** tall (`28px`).
- Every **5°** mark (−45, −40, …, 0, 5, 10, …) uses a darker tick (`ie-ruler-tick-major`).
- On release, the velocity-based slope **collapses faster** toward baseline (`TRAIL_RELEASE_SHRINK`).
- Heights update every frame (rAF + direct DOM). No per-tick CSS animations.
- Main tick uses the active sign color; at **0°** it uses the positive color (`--ie-ruler-positive`).
- On open / idle sync, only the main tick is tall; trail heights are snapped clear.
- Disable with `animateTicks={false}` on `RotationRuler` or `ImageEditorModal`.

### Perspective modes (mode strip)

**Vertical** and **Horizontal perspective** sit in the mode strip next to Scale
and behave exactly like the Rotation and Scale circles.

| Mode circle | Center | Ruler below | What it adjusts |
|-------------|--------|-------------|-----------------|
| **Rotation** | Number −45…45 | Signed straighten ruler | Fine angle (`transform.angle`) |
| **Scale** | Number 0…100 | 0–100 scale ruler | `crop.zoom` |
| **Vertical** | Keystone glyph, then number −100…100 | −100…100 ruler | `transform.perspectiveY` |
| **Horizontal** | Keystone glyph, then number −100…100 | −100…100 ruler | `transform.perspectiveX` |

Order in the strip: **Rotation → Scale → Vertical → Horizontal**.

**Interaction (identical to Rotation / Scale):**

1. Tap a circle or swipe the strip horizontally — the badge centers above the ruler.
2. After the scroll **settles**, the ruler mounts for that mode (no instant swap on tap).
3. Drag the ruler to adjust. The magnetic snap from `alignSnap.ts` pulls gently
   back to 0 (neutral) with the usual hysteresis, so a fast flick still passes
   straight through.

The circle shows the keystone glyph while the value is 0 and the number once it
moves; the arc length encodes the magnitude and its direction encodes the sign.
Values survive switching modes because they live on the transform, not on the strip.

Hide the pair with `features.perspectiveTab: false`.

```tsx
<EditorModeStrip
  showRotation
  showScale
  showPerspective
  highlightMode={highlightMode}
  committedMode={activeMode}
  perspectiveYValue={transform.perspectiveY * 100}
  perspectiveXValue={transform.perspectiveX * 100}
  ...
/>
```

**Magnetic snap** (`alignSnap.ts`) is shared with the straighten ruler: soft
attraction to the neutral value, enter/exit hysteresis, velocity-aware.

Override H/V badge colors via `modeRingColors.horizontalTrack` / `verticalProgress`
or `--ie-mode-horizontal-*` / `--ie-mode-vertical-*` CSS variables.

### Circular border (always on)

- **Cannot be disabled.** There is no `animateCircle` prop.
- Two layers:
  1. **Inactive** — full ring using the active color at low opacity (`--ie-ruler-inactive-opacity`, default `0.22`).
  2. **Active** — progress arc whose length tracks `|angle| / max`.
- Direction:
  - Positive angle → clockwise arc
  - Negative angle → counter-clockwise arc
- Updates live while dragging; short ease-out settle on release.

### Colors

| Value | Default active | Override |
|-------|----------------|----------|
| `≤ 0` (negative or zero) | `#000000` | `negativeColor` prop / `--ie-ruler-negative` |
| `> 0` (positive) | `oklch(55.5% 0.46 16.439)` | `positiveColor` prop / `--ie-ruler-positive` |

Inactive rings are **not** hard-coded: they reuse the current active color with opacity, so custom `positiveColor` / `negativeColor` automatically tint the inactive track.

```tsx
<RotationRuler
  value={angle}
  onChange={setAngle}
  animateTicks={true}
  negativeColor="#000000"
  positiveColor="oklch(55.5% 0.46 16.439)"
/>

// Via modal
<ImageEditorModal
  animateTicks={true}
  negativeColor="#111111"
  positiveColor="#00AEEF"
  ...
/>

// Or CSS variables on a parent / [data-ie-part='rotation-ruler']
```

CSS variables set by the component:

| Variable | Meaning |
|----------|---------|
| `--ie-ruler-negative` | Active color for ≤ 0 |
| `--ie-ruler-positive` | Active color for > 0 |
| `--ie-ruler-active` | Resolved active color for the current value |
| `--ie-ruler-inactive-opacity` | Opacity for the full inactive ring |

### Animation control summary

| Feature | Default | Can disable? |
|---------|---------|--------------|
| Tick height animation | `animateTicks={true}` | Yes → `false` |
| Circular progress border | Always on | **No** |

---

## Mode ring colors

The two circles above the ruler (**Rotation** and **Scale**) each draw a
progress ring made of exactly **two flat colors**:

- **track** — the full faint circle underneath, always a complete 360° ring;
- **progress** — the arc drawn on top of it.

Only the **length** of the arc encodes the value. Its color is constant, so
`+1°` is painted in exactly the same solid color as `+45°`. There is no
gradient, no interpolation, and no "starts pale and darkens" behavior anywhere
in the component — if you see a color ramp, something is overriding these
variables. (This replaced an earlier `lerpColor` implementation; that helper no
longer exists.)

### The ten colors

| Key (`modeRingColors`) | CSS variable | Default | Used when |
|------------------------|--------------|---------|-----------|
| `rotationNegativeTrack` | `--ie-mode-rotation-negative-track` | `#E4E4E7` | Rotation circle, angle ≤ 0 |
| `rotationNegativeProgress` | `--ie-mode-rotation-negative-progress` | `#3F3F46` | Rotation arc, angle < 0 (counter-clockwise) |
| `rotationPositiveTrack` | `--ie-mode-rotation-positive-track` | `oklch(88% 0.08 16.439)` | Rotation circle, angle > 0 |
| `rotationPositiveProgress` | `--ie-mode-rotation-positive-progress` | `oklch(55.5% 0.46 16.439)` | Rotation arc, angle > 0 (clockwise) |
| `scaleTrack` | `--ie-mode-scale-track` | `oklch(88% 0.08 16.439)` | Scale circle, all values |
| `scaleProgress` | `--ie-mode-scale-progress` | `oklch(55.5% 0.46 16.439)` | Scale arc, 0…100 |
| `verticalTrack` | `--ie-mode-vertical-track` | `oklch(88% 0.08 16.439)` | Vertical perspective circle |
| `verticalProgress` | `--ie-mode-vertical-progress` | `oklch(55.5% 0.46 16.439)` | Vertical perspective arc, −100…100 |
| `horizontalTrack` | `--ie-mode-horizontal-track` | `oklch(88% 0.08 16.439)` | Horizontal perspective circle |
| `horizontalProgress` | `--ie-mode-horizontal-progress` | `oklch(55.5% 0.46 16.439)` | Horizontal perspective arc, −100…100 |

The perspective rings use one flat pair each; a negative value mirrors the arc
instead of changing its color.

At the maximum value the arc covers the whole circle, so the track is no longer
visible — that is expected, not a bug.

### Changing them

Pick **one** of the two ways below; they set the same variables, and the prop
wins because it is written inline on the strip element.

```tsx
// 1. Prop — scoped to this editor instance. Partial objects are fine.
<ImageEditorModal
  modeRingColors={{
    rotationNegativeProgress: '#1F2937',
    rotationPositiveProgress: '#2563EB',
    rotationPositiveTrack: '#BFDBFE',
    scaleProgress: '#2563EB',
    scaleTrack: '#BFDBFE',
  }}
  ...
/>
```

```css
/* 2. CSS — app-wide. Put it anywhere above the editor. */
:root {
  --ie-mode-rotation-negative-track: #e4e4e7;
  --ie-mode-rotation-negative-progress: #1f2937;
  --ie-mode-rotation-positive-track: #bfdbfe;
  --ie-mode-rotation-positive-progress: #2563eb;
  --ie-mode-scale-track: #bfdbfe;
  --ie-mode-scale-progress: #2563eb;
}
```

> These are **separate** from `negativeColor` / `positiveColor`, which color the
> ruler ticks and the angle badge, not the mode circles. Set both if you want
> the whole bottom bar to match.

The number inside a circle follows its own `progress` color while the value is
non-zero, and falls back to `--ie-text` at zero.

---

## Coverage constraint (rotation + scale + translation)

`packages/react-image-editor/src/crop/cropConstraint.ts` solves all three
constraints from one transform state, in closed form.

Working in the image's own (unrotated) frame turns the "crop must stay inside
the image" condition into a separable box constraint. With `θ` the on-screen
angle, `fw × fh` the crop frame, `s = cover · zoom`:

```text
HX = (fw/2)|cosθ| + (fh/2)|sinθ|      HY = (fw/2)|sinθ| + (fh/2)|cosθ|

minimum covering scale : s ≥ max(2·HX / mediaW, 2·HY / mediaH)
valid translation (in rotated space) : |uₓ| ≤ mediaW·s/2 − HX
                                       |u_y| ≤ mediaH·s/2 − HY
```

`constrainCropToImage` clamps the zoom first, then rotates the translation into
image space, clamps each axis, and rotates back. Properties this buys:

- **Exact** — the frame is provably covered; no iteration or relaxation loop.
- **Continuous** — every term is continuous in `θ` and `zoom`, so sweeping the
  ruler produces no popping (verified: ≤0.4 px translation and ≤0.002 zoom per
  0.05° step).
- **Idempotent** — `constrain(constrain(c)) === constrain(c)` to ~1e-12, so
  re-applying it each frame cannot oscillate or drift.

Rules `CropViewport` follows:

- The rendered transform is always the projected one, so an invalid frame is
  never painted and there is no one-frame overshoot to correct afterwards.
- Every gesture frame projects a **raw** transform built from the gesture start
  state plus the total delta — never a re-modified, already-projected value.
- At a limit, pushing further is a no-op: the wheel/pinch handler returns early
  and nothing re-renders, so there is no bounce, micro-zoom, or flicker.
- `userZoom` (what the user asked for) is tracked separately from the coverage
  minimum, so rotating raises the zoom to keep the frame covered and rotating
  back releases it instead of ratcheting up.
- `onZoomBoundsChange` reports the valid range, so the 0–100 Scale ruler maps
  0 onto the exact geometric minimum rather than an unreachable value.

### With perspective

A keystoned image is a convex quadrilateral, not a rectangle, so the separable
box above no longer applies. The same reasoning still does: "all four frame
corners inside the quad" is four linear inequalities in the translation `u`, one
per quad edge, tightened by the worst corner:

```text
for each quad edge i with direction Eᵢ from vertex Pᵢ:
    dot(aᵢ, u) ≤ bᵢ      aᵢ = (−Eᵢ.y, Eᵢ.x)      bᵢ = min over corners of cross(Eᵢ, Cⱼ − Pᵢ)
```

That is a convex polygon, and projecting onto a convex polygon is still exact,
continuous, and idempotent. The minimum covering scale has no closed form for a
general quad, so it is bisected — feasibility is monotone in the scale (growing a
convex set about a contained origin can only enlarge it), which makes the search
deterministic. Measured: a `1e-4` change in a perspective value moves the minimum
zoom by `≤4e-5`, and the projection is idempotent to 1e-6.

The rectangle path is kept as the fast path, so behaviour with both perspective
values at 0 is unchanged.

---

## Perspective (keystone) correction

Real 4-point homography, implemented in
`packages/image-editor-core/src/transform/perspective.ts`. There is no CSS
`skew`, no extra scale, and no rotation involved — the perspective divide is
what makes it read as a tilt in depth rather than a shear.

### State

`TransformState` gains two numbers, both in `[-1, 1]`, both defaulting to 0:

| Field | Meaning |
|-------|---------|
| `perspectiveY` | Vertical keystone. Positive narrows the top edge and widens the bottom, as if tilting the camera up. |
| `perspectiveX` | Horizontal keystone. Positive shortens the left edge and lengthens the right, as if panning. |

The source pixels are never touched, so the effect is fully reversible and takes
part in undo/redo like any other transform. The UI presents them on a −100…100
ruler; divide by 100 to get the stored value.

### Geometry

`perspectiveQuad(x, y)` maps the source rectangle onto a symmetric trapezoid in
centred, normalized coordinates. Opposite edges change by ∓k with
`k = value · PERSPECTIVE_MAX_SHIFT` (0.42), so the mean edge length stays 1 and
the image keeps its centre of mass instead of drifting.

`perspectiveHomography(w, h, x, y)` returns the 3×3 matrix for an element of
that size, expressed in **centred** coordinates so it composes with
`transform-origin: center center`. Its bottom row is non-zero — that is the
projective term, and it is what an affine matrix cannot express.

### Preview vs. export

Both derive from the same homography, so they cannot drift apart:

| Surface | How |
|---------|-----|
| Preview | `perspectiveCssTransform()` → CSS `matrix3d`, folding the projective row into the w column. The browser does the perspective divide on the GPU. |
| Export | `drawPerspectiveImage()` — Canvas 2D has no projective transform, so the source is subdivided into a grid (12–64 cells per axis, by resolution) and each cell is drawn with its own affine map. The error inside a cell falls off quadratically with cell size; clips are grown by ~1 px so cells overlap instead of showing seams. |

`CropViewport` applies it as `rotate(θ) matrix3d(P) flips`, and `renderToCanvas`
composes it in the same order.

### Adding a native port

Use the platform's projective transform — `SKMatrix` with `persp0`/`persp1`, or
`CATransform3D` with `m14`/`m24` — and feed it the same
`perspectiveHomography()` output. An affine shear is not a substitute; it keeps
opposite edges parallel and the result looks stretched rather than tilted.

### 2026-08-08 (flat mode ring colors)

- Mode rings no longer interpolate: each ring is one flat `track` + one flat
  `progress` color, so `+1` is as vivid as `+45`. `lerpColor` was removed.
- Six themeable colors via `modeRingColors` prop or `--ie-mode-*` CSS
  variables — see **Mode ring colors**.

### 2026-08-08 (deterministic coverage constraint)

- Replaced the iterative clamp + rubber-band + settle animation with the
  closed-form projection above. The crop frame now **never** leaves the image.
- Scale at its limit is a hard but smooth stop: no bounce, flicker, or snap.

---

## Calibrate (Adjust)

Sidebar tool **Calibrate** (renamed from the former `finetune` placeholder)
opens an Adjust strip with the same circle + ruler interaction as Crop modes.

| Circle | Stored field | UI range | Effect |
|--------|--------------|----------|--------|
| Brightness | `adjust.brightness` | −100…100 | Midtone lift / crush |
| Contrast | `adjust.contrast` | −100…100 | Expand / compress around mid-gray |
| Black Point | `adjust.blackPoint` | −100…100 | Where the darkest tone lands: crush (+) / lift (−) |
| Saturation | `adjust.saturation` | −100…100 | Chroma; −100 ≈ grayscale |
| Vibrance | `adjust.vibrance` | −100…100 | Chroma weighted toward muted colours, skin protected |
| Exposure | `adjust.exposure` | −100…100 | ≈ ±2 EV stops |
| Brilliance | `adjust.brilliance` | −100…100 | Local tone map: opens shaded regions, tames bright ones |
| Highlights | `adjust.highlights` | −100…100 | Gain on the bright end only: recover (−) / open (+) |
| Shadows | `adjust.shadows` | −100…100 | Lift (+) / deepen (−) the dark end only |
| Vignette | `adjust.vignette` | −100…100 | Edge darken (+) / lighten (−) |
| Warmth | `adjust.warmth` | −100…100 | WB temperature (−cool / +warm) |
| Tint | `adjust.tint` | −100…100 | WB tint (−green / +magenta) |
| Sharpness | `adjust.sharpness` | −100…100 | Unsharp mask on luminance: soften (−) / sharpen (+) |
| Definition | `adjust.definition` | −100…100 | Wide-radius local contrast (midtone clarity) |

### Adding a channel

`ADJUST_CHANNELS` in `image-editor-core/src/types.ts` is the single source of
truth. It drives `AdjustState`, `createDefaultAdjust`, `normalizeAdjust`,
`hasAdjustments`, the `u_<channel>` uniform lookup, and the React strip and
label lists. A new channel is therefore:

1. one entry in `ADJUST_CHANNELS` (position = strip display order)
2. a `CHANNEL_UNIFORM` mapping from `[-1, 1]` to the shader's uniform value
3. a `FRAG` block plus its mirror in `applyAdjustments`
4. a glyph case in `EditorCalibrateStrip` and a `defaultAdjustLabels` entry

Steps 2 and 4 are compile-enforced: both are total `Record<AdjustChannelKey, …>`
maps, so a missing channel fails the build rather than silently doing nothing.
Constants shared between the shader and the CPU mirror (`BLACK_POINT_RANGE`,
`BRILLIANCE`, `DEFINITION`, …) live in `adjustments.ts` and are interpolated
into the GLSL via `glslFloat`, so preview and export cannot drift apart.

### Tone-region channels (Highlights / Shadows / Black Point)

All three are pointwise and work in linear light:

- **Highlights** multiplies by `2^(v · mask)` where `mask = smoothstep(0.35, 1, Y)`.
  Equal gain on R, G and B, so recovery does not shift hue.
- **Shadows** lifts *additively* — a multiplicative gain cannot open black,
  since `0 × k = 0`. Mask is the inverse `1 − smoothstep(0, 0.5, Y)`.
- **Black Point** moves the black floor and rescales so white stays put:
  `(c − t) / (1 − t)` when crushing, `c(1 + t) − t` when lifting, `|t| ≤ 0.25`.

### Vibrance vs. Saturation

Saturation scales chroma uniformly. Vibrance weights the same operation by
`1 − chroma`, so muted colours move first and already-vivid ones do not clip,
and it holds back an orange-hue term so skin stays natural. The two compose:
they are separate stages, not two names for one slider.

### Sharpness (unsharp mask)

Nine taps of a 3×3 Gaussian on the **ungraded source** texture (`u_texel` gives
the neighbour offset), differenced against the centre to get local detail.
Detail is computed on luminance only and re-applied to the graded pixel as a
multiplier, which sharpens edges without colour fringing. Positive overshoots
(×1.5) for crispness; negative is capped at ×1 so full softening lands exactly
on the local mean instead of inverting the edge.

### Brilliance & Definition (local operators)

Both ask "how bright is the neighbourhood around this pixel?", which a pointwise
shader cannot answer. Instead of ping-ponging framebuffers on every slider tick,
`setSource` builds a **blur guide** once per crop change (`blurGuide.ts`): the
frame downscaled to a 256px long edge and blurred by ~4% of that edge, uploaded
as a second texture on `TEXTURE1`. Bilinear filtering expands it back to full
resolution for free, and a slider drag stays a uniform update plus one
`drawArrays`.

- **Brilliance** reads the guide's luminance to decide where to act: additive
  lift where the neighbourhood is dark, multiplicative pull-back where it is
  bright, plus a small chroma restore because opening shadows washes colour out.
  A face in shade opens up while the sky behind it does not blow out.
- **Definition** takes the difference between the pixel's luminance and the
  guide's — the broad midtone structure — and amplifies it as a luminance ratio,
  so hue is untouched. A `protect` term fades the effect above 0.8 luminance to
  keep near-white halo-free.

`ctx.filter` is feature-detected (Safari only gained it in 16.4); the fallback
is an aggressive downscale plus bilinear upscale, which is a serviceable
low-pass built from `drawImage` alone. When no guide can be built (`ImageData`
source, no 2D context) `u_guideActive` is 0 and both channels no-op.

### Warmth & Tint (photographic white-balance)

Not CSS filters and not RGB channel offsets. Both axes change the **illuminant**,
then a Bradford chromatic-adaptation transform (von Kries in LMS) is applied in
linear sRGB. CPU code folds that into one 3×3 matrix (`whiteBalance.ts`); the
WebGL shader multiplies and restores Rec.709 luminance.

- **Warmth:** eased slider → CCT around D65 (≈6504 K). `+1 → ~4000 K` (amber),
  `−1 → ~10000 K` (blue). Destination white from the Planckian locus.
- **Tint:** isotherm offset in CIE 1976 u′v′ (perpendicular to the locus).
  Negative → green, positive → magenta. Composed into the same white before CAT,
  so the two sliders stay independent and combine stably.

This is the same family of model used by camera WB / Lightroom temperature–tint,
which is why the look stays subtle and photographic rather
than an Instagram-style grade.

### WebGL pipeline — cropped frame only

```text
source image
  → computePixelCrop → export pixel size (source resolution, not CSS frame px)
  → renderToCanvas (crop + rotation + perspective + flips)   // geometry bake
  → setSource: frame texture + blur guide texture             // once per crop
  → WebGLAdjustRenderer (shader uniforms from AdjustState)     // live + export
  → optional maxWidth/maxHeight (upload only; preview/download stay full-res)
  → Blob
```

Shader order (one pass, linear light throughout):

```text
white balance → exposure → brilliance → highlights → shadows → brightness
  → contrast → black point → definition → saturation → vibrance
  → sharpness → vignette
```

Export resolution is derived from `computePixelCrop`: the crop frame may be ~400 CSS
pixels on screen, but the exported canvas matches the **source pixels** visible in
that frame (`frameSize / cover / zoom`).

**Downscale is opt-in.** Presets do not set `maxWidth` / `maxHeight`. Pass them in
`exportOptions` only when the host needs a smaller upload (e.g. avatars). When set,
`ImageEditorModal` keeps the preview/download at full resolution and applies
`downscaleBlob` only to the blob passed to `onExport`.

- Preview (`AdjustGlLayer`): re-uploads the crop texture only when framing
  changes; slider drags update uniforms + `drawArrays` — no `readPixels`, no
  CSS filters.
- Export uses the same shader; CPU `applyAdjustments` mirrors it if WebGL is
  missing.
- Original source pixels are never mutated. Changing another channel does not
  accumulate Warmth/Tint — every frame is `crop(source) + full AdjustState`.

In Calibrate mode the crop frame stays locked (no pan / pinch / handles).
Switch back to **Crop** to change framing; adjust values persist.

```tsx
labels={{
  tools: { calibrate: 'Calibrate' },
  warmth: 'Warmth',
  tint: 'Tint',
}}
```

Ring colors: `calibrateTrack` / `calibrateProgress` (and `*Negative*` for
values < 0), or CSS `--ie-mode-calibrate-*`.

---

## Filter (Filters)

Sidebar tool `filter`. A horizontally snap-scrolling carousel of look previews
rendered from the **photo being edited**, with an intensity ruler underneath —
the Filters section, with the heading rendered as "Filter".

### State

```ts
interface FilterState {
  id: FilterId;      // 'original' | 'vivid' | … | 'noir'
  intensity: number; // 0…1, ruler shows 0–100
}
```

`FILTER_IDS` in core `types.ts` is the single source of truth: it drives
`normalizeFilter`, the carousel order, the thumbnail loop and
`defaultFilterLabels` (a total record, so a new id cannot ship unnamed).
`filter` is part of `EditorSnapshot`, so undo/redo restores it like any other
edit.

### Looks are parameters, not LUTs

`filter/filterLooks.ts` defines each look as a `FilterLook` — saturation,
contrast, brightness, warmth/tint, highlights, shadows, black point, mono +
toning, vignette — in the same units the adjust pipeline uses.

`resolveFilterLook(filter)` interpolates the preset against `IDENTITY_LOOK` by
`intensity` **on the CPU**, so the shader only ever receives a finished look.
That is what makes the intensity drag continuous: there is no blend factor in
GLSL and no stepping between presets.

### Where it runs

The look is the last block of the existing adjust fragment shader, so it costs
no extra pass and composes with Calibrate instead of replacing it:

```text
white balance → exposure → brilliance → highlights → shadows → brightness
  → contrast → black point → definition → saturation → vibrance
  → sharpness → vignette
  → FILTER: wb → highlights → shadows → brightness → contrast → black point
            → saturation → mono/toning → vignette
```

Switching filters and dragging intensity are **uniform updates only** — the
crop texture is not rebaked, which is why the carousel can apply looks live
while it scrolls. Export (`exportImage`) and the CPU fallback
(`applyAdjustments(canvas, adjust, filter)`) run the identical math.

### Thumbnails

`useFilterThumbnails` bakes the crop composition **once** at ~132px through
`renderToCanvas`, then re-grades that one canvas per look via the shared export
renderer. Every tile is drawn at intensity 1 (only the main
image follows the slider), so dragging intensity never regenerates the strip.
Thumbnails include the current Calibrate grade and are cached until the
composition or grade changes, so re-entering the tool does not flash.

### Interaction

- Scroll or tap centres a tile; the look applies **live** on highlight.
- History is pushed once the strip settles, so a swipe past six looks leaves
  one undo step.
- Picking a different look restores full strength; tapping the already-centred
  tile restores a pulled-back look to 100.
- `original` has nothing to dial back: the ruler keeps its space
  (`.ie-ruler-inert`) so switching to it does not shift the carousel.

Like Calibrate, the Filter tool expands the crop frame to the mask edges and
hides crop chrome; framing changes go back through **Crop**.

```tsx
labels={{
  tools: { filter: 'Filter' },
  filterSection: 'Filter',
  filters: { vividWarm: 'Canlı Sıcak' },
}}
```

Sizing/colour hooks on `[data-ie-part='bottom-bar'][data-ie-tool='filter']`:
`--ie-filter-thumb`, `--ie-filter-gap`, `--ie-filter-radius`,
`--ie-filter-ring`, `--ie-filter-active`.

---

## Markup (Annotate)

Sidebar tool **Markup** (`tools.annotate` / legacy name `annotate`). Drawing,
shapes, text, stickers, signature, ruler, and eraser objects live in crop-frame
normalized space and are baked into export via `renderMarkup`.

Like Filter and Calibrate, Markup expands the crop frame to the mask edges and
hides crop chrome while active.

### State

```ts
interface MarkupText {
  kind: 'text';
  id: string;
  text: string;
  x: number; y: number; w: number;   // normalized 0…1 on the crop frame
  fontSize: number;                  // fraction of frame short side
  color: string;
  align: 'left' | 'center' | 'right' | 'justify';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontId?: string;                   // host font id; omitted → `default`
  fontFamily?: string;               // CSS stack used at paint/export
}
```

`MarkupState` holds `objects[]` (strokes, text, shapes, stickers, signatures)
plus an optional ruler. Everything is part of `EditorSnapshot`, so undo/redo
restores markup like any other edit.

### Text selection badge

When a text object is selected (and not inline-editing), a screen-axis contextual
badge appears above it — same pattern as the shape badge:

```text
[ color swatch ] [ Aa ] | [ duplicate ] [ delete ]
```

- **Color** opens a preset swatch grid + custom picker (same palette as the
  markup toolbar).
- **Aa** opens the typography secondary menu (below).
- **Duplicate** / **Delete** clone or remove the object.

The badge is rendered by `MarkupTextBadge` inside `MarkupLayer`; it does not
rotate with the text box.

Double-tap a placed text object to enter inline edit mode (`textarea` overlay).
The Aa menu is for styling, not re-entering edit mode.

### Aa secondary menu (built-in editor reference)

Tapping **Aa** opens a compact four-row panel inspired by **Markup →
Markup → Text → Aa**. Rows are fixed-height; opening a row control never
resizes the badge or moves the text object.

```text
┌─────────────────────────────────────────────┐
│   B       I       U       S                 │  ← style toggles
│   −                16                 +     │  ← font size stepper
│   Default                              ▾    │  ← font selector
│   ≡       ≡       ≡       ≡               │  ← alignment
└─────────────────────────────────────────────┘
```

| Row | Controls | Behaviour |
|-----|----------|-----------|
| 1 — Style | Bold, Italic, Underline, Strikethrough | Toggle; active state uses `--ie-accent` / `--ie-accent-soft` |
| 2 — Size | `−` / `+` with centred px value | Steps 1 px at a time (10…96 px display); updates `fontSize` immediately |
| 3 — Font | Selector showing current label + chevron | Opens a **fixed overlay** dropdown below the row (portaled to `[data-ie-root]`); does not shift the Aa panel or badge |
| 4 — Align | Left, Center, Right, Justify | Toggle group; justify distributes word spacing on wrapped lines (last line of each paragraph stays ragged) |

CSS classes: `.ie-text-aa`, `.ie-text-aa-row`, `.ie-text-aa-seg`, `.ie-text-aa-size`,
`.ie-text-aa-font`, `.ie-text-aa-font-menu`. Panel width is locked via
`.ie-shape-badge-panel[data-ie-aa='true']`.

### Custom fonts (`fonts` prop)

The library **never hard-codes** a font list in the UI. **Default** (SF /
system stack) is always available. Host apps pass extra faces on
`ImageEditorModal`:

```ts
import type { ImageEditorFont } from '@chatimio/react-image-editor';

const fonts: ImageEditorFont[] = [
  { id: 'serif', label: 'Serif', family: 'Georgia, serif' },
  { id: 'mono', label: 'Mono', family: 'SF Mono, Menlo, monospace' },
];

<ImageEditorModal
  fonts={fonts}
  ...
/>
```

| Field | Purpose |
|-------|---------|
| `id` | Stored on `MarkupText.fontId` (must not be `'default'` for extras) |
| `label` | Shown in the font row and dropdown |
| `family` | CSS `font-family` stack written to `MarkupText.fontFamily` at selection time |

`resolveMarkupFonts(fonts, defaultLabel)` (exported from the React package)
prepends the built-in default entry. Selection persists in markup state and is
used by `textFontString` / `renderMarkup` for canvas paint and export.

**Chatimio profile editor** (`SettingsProfileEdit.tsx`) passes a single Serif
example for dogfood testing.

### Labels

Typography strings live under `labels.markup`:

```tsx
labels={{
  tools: { annotate: 'Markup' },
  markup: {
    typography: 'Text style',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strikethrough: 'Strikethrough',
    fontDefault: 'Default',
    fontFamily: 'Font',
    decreaseFontSize: 'Decrease text size',
    increaseFontSize: 'Increase text size',
    alignLeft: 'Align left',
    alignCenter: 'Align center',
    alignRight: 'Align right',
    alignJustify: 'Justify',
    color: 'Color',
    duplicate: 'Duplicate',
    trash: 'Delete',
    colorPicker: 'Color picker',
  },
}}
```

Chatimio maps these via `settings.editor.markup.*` in `@/i18n`.

### Components & exports

| Export | Role |
|--------|------|
| `MarkupLayer` | Canvas overlay + badges + inline text editor |
| `MarkupTextBadge` | Text contextual badge + Aa panel |
| `MarkupShapeBadge` | Shape contextual badge (fill / stroke / opacity) |
| `EditorMarkupToolbar` | Bottom tray (tools, color well, sub-options) |
| `ImageEditorFont` | Type for the `fonts` prop |
| `resolveMarkupFonts` | Default + host font list helper |
| `defaultTextBadgeLabels` | English defaults for badge / Aa strings |

Core re-exports: `MarkupText`, `MarkupTextAlign`, `DEFAULT_MARKUP_FONT_ID`,
`DEFAULT_MARKUP_FONT_FAMILY`, `resolveMarkupFontFamily`, `layoutTextLines`.

---

## Changelog (doc sync)

### 2026-10-05 (site color)

- Optional `brandColor` on `ImageEditor`. One color is mixed in `oklch` into the default chrome. No color leaves the defaults as they are.
- Accent and accent hover take about 32% of that color, accent soft about 18%, surfaces about 8%. `topbar`, `chrome-slot`, and `viewport-area` stay `#ffffff` / `#050404` unless `brandColorAffectsBackground` is `true`.
- Dark theme only swaps the `--ie-*-base` values. `colors` / `darkColors` still replace a token outright.

### 2026-10-05 (inline padding and radius)

- Inline editor accepts `--ie-inline-padding` and `--ie-inline-radius` on the host. Defaults stay flush and square. Fullscreen ignores both.

### 2026-10-02 (export result host)

- `exportResultContainer` on `ImageEditor` places `.ie-export-result` in a chosen element (selector, element, or ref), the same kind of target as `container`.
- Omit it and the result stays where `<ImageEditor />` is rendered. Ignored for `exportView="preview"`.
- The demo sends On page results into `.stage`.

### 2026-10-01 (built-in locales)

- `locale` on `ImageEditor`: `en` (default), `tr`, `jp`. Catalogs live in `src/i18n`. `labels` still overrides.
- The demo header switches language. The subtitle explains that the editor follows that choice.

### 2026-10-01 (host shell)

- Renamed the public component to `ImageEditor`. `ImageEditorModal` remains as a deprecated alias.
- `presentation`: `"modal"` (default) or `"inline"`. Inline fills `container` (selector, element, or ref).
- `exportView`: `"preview"` (default, `.ie-export-preview`) or `"result"` (`.ie-export-result` in the page). `exportResultContainer` chooses that block's host.
- Documented `colors` / `darkColors` for `--ie-accent`, `--ie-accent-hover`, and `--ie-accent-soft`. The demo page uses those same tokens.

### 2026-08-15 (mobile chrome + Fill removed)

- Removed the **Fill** sidebar tool and its bottom strip. Letterbox fill still
  exists in core/export for existing snapshots; it is no longer editable in the
  modal.
- Mobile (`< 768px`): sidebar moves below the bottom-bar as a floating rounded
  pill. Logo is hidden. Cancel / Done become circular X / check buttons.
  Sub-toolbar and topbar stay in place.

### 2026-08-14 (mode transition animation)

- Sidebar tool switches crossfade chrome instead of mounting/unmounting it.
  Preset picker, sub-toolbar, mode-label, bottom-bar, and media-size fade and
  slide (`opacity` + `translateY`); slot height interpolates so the preview
  grows/shrinks with the chrome instead of jumping.
- Crop frame / mask already tweened; duration now shares `--ie-mode-duration`
  (200ms, `cubic-bezier(0.22, 1, 0.36, 1)`) with the chrome so image and UI
  move as one transition. Bottom bar and the mode-label pill fade only (no
  translate). `prefers-reduced-motion` collapses the duration.

### 2026-08-13 (Markup text Aa menu)

- Documented **Markup** sidebar tool: text selection badge, built-in
  **Aa** secondary menu (style / size / font / alignment rows).
- Added `fonts` prop on `ImageEditorModal` for host-provided text faces; Default
  system font always included.
- Extended `MarkupText` with `underline`, `strikethrough`, `justify` alignment,
  `fontId`, and `fontFamily`; canvas export renders decorations and justified lines.
- Font dropdown is a fixed overlay (portaled) — opening it does not shift the Aa
  panel or text badge.

### 2026-08-09 (Filter tool)

- New sidebar tool **Filter** — Filters carousel with live
  thumbnails and an intensity ruler.
- `FILTER_IDS` / `FilterState` registry in core `types.ts`; `filter` added to
  `EditorSnapshot` with `updateFilter` / `patchFilter` history verbs.
- `filter/filterLooks.ts`: ten parametric looks + `resolveFilterLook`, which
  applies intensity before the renderers see it.
- Filter block appended to the adjust fragment shader and mirrored in
  `applyAdjustments`; `draw(adjust, filter)` and
  `renderToCanvas2D(source, adjust, filter, out?)`.
- `useFilterThumbnails` bakes the composition once and re-grades per look.
- Shared GLSL helpers `vignette()` / `whiteBalance()` now back both the
  Calibrate channels and the filter block.

### 2026-08-09 (seven new Adjust channels)

- Added **Black Point, Vibrance, Highlights, Shadows, Sharpness, Brilliance,
  Definition** — 14 calibrate channels total.
- `ADJUST_CHANNELS` registry in core `types.ts` is now the single source of
  truth; `AdjustState` is derived from it and the GL uniform lookup, defaults,
  normalization and the React strip/label lists all iterate it.
- `defaultAdjustLabels` and `CHANNEL_UNIFORM` are total records, so a new
  channel cannot ship without a label and a uniform mapping.
- New `blurGuide.ts`: a 256px blurred copy of the frame uploaded as a second
  texture, giving Brilliance and Definition local neighbourhood brightness
  without framebuffer ping-pong. Rebuilt only on crop change.
- Shared shader/CPU constants (`BRILLIANCE`, `DEFINITION`, `BLACK_POINT_RANGE`,
  `HIGHLIGHTS_EV`, `SHADOWS_LIFT`) are interpolated into the GLSL, so preview
  and export cannot drift.
- Calibrate strip CSS is no longer keyed to a channel count.

### 2026-08-08 (Warmth / Tint WebGL white-balance)

- `adjust.warmth` / `adjust.tint` — Bradford CAT on Planckian + isotherm whites.
- New WebGL adjust pipeline for all Calibrate channels; CSS filters removed.
- Preview grades the cropped frame on GPU; export shares the same shader.

### 2026-08-08 (calibrate / adjust tool)

- Sidebar **Calibrate** (was `finetune`) — Adjust circles + ruler.
- `AdjustState` on the editor snapshot; adjustments run **after** crop/transform.

### 2026-08-08 (perspective / keystone tools)

- `TransformState.perspectiveX` / `perspectiveY` (−1…1), rendered as a real
  4-point homography — CSS `matrix3d` for preview, grid-subdivided canvas warp
  for export. No CSS `skew`, no new dependencies.
- Vertical / Horizontal perspective circles added to the mode strip beside
  Scale, each driving a −100…100 ruler with magnetic return to neutral.
- Coverage constraint gained a convex-quad path so the crop frame stays inside
  the keystoned outline; the rectangle fast path is unchanged.
- Replaces the earlier H/V straighten badges, which duplicated Rotation.

### 2026-08-07 (frame aspect + handle/zoom split)

- Default crop frame aspect matches the **media** when the preset does not lock one (16:9 photo → 16:9 preview).
- Handle drag resizes the frame only; zoom is compensated so it does not look like pinch-zoom.
- Wheel/trackpad/pinch scale only while the pointer is **inside** the preview viewport (native port notes in `CropViewport.tsx`).
- Rotation/Scale circles: horizontal snap scroll; ruler swaps only after scroll/tap settles. Dual-ring progress persists in editor state.
- Preset picker is a **fixed bar under the topbar** (not draggable / not over the canvas).
- Eight crop handles are **2px**, tangent to the frame; decorative only — crop frame size does not change on handle drag.
- Rule-of-thirds grid **fades in while panning/pinching** and fades out on release.
- Bottom bar: **Rotation** and **Scale** mode circles (tap or horizontal swipe). Scale uses a **0–100** ruler mapped to zoom.
- While rotating, crop frame corners stay inside the image (see **Coverage constraint** above).

### 2026-08-07 (velocity-based slope length)

- Trail/slope length scales with scroll speed: slow → neighbor only; faster → longer ramp; decays on release.

### 2026-08-07 (one-sided trailing tick ramp)

- Replaced center bell-curve heights with sheet-style trail: peak at main tick; +values ramp on the left, −values on the right.
- Center marker is a grey dot; main tick uses active sign color.

### 2026-08-07 (tick heights from live center distance)

- Tick heights driven every frame by real scroll→center distance (rAF + direct DOM), not independent per-tick animations.

### 2026-08-07 (rotation ruler scroll)

- Ruler is natively horizontally scrollable (hidden scrollbar) on desktop and mobile: touch pan, click-drag, wheel/trackpad, arrow keys.

### 2026-08-07 (rotation ruler polish)

- Tick heights animate from center distance while dragging; spring back on release (`animateTicks`, default `true`).
- Angle badge: dual-layer circular border (inactive opacity + active arc); always enabled.
- Sign-based colors: ≤0 → black, >0 → brand accent; overridable via `negativeColor` / `positiveColor` and CSS vars.
- Positive arc clockwise, negative counter-clockwise; live drag + short settle on release.
- Documented in this file under **Rotation ruler (scale behavior)**.

### 2026-08-07 (crop UI)

- Rebuilt crop UI to match the built-in crop UI: fixed frame, L-handles, thirds grid, dimmed outside.
- Added `RotationRuler` (−45…+45) with gold accent badge and tick marks.
- Added `TransformState.angle` for continuous rotation; export/draw pipeline updated.
- `computePixelCrop` aligned with cover-frame preview math (frame size = export container).
- Responsive shell: mobile full-screen, desktop floating panel.
- Presets tuned for minimal chrome (`profile` is the closest to the reference).

### 2026-08-07 (earlier)

- Added **canvas overlay preset picker** (`EditorPresetPicker`): default top-center on canvas, draggable, optional `localStorage` position.
- Moved preset selection UI from Settings profile page **into the editor modal**.
- Documented **no i18n in library** policy; English defaults + optional `labels` / `presetPicker.presetLabels`.
- Presets: `default`, `selection`, `outside`, `profile`.
- Chatimio: profile photo editor with preset picker for dogfood testing.

### Earlier (Phase 1)

- Created `@chatimio/image-editor-core` and `@chatimio/react-image-editor`.
- `ImageEditorModal` with sidebar, top bar, sub-toolbar, bottom sliders.
- EXIF orientation (inline parser, no exifr).
- `cropOutsideImage` support in core export.
- Blob URL preview fix (revoke timing).
- Auth fix: `updateUser` instead of wiping JWT via `cookie-based` token.
- Vite source aliases for package HMR.

---

## Troubleshooting

| Issue | Cause / fix |
|-------|-------------|
| Blank preview | Blob URL revoked too early; ensure `useImageEditor` keeps URL until unmount |
| Upload 401 | Do not call `setCredentials({ token: 'cookie-based' })` on profile update; use `updateUser` |
| CSS not loading | Import `@chatimio/react-image-editor/styles.css`; check Vite alias order |
| Types not found | Run `npm run build:packages` or use Vite source aliases |
| Preset picker not visible | Pass `onPresetChange`; picker only shows when this callback is set |

---

## Related files

| Path | Purpose |
|------|---------|
| `packages/react-image-editor/README.md` | Short package readme |
| `packages/image-editor-core/README.md` | Core readme |
| `frontend/src/config/imageEditor.ts` | App preset registry |
| `frontend/vite.config.ts` | Dev aliases |
| `packages/react-image-editor/src/components/MarkupTextBadge.tsx` | Text badge + Aa typography panel |
| `packages/react-image-editor/src/components/MarkupLayer.tsx` | Markup canvas overlay |
| `packages/react-advanced-image-editor/image-editor-library.md` | **This document** |
