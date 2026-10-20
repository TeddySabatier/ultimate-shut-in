/**
 * Armory: gear, training and Haven decor (permanent coin sinks).
 */
import { getCombo } from '../content';
import { clone, ok, refuse } from '../draft';
import type { TimeOptions } from '../time';
import {
  arenaContent,
  decorPrice,
  gearPrice,
  gearSlotIndex,
  getGearItem,
  trainingCost,
  trainingPowerGain,
} from './content';
import { maxTrainingSpendPerPeriod } from './economy';
import type { ActionResult, HabitId, SaveFile } from '../types';
import { HABIT_IDS } from '../types';

function syncTrainingPeriod(draft: SaveFile): void {
  const idx = draft.week.index;
  if (draft.arena.trainingPeriodIndex !== idx) {
    draft.arena.trainingPeriodIndex = idx;
    draft.arena.trainingCoinsThisPeriod = 0;
  }
}

export function buyGear(save: SaveFile, habit: HabitId, itemId: string, _now: number, _opts?: TimeOptions): ActionResult {
  if (!HABIT_IDS.includes(habit)) return refuse(save, 'arena.badHabit');
  const item = getGearItem(itemId);
  if (!item) return refuse(save, 'arena.badGear');
  const slot = gearSlotIndex(item.slot);
  if (slot < 0) return refuse(save, 'arena.badGear');
  const price = gearPrice(item, save.player.ring);
  if (save.player.coins < price) return refuse(save, 'arena.shortCoins');
  const draft = clone(save);
  draft.player.coins -= price;
  draft.arena.gear[habit][slot] = itemId;
  return ok(draft, [{ type: 'arenaGearBought', habit, itemId, slot }]);
}

export function buyTraining(save: SaveFile, habit: HabitId, _now: number, _opts?: TimeOptions): ActionResult {
  if (!HABIT_IDS.includes(habit)) return refuse(save, 'arena.badHabit');
  const sessions = save.arena.trainingSessions[habit] ?? 0;
  if (sessions >= arenaContent.training.maxSessions) return refuse(save, 'arena.trainingMax');
  if (trainingPowerGain(sessions) <= 0) return refuse(save, 'arena.trainingDiminished');
  const price = trainingCost(save.player.ring);
  if (save.player.coins < price) return refuse(save, 'arena.shortCoins');
  const draft = clone(save);
  syncTrainingPeriod(draft);
  const cap = maxTrainingSpendPerPeriod(draft.settings.difficulty);
  if (draft.arena.trainingCoinsThisPeriod + price > cap) return refuse(save, 'arena.trainingCap');
  draft.player.coins -= price;
  draft.arena.trainingCoinsThisPeriod += price;
  draft.arena.trainingSessions[habit] = sessions + 1;
  return ok(draft, [{ type: 'arenaTrainingBought', habit, sessions: sessions + 1 }]);
}

export function buyDecor(save: SaveFile, comboId: string, _now: number, _opts?: TimeOptions): ActionResult {
  const combo = getCombo(comboId);
  if (!combo) return refuse(save, 'arena.badDecor');
  if (save.arena.decor.includes(comboId)) return refuse(save, 'arena.decorOwned');
  const price = decorPrice(comboId, save.player.ring);
  if (price === null) return refuse(save, 'arena.badDecor');
  if (save.player.coins < price) return refuse(save, 'arena.shortCoins');
  const draft = clone(save);
  draft.player.coins -= price;
  draft.arena.decor.push(comboId);
  return ok(draft, [{ type: 'arenaDecorBought', comboId }]);
}

/** Reset training spend counter when a wave period ends (called from run bank / tick if needed). */
export function resetTrainingPeriodIfNeeded(draft: SaveFile): void {
  syncTrainingPeriod(draft);
}
