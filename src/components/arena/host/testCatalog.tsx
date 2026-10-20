/* eslint-disable react-refresh/only-export-components */
/**
 * A fake games catalog for the Arena's UI tests (not a test file, not shipped:
 * only tests import it). Two test files mock `./catalog` with this one object.
 * Vitest runs here with `isolate: false`, so modules such as `ArenaHost` stay
 * cached between files; one shared fake means whichever file runs first, the
 * cached host sees the same catalog.
 */
import type { ComponentType } from 'react';
import type { GameModule, GameScreenProps, Outcome } from '../../../games/contract';

function make(id: string, name: string, extra: Record<string, unknown> = {}): GameModule {
  return {
    manifest: {
      id,
      name: { en: name, fr: `${name} (fr)` },
      tagline: { en: `${name} tagline`, fr: `${name} slogan` },
      category: 'puzzle',
      minRing: 1,
      rosterSize: { min: 1, max: 3 },
      estMinutes: 2,
      supportsReducedMotion: true,
      ...extra,
    },
    engine: {} as GameModule['engine'],
    strings: { en: {}, fr: {} },
  };
}

/** Every game the fake knows. `fake.games` is what it lists; tests set it. */
export const fake = {
  all: [
    make('alpha', 'Alpha Puzzle', { learning: { skill: { en: 'Reading odds', fr: 'Lire les chances' }, concepts: ['odds'] } }),
    make('beta', 'Beta Arcade', { category: 'arcade', minRing: 3, rosterSize: { min: 2, max: 2 } }),
  ],
  games: [] as GameModule[],
  /** How the fake Screen behaves: it plays, crashes while rendering, or fails to load. */
  mode: 'ok' as 'ok' | 'crash' | 'fail',
};

function FakeScreen(props: GameScreenProps) {
  if (fake.mode === 'crash') throw new Error('boom');
  const ids = props.party.members.map((m) => m.id);
  const win: Outcome = { result: 'won', score: 700, log: ['Fine.'], troopsUsed: ids.slice(0, 1) };
  const learnedWin: Outcome = {
    result: 'won',
    score: 700,
    log: ['A fine game.'],
    troopsUsed: [],
    learned: { topic: { en: 'Odds', fr: 'Chances' }, note: { en: 'Weights tilt a coin.', fr: 'Les poids penchent une pièce.' } },
  };
  return (
    <div>
      <h2>Fake game</h2>
      <p data-testid="ctx">{`${ids.length}|${props.run.roomIndex}|${props.run.difficulty}|${props.run.buffs.length}|${props.locale}|${String(props.reducedMotion)}`}</p>
      <button type="button" onClick={() => props.onFinish(win)}>win</button>
      <button type="button" onClick={() => props.onFinish({ ...win, score: 5000, troopsUsed: ['ghost'] })}>bad</button>
      <button type="button" onClick={() => props.onExit()}>exit</button>
      <button
        type="button"
        onClick={() => {
          props.onExit();
          props.onFinish(win);
        }}
      >
        exit then finish
      </button>
      <button type="button" onClick={() => props.onFinish(learnedWin)}>Win the game</button>
      <button type="button" onClick={() => props.onFinish({ result: 'lost', score: 100, log: ['Close.'], troopsUsed: [] })}>Lose the game</button>
      <button type="button" onClick={() => window.setTimeout(() => props.onFinish(learnedWin), 10)}>Win in a moment</button>
    </div>
  );
}

export const catalog = {
  getGame: (id: string): GameModule | undefined => fake.all.find((g) => g.manifest.id === id),
  loadScreen: async (): Promise<ComponentType<GameScreenProps>> => {
    if (fake.mode === 'fail') throw new Error('offline');
    return FakeScreen;
  },
  listedGames: (): GameModule[] => fake.games,
  gameCandidates: (games: readonly GameModule[] = fake.games) => games.map((g) => ({ id: g.manifest.id, minRing: g.manifest.minRing, rosterMin: g.manifest.rosterSize.min })),
  gameLocale: () => 'en' as const,
};
