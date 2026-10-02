import path from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const packages = path.resolve(root, '../../packages');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'react-advanced-image-editor/styles.css',
        replacement: path.join(
          packages,
          'react-advanced-image-editor/src/styles/default.css'
        ),
      },
      {
        find: 'react-advanced-image-editor-core',
        replacement: path.join(
          packages,
          'react-advanced-image-editor-core/src/index.ts'
        ),
      },
      {
        find: 'react-advanced-image-editor',
        replacement: path.join(
          packages,
          'react-advanced-image-editor/src/index.ts'
        ),
      },
    ],
  },
  server: {
    port: 5173,
  },
});
