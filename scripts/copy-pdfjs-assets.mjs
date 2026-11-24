// Copies the runtime assets PDF.js loads on demand (character maps, fallback fonts,
// image decoders, colour profiles) into public/, so every PDF renders offline.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'pdfjs-dist');
const target = join(root, 'public', 'pdfjs');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  if (existsSync(join(source, dir))) {
    cpSync(join(source, dir), join(target, dir), { recursive: true });
  }
}
