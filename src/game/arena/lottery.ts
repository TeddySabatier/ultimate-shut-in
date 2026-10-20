/**
 * Arena lottery: weighted buff draws between run games.
 */
import { clone, ok, refuse } from '../draft';
import { fnv1a, mulberry32, rngWeightedIndex } from '../rng';
import { arenaContent, type ArenaLotteryBuff } from './content';
import type { ActionResult, ArenaRunBuffKind, SaveFile } from '../types';

export function lotterySeed(runSeed: number, roomIndex: number, draw: number): number {
  return fnv1a(`${runSeed >>> 0}:lottery:${roomIndex}:${draw}`);
}

/** Three distinct buff options for the room just won; deterministic from the run seed. */
export function drawLotteryOptions(runSeed: number, roomIndex: number): ArenaLotteryBuff[] {
  const pool = arenaContent.lottery.buffs;
  const count = Math.min(arenaContent.lottery.drawCount, pool.length);
  const rng = mulberry32(lotterySeed(runSeed, roomIndex, 0));
  const picked: ArenaLotteryBuff[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (picked.length < count && guard++ < 200) {
    const idx = rngWeightedIndex(
      rng,
      pool.map((b) => b.weight),
    );
    const buff = pool[idx];
    if (!buff || used.has(buff.id)) continue;
    used.add(buff.id);
    picked.push(buff);
  }
  return picked;
}

export function pickLotteryBuff(save: SaveFile, buffId: string): ActionResult {
  const run = save.arena.activeRun;
  if (!run?.lotteryChoice) return refuse(save, 'arena.noLottery');
  if (!run.lotteryChoice.includes(buffId)) return refuse(save, 'arena.badBuff');
  const def = arenaContent.lottery.buffs.find((b) => b.id === buffId);
  if (!def) return refuse(save, 'arena.badBuff');
  const draft = clone(save);
  const active = draft.arena.activeRun!;
  active.lotteryChoice = null;
  active.buffs.push({ id: def.id, kind: def.kind as ArenaRunBuffKind, amount: def.amount });
  return ok(draft, [{ type: 'arenaBuffPicked', buffId }]);
}
