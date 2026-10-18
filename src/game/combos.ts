/**
 * Combo items (GDD 12): forged when the day's completions cover every habit
 * of a combo, once per combo id per wave period, from ring 2. Items carry
 * their base power; the Workshop and the Smith title add to it at the wave.
 */
import { comboRules, combos as comboDefs, getCombo, type ComboDef } from './content';
import { clone, ok, pushLog } from './draft';
import { FULL_SET_MIN_HABITS, hasFacility } from './economy';
import { titleComboPower } from './titles';
import { activeVassals } from './vassals';
import type { ActionResult, ComboItem, GameEvent, HabitId, SaveFile } from './types';

/** Habits with at least one `done` quest on the current board. */
export function doneHabitsOnBoard(save: SaveFile): Set<HabitId> {
  const out = new Set<HabitId>();
  if (!save.board) return out;
  for (const q of save.board.quests) if (q.status === 'done') out.add(q.habit);
  return out;
}

/**
 * Habits a combo needs done on one board. Pairs need their two habits. The
 * legendary needs every habit that can appear on a board (enabled and
 * present), at least `FULL_SET_MIN_HABITS` of them; a board never holds all
 * eight, so the GDD's "all eight in one day" is unreachable (errata 12).
 * Returns null when the combo cannot forge for this save.
 */
export function comboRequiredHabits(save: SaveFile, def: ComboDef): HabitId[] | null {
  if (!def.legendary) return [...def.habits];
  const active = activeVassals(save).map((v) => v.habit).filter((h) => def.habits.includes(h));
  return active.length >= FULL_SET_MIN_HABITS ? active : null;
}

/** Flat power bonus applied to every item at the wave (Workshop + Smith). */
export function comboPowerBonus(save: SaveFile): number {
  return (hasFacility(save.player.ring, 'workshop') ? 1 : 0) + titleComboPower(save);
}

/** Forge every combo whose habits are all done today and that is not yet forged this period. */
export function forgeCombosDraft(draft: SaveFile, day: number, now: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (draft.player.ring < comboRules.minRing) return events;
  const done = doneHabitsOnBoard(draft);
  for (const def of comboDefs) {
    const required = comboRequiredHabits(draft, def);
    if (!required || !required.every((h) => done.has(h))) continue;
    if (comboRules.oncePerWeekEach && draft.combos.some((c) => c.comboId === def.id)) continue;
    const item: ComboItem = { comboId: def.id, power: def.power, forgedDay: day };
    draft.combos.push(item);
    draft.stats.combosForged += 1;
    events.push({ type: 'comboForged', comboId: def.id, power: def.power + comboPowerBonus(draft) });
    pushLog(draft, now, day, 'comboForged', `Forged: ${def.name} (+${def.power}). ${def.flavor}`);
  }
  return events;
}

/** After an undo: remove items forged today whose habit set no longer holds. */
export function unforgeBrokenCombosDraft(draft: SaveFile, day: number): GameEvent[] {
  const events: GameEvent[] = [];
  const done = doneHabitsOnBoard(draft);
  const keep: ComboItem[] = [];
  for (const item of draft.combos) {
    const def = getCombo(item.comboId);
    const required = def ? comboRequiredHabits(draft, def) : null;
    const holds = item.forgedDay !== day || (required !== null && required.every((h) => done.has(h)));
    if (holds) keep.push(item);
    else {
      draft.stats.combosForged = Math.max(0, draft.stats.combosForged - 1);
      events.push({ type: 'comboUnforged', comboId: item.comboId });
    }
  }
  draft.combos = keep;
  return events;
}

/** Items counted in the wave: highest power first, at most `maxCountedPerWave`. */
export function countedCombos(save: SaveFile): Array<{ item: ComboItem; name: string; power: number }> {
  const bonus = comboPowerBonus(save);
  return [...save.combos]
    .map((item) => ({ item, name: getCombo(item.comboId)?.name ?? item.comboId, power: item.power + bonus }))
    .sort((a, b) => b.power - a.power)
    .slice(0, comboRules.maxCountedPerWave);
}

/** Total combo contribution to defense (capped by the counted-item rule). */
export function comboDefense(save: SaveFile): number {
  return countedCombos(save).reduce((sum, c) => sum + c.power, 0);
}

/** Public immutable forge pass (quest completion calls the draft form). */
export function forgeCombos(save: SaveFile, day: number, now: number): ActionResult {
  const draft = clone(save);
  const events = forgeCombosDraft(draft, day, now);
  return ok(draft, events);
}
