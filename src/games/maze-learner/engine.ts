/**
 * Maze Learner: tabular Q-learning on a small grid, with the player as the
 * teacher. The creature feels only the rewards the player writes (plus a few
 * fixed ones in lesson 3); everything else it works out by trial and error.
 *
 * Exactness: values are integers in thousandths of a point, the learning
 * rate, the discount and epsilon are integers in thousandths, so a seed
 * replays identically on any device. No Math.exp, Math.pow or Math.sin.
 *
 * Randomness: the maze comes from `maze-learner:<seed>:<level>:<difficulty>`
 * (see maze.ts); every training episode draws its own generator with
 * `turnRng(seed, step)`, so the state never holds a generator.
 */
import { turnRng, buffAmount, clampScore, formatText, type GameEngine, type Locale, type Outcome, type Party, type RunContext } from '../contract';
import type { Rng } from '../../game/rng';
import { BONUS, EXIT, FAR, MARK_CHEESE, MARK_NONE, MARK_PUDDLE, NEAR, START, WALL, WET, buildLayout, distances, isTerminal, neighbor } from './maze';
import { strings } from './strings';

export { BONUS, EXIT, FAR, FLOOR, MARK_CHEESE, MARK_NONE, MARK_PUDDLE, NEAR, START, WALL, WET } from './maze';

export const LEVELS = 5;
export const TRIES = 3;
export const SCALE = 1000;
export const MAX_TRAIN = 100;

/** Rewards, in points (the engine multiplies by SCALE). */
export const EXIT_REWARD = 10;
export const BONUS_REWARD = 10;
export const CRUMB_REWARD = 3;
export const PUDDLE_REWARD = -10;
export const NEAR_REWARD = 4;
export const FAR_REWARD = 30;

/** How an episode ended. */
export const RES_TIMEOUT = 0;
export const RES_EXIT = 1;
export const RES_EXIT_WET = 2;
export const RES_NEAR = 3;
export const RES_FAR = 4;
export const RES_LOOP = 5;

/** Feed events: what the Screen announces. */
export const EV_CHEESE = 1;
export const EV_PUDDLE = 2;
export const EV_ERASE = 3;
export const EV_TRAINED = 4;
export const EV_PASSED = 5;
export const EV_TRY_OVER = 6;
export const EV_NO_REWARD = 7;
export const EV_LOCKED = 8;
export const EV_RESET = 9;
export const EV_LEVEL = 10;
export const EV_LOST = 11;
export const EV_REMOVE_CRUMBS = 12;
export const EV_LOOP = 13;
export const EV_STUCK_NEAR = 14;
export const EV_WET = 15;
export const EV_SPARSE = 16;
const FEED_LENGTH = 6;

/** The success window of each lesson: how many recent episodes count and the percentage needed. */
export const WINDOW = [10, 20, 15, 15, 15] as const;
export const NEED = [80, 90, 70, 80, 80] as const;
/** Steps the creature may take in one episode, by lesson. */
const MAX_STEPS = [32, 40, 40, 44, 40] as const;
/** Chance (in thousandths) that a step slips into a random direction, by difficulty. */
const SLIP = [0, 0, 0, 50, 100] as const;
/** Episode budget of one try, by lesson then difficulty. */
export const BUDGET: readonly (readonly number[])[] = [
  [48, 40, 34, 30, 26],
  [110, 90, 62, 50, 46],
  [150, 125, 58, 54, 50],
  [140, 112, 88, 66, 58],
  [64, 50, 38, 28, 22],
];
export const DEFAULT_EPSILON = 150;
export const DEFAULT_DISCOUNT = 800;
/** Episodes at the start of a try in which the `luck` buff nudges the creature toward a goal. */
const LUCK_EPISODES = 3;

export interface FeedEvent {
  k: number;
  a: number;
  b: number;
}

