/**
 * The game's entry for the registry: manifest, engine and strings. No React
 * here; the registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'decision-dungeon',
    name: { en: 'Decision Dungeon', fr: 'Donjon des choix' },
    tagline: {
      en: 'Everyday friction, four doors. Practise a kinder next step.',
      fr: 'Un accroc du quotidien, quatre portes. Entraîne un geste plus juste.',
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
