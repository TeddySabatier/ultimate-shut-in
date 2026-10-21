/**
 * The game's entry for the registry: manifest, engine and strings. No React
 * here; the registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'roguelike-chess',
    name: { en: 'Roguelike Chess', fr: 'Échecs vagabonds' },
    tagline: {
      en: 'Your troops are the pieces. Three rooms, then the Static.',
      fr: 'Tes troupes sont les pièces. Trois salles, puis le Statique.',
    },
    category: 'strategy',
    minRing: 2,
    rosterSize: { min: 3, max: 8 },
    estMinutes: 3,
    supportsReducedMotion: true,
  },
  engine,
  strings,
});
