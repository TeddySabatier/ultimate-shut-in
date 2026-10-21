/**
 * Sudoku: the game's entry for the registry. No React here; the registry
 * loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'sudoku',
    name: { en: 'Sudoku', fr: 'Sudoku' },
    tagline: {
      en: 'Fill the grid with logic. Small boards first, the full board later.',
      fr: 'Remplis la grille par la logique. Petites grilles d\u2019abord, grande grille ensuite.',
    },
    category: 'puzzle',
    minRing: 1,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 5,
    supportsReducedMotion: true,
  },
  engine,
  strings,
});
