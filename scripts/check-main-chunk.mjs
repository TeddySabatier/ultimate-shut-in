/**
 * After `npm run build`: fail if the main chunk (dist/assets/index-*.js)
 * contains any mini game. The registry, and with it every manifest, engine
 * and strings object, must load only with a lazily loaded route (the Games
 * Lab, the Arena host); see docs/design/games/CONTRACT.md, "Boundaries".
 *
 * Markers, for every game id found in src/games/<id>/manifest.ts:
 *   - the manifest's id as minified code writes it: id:"<id>"
 *   - the seed salt of the contract, `<id>:` right after a quote or backtick
 * plus the registry's own error text.
 *
 * Usage: node scripts/check-main-chunk.mjs   (exit 1 with the evidence when a marker is found)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'dist', 'assets');
const gamesDir = join(root, 'src', 'games');

if (!existsSync(assets)) {
  console.error('check-main-chunk: dist/assets is missing; run npm run build first.');
  process.exit(2);
}
const main = readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f));
if (main.length === 0) {
  console.error('check-main-chunk: no dist/assets/index-*.js found.');
  process.exit(2);
}

const ids = readdirSync(gamesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(gamesDir, d.name, 'manifest.ts')))
  .map((d) => /\bid:\s*['"`]([a-z0-9-]+)['"`]/.exec(readFileSync(join(gamesDir, d.name, 'manifest.ts'), 'utf8'))?.[1] ?? d.name);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const markers = [
  ...ids.flatMap((id) => [
    { what: `manifest id "${id}"`, re: new RegExp(`\\bid:\\s*["'\`]${escape(id)}["'\`]`) },
    { what: `seed salt "${id}:"`, re: new RegExp(`["'\`]${escape(id)}:`) },
  ]),
  { what: 'the games registry', re: /with a Screen\.tsx in src\/games/ },
];

let failed = false;
for (const file of main) {
  const code = readFileSync(join(assets, file), 'utf8');
  for (const { what, re } of markers) {
    const m = re.exec(code);
    if (m) {
      failed = true;
      const at = Math.max(0, m.index - 60);
      console.error(`check-main-chunk: ${file} contains ${what}:\n  ...${code.slice(at, m.index + 80).replace(/\s+/g, ' ')}...`);
    }
  }
  if (!failed) console.log(`check-main-chunk: ${file} (${(code.length / 1024).toFixed(1)} KB) holds none of ${ids.length} game(s): ${ids.join(', ')}.`);
}
if (failed) {
  console.error('The registry reached the main bundle. Import it only from a lazily loaded route (src/components/arena/host/ or the Lab).');
  process.exit(1);
}
