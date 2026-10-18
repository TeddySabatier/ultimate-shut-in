/**
 * Economy constants and formulas (GDD 6.2, 6.4, 7, 8, 10.1).
 * Every number here is the GDD's; nothing is tuned elsewhere.
 */
import { rings, tierDefaults, type QuestTemplate } from './content';
import type { Difficulty, GameEvent, HabitId, RingId, SaveFile, Tier, Vassal } from './types';

export interface DifficultyTable {
  questsPerDay: number;
  /** Tier weights for tiers 1, 2, 3 (percentages). */
  tierWeights: readonly [number, number, number];
  rewardMult: number;
  loyaltyGain: number;
  loyaltyDecay: number;
  utilityDecay: number;
  attackMult: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyTable> = {
  gentle: { questsPerDay: 3, tierWeights: [60, 35, 5], rewardMult: 1.0, loyaltyGain: 8, loyaltyDecay: 2, utilityDecay: 10, attackMult: 0.8 },
  steady: { questsPerDay: 4, tierWeights: [30, 50, 20], rewardMult: 1.1, loyaltyGain: 6, loyaltyDecay: 3, utilityDecay: 15, attackMult: 1.0 },
  hardcore: { questsPerDay: 5, tierWeights: [10, 45, 45], rewardMult: 1.2, loyaltyGain: 5, loyaltyDecay: 5, utilityDecay: 20, attackMult: 1.25 },
};

export const PLAYER_LEVEL_CAP = 50;
export const VASSAL_LEVEL_CAP = 30;
export const LOYALTY_START = 50;
export const LOYALTY_MAX = 100;
export const LOYALTY_WELCOME_GIFT = 70;
export const TRUST_MAX = 7;
export const BONUS_CONTRACT_MULT = 2;
export const TIMED_BONUS_MULT = 1.1;
export const UTILITY_RESTORE = 25;
export const UTILITY_RESTORE_TIER3 = 40;
export const UTILITY_MAX = 100;
export const WELL_KEPT_THRESHOLD = 70;
export const WELL_KEPT_BONUS = 5;
export const WELL_KEPT_BONUS_COURTYARD = 8;
export const CLINIC_DECAY_MULT = 0.75;
export const MAX_COMBO_SLOTS = 2;
export const WAVE_DP: Record<'decisive' | 'win' | 'loss' | 'quiet', number> = { decisive: 22, win: 15, loss: 5, quiet: 0 };
export const WAVE_WEEK_CAP = 52;
export const RESURRECTION_PRICE = 500;
export const RESURRECTION_PRICE_CORNER_SHOP = 450;
export const RESURRECTION_WINDOW_DAYS = 14;
export const REROLL_PRICE = 15;
export const REROLL_PRICE_CORNER_SHOP = 10;
export const WELCOME_GIFT_PRICE = 30;
export const LOYALTY_CATCHUP_CAP_DAYS = 7;
export const UTILITY_CATCHUP_CAP_DAYS = 3;
export const STREAK_LOSS_MIN_LENGTH = 3;

/* ------------------------- Facilities by ring ------------------------- */

export const FACILITY_RING = {
  forge: 2,
  workshop: 4,
  cornerShop: 5,
  courtyard: 5,
  clinic: 6,
  library: 6,
} as const;

export function hasFacility(ring: number, facility: keyof typeof FACILITY_RING): boolean {
  return ring >= FACILITY_RING[facility];
}

/* ----------------------------- XP curves ----------------------------- */

/** XP needed to go from level L to L+1 (L = 1..49). Level 50 is the cap. */
export function xpToNext(level: number): number {
  return 50 + 45 * level + 2 * level * level;
}

/** Cumulative XP at the start of `level`. */
export function cumulativeXp(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/** Vassal XP needed to go from L to L+1 (L = 1..29). Cap 30. */
export function vassalXpToNext(level: number): number {
  return 80 + 40 * level;
}

/* ----------------------------- Rings ----------------------------- */

/** Highest ring whose threshold is <= dp. */
export function ringForDomainPoints(dp: number): RingId {
  let ring: RingId = 1;
  for (const r of rings) if (dp >= r.domainPointsRequired) ring = r.id;
  return ring;
}

export function wallBonus(ring: number): number {
  return rings.find((r) => r.id === ring)?.wallBonus ?? 0;
}

export function ringName(ring: number): string {
  return rings.find((r) => r.id === ring)?.name ?? `Ring ${ring}`;
}

/** The next ring's definition, or null at ring 7. */
export function nextRing(ring: number): { id: RingId; name: string; domainPointsRequired: number } | null {
  const r = rings.find((x) => x.id === ring + 1);
  return r ? { id: r.id, name: r.name, domainPointsRequired: r.domainPointsRequired } : null;
}

/* ---------------------------- Prices ---------------------------- */

export function rerollPrice(ring: number): number {
  return hasFacility(ring, 'cornerShop') ? REROLL_PRICE_CORNER_SHOP : REROLL_PRICE;
}

export function resurrectionPrice(ring: number): number {
  return hasFacility(ring, 'cornerShop') ? RESURRECTION_PRICE_CORNER_SHOP : RESURRECTION_PRICE;
}

/* ---------------------------- Rewards ---------------------------- */

export interface RewardContext {
  difficulty: Difficulty;
  bonus: boolean;
  timedBonus: boolean;
  /** Already-capped sum of applicable title xpMult values (0 when none). */
  titleXpMult?: number;
  /** Already-capped sum of title coinMult values. */
  titleCoinMult?: number;
  /** Sum of title loyaltyGainFlat values. */
  titleLoyaltyFlat?: number;
}

export interface QuestRewards {
  xp: number;
  coins: number;
  dp: number;
  /** Uncapped loyalty gain; the caller clamps against 100. */
  loyalty: number;
}

/** Reward formulas from GDD 6.4. */
export function questRewards(template: Pick<QuestTemplate, 'tier' | 'baseXp' | 'baseCoins'>, ctx: RewardContext): QuestRewards {
  const table = DIFFICULTY[ctx.difficulty];
  const B = ctx.bonus ? BONUS_CONTRACT_MULT : 1;
  const T = ctx.timedBonus ? TIMED_BONUS_MULT : 1;
  const mXp = 1 + (ctx.titleXpMult ?? 0);
  const mCoin = 1 + (ctx.titleCoinMult ?? 0);
  return {
    xp: Math.round(template.baseXp * table.rewardMult * B * T * mXp),
    coins: Math.round(template.baseCoins * table.rewardMult * B * mCoin),
    dp: tierDefaults[template.tier].domainPoints * B,
    loyalty: table.loyaltyGain + (template.tier - 1) + (ctx.titleLoyaltyFlat ?? 0),
  };
}

export function loyaltyGain(difficulty: Difficulty, tier: Tier, titleFlat = 0): number {
  return DIFFICULTY[difficulty].loyaltyGain + (tier - 1) + titleFlat;
}

export function loyaltyDecay(difficulty: Difficulty): number {
  return DIFFICULTY[difficulty].loyaltyDecay;
}

export function utilityRestoreAmount(tier: Tier): number {
  return tier === 3 ? UTILITY_RESTORE_TIER3 : UTILITY_RESTORE;
}

/** Daily utility decay after facility and title multipliers, rounded. */
export function utilityDecayAmount(difficulty: Difficulty, ring: number, titleDecayMult = 1): number {
  const base = DIFFICULTY[difficulty].utilityDecay;
  const clinic = hasFacility(ring, 'clinic') ? CLINIC_DECAY_MULT : 1;
  return Math.round(base * clinic * titleDecayMult);
}

/* ----------------------- Draft-level mutations ----------------------- */

/** Add XP to the player, levelling up as needed. Returns level-up events. */
export function addPlayerXpDraft(draft: SaveFile, xp: number): GameEvent[] {
  const events: GameEvent[] = [];
  const p = draft.player;
  p.xp += xp;
  while (p.level < PLAYER_LEVEL_CAP && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    events.push({ type: 'levelUp', level: p.level });
  }
  return events;
}

/** Remove XP (undo), levelling down as needed; never below level 1 / 0 xp. */
export function removePlayerXpDraft(draft: SaveFile, xp: number): void {
  const p = draft.player;
  p.xp -= xp;
  while (p.xp < 0 && p.level > 1) {
    p.level -= 1;
    p.xp += xpToNext(p.level);
  }
  if (p.xp < 0) p.xp = 0;
}

export function addVassalXpDraft(vassal: Vassal, xp: number): GameEvent[] {
  const events: GameEvent[] = [];
  vassal.xp += xp;
  while (vassal.level < VASSAL_LEVEL_CAP && vassal.xp >= vassalXpToNext(vassal.level)) {
    vassal.xp -= vassalXpToNext(vassal.level);
    vassal.level += 1;
    events.push({ type: 'vassalLevelUp', habit: vassal.habit, level: vassal.level });
  }
  return events;
}

export function removeVassalXpDraft(vassal: Vassal, xp: number): void {
  vassal.xp -= xp;
  while (vassal.xp < 0 && vassal.level > 1) {
    vassal.level -= 1;
    vassal.xp += vassalXpToNext(vassal.level);
  }
  if (vassal.xp < 0) vassal.xp = 0;
}

/** Re-derive `player.ring` from `domainPoints`; emits ringUnlocked when it rose. */
export function recomputeRingDraft(draft: SaveFile): GameEvent[] {
  const events: GameEvent[] = [];
  const before = draft.player.ring;
  const after = ringForDomainPoints(draft.player.domainPoints);
  draft.player.ring = after;
  for (let r = before + 1; r <= after; r++) events.push({ type: 'ringUnlocked', ring: r as RingId });
  return events;
}

export function isHabitEnabled(draft: SaveFile, habit: HabitId): boolean {
  return draft.settings.enabledHabits.includes(habit);
}
