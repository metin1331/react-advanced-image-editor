# TypeScript

Both packages publish `dist/index.d.ts`. `types` in `package.json` points at that file, and the `exports` map includes a `types` condition.

```ts
import {
  ImageEditor,
  editorPresets,
  resolveEditorConfig,
  type ImageEditorProps,
  type ImageEditorPreset,
  type ImageEditorThemeColors,
} from 'react-advanced-image-editor';
```

`ImageSource` and `ExportOptions` live in the core package:

```ts
import type { ExportOptions, ImageSource } from 'react-advanced-image-editor-core';

const options: ExportOptions = {
  format: 'image/webp',
  quality: 0.85,
  maxWidth: 1600,
};

const source: ImageSource = file;
```

`ImageEditorProps['src']` is `ImageSource | null`, so a `File` is accepted without importing the core type.

## Locale and presets

```ts
import type { ImageEditorLocale } from 'react-advanced-image-editor';

const locale: ImageEditorLocale = 'jp';
```

`ImageEditorLocale` is `'en' | 'tr' | 'jp'`. `ImageEditorPreset` is `'default' | 'selection' | 'outside' | 'profile'`.

## Feature config

`resolveEditorConfig` returns `ResolvedEditorConfig`. Pass a partial and the preset fills the rest.

```ts
import { resolveEditorConfig } from 'react-advanced-image-editor';

const config = resolveEditorConfig({
  preset: 'profile',
  exportOptions: { format: 'image/png', quality: 1 },
  features: { undoRedo: false },
});
```

That helper does not render anything. To use the result, pass the same fields to `ImageEditor` (`preset`, `exportOptions`, `features`, and so on). `minZoom` and `maxZoom` on the resolved object are not props.

## Hook

```ts
import { useImageEditor, type UseImageEditorReturn } from 'react-advanced-image-editor';

const editor: UseImageEditorReturn = useImageEditor(file, { initialZoom: 1 });
```

`UseImageEditorReturn` is `ReturnType<typeof useImageEditor>`.

## Strictness notes

- `onExport` and `onCancel` are required. Omitting either is a type error.
- `labels` is `Partial<ImageEditorLabels>`, so unknown keys are rejected.
- `colors` only accepts keys of `ImageEditorThemeColors`.
- `ImageEditorModalProps` is a deprecated alias of `ImageEditorProps`.
