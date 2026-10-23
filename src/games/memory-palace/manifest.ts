/**
 * Memory Palace: the method of loci as a short walk through six rooms.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'memory-palace',
    name: { en: 'Memory Palace', fr: 'Palais de mémoire' },
    tagline: {
      en: 'Walk the rooms, place each thing, and keep it by where it lives.',
      fr: 'Traverse les salles, replace chaque chose, et retiens-la par l’endroit où elle vit.',
    },
    category: 'self-development',
    minRing: 1,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 3,
    supportsReducedMotion: true,
    learning: {
      skill: { en: 'Method of loci', fr: 'Méthode des loci' },
      concepts: ['working memory', 'method of loci', 'short-term memory'],
    },
  },
  engine,
  strings,
});
