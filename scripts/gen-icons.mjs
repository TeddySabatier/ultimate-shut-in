// Generates the PWA icons in public/icons/ (192, 512, + maskable variants)
// from the app mark at src/assets/logo/mark.svg.
//   - With `sharp` installed (devDependency), the SVG is rasterised exactly.
//   - Without it, the same hex-ring + door mark is drawn procedurally with pngjs
//     so the PNGs still match the SVG's silhouette and colours.
// Maskable icons place the mark at 60% size on a solid #0f0f14 background so it
// survives any OS mask shape (safe zone = central 80%).
// Run with: npm run icons   (ICONS_NO_SHARP=1 forces the pngjs fallback)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'icons');
const markPath = join(root, 'src', 'assets', 'logo', 'mark.svg');
mkdirSync(outDir, { recursive: true });

const BG = '#0f0f14';
const MASKABLE_SCALE = 0.6;

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
];

async function withSharp() {
  const { default: sharp } = await import('sharp');
  const svg = readFileSync(markPath);
  for (const [name, size, maskable] of targets) {
    const inner = maskable ? Math.round(size * MASKABLE_SCALE) : size;
    const mark = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer();
    const buf = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
      .composite([{ input: mark, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
      .png()
      .toBuffer();
    writeFileSync(join(outDir, name), buf);
    console.log(`wrote ${join(outDir, name)} (sharp)`);
  }
}

async function withPngjs() {
  const { PNG } = await import('pngjs');
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = { bg: hex(BG), violet: hex('#7c5cff'), amber: hex('#ffb84d'), amberDark: hex('#b8741f'), light: hex('#e8e3ff'), ink: hex('#0f0f14') };

  // Geometry in the mark's 64x64 space.
  const hexDist = (x, y) => {
    // signed distance-ish to a flat-side-vertical hexagon centred (32,32), circumradius 29
    const px = Math.abs(x - 32), py = Math.abs(y - 32);
    const r = 29;
    const d1 = px - r * Math.sqrt(3) / 2;
    const d2 = px * 0.5 + py * Math.sqrt(3) / 2 - r * Math.sqrt(3) / 2;
    return Math.max(d1, d2);
  };
  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;

  function sample(u, v) {
    // u,v in mark space (0..64). Returns [r,g,b] or null for transparent.
    const hd = hexDist(u, v);
    if (hd > -2 && hd <= 1.5) return C.violet; // ring (approx 4px, scaled)
    if (hd > 1.5) return null;
    if (inRect(u, v, 29, 28, 35, 35)) return inRect(u, v, 31, 28, 33, 35) ? C.light : C.violet;
    if (Math.hypot(u - 36.5, v - 38.5) < 1.4) return C.light;
    if (inRect(u, v, 26, 25, 38, 46)) return C.amberDark;
    if (inRect(u, v, 23, 22, 41, 46)) return C.amber;
    if (inRect(u, v, 18, 44.5, 46, 47.5)) return C.amber;
    if (inRect(u, v, 14, 46, 50, 54) && Math.abs(u - 32) < 12 + (v - 46) * 0.75) {
      return [Math.round(C.bg[0] * 0.65 + C.violet[0] * 0.35), Math.round(C.bg[1] * 0.65 + C.violet[1] * 0.35), Math.round(C.bg[2] * 0.65 + C.violet[2] * 0.35)];
    }
    // soft glow
    const g = Math.max(0, 1 - Math.hypot(u - 32, v - 36) / 22) * 0.55;
    return [Math.round(C.bg[0] + (C.violet[0] - C.bg[0]) * g), Math.round(C.bg[1] + (C.violet[1] - C.bg[1]) * g), Math.round(C.bg[2] + (C.violet[2] - C.bg[2]) * g)];
  }

  for (const [name, size, maskable] of targets) {
    const png = new PNG({ width: size, height: size });
    const inner = maskable ? Math.round(size * MASKABLE_SCALE) : size;
    const offset = (size - inner) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = ((x - offset) / inner) * 64;
        const v = ((y - offset) / inner) * 64;
        const inside = u >= 0 && v >= 0 && u < 64 && v < 64;
        const c = (inside && sample(u, v)) || C.bg;
        const i = (size * y + x) << 2;
        png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 0xff;
      }
    }
    writeFileSync(join(outDir, name), PNG.sync.write(png));
    console.log(`wrote ${join(outDir, name)} (pngjs fallback)`);
  }
}

try {
  if (process.env.ICONS_NO_SHARP) throw new Error('ICONS_NO_SHARP set');
  await withSharp();
} catch (err) {
  console.warn(`sharp unavailable (${err?.message ?? err}); using pngjs fallback`);
  await withPngjs();
}
