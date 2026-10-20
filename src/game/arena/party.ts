/**
 * Build the contract's `Party` from the save, gear and training
 * (docs/design/ARENA.md 4.4). The host calls `buildParty` once per game.
 *
 * Level and loyalty stay the vassal's own. `power` is the contract's
 * `derivePower(level, loyalty)` plus gear and training, clamped to 1..100 so
 * a game can keep trusting the range; `traits` are the earned titles of the
 * vassal's habit, then `gear:<slot>:<tier>` and `training:<bumps>` from the
 * Armory (games ignore trait ids they do not know).
 */
import type { Party, PartyMember } from '../../games/contract';
import { armoryTraits, gearPower, trainingBonus } from './armory';
import { rosterFor } from './roster';
import type { SaveFile } from '../types';

export const POWER_MIN = 1;
export const POWER_MAX = 100;

/** One troop with the Armory applied. Members that are not vassals (later: citizens) pass through unchanged. */
export function equipMember(save: SaveFile, member: PartyMember): PartyMember {
  const habit = member.habit;
  if (habit === null) return { ...member, traits: [...member.traits] };
  const power = Math.max(POWER_MIN, Math.min(POWER_MAX, member.power + gearPower(save, habit) + trainingBonus(save, habit)));
  return { ...member, power, traits: [...member.traits, ...armoryTraits(save, habit)] };
}

/**
 * Every troop the player has, equipped and sorted strongest first (ties keep
 * the roster order), because games take the first `rosterSize.max` members.
 */
export function buildParty(save: SaveFile): Party {
  const members = rosterFor(save).map((m) => equipMember(save, m));
  const order = new Map(members.map((m, i) => [m.id, i] as const));
  members.sort((a, b) => b.power - a.power || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { members };
}
