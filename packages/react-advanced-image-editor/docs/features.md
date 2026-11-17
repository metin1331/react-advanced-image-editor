# Features

`ImageEditor` mounts one chrome. The sidebar tools, in order, are Crop, Calibrate, Filter, Markup, Fill, Redact, Frame, and Resize. Fill is omitted when `enableFill` is `false`. Resize is omitted when `enableResize` is `false`.

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

Drawing tools in the markup toolbar: move, pen, marker, pencil, eraser, lasso, ruler. The add menu also inserts text, shapes, an image sticker, stickers, and a signature. Add Image places the chosen file on the photo the same way an emoji sticker is placed.

Strokes, text, shapes, and stickers stick to the photo. Rotate, flip, or tilt the image and they move with those pixels. Panning the crop moves them with the photo, not with the crop window.

A selected shape's badge has a lock button to the right of Duplicate. The closed lock keeps that shape on the photo. The open lock sticks it to the crop frame, so rotating or panning the photo leaves that shape in place.

Shape kinds in `MARKUP_SHAPE_KINDS`:

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

## Fill

Fill replaces the transparent pixels of the image with a color, another image, or a blurred copy of the photo. Opaque photos do not change, because they have no transparent pixels. Open a PNG (or WebP) that has transparency, then choose Fill. The tool starts on Color, at white.

Color, Blur, and Image sit in the sub-toolbar, in that order. Image opens the file picker. Color uses the same carousel as Filter: thumbs are `.ie-fill-color-thumb`, and `.ie-fill-color-select` sits on the centered color. White and black sit immediately left of red. They are flat `#ffffff` and `#000000`, and they have no shade ruler. An invisible spacer keeps the ruler's height so the bar does not jump. The pen button (`.ie-fill-color-add`) is the first cell in the color track, the same size as a thumb, with a transparency checker behind the icon. Clicking or tapping it slides the selection frame onto the pen and opens the same color sheet Markup uses. Scrolling cannot park the frame there. For the other colors, the ruler under the strip is 0–100. Its center tick is shade 500, and choosing another color returns the ruler to that center. Left lightens through 400, 300, 200, 100, and 50. Right darkens through 600, 700, 800, 900, and 950. Positions between those stops blend the neighboring OKLCH colors, and the centered thumb shows that blend. Blur uses `fill.blur` from `0` to `1` (default `0.55`). Until Fill is opened, `none` leaves the pixels transparent.

`enableFill` defaults to `true`. `enableFill={false}` removes the sidebar tool and the bottom bar, clears the fill, and exports the transparent pixels unchanged.

While the editor is open, Ctrl+V pastes an image from the clipboard as the photo being edited. This works for both the modal and the inline (inside page) presentation. Text fields still receive a normal paste. Decoding uses the same loading indicator as opening a file.

`labels.tools.fill` names the sidebar tool. `labels.fillModes` covers the mode names and the custom-color button. Carousel names are White, Black, and the Tailwind family names (Red, Orange, Amber, and the rest of that palette).

The choice is part of undo history.

## Redact

Redact paints regions that export as `pixelate`, `blur`, or `solid` (`REDACT_STYLES` in the core package). The control lives in the sidebar and in the bottom bar for that tool.

## Frame

Frame applies a preset border or mat. Preset ids are `FRAME_PRESET_IDS` in `react-advanced-image-editor-core`:

`none`, `thin`, `solid`, `thick`, `double`, `inner`, `outer`, `rounded`, `soft-round`, `polaroid`, `film`, `shadow`, `offset`, `editorial`, `classic`, `bleed`, `asymmetric`, `gallery`, `white-mat`, `black-mat`, `soft-shadow`, `hard-shadow`, `offset-shadow`, `floating`, `raised`, `inset`, `beveled`, `photo-card`, `vintage`, `modern-card`, `minimal-mat`, `double-shadow`, `outline-offset`, `layered`, `inner-shadow`, `outer-glow`, `perspective`, `compound`, `metal`, `center-shadow`.

`labels.frames` overrides the display names.

## Resize

Resize sets the exported pixel width and height. Until you edit a field, the numbers follow the crop and frame. The link stays on, so a new width or height keeps that output aspect. Unlock the link to set the two sizes independently. Reset clears the custom size. The choice is not part of undo history. It clears when `src` changes, and it is restored when that size is in `imageState`. Values are clamped from 1 to 8192.

`enableResize` defaults to `true`. `enableResize={false}` removes the sidebar tool and the bottom bar, discards a custom size, and exports the crop and frame size only.

`labels.tools.resize` names the sidebar tool. `labels.resize` covers `width`, `height`, `lock`, `unlock`, and `reset`.

## Restore an edit

`onImageStateChange` receives the current edit whenever crop, transform, calibrate, filter, markup, fill, redact, frame, crop shape, or Resize changes. Store that object and pass it back as `imageState` the next time the same photo opens.

```tsx
const [imageState, setImageState] = useState<ImageEditorState | null>(null);

<ImageEditor
  open={open}
  src={file}
  imageState={imageState}
  onImageStateChange={setImageState}
  onExport={save}
  onCancel={() => setOpen(false)}
/>
```

The editor applies `imageState` once after that photo loads. Have it ready before the load finishes; a value that arrives later is left unused. Later updates from `onImageStateChange` do not reload the photo or wipe undo. Omit `imageState`, or pass `null`, to start from the original file. A new `src` needs its own state; clear the stored edit when the file changes.

The object is the current edit, not the undo stack. Closing the editor drops undo and redo. Resize is included (`resize`, `resizeLinked`) even though it is outside undo history. `fillFamily` and `fillShade` restore the Fill carousel. A pasted image (Ctrl+V) replaces the open photo and is not written into this object; the stored edit stays the one for `src`.

## Undo and redo

`features.undoRedo` (default `true`) shows undo and redo. History covers crop, transform, calibrate, filter, markup, fill, redact, frame, and crop shape. Resize is not in that history. `features.resetButton` shows reset.

## Export

Done encodes the current frame to a `Blob`. When Resize has a custom size and `enableResize` is `true`, that blob is scaled to those pixels before preview and before `onExport`. Format and quality come from the preset unless `exportOptions` overrides them. `maxWidth` / `maxHeight` still only shrink the blob passed to `onExport`. See [usage](./usage.md).

## Responsive UI

At `max-width: 767px` the sidebar moves to a horizontal pill under the image, and the scale mode is taken off the mode strip. At `max-width: 480px` the fullscreen control is hidden and an active fullscreen is cleared. The preset bar is shown only on the Crop tool, and only when `onPresetChange` is set and the picker has more than one option.

On viewports at least `768px` wide, the modal panel is `min(100%, 640px)` by `min(94vh, 780px)`. `data-ie-layout="full"` widens that to `min(100%, 920px)` by `min(92vh, 720px)`. `compact` and `minimal` use the smaller size. No other layout behavior is implemented in script.

## Themes

`theme="light"` or `theme="dark"` switches the token set on `[data-ie-theme]`. `brandColor` mixes one color into the chrome. Details are in [theming](./theming.md).
