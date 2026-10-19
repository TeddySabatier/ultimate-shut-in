/**
 * The ESLint boundaries for mini games (eslint.config.js) really fire: each
 * snippet is linted as if it lived at the given path.
 */
import { ESLint } from 'eslint';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let eslint: ESLint;

async function ruleHits(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, file) });
  return (result?.messages ?? []).filter((m) => m.ruleId?.startsWith('no-restricted')).map((m) => `${m.ruleId}: ${m.message}`);
}

beforeAll(() => {
  eslint = new ESLint({ cwd: root });
});

describe('ESLint boundary for src/games', () => {
  it('forbids the store, screens, zustand and the router in a game', async () => {
    const hits = await ruleHits(
      [
        "import { useGameStore } from '../../state/gameStore';",
        "import { useSave } from '../../state';",
        "import { MapScreen } from '../../screens/MapScreen';",
        "import { create } from 'zustand';",
        "import { useNavigate } from 'react-router-dom';",
        'export const x = [useGameStore, useSave, MapScreen, create, useNavigate];',
      ].join('\n'),
      'src/games/fake-game/Screen.tsx',
    );
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.includes('mini games never touch the Haven store; talk through GameScreenProps'))).toBe(true);
  });

  it('allows shared components and the pure helpers of src/game', async () => {
    const hits = await ruleHits(
      [
        "import { SystemWindow } from '../../components/SystemWindow';",
        "import { Meter } from '../../components/Meter';",
        "import { mulberry32 } from '../../game/rng';",
        "import type { HabitId } from '../../game/types';",
        "import { habits } from '../../game/content';",
        "import { useEffect } from 'react';",
        'export const x = [SystemWindow, Meter, mulberry32, habits, useEffect] as const;',
        'export type H = HabitId;',
      ].join('\n'),
      'src/games/fake-game/Screen.tsx',
    );
    expect(hits).toEqual([]);
  });

  it('forbids network and storage in a game', async () => {
    const hits = await ruleHits("export const f = () => [fetch('/x'), localStorage.getItem('k')];", 'src/games/fake-game/Screen.tsx');
    expect(hits.join('\n')).toMatch(/fetch[\s\S]*offline[\s\S]*localStorage/);
  });

  it('keeps engines pure: no React, no Math.random, no clock', async () => {
    const hits = await ruleHits(
      ["import { useState } from 'react';", 'export const r = () => [Math.random(), Date.now(), new Date(), useState];'].join('\n'),
      'src/games/fake-game/engine.ts',
    );
    expect(hits).toHaveLength(4);
    expect(hits.join('\n')).toMatch(/no React[\s\S]*seeded[\s\S]*clock[\s\S]*clock/);
  });

  it('keeps the vitest kit out of app code, and lets tests use it', async () => {
    const code = "import { describeGameContract } from '../testing/contract';\nexport const d = describeGameContract;";
    expect(await ruleHits(code, 'src/games/fake-game/Screen.tsx')).toEqual([expect.stringMatching(/test files only/)]);
    expect(await ruleHits(code, 'src/games/fake-game/contract.test.ts')).toEqual([]);
  });

  it('keeps the registry out of the main bundle: only lazy routes import it', async () => {
    const code = (from: string) => `import { listGames } from '${from}';\nexport const x = listGames;`;
    for (const [file, from] of [
      ['src/App.tsx', './games/registry'],
      ['src/main.tsx', './games/registry'],
      ['src/state/arenaStore.ts', '../games/registry'],
      ['src/components/RingHeader.tsx', '../games/registry'],
      ['src/components/overlays/ArenaToast.tsx', '../../games/registry'],
    ] as const) {
      expect(await ruleHits(code(from), file), file).toEqual([expect.stringMatching(/the registry is lazy: import it only from a lazily loaded route/)]);
    }
    // The Arena host is loaded lazily and lives in src/components/arena/.
    expect(await ruleHits(code('../../../games/registry'), 'src/components/arena/host/ArenaHost.tsx')).toEqual([]);
    // Types from the contract are fine anywhere.
    expect(await ruleHits("import type { Outcome } from './games/contract';\nexport type O = Outcome;", 'src/App.tsx')).toEqual([]);
  });

  it('lets the Games Lab use the router, never the store', async () => {
    const code = "import { Link } from 'react-router-dom';\nimport { useGameStore } from '../../state/gameStore';\nexport const x = [Link, useGameStore];";
    const hits = await ruleHits(code, 'src/games/lab/LabExtra.tsx');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/Haven store/);
  });
}, 60_000);