export interface MazeState {
  seed: number;
  /** Counter for the per-episode generators. */
  step: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  level: number;
  width: number;
  height: number;
  /** Tile kinds. */
  cells: number[];
  /** What the player wrote on each tile: 0 nothing, 1 cheese, 2 puddle. */
  marks: number[];
  /** Q-values in thousandths, 4 per tile (up, right, down, left). */
  q: number[];
  /** The companion's table (lesson 3 with a Social vassal), else empty. */
  q2: number[];
  visits: number[];
  /** Tiles of the latest episode, start included. */
  route: number[];
  routeResult: number;
  /** Per-mille. */
  epsilon: number;
  discount: number;
  alpha: number;
  /** Episode results of the current window, oldest first (at most 20). */
  recent: number[];
  episodes: number;
  budget: number;
  triesLeft: number;
  totalEpisodes: number;
  /** Per cleared lesson: episodes used in the winning try, and its budget. */
  spent: number[];
  budgets: number[];
  cleared: number;
  /** Tries that ran out of episodes, over the whole game. */
  failedTries: number;
  passed: boolean;
  lost: boolean;
  forfeited: boolean;
  focus: number;
  hints: number[];
  hintCount: number;
  luck: number;
  timeBonus: number;
  members: number;
  /** Party perks. */
  perkMove: boolean;
  perkStudy: boolean;
  perkSocial: boolean;
  perkSleep: boolean;
  /** How often the companion reached the far cheese, and its episodes. */
  friendFar: number;
  friendEpisodes: number;
  partyIds: string[];
  feed: FeedEvent[];
}

export type MazeAction =
  | { type: 'placeReward'; cell: number }
  | { type: 'placePenalty'; cell: number }
  | { type: 'erase'; cell: number }
  | { type: 'train'; episodes: number }
  | { type: 'setEpsilon'; value: number }
  | { type: 'setDiscount'; value: number }
  | { type: 'reset' }
  | { type: 'nextLevel' }
  | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Integer division that truncates toward zero, for any sign. */
export function idiv(n: number, d: number): number {
  return n >= 0 ? Math.floor(n / d) : -Math.floor(-n / d);
}

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);

type Grid = Pick<MazeState, 'width' | 'height' | 'cells'>;

/** Directions (0 up, 1 right, 2 down, 3 left) that lead onto a walkable tile. */
export function legalDirs(g: Grid, i: number): number[] {
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    const n = neighbor(g.width, g.height, i, d);
    if (n >= 0 && (g.cells[n] ?? WALL) !== WALL) out.push(d);
  }
  return out;
}

/** The best learned value of a tile, over the moves that exist. */
export function valueOf(g: Grid, q: readonly number[], i: number): number {
  let best: number | null = null;
  for (const d of legalDirs(g, i)) {
    const v = q[i * 4 + d] ?? 0;
    if (best === null || v > best) best = v;
  }
  return best ?? 0;
}

/** The arrow the creature would follow from tile `i` (the greedy move), or -1 for a tile with nothing learned there. */
export function policyDir(g: Grid, q: readonly number[], i: number): number {
  const dirs = legalDirs(g, i);
  let best = -1;
  let bestV = 0;
  let tie = false;
  for (const d of dirs) {
    const v = q[i * 4 + d] ?? 0;
    if (best < 0 || v > bestV) {
      best = d;
      bestV = v;
      tie = false;
    } else if (v === bestV) tie = true;
  }
  const allSame = dirs.every((d) => (q[i * 4 + d] ?? 0) === bestV);
  if (best < 0 || (tie && allSame)) return -1;
  return best;
}

function qUpdate(q: number[], i: number, dir: number, rewardPoints: number, j: number, terminal: boolean, alpha: number, gamma: number, g: Grid): void {
  const slot = i * 4 + dir;
  const old = q[slot] ?? 0;
  const next = terminal ? 0 : valueOf(g, q, j);
  const target = rewardPoints * SCALE + idiv(gamma * next, SCALE);
  q[slot] = old + idiv(alpha * (target - old), SCALE);
}

/** Reward written on a tile for entering it (before the once-per-episode crumb rule). */
function tileReward(kind: number, mark: number): number {
  let r = 0;
  if (mark === MARK_PUDDLE) r += PUDDLE_REWARD;
  if (kind === NEAR) r += NEAR_REWARD;
  else if (kind === FAR) r += FAR_REWARD;
  else if (mark === MARK_CHEESE) r += kind === EXIT ? EXIT_REWARD : kind === BONUS ? BONUS_REWARD : CRUMB_REWARD;
  return r;
}

interface Episode {
  route: number[];
  result: number;
}

interface Params {
  alpha: number;
  gamma: number;
  epsilon: number;
  slip: number;
  maxSteps: number;
  luck: number;
  replay: boolean;
}

