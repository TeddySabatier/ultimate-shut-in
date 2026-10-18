/**
 * Typed loaders for the content JSON files plus `validateContent()`, a
 * runtime cross-reference check that the test suite runs at module load.
 */
import habitsJson from './habits.json';
import questsJson from './quests.json';
import ringsJson from './rings.json';
import titlesJson from './titles.json';
import combosJson from './combos.json';
import stringsJson from './strings.json';
import type { HabitId, QuestKind, RingId, Tier, UtilityId } from '../types';
import { HABIT_IDS, UTILITY_IDS } from '../types';

/* ----------------------------- Types ----------------------------- */

export interface HabitDef {
  id: HabitId;
  label: string;
  shortLabel: string;
  vassal: { name: string; epithet: string; pronouns: string; personality: string; portrait: string };
  color: string;
  icon: string;
  utility: UtilityId | null;
  defaultEnabled: boolean;
  description: string;
}

export interface QuestTemplate {
  id: string;
  habit: HabitId;
  title: string;
  description: string;
  tier: Tier;
  minRing: RingId;
  kind: QuestKind;
  durationMin?: number;
  targetCount?: number;
  baseXp: number;
  baseCoins: number;
  tags: string[];
}

export interface TierDefault {
  baseXp: number;
  baseCoins: number;
  domainPoints: number;
}

export interface Facility {
  id: string;
  name: string;
  effect: string;
}

export interface RingDef {
  id: RingId;
  key: string;
  name: string;
  domainPointsRequired: number;
  wallBonus: number;
  facilities: Facility[];
  vignette: string;
}

export type TitleCondition =
  | { type: 'questsTotal'; count: number }
  | { type: 'questsOfHabit'; habit: HabitId; count: number }
  | { type: 'questDaysTotal'; count: number }
  | { type: 'questDayStreak'; count: number }
  | { type: 'anyVassalLoyaltyAtLeast'; value: number }
  | { type: 'allVassalsLoyaltyAtLeast'; value: number }
  | { type: 'utilityFullStreak'; utility: UtilityId; days: number }
  | { type: 'waveWins'; count: number }
  | { type: 'decisiveWinStreak'; count: number }
  | { type: 'ringReached'; ring: RingId }
  | { type: 'combosForged'; count: number }
  | { type: 'resurrectionUsed'; count: number }
  | { type: 'vassalReRecruited'; count: number };

export type TitleEffect =
  | { type: 'xpMult'; scope: 'all'; value: number }
  | { type: 'xpMult'; scope: 'habit'; habit?: HabitId; habitFrom?: 'conditionVassal'; value: number }
  | { type: 'coinMult'; scope: 'all'; value: number }
  | { type: 'dpMult'; value: number }
  | { type: 'defenseFlat'; value: number }
  | { type: 'utilityDecayMult'; utility: UtilityId; value: number }
  | { type: 'comboPower'; value: number }
  | { type: 'loyaltyGainFlat'; value: number };

export interface TitleDef {
  id: string;
  name: string;
  flavor: string;
  condition: TitleCondition;
  effect: TitleEffect;
}

export interface StackCaps {
  xpMult: number;
  coinMult: number;
  dpMult: number;
  defenseFlat: number;
}

export interface ComboDef {
  id: string;
  name: string;
  habits: HabitId[];
  power: number;
  flavor: string;
  legendary?: boolean;
}

export interface ComboRules {
  minRing: number;
  oncePerWeekEach: boolean;
  maxCountedPerWave: number;
  expiresAtWave: boolean;
}

export type Strings = typeof stringsJson;

/* ---------------------------- Loaders ---------------------------- */

export const habits: readonly HabitDef[] = habitsJson.habits as HabitDef[];
export const quests: readonly QuestTemplate[] = questsJson.quests as QuestTemplate[];
export const tierDefaults: Record<Tier, TierDefault> = {
  1: questsJson.tierDefaults['1'],
  2: questsJson.tierDefaults['2'],
  3: questsJson.tierDefaults['3'],
};
export const rings: readonly RingDef[] = ringsJson.rings as RingDef[];
export const titles: readonly TitleDef[] = titlesJson.titles as unknown as TitleDef[];
export const stackCaps: StackCaps = titlesJson.stackCaps;
export const combos: readonly ComboDef[] = combosJson.combos as ComboDef[];
export const comboRules: ComboRules = combosJson.rules;
export const strings: Strings = stringsJson;

const habitById = new Map(habits.map((h) => [h.id, h] as const));
const questById = new Map(quests.map((q) => [q.id, q] as const));
const ringById = new Map(rings.map((r) => [r.id, r] as const));
const titleById = new Map(titles.map((t) => [t.id, t] as const));
const comboById = new Map(combos.map((c) => [c.id, c] as const));

