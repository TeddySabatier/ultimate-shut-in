/**
 * The Armory: gear, training and Haven decor (docs/design/ARENA.md 4).
 *
 * The permanent sink for settlement coins. Every mutator follows the engine
 * contract `(save, now, ...) => { save, events, error? }`; a refusal returns
 * the input save, no events and a short code whose warm copy lives in
 * `strings.json` under `arena.errors`.
 */
import { arenaContent, getArenaItem, getCombo, type ArenaGearItem } from '../content';
import { clone, ok, refuse } from '../draft';
import { decorPrice, gearPrice, trainingPower, trainingPrice, trainingWeeklyCap } from './economics';
import { derivePower } from '../../games/contract';
import { ownedRareItems } from './state';
import type { ActionResult, GameEvent, GearSlot, HabitId, SaveFile } from '../types';
import { GEAR_SLOTS, HABIT_IDS } from '../types';

/* ------------------------------ Selectors ------------------------------ */

/** The sold items of a slot, tier 1 to 3. */
export function soldItems(slot?: GearSlot): ArenaGearItem[] {
  return arenaContent.armory.items.filter((i) => i.rare !== true && (slot === undefined || i.slot === slot));
}

export function rareItems(): ArenaGearItem[] {
  return arenaContent.armory.items.filter((i) => i.rare === true);
}

/** Items worn by a vassal, in slot order (empty slots skipped). */
export function wornItems(save: Pick<SaveFile, 'arena'>, habit: HabitId): ArenaGearItem[] {
  const out: ArenaGearItem[] = [];
  for (const slot of GEAR_SLOTS) {
    const id = save.arena.gear[habit][slot];
    const item = id === null ? undefined : getArenaItem(id);
    if (item) out.push(item);
  }
  return out;
}

/** Power the gear of a vassal adds. */
export function gearPower(save: Pick<SaveFile, 'arena'>, habit: HabitId): number {
  return wornItems(save, habit).reduce((sum, i) => sum + i.power, 0);
}

/** Power the training of a vassal adds. */
export function trainingBonus(save: Pick<SaveFile, 'arena'>, habit: HabitId): number {
  return trainingPower(save.arena.training[habit]);
}

/** Traits the Armory adds to a troop: `gear:<slot>:<tier>` per worn item, `training:<bumps>` once trained. */
export function armoryTraits(save: Pick<SaveFile, 'arena'>, habit: HabitId): string[] {
  const out = wornItems(save, habit).map((i) => `gear:${i.slot}:${i.tier}`);
  const bumps = save.arena.training[habit];
  if (bumps > 0) out.push(`training:${bumps}`);
  return out;
}

/** The training week as it stands now: a counter from an older period reads as empty. */
export function trainingWeek(save: Pick<SaveFile, 'arena' | 'week'>): { period: number; spent: number; bumps: number } {
  const w = save.arena.trainingWeek;
  return w.period === save.week.index ? w : { period: save.week.index, spent: 0, bumps: 0 };
}

export interface TrainingStatus {
  bumps: number;
  maxBumps: number;
  price: number | null;
  /** Power the next bump adds (0 when maxed). */
  nextPower: number;
  weekSpent: number;
  weekCap: number;
  weekBumps: number;
  weekBumpsMax: number;
}

export function trainingStatus(save: SaveFile, habit: HabitId): TrainingStatus {
  const bumps = save.arena.training[habit];
  const max = arenaContent.training.bumpPower.length;
  const week = trainingWeek(save);
  return {
    bumps,
    maxBumps: max,
    price: bumps >= max ? null : trainingPrice(bumps, save.player.ring),
    nextPower: arenaContent.training.bumpPower[bumps] ?? 0,
    weekSpent: week.spent,
    weekCap: trainingWeeklyCap(save.settings.difficulty),
    weekBumps: week.bumps,
    weekBumpsMax: arenaContent.training.maxBumpsPerWeek,
  };
}

/** True when a troop already reaches the contract's top power (100) without what is being bought: more gear or training would change nothing. */
export function powerFull(save: SaveFile, habit: HabitId, replacedPower = 0): boolean {
  const v = save.vassals[habit];
  return derivePower(v.level, Math.round(v.loyalty)) + gearPower(save, habit) - replacedPower + trainingBonus(save, habit) >= 100;
}

