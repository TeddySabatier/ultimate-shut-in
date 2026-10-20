/**
 * Still Water: the game's entry for the registry. No React here; the
 * registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'still-water',
    name: { en: 'Still Water', fr: 'Eau calme' },
    tagline: {
      en: 'Match a slow breath. Let the ripples pass.',
      fr: 'Suis un souffle lent. Laisse passer les rides.',
    },
    category: 'self-development',
    minRing: 1,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 2,
    supportsReducedMotion: true,
    learning: {
      skill: { en: 'Sustained attention', fr: 'Attention soutenue' },
      concepts: ['pacing', 'breath', 'focus'],
    },
  },
  engine,
  strings,
});
