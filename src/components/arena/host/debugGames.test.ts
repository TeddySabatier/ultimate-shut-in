import { afterEach, describe, expect, it } from 'vitest';
import type { GameModule } from '../../../games/contract';
import { DEBUG_GAMES_KEY, parseDebugGameIds, readDebugGamesValue, restrictToDebugGames } from './debugGames';

const game = (id: string) => ({ manifest: { id } }) as unknown as GameModule;
const games = [game('sample'), game('tower-defense'), game('still-water')];
const ids = (list: GameModule[]) => list.map((g) => g.manifest.id);

afterEach(() => localStorage.removeItem(DEBUG_GAMES_KEY));

describe('restrictToDebugGames', () => {
  it('ignores the setting entirely when the debug flag is off', () => {
    expect(ids(restrictToDebugGames(games, 'sample', false))).toEqual(['sample', 'tower-defense', 'still-water']);
    expect(ids(restrictToDebugGames(games, 'nothing-like-it', false))).toEqual(['sample', 'tower-defense', 'still-water']);
  });

  it('filters to the listed ids when the debug flag is on', () => {
    expect(ids(restrictToDebugGames(games, 'sample', true))).toEqual(['sample']);
    expect(ids(restrictToDebugGames(games, ' sample , still-water ', true))).toEqual(['sample', 'still-water']);
  });

  it('gives an empty catalog for unknown ids', () => {
    expect(restrictToDebugGames(games, 'nope,nothing', true)).toEqual([]);
  });

  it("keeps the registry's order, whatever the order of the ids", () => {
    expect(ids(restrictToDebugGames(games, 'still-water,sample', true))).toEqual(['sample', 'still-water']);
  });

  it('tolerates empty, blank and unreadable values by not restricting', () => {
    for (const raw of [null, undefined, '', '   ', ',', ' , ,', '[', '[bad json', '[]', '[1,2]']) {
      expect(ids(restrictToDebugGames(games, raw, true))).toEqual(['sample', 'tower-defense', 'still-water']);
    }
  });

  it('also accepts a JSON array of ids', () => {
    expect(ids(restrictToDebugGames(games, '["tower-defense"]', true))).toEqual(['tower-defense']);
  });
});

describe('parseDebugGameIds', () => {
  it('splits, trims and drops empty entries', () => {
    expect(parseDebugGameIds('a, b,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseDebugGameIds('')).toBeNull();
  });
});

describe('readDebugGamesValue', () => {
  it('reads the localStorage key and returns null when it is missing', () => {
    expect(readDebugGamesValue()).toBeNull();
    localStorage.setItem(DEBUG_GAMES_KEY, 'sample');
    expect(readDebugGamesValue()).toBe('sample');
  });
});
