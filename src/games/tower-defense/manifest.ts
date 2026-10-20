/**
 * The game's entry for the registry: manifest, engine and strings. No React
 * here; the registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'tower-defense',
    name: { en: 'Hold the Haven', fr: 'Tenir le Havre' },
    tagline: {
      en: 'Your troops are the towers. Hold the path and keep the monsters out of the Haven.',
      fr: 'Tes troupes sont les tours. Tiens le chemin et garde les monstres loin du Havre.',
    },
    category: 'defense',
    minRing: 2,
    rosterSize: { min: 3, max: 8 },
    estMinutes: 5,
    supportsReducedMotion: true,
  },
  engine,
  strings,
});
