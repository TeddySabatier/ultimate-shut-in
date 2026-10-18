/** Shared fixtures for the game-core tests (not a test file). */
import { createNewSave, type NewSaveOptions } from './save';
import { processBoundaries } from './tick';
import { DAY_MS, HOUR_MS, fixedTz, type TimeOptions } from './time';
import type { BoardQuest, SaveFile } from './types';
import { getQuest } from './content';
import { chooseBonus, makeBoardQuest } from './board';

/** Monday 2026-01-05 at 12:00 UTC; tests run in UTC via `TZ`. */
export const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
export const TZ: TimeOptions = { tz: fixedTz(0) };

/** Instant on relative day `day` at `hour` (UTC), relative to T0's midnight. */
export function at(day: number, hour = 12, minute = 0): number {
  return Date.UTC(2026, 0, 5, 0, 0, 0) + day * DAY_MS + hour * HOUR_MS + minute * 60_000;
}

export function fresh(opts?: NewSaveOptions, now = T0, name = 'Tester'): SaveFile {
  return createNewSave(now, name, { ...TZ, ...(opts ?? {}) });
}

/** A fresh save with today's board already issued. */
export function freshWithBoard(opts?: NewSaveOptions, now = T0): SaveFile {
  return processBoundaries(fresh(opts, now), now, TZ).save;
}

export function openQuests(save: SaveFile): BoardQuest[] {
  return save.board?.quests.filter((q) => q.status === 'open') ?? [];
}

export function questOfKind(save: SaveFile, kind: BoardQuest['kind']): BoardQuest | undefined {
  return save.board?.quests.find((q) => q.kind === kind && q.status === 'open');
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/** Replace the board with one holding exactly these templates (bonus = highest tier). */
export function setBoard(save: SaveFile, day: number, templateIds: string[]): SaveFile {
  const quests = templateIds.map((id) => {
    const t = getQuest(id);
    if (!t) throw new Error(`unknown template ${id}`);
    return makeBoardQuest(day, t);
  });
  return { ...save, board: { day, seed: 1, quests, bonusId: chooseBonus(quests), rerolledToday: false } };
}
