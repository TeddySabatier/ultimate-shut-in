/**
 * The game's entry for the registry: manifest, engine and strings. No React
 * here; the registry loads every manifest eagerly, and the Screen lazily.
 */
import { defineGame } from '../contract';
import { engine } from './engine';
import { strings } from './strings';

export default defineGame({
  manifest: {
    id: 'maze-learner',
    name: { en: 'Maze Learner', fr: 'Labyrinthe apprenti' },
    tagline: {
      en: 'Teach a creature with rewards and penalties, and watch it learn the maze.',
      fr: 'Enseigne à une bestiole avec des récompenses et des pénalités, et regarde-la apprendre.',
    },
    category: 'ai-learning',
    minRing: 2,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 4,
    supportsReducedMotion: true,
    learning: {
      skill: {
        en: 'Reinforcement learning: how rewards shape behaviour, and how a goal gets specified badly.',
        fr: 'Apprentissage par renforcement : comment les récompenses façonnent un comportement.',
      },
      concepts: ['reward', 'penalty', 'trial and error', 'policy', 'value estimate', 'discount', 'exploration versus exploitation', 'reward shaping', 'reward hacking'],
    },
  },
  engine,
  strings,
});
