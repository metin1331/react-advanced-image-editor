# Contributing

The repository is an npm workspace. The root package `react-advanced-image-editor-workspace` is private.

| Path | Package |
| --- | --- |
| `packages/react-advanced-image-editor` | React editor |
| `packages/react-advanced-image-editor-core` | Headless engine |
| `apps/demo` | Vite demo |

## Scripts

From the repository root:

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

| Script | What it runs |
| --- | --- |
| `dev` | `npm run dev` in `apps/demo` |
| `typecheck` | `tsc` for the React package only |
| `build` | core `tsup`, then the React package `tsup` and CSS copy |
| `build:demo` | `build`, then the demo build |

Core tests:

```bash
npm test --workspace=react-advanced-image-editor-core
```

That runs Vitest. The React package has no test script.

There is no CI config under `.github/` in this repository.

## Docs

User-facing docs are `packages/react-advanced-image-editor/README.md` and `packages/react-advanced-image-editor/docs/`. `image-editor-library.md` is a separate working note. Do not treat it as the published manual.

## License

MIT. Copyright 2026 Metin Kuran. See `LICENSE` at the repository root and in each package.
