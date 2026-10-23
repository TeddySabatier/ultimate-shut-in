/**
 * The game's entry for the registry: manifest, engine and strings. No React
 * here; the registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'reading-race',
    name: { en: 'Reading Race', fr: 'Course de lecture' },
    tagline: {
      en: 'Read at a pace you still understand. Speed without comprehension loses.',
      fr: 'Lis au rythme où tu comprends encore. La vitesse sans compréhension perd.',
    },
    category: 'self-development',
    minRing: 1,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 4,
    supportsReducedMotion: true,
  },
  engine,
  strings,
});