export function getHabit(id: HabitId): HabitDef {
  const h = habitById.get(id);
  if (!h) throw new Error(`Unknown habit ${id}`);
  return h;
}

export function getQuest(id: string): QuestTemplate | undefined {
  return questById.get(id);
}

export function getRing(id: number): RingDef {
  const r = ringById.get(id as RingId);
  if (!r) throw new Error(`Unknown ring ${id}`);
  return r;
}

export function getTitle(id: string): TitleDef | undefined {
  return titleById.get(id);
}

export function getCombo(id: string): ComboDef | undefined {
  return comboById.get(id);
}

/** Habit that feeds a utility (sleep -> power, hygiene -> water, eat -> gas). */
export function habitForUtility(utility: UtilityId): HabitId {
  const h = habits.find((x) => x.utility === utility);
  if (!h) throw new Error(`No habit feeds ${utility}`);
  return h.id;
}

export function utilityForHabit(habit: HabitId): UtilityId | null {
  return getHabit(habit).utility;
}

/* ------------------------ String helpers ------------------------ */

/** Stable pick from a pool using a seed (GDD 18.18: a day's copy is stable). */
export function pickLine(pool: readonly string[], seed: number): string {
  if (pool.length === 0) return '';
  return pool[Math.abs(seed >>> 0) % pool.length] ?? '';
}

/** Replace `{placeholder}` tokens with the given values. */
export function formatLine(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = vars[key];
    return v === undefined ? match : String(v);
  });
}

/* --------------------------- Validation --------------------------- */

const KNOWN_CONDITIONS = new Set([
  'questsTotal',
  'questsOfHabit',
  'questDaysTotal',
  'questDayStreak',
  'anyVassalLoyaltyAtLeast',
  'allVassalsLoyaltyAtLeast',
  'utilityFullStreak',
  'waveWins',
  'decisiveWinStreak',
  'ringReached',
  'combosForged',
  'resurrectionUsed',
  'vassalReRecruited',
]);

const KNOWN_EFFECTS = new Set([
  'xpMult',
  'coinMult',
  'dpMult',
  'defenseFlat',
  'utilityDecayMult',
  'comboPower',
  'loyaltyGainFlat',
]);

