/**
 * Weight Garden: the player grows a tiny neural network (a "gardener") that
 * must tell two kinds of seed apart.
 *
 * Up to five plots: one neuron by hand, auto-train (learning rate), XOR (why a
 * hidden layer), noise (overfitting, early stopping), a ring (everything).
 * Training is real full-batch gradient descent (`net.ts`); the engine is a
 * state machine of explicit actions, so the Lab's bot and the tests drive it.
 *
 * Pure and seeded. Arithmetic is add, multiply, divide, compare and `Math.sqrt`
 * only, so a seed replays identically on every device.
 */
import { fnv1a, mulberry32 } from '../../game/rng';
import {
  buffAmount,
  clampScore,
  formatText,
  turnRng,
  type GameEngine,
  type Locale,
  type Outcome,
  type Party,
  type RunContext,
} from '../contract';
import { centroidLine, makeSeeds, NOISE_GOAL, type RoomKind } from './data';
import {
  clamp,
  countRight,
  growNet,
  loss as lossOf,
  paramCount,
  randomNet,
  round1,
  round2,
  round4,
  setParam,
  shrinkNet,
  train,
  zeroNet,
  type Net,
  type Seed,
} from './net';
import { strings, type WeightGardenStrings } from './strings';

export { ROOM_KINDS, type RoomKind } from './data';

/** Tries a plot gives before the garden wilts. */
export const MAX_TRIES = 3;
/** Above this training loss the weights have flown apart. */
export const DIVERGE_LOSS = 12;
/** The learning rates the slider offers, low to high. */
export const LR_STEPS: readonly number[] = [0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3];
export const MIN_LR = 0.01;
export const MAX_LR = 3;
/** Slider range of a hand-turned weight. */
export const WEIGHT_LIMIT = 4;
export const MAX_HIDDEN = 4;
export const HISTORY_CAP = 40;

export interface HistoryEntry {
  /** Training loss after the round (a spike is kept, capped at 99). */
  l: number;
  /** Training accuracy, whole percent. */
  tr: number;
  /** Test accuracy, whole percent. */
  te: number;
}

export interface ClearedRoom {
  room: number;
  /** Test accuracy when the plot was settled, whole percent. */
  test: number;
  /** Training accuracy when settled, whole percent. */
  trainPct: number;
  /** Training loss times 100, whole number. */
  loss: number;
  /** Rounds used, and the budget (0 for the hand-turned plot). */
  rounds: number;
  budget: number;
  /** 1 for a first try. */
  attempt: number;
  hidden: number;
}

export interface WeightGardenState {
  seed: number;
  turn: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** The plots of this game, in order (shorter on low difficulty). */
  plan: RoomKind[];
  room: number;
  net: Net;
  lr: number;
  seeds: Seed[];
  /** Gradient steps in one Train press (Move raises it). */
  batch: number;
  /** Train presses a try may use. */
  budget: number;
  /** The loss the "auto-train" plot asks for, and the accuracy (percent) the plot asks for. */
  targetLoss: number;
  goalPct: number;
  /** Presses used in this try, gradient steps used overall. */
  rounds: number;
  steps: number;
  fails: number;
  maxTries: number;
  trainOk: number;
  trainN: number;
  testOk: number;
  testN: number;
  loss: number;
  /** How the try began (before the first press): the left end of the curves. */
  start: HistoryEntry;
  history: HistoryEntry[];
  /** The last Train press flew apart (the weights were replanted). */
  diverged: boolean;
  divergences: number;
  /** The try ran out of presses and a new try began. */
  replanted: boolean;
  cleared: ClearedRoom[];
  /** From the party and buffs. */
  revives: number;
  hints: number;
  hintOn: boolean;
  showAdvice: boolean;
  moveBoost: number;
  sleepBonus: number;
  /** Luck buff points: one more seedling to pick from per 5. */
  luckPoints: number;
  troopIds: string[];
  forfeited: boolean;
  wilted: boolean;
  won: boolean;
}

