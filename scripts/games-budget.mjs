/**
 * Size of every mini game under src/games/<id>/ (docs/design/games/CONTRACT.md, "Size budgets").
 *
 *   code:   the game's own manifest, engine, strings, Screen and CSS, bundled and
 *           minified with esbuild (the minifier Vite uses), before gzip. Anything
 *           outside the game's folder (React, src/components, src/game,
 *           src/games/*.ts) is shared and not counted.
 *   assets: every other file in the folder (images, sounds, data).
 *
 * Usage:
 *   node scripts/games-budget.mjs          table, exit 1 if a game is over budget
 *   node scripts/games-budget.mjs --json   {"<id>": {"code": bytes, "assets": bytes}} (used by src/games/budget.test.ts)
 */
import { build } from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CODE_BUDGET_BYTES = 150 * 1024;
export const ASSET_BUDGET_BYTES = 200 * 1024;

const RESERVED = new Set(['lab', 'testing', 'ui', 'host', 'shared']);
const CODE = new Set(['.ts', '.tsx', '.css']);
const ASSET_LOADERS = { '.png': 'file', '.svg': 'file', '.webp': 'file', '.jpg': 'file', '.mp3': 'file', '.ogg': 'file', '.json': 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'src', 'games');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Everything outside the game's folder is external. */
function onlyTheGame(folder) {
  return {
    name: 'only-the-game',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined;
        if (!args.path.startsWith('.')) return { path: args.path, external: true };
        const abs = resolve(args.resolveDir, args.path);
        return abs.startsWith(folder + sep) ? undefined : { path: args.path, external: true };
      });
    },
  };
}

async function measure(id) {
  const folder = join(gamesDir, id);
  const result = await build({
    stdin: { contents: "export { default as game } from './manifest';\nexport { default as Screen } from './Screen';", resolveDir: folder, loader: 'ts' },
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    jsx: 'automatic',
    outdir: join(folder, '.budget'),
    loader: { '.css': 'local-css', ...ASSET_LOADERS },
    define: { 'import.meta.env.DEV': 'false' },
    logLevel: 'silent',
    plugins: [onlyTheGame(folder)],
  });
  const code = result.outputFiles.filter((f) => /\.(js|css)$/.test(f.path)).reduce((n, f) => n + f.contents.byteLength, 0);
  const assets = walk(folder)
    .filter((p) => !CODE.has(extname(p)))
    .reduce((n, p) => n + statSync(p).size, 0);
  return { code, assets };
}

const games = readdirSync(gamesDir).filter((f) => statSync(join(gamesDir, f)).isDirectory() && !RESERVED.has(f));
const sizes = {};
for (const id of games) sizes[id] = await measure(id);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(sizes));
} else {
  let over = false;
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  for (const [id, { code, assets }] of Object.entries(sizes)) {
    const bad = code > CODE_BUDGET_BYTES || assets > ASSET_BUDGET_BYTES;
    over ||= bad;
    console.log(`${bad ? 'OVER' : 'ok  '} ${id.padEnd(24)} code ${kb(code).padStart(9)} / ${kb(CODE_BUDGET_BYTES)}   assets ${kb(assets).padStart(9)} / ${kb(ASSET_BUDGET_BYTES)}`);
  }
  if (over) process.exit(1);
}
