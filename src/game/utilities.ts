/**
 * Utilities (GDD 10): Power <- Sleep, Water <- Hygiene, Gas <- Eat.
 * Restore on completion, decay at day boundaries, and the Well-kept check.
 */
import { habitForUtility, utilityForHabit } from './content';
import { clamp, clone, ok } from './draft';
import {
  UTILITY_MAX,
  WELL_KEPT_BONUS,
  WELL_KEPT_BONUS_COURTYARD,
  WELL_KEPT_THRESHOLD,
  hasFacility,
  isHabitEnabled,
  utilityDecayAmount,
  utilityRestoreAmount,
} from './economy';
import { titleUtilityDecayMult } from './titles';
import type { ActionResult, GameEvent, HabitId, SaveFile, Tier, UtilityId } from './types';
import { UTILITY_IDS } from './types';

export type UtilityState = 'bright' | 'flickering' | 'dim' | 'out';

export const TIED_HABIT: Record<UtilityId, HabitId> = {
  power: habitForUtility('power'),
  water: habitForUtility('water'),
  gas: habitForUtility('gas'),
};

export function tiedUtility(habit: HabitId): UtilityId | null {
  return utilityForHabit(habit);
}

export function utilityState(value: number): UtilityState {
  if (value >= 70) return 'bright';
  if (value >= 40) return 'flickering';
  if (value >= 1) return 'dim';
  return 'out';
}

/**
 * Restore the utility tied to `habit` by the tier's amount. Returns the
 * points actually applied (for the undo snapshot) and the events raised.
 */
export function restoreUtilityDraft(draft: SaveFile, habit: HabitId, tier: Tier): { applied: number; events: GameEvent[] } {
  const utility = tiedUtility(habit);
  if (!utility) return { applied: 0, events: [] };
  const u = draft.utilities[utility];
  const before = u.value;
  const after = clamp(before + utilityRestoreAmount(tier), 0, UTILITY_MAX);
  u.value = after;
  const events: GameEvent[] = [];
  if (before < UTILITY_MAX && after === UTILITY_MAX) events.push({ type: 'utilityRestored', utility });
  return { applied: after - before, events };
}

/** Revert a restore of `applied` points (undo). */
export function revertUtilityDraft(draft: SaveFile, habit: HabitId, applied: number): void {
  const utility = tiedUtility(habit);
  if (!utility || applied === 0) return;
  const u = draft.utilities[utility];
  u.value = clamp(u.value - applied, 0, UTILITY_MAX);
}

export interface DecayOutcome<Id> {
  events: GameEvent[];
  /** Entities that actually lost points at this boundary (for the catch-up caps). */
  decayed: Id[];
}

/**
 * Boundary decay for the day that just ended. `doneHabits` are the habits
 * with at least one `done` quest on that day; utilities in `skip` have spent
 * their catch-up cap and keep their value. Disabled habits freeze their
 * utility. `fullStreakDays` is bumped for utilities that end the boundary at
 * 100 and reset otherwise.
 */
export function decayUtilitiesDraft(
  draft: SaveFile,
  doneHabits: ReadonlySet<HabitId>,
  skip: ReadonlySet<UtilityId> = new Set(),
): DecayOutcome<UtilityId> {
  const events: GameEvent[] = [];
  const decayed: UtilityId[] = [];
  for (const id of UTILITY_IDS) {
    const habit = TIED_HABIT[id];
    const u = draft.utilities[id];
    if (!isHabitEnabled(draft, habit)) continue; // frozen
    if (!skip.has(id) && !doneHabits.has(habit)) {
      decayed.push(id);
      const before = u.value;
      const amount = utilityDecayAmount(draft.settings.difficulty, draft.player.ring, titleUtilityDecayMult(draft, id));
      u.value = clamp(before - amount, 0, UTILITY_MAX);
      const stateBefore = utilityState(before);
      const stateAfter = utilityState(u.value);
      if (stateAfter !== stateBefore) {
        if (stateAfter === 'flickering') events.push({ type: 'utilityDegraded', utility: id, state: 'flickering' });
        else if (stateAfter === 'dim' || stateAfter === 'out') {
          // "Out never fires a line on its own beyond the Dim line": crossing
          // straight from bright/flickering to out still reads as the dim nudge.
          if (stateBefore !== 'dim') events.push({ type: 'utilityDegraded', utility: id, state: 'dim' });
        }
      }
    }
    u.fullStreakDays = u.value === UTILITY_MAX ? u.fullStreakDays + 1 : 0;
  }
  return { events, decayed };
}

/** True when all three utilities are at or above the Well-kept threshold. */
export function isWellKept(save: SaveFile): boolean {
  return UTILITY_IDS.every((id) => save.utilities[id].value >= WELL_KEPT_THRESHOLD);
}

/** Well-kept defense bonus for the wave (0 when not well kept). */
export function wellKeptBonus(save: SaveFile): number {
  if (!isWellKept(save)) return 0;
  return hasFacility(save.player.ring, 'courtyard') ? WELL_KEPT_BONUS_COURTYARD : WELL_KEPT_BONUS;
}

/** Public immutable restore (used by tests and tools; quest completion uses the draft form). */
export function restoreUtility(save: SaveFile, habit: HabitId, tier: Tier): ActionResult {
  const draft = clone(save);
  const { events } = restoreUtilityDraft(draft, habit, tier);
  return ok(draft, events);
}

/** Public immutable decay for one boundary. */
export function decayUtilities(save: SaveFile, doneHabits: Iterable<HabitId>): ActionResult {
  const draft = clone(save);
  const { events } = decayUtilitiesDraft(draft, new Set(doneHabits));
  return ok(draft, events);
}
