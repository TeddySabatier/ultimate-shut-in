/**
 * Arena runs (docs/design/ARENA.md 5): enter for a fee, chain games, win a
 * Lottery buff after every win, bank or go on, lose and come home.
 *
 * A run is a small state machine kept in `arena.run`:
 *
 *   enterRun -> playing --won--> lottery --pickBuff--> decide --continueRun--> playing ...
 *                  |                 \_____________________\__bankRun__> (run ends)
 *                  \--lost/fled--> (run ends, the troops come home)
 *
 * The engine never imports a game. The host lists the playable games (id,
 * `minRing`, `rosterSize.min` from the manifests) and passes them in; the
 * engine only picks one. Every mutator follows the engine contract
 * `(save, now, ...) => { save, events, error? }`; refusals are short codes
 * (warm copy under `strings.arena.errors`).
 */
import type { Outcome } from '../../games/contract';
import { arenaContent, formatLine, strings } from '../content';
import { clone, ok, pushLog, refuse } from '../draft';
import { fnv1a, mulberry32, rngInt } from '../rng';
import type { TimeOptions } from '../time';
import { entryFee, roomDifficulty, winCoins } from './economics';
import { unownedRareItems } from './armory';
import { drawOffers } from './lottery';
import { rosterFor } from './roster';
import { arenaDefense, dayOf, sanitizeLearned } from './state';
import type {
  ActionResult,
  ArenaBankChoice,
  ArenaEnd,
  ArenaGameRecord,
  ArenaRun,
  GameEvent,
  SaveFile,
} from '../types';

/** What the host tells the engine about a registered game. */
export interface GameCandidate {
  id: string;
  /** `manifest.minRing` */
  minRing: number;
  /** `manifest.rosterSize.min` */
  rosterMin: number;
}

/** The part of an `Outcome` the engine reads. The host validated it with `outcomeProblems` first. */
export type RunOutcome = Pick<Outcome, 'result' | 'score'> & Partial<Pick<Outcome, 'learned'>>;

/* ------------------------------ Selectors ------------------------------ */

