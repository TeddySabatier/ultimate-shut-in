/**
 * Size of every mini game under src/games/<id>/ (docs/design/games/CONTRACT.md, "Size budgets").
 *
 *   code:   the game's own files (manifest, engine, strings, Screen, CSS and any
 *           other .ts/.tsx/.css in the folder, tests excluded), each minified with
 *           `transformWithEsbuild` from vite (the minifier Vite's build uses),
 *           before gzip, summed. Imports of shared code (React, src/components,
 *           src/game, src/games/*.ts) stay import statements: shared code is not
 *           counted. This is within a few percent of the bundled size.
 *   assets: every other file in the folder (images, sounds, data).
 *
 * Usage:
 *   node scripts/games-budget.mjs          table, exit 1 if a game is over budget
 *   node scripts/games-budget.mjs --json   {"<id>": {"code": bytes, "assets": bytes}} (used by src/games/budget.test.ts)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithEsbuild } from 'vite';

export const CODE_BUDGET_BYTES = 150 * 1024;
export const ASSET_BUDGET_BYTES = 200 * 1024;

const RESERVED = new Set(['lab', 'testing', 'ui', 'host', 'shared']);
const LOADERS = { '.ts': 'ts', '.tsx': 'tsx', '.css': 'css' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'src', 'games');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const isTest = (p) => /\.(test|spec)\.tsx?$/.test(p);

async function measure(id) {
  const files = walk(join(gamesDir, id));
  let code = 0;
  for (const file of files.filter((p) => LOADERS[extname(p)] && !isTest(p))) {
    const loader = LOADERS[extname(file)];
    const result = await transformWithEsbuild(readFileSync(file, 'utf8'), file, {
      loader,
      minify: true,
      jsx: 'automatic',
      format: 'esm',
      define: { 'import.meta.env.DEV': 'false' },
    });
    code += Buffer.byteLength(result.code);
  }
  const assets = files.filter((p) => !LOADERS[extname(p)]).reduce((n, p) => n + statSync(p).size, 0);
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
