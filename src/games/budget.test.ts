/**
 * Size budgets for every game (docs/design/games/CONTRACT.md, "Size budgets"):
 * the game's own code, minified before gzip, at most 150 KB; the assets in its
 * folder at most 200 KB. Measured by scripts/games-budget.mjs (vite's transformWithEsbuild, in a
 * child process because esbuild does not run inside jsdom).
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CODE_BUDGET_BYTES = 150 * 1024;
const ASSET_BUDGET_BYTES = 200 * 1024;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sizes = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts', 'games-budget.mjs'), '--json'], { cwd: root, encoding: 'utf8' })) as Record<
  string,
  { code: number; assets: number }
>;

describe('games size budgets', () => {
  it('measures every game folder', () => {
    expect(Object.keys(sizes)).toContain('sample');
  });

  describe.each(Object.entries(sizes))('%s', (id, { code, assets }) => {
    it('own code (manifest, engine, strings, Screen, CSS; minified) is at most 150 KB', () => {
      expect(code, `src/games/${id}: ${(code / 1024).toFixed(1)} KB of code`).toBeLessThanOrEqual(CODE_BUDGET_BYTES);
      expect(code).toBeGreaterThan(0);
    });

    it('assets in the folder are at most 200 KB', () => {
      expect(assets, `src/games/${id}: ${(assets / 1024).toFixed(1)} KB of assets`).toBeLessThanOrEqual(ASSET_BUDGET_BYTES);
    });
  });
});
