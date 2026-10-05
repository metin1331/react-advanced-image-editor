# Troubleshooting

## The editor has no styles

Import `react-advanced-image-editor/styles.css` once. The component does not inject it. `unstyled` does not remove the sheet. It only skips the `ie-modal-root` class.

## Brand or theme colors never show up

The modal renders on `document.body`. Custom properties on a parent in your page do not inherit. Pass `brandColor`, `colors`, or `darkColors`, or write CSS against `[data-ie-root]`.

## Topbar stays white when brandColor is set

That is the default. `brandColorAffectsBackground` defaults to `false`, so topbar, chrome-slot, and viewport-area stay `#ffffff` / `#050404`. Set the prop to `true` to mix those three. Sidebar, border, and overlay still mix at 8% as soon as `brandColor` is set, even when the flag is false.

## Inline editor is invisible or zero height

`presentation="inline"` fills the host. The host needs a height. The editor does not grow it. Fullscreen overrides the inline inset with `inset: 0` and sets `border-radius: 0`.

## Fullscreen does nothing on a phone

The control calls no Fullscreen API. The root gets `position: fixed; inset: 0` and `border-radius: 0`. At `max-width: 480px` the button is `display: none` and the component forces fullscreen off.

## Opening zoom is not 2.5

`ImageEditor`'s `initialZoom` parameter defaults to `1`. A comment on the prop says `2.5`, and core exports `DEFAULT_INITIAL_CROP_ZOOM` as `2.5`. Pass `initialZoom={2.5}` if you want that value. It is still clamped to the preset range (`1`–`4`, or `0.25`–`4` for `outside`).

## Export is smaller than the file I opened

The loader caps the working image. `getMaxWorkingEdge()` is `2048` on a constrained device and `4096` otherwise. Constrained means `isConstrainedDevice()` is true (mobile WebKit user agent or `navigator.deviceMemory` of 4 or less). Preview bakes for calibrate and filter use `1600` on those devices and `4096` otherwise. `clampCanvasSize` also refuses canvases above 16,777,216 pixels. `exportOptions.maxWidth` / `maxHeight` cap the file you receive on top of that.

## HEIC fails to decode

HEIC/HEIF goes through `heic-to`, a dependency of `react-advanced-image-editor-core`. The file input should accept `.heic` and `.heif` as well as `image/*`. A browser that cannot run that conversion will surface a load error in the editor.

## Done fires but I have no file

`onExport` receives the `Blob`. The component does not upload or download it for you. The floating preview (`exportView="preview"`) has its own download control. If you set `showExportPreview={false}` and do not store the blob, the result is discarded when the callback returns.

## `onExport` and a closed editor

Closing is your state update. Call `setOpen(false)` inside `onExport` or `onCancel`. With `exportView="preview"`, the card can remain after `open` becomes false.

## Preset bar is missing

The bar renders only while the Crop tool is active, `onPresetChange` is set, and `presetPicker.options` has more than one id. One option, another sidebar tool, or omitting the callback hides it.

## `title` does nothing

`title` is on `ImageEditorProps` and is not read in `ImageEditor`.

## Types cannot find `ExportOptions`

Import it from `react-advanced-image-editor-core`. The React package does not re-export it.