/** Returns a list of problems; an empty list means the content is consistent. */
export function validateContent(): string[] {
  const errors: string[] = [];
  const habitIds = new Set<string>(HABIT_IDS);
  const utilityIds = new Set<string>(UTILITY_IDS);

  // Habits: exactly the 8 known ids, unique, utilities valid.
  const seenHabits = new Set<string>();
  for (const h of habits) {
    if (!habitIds.has(h.id)) errors.push(`habit ${h.id}: unknown id`);
    if (seenHabits.has(h.id)) errors.push(`habit ${h.id}: duplicate id`);
    seenHabits.add(h.id);
    if (h.utility !== null && !utilityIds.has(h.utility)) errors.push(`habit ${h.id}: bad utility ${h.utility}`);
  }
  if (seenHabits.size !== HABIT_IDS.length) errors.push(`expected ${HABIT_IDS.length} habits, got ${seenHabits.size}`);
  for (const u of UTILITY_IDS) {
    if (habits.filter((h) => h.utility === u).length !== 1) errors.push(`utility ${u}: must be fed by exactly one habit`);
  }

  // Rings: 7, ascending ids, strictly ascending thresholds, ring 1 at 0.
  if (rings.length !== 7) errors.push(`expected 7 rings, got ${rings.length}`);
  rings.forEach((r, i) => {
    if (r.id !== i + 1) errors.push(`ring at index ${i}: id ${r.id} out of order`);
    const prev = rings[i - 1];
    if (prev && !(r.domainPointsRequired > prev.domainPointsRequired)) {
      errors.push(`ring ${r.id}: domainPointsRequired not ascending`);
    }
    if (prev && !(r.wallBonus > prev.wallBonus)) errors.push(`ring ${r.id}: wallBonus not ascending`);
  });
  if (rings[0]?.domainPointsRequired !== 0) errors.push('ring 1 must require 0 DP');

  // Quests: unique ids, valid habit/ring/tier/kind, per-kind fields, >= 7 per habit, >= 3 ring-1 per habit.
  const seenQuests = new Set<string>();
  const perHabit = new Map<string, number>();
  const perHabitRing1 = new Map<string, number>();
  for (const q of quests) {
    if (seenQuests.has(q.id)) errors.push(`quest ${q.id}: duplicate id`);
    seenQuests.add(q.id);
    if (!habitIds.has(q.habit)) errors.push(`quest ${q.id}: unknown habit ${q.habit}`);
    if (!ringById.has(q.minRing)) errors.push(`quest ${q.id}: bad minRing ${q.minRing}`);
    if (![1, 2, 3].includes(q.tier)) errors.push(`quest ${q.id}: bad tier ${q.tier}`);
    if (!['check', 'timer', 'count'].includes(q.kind)) errors.push(`quest ${q.id}: bad kind ${q.kind}`);
    if (q.kind === 'timer' && !(typeof q.durationMin === 'number' && q.durationMin > 0)) {
      errors.push(`quest ${q.id}: timer needs durationMin`);
    }
    if (q.kind === 'count' && !(typeof q.targetCount === 'number' && q.targetCount > 0)) {
      errors.push(`quest ${q.id}: count needs targetCount`);
    }
    if (q.kind === 'check' && (q.durationMin !== undefined || q.targetCount !== undefined)) {
      errors.push(`quest ${q.id}: check must not carry durationMin/targetCount`);
    }
    if (!(q.baseXp > 0) || !(q.baseCoins > 0)) errors.push(`quest ${q.id}: rewards must be positive`);
    perHabit.set(q.habit, (perHabit.get(q.habit) ?? 0) + 1);
    if (q.minRing === 1) perHabitRing1.set(q.habit, (perHabitRing1.get(q.habit) ?? 0) + 1);
  }
  for (const id of HABIT_IDS) {
    if ((perHabit.get(id) ?? 0) < 7) errors.push(`habit ${id}: fewer than 7 templates`);
    if ((perHabitRing1.get(id) ?? 0) < 3) errors.push(`habit ${id}: fewer than 3 ring-1 templates`);
  }

  // Titles: unique ids, known condition/effect kinds, valid references.
  const seenTitles = new Set<string>();
  for (const t of titles) {
    if (seenTitles.has(t.id)) errors.push(`title ${t.id}: duplicate id`);
    seenTitles.add(t.id);
    const c = t.condition as { type: string; habit?: string; utility?: string; ring?: number };
    if (!KNOWN_CONDITIONS.has(c.type)) errors.push(`title ${t.id}: unknown condition ${c.type}`);
    if (c.habit !== undefined && !habitIds.has(c.habit)) errors.push(`title ${t.id}: bad condition habit`);
    if (c.utility !== undefined && !utilityIds.has(c.utility)) errors.push(`title ${t.id}: bad condition utility`);
    if (c.ring !== undefined && !ringById.has(c.ring as RingId)) errors.push(`title ${t.id}: bad condition ring`);
    const e = t.effect as { type: string; habit?: string; utility?: string; scope?: string; habitFrom?: string };
    if (!KNOWN_EFFECTS.has(e.type)) errors.push(`title ${t.id}: unknown effect ${e.type}`);
    if (e.habit !== undefined && !habitIds.has(e.habit)) errors.push(`title ${t.id}: bad effect habit`);
    if (e.utility !== undefined && !utilityIds.has(e.utility)) errors.push(`title ${t.id}: bad effect utility`);
    if (e.type === 'xpMult' && e.scope === 'habit' && e.habit === undefined && e.habitFrom !== 'conditionVassal') {
      errors.push(`title ${t.id}: habit-scoped xpMult needs habit or habitFrom`);
    }
  }

  // Combos: unique ids, 2 or 8 distinct valid habits, positive power.
  const seenCombos = new Set<string>();
  const seenPairs = new Set<string>();
  for (const c of combos) {
    if (seenCombos.has(c.id)) errors.push(`combo ${c.id}: duplicate id`);
    seenCombos.add(c.id);
    if (!(c.habits.length === 2 || c.habits.length === HABIT_IDS.length)) {
      errors.push(`combo ${c.id}: needs 2 or ${HABIT_IDS.length} habits`);
    }
    for (const h of c.habits) if (!habitIds.has(h)) errors.push(`combo ${c.id}: unknown habit ${h}`);
    if (new Set(c.habits).size !== c.habits.length) errors.push(`combo ${c.id}: repeated habit`);
    const key = [...c.habits].sort().join('+');
    if (seenPairs.has(key)) errors.push(`combo ${c.id}: duplicate habit set`);
    seenPairs.add(key);
    if (!(c.power > 0)) errors.push(`combo ${c.id}: power must be positive`);
  }
  if (!ringById.has(comboRules.minRing as RingId)) errors.push('combo rules: bad minRing');

  return errors;
}
