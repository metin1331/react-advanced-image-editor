# Getting started

`react-advanced-image-editor` is a React component that loads an image, edits it in a crop-style UI, and returns a `Blob` from Done.

The UI is one component, `ImageEditor`. A headless engine, `react-advanced-image-editor-core`, is installed with it. You do not import the core package for the usual React setup.

## What you need

- React 18 or newer
- React DOM 18 or newer
- A bundler that can import CSS (`import 'react-advanced-image-editor/styles.css'`)

## Smallest working editor

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
          if (next) setOpen(true);
        }}
      />
      <ImageEditor
        open={open}
        src={file}
        onExport={async (blob) => {
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

`open` shows the editor. `src` is the image. Done calls `onExport` with the encoded image. Cancel calls `onCancel`. Both callbacks are required.

The default presentation is a modal portaled to `document.body`. Import the stylesheet once, near the root of the app.

Next: [installation](./installation.md), [usage](./usage.md), [API](./api.md).
