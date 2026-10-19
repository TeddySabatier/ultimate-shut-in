/**
 * The registry, and the layout rule every game folder follows. This file
 * covers every game automatically: a new game needs no edit here.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GAME_CATEGORIES, RESERVED_FOLDERS } from './contract';
import { checkRegistry, getGame, listGames, loadScreen, validateRegistry } from './registry';
import { checkManifest, checkStrings } from './testing/checks';

const gamesDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(gamesDir, '..', '..');

/** Files every game folder has (docs/design/games/CONTRACT.md, "File layout"). */
const REQUIRED_FILES = ['manifest.ts', 'engine.ts', 'strings.ts', 'Screen.tsx', 'Screen.module.css', 'engine.test.ts', 'contract.test.ts'];

const gameFolders = readdirSync(gamesDir).filter((f) => statSync(join(gamesDir, f)).isDirectory() && !RESERVED_FOLDERS.includes(f));

describe('games registry', () => {
  it('validateRegistry finds no problem', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('discovers the sample through import.meta.glob', () => {
    expect(getGame('sample')?.manifest.name.en).toBe('Coin Duel');
    expect(getGame('nope')).toBeUndefined();
  });

  it('hides dev-only games unless asked', () => {
    expect(listGames().some((g) => g.manifest.devOnly)).toBe(false);
    expect(listGames({ includeDev: true }).map((g) => g.manifest.id)).toContain('sample');
  });

  it('sorts by category order, then English name', () => {
    const list = listGames({ includeDev: true }).map((g) => g.manifest);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!;
      const b = list[i]!;
      expect(GAME_CATEGORIES.indexOf(a.category)).toBeLessThanOrEqual(GAME_CATEGORIES.indexOf(b.category));
      if (a.category === b.category) expect(a.name.en.localeCompare(b.name.en, 'en')).toBeLessThanOrEqual(0);
    }
  });

  it('loads a Screen lazily, and rejects an unknown id', async () => {
    const Screen = await loadScreen('sample');
    expect(typeof Screen).toBe('function');
    await expect(loadScreen('nope')).rejects.toThrow(/No game "nope"/);
  });

  it('checkRegistry reports duplicates, folder mismatches, missing Screens and bad exports', () => {
    const game = getGame('sample')!;
    const renamed = { ...game, manifest: { ...game.manifest, id: 'other' } };
    const problems = checkRegistry(
      {
        './sample/manifest.ts': { default: game },
        './copy/manifest.ts': { default: game },
        './other/manifest.ts': { default: renamed },
        './broken/manifest.ts': { default: { hello: 1 } },
        './lab/manifest.ts': { default: game },
      },
      ['./sample/Screen.tsx', './other/Screen.tsx', './orphan/Screen.tsx'],
    ).join('\n');
    expect(problems).toMatch(/src\/games\/copy: id "sample" must equal the folder name/);
    expect(problems).toMatch(/id "sample" is used by src\/games\/sample and src\/games\/copy/);
    expect(problems).toMatch(/src\/games\/copy\/Screen\.tsx is missing/);
    expect(problems).toMatch(/src\/games\/broken\/manifest\.ts must default-export defineGame/);
    expect(problems).toMatch(/src\/games\/orphan\/Screen\.tsx has no manifest\.ts/);
    expect(problems).toMatch(/src\/games\/lab\/ is a reserved folder/);
    expect(problems).not.toMatch(/src\/games\/other/);
  });
});

describe.each(gameFolders)('game folder %s', (folder) => {
  it('has every file of the layout', () => {
    const missing = REQUIRED_FILES.filter((f) => !existsSync(join(gamesDir, folder, f)));
    expect(missing, `src/games/${folder}/ is missing files`).toEqual([]);
  });

  it('runs describeGameContract in contract.test.ts', () => {
    const file = join(gamesDir, folder, 'contract.test.ts');
    expect(existsSync(file) && readFileSync(file, 'utf8').includes('describeGameContract(')).toBe(true);
  });

  it('has docs/games/<id>.md with Party and Buffs sections, and e2e/games/<id>.spec.ts', () => {
    const doc = join(root, 'docs', 'games', `${folder}.md`);
    expect(existsSync(doc), `docs/games/${folder}.md`).toBe(true);
    const text = existsSync(doc) ? readFileSync(doc, 'utf8') : '';
    expect(text, `docs/games/${folder}.md needs a "## Party" section`).toMatch(/^## Party/m);
    expect(text, `docs/games/${folder}.md needs a "## Buffs" section`).toMatch(/^## Buffs/m);
    expect(existsSync(join(root, 'e2e', 'games', `${folder}.spec.ts`)), `e2e/games/${folder}.spec.ts`).toBe(true);
  });

  it('is registered with a valid manifest and strings', () => {
    const game = getGame(folder);
    expect(game, `src/games/${folder}/manifest.ts must default-export defineGame({...}) with id "${folder}"`).toBeDefined();
    if (!game) return;
    checkManifest(game, folder);
    checkStrings(game);
  });
});
