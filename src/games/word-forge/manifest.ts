/**
 * The game's entry for the registry: manifest, engine and strings. No React
 * here; the registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'word-forge',
    name: { en: 'Word Forge', fr: 'Forge des mots' },
    tagline: {
      en: 'Temper a second language into steel. Cards return sooner when you miss.',
      fr: 'Transforme une langue seconde en acier. Les cartes reviennent plus tôt si tu rates.',
    },
    category: 'self-development',
    minRing: 1,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 3,
    supportsReducedMotion: true,
    learning: {
      skill: { en: 'Second-language vocabulary', fr: 'Vocabulaire en langue seconde' },
      concepts: ['spaced-repetition', 'A2-B1-vocabulary'],
    },
  },
  engine,
  strings,
});
