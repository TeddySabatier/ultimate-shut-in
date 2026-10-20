/**
 * The troops the player can bring (docs/design/ARENA.md 4.1).
 *
 * "Troops" are the vassals now and citizens later. `rosterFor` is the one
 * place that knows where troops come from.
 *
 * Extension point for citizens (brief F): write `citizenMembers(save): PartyMember[]`
 * next to the citizen code, import it here and add it to `ROSTER_SOURCES`.
 * Nothing else changes: `buildParty`, the host and the games already accept
 * members with `habit: null`. The Arena never imports citizen code itself.
 */
import { makeMember, type PartyMember } from '../../games/contract';
import { getHabit, getTitle, habitForUtility } from '../content';
import { activeVassals, vassalName } from '../vassals';
import type { HabitId, SaveFile, UtilityId } from '../types';
import { HABIT_IDS } from '../types';

/** Earned titles that belong to one vassal's habit (a habit title, a utility title of its habit). */
export function titleTraitsOf(save: SaveFile, habit: HabitId): string[] {
  const out: string[] = [];
  for (const earned of save.titles) {
    const def = getTitle(earned.titleId);
    if (!def) continue;
    const c = def.condition as { habit?: HabitId; utility?: UtilityId };
    const e = def.effect as { habit?: HabitId; utility?: UtilityId };
    const related =
      earned.habit === habit ||
      c.habit === habit ||
      e.habit === habit ||
      (c.utility !== undefined && habitForUtility(c.utility) === habit) ||
      (e.utility !== undefined && habitForUtility(e.utility) === habit);
    if (related) out.push(earned.titleId);
  }
  return out;
}

/** The vassals as troops: enabled, present, with their own level, loyalty and earned titles. No gear. */
export function vassalMembers(save: SaveFile): PartyMember[] {
  const present = new Set<HabitId>(activeVassals(save).map((v) => v.habit));
  return HABIT_IDS.filter((h) => present.has(h)).map((h) => {
    const v = save.vassals[h];
    return makeMember({ id: h, name: vassalName(h), habit: h, level: v.level, loyalty: Math.round(v.loyalty), traits: titleTraitsOf(save, h) });
  });
}

/** Where troops come from. Citizens (brief F) add their source here. */
export const ROSTER_SOURCES: ReadonlyArray<(save: SaveFile) => PartyMember[]> = [vassalMembers];

/** Every troop the player could bring, in habit order, before gear and training. */
export function rosterFor(save: SaveFile): PartyMember[] {
  return ROSTER_SOURCES.flatMap((source) => source(save));
}

/** Habit label of a troop for lists ("Move"), or its name for members that are not vassals. */
export function troopLabel(member: Pick<PartyMember, 'habit' | 'name'>): string {
  return member.habit ? getHabit(member.habit).label : member.name;
}