export type WeightGardenAction =
  | { type: 'step' }
  | { type: 'setWeight'; slot: number; value: number }
  | { type: 'setLearningRate'; value: number }
  | { type: 'addNeuron' }
  | { type: 'removeNeuron' }
  | { type: 'hint' }
  | { type: 'nextRoom' }
  | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Plots
// ---------------------------------------------------------------------------

export function planFor(difficulty: number): RoomKind[] {
  if (difficulty <= 1) return ['line', 'train', 'xor'];
  if (difficulty === 2) return ['line', 'train', 'xor', 'noise'];
  return ['line', 'train', 'xor', 'noise', 'boss'];
}

interface RoomConfig {
  batch: number;
  budget: number;
  startLr: number;
  goodLr: number;
  goalPct: number;
}

/** The numbers of one plot at one difficulty (1 gentle, 5 tight). */
export function roomConfig(kind: RoomKind, difficulty: number): RoomConfig {
  const i = clamp(Math.round(difficulty), 1, 5) - 1;
  const pick = (a: readonly number[]) => a[i] ?? a[0] ?? 0;
  if (kind === 'train') return { batch: 4, budget: pick([10, 9, 8, 7, 6]), startLr: 0.02, goodLr: 0.2, goalPct: 95 };
  if (kind === 'xor') return { batch: 10, budget: pick([16, 14, 12, 12, 10]), startLr: 0.15, goodLr: 0.15, goalPct: 95 };
  if (kind === 'noise') return { batch: 12, budget: pick([12, 12, 12, 11, 10]), startLr: 0.25, goodLr: 0.25, goalPct: pick(NOISE_GOAL) };
  if (kind === 'boss') return { batch: 12, budget: pick([14, 12, 9, 9, 8]), startLr: 0.25, goodLr: 0.25, goalPct: pick([82, 86, 90, 92, 95]) };
  return { batch: 0, budget: 0, startLr: 0.1, goodLr: 0.1, goalPct: 95 };
}

/**
 * The loss the auto-train plot asks for: a little above what a well-trained
 * single neuron reaches on these very seeds (so it is always reachable, and
 * a gentler margin at low difficulty).
 */
export function targetLossFor(seeds: readonly Seed[], difficulty: number): number {
  const best = lossOf(train(zeroNet(0), seeds, 0.2, 300), trainSeeds(seeds));
  const margin = [1.5, 1.4, 1.3, 1.2, 1.15][clamp(Math.round(difficulty), 1, 5) - 1] ?? 1.3;
  return round2(best * margin + 0.02);
}

