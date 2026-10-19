/**
 * The game's entry for the registry: manifest, engine and strings. No React
 * here; the registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'sample',
    name: { en: 'Coin Duel', fr: 'Duel de pièces' },
    tagline: { en: 'Three weighted coin flips. Send the right ally each round.', fr: 'Trois lancers pipés. Envoyez le bon allié à chaque manche.' },
    category: 'strategy',
    minRing: 1,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 1,
    supportsReducedMotion: true,
    learning: {
      skill: { en: 'Reading odds', fr: 'Lire les probabilités' },
      concepts: ['probability', 'expected value'],
    },
    // The reference game: listed in the Games Lab, hidden from the Arena.
    devOnly: true,
  },
  engine,
  strings,
});
