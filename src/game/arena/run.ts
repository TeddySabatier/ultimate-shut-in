/**
 * Arena runs: entry fee, game chain, outcomes, banking, lottery between wins.
 */
import { clone, ok, refuse } from '../draft';
import { fnv1a, mulberry32, rngPick } from '../rng';
import type { TimeOptions } from '../time';
import { arenaContent, getGearItem } from './content';
import { entryFee } from './economy';
import { drawLotteryOptions } from './lottery';
import type { ActionResult, SaveFile } from '../types';

export interface GamePickCandidate {
  id: string;
  minRing: number;
}

export interface RunOutcomeInput {
  gameId: string;
  result: 'won' | 'lost' | 'fled';
  score: number;
  learnedTopic?: string;
}

function runSeed(save: SaveFile, now: number): number {
  return fnv1a(`${save.firstPlayDay}:${save.arena.totalRuns}:${now >>> 0}`);
}

/** Pick the next game id; never repeats when more than one eligible game exists. */
export function pickNextGame(
  lastGameId: string | null,
  eligible: GamePickCandidate[],
  seed: number,
  roomIndex: number,
  ring = 7,
): string | null {
  const pool = eligible.filter((g) => g.minRing <= ring);
  if (pool.length === 0) return null;
  let choices = pool;
  if (lastGameId && pool.length > 1) choices = pool.filter((g) => g.id !== lastGameId);
  if (choices.length === 0) choices = pool;
  const rng = mulberry32(fnv1a(`${seed >>> 0}:pick:${roomIndex}`));
  return rngPick(rng, choices).id;
}

export function startRun(save: SaveFile, now: number, _opts?: TimeOptions): ActionResult {
  if (save.arena.activeRun) return refuse(save, 'arena.runActive');
  const fee = entryFee(save.player.ring, save.settings.difficulty);
  if (save.player.coins < fee) return refuse(save, 'arena.shortCoins');
  const draft = clone(save);
  draft.player.coins -= fee;
  const seed = runSeed(save, now);
  draft.arena.activeRun = {
    seed,
    roomIndex: 0,
    lastGameId: null,
    buffs: [],
    pendingScore: 0,
    bankedCoins: 0,
    log: [],
    startedAt: now,
    entryFee: fee,
    lotteryChoice: null,
  };
  draft.arena.totalRuns += 1;
  return ok(draft, [{ type: 'arenaRunStarted', fee }]);
}

function scoreToRewards(pendingScore: number): { coins: number; defense: number; gearId: string | null } {
  const b = arenaContent.banking;
  const coins = Math.round(pendingScore * b.coinsPerScore * b.coinScoreShare);
  const defense = Math.round(pendingScore * b.defensePerScore * b.defenseScoreShare);
  let gearId: string | null = null;
  if (pendingScore >= b.rareGearMinScore) {
    const tier3 = arenaContent.gear.filter((g) => g.tier === 3);
    gearId = tier3[pendingScore % tier3.length]?.id ?? null;
  }
  return { coins, defense, gearId };
}

/** Apply a mini-game outcome to the active run. */
export function applyRunOutcome(save: SaveFile, input: RunOutcomeInput, _now: number, _opts?: TimeOptions): ActionResult {
  const run = save.arena.activeRun;
  if (!run) return refuse(save, 'arena.noRun');
  if (run.lotteryChoice) return refuse(save, 'arena.lotteryPending');
  const draft = clone(save);
  const active = draft.arena.activeRun!;
  const entry: (typeof active.log)[number] = { gameId: input.gameId, result: input.result, score: input.score };
  if (input.learnedTopic) entry.learnedTopic = input.learnedTopic;
  active.log.push(entry);
  active.lastGameId = input.gameId;

  if (input.result === 'won') {
    active.pendingScore += input.score;
    active.roomIndex += 1;
    const options = drawLotteryOptions(active.seed, active.roomIndex);
    active.lotteryChoice = options.map((o) => o.id);
    return ok(draft, []);
  }

  if (input.result === 'lost') {
    active.buffs = [];
    active.pendingScore = 0;
    active.lotteryChoice = null;
    const rooms = active.log.filter((e) => e.result === 'won').length;
    draft.arena.activeRun = null;
    return ok(draft, [{ type: 'arenaRunEnded', banked: false, rooms }]);
  }

  // fled: end run without banking pending
  active.buffs = [];
  active.pendingScore = 0;
  const rooms = active.log.filter((e) => e.result === 'won').length;
  draft.arena.activeRun = null;
  return ok(draft, [{ type: 'arenaRunEnded', banked: false, rooms }]);
}

export type BankChoice = 'coins' | 'defense' | 'gear';

/** Bank pending score into settlement, a wave defense boost, or a rare gear piece; ends the run. */
export function bankRun(save: SaveFile, choice: BankChoice, _now: number, _opts?: TimeOptions): ActionResult {
  const run = save.arena.activeRun;
  if (!run) return refuse(save, 'arena.noRun');
  if (run.lotteryChoice) return refuse(save, 'arena.lotteryPending');
  if (run.pendingScore <= 0) return refuse(save, 'arena.nothingToBank');
  const draft = clone(save);
  const active = draft.arena.activeRun!;
  const rewards = scoreToRewards(active.pendingScore);
  const rooms = active.log.filter((e) => e.result === 'won').length;

  if (choice === 'coins') {
    draft.player.coins += rewards.coins;
    active.bankedCoins += rewards.coins;
  } else if (choice === 'defense') {
    draft.arena.waveBoost = { bonus: rewards.defense, forWeekIndex: draft.week.index };
  } else if (choice === 'gear') {
    const gearId = rewards.gearId;
    if (!gearId) return refuse(save, 'arena.noRareGear');
    const item = getGearItem(gearId);
    if (!item) return refuse(save, 'arena.noRareGear');
    const habit = draft.settings.enabledHabits[0] ?? 'move';
    const slot = arenaContent.gearSlots.indexOf(item.slot);
    if (slot >= 0) draft.arena.gear[habit][slot] = gearId;
  }

  active.buffs = [];
  active.pendingScore = 0;
  draft.arena.activeRun = null;
  return ok(draft, [{ type: 'arenaRunEnded', banked: true, rooms }]);
}

/** Build `RunContext` for the host from the active run (plain JSON). */
export function runContextFor(save: SaveFile): {
  buffs: Array<{ id: string; kind: string; amount: number }>;
  roomIndex: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
} | null {
  const run = save.arena.activeRun;
  if (!run) return null;
  const difficulty = Math.min(5, Math.max(1, 1 + Math.floor(run.roomIndex / 2))) as 1 | 2 | 3 | 4 | 5;
  return { buffs: run.buffs, roomIndex: run.roomIndex, difficulty };
}
