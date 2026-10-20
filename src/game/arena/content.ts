/**
 * Typed loader for `arena.json` (Armory catalogue, lottery, fees).
 */
import arenaJson from '../content/arena.json';
import type { ArenaRunBuffKind, HabitId } from '../types';

export interface ArenaGearItem {
  id: string;
  slot: 'blade' | 'mail' | 'charm';
  tier: 1 | 2 | 3;
  name: string;
  power: number;
  trait: string | null;
  basePrice: number;
}

export interface ArenaLotteryBuff {
  id: string;
  kind: ArenaRunBuffKind;
  amount: number;
  weight: number;
}

export interface ArenaContent {
  version: number;
  entry: { base: number; perRing: number; maxDailyFraction: number };
  training: {
    baseCost: number;
    costPerRing: number;
    weeklyCapFraction: number;
    powerSteps: number[];
    maxSessions: number;
  };
  gearSlots: readonly ['blade', 'mail', 'charm'];
  gear: ArenaGearItem[];
  decor: Array<{ comboId: string; basePrice: number }>;
  lottery: { drawCount: number; buffs: ArenaLotteryBuff[] };
  banking: {
    coinsPerScore: number;
    defensePerScore: number;
    rareGearMinScore: number;
    defenseScoreShare: number;
    coinScoreShare: number;
    gearScoreShare: number;
  };
  requests: { maxEntries: number; textMax: number };
}

export const arenaContent = arenaJson as unknown as ArenaContent;

const gearById = new Map(arenaContent.gear.map((g) => [g.id, g]));

export function getGearItem(id: string): ArenaGearItem | undefined {
  return gearById.get(id);
}

export function gearSlotIndex(slot: ArenaGearItem['slot']): number {
  return arenaContent.gearSlots.indexOf(slot);
}

export function gearPrice(item: ArenaGearItem, ring: number): number {
  return Math.round(item.basePrice * (1 + 0.12 * Math.max(0, ring - 1)));
}

export function decorPrice(comboId: string, ring: number): number | null {
  const d = arenaContent.decor.find((x) => x.comboId === comboId);
  if (!d) return null;
  return Math.round(d.basePrice * (1 + 0.1 * Math.max(0, ring - 1)));
}

export function trainingCost(ring: number): number {
  const t = arenaContent.training;
  return t.baseCost + t.costPerRing * Math.max(0, ring - 1);
}

/** Power gained from the next training session for a vassal with `sessions` already bought. */
export function trainingPowerGain(sessions: number): number {
  const steps = arenaContent.training.powerSteps;
  if (sessions >= steps.length) return steps[steps.length - 1] ?? 0;
  return steps[sessions] ?? 0;
}

export function totalTrainingPower(sessions: number): number {
  let total = 0;
  for (let i = 0; i < sessions; i++) total += trainingPowerGain(i);
  return total;
}

export function emptyGearSlots(): Record<HabitId, [null, null, null]> {
  return {
    move: [null, null, null],
    outside: [null, null, null],
    clean: [null, null, null],
    social: [null, null, null],
    study: [null, null, null],
    sleep: [null, null, null],
    eat: [null, null, null],
    hygiene: [null, null, null],
  };
}
