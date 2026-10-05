# API

Import the React package for the editor. Types such as `ExportOptions` and `ImageSource` are declared in `react-advanced-image-editor-core` and are not re-exported from `react-advanced-image-editor`. You can still pass them through `ImageEditor` props without importing the core package.

```ts
import { ImageEditor } from 'react-advanced-image-editor';
import type { ImageEditorProps } from 'react-advanced-image-editor';
import 'react-advanced-image-editor/styles.css';
```

## ImageEditor

`ImageEditor` is the editor. `ImageEditorModal` is a deprecated alias with the same props.

### Props

Runtime defaults are the parameter defaults in `ImageEditor`. Where a comment in `types.ts` disagrees, this table follows the parameter.

| Prop | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `open` | `boolean` | — | yes | Mounts the editor while `true`. |
| `src` | `ImageSource \| null` | — | yes | `File`, `Blob`, URL string, `HTMLImageElement`, or `HTMLCanvasElement`. `null` leaves the editor without an image. |
| `onExport` | `(blob: Blob) => void \| Promise<void>` | — | yes | Called with the encoded image when Done finishes. |
| `onCancel` | `() => void` | — | yes | Cancel button and modal backdrop. |
| `presentation` | `'modal' \| 'inline'` | `'modal'` | no | Modal portals to `document.body`. Inline fills `container` or the component's place in the tree. |
| `container` | `ImageEditorContainer` | — | no | CSS selector, element, or `{ current }` ref. Used when `presentation` is `'inline'`. |
| `preset` | `'default' \| 'selection' \| 'outside' \| 'profile'` | `'default'` | no | Starting config. See [presets](#presets). |
| `features` | `Partial<ImageEditorFeatures>` | preset | no | Turns chrome on or off. Merged onto the preset. |
| `title` | `string` | — | no | Present on the props type. The component does not read it. |
| `crop` | `CropConfig` | preset | no | `aspectRatio` (`number \| null`) and `guides` (`'circle' \| 'rect'`). |
| `exportOptions` | `ExportOptions` | preset | no | `format`, `quality`, optional `maxWidth`, `maxHeight`, `cropOutsideImage`. |
| `cropOutsideImage` | `boolean` | preset | no | Frame may extend past the image. Also copied into export options when `exportOptions.cropOutsideImage` is omitted. |
| `interactionMode` | `'pan' \| 'selection'` | preset (`'pan'` for all four) | no | How the crop surface treats the pointer. |
| `layout` | `'full' \| 'compact' \| 'minimal'` | preset | no | Sets `data-ie-layout`. CSS widens the modal only for `'full'`. |
| `className` | `string` | — | no | Extra class on the root. |
| `classNames` | `ImageEditorClassNames` | `{}` | no | Extra classes. Applied keys: `root`, `backdrop`, `panel`, `sidebar`, `sidebarButton`, `topbar`, `workspace`, `subToolbar`, `viewport`, `canvas`, `cropOverlay`, `cropGuide`, `bottomBar`, `button`, `doneButton`. `header`, `title`, `toolbar`, `footer`, `buttonActive`, and `presetPicker` are on the type and are not read. |
| `unstyled` | `boolean` | `false` | no | When `true`, the root does not get the `ie-modal-root` class. The stylesheet is unchanged. |
| `labels` | `Partial<ImageEditorLabels>` | locale catalog | no | String overrides. Merged on top of `locale`. |
| `onPresetChange` | `(preset: ImageEditorPreset) => void` | — | no | When set, the Crop tool is active, and more than one picker option exists, shows the preset bar. |
| `presetPicker` | `PresetPickerConfig` | — | no | Options, labels, and group label. `position`, `onPositionChange`, and `positionStorageKey` are deprecated and ignored. |
| `animateTicks` | `boolean` | `true` | no | Tick-height animation on the rotation ruler while dragging. |
| `tickWidth` | `number` | `2.2` | no | Minor ruler tick width in px. The type comment says `2`; the parameter default is `2.2`. |
| `majorTickWidth` | `number` | `2.2` | no | Major tick width in px. The type comment says it follows `tickWidth`; the parameter default is `2.2`. |
| `negativeColor` | `string` | theme `--ie-ruler-negative` | no | Ruler color when the value is `<= 0`. |
| `positiveColor` | `string` | `--ie-accent` | no | Ruler color when the value is `> 0`. |
| `modeRingColors` | `Partial<ModeRingColors>` | CSS tokens | no | Flat track and progress colors for the mode rings. |
| `darkModeRingColors` | `Partial<ModeRingColors>` | `modeRingColors` | no | Used when `theme` is `'dark'`. |
| `theme` | `'light' \| 'dark'` | `'light'` | no | Sets `data-ie-theme`. |
| `locale` | `'en' \| 'tr' \| 'jp'` | `'en'` | no | Built-in messages. |
| `colors` | `Partial<ImageEditorThemeColors>` | — | no | Inline `--ie-*` overrides for light theme. |
| `darkColors` | `Partial<ImageEditorThemeColors>` | — | no | Inline `--ie-*` overrides when `theme` is `'dark'`. |
| `brandColor` | `string` | — | no | Sets `--ie-brand` when the string is non-empty. |
| `brandColorAffectsBackground` | `boolean` | `false` | no | With a non-empty `brandColor`, sets `data-ie-brand-bg="true"` so topbar, chrome-slot, and viewport-area backgrounds mix the brand color. |
| `showExportPreview` | `boolean` | `true` | no | Floating preview after Done. Ignored when `exportView` is `'result'`. |
| `exportView` | `'preview' \| 'result'` | `'preview'` | no | Floating card or in-flow result block. |
| `exportResultContainer` | `ImageEditorContainer` | — | no | Mount point for `.ie-export-result`. |
| `initialZoom` | `number` | `1` | no | Opening zoom relative to cover, clamped to the preset min/max. The type comment says `2.5`; the parameter default is `1`. `DEFAULT_INITIAL_CROP_ZOOM` in core is `2.5` and is not what `ImageEditor` passes. |
| `fonts` | `ImageEditorFont[]` | — | no | Extra markup text fonts. Each item is `{ id, label, family }`. |
| `showMediaSize` | `boolean` | `true` | no | Original pixel size in the crop chrome. |

```tsx
<ImageEditor
  open={open}
  src={file}
  theme="dark"
  locale="tr"
  preset="profile"
  brandColor="oklch(55.5% 0.46 16.439)"
  onExport={(blob) => save(blob)}
  onCancel={() => setOpen(false)}
/>
```

### Callbacks

| Callback | When it runs |
| --- | --- |
| `onExport` | Done has encoded a `Blob`. |
| `onCancel` | Cancel, or a click on the modal backdrop. |
| `onPresetChange` | A preset is chosen in the preset bar. The bar also requires this callback, the Crop tool, and more than one option. |
| `presetPicker.onPositionChange` | Never. Deprecated no-op. |

There is no `onChange` for crop, filter, or markup. Those stay inside the component until export.

## Presets

`editorPresets` and `resolveEditorConfig` implement this table. `features` below are the preset values. Every preset starts from the same feature set: sidebar, tools, reset, top bar, undo/redo, sub-toolbar, rotate left, both flips, bottom bar, rotation, scale, perspective, and corner handles. `profile` sets `cropShape` to `false`.

| Preset | Layout | interactionMode | cropOutsideImage | minZoom | maxZoom | crop | export |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `default` | `full` | `pan` | `false` | `1` | `4` | free aspect, no guides | JPEG `0.92` |
| `selection` | `compact` | `pan` | `false` | `1` | `4` | free aspect, `guides: ['rect']` | JPEG `0.92` |
| `outside` | `full` | `pan` | `true` | `0.25` | `4` | free aspect, no guides | PNG `quality: 1` |
| `profile` | `compact` | `pan` | `false` | `1` | `4` | aspect `1`, `guides: ['circle']`, crop shape off | JPEG `0.9`, no max width |

`resolveEditorConfig` merges your `crop`, `exportOptions`, `features`, `cropOutsideImage`, `interactionMode`, and `layout` onto that preset. `createEditorConfig(features, overrides)` is the same merge starting from `default`.

Zoom limits come from the preset. Props do not include `minZoom` or `maxZoom`.

## Feature flags

`ImageEditorFeatures`:

| Key | Default in `default` | What it gates |
| --- | --- | --- |
| `sidebar` | `true` | Sidebar column. |
| `sidebarTools` | `true` | Tool buttons. |
| `resetButton` | `true` | Reset. |
| `topBar` | `true` | Top bar. |
| `undoRedo` | `true` | Undo and redo. |
| `subToolbar` | `true` | Rotate and flip row. |
| `rotateLeft` | `true` | Quarter-turn control. |
| `flipHorizontal` | `true` | Horizontal flip. |
| `flipVertical` | `true` | Vertical flip. |
| `cropShape` | `true` (`false` on `profile`) | Crop-shape panel. |
| `bottomBar` | `true` | Tool strips under the image. |
| `rotationTab` | `true` | Rotation mode. |
| `scaleTab` | `true` | Scale mode. |
| `perspectiveTab` | `true` | Vertical and horizontal perspective. |
| `cornerHandles` | `true` | Crop handles. |

## ExportOptions

From `react-advanced-image-editor-core`:

| Field | Type | Description |
| --- | --- | --- |
| `format` | `'image/jpeg' \| 'image/png' \| 'image/webp'` | Encoded MIME type. |
| `quality` | `number` | Encoder quality. PNG presets pass `1`. |
| `maxWidth` | `number` | Optional output cap. Omit both caps to keep the crop size. |
| `maxHeight` | `number` | Optional output cap. |
| `cropOutsideImage` | `boolean` | Included in the resolved export options. |

## Theme color keys

`colors` and `darkColors` map to inline custom properties. An empty string is ignored. These override the stylesheet mixes.

| Key | CSS variable |
| --- | --- |
| `accent` | `--ie-accent` |
| `accentHover` | `--ie-accent-hover` |
| `accentSoft` | `--ie-accent-soft` |
| `accentText` | `--ie-accent-text` |
| `bg` | `--ie-bg` |
| `bgMuted` | `--ie-bg-muted` |
| `bgSidebar` | `--ie-bg-sidebar` |
| `border` | `--ie-border` |
| `text` | `--ie-text` |
| `textMuted` | `--ie-text-muted` |
| `overlay` | `--ie-overlay` |
| `cropBorder` | `--ie-crop-border` |
| `cropHandle` | `--ie-crop-handle` |
| `grid` | `--ie-grid` |
| `chromeHover` | `--ie-chrome-hover` |
| `chromeActive` | `--ie-chrome-active` |
| `rulerNegative` | `--ie-ruler-negative` |
| `rulerPositive` | `--ie-ruler-positive` |
| `rulerTick` | `--ie-ruler-tick` |
| `rulerTickMajor` | `--ie-ruler-tick-major` |

`brandColor` and the sheet backgrounds are not in this map. Set those with `brandColor` or CSS.

## ModeRingColors

Every ring is two flat colors: a track (full circle) and a progress arc. Keys: `rotationNegativeTrack`, `rotationNegativeProgress`, `rotationPositiveTrack`, `rotationPositiveProgress`, `scaleTrack`, `scaleProgress`, `horizontalTrack`, `horizontalProgress`, `verticalTrack`, `verticalProgress`, `calibrateTrack`, `calibrateProgress`, `calibrateNegativeTrack`, `calibrateNegativeProgress`.

CSS variables use the same names with an `--ie-mode-` prefix, for example `--ie-mode-scale-track`. The comment table on `ModeRingColors` in `types.ts` lists different default hex values than `default.css`. The stylesheet is what renders. See [styling](./styling.md).

## Labels

`labels` is a deep partial of `ImageEditorLabels`. Built-in catalogs are `en`, `tr`, and `jp` (`editorLocales`). `defaultLabels` is the English fallback.

`labels.tools.finetune` is deprecated. Use `labels.tools.calibrate`.

`labels.tools.fill` and `labels.fillModes` are merged, but no Fill sidebar tool is rendered.

## Data attributes

Set on the root or slots by `ImageEditor`:

| Attribute | Values |
| --- | --- |
| `data-ie-root` | Present on the editor root. |
| `data-ie-presentation` | `modal` or `inline`. |
| `data-ie-theme` | `light` or `dark`. |
| `data-ie-skin` | Always `ios`. There is no skin prop. |
| `data-ie-layout` | `full`, `compact`, or `minimal`. |
| `data-ie-preset` | Active preset id. |
| `data-ie-fullscreen` | `true` while the CSS fullscreen mode is on. |
| `data-ie-brand-bg` | `true` only when `brandColor` is non-empty and `brandColorAffectsBackground` is true. |
| `data-ie-part` | Slot name: `backdrop`, `panel`, `sidebar`, `sidebar-logo`, `sidebar-fullscreen`, `main`, `topbar`, `button`, `done-button`, `workspace`, `loading`, `sub-toolbar`, `viewport-area`, `mode-label`, `bottom-bar`, `media-size`. |
| `data-ie-action` | `cancel`, `undo`, `redo`, `reset` on those buttons. |
| `data-ie-tool` | `crop-shape`, `crop`, `calibrate`, `filter`, `annotate`, `redact`, `frame` on bottom bars. |
| `data-ie-active` | `true` on the fullscreen control while fullscreen is on, and on active sub-toolbar buttons. |
| `data-ie-inline-slot` | Wrapper used for inline presentation. |

`data-ie-crop-faded`, `data-ie-markup-mode`, `data-ie-markup-fade`, `data-ie-eyedrop`, and `data-ie-chrome-fade-kind` are internal gesture state. Do not depend on them as a public API.

## Other React exports

These are exported from the package entry. `ImageEditor` is the integration most apps need. The rest are the pieces the editor is built from. Prop types that are exported: `RotationRulerProps`, `MarkupLayerProps`, `EditorStickerSheetProps`, `StickerPick`, `EditorColorPickerProps`, `ColorPickerLabels`, `ColorPickerTab`, `MarkupShapeBadgeLabels`, `MarkupTextBadgeLabels`, `MarkupToolbarLabels`, `SidebarToolItem`, `FilterThumbnails`, `UseImageEditorReturn`.

| Export | Kind |
| --- | --- |
| `ImageEditor`, `ImageEditorModal` | Components |
| `useImageEditor` | Hook. `(source, options?: { initialZoom?: number })`. |
| `editorPresets`, `resolveEditorConfig`, `createEditorConfig` | Preset helpers |
| `editorLocales`, `editorLocaleNames`, `editorLocaleIntro`, `editorMessages`, `resolveEditorLocale` | i18n |
| `CropViewport`, `computeIosFrameSize` | Crop surface |
| `RotationRuler` | Ruler |
| `EditorModeStrip`, `EditorModeBadge`, `EditorPerspectiveBadge` | Mode strip |
| `EditorCalibrateStrip`, `CALIBRATE_CHANNELS` | Calibrate UI |
| `EditorFilterStrip`, `FILTER_STRIP_IDS` | Filter UI |
| `EditorMarkupToolbar`, `MARKUP_PRESET_COLORS`, `MARKUP_STROKE_WIDTHS`, `MARKUP_SHAPE_KINDS`, `defaultMarkupLabels` | Markup UI |
| `MarkupLayer`, `MarkupSignaturePad`, `MarkupShapeBadge`, `MarkupTextBadge` | Markup layers |
| `EditorStickerSheet`, `EditorStickerPicker`, `EditorColorPicker` | Pickers |
| `EditorSidebarTools` | Sidebar |
| `ExportResultPreview` | Result block |
| `useFilterThumbnails` | Filter thumbnail hook |
| `defaultLabels`, `defaultPresetLabels`, `defaultAdjustLabels`, `defaultFilterLabels`, `DEFAULT_PRESET_PICKER_OPTIONS` | English copy and preset ids |
| `adjustChannels`, `filterIds` | Re-exports of the core channel and filter lists |
| `DEFAULT_INITIAL_CROP_ZOOM` | Core constant `2.5` |
| Crop-shape helpers | `CROP_SHAPE_OPTION_IDS`, `defaultCropShapeLabels`, `getCropShapePanelOptionIds`, `getCropShapeRatioOptionIds`, `initialCropOrientation`, `normalizeCropShapeId`, `resolveCropShapeAspect` |

`useImageEditor` loads `src`, keeps history, and returns the state slices the UI edits: `loaded`, `loading`, `error`, `crop`, `transform`, `adjust`, `filter`, `markup`, `fill`, `redact`, `frame`, `cropShape`, setters and patch functions, `undo`, `redo`, `reset`, `rotate`, `flip`, `canUndo`, `canRedo`, `viewportRef`, `setViewportRef`, `viewportSize`, `cropFrameSize`, `setCropFrameSize`, `getMediaSize`, and `exportEdited`. `exportEdited` throws `Error('No image loaded')` when nothing is loaded.

## Core package

`react-advanced-image-editor-core` is the headless engine. It has no React peer dependency. `sideEffects` is `false`. Its entry is a single `dist/index.js` / `dist/index.cjs`.

App-facing functions:

| Export | Role |
| --- | --- |
| `loadImageSource` | Decode `ImageSource`, including HEIC via `heic-to`. |
| `isHeicSource`, `convertHeicToJpeg` | HEIC helpers. |
| `exportImage`, `renderToCanvas`, `downscaleBlob` | Encode the editor state. |
| `createHistory`, `undoHistory`, `redoHistory`, `canUndo`, `canRedo`, `resetHistory` | History. |
| `createDefaultAdjust`, `createDefaultFilter`, `createDefaultMarkup`, `createDefaultFill`, `createDefaultRedact`, `createDefaultFrame` | Empty states. |
| `ADJUST_CHANNELS`, `FILTER_IDS`, `FRAME_PRESET_IDS`, `FILL_MODES`, `REDACT_STYLES` | Registries. |
| `isConstrainedDevice`, `getMaxWorkingEdge`, `getMaxPreviewEdge`, `clampCanvasSize` | Working-size caps used while loading. See [troubleshooting](./troubleshooting.md). |

The same entry also exports crop math, perspective, markup geometry, sticker rendering, and WebGL adjust helpers. The list is `packages/react-advanced-image-editor-core/src/index.ts`. Those symbols are public, but they are the engine `ImageEditor` already calls.