export function kindOf(state: Pick<WeightGardenState, 'plan' | 'room'>): RoomKind {
  return state.plan[state.room] ?? 'line';
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

function trainSeeds(seeds: readonly Seed[]): Seed[] {
  return seeds.filter((s) => s.t === 1);
}
function testSeeds(seeds: readonly Seed[]): Seed[] {
  return seeds.filter((s) => s.t === 0);
}

function measure(net: Net, seeds: readonly Seed[]) {
  const tr = trainSeeds(seeds);
  const te = testSeeds(seeds);
  return {
    trainOk: countRight(net, tr),
    trainN: tr.length,
    testOk: countRight(net, te),
    testN: te.length,
    loss: round4(lossOf(net, tr)),
  };
}

function pct(ok: number, n: number): number {
  return n === 0 ? 0 : Math.floor((ok * 100) / n);
}

export function trainPct(s: Pick<WeightGardenState, 'trainOk' | 'trainN'>): number {
  return pct(s.trainOk, s.trainN);
}
export function testPct(s: Pick<WeightGardenState, 'testOk' | 'testN'>): number {
  return pct(s.testOk, s.testN);
}

function withNet(state: WeightGardenState, net: Net): WeightGardenState {
  return { ...state, net, ...measure(net, state.seeds) };
}

/** Same, and remember how the try began. */
function withFreshNet(state: WeightGardenState, net: Net): WeightGardenState {
  const next = withNet(state, net);
  return { ...next, start: { l: next.loss, tr: pct(next.trainOk, next.trainN), te: pct(next.testOk, next.testN) } };
}

/** Is the plot's goal met right now? (The player then opens the next plot.) */
export function roomPassed(state: WeightGardenState): boolean {
  const kind = kindOf(state);
  if (kind === 'line') return state.trainOk * 100 >= 95 * state.trainN;
  if (state.rounds < 1) return false;
  if (kind === 'train') return state.loss <= state.targetLoss && state.trainOk * 100 >= 95 * state.trainN;
  if (kind === 'xor') return state.trainOk * 100 >= 95 * state.trainN;
  return state.testOk * 100 >= state.goalPct * state.testN;
}

export function isOver(state: WeightGardenState): boolean {
  return state.forfeited || state.wilted || state.won;
}

export function tryNumber(state: Pick<WeightGardenState, 'fails'>): number {
  return state.fails + 1;
}

export function roundsLeft(state: Pick<WeightGardenState, 'budget' | 'rounds'>): number {
  return Math.max(0, state.budget - state.rounds);
}

// ---------------------------------------------------------------------------
// Starting a plot
// ---------------------------------------------------------------------------

/** The healthiest of a few seedlings: the one whose loss is lowest after a short probe. */
function bestSeedling(make: () => Net, seeds: readonly Seed[], tries: number): Net {
  let best = make();
  if (tries <= 1) return best;
  let bestLoss = lossOf(train(best, seeds, 0.1, 12), trainSeeds(seeds));
  for (let i = 1; i < tries; i++) {
    const cand = make();
    const l = lossOf(train(cand, seeds, 0.1, 12), trainSeeds(seeds));
    if (l < bestLoss) {
      best = cand;
      bestLoss = l;
    }
  }
  return best;
}

function startingNet(kind: RoomKind, seeds: readonly Seed[], rng: () => number, luck: number): Net {
  const hidden = kind === 'noise' ? 4 : 0;
  return bestSeedling(() => randomNet(rng, hidden), seeds, 1 + Math.floor(luck / 5));
}

function setupRoom(base: WeightGardenState, room: number, luck: number): WeightGardenState {
  const kind = base.plan[room] ?? 'line';
  const cfg = roomConfig(kind, base.difficulty);
  const dataRng = mulberry32(fnv1a(`weight-garden:${base.seed}:${room}`));
  const seeds = makeSeeds(dataRng, kind, base.difficulty);
  const net = startingNet(kind, seeds, mulberry32(fnv1a(`weight-garden:${base.seed}:${room}:net`)), luck);
  const extraRounds = kind === 'line' ? 0 : base.sleepBonus;
  return withFreshNet(
    {
      ...base,
      room,
      seeds,
      lr: cfg.startLr,
      batch: cfg.batch === 0 ? 0 : cfg.batch + base.moveBoost,
      budget: cfg.budget === 0 ? 0 : cfg.budget + extraRounds,
      targetLoss: kind === 'train' ? targetLossFor(seeds, base.difficulty) : 0,
      goalPct: cfg.goalPct,
      rounds: 0,
      fails: 0,
      maxTries: MAX_TRIES,
      history: [],
      diverged: false,
      replanted: false,
      hintOn: false,
    },
    net,
  );
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function habitPower(party: Party, habit: string): number {
  let p = 0;
  for (const m of party.members) if (m.habit === habit) p += m.power;
  return p;
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): WeightGardenState {
  const move = habitPower(party, 'move');
  const sleep = habitPower(party, 'sleep');
  const study = habitPower(party, 'study');
  const troopIds: string[] = [];
  for (const m of party.members) if ((m.habit === 'move' || m.habit === 'sleep' || m.habit === 'study') && !troopIds.includes(m.id)) troopIds.push(m.id);
  const first = party.members[0];
  if (troopIds.length === 0 && first) troopIds.push(first.id);
  const base: WeightGardenState = {
    seed: seed >>> 0,
    turn: 0,
    locale,
    difficulty: run.difficulty,
    plan: planFor(run.difficulty),
    room: 0,
    net: zeroNet(0),
    lr: 0.1,
    seeds: [],
    batch: 0,
    budget: 0,
    targetLoss: 0,
    goalPct: 95,
    rounds: 0,
    steps: 0,
    fails: 0,
    maxTries: MAX_TRIES,
    trainOk: 0,
    trainN: 0,
    testOk: 0,
    testN: 0,
    loss: 0,
    start: { l: 0, tr: 0, te: 0 },
    history: [],
    diverged: false,
    divergences: 0,
    replanted: false,
    cleared: [],
    revives: Math.max(0, Math.floor(buffAmount(run, 'revive'))),
    hints: Math.max(0, Math.floor(buffAmount(run, 'hint'))),
    hintOn: false,
    showAdvice: study > 0,
    moveBoost: Math.min(4, Math.floor(move / 12)),
    sleepBonus: Math.min(5, Math.floor(sleep / 12)) + Math.max(0, Math.floor(buffAmount(run, 'time') / 10)),
    luckPoints: Math.max(0, Math.floor(buffAmount(run, 'luck'))),
    troopIds,
    forfeited: false,
    wilted: false,
    won: false,
  };
  return setupRoom(base, 0, base.luckPoints);
}

// ---------------------------------------------------------------------------
// Reducing
// ---------------------------------------------------------------------------

function clampLr(v: number): number {
  return clamp(round2(Number.isFinite(v) ? v : 0.1), MIN_LR, MAX_LR);
}

/** A new try of the same plot: the gardener starts again from fresh weights (same size). */
function replant(state: WeightGardenState, over: Partial<WeightGardenState>): WeightGardenState {
  const rng = turnRng(state.seed, state.turn);
  const fresh = bestSeedling(() => randomNet(rng, state.net.hidden), state.seeds, 1 + Math.floor(state.luckPoints / 5));
  return withFreshNet({ ...state, ...over, turn: state.turn + 1, rounds: 0, history: [], diverged: false }, fresh);
}

function pushHistory(history: HistoryEntry[], e: HistoryEntry): HistoryEntry[] {
  const next = [...history, e];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}

function reduce(state: WeightGardenState, action: WeightGardenAction): WeightGardenState {
  if (isOver(state)) return state;
  const kind = kindOf(state);
  switch (action.type) {
    case 'forfeit':
      return { ...state, forfeited: true, turn: state.turn + 1 };

    case 'setLearningRate': {
      const lr = clampLr(action.value);
      return lr === state.lr ? state : { ...state, lr, turn: state.turn + 1 };
    }

    case 'setWeight': {
      if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= paramCount(state.net)) return state;
      if (!Number.isFinite(action.value)) return state;
      const value = clamp(round1(action.value), -WEIGHT_LIMIT, WEIGHT_LIMIT);
      const net = setParam(state.net, action.slot, value);
      if (JSON.stringify(net) === JSON.stringify(state.net)) return state;
      return { ...withNet(state, net), turn: state.turn + 1, diverged: false, replanted: false };
    }

    case 'addNeuron': {
      if (kind === 'line' || kind === 'train' || state.net.hidden >= MAX_HIDDEN) return state;
      const rng = turnRng(state.seed, state.turn);
      const net = bestSeedling(() => growNet(state.net, rng), state.seeds, 1 + Math.floor(state.luckPoints / 5));
      return { ...withNet(state, net), turn: state.turn + 1, replanted: false };
    }

    case 'removeNeuron': {
      if (kind === 'line' || kind === 'train' || state.net.hidden === 0) return state;
      const net = shrinkNet(state.net, turnRng(state.seed, state.turn));
      return { ...withNet(state, net), turn: state.turn + 1, replanted: false };
    }

    case 'hint': {
      if (state.hints < 1 || state.hintOn) return state;
      const cfg = roomConfig(kind, state.difficulty);
      return { ...state, hints: state.hints - 1, hintOn: true, lr: kind === 'line' ? state.lr : cfg.goodLr, turn: state.turn + 1 };
    }

    case 'step': {
      if (kind === 'line' || state.rounds >= state.budget) return state;
      const trained = train(state.net, state.seeds, state.lr, state.batch);
      const m = measure(trained, state.seeds);
      const rounds = state.rounds + 1;
      const steps = state.steps + state.batch;
      const flew = !(m.loss < DIVERGE_LOSS);
      const entry: HistoryEntry = { l: flew ? 99 : m.loss, tr: pct(m.trainOk, m.trainN), te: pct(m.testOk, m.testN) };
      let next: WeightGardenState;
      if (flew) {
        // The steps were too big: the weights flew apart. The gardener is replanted (no try is lost).
        const rng = turnRng(state.seed, state.turn);
        const fresh = bestSeedling(() => randomNet(rng, state.net.hidden), state.seeds, 1 + Math.floor(state.luckPoints / 5));
        next = {
          ...withNet(state, fresh),
          turn: state.turn + 1,
          rounds,
          steps,
          history: pushHistory(state.history, entry),
          diverged: true,
          divergences: state.divergences + 1,
          replanted: false,
        };
      } else {
        next = {
          ...state,
          net: trained,
          ...m,
          turn: state.turn + 1,
          rounds,
          steps,
          history: pushHistory(state.history, entry),
          diverged: false,
          replanted: false,
        };
      }
      if (roomPassed(next) || rounds < next.budget) return next;
      return failTry(next);
    }

    case 'nextRoom': {
      if (!roomPassed(state)) return state;
      const done: ClearedRoom = {
        room: state.room,
        test: testPct(state),
        trainPct: trainPct(state),
        loss: Math.round(state.loss * 100),
        rounds: state.rounds,
        budget: state.budget,
        attempt: tryNumber(state),
        hidden: state.net.hidden,
      };
      const cleared = [...state.cleared, done];
      if (state.room + 1 >= state.plan.length) return { ...state, cleared, won: true, turn: state.turn + 1 };
      return setupRoom({ ...state, cleared, turn: state.turn + 1 }, state.room + 1, state.luckPoints);
    }
  }
  return state;
}

/** The try ran out of presses without meeting the goal. */
function failTry(state: WeightGardenState): WeightGardenState {
  const fails = state.fails + 1;
  if (fails < state.maxTries) return replant(state, { fails, replanted: true });
  if (state.revives > 0) {
    // A revive buff: the garden gets one more try.
    return replant(state, { fails, maxTries: state.maxTries + 1, revives: state.revives - 1, replanted: true });
  }
  return { ...state, fails, wilted: true, turn: state.turn + 1 };
}

// ---------------------------------------------------------------------------
// Score and outcome
// ---------------------------------------------------------------------------

/** 0 to 1000: plots settled (600), test accuracy when settled (250), presses to spare (150). */
export function scoreOf(state: WeightGardenState): number {
  const total = state.plan.length;
  const n = state.cleared.length;
  if (n === 0) return 0;
  const roomPart = Math.round((600 * n) / total);
  let testSum = 0;
  for (const c of state.cleared) testSum += c.test;
  const accPart = Math.round((250 * testSum) / (100 * n));
  let effSum = 0;
  let effN = 0;
  for (const c of state.cleared) {
    if (c.budget === 0) continue;
    effN += 1;
    effSum += Math.floor(((c.budget - c.rounds) * 100) / c.budget / c.attempt);
  }
  const effPart = effN === 0 ? 0 : Math.round((150 * effSum) / (100 * effN));
  return clampScore(roomPart + accPart + effPart);
}

function clearedLine(c: ClearedRoom, kind: RoomKind, s: WeightGardenStrings): string {
  return formatText(s.log.room, {
    n: c.room + 1,
    name: s.rooms[kind].title,
    train: c.trainPct,
    test: c.test,
    rounds: c.rounds,
  });
}

function outcomeLog(state: WeightGardenState, s: WeightGardenStrings): string[] {
  const log: string[] = state.cleared.map((c) => clearedLine(c, state.plan[c.room] ?? 'line', s));
  const score = scoreOf(state);
  if (state.divergences > 0) log.push(formatText(s.log.diverged, { n: state.divergences }));
  if (state.wilted) log.push(formatText(s.log.wilted, { n: state.room + 1, name: s.rooms[kindOf(state)].title }));
  const end = state.forfeited ? s.log.endFled : state.won ? s.log.endWon : s.log.endLost;
  log.push(formatText(end, { score, rooms: state.cleared.length, total: state.plan.length }));
  return log;
}

function outcome(state: WeightGardenState): Outcome | null {
  if (!isOver(state)) return null;
  const last = state.cleared[state.cleared.length - 1];
  const kind = last ? (state.plan[last.room] ?? 'line') : 'line';
  const en = strings.en.rooms[kind];
  const fr = strings.fr.rooms[kind];
  return {
    result: state.forfeited ? 'fled' : state.won ? 'won' : 'lost',
    score: scoreOf(state),
    log: outcomeLog(state, strings[state.locale]),
    troopsUsed: state.troopIds.slice(),
    learned: { topic: { en: en.title, fr: fr.title }, note: { en: en.learned, fr: fr.learned } },
    stats: {
      plots: state.cleared.length,
      of: state.plan.length,
      steps: state.steps,
      divergences: state.divergences,
      test: last ? last.test : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// The bot
// ---------------------------------------------------------------------------

/** How many hidden neurons the bot grows for each plot. */
const BOT_HIDDEN: Record<RoomKind, number> = { line: 0, train: 0, xor: 3, noise: 4, boss: 3 };

/**
 * A simple competent gardener: it turns the weights by hand on plot 1, picks a
 * kind learning rate, grows four neurons where a line is not enough, and on the
 * noisy plot shrinks the net as soon as train pulls ahead of test (the sign of
 * memorising). It opens the next plot the moment the goal is met.
 */
function botPlay(state: WeightGardenState, rng: () => number): WeightGardenAction | null {
  if (isOver(state)) return null;
  if (roomPassed(state)) return { type: 'nextRoom' };
  const kind = kindOf(state);
  void rng;

  if (kind === 'line') {
    const t = centroidLine(state.seeds);
    const want = [t.a, t.b, t.c].map((v) => clamp(round1(v), -WEIGHT_LIMIT, WEIGHT_LIMIT));
    for (let slot = 0; slot < 3; slot++) {
      const w = want[slot] ?? 0;
      const have = slot < 2 ? (state.net.ow[slot] ?? 0) : state.net.ob;
      if (have !== w) return { type: 'setWeight', slot, value: w };
    }
    // Already on the centroid line yet short of the goal: nudge the bias and look again.
    return { type: 'setWeight', slot: 2, value: round1(state.net.ob + 0.1) };
  }

  if (state.diverged && state.lr > 0.02) return { type: 'setLearningRate', value: round2(state.lr / 2) };
  const cfg = roomConfig(kind, state.difficulty);
  if (state.rounds === 0 && state.lr !== cfg.goodLr) return { type: 'setLearningRate', value: cfg.goodLr };
  if (kind === 'xor' || kind === 'boss') {
    if (state.net.hidden < BOT_HIDDEN[kind]) return { type: 'addNeuron' };
  }
  if (kind === 'noise' && state.net.hidden > 0) {
    // Memorising: train accuracy pulls ahead of test accuracy. Shrink.
    if (state.rounds >= 2 && trainPct(state) - testPct(state) >= 8) return { type: 'removeNeuron' };
  }
  return { type: 'step' };
}

export function forfeit(): WeightGardenAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<WeightGardenState, WeightGardenAction> = { initial, reduce, outcome, botPlay, forfeit };

