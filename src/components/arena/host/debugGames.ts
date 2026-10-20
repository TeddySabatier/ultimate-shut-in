/**
 * The debug-only restriction of the Arena's catalog. With the debug flag on and
 * `localStorage['haven.debug.games']` set to game ids (`sample` or
 * `sample,tower-defense`), the Arena offers only those games, so an end-to-end
 * test of the host keeps playing the same deterministic game whatever else is
 * registered. It is ignored entirely when the debug flag is off: a player can
 * never narrow their own catalog. Pure and free of the registry on purpose
 * (see `catalog.ts`, which applies it).
 */
import type { GameModule } from '../../../games/contract';

export const DEBUG_GAMES_KEY = 'haven.debug.games';

/** The ids in a stored value, or `null` when there is no restriction (missing, empty, unreadable). A JSON array of strings is accepted as well as a comma-separated list. */
export function parseDebugGameIds(raw: string | null | undefined): string[] | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '') return null;
  let parts: unknown[];
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) return null;
      parts = parsed;
    } catch {
      return null;
    }
  } else {
    parts = text.split(',');
  }
  const ids = parts.filter((p): p is string => typeof p === 'string').map((p) => p.trim()).filter((p) => p !== '');
  return ids.length > 0 ? ids : null;
}

/** `games` reduced to the ids in `raw`, in the registry's order. Returns `games` untouched when `debug` is off or `raw` holds no usable ids; unknown ids match nothing, so a list of only unknown ids gives an empty catalog. */
export function restrictToDebugGames(games: readonly GameModule[], raw: string | null | undefined, debug: boolean): GameModule[] {
  if (!debug) return [...games];
  const ids = parseDebugGameIds(raw);
  if (ids === null) return [...games];
  const wanted = new Set(ids);
  return games.filter((g) => wanted.has(g.manifest.id));
}

/** The stored value, or `null` (storage missing or blocked). */
export function readDebugGamesValue(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(DEBUG_GAMES_KEY);
  } catch {
    return null;
  }
}
