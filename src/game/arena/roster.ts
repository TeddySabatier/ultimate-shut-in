/**
 * Arena roster: vassals as party members (`docs/design/ARENA.md`).
 *
 * Citizens will extend this list later; the Arena never imports citizen code.
 */
import { getHabit } from '../content';
import { activeVassals, vassalName } from '../vassals';
import type { HabitId, SaveFile } from '../types';

export interface RosterMember {
  id: string;
  habit: HabitId;
  name: string;
  level: number;
  loyalty: number;
}

/** Every enabled, present vassal in habit order. */
export function rosterFor(save: SaveFile): RosterMember[] {
  return activeVassals(save).map((v) => ({
    id: v.habit,
    habit: v.habit,
    name: vassalName(v.habit),
    level: v.level,
    loyalty: v.loyalty,
  }));
}

/** Display epithet from habits.json (for UI later). */
export function rosterEpithet(habit: HabitId): string {
  return getHabit(habit).vassal.epithet;
}