/** Why a sold item cannot be bought for a vassal right now, or null when it can. */
export function gearRefusal(save: SaveFile, habit: HabitId, itemId: string): string | null {
  const item = getArenaItem(itemId);
  if (!item) return 'unknown item';
  if (item.rare === true) return 'rare item';
  if (!HABIT_IDS.includes(habit)) return 'unknown troop';
  if (save.player.ring < item.minRing) return 'ring too low';
  const worn = save.arena.gear[habit][item.slot];
  const wornItem = worn === null ? undefined : getArenaItem(worn);
  if (wornItem && wornItem.tier >= item.tier) return 'not an upgrade';
  if (powerFull(save, habit, wornItem?.power ?? 0)) return 'power full';
  if (save.player.coins < gearPrice(item, save.player.ring)) return 'not enough coins';
  return null;
}

/* ------------------------------ Mutators ------------------------------ */

/** Buy a sold item for one vassal's slot. It replaces a lower tier; a vassal never wears a lower tier than it has. */
export function buyGear(save: SaveFile, _now: number, habit: HabitId, itemId: string): ActionResult {
  const why = gearRefusal(save, habit, itemId);
  if (why !== null) return refuse(save, why);
  const item = getArenaItem(itemId) as ArenaGearItem;
  const price = gearPrice(item, save.player.ring);
  const draft = clone(save);
  draft.player.coins -= price;
  draft.arena.gear[habit][item.slot] = item.id;
  const events: GameEvent[] = [{ type: 'arenaGearBought', habit, slot: item.slot, itemId: item.id, price }];
  return ok(draft, events);
}

/**
 * Wear a rare item from the stash. The slot's previous rare item goes back to
 * the stash; a sold item in that slot is given up.
 */
export function equipRare(save: SaveFile, _now: number, habit: HabitId, itemId: string): ActionResult {
  const item = getArenaItem(itemId);
  if (!item || item.rare !== true) return refuse(save, 'unknown item');
  if (!HABIT_IDS.includes(habit)) return refuse(save, 'unknown troop');
  if (!save.arena.stash.includes(itemId)) return refuse(save, 'not in the stash');
  const draft = clone(save);
  const previous = draft.arena.gear[habit][item.slot];
  draft.arena.stash = draft.arena.stash.filter((id) => id !== itemId);
  if (previous !== null && getArenaItem(previous)?.rare === true) draft.arena.stash.push(previous);
  draft.arena.gear[habit][item.slot] = itemId;
  return ok(draft, [{ type: 'arenaGearEquipped', habit, slot: item.slot, itemId }]);
}

/** Why training cannot happen for a vassal right now, or null. */
export function trainingRefusal(save: SaveFile, habit: HabitId): string | null {
  if (!HABIT_IDS.includes(habit)) return 'unknown troop';
  const s = trainingStatus(save, habit);
  if (s.price === null) return 'training maxed';
  if (powerFull(save, habit)) return 'power full';
  if (s.weekBumps >= s.weekBumpsMax) return 'training week full';
  if (s.weekSpent + s.price > s.weekCap) return 'training week cap';
  if (save.player.coins < s.price) return 'not enough coins';
  return null;
}

/** Buy one training bump: a small permanent power gain with steep diminishing returns and a weekly cap. */
export function trainVassal(save: SaveFile, _now: number, habit: HabitId): ActionResult {
  const why = trainingRefusal(save, habit);
  if (why !== null) return refuse(save, why);
  const price = trainingStatus(save, habit).price as number;
  const draft = clone(save);
  const week = trainingWeek(draft);
  draft.player.coins -= price;
  draft.arena.training[habit] += 1;
  draft.arena.trainingWeek = { period: week.period, spent: week.spent + price, bumps: week.bumps + 1 };
  return ok(draft, [{ type: 'arenaTrained', habit, bumps: draft.arena.training[habit], price }]);
}

/** Buy Haven decor: a combo item's name given a place in the Haven. Cosmetic only. */
export function buyDecor(save: SaveFile, _now: number, comboId: string): ActionResult {
  const combo = getCombo(comboId);
  const price = decorPrice(comboId);
  if (!combo || price === null) return refuse(save, 'unknown decor');
  if (save.arena.decor.includes(comboId)) return refuse(save, 'already owned');
  if (save.player.coins < price) return refuse(save, 'not enough coins');
  const draft = clone(save);
  draft.player.coins -= price;
  draft.arena.decor.push(comboId);
  return ok(draft, [{ type: 'arenaDecorBought', decorId: comboId, price }]);
}

/** Rare items the player does not own yet. */
export function unownedRareItems(save: Pick<SaveFile, 'arena'>): ArenaGearItem[] {
  const owned = new Set(ownedRareItems(save.arena));
  return rareItems().filter((i) => !owned.has(i.id));
}
