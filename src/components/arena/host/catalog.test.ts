/** `listedGames` with the debug-only restriction `haven.debug.games`, against the real registry. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listGames } from '../../../games/registry';
import { listedGames } from './catalog';
import { DEBUG_GAMES_KEY } from './debugGames';

const ids = () => listedGames().map((g) => g.manifest.id);

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.removeItem('haven.debug');
  localStorage.removeItem(DEBUG_GAMES_KEY);
});

describe('listedGames', () => {
  it('follows the registry (dev games included) with the debug flag and no restriction', () => {
    vi.stubEnv('DEV', false);
    localStorage.setItem('haven.debug', '1');
    expect(ids()).toEqual(listGames({ includeDev: true }).map((g) => g.manifest.id));
  });

  it('narrows to the ids in haven.debug.games when the debug flag is on', () => {
    vi.stubEnv('DEV', false);
    localStorage.setItem('haven.debug', '1');
    localStorage.setItem(DEBUG_GAMES_KEY, 'sample');
    expect(ids()).toEqual(['sample']);
    localStorage.setItem(DEBUG_GAMES_KEY, 'no-such-game');
    expect(ids()).toEqual([]);
  });

  it('ignores haven.debug.games when the debug flag is off: a player cannot narrow their own catalog', () => {
    vi.stubEnv('DEV', false);
    localStorage.setItem(DEBUG_GAMES_KEY, 'no-such-game');
    expect(ids()).toEqual(listGames({ includeDev: false }).map((g) => g.manifest.id));
    expect(ids()).not.toContain('sample');
  });
});
