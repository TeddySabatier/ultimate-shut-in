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
import outpostsJson from './outposts.json';
import arenaJson from './arena.json';
import type { ArenaBuffKind, GearSlot, HabitId, OutpostState, OutpostTypeId, QuestKind, RingId, Tier, UtilityId } from '../types';
import { ARENA_BUFF_KINDS, GEAR_SLOTS, HABIT_IDS, OUTPOST_STATES, OUTPOST_TYPE_IDS, UTILITY_IDS } from '../types';

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

/* ---- City Map content (docs/design/CITY-MAP.md 4.4) ---- */

export interface OutpostRules {
  baseCap: number;
  capPerRing: number;
  maxCap: number;
  perZone: number;
  minSpacing: number;
  quietAfterDays: number;
  quietIfNeverVisitedAfterDays: number;
  rerollDiscount: number;
  corridorCoinMult: number;
  strongholdDefense: number;
  strongholdDefenseCap: number;
  nameMax: number;
  noteMax: number;
  visitLogMax: number;
}

export interface OutpostStateDef {
  id: OutpostState;
  minVisits: number;
  label: string;
  perk: string;
}

export interface OutpostTypeDef {
  id: OutpostTypeId;
  label: string;
  /** Icon key: `src/assets/outposts/<icon>.svg`. */
  icon: string;
  /** Default related habits (empty only for `other`, which asks the player). */
  habits: HabitId[];
  placeholder: string;
  visitLines: string[];
}

/* ---- Arena content (docs/design/ARENA.md) ---- */

export interface ArenaGearItem {
  id: string;
  slot: GearSlot;
  /** 1 to 3 are sold in the Armory; 4 is a rare item won by banking a run. */
  tier: 1 | 2 | 3 | 4;
  minRing: RingId;
  /** Settlement at ring 1 (scaled by ring); 0 for rare items. */
  price: number;
  /** Power added to the troop's `power`. */
  power: number;
  rare?: boolean;
  name: string;
  flavor: string;
}

export interface ArenaBuffDef {
  id: string;
  kind: ArenaBuffKind;
  amount: number;
  weight: number;
  /** Rare buffs get heavier with the `luck` buff. */
  rare: boolean;
  name: string;
  blurb: string;
}

export interface ArenaContent {
  version: number;
  run: {
    feeByRing: number[];
    feeAdherence: number;
    maxRooms: number;
    roomsPerDifficultyStep: number;
    ringBoostFrom: number;
    suggestedRunsPerDay: number;
    reward: { base: number; perScore: number; growthPerRoom: number };
    carryHome: number;
  };
  bank: { defensePerWin: number; defenseCapPerPeriod: number; itemMinWins: number };
  lottery: { offers: number; luckBoostPer: number; caps: Record<ArenaBuffKind, number>; buffs: ArenaBuffDef[] };
  armory: { ringPriceStep: number; slots: GearSlot[]; items: ArenaGearItem[] };
  training: {
    bumpPower: number[];
    costBase: number;
    costStep: number;
    costSquare: number;
    ringPriceStep: number;
    maxBumpsPerWeek: number;
    weeklyShareOfHabitCoins: number;
    weeklyAdherence: number;
  };
  decor: { pricePerPower: number };
  requests: { textMax: number; perDay: number; keep: number };
  log: { keep: number; learnedKeep: number; noteMax: number };
}

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
export const outpostRules: OutpostRules = outpostsJson.rules;
export const outpostStates: readonly OutpostStateDef[] = outpostsJson.states as OutpostStateDef[];
export const outpostTypes: readonly OutpostTypeDef[] = outpostsJson.types as OutpostTypeDef[];
export const arenaContent: ArenaContent = arenaJson as ArenaContent;

const habitById = new Map(habits.map((h) => [h.id, h] as const));
const questById = new Map(quests.map((q) => [q.id, q] as const));
const ringById = new Map(rings.map((r) => [r.id, r] as const));
const titleById = new Map(titles.map((t) => [t.id, t] as const));
const comboById = new Map(combos.map((c) => [c.id, c] as const));
const outpostTypeById = new Map(outpostTypes.map((t) => [t.id, t] as const));
const outpostStateById = new Map(outpostStates.map((s) => [s.id, s] as const));
const arenaItemById = new Map(arenaContent.armory.items.map((i) => [i.id, i] as const));
const arenaBuffById = new Map(arenaContent.lottery.buffs.map((b) => [b.id, b] as const));

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

export function getOutpostType(id: OutpostTypeId): OutpostTypeDef {
  const t = outpostTypeById.get(id);
  if (!t) throw new Error(`Unknown outpost type ${id}`);
  return t;
}

export function getOutpostState(id: OutpostState): OutpostStateDef {
  const s = outpostStateById.get(id);
  if (!s) throw new Error(`Unknown outpost state ${id}`);
  return s;
}

export function getArenaItem(id: string): ArenaGearItem | undefined {
  return arenaItemById.get(id);
}

