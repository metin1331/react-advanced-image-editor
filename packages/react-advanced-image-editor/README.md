# react-advanced-image-editor

React image editor with crop, rotate, markup, filters, and export. Default look matches iPhone Photos.

## Install

```bash
npm install react-advanced-image-editor
```

```tsx
import { ImageEditor } from 'react-advanced-image-editor';
import 'react-advanced-image-editor/styles.css';

// Viewport modal (default)
<ImageEditor
  open={open}
  src={file}
  preset="default"
  onExport={save}
  onCancel={close}
/>

// Fill an element already on the page. The element needs a height.
<ImageEditor
  open={open}
  src={file}
  presentation="inline"
  container=".page"
  onExport={save}
  onCancel={close}
/>
```

`presentation` defaults to `"modal"`. `"inline"` fills `container` (a CSS selector, an element, or a ref). Omit `container` to render the editor where you place `<ImageEditor />`.

After Done, the floating `.ie-export-preview` card is shown. Pass `exportView="result"` to show an in-page `.ie-export-result` block instead. `exportResultContainer=".stage"` mounts that block inside another element; omit it to keep the block next to `<ImageEditor />`.

`ImageEditorModal` is a deprecated alias of `ImageEditor`.

`react-advanced-image-editor-core` is installed automatically as a dependency.

## Presets

| Preset | Use case |
|--------|----------|
| `default` | Full editor: sidebar, all tools, pan crop |
| `selection` | Compact; drag a crop rectangle on the image |
| `outside` | Crop extends beyond image bounds (PNG export) |
| `profile` | 1:1 circle guide, compact, JPEG 512px |

## License

MIT
