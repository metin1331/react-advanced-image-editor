# Theming

The editor has two built-in token sets and one optional brand mix. There is no skin prop. The root always sets `data-ie-skin="ios"`, and crop-handle CSS is written against `[data-ie-part="cropOverlay"][data-ie-skin="ios"]`.

## Light and dark

`theme` defaults to `"light"`. `"dark"` sets `data-ie-theme="dark"` on the root, the preset menu, and the export result.

```tsx
<ImageEditor open={open} src={file} theme="dark" onExport={save} onCancel={close} />
```

Dark replaces the `*-base` tokens (accent, surfaces, sheet) and the text, crop, grid, and ruler colors. The mix formulas stay the same. See the tables in [styling](./styling.md).

## brandColor

`brandColor` writes `--ie-brand` on the root when the string has non-whitespace content. The same string is used in light and dark. Dark only swaps the base tokens that the mix reads.

Omit `brandColor` and every mix falls back to its own base, which is the built-in palette.

```tsx
<ImageEditor
  open={open}
  src={file}
  brandColor="oklch(55.5% 0.46 16.439)"
  onExport={save}
  onCancel={close}
/>
```

What the mix changes:

- `--ie-accent` and `--ie-accent-hover`: 32% brand
- `--ie-accent-soft`: 18% brand
- `--ie-bg`, `--ie-bg-muted`, `--ie-bg-sidebar`, `--ie-border`, `--ie-overlay`, `--ie-chrome-hover`, `--ie-chrome-active`: 8% brand

What it does not change: `--ie-text`, `--ie-text-muted`, `--ie-accent-text`, `--ie-crop-border`, `--ie-crop-handle`, `--ie-grid`.

`colors` and `darkColors` assign the final variable, so they replace a mix for that token.

## brandColorAffectsBackground

Default `false`. The backgrounds of `[data-ie-part="topbar"]`, `[data-ie-part="chrome-slot"]`, and `[data-ie-part="viewport-area"]` stay `#ffffff` in light and `#050404` in dark.

`true`, together with a non-empty `brandColor`, sets `data-ie-brand-bg="true"`. Those three then use a sheet color mixed 92% base / 8% brand. The sidebar is not part of that flag. The sidebar still follows `--ie-bg-sidebar`, which does pick up the 8% brand mix whenever `brandColor` is set.

```tsx
<ImageEditor
  open={open}
  src={file}
  brandColor="#c026d3"
  brandColorAffectsBackground
  onExport={save}
  onCancel={close}
/>
```

## Custom theme

Pass only the keys you want to replace:

```tsx
<ImageEditor
  open={open}
  src={file}
  theme="dark"
  darkColors={{
    bg: '#0c0a09',
    bgSidebar: '#1c1917',
    text: '#fafaf9',
    accent: '#fb7185',
  }}
  onExport={save}
  onCancel={close}
/>
```

Or skip the props and target the attributes:

```css
[data-ie-root][data-ie-theme="dark"] {
  --ie-bg: #0c0a09;
  --ie-accent: #fb7185;
}
```

Inline props win over that stylesheet rule for the same variable.

## Skins

Only `ios` is applied, and it is fixed. Adding `[data-ie-skin="material"]` in your CSS will not run unless you set the attribute yourself after render. The component sets `data-ie-skin="ios"` on every open.
