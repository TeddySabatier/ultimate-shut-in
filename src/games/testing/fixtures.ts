/**
 * Shared parties and runs for engine tests, contract tests, the Games Lab and
 * screenshots. Built from the eight vassals of `src/game/content/habits.json`.
 * Everything here is deep-frozen: a game that mutates its input fails loudly.
 */
import { HABIT_IDS, type HabitId } from '../../game/types';
import { vassalName } from '../../game/vassals';
import { emptyRun, makeMember, type Party, type PartyMember, type RunContext } from '../contract';
import { deepFreeze } from './play';

/** Earned titles the full party carries (ids from titles.json), by habit. */
const FULL_TRAITS: Partial<Record<HabitId, string[]>> = {
  move: ['first_vassal', 'pathfinder'],
  outside: ['dawn_walker'],
  clean: ['steward_apprentice', 'scrubbed_spotless'],
  social: ['herald'],
  study: ['stairwell_scholar'],
  sleep: ['night_warden'],
};

function vassal(habit: HabitId, level: number, loyalty: number, traits: string[] = []): PartyMember {
  return makeMember({ id: habit, name: vassalName(habit), habit, level, loyalty, traits });
}

/** The parties every game is tested with. */
export const parties: { readonly full: Party; readonly starter: Party; readonly single: Party } = deepFreeze({
  /** All eight vassals, level 12, loyalty 80 (power 44), some titles. */
  full: { members: HABIT_IDS.map((h) => vassal(h, 12, 80, FULL_TRAITS[h] ?? [])) },
  /** A new player's first three vassals, level 1, loyalty 50 (power 8). */
  starter: { members: (['move', 'outside', 'clean'] as const).map((h) => vassal(h, 1, 50)) },
  /** One vassal, level 5, loyalty 60 (power 21). */
  single: { members: [vassal('study', 5, 60, ['stairwell_scholar'])] },
});

/** The runs every game is tested with. */
export const runs: { readonly plain: RunContext; readonly buffed: RunContext; readonly hard: RunContext } = deepFreeze({
  /** No buffs, first room, difficulty 2. */
  plain: { ...emptyRun(2) },
  /** Same room and difficulty with an attack, a time and a hint buff. */
  buffed: {
    buffs: [
      { id: 'lottery-attack', kind: 'attack', amount: 15 },
      { id: 'lottery-time', kind: 'time', amount: 20 },
      { id: 'lottery-hint', kind: 'hint', amount: 2 },
    ],
    roomIndex: 0,
    difficulty: 2,
  },
  /** Deep in a run: room 4, difficulty 5, no buffs. */
  hard: { buffs: [], roomIndex: 4, difficulty: 5 },
});

export type PartyName = keyof typeof parties;
export type RunName = keyof typeof runs;
