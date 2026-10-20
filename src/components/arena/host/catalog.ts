/**
 * The games the Arena can play, read from the registry (docs/design/ARENA.md 7.3).
 *
 * This is the one file of the Arena that imports `src/games/registry`, and it
 * sits in `src/components/arena/host/`, the folder the lint rule allows. It
 * is loaded only through the lazy `ArenaScreen` route, so no game manifest,
 * engine or string ever reaches the main bundle.
 */
import type { GameCandidate } from '../../../game';
import type { GameModule, Locale } from '../../../games/contract';
import { getGame, listGames, loadScreen } from '../../../games/registry';
import { debugEnabled } from '../../../state/debug';
import { readDebugGamesValue, restrictToDebugGames } from './debugGames';

export { getGame, loadScreen };

/**
 * What a player may be offered: dev-only games (the sample) show only with the debug flag, so tests see them and players never do.
 * With the debug flag on, `localStorage['haven.debug.games']` (comma-separated ids) narrows the catalog to those games (see `debugGames.ts`); it is ignored without the flag.
 */
export function listedGames(): GameModule[] {
  const debug = debugEnabled();
  const games = listGames({ includeDev: debug });
  return debug ? restrictToDebugGames(games, readDebugGamesValue(), true) : games;
}

/** The listing, reduced to what the engine needs to pick a game. */
export function gameCandidates(games: readonly GameModule[] = listedGames()): GameCandidate[] {
  return games.map((g) => ({ id: g.manifest.id, minRing: g.manifest.minRing, rosterMin: g.manifest.rosterSize.min }));
}

/** The player's language for the games' own text: French when the browser asks for it, English otherwise. */
export function gameLocale(): Locale {
  const lang = typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language.toLowerCase() : 'en';
  return lang.startsWith('fr') ? 'fr' : 'en';
}
