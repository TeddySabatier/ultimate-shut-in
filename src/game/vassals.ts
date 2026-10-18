/**
 * Vassals (GDD 5, 8.4, 8.5): loyalty gain and decay with the grace day,
 * trust, Strict-mode leaving and re-recruiting, Benevolent waiting.
 */
import { getHabit, pickLine, formatLine, strings } from './content';
import { clamp, clone, ok, pushLog } from './draft';
import { LOYALTY_MAX, TRUST_MAX, isHabitEnabled, loyaltyDecay } from './economy';
import { fnv1a } from './rng';
import type { ActionResult, GameEvent, HabitId, SaveFile, Vassal } from './types';
import { HABIT_IDS } from './types';

export function vassalName(habit: HabitId): string {
  return getHabit(habit).vassal.name;
}

/** Vassals that are enabled and present (not away). */
export function activeVassals(save: SaveFile): Vassal[] {
  return HABIT_IDS.filter((h) => isHabitEnabled(save, h) && !save.vassals[h].away).map((h) => save.vassals[h]);
}

/** Add loyalty, clamped at 100; returns the amount actually applied. */
export function gainLoyaltyDraft(vassal: Vassal, amount: number): number {
  const before = vassal.loyalty;
  vassal.loyalty = clamp(before + amount, 0, LOYALTY_MAX);
  return vassal.loyalty - before;
}

/** Revert a loyalty gain (undo); floors at 0. */
export function revertLoyaltyDraft(vassal: Vassal, applied: number): void {
  vassal.loyalty = clamp(vassal.loyalty - applied, 0, LOYALTY_MAX);
}

/**
 * Mark the vassal active on `day` (a `done` or `tried` quest). Trust counts
 * distinct days in the period, so it only rises the first time per day.
 */
export function markActiveDraft(vassal: Vassal, day: number): void {
  if (vassal.lastActiveDay === null || vassal.lastActiveDay < day) {
    vassal.trust = Math.min(TRUST_MAX, vassal.trust + 1);
    vassal.lastActiveDay = day;
  }
}

/**
 * Loyalty decay for the boundary ending `dayEnded`. A vassal decays when it
 * was inactive on that day and on the day before it (one free day, GDD 8.4:
 * `lastActiveDay < dayEnded - 1`); a never-active vassal counts as active on
 * the day before first play, so from 50 a fully ignored vassal leaves after
 * 26 / 18 / 11 days as the GDD states. Disabled and away vassals are untouched.
 */
export function decayLoyaltyDraft(
  draft: SaveFile,
  dayEnded: number,
  now: number,
  skip: ReadonlySet<HabitId> = new Set(),
): { events: GameEvent[]; decayed: HabitId[] } {
  const events: GameEvent[] = [];
  const decayed: HabitId[] = [];
  const amount = loyaltyDecay(draft.settings.difficulty);
  const strict = draft.settings.benevolence === 'strict';
  for (const h of HABIT_IDS) {
    const v = draft.vassals[h];
    if (!isHabitEnabled(draft, h) || v.away || skip.has(h)) continue;
    const last = v.lastActiveDay ?? draft.firstPlayDay - 1;
    if (last >= dayEnded - 1) continue;
    decayed.push(h);
    const floor = strict ? 0 : 1;
    v.loyalty = Math.max(floor, v.loyalty - amount);
    if (strict && v.loyalty === 0) {
      v.away = true;
      v.trust = 0;
      events.push({ type: 'vassalLeft', habit: h });
      const line = formatLine(pickLine(strings.vassalLeaving, fnv1a(`${h}:${dayEnded}`)), {
        name: vassalName(h),
        habit: getHabit(h).label,
      });
      pushLog(draft, now, dayEnded + 1, 'vassalLeft', line);
    }
  }
  return { events, decayed };
}

/**
 * Reset trust for all vassals (wave settlement), disabled ones included:
 * trust is period state, not vassal history, so a habit re-enabled later
 * starts the period at zero like everyone else (errata 11).
 */
export function resetTrustDraft(draft: SaveFile): void {
  for (const h of HABIT_IDS) draft.vassals[h].trust = 0;
}

/* `reRecruitVassal`, `setBenevolence` and the shared return routine live in
 * `recruit.ts`: they re-issue an empty board, which needs `board.ts`, and
 * `board.ts` already depends on this module. */

/** Benevolent-mode idle line for a vassal with low loyalty (UI helper). */
export function waitingLine(habit: HabitId, day: number): string {
  return formatLine(pickLine(strings.vassalWaiting, fnv1a(`${habit}:${day}:wait`)), { name: vassalName(habit) });
}

/** Public immutable decay for one boundary (used by tests). */
export function decayLoyalty(save: SaveFile, dayEnded: number, now: number): ActionResult {
  const draft = clone(save);
  const { events } = decayLoyaltyDraft(draft, dayEnded, now);
  return ok(draft, events);
}
