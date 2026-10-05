# Examples

Samples 1 and 6 are complete components. Samples 2–5 show props only. `save`, `close`, `upload`, `setPreset`, `file`, and `open` stand for state you already have.

Each sample uses the published component API. Import the stylesheet once in the app:

```ts
import 'react-advanced-image-editor/styles.css';
```

## 1. Minimal editor

```tsx
import { useState } from 'react';
import { ImageEditor } from 'react-advanced-image-editor';
import 'react-advanced-image-editor/styles.css';

export function MinimalEditor() {
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
        onExport={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
```

## 2. Controlled configuration

```tsx
<ImageEditor
  open={open}
  src={file}
  preset="profile"
  locale="tr"
  theme="dark"
  features={{ perspectiveTab: false, undoRedo: true }}
  crop={{ aspectRatio: 1, guides: ['circle'] }}
  onPresetChange={setPreset}
  presetPicker={{ options: ['default', 'profile'] }}
  onExport={save}
  onCancel={close}
/>
```

The bar is on the Crop tool. `onPresetChange` and two picker options are both required. With this picker it lists Default and Profile.

## 3. Image export

```tsx
async function upload(blob: Blob) {
  const body = new FormData();
  body.append('file', blob, 'edited.jpg');
  await fetch('/api/upload', { method: 'POST', body });
}

<ImageEditor
  open={open}
  src={file}
  exportOptions={{ format: 'image/jpeg', quality: 0.9, maxWidth: 2000 }}
  exportView="result"
  exportResultContainer=".stage"
  showExportPreview={false}
  onExport={upload}
  onCancel={() => setOpen(false)}
/>
```

`showExportPreview` has no effect while `exportView` is `"result"`.

## 4. Custom styling

```tsx
<ImageEditor
  open={open}
  src={file}
  classNames={{ panel: 'editor-panel', doneButton: 'editor-done' }}
  colors={{
    accent: '#0f6e56',
    accentHover: '#0c5744',
    bgSidebar: '#f3f6f4',
  }}
  onExport={save}
  onCancel={close}
/>
```

```css
.editor-panel {
  box-shadow: none;
}

[data-ie-root] .editor-done {
  border-radius: 999px;
}
```

## 5. Custom theme

```tsx
<ImageEditor
  open={open}
  src={file}
  theme="dark"
  brandColor="oklch(62% 0.42 16.439)"
  brandColorAffectsBackground
  darkColors={{ text: '#fafafa', cropBorder: '#fafafa' }}
  darkModeRingColors={{
    scaleTrack: '#3f3f46',
    scaleProgress: '#e4e4e7',
  }}
  onExport={save}
  onCancel={close}
/>
```

`darkModeRingColors` replaces those two ring variables. The other rings keep the stylesheet values. `Partial<ModeRingColors>` allows that.

## 6. React and TypeScript

```tsx
import { useState } from 'react';
import {
  ImageEditor,
  type ImageEditorPreset,
  type ImageEditorTheme,
} from 'react-advanced-image-editor';
import 'react-advanced-image-editor/styles.css';

export function TypedEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ImageEditorPreset>('default');
  const theme: ImageEditorTheme = 'light';

  return (
    <ImageEditor
      open={open}
      src={file}
      preset={preset}
      theme={theme}
      onPresetChange={setPreset}
      onExport={(blob: Blob) => {
        console.log(blob.type, blob.size);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  );
}
```

## Inline host

```tsx
<div className="stage" style={{ height: 640 }}>
  <ImageEditor
    open
    src={file}
    presentation="inline"
    container=".stage"
    onExport={save}
    onCancel={close}
  />
</div>
```

```css
.stage {
  --ie-inline-padding: 12px;
  --ie-inline-radius: 16px;
}
```

The host needs a height. The editor fills it.