/** One episode from the start tile; updates `q` and `visits` in place and says how it ended. */
function runEpisode(s: MazeState, q: number[], visits: number[], p: Params, rng: Rng, goalDist: readonly number[], assist: boolean): Episode {
  const start = s.cells.indexOf(START);
  const eaten = zeros(s.cells.length);
  const moves: { i: number; dir: number; r: number; j: number; end: boolean }[] = [];
  const route = [start];
  let i = start;
  let wet = false;
  let bonusHits = 0;
  let result = RES_TIMEOUT;
  for (let step = 0; step < p.maxSteps; step++) {
    const u1 = rng();
    const u2 = rng();
    const u3 = rng();
    const u4 = rng();
    const legal = legalDirs(s, i);
    if (legal.length === 0) break;
    const pickRandom = () => legal[Math.floor(u2 * legal.length)] ?? 0;
    let dir: number;
    if (assist && u3 * 100 < p.luck) {
      let best = legal[0] ?? 0;
      let bestDist = 1e9;
      for (const d of legal) {
        const dd = goalDist[neighbor(s.width, s.height, i, d)] ?? -1;
        if (dd >= 0 && dd < bestDist) {
          bestDist = dd;
          best = d;
        }
      }
      dir = best;
    } else if (u1 * 1000 < p.epsilon) {
      dir = pickRandom();
    } else {
      let bestV = q[i * 4 + (legal[0] ?? 0)] ?? 0;
      let ties: number[] = [];
      for (const d of legal) {
        const v = q[i * 4 + d] ?? 0;
        if (v > bestV) {
          bestV = v;
          ties = [d];
        } else if (v === bestV) ties.push(d);
      }
      if (ties.length === 0) ties = legal.filter((d) => (q[i * 4 + d] ?? 0) === bestV);
      dir = ties[Math.floor(u2 * ties.length)] ?? 0;
    }
    if (p.slip > 0 && u4 * 1000 < p.slip) dir = pickRandom();
    const dest = neighbor(s.width, s.height, i, dir);
    const kind = s.cells[dest] ?? WALL;
    const mark = s.marks[dest] ?? 0;
    let r = tileReward(kind, mark);
    if (kind !== EXIT && kind !== BONUS && kind !== NEAR && kind !== FAR && mark === MARK_CHEESE) {
      if (eaten[dest]) r -= CRUMB_REWARD;
      eaten[dest] = 1;
    }
    if (kind === WET) wet = true;
    if (kind === BONUS && mark === MARK_CHEESE) bonusHits += 1;
    const end = isTerminal(kind);
    qUpdate(q, i, dir, r, dest, end, p.alpha, p.gamma, s);
    moves.push({ i, dir, r, j: dest, end });
    visits[dest] = (visits[dest] ?? 0) + 1;
    route.push(dest);
    i = dest;
    if (end) {
      result = kind === FAR ? RES_FAR : kind === NEAR ? RES_NEAR : wet ? RES_EXIT_WET : RES_EXIT;
      break;
    }
  }
  if (result === RES_TIMEOUT && bonusHits >= 3) result = RES_LOOP;
  if (p.replay) {
    for (let k = moves.length - 1; k >= 0; k--) {
      const m = moves[k]!;
      qUpdate(q, m.i, m.dir, m.r, m.j, m.end, p.alpha, p.gamma, s);
    }
  }
  return { route, result };
}

// ---------------------------------------------------------------------------
// Lesson rules
// ---------------------------------------------------------------------------

/** Does this episode result count as a success for the lesson? */
export function isSuccess(level: number, result: number): boolean {
  if (level === 2) return result === RES_EXIT;
  if (level === 3) return result === RES_FAR;
  if (level === 5) return result === RES_EXIT;
  return result === RES_EXIT || result === RES_EXIT_WET;
}

/** Success rate, in percent, over the lesson's window (0 until the window is full). */
export function windowRate(s: Pick<MazeState, 'level' | 'recent'>): number {
  const w = WINDOW[s.level - 1] ?? 10;
  if (s.recent.length < w) return 0;
  const slice = s.recent.slice(-w);
  return idiv(slice.filter((r) => isSuccess(s.level, r)).length * 100, w);
}

/** Cheese on ordinary tiles, the "breadcrumbs". */
export function crumbCount(s: Pick<MazeState, 'cells' | 'marks'>): number {
  let n = 0;
  for (let i = 0; i < s.cells.length; i++) {
    const kind = s.cells[i] ?? WALL;
    if ((s.marks[i] ?? 0) === MARK_CHEESE && !isTerminal(kind) && kind !== BONUS) n += 1;
  }
  return n;
}

