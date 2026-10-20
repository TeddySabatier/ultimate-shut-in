/**
 * Arena economy proof helpers (G1 acceptance): fees and training caps
 * computed from `src/game/economy.ts` (`questRewards`, `DIFFICULTY`, `tierDefaults`).
 */
import { DIFFICULTY, questRewards } from '../economy';
import { tierDefaults } from '../content';
import type { Difficulty, RingId, Tier } from '../types';
import { arenaContent } from './content';

/** Settlement for one typical quest of `tier` at `difficulty` (no bonus, no titles). */
export function typicalQuestCoins(difficulty: Difficulty, tier: Tier): number {
  const t = tierDefaults[tier];
  return questRewards({ tier, baseXp: t.baseXp, baseCoins: t.baseCoins }, { difficulty, bonus: false, timedBonus: false }).coins;
}

/** Expected settlement from a full board of typical-tier quests (GDD 6.4, no bonus). */
export function typicalDayCoins(difficulty: Difficulty): number {
  const table = DIFFICULTY[difficulty];
  const [w1, w2, w3] = table.tierWeights;
  const per =
    (w1 * typicalQuestCoins(difficulty, 1) + w2 * typicalQuestCoins(difficulty, 2) + w3 * typicalQuestCoins(difficulty, 3)) / 100;
  return per * table.questsPerDay;
}

/** Expected settlement per game day from quests, scaled by adherence (0..1). */
export function expectedDailyCoins(difficulty: Difficulty, adherence: number): number {
  return typicalDayCoins(difficulty) * adherence;
}

/** Entry fee for a run at `ring`, never more than one typical day of that difficulty. */
export function entryFee(ring: RingId, difficulty: Difficulty = 'steady'): number {
  const e = arenaContent.entry;
  const typical = typicalDayCoins(difficulty);
  const raw = e.base + e.perRing * Math.max(0, ring - 1);
  const cap = typical * e.maxDailyFraction;
  return Math.min(Math.round(raw), Math.round(cap));
}

/** Maximum training spend allowed in one wave period (25% of a typical habit week). */
export function maxTrainingSpendPerPeriod(difficulty: Difficulty): number {
  return Math.floor(typicalDayCoins(difficulty) * 7 * arenaContent.training.weeklyCapFraction);
}
