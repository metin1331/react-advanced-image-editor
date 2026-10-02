import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(dir, '../dist'), { recursive: true });
copyFileSync(
  join(dir, '../src/styles/default.css'),
  join(dir, '../dist/styles.css')
);
