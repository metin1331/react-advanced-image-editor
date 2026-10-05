# Usage

## Open and close

`open` controls whether the editor is mounted. `onCancel` is called from Cancel and from a backdrop click on the modal. The component does not set `open` itself. Set it to `false` in `onCancel` and, if you want the editor to close after a successful save, in `onExport`.

```tsx
<ImageEditor
  open={open}
  src={file}
  onExport={(blob) => {
    save(blob);
    setOpen(false);
  }}
  onCancel={() => setOpen(false)}
/>
```

While `open` is false, the editor tree is not rendered. A floating export preview can remain after close when `exportView` is `"preview"` (the default) and `showExportPreview` is true.

## Image input

`src` accepts the core `ImageSource` union:

- `File`
- `Blob`
- `string` (URL or object URL)
- `HTMLImageElement`
- `HTMLCanvasElement`
- `null` (editor can be open, but there is nothing to edit until a source arrives)

HEIC and HEIF files are converted inside the core loader.

## Export

`onExport` receives one `Blob`. The MIME type follows `exportOptions.format`, or the preset default when you omit it.

| Preset | Default format | Default quality |
| --- | --- | --- |
| `default` | `image/jpeg` | `0.92` |
| `selection` | `image/jpeg` | `0.92` |
| `outside` | `image/png` | `1` |
| `profile` | `image/jpeg` | `0.9` |

```tsx
<ImageEditor
  open={open}
  src={file}
  exportOptions={{ format: 'image/webp', quality: 0.85, maxWidth: 1600 }}
  onExport={(blob) => upload(blob)}
  onCancel={() => setOpen(false)}
/>
```

`maxWidth` and `maxHeight` are optional caps. Omit both to keep the crop's pixel size. Allowed `format` values are `image/jpeg`, `image/png`, and `image/webp`.

After Done, the UI also shows a result on screen:

- `exportView="preview"` (default): floating `.ie-export-preview` with download and close. `showExportPreview={false}` hides it.
- `exportView="result"`: in-flow `.ie-export-result` instead of the floating card. `exportResultContainer` portals that block into another element. Omit the container and the block renders where `<ImageEditor />` sits.

`showExportPreview` is ignored when `exportView` is `"result"`.

## Where the editor is drawn

`presentation` defaults to `"modal"`. The modal is portaled to `document.body`, so custom properties set on a page wrapper do not inherit into it.

`presentation="inline"` fills a host. `container` is a CSS selector, an `HTMLElement`, or a ref `{ current: HTMLElement | null }`. The host needs a height. The editor fills that box. Omit `container` and the inline editor renders in place.

```tsx
<ImageEditor
  open={open}
  src={file}
  presentation="inline"
  container=".stage"
  onExport={save}
  onCancel={close}
/>
```

Padding and corner radius for inline mode come from the host:

```css
.stage {
  --ie-inline-padding: 16px;
  --ie-inline-radius: 18px;
}
```

Both default to `0`. Fullscreen clears them.

## Presets

`preset` defaults to `"default"`.

| `preset` | Layout | Crop outside the image | Notes from `editorPresets` |
| --- | --- | --- | --- |
| `default` | `full` | no | Free aspect, pan, zoom 1–4, JPEG |
| `selection` | `compact` | no | `guides: ['rect']`, pan, JPEG |
| `outside` | `full` | yes | Zoom can go down to `0.25`, PNG |
| `profile` | `compact` | no | Aspect `1`, `guides: ['circle']`, crop-shape tool off, JPEG |

`features`, `crop`, `exportOptions`, `cropOutsideImage`, `interactionMode`, and `layout` merge on top of the preset. See [API](./api.md).

`interactionMode` is `'pan' | 'selection'`. Every built-in preset sets `'pan'`. Pass `interactionMode="selection"` yourself if you want that mode.

The preset bar is a separate control. It renders on the Crop tool when `onPresetChange` is set and `presetPicker.options` lists more than one preset. One option hides the bar and locks that preset.

## Language and theme

`locale` is `"en"` (default), `"tr"`, or `"jp"`. `labels` still overrides individual strings.

`theme` is `"light"` (default) or `"dark"`.

## Fullscreen

The sidebar has an icon-only fullscreen control. It sets `position: fixed; inset: 0` on the editor root inside the page. It does not call the browser Fullscreen API. The control is hidden at `max-width: 480px`, and an active fullscreen exits if the viewport shrinks to that width.
