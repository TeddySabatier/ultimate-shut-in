/**
 * Weight Garden: grow a tiny neural network and watch it learn. No React here;
 * the Screen is loaded lazily by the registry.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'weight-garden',
    name: { en: 'Weight Garden', fr: 'Jardin des poids' },
    tagline: {
      en: 'Grow a tiny gardener and watch it learn the line between two kinds of seed.',
      fr: 'Fais pousser un petit jardinier et regarde-le tracer la ligne entre deux graines.',
    },
    category: 'ai-learning',
    minRing: 2,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 4,
    supportsReducedMotion: true,
    learning: {
      skill: { en: 'How a neural network learns', fr: 'Comment un réseau de neurones apprend' },
      concepts: ['weights', 'bias', 'decision boundary', 'loss', 'learning rate', 'hidden layer', 'overfitting'],
    },
  },
  engine,
  strings,
});
