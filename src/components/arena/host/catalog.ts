/**
 * Re-exports the games registry for the lazy Arena route. App.tsx, the store
 * and shallow components must not import this file.
 */
import { debugEnabled } from '../../../state/debug';
import { getGame, listGames, loadScreen } from '../../../games/registry';

export { getGame, listGames, loadScreen };

export function listedGames() {
  return listGames({ includeDev: debugEnabled() });
}

export function eligibleGameIds(ring: number): { id: string; minRing: number }[] {
  return listedGames()
    .filter((g) => g.manifest.minRing <= ring)
    .map((g) => ({ id: g.manifest.id, minRing: g.manifest.minRing }));
}
