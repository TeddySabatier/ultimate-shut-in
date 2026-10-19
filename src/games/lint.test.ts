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

  it('closes the escapes: dynamic imports, globs, hooks, store-connected components', async () => {
    const file = 'src/games/fake-game/Screen.tsx';
    const cases = [
      "export const s = () => import('../../state/gameStore');",
      "export const g = import.meta.glob('../../state/*.ts', { eager: true });",
      "import { useReducedMotion } from '../../hooks/useReducedMotion';\nexport const x = useReducedMotion;",
      "import { useGameTick } from '../../hooks/useGameTick';\nexport const x = useGameTick;",
      "import { RingHeader } from '../../components/RingHeader';\nexport const x = RingHeader;",
      "import { AppShell } from '../../components/AppShell';\nexport const x = AppShell;",
      "import { Toast } from '../../components/overlays/Toast';\nexport const x = Toast;",
      "import { RewardChips } from '../../components/Chips';\nexport const x = RewardChips;",
      "import { MyQuestsSection } from '../../components/MyQuestsSection';\nexport const x = MyQuestsSection;",
    ];
    for (const code of cases) expect((await ruleHits(code, file)).length, code).toBeGreaterThan(0);
    // Presentational components stay allowed.
    const ok = "import { ModalFrame } from '../../components/overlays/ModalFrame';\nimport { ConfirmDialog } from '../../components/ConfirmDialog';\nimport { Icon } from '../../components/Icon';\nexport const x = [ModalFrame, ConfirmDialog, Icon];";
    expect(await ruleHits(ok, file)).toEqual([]);
  });

  it('forbids other games, the Lab and the registry from a game; allows the contract, ui and testing helpers', async () => {
    const file = 'src/games/fake-game/Screen.tsx';
    for (const from of ['../sample/engine', '../sample/manifest', '../lab/LabGame', '../registry', '../registry.ts']) {
      expect(await ruleHits(`import x from '${from}';\nexport const y = x;`, file), from).toEqual([expect.stringMatching(/never another game, the Lab or the registry/)]);
    }
    for (const from of ['../contract', '../ui/useEngine', '../ui/useFixedStep', '../testing/fixtures', '../testing/play', './engine', './strings']) {
      expect(await ruleHits(`import x from '${from}';\nexport const y = x;`, file), from).toEqual([]);
    }
    expect(await ruleHits("import { describeGameContract } from '../testing/contract';\nexport const d = describeGameContract;", 'src/games/fake-game/contract.test.ts')).toEqual([]);
  });

  it('forbids window/globalThis storage and network, and sendBeacon', async () => {
    const code = "export const f = () => [window.localStorage, globalThis.fetch, window.indexedDB, navigator.sendBeacon, self.sessionStorage];";
    expect(await ruleHits(code, 'src/games/fake-game/Screen.tsx')).toHaveLength(5);
  });

  it('keeps every .ts file of a game pure, not only engine.ts', async () => {
    const code = [
      'export const a = () => Math.random();',
      'export const b = () => new Date();',
      'export const c = () => Date();',
      'export const d = () => globalThis.Math.random();',
      'export const e = () => crypto.getRandomValues(new Uint8Array(1));',
      'export const f = () => navigator.language;',
      'export const g = () => setTimeout(() => undefined, 1);',
      'export const h = () => window.performance.now();',
    ].join('\n');
    const hits = await ruleHits(code, 'src/games/fake-game/solver.ts');
    for (const line of ['random', 'clock', 'globalThis', 'crypto', 'navigator', 'setTimeout', 'window']) expect(hits.join('\n'), line).toMatch(new RegExp(line));
    expect(hits.length).toBeGreaterThanOrEqual(8);
    // The Screen (.tsx) may use the browser: only the .ts files are pure.
    expect(await ruleHits('export const t = () => setTimeout(() => undefined, 1);', 'src/games/fake-game/Screen.tsx')).toEqual([]);
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
    for (const [file, from] of [
      ['src/screens/HomeScreen.tsx', '../games/registry'],
      ['src/hooks/useArena.ts', '../games/registry'],
      ['src/components/arena/ArenaCard.tsx', '../../games/registry'],
      ['src/App.tsx', './games/registry.js'],
      ['src/App.tsx', '@/games/registry'],
    ] as const) {
      expect(await ruleHits(code(from), file), `${file} <- ${from}`).toEqual([expect.stringMatching(/the registry is lazy/)]);
    }
    const glob = "export const g = import.meta.glob('../games/*/manifest.ts', { eager: true });";
    expect(await ruleHits(glob, 'src/state/arenaStore.ts')).toEqual([expect.stringMatching(/the registry is lazy/)]);
    // Only the Arena host, loaded lazily, lives where the registry may be imported.
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
