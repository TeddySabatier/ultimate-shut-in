/**
 * Arena economy proof helpers (G1 acceptance): entry fees vs habit earnings.
 */
import { DIFFICULTY, type DifficultyTable } from '../economy';
import { tierDefaults } from '../content';
import type { Difficulty, RingId } from '../types';
import { arenaContent } from './content';

function weightedBaseCoins(table: DifficultyTable): number {
  const w = table.tierWeights;
  const sum = w[0] + w[1] + w[2];
  return (w[0] * tierDefaults[1].baseCoins + w[1] * tierDefaults[2].baseCoins + w[2] * tierDefaults[3].baseCoins) / sum;
}

/** Expected settlement per game day from quests alone (no bonus contract). */
export function expectedDailyCoins(difficulty: Difficulty, adherence: number): number {
  const table = DIFFICULTY[difficulty];
  const perQuest = Math.round(weightedBaseCoins(table) * table.rewardMult);
  return Math.round(perQuest * table.questsPerDay * adherence);
}

/** Entry fee for a run at `ring`, capped at one day of typical Steady earnings. */
export function entryFee(ring: RingId): number {
  const e = arenaContent.entry;
  const raw = e.base + e.perRing * (ring - 1);
  const cap = Math.round(expectedDailyCoins('steady', 0.9) * e.maxDailyFraction);
  return Math.min(raw, cap);
}

/** Maximum training spend allowed in one wave period (25% of habit coins). */
export function maxTrainingSpendPerPeriod(difficulty: Difficulty, adherence: number): number {
  const weeklyHabitCoins = expectedDailyCoins(difficulty, adherence) * 7;
  return Math.floor(weeklyHabitCoins * arenaContent.training.weeklyCapFraction);
}
