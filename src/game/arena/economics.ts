/**
 * Arena prices and limits, all derived from `economy.ts` and `arena.json`
 * (docs/design/ARENA.md 3 and 9). The one rule behind every number: coins
 * come from habits, so what the Arena asks for is a share of what a player
 * who keeps their habits earns.
 */
import { arenaContent, getCombo, tierDefaults, type ArenaGearItem } from '../content';
import { DIFFICULTY } from '../economy';
import type { Difficulty, RingId } from '../types';

/** Round to the nearest 5 so prices read like prices. */
function tidy(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

/** Average settlement of one quest: the reward multiplier times the tier-weighted base coins (GDD 6.4). */
export function expectedQuestCoins(difficulty: Difficulty): number {
  const t = DIFFICULTY[difficulty];
  const [w1, w2, w3] = t.tierWeights;
  const base = (w1 * tierDefaults[1].baseCoins + w2 * tierDefaults[2].baseCoins + w3 * tierDefaults[3].baseCoins) / 100;
  return t.rewardMult * base;
}

/** Coins a player earns in a day from quests, at `adherence` (0..1) of the daily board. */
export function typicalDailyCoins(difficulty: Difficulty, adherence: number = arenaContent.run.feeAdherence): number {
  return DIFFICULTY[difficulty].questsPerDay * adherence * expectedQuestCoins(difficulty);
}

export function typicalWeeklyCoins(difficulty: Difficulty, adherence: number = arenaContent.training.weeklyAdherence): number {
  return 7 * typicalDailyCoins(difficulty, adherence);
}

/**
 * Entry fee of a run: the ring's fee, never more than one day of typical
 * earnings at the player's difficulty (the first Arena rule, ARENA.md 3.1).
 */
export function entryFee(ring: number, difficulty: Difficulty): number {
  const table = arenaContent.run.feeByRing;
  const byRing = table[Math.min(Math.max(ring, 1), table.length) - 1] ?? table[0] ?? 0;
  return Math.max(1, Math.min(byRing, Math.floor(typicalDailyCoins(difficulty, arenaContent.run.feeAdherence))));
}

/** Most coins the player may put into training in one wave period (a quarter of what habits give, ARENA.md 4.3). */
export function trainingWeeklyCap(difficulty: Difficulty): number {
  return Math.floor(arenaContent.training.weeklyShareOfHabitCoins * typicalWeeklyCoins(difficulty, arenaContent.training.weeklyAdherence));
}

/** Price factor of a ring: `1 + step * (ring - 1)`. */
export function ringFactor(ring: number, step: number): number {
  return 1 + step * (Math.min(Math.max(ring, 1), 7) - 1);
}

/** Price of a sold Armory item at a ring (0 for rare items, which are only won). */
export function gearPrice(item: Pick<ArenaGearItem, 'price' | 'rare'>, ring: number): number {
  if (item.rare === true || item.price <= 0) return 0;
  return tidy(item.price * ringFactor(ring, arenaContent.armory.ringPriceStep));
}

/** Price of the next training bump of a vassal that already has `bumps` of them. */
export function trainingPrice(bumps: number, ring: number): number {
  const t = arenaContent.training;
  return tidy((t.costBase + t.costStep * bumps + t.costSquare * bumps * bumps) * ringFactor(ring, t.ringPriceStep));
}

/** Power added by `bumps` training bumps: the sum of the first entries of the curve. */
export function trainingPower(bumps: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(bumps, arenaContent.training.bumpPower.length); i++) sum += arenaContent.training.bumpPower[i] ?? 0;
  return sum;
}

/** Price of a decor piece (a combo item's name given a place in the Haven). */
export function decorPrice(comboId: string): number | null {
  const combo = getCombo(comboId);
  return combo ? tidy(combo.power * arenaContent.decor.pricePerPower) : null;
}

/** Coins one won game adds to the run's spoils. */
export function winCoins(fee: number, score: number, room: number): number {
  const r = arenaContent.run.reward;
  return Math.max(1, Math.round(fee * (r.base + (r.perScore * Math.max(0, Math.min(1000, score))) / 1000) * (1 + r.growthPerRoom * room)));
}

/** Difficulty of the game in `room` (0-based) for a run entered at `ring`: 1 to 5, rising every other room. */
export function roomDifficulty(room: number, ring: RingId | number): 1 | 2 | 3 | 4 | 5 {
  const steps = Math.floor(room / arenaContent.run.roomsPerDifficultyStep);
  const boost = ring >= arenaContent.run.ringBoostFrom ? 1 : 0;
  return Math.max(1, Math.min(5, 1 + steps + boost)) as 1 | 2 | 3 | 4 | 5;
}
