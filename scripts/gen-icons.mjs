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

// ---- App shortcut icons (96x96): a glyph on the app background, drawn from primitives ----
// One primitive list per glyph feeds both the SVG (sharp) and the pngjs fallback.
const SHORTCUT_SIZE = 96;
const PALETTE = { bg: '#0f0f14', violet: '#7c5cff', amber: '#ffb84d', light: '#e8e3ff' };
const frame = [
  { t: 'rect', x: 4, y: 4, w: 88, h: 4, c: 'violet' },
  { t: 'rect', x: 4, y: 88, w: 88, h: 4, c: 'violet' },
  { t: 'rect', x: 4, y: 4, w: 4, h: 88, c: 'violet' },
  { t: 'rect', x: 88, y: 4, w: 4, h: 88, c: 'violet' },
];
const shortcutGlyphs = {
  // A plus: add a quest.
  'shortcut-compose.png': [
    ...frame,
    { t: 'rect', x: 42, y: 20, w: 12, h: 56, c: 'amber' },
    { t: 'rect', x: 20, y: 42, w: 56, h: 12, c: 'amber' },
  ],
  // Three ticked lines: the board.
  'shortcut-board.png': [
    ...frame,
    ...[22, 42, 62].flatMap((y) => [
      { t: 'rect', x: 20, y, w: 12, h: 12, c: 'amber' },
      { t: 'rect', x: 40, y: y + 3, w: 36, h: 6, c: 'light' },
    ]),
  ],
  // Concentric zones around the Haven: the map.
  'shortcut-map.png': [
    ...frame,
    { t: 'ring', cx: 48, cy: 48, r: 34, w: 4, c: 'violet' },
    { t: 'ring', cx: 48, cy: 48, r: 22, w: 4, c: 'violet' },
    { t: 'circle', cx: 48, cy: 48, r: 8, c: 'amber' },
  ],
};

function glyphSvg(prims) {
  const body = prims
    .map((p) => {
      const fill = PALETTE[p.c];
      if (p.t === 'rect') return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${fill}"/>`;
      if (p.t === 'circle') return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${fill}"/>`;
      return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="none" stroke="${fill}" stroke-width="${p.w}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHORTCUT_SIZE}" height="${SHORTCUT_SIZE}" viewBox="0 0 96 96"><rect width="96" height="96" fill="${PALETTE.bg}"/>${body}</svg>`;
}

async function shortcutsWithSharp() {
  const { default: sharp } = await import('sharp');
  for (const [name, prims] of Object.entries(shortcutGlyphs)) {
    const buf = await sharp(Buffer.from(glyphSvg(prims)), { density: 72 }).resize(SHORTCUT_SIZE, SHORTCUT_SIZE).png().toBuffer();
    writeFileSync(join(outDir, name), buf);
    console.log(`wrote ${join(outDir, name)} (sharp)`);
  }
}

async function shortcutsWithPngjs() {
  const { PNG } = await import('pngjs');
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const col = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, hex(v)]));
  const covers = (p, x, y) => {
    if (p.t === 'rect') return x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h;
    const d = Math.hypot(x - p.cx, y - p.cy);
    return p.t === 'circle' ? d <= p.r : Math.abs(d - p.r) <= p.w / 2;
  };
  const SS = 4; // supersampling for soft circle edges
  for (const [name, prims] of Object.entries(shortcutGlyphs)) {
    const png = new PNG({ width: SHORTCUT_SIZE, height: SHORTCUT_SIZE });
    for (let y = 0; y < SHORTCUT_SIZE; y++) {
      for (let x = 0; x < SHORTCUT_SIZE; x++) {
        const acc = [0, 0, 0];
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const px = x + (sx + 0.5) / SS;
            const py = y + (sy + 0.5) / SS;
            let c = col.bg;
            for (const p of prims) if (covers(p, px, py)) c = col[p.c];
            acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
          }
        }
        const i = (SHORTCUT_SIZE * y + x) << 2;
        png.data[i] = Math.round(acc[0] / (SS * SS));
        png.data[i + 1] = Math.round(acc[1] / (SS * SS));
        png.data[i + 2] = Math.round(acc[2] / (SS * SS));
        png.data[i + 3] = 0xff;
      }
    }
    writeFileSync(join(outDir, name), PNG.sync.write(png));
    console.log(`wrote ${join(outDir, name)} (pngjs fallback)`);
  }
}

try {
  if (process.env.ICONS_NO_SHARP) throw new Error('ICONS_NO_SHARP set');
  await withSharp();
  await shortcutsWithSharp();
} catch (err) {
  console.warn(`sharp unavailable (${err?.message ?? err}); using pngjs fallback`);
  await withPngjs();
  await shortcutsWithPngjs();
}
