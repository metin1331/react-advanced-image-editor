# Features

`ImageEditor` mounts one chrome. The sidebar tools, in order, are Crop, Calibrate, Filter, Markup, Redact, and Frame. There is no Fill tool in that list. The core package can still paint a letterbox fill, and `labels.tools.fill` / `labels.fillModes` exist, but the React editor does not show a Fill control.

Undo, redo, and reset sit in the top bar when the matching feature flags are on. Done calls `onExport`. Cancel calls `onCancel`.

## Crop

The Crop tool frames the export. You pan the image under the frame, drag handles, and use the bottom strip for rotation, scale, and perspective (vertical and horizontal keystone).

`features.cropShape` (on in every preset except `profile`) adds a crop-shape panel: freeform, fixed ratios, and vertical/horizontal orientation. `crop.aspectRatio` locks a width/height ratio. `crop.guides` draws a circle, a rectangle, or nothing.

`cropOutsideImage` lets the frame extend past the photo. The `outside` preset turns that on and exports PNG. Other presets keep it off.

`interactionMode` is `'pan'` or `'selection'`. Every built-in preset uses `'pan'`.

`showMediaSize` (default `true`) prints the oriented pixel size in the crop chrome.

Related props: `preset`, `crop`, `cropOutsideImage`, `interactionMode`, `initialZoom`, `features`.

```tsx
<ImageEditor
  open={open}
  src={file}
  crop={{ aspectRatio: 4 / 5, guides: ['rect'] }}
  onExport={save}
  onCancel={close}
/>
```

## Calibrate

Calibrate is the adjust strip. Each channel is stored from `-1` to `1`. The UI shows `-100` to `100`. Channels, in `ADJUST_CHANNELS` order:

`brightness`, `contrast`, `blackPoint`, `saturation`, `vibrance`, `exposure`, `brilliance`, `highlights`, `shadows`, `vignette`, `warmth`, `tint`, `sharpness`, `definition`.

The live preview is drawn with WebGL. `labels.tools.finetune` is a deprecated alias of `calibrate`.

## Filter

The filter strip uses `FILTER_IDS`:

`original`, `vivid`, `vividWarm`, `vividCool`, `dramatic`, `dramaticWarm`, `dramaticCool`, `mono`, `silvertone`, `noir`.

`original` is the identity look. Intensity mixes the look toward identity.

## Markup

The sidebar id is `annotate`. The label in English is "Markup".

Drawing tools in the markup toolbar: move, pen, marker, pencil, eraser, lasso, ruler. The add menu also inserts text, shapes, stickers, and a signature. Shape kinds in `MARKUP_SHAPE_KINDS`:

`rect`, `roundRect`, `circle`, `triangle`, `hexagon`, `blockArrow`, `star`, `speech`, `arrow`.

`fonts` adds extra text families. A built-in Default system font is always present and is not listed in `fonts`.

```tsx
<ImageEditor
  open={open}
  src={file}
  fonts={[{ id: 'serif', label: 'Serif', family: 'Georgia, serif' }]}
  onExport={save}
  onCancel={close}
/>
```

## Redact

Redact paints regions that export as `pixelate`, `blur`, or `solid` (`REDACT_STYLES` in the core package). The control lives in the sidebar and in the bottom bar for that tool.

## Frame

Frame applies a preset border or mat. Preset ids are `FRAME_PRESET_IDS` in `react-advanced-image-editor-core`:

`none`, `thin`, `solid`, `thick`, `double`, `inner`, `outer`, `rounded`, `soft-round`, `polaroid`, `film`, `shadow`, `offset`, `editorial`, `classic`, `bleed`, `asymmetric`, `gallery`, `white-mat`, `black-mat`, `soft-shadow`, `hard-shadow`, `offset-shadow`, `floating`, `raised`, `inset`, `beveled`, `photo-card`, `vintage`, `modern-card`, `minimal-mat`, `double-shadow`, `outline-offset`, `layered`, `inner-shadow`, `outer-glow`, `perspective`, `compound`, `metal`, `center-shadow`.

`labels.frames` overrides the display names.

## Undo and redo

`features.undoRedo` (default `true`) shows undo and redo. History covers crop, transform, calibrate, filter, markup, redact, frame, and crop shape. `features.resetButton` shows reset.

## Export

Done encodes the current frame to a `Blob` and passes it to `onExport`. Format and quality come from the preset unless `exportOptions` overrides them. See [usage](./usage.md).

## Responsive UI

At `max-width: 767px` the sidebar moves to a horizontal pill under the image, and the scale mode is taken off the mode strip. At `max-width: 480px` the fullscreen control is hidden and an active fullscreen is cleared. The preset bar is shown only on the Crop tool, and only when `onPresetChange` is set and the picker has more than one option.

On viewports at least `768px` wide, the modal panel is `min(100%, 640px)` by `min(94vh, 780px)`. `data-ie-layout="full"` widens that to `min(100%, 920px)` by `min(92vh, 720px)`. `compact` and `minimal` use the smaller size. No other layout behavior is implemented in script.

## Themes

`theme="light"` or `theme="dark"` switches the token set on `[data-ie-theme]`. `brandColor` mixes one color into the chrome. Details are in [theming](./theming.md).