/** Is there any reward at all for the creature to find? */
export function hasReward(s: Pick<MazeState, 'cells' | 'marks'>): boolean {
  for (let i = 0; i < s.cells.length; i++) {
    const kind = s.cells[i] ?? WALL;
    if (kind === NEAR || kind === FAR) return true;
    if ((s.marks[i] ?? 0) === MARK_CHEESE) return true;
  }
  return false;
}

function levelPassed(s: MazeState): boolean {
  if (windowRate(s) < (NEED[s.level - 1] ?? 80)) return false;
  if (s.level === 4) return crumbCount(s) === 0;
  return true;
}

export function budgetFor(level: number, difficulty: number, members: number, timeBonus: number): number {
  const row = BUDGET[level - 1] ?? BUDGET[0]!;
  return (row[difficulty - 1] ?? row[0] ?? 60) + 2 * members + timeBonus;
}

function push(feed: readonly FeedEvent[], ev: FeedEvent): FeedEvent[] {
  return [...feed, ev].slice(-FEED_LENGTH);
}

function loadLevel(s: MazeState, level: number): MazeState {
  const layout = buildLayout(s.seed, level, s.difficulty);
  const n = layout.cells.length;
  const budget = budgetFor(level, s.difficulty, s.members, s.timeBonus);
  return {
    ...s,
    level,
    width: layout.width,
    height: layout.height,
    cells: layout.cells,
    marks: layout.marks,
    q: zeros(n * 4),
    q2: s.perkSocial && level === 3 ? zeros(n * 4) : [],
    visits: zeros(n),
    route: [layout.cells.indexOf(START)],
    routeResult: RES_TIMEOUT,
    epsilon: DEFAULT_EPSILON,
    recent: [],
    episodes: 0,
    budget,
    triesLeft: TRIES,
    passed: false,
    focus: layout.focus,
    hints: layout.hints.slice(0, Math.max(0, s.hintCount)),
    friendFar: 0,
    friendEpisodes: 0,
    feed: push(s.feed, { k: EV_LEVEL, a: level, b: budget }),
  };
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): MazeState {
  let power = 0;
  let move = false;
  let study = false;
  let social = false;
  let sleep = false;
  for (const m of party.members) {
    power += m.power;
    if (m.habit === 'move') move = true;
    if (m.habit === 'study') study = true;
    if (m.habit === 'social') social = true;
    if (m.habit === 'sleep') sleep = true;
  }
  const n = party.members.length;
  const avg = n > 0 ? idiv(power, n) : 8;
  const base: MazeState = {
    seed: seed >>> 0,
    step: 0,
    locale,
    difficulty: run.difficulty,
    level: 1,
    width: 1,
    height: 1,
    cells: [START],
    marks: [0],
    q: [0, 0, 0, 0],
    q2: [],
    visits: [0],
    route: [0],
    routeResult: RES_TIMEOUT,
    epsilon: DEFAULT_EPSILON,
    discount: DEFAULT_DISCOUNT,
    alpha: clamp(320 + 2 * avg + (move ? 30 : 0), 250, 600),
    recent: [],
    episodes: 0,
    budget: 0,
    triesLeft: TRIES,
    totalEpisodes: 0,
    spent: [],
    budgets: [],
    cleared: 0,
    failedTries: 0,
    passed: false,
    lost: false,
    forfeited: false,
    focus: 0,
    hints: [],
    hintCount: Math.max(0, Math.trunc(buffAmount(run, 'hint'))),
    luck: clamp(Math.trunc(buffAmount(run, 'luck')), 0, 100),
    timeBonus: Math.max(0, Math.floor(buffAmount(run, 'time') / 2)),
    members: n,
    perkMove: move,
    perkStudy: study,
    perkSocial: social,
    perkSleep: sleep,
    friendFar: 0,
    friendEpisodes: 0,
    partyIds: party.members.map((m) => m.id),
    feed: [],
  };
  return loadLevel(base, 1);
}

/** The game opened directly at a lesson (tests, docs and tuning use it; the Arena always starts at lesson 1). */
export function initialAt(seed: number, party: Party, run: RunContext, locale: Locale, level: number): MazeState {
  const first = initial(seed, party, run, locale);
  return level <= 1 ? first : loadLevel({ ...first, cleared: level - 1 }, clamp(level, 1, LEVELS));
}

