/**
 * The game's entry for the registry: manifest, engine and strings. No React
 * here; the registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'subject-scrolls',
    name: { en: 'Scroll Room', fr: 'Salle des parchemins' },
    tagline: {
      en: 'Learn a subject you chose, one scroll at a time. Missed scrolls come back sooner.',
      fr: 'Apprends un sujet que tu as choisi, parchemin par parchemin. Les ratés reviennent plus tôt.',
    },
    category: 'self-development',
    minRing: 1,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 3,
    supportsReducedMotion: true,
    learning: {
      skill: { en: 'Chosen subjects: Kubernetes and eBPF', fr: 'Sujets choisis : Kubernetes et eBPF' },
      concepts: ['spaced-repetition', 'kubernetes', 'ebpf'],
    },
  },
  engine,
  strings,
});
