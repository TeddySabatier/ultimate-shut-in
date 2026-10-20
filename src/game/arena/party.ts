/**
 * Builds the plug-in `Party` from save, Armory gear and training.
 * Pure: returns plain data matching `src/games/contract.ts` shapes without importing it.
 */
import { derivePower } from '../../games/contract';
import { getGearItem, totalTrainingPower } from './content';
import { rosterFor } from './roster';
import type { HabitId, SaveFile } from '../types';

export interface ContractPartyMember {
  id: string;
  name: string;
  habit: HabitId | null;
  level: number;
  loyalty: number;
  power: number;
  traits: string[];
}

export interface ContractParty {
  members: ContractPartyMember[];
}

function titlesForHabit(save: SaveFile, habit: HabitId): string[] {
  const out: string[] = [];
  for (const t of save.titles) {
    if (t.habit === undefined || t.habit === habit) out.push(t.titleId);
  }
  return out;
}

function gearBonuses(save: SaveFile, habit: HabitId): { power: number; traits: string[] } {
  let power = 0;
  const traits: string[] = [];
  for (const itemId of save.arena.gear[habit]) {
    if (!itemId) continue;
    const item = getGearItem(itemId);
    if (!item) continue;
    power += item.power;
    if (item.trait) traits.push(item.trait);
  }
  return { power, traits };
}

/** Party sent to mini games: gear and training adjust power and traits; values stay in 1..100. */
export function buildParty(save: SaveFile): ContractParty {
  const members: ContractPartyMember[] = [];
  for (const r of rosterFor(save)) {
    const base = derivePower(r.level, r.loyalty);
    const train = totalTrainingPower(save.arena.trainingSessions[r.habit] ?? 0);
    const gear = gearBonuses(save, r.habit);
    const power = Math.max(1, Math.min(100, base + train + gear.power));
    const traits = [...titlesForHabit(save, r.habit), ...gear.traits];
    members.push({
      id: r.id,
      name: r.name,
      habit: r.habit,
      level: r.level,
      loyalty: r.loyalty,
      power,
      traits,
    });
  }
  return { members };
}
