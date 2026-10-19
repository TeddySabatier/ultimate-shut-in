import { getHabit, type HabitId } from '../../game';

/** "Move and Hygiene" (or "Move or Hygiene") for a list of habit ids. */
export function habitsText(habits: readonly string[], joiner = ' and '): string {
  return habits.map((h) => getHabit(h as HabitId).label).join(joiner);
}
