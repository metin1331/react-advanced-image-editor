# Migration

`0.1.0` is the version in both package manifests. This repository has no changelog of published releases, so there is no version-to-version migration guide.

## Names that are already aliases

| Name | Status |
| --- | --- |
| `ImageEditorModal` | Deprecated alias of `ImageEditor`. Same props. |
| `ImageEditorModalProps` | Deprecated alias of `ImageEditorProps`. |
| `labels.tools.finetune` | Deprecated. Use `labels.tools.calibrate`. |
| `presetPicker.position` | Deprecated. Ignored. |
| `presetPicker.onPositionChange` | Deprecated. Ignored. |
| `presetPicker.positionStorageKey` | Deprecated. Ignored. |
| `--ie-gold` | Alias of `--ie-accent`. |

## Comments that do not match runtime

If you followed the comments in `types.ts` rather than the parameter defaults:

| Prop | Comment | Parameter default |
| --- | --- | --- |
| `initialZoom` | `2.5` | `1` |
| `tickWidth` | `2` | `2.2` |
| `majorTickWidth` | same as `tickWidth` | `2.2` |

`DEFAULT_INITIAL_CROP_ZOOM` remains `2.5` in the core package. `ImageEditor` does not use it unless you pass that number.

The `profile` preset does not set `maxWidth` or `maxHeight`. Older notes that describe a 512px JPEG do not match `editorPresets.profile`.
