/**
 * The Lottery (docs/design/ARENA.md 5.2): after every won game, three run
 * buffs are drawn by weight, the player keeps one.
 *
 * The draw is a pure function of the run's seed and the room, so a reload
 * shows the same three offers. Kinds already at their cap are left out, so a
 * run can never stack past `lottery.caps`. The `luck` buff makes the rare
 * entries heavier (`luckBoostPer` points of luck double their weight).
 */
import { arenaContent, type ArenaBuffDef } from '../content';
import { fnv1a, mulberry32, rngWeightedIndex } from '../rng';
import { runBuffTotal } from './state';
import type { ArenaBuff } from '../types';

/** The buff a pick puts in `run.buffs`: the definition's id plus the room it was won in, so ids stay unique. */
export function buffFromDef(def: ArenaBuffDef, room: number): ArenaBuff {
  return { id: `${def.id}@${room}`, kind: def.kind, amount: def.amount };
}

/** Definitions that may still be offered: the kind would stay within its cap. */
export function eligibleBuffs(buffs: readonly ArenaBuff[]): ArenaBuffDef[] {
  return arenaContent.lottery.buffs.filter((b) => runBuffTotal(buffs, b.kind) + b.amount <= arenaContent.lottery.caps[b.kind]);
}

/** Effective weight of a definition for a run holding `buffs`. */
export function buffWeight(def: ArenaBuffDef, buffs: readonly ArenaBuff[]): number {
  if (!def.rare) return def.weight;
  return def.weight * (1 + runBuffTotal(buffs, 'luck') / arenaContent.lottery.luckBoostPer);
}

/** Chance (0..1) that a single draw lands on each eligible definition, for the docs and the tests. */
export function drawOdds(buffs: readonly ArenaBuff[]): Array<{ id: string; chance: number }> {
  const pool = eligibleBuffs(buffs);
  const total = pool.reduce((s, d) => s + buffWeight(d, buffs), 0);
  return pool.map((d) => ({ id: d.id, chance: total === 0 ? 0 : buffWeight(d, buffs) / total }));
}

/**
 * Draw the offers after the win of `room` (0-based): up to `offers` distinct
 * definitions, weighted, without replacement. Same seed, room and buffs give
 * the same offers.
 */
export function drawOffers(runSeed: number, room: number, buffs: readonly ArenaBuff[]): ArenaBuff[] {
  const rng = mulberry32(fnv1a(`${runSeed >>> 0}:lottery:${room}`));
  const pool = eligibleBuffs(buffs);
  const out: ArenaBuff[] = [];
  while (out.length < arenaContent.lottery.offers && pool.length > 0) {
    const i = rngWeightedIndex(rng, pool.map((d) => buffWeight(d, buffs)));
    const [def] = pool.splice(i, 1);
    if (def) out.push(buffFromDef(def, room));
  }
  return out;
}