export function getArenaBuff(id: string): ArenaBuffDef | undefined {
  return arenaBuffById.get(id);
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

  // Proposals: a five-minute foot-in-the-door title for every habit, within the 40-character title limit.
  for (const h of HABIT_IDS) {
    const title = (strings.proposals.footInDoor.titles as Record<string, string | undefined>)[h];
    if (!title) errors.push(`strings.proposals.footInDoor.titles.${h}: missing`);
    else if (title.length > 40) errors.push(`strings.proposals.footInDoor.titles.${h}: longer than 40 characters`);
  }
  for (const rule of ['smaller', 'stepUp', 'makeRecurring', 'footInDoor', 'pinWeekday'] as const) {
    if (strings.proposals.reasons[rule].length === 0) errors.push(`strings.proposals.reasons.${rule}: empty pool`);
    if (!strings.proposals.titles[rule]) errors.push(`strings.proposals.titles.${rule}: missing`);
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

  // Outposts: the 11 types with valid habits (none only for `other`, else 1-2), an icon key each,
  // states ascending from 0 in the engine's order, and sane rules.
  const seenTypes = new Set<string>();
  for (const t of outpostTypes) {
    if (!(OUTPOST_TYPE_IDS as readonly string[]).includes(t.id)) errors.push(`outpost type ${t.id}: unknown id`);
    if (seenTypes.has(t.id)) errors.push(`outpost type ${t.id}: duplicate id`);
    seenTypes.add(t.id);
    if (typeof t.icon !== 'string' || t.icon === '') errors.push(`outpost type ${t.id}: missing icon`);
    for (const h of t.habits) if (!habitIds.has(h)) errors.push(`outpost type ${t.id}: unknown habit ${h}`);
    if (new Set(t.habits).size !== t.habits.length) errors.push(`outpost type ${t.id}: repeated habit`);
    if (t.id === 'other' ? t.habits.length !== 0 : t.habits.length < 1 || t.habits.length > 2) errors.push(`outpost type ${t.id}: needs 1-2 habits (none for other)`);
    if (!t.placeholder) errors.push(`outpost type ${t.id}: missing placeholder`);
    if (t.visitLines.length === 0) errors.push(`outpost type ${t.id}: empty visitLines`);
  }
  if (seenTypes.size !== OUTPOST_TYPE_IDS.length) errors.push(`expected ${OUTPOST_TYPE_IDS.length} outpost types, got ${seenTypes.size}`);
  if (outpostStates.length !== OUTPOST_STATES.length) errors.push(`expected ${OUTPOST_STATES.length} outpost states`);
  outpostStates.forEach((st, i) => {
    if (st.id !== OUTPOST_STATES[i]) errors.push(`outpost state at index ${i}: ${st.id} out of order`);
    const prev = outpostStates[i - 1];
    if (i === 0 && st.minVisits !== 0) errors.push('first outpost state must start at 0 visits');
    if (prev && !(st.minVisits > prev.minVisits)) errors.push(`outpost state ${st.id}: minVisits not ascending`);
  });
  const r = outpostRules;
  if (!(r.baseCap >= 1 && r.capPerRing >= 0 && r.maxCap >= r.baseCap + r.capPerRing)) errors.push('outpost rules: caps inconsistent');
  if (!(r.perZone >= 1 && r.minSpacing >= 1 && r.visitLogMax >= 1 && r.nameMax >= 1 && r.noteMax >= 0)) errors.push('outpost rules: bad limits');
  if (!(r.strongholdDefenseCap >= r.strongholdDefense && r.strongholdDefense > 0)) errors.push('outpost rules: defense cap below one stronghold');
  if (!(r.quietAfterDays > 0 && r.quietIfNeverVisitedAfterDays > 0)) errors.push('outpost rules: quiet days must be positive');
  for (const [code, line] of Object.entries(strings.map.errors)) if (!line) errors.push(`strings.map.errors.${code}: empty`);

  errors.push(...validateArenaContent());

  return errors;
}

/** Arena content problems (docs/design/ARENA.md 6): ids, slots, tiers, weights, caps and ascending curves. */
export function validateArenaContent(): string[] {
  const errors: string[] = [];
  const a = arenaContent;
  if (a.run.feeByRing.length !== 7) errors.push('arena run.feeByRing: needs 7 entries, one per ring');
  a.run.feeByRing.forEach((fee, i) => {
    if (!(Number.isInteger(fee) && fee > 0)) errors.push(`arena run.feeByRing[${i}]: must be a positive integer`);
    const prev = a.run.feeByRing[i - 1];
    if (prev !== undefined && fee < prev) errors.push(`arena run.feeByRing[${i}]: fees must not drop with the ring`);
  });
  if (!(a.run.maxRooms >= 3 && a.run.roomsPerDifficultyStep >= 1)) errors.push('arena run: maxRooms or roomsPerDifficultyStep out of range');
  if (!(a.run.reward.base >= 0 && a.run.reward.perScore >= 0 && a.run.reward.growthPerRoom >= 0)) errors.push('arena run.reward: negative term');
  if (!(a.run.carryHome >= 0 && a.run.carryHome < 1)) errors.push('arena run.carryHome: must be in [0, 1)');
  if (!(a.run.feeAdherence > 0 && a.run.feeAdherence <= 1)) errors.push('arena run.feeAdherence: must be in (0, 1]');
  if (!(a.bank.defensePerWin >= 0 && a.bank.defenseCapPerPeriod >= a.bank.defensePerWin && a.bank.itemMinWins >= 1)) errors.push('arena bank: inconsistent limits');

  const seenBuffs = new Set<string>();
  for (const b of a.lottery.buffs) {
    if (seenBuffs.has(b.id)) errors.push(`arena buff ${b.id}: duplicate id`);
    seenBuffs.add(b.id);
    if (!(ARENA_BUFF_KINDS as readonly string[]).includes(b.kind)) errors.push(`arena buff ${b.id}: unknown kind ${b.kind}`);
    if (!(Number.isInteger(b.amount) && b.amount > 0)) errors.push(`arena buff ${b.id}: amount must be a positive integer`);
    if (!(b.weight > 0)) errors.push(`arena buff ${b.id}: weight must be positive`);
    if (b.amount > a.lottery.caps[b.kind]) errors.push(`arena buff ${b.id}: amount above the cap for ${b.kind}`);
    if (!b.name || !b.blurb) errors.push(`arena buff ${b.id}: needs a name and a blurb`);
  }
  for (const kind of ARENA_BUFF_KINDS) {
    if (!a.lottery.buffs.some((b) => b.kind === kind)) errors.push(`arena lottery: no buff of kind ${kind}`);
    if (!(a.lottery.caps[kind] > 0)) errors.push(`arena lottery.caps.${kind}: must be positive`);
  }
  if (a.lottery.buffs.length < a.lottery.offers) errors.push('arena lottery: fewer buffs than offers');

  if (a.armory.slots.join() !== GEAR_SLOTS.join()) errors.push('arena armory.slots: must be weapon, armor, charm');
  const seenItems = new Set<string>();
  for (const it of a.armory.items) {
    if (seenItems.has(it.id)) errors.push(`arena item ${it.id}: duplicate id`);
    seenItems.add(it.id);
    if (!(GEAR_SLOTS as readonly string[]).includes(it.slot)) errors.push(`arena item ${it.id}: unknown slot ${it.slot}`);
    if (!ringById.has(it.minRing)) errors.push(`arena item ${it.id}: bad minRing`);
    if (!(it.power >= 1 && Number.isInteger(it.power))) errors.push(`arena item ${it.id}: power must be a positive integer`);
    const shapeOk = it.rare === true ? it.price === 0 && it.tier === 4 : it.price > 0 && it.tier >= 1 && it.tier <= 3;
    if (!shapeOk) errors.push(`arena item ${it.id}: rare items are tier 4 and free, the rest tier 1-3 with a price`);
    if (!it.name || !it.flavor) errors.push(`arena item ${it.id}: needs a name and flavor`);
  }
  for (const slot of GEAR_SLOTS) {
    const sold = a.armory.items.filter((i) => i.slot === slot && i.rare !== true).sort((x, y) => x.tier - y.tier);
    if (sold.map((i) => i.tier).join() !== '1,2,3') errors.push(`arena armory: slot ${slot} needs tiers 1, 2 and 3`);
    sold.forEach((i, idx) => {
      const prev = sold[idx - 1];
      if (prev && !(i.price > prev.price && i.power > prev.power)) errors.push(`arena item ${i.id}: price and power must rise with the tier`);
    });
    if (a.armory.items.filter((i) => i.slot === slot && i.rare === true).length < 2) errors.push(`arena armory: slot ${slot} needs at least two rare items`);
  }

  const t = a.training;
  const flat = t.bumpPower.length < 3 || t.bumpPower.some((n, i) => !(Number.isInteger(n) && n >= 1) || (i > 0 && n > (t.bumpPower[i - 1] ?? 0)));
  if (flat) errors.push('arena training.bumpPower: positive integers that never rise (diminishing returns)');
  if (!(t.costBase > 0 && t.costStep >= 0 && t.costSquare >= 0 && t.maxBumpsPerWeek >= 1)) errors.push('arena training: bad cost terms');
  if (!(t.weeklyShareOfHabitCoins > 0 && t.weeklyShareOfHabitCoins <= 0.25)) errors.push('arena training.weeklyShareOfHabitCoins: must be in (0, 0.25]');
  if (!(t.weeklyAdherence > 0 && t.weeklyAdherence <= 1)) errors.push('arena training.weeklyAdherence: must be in (0, 1]');
  if (!(a.decor.pricePerPower > 0)) errors.push('arena decor.pricePerPower: must be positive');
  if (!(a.requests.textMax >= 40 && a.requests.perDay >= 1 && a.requests.keep >= a.requests.perDay)) errors.push('arena requests: bad limits');
  if (!(a.log.keep >= 5 && a.log.learnedKeep >= 1 && a.log.noteMax >= 40)) errors.push('arena log: bad limits');
  return errors;
}
