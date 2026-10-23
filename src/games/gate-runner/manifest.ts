/**
 * Haven Rush: the game's entry for the registry. No React here; the
 * registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'gate-runner',
    name: { en: 'Haven Rush', fr: 'Ruée du Haven' },
    tagline: {
      en: 'Steer the squad through maths gates and shoot the boss down.',
      fr: "Guide l'escouade entre les portes d'opérations et abats le boss.",
    },
    category: 'arcade',
    minRing: 1,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 2,
    supportsReducedMotion: true,
  },
  engine,
  strings,
});
