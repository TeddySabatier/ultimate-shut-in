// Generates placeholder PWA icons in public/icons/ (192, 512, + maskable variants).
// Pixel-art style: dark background, accent square frame, gold core.
// Run with: npm run icons
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [0x0f, 0x0f, 0x14];
const ACCENT = [0x7c, 0x5c, 0xff];
const ACCENT2 = [0xff, 0xb8, 0x4d];

/** 8x8 pixel-art pattern; 0 = bg, 1 = accent, 2 = accent-2 */
const PATTERN = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 2, 2, 0, 1, 0],
  [0, 1, 0, 2, 2, 0, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

function render(size, { maskable }) {
  const png = new PNG({ width: size, height: size });
  // Maskable icons must keep content within the central 80% "safe zone".
  const scale = maskable ? 0.8 : 1;
  const inner = Math.round(size * scale);
  const offset = Math.round((size - inner) / 2);
  const cell = inner / PATTERN.length;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BG;
      const px = x - offset;
      const py = y - offset;
      if (px >= 0 && py >= 0 && px < inner && py < inner) {
        const row = PATTERN[Math.min(PATTERN.length - 1, Math.floor(py / cell))];
        const v = row[Math.min(row.length - 1, Math.floor(px / cell))];
        color = v === 1 ? ACCENT : v === 2 ? ACCENT2 : BG;
      }
      const idx = (size * y + x) << 2;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = 0xff;
    }
  }
  return PNG.sync.write(png);
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
];

for (const [name, size, maskable] of targets) {
  const file = join(outDir, name);
  writeFileSync(file, render(size, { maskable }));
  console.log(`wrote ${file}`);
}