/** Games this player could be given: ring reached and enough troops, sorted by id so the draw never depends on listing order. */
export function eligibleGames(candidates: readonly GameCandidate[], ring: number, rosterSize: number): GameCandidate[] {
  return candidates.filter((g) => g.minRing <= ring && g.rosterMin <= rosterSize).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Pick the game of `room`: seeded, and never the same as the last one when there is a choice. */
export function pickGame(
  candidates: readonly GameCandidate[],
  ring: number,
  rosterSize: number,
  runSeed: number,
  room: number,
  lastGameId: string | null,
): GameCandidate | null {
  let pool = eligibleGames(candidates, ring, rosterSize);
  if (pool.length > 1 && lastGameId !== null) pool = pool.filter((g) => g.id !== lastGameId);
  if (pool.length === 0) return null;
  return pool[rngInt(mulberry32(fnv1a(`${runSeed >>> 0}:game:${room}`)), pool.length)] ?? null;
}

export interface BankOptions {
  coins: number;
  /** Wave defense this run would add now (0 when the period's cap is full). */
  defense: number;
  /** A rare item is on offer: enough wins and one left to find. */
  item: boolean;
}

/** What banking the current run would give, for the buttons. Null when there is nothing to bank. */
export function bankOptions(save: SaveFile): BankOptions | null {
  const run = save.arena.run;
  if (!run || run.phase === 'playing') return null;
  const b = arenaContent.bank;
  const room = Math.max(0, b.defenseCapPerPeriod - arenaDefense(save));
  return {
    coins: run.pending.coins,
    defense: Math.min(room, b.defensePerWin * run.pending.wins),
    item: run.pending.wins >= b.itemMinWins && unownedRareItems(save).length > 0,
  };
}

/** What a loss would still carry home: the share of the spoils kept. */
export function carriedHome(pendingCoins: number): number {
  return Math.floor(pendingCoins * arenaContent.run.carryHome);
}

/** The `RunContext` the host gives the game being played: the run's buffs, its room and its difficulty. */
export function runContext(run: ArenaRun): { buffs: ArenaRun['buffs']; roomIndex: number; difficulty: 1 | 2 | 3 | 4 | 5 } | null {
  if (!run.current) return null;
  return { buffs: run.buffs.map((b) => ({ ...b })), roomIndex: run.current.roomIndex, difficulty: run.current.difficulty };
}

/* ------------------------------ Mutators ------------------------------ */

/** Pay the fee and start a run with its first game. Refused before any coin moves when no game fits. */
export function enterRun(save: SaveFile, now: number, candidates: readonly GameCandidate[], opts?: TimeOptions): ActionResult {
  if (save.arena.run) return refuse(save, 'run in progress');
  const troops = rosterFor(save).length;
  if (troops === 0) return refuse(save, 'no troops');
  const ring = save.player.ring;
  const seq = save.arena.nextSeq;
  const seed = fnv1a(`${save.firstPlayDay}:arena:${seq}`);
  const first = pickGame(candidates, ring, troops, seed, 0, null);
  if (!first) return refuse(save, 'no games');
  const fee = entryFee(ring, save.settings.difficulty);
  if (save.player.coins < fee) return refuse(save, 'not enough coins');

  const draft = clone(save);
  const day = dayOf(draft, now, opts);
  draft.player.coins -= fee;
  draft.arena.nextSeq += 1;
  draft.arena.today = draft.arena.today.day === day ? { day, runs: draft.arena.today.runs + 1 } : { day, runs: 1 };
  draft.arena.stats.runs += 1;
  draft.arena.run = {
    id: `r${seq}`,
    seed,
    startedDay: day,
    startedAt: now,
    ring,
    fee,
    phase: 'playing',
    room: 0,
    buffs: [],
    pending: { coins: 0, wins: 0 },
    current: { gameId: first.id, seed: fnv1a(`${seed}:seed:0`), roomIndex: 0, difficulty: roomDifficulty(0, ring) },
    offers: [],
    games: [],
    lastGameId: null,
  };
  return ok(draft, [{ type: 'arenaRunStarted', runId: `r${seq}`, fee }]);
}

function cleanOutcome(o: RunOutcome): { result: 'won' | 'lost' | 'fled'; score: number; learned: ReturnType<typeof sanitizeLearned> } {
  const result = o.result === 'won' || o.result === 'lost' ? o.result : 'fled';
  const raw = typeof o.score === 'number' && Number.isFinite(o.score) ? Math.round(o.score) : 0;
  return { result, score: Math.max(0, Math.min(1000, raw)), learned: sanitizeLearned(o.learned) };
}

/** Close the run on the draft: log it, pay `coins`, clear it. Buffs live in the run, so they go with it. */
function endRunDraft(
  draft: SaveFile,
  run: ArenaRun,
  now: number,
  day: number,
  end: ArenaEnd,
  paid: { coins: number; defense: number; bank: ArenaBankChoice | null; itemId: string | null },
): GameEvent[] {
  draft.player.coins += paid.coins;
  const wins = run.pending.wins;
  draft.arena.log.push({
    id: run.id,
    day,
    at: now,
    ring: run.ring,
    fee: run.fee,
    wins,
    end,
    bank: paid.bank,
    coins: paid.coins,
    defense: paid.defense,
    itemId: paid.itemId,
    games: run.games.map((g) => ({ ...g })),
  });
  if (draft.arena.log.length > arenaContent.log.keep) draft.arena.log.splice(0, draft.arena.log.length - arenaContent.log.keep);
  draft.arena.stats.bestChain = Math.max(draft.arena.stats.bestChain, wins);
  draft.arena.stats.coinsBanked += paid.coins;
  draft.arena.run = null;
  const pool = end === 'banked' ? strings.arena.log.banked : end === 'lost' ? strings.arena.log.lost : strings.arena.log.fled;
  pushLog(draft, now, day, 'arena', formatLine(pool[fnv1a(run.id) % pool.length] ?? '', { wins, coins: paid.coins }));
  return [{ type: 'arenaRunEnded', runId: run.id, end, wins, coins: paid.coins }];
}

/**
 * Apply the outcome of the game in progress. A win adds to the run's spoils
 * and opens the Lottery; a loss, or leaving, ends the run: the troops come
 * home, every buff is cleared, and a share of the spoils comes with them.
 * Streaks, loyalty and utilities are never touched.
 */
export function resolveGame(save: SaveFile, now: number, outcome: RunOutcome, opts?: TimeOptions): ActionResult {
  const run = save.arena.run;
  if (!run || run.phase !== 'playing' || !run.current) return refuse(save, 'no game in progress');
  const { result, score, learned } = cleanOutcome(outcome);
  const draft = clone(save);
  const d = draft.arena.run as ArenaRun;
  const cur = run.current;
  const game: ArenaGameRecord = { gameId: cur.gameId, room: cur.roomIndex, result, score, coins: 0 };
  if (learned) game.learned = learned;
  const events: GameEvent[] = [];

  if (result === 'won') {
    game.coins = winCoins(d.fee, score, cur.roomIndex);
    d.games.push(game);
    d.pending = { coins: d.pending.coins + game.coins, wins: d.pending.wins + 1 };
    d.room += 1;
    d.lastGameId = cur.gameId;
    d.current = null;
    draft.arena.stats.gamesWon += 1;
    if (d.room >= arenaContent.run.maxRooms) {
      d.phase = 'decide';
      d.offers = [];
    } else {
      d.offers = drawOffers(d.seed, cur.roomIndex, d.buffs);
      d.phase = d.offers.length > 0 ? 'lottery' : 'decide';
    }
    events.push({ type: 'arenaGameResolved', runId: d.id, gameId: cur.gameId, result, score, coins: game.coins });
    return ok(draft, events);
  }

  d.games.push(game);
  if (result === 'lost') draft.arena.stats.gamesLost += 1;
  const carried = carriedHome(d.pending.coins);
  events.push({ type: 'arenaGameResolved', runId: d.id, gameId: cur.gameId, result, score, coins: 0 });
  events.push(...endRunDraft(draft, d, now, dayOf(draft, now, opts), result, { coins: carried, defense: 0, bank: null, itemId: null }));
  return ok(draft, events);
}

/** Leave the game in progress: the run ends like a loss (`fled`). */
export function abandonRun(save: SaveFile, now: number, opts?: TimeOptions): ActionResult {
  return resolveGame(save, now, { result: 'fled', score: 0 }, opts);
}

/** Keep one of the three offered buffs. */
export function pickBuff(save: SaveFile, _now: number, buffId: string): ActionResult {
  const run = save.arena.run;
  if (!run || run.phase !== 'lottery') return refuse(save, 'no lottery open');
  const offer = run.offers.find((o) => o.id === buffId);
  if (!offer) return refuse(save, 'not on offer');
  const draft = clone(save);
  const d = draft.arena.run as ArenaRun;
  d.buffs.push({ ...offer });
  d.offers = [];
  d.phase = 'decide';
  return ok(draft, [{ type: 'arenaBuffPicked', runId: d.id, buffId: offer.id }]);
}

/** Go on to the next game of the run. */
export function continueRun(save: SaveFile, _now: number, candidates: readonly GameCandidate[]): ActionResult {
  const run = save.arena.run;
  if (!run || run.phase !== 'decide') return refuse(save, 'nothing to continue');
  if (run.room >= arenaContent.run.maxRooms) return refuse(save, 'chain complete');
  const troops = rosterFor(save).length;
  const next = pickGame(candidates, run.ring, troops, run.seed, run.room, run.lastGameId);
  if (!next) return refuse(save, 'no games');
  const draft = clone(save);
  const d = draft.arena.run as ArenaRun;
  d.phase = 'playing';
  d.current = { gameId: next.id, seed: fnv1a(`${d.seed}:seed:${d.room}`), roomIndex: d.room, difficulty: roomDifficulty(d.room, d.ring) };
  return ok(draft, []);
}

/**
 * Bank the run: turn its spoils into coins, a one-period wave defense bonus
 * or a rare Armory item. The run ends and its buffs are cleared; what was
 * banked, and the gear, always stays. Domain Points are never touched.
 */
export function bankRun(save: SaveFile, now: number, choice: ArenaBankChoice, opts?: TimeOptions): ActionResult {
  const run = save.arena.run;
  const options = bankOptions(save);
  if (!run || !options) return refuse(save, 'nothing to bank');
  const draft = clone(save);
  const d = draft.arena.run as ArenaRun;
  const day = dayOf(draft, now, opts);
  let coins = 0;
  let defense = 0;
  let itemId: string | null = null;

  if (choice === 'coins') {
    coins = options.coins;
  } else if (choice === 'defense') {
    if (options.defense <= 0) return refuse(save, 'defense capped');
    defense = options.defense;
    draft.arena.defense = { period: draft.week.index, amount: arenaDefense(draft) + defense };
  } else {
    if (!options.item) return refuse(save, run.pending.wins < arenaContent.bank.itemMinWins ? 'chain too short' : 'no rare item left');
    const left = unownedRareItems(draft);
    const pick = left[rngInt(mulberry32(fnv1a(`${d.seed}:item`)), left.length)];
    if (!pick) return refuse(save, 'no rare item left');
    itemId = pick.id;
    draft.arena.stash.push(pick.id);
  }

  const events: GameEvent[] = [{ type: 'arenaBanked', runId: d.id, choice, coins, defense, itemId }];
  events.push(...endRunDraft(draft, d, now, day, 'banked', { coins, defense, bank: choice, itemId }));
  return ok(draft, events);
}