export function isOver(s: MazeState): boolean {
  return s.forfeited || s.lost || (s.passed && s.level >= LEVELS);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function mark(s: MazeState, cell: number, value: number): MazeState {
  if (s.passed || !Number.isInteger(cell) || cell < 0 || cell >= s.cells.length) return s;
  const kind = s.cells[cell] ?? WALL;
  if (kind === WALL) return s;
  if (kind === NEAR || kind === FAR) return { ...s, feed: push(s.feed, { k: EV_LOCKED, a: cell, b: 0 }) };
  if ((s.marks[cell] ?? 0) === value) return s;
  const marks = s.marks.slice();
  marks[cell] = value;
  const k = value === MARK_CHEESE ? EV_CHEESE : value === MARK_PUDDLE ? EV_PUDDLE : EV_ERASE;
  // The rules changed, so the scoreboard starts again.
  return { ...s, marks, recent: [], feed: push(s.feed, { k, a: cell, b: 0 }) };
}

function goalDistances(s: MazeState): number[] {
  // Distance from every tile to the nearest goal tile; a multi-source walk over the walkable tiles.
  const out = s.cells.map(() => -1);
  const queue: number[] = [];
  for (let i = 0; i < s.cells.length; i++) {
    const kind = s.cells[i] ?? WALL;
    if (kind === EXIT || kind === FAR) {
      out[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    for (let d = 0; d < 4; d++) {
      const n = neighbor(s.width, s.height, i, d);
      if (n < 0 || out[n] !== -1) continue;
      const kind = s.cells[n] ?? WALL;
      if (kind === WALL || isTerminal(kind)) continue;
      out[n] = (out[i] ?? 0) + 1;
      queue.push(n);
    }
  }
  return out;
}

function train(s: MazeState, episodes: number): MazeState {
  if (s.passed || !Number.isFinite(episodes)) return s;
  if (!hasReward(s)) return { ...s, feed: push(s.feed, { k: EV_NO_REWARD, a: 0, b: 0 }) };
  const n = clamp(Math.trunc(episodes), 1, MAX_TRAIN);
  const q = s.q.slice();
  const q2 = s.q2.slice();
  const visits = s.visits.slice();
  const goalDist = s.luck > 0 ? goalDistances(s) : [];
  const params: Params = {
    alpha: s.alpha,
    gamma: s.discount,
    epsilon: s.epsilon,
    slip: SLIP[s.difficulty - 1] ?? 0,
    maxSteps: MAX_STEPS[s.level - 1] ?? 40,
    luck: s.luck,
    replay: s.perkSleep,
  };
  const friendParams: Params = { ...params, epsilon: 600, luck: 0, replay: false };
  let recent = s.recent;
  let step = s.step;
  let episodesDone = 0;
  let last: Episode = { route: s.route, result: s.routeResult };
  let friendFar = s.friendFar;
  let friendEpisodes = s.friendEpisodes;
  let state: MazeState = s;
  let triesLeft = s.triesLeft;
  let used = s.episodes;
  let totalEpisodes = s.totalEpisodes;
  let tryOver = false;
  let passedNow = false;
  for (let e = 0; e < n; e++) {
    const rng = turnRng(s.seed, step);
    step += 1;
    last = runEpisode(s, q, visits, params, rng, goalDist, used < LUCK_EPISODES);
    if (q2.length > 0) {
      const friend = runEpisode(s, q2, zeros(s.cells.length), friendParams, turnRng(s.seed, step), goalDist, false);
      step += 1;
      friendEpisodes += 1;
      if (friend.result === RES_FAR) friendFar += 1;
    }
    used += 1;
    totalEpisodes += 1;
    episodesDone += 1;
    recent = [...recent, last.result].slice(-20);
    state = { ...state, recent, episodes: used };
    if (levelPassed(state)) {
      passedNow = true;
      break;
    }
    if (used >= s.budget) {
      tryOver = true;
      break;
    }
  }
  let feed = push(s.feed, { k: EV_TRAINED, a: episodesDone, b: windowRate(state) });
  // One piece of coaching at most, so the feed teaches without nagging.
  if (!passedNow && !tryOver) {
    const w = WINDOW[s.level - 1] ?? 10;
    const tail = recent.slice(-Math.min(w, 8));
    if (s.level === 4 && windowRate(state) >= (NEED[3] ?? 80) && crumbCount(state) > 0) feed = push(feed, { k: EV_REMOVE_CRUMBS, a: 0, b: 0 });
    else if (s.level === 5 && last.result === RES_LOOP && recent.filter((r) => r === RES_LOOP).length >= 2) feed = push(feed, { k: EV_LOOP, a: 0, b: 0 });
    else if (s.level === 3 && tail.length >= 8 && tail.every((r) => r === RES_NEAR)) feed = push(feed, { k: EV_STUCK_NEAR, a: 0, b: 0 });
    else if (s.level === 2 && last.result === RES_EXIT_WET) feed = push(feed, { k: EV_WET, a: 0, b: 0 });
    else if (s.level === 4 && used >= 12 && recent.length >= 12 && recent.every((r) => r === RES_TIMEOUT) && crumbCount(state) === 0) feed = push(feed, { k: EV_SPARSE, a: 0, b: 0 });
  }
  const next: MazeState = {
    ...s,
    q,
    q2,
    visits,
    route: last.route,
    routeResult: last.result,
    recent,
    step,
    episodes: used,
    totalEpisodes,
    friendFar,
    friendEpisodes,
    feed,
  };
  if (passedNow) {
    return {
      ...next,
      passed: true,
      cleared: Math.max(s.cleared, s.level),
      spent: [...s.spent, used],
      budgets: [...s.budgets, s.budget],
      feed: push(next.feed, { k: EV_PASSED, a: s.level, b: used }),
    };
  }
  if (tryOver) {
    triesLeft -= 1;
    if (triesLeft <= 0) return { ...next, triesLeft: 0, failedTries: s.failedTries + 1, lost: true, feed: push(next.feed, { k: EV_LOST, a: s.level, b: 0 }) };
    const n4 = s.cells.length * 4;
    return {
      ...next,
      q: zeros(n4),
      q2: s.q2.length > 0 ? zeros(n4) : [],
      visits: zeros(s.cells.length),
      recent: [],
      episodes: 0,
      triesLeft,
      failedTries: s.failedTries + 1,
      friendFar: 0,
      friendEpisodes: 0,
      feed: push(next.feed, { k: EV_TRY_OVER, a: triesLeft, b: s.budget }),
    };
  }
  return next;
}

function reduce(s: MazeState, a: MazeAction): MazeState {
  if (isOver(s)) return s;
  switch (a.type) {
    case 'placeReward':
      return mark(s, a.cell, MARK_CHEESE);
    case 'placePenalty':
      return mark(s, a.cell, MARK_PUDDLE);
    case 'erase':
      return mark(s, a.cell, MARK_NONE);
    case 'train':
      return train(s, a.episodes);
    case 'setEpsilon': {
      if (!Number.isFinite(a.value)) return s;
      const value = clamp(Math.trunc(a.value), 0, 1000);
      return value === s.epsilon ? s : { ...s, epsilon: value };
    }
    case 'setDiscount': {
      if (!Number.isFinite(a.value)) return s;
      const value = clamp(Math.trunc(a.value), 0, 990);
      return value === s.discount ? s : { ...s, discount: value };
    }
    case 'reset': {
      if (s.passed) return s;
      const layout = buildLayout(s.seed, s.level, s.difficulty);
      const n4 = s.cells.length * 4;
      return {
        ...s,
        marks: layout.marks,
        q: zeros(n4),
        q2: s.q2.length > 0 ? zeros(n4) : [],
        visits: zeros(s.cells.length),
        route: [s.cells.indexOf(START)],
        routeResult: RES_TIMEOUT,
        recent: [],
        friendFar: 0,
        friendEpisodes: 0,
        feed: push(s.feed, { k: EV_RESET, a: 0, b: 0 }),
      };
    }
    case 'nextLevel':
      return s.passed && s.level < LEVELS ? loadLevel(s, s.level + 1) : s;
    case 'forfeit':
      return { ...s, forfeited: true };
    default:
      return s;
  }
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export function outcomeLog(s: MazeState): string[] {
  const t = strings[s.locale];
  const lines = [t.log.start];
  for (let k = 0; k < s.spent.length; k++) lines.push(formatText(t.log.lesson, { n: k + 1, title: t.level.title[k] ?? '', episodes: s.spent[k] ?? 0, budget: s.budgets[k] ?? 0 }));
  if (s.forfeited) lines.push(formatText(t.log.fled, { n: s.level }));
  else if (s.lost) lines.push(formatText(t.log.lost, { n: s.level }));
  else lines.push(t.log.won);
  return lines;
}

function outcome(s: MazeState): Outcome | null {
  if (!isOver(s)) return null;
  const result = s.forfeited ? 'fled' : s.lost ? 'lost' : 'won';
  let raw = 0;
  for (let k = 0; k < s.spent.length; k++) {
    const budget = s.budgets[k] ?? 1;
    raw += 120 + idiv(60 * Math.max(0, budget - (s.spent[k] ?? 0)), budget);
  }
  raw += result === 'won' ? 100 : idiv(windowRate(s), 5);
  raw -= 10 * s.failedTries;
  const at = clamp(s.cleared, 0, LEVELS);
  const en = strings.en.level;
  const fr = strings.fr.level;
  const out: Outcome = {
    result,
    score: clampScore(raw),
    log: outcomeLog(s),
    troopsUsed: s.partyIds.slice(),
    stats: { lessons: s.cleared, episodes: s.totalEpisodes, success: windowRate(s) },
  };
  // What the player learned: the last lesson they passed (nothing to say before the first).
  if (at >= 1) {
    out.learned = {
      topic: { en: en.topic[at - 1] ?? '', fr: fr.topic[at - 1] ?? '' },
      note: { en: en.learned[at - 1] ?? '', fr: fr.learned[at - 1] ?? '' },
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The bot: a sensible teacher
// ---------------------------------------------------------------------------

/** The rewards a sensible teacher writes for the lesson, tile by tile. */
export function wantedMarks(s: MazeState): number[] {
  const want = s.cells.map(() => MARK_NONE);
  for (let i = 0; i < s.cells.length; i++) {
    const kind = s.cells[i] ?? WALL;
    if (kind === EXIT) want[i] = MARK_CHEESE;
    if (s.level === 2 && kind === WET) want[i] = MARK_PUDDLE;
    if (s.level === 4 && kind === EXIT) want[i] = MARK_CHEESE;
  }
  if (s.level === 4) {
    // A trail of breadcrumbs for the first part of the try, then the creature has to cope without them.
    const wantCrumbs = s.episodes < 45;
    if (wantCrumbs) {
      const start = s.cells.indexOf(START);
      const exit = s.cells.indexOf(EXIT);
      const dist = distances(s.cells, s.width, s.height, exit);
      const from = dist[start] ?? 0;
      for (let i = 0; i < s.cells.length; i++) {
        const d = dist[i] ?? -1;
        if (d > 0 && d < from && d > 0 && (s.cells[i] ?? WALL) !== START) want[i] = MARK_CHEESE;
      }
    }
  }
  return want;
}

function botEpsilon(s: MazeState): number {
  if (s.level === 3) {
    // Explore widely until the far cheese has been found a few times, then settle.
    const far = s.recent.filter((r) => r === RES_FAR).length;
    return far >= 5 ? 80 : 700;
  }
  if (s.level === 4) return s.episodes < 45 ? 400 : 80;
  return s.episodes < 25 ? 250 : 60;
}

function botPlay(s: MazeState, _rng: () => number): MazeAction | null {
  if (isOver(s)) return null;
  if (s.passed) return { type: 'nextLevel' };
  const want = wantedMarks(s);
  for (let i = 0; i < want.length; i++) {
    const w = want[i] ?? 0;
    if (w === (s.marks[i] ?? 0) || (s.cells[i] ?? WALL) === NEAR || (s.cells[i] ?? WALL) === FAR) continue;
    if (s.level === 5 && (s.cells[i] ?? WALL) === BONUS) return { type: 'erase', cell: i };
    return w === MARK_CHEESE ? { type: 'placeReward', cell: i } : w === MARK_PUDDLE ? { type: 'placePenalty', cell: i } : { type: 'erase', cell: i };
  }
  const eps = botEpsilon(s);
  if (s.epsilon !== eps) return { type: 'setEpsilon', value: eps };
  return { type: 'train', episodes: Math.max(1, Math.min(10, s.budget - s.episodes)) };
}

const forfeit = (): MazeAction => ({ type: 'forfeit' });

export const engine: GameEngine<MazeState, MazeAction> = { initial, reduce, outcome, botPlay, forfeit };
