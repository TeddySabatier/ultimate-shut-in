/**
 * Haven Rush: a lane-runner with maths gates. Pure, seeded, fixed 50 ms ticks.
 *
 * The squad runs forward; the player steers left or right into a gate pair.
 * Enemies and walls cost members on contact; shooting peels them first. A
 * boss at the end must be shot down before it reaches the squad. Levels are
 * generated from the seed and proven winnable by enumerating every gate path.
 */
import { fnv1a, mulberry32, rngInt, type Rng } from '../../game/rng';
import {
  FIXED_DT_MS,
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
import { strings, type HavenRushStrings } from './strings';

export const LANE_W = 200;
export const CENTER = 100;
export const LEFT_X = 48;
export const RIGHT_X = 152;
export const SPEED = 6;
export const SPEED_SLOW = 3;
export const STEER_BASE = 10;
export const STEER_MOVE = 8;
export const RANGE = 90;
export const SHOT_EVERY = 5;
export const SHOT_BOOST = 2;
export const BOOST_TICKS = 100;
export const FIRST_GATE_Y = 180;
export const GATE_GAP = 220;
export const BOSS_DIST = 360;
export const BOSS_SPEED = 4;
export const MAX_TICKS = 2400;
export const MAX_DRAW = 40;
export const REVIVE_SQUAD = 5;
export const SHIELD_EAT = 5;
export const START_BASE = 5;
export const POWER_PER_MEMBER = 40;
export const PROBE_HP = 1_000_000;

/** Fairness margin percent by difficulty 1..5: 40, 32, 23, 14, 5. */
export function marginPct(difficulty: number): number {
  return 40 - Math.floor((35 * (difficulty - 1)) / 4);
}

/** Bot error percent by difficulty 1..5. Tuned so difficulty 3 lands near 60% wins. */
export const BOT_ERROR_PCT = [0, 5, 10, 14, 20, 28] as const;

/**
 * Gate op weights used by the generator (documented in docs/games/gate-runner.md).
 * Order: x2, +10, -5, ÷2, x3, +25.
 */
export const GATE_WEIGHTS = [28, 24, 12, 12, 12, 12] as const;

export type OpKind = 'mul' | 'add' | 'sub' | 'div';
export interface GateOp {
  kind: OpKind;
  n: number;
}
export interface Gate {
  y: number;
  left: GateOp;
  right: GateOp;
  applied: boolean;
}
export interface Enemy {
  id: number;
  y: number;
  /** 0 left, 1 right, 2 center. */
  lane: 0 | 1 | 2;
  hp: number;
  kind: 'crowd' | 'wall';
}
export interface Pickup {
  id: number;
  y: number;
  lane: 0 | 1 | 2;
  kind: 'members' | 'firerate';
  n: number;
  taken: boolean;
}
export interface Story {
  t: 'gate' | 'hit' | 'pick' | 'revive';
  op: string;
  n: number;
  before: number;
  after: number;
}

export type Phase = 'run' | 'boss' | 'won' | 'lost' | 'fled';

export interface GateRunnerState {
  seed: number;
  step: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  squad: number;
  x: number;
  y: number;
  steer: -1 | 0 | 1;
  slowLane: boolean;
  shield: number;
  reviveOn: boolean;
  fireRateTicks: number;
  hintLeft: number;
  timeSlowTicks: number;
  steerRate: number;
  attackPct: number;
  luckPct: number;
  study: boolean;
  shotCd: number;
  flash: number;
  flashTicks: number;
  pickupsTaken: number;
  troopIds: string[];
  gates: Gate[];
  enemies: Enemy[];
  pickups: Pickup[];
  bossHp: number;
  bossMaxHp: number;
  bossY: number;
  bossLine: number;
  phase: Phase;
  events: Story[];
  /** Best L/R path from the start, 0 = left. Used by the bot and hints. */
  bestPath: number[];
}

export type GateRunnerAction =
  | { type: 'tick' }
  | { type: 'steer'; dir: -1 | 0 | 1 }
  | { type: 'slow'; on: boolean }
  | { type: 'forfeit' };

const OPS: GateOp[] = [
  { kind: 'mul', n: 2 },
  { kind: 'add', n: 10 },
  { kind: 'sub', n: 5 },
  { kind: 'div', n: 2 },
  { kind: 'mul', n: 3 },
  { kind: 'add', n: 25 },
];

export function formatOp(op: GateOp): string {
  if (op.kind === 'mul') return `x${op.n}`;
  if (op.kind === 'add') return `+${op.n}`;
  if (op.kind === 'sub') return `-${op.n}`;
  return `÷${op.n}`;
}

/**
 * Apply a gate. Divide rounds down and stays at least 1 while anyone remains.
 * Subtract is the only op that can drop the squad to 0.
 */
export function applyOp(squad: number, op: GateOp): number {
  if (squad <= 0) return 0;
  if (op.kind === 'mul') return squad * op.n;
  if (op.kind === 'add') return squad + op.n;
  if (op.kind === 'sub') {
    const v = squad - op.n;
    return v < 1 ? 0 : v;
  }
  return Math.max(1, Math.floor(squad / op.n));
}

export function shotDamage(squad: number, attackPct: number): number {
  if (squad <= 0) return 0;
  const base = Math.max(1, Math.floor(squad / 4));
  return Math.max(1, Math.floor((base * (100 + attackPct)) / 100));
}

export function isOver(state: GateRunnerState): boolean {
  return state.phase === 'won' || state.phase === 'lost' || state.phase === 'fled';
}

export function laneOf(x: number): 0 | 1 {
  return x < CENTER ? 0 : 1;
}

export function countApplied(state: GateRunnerState): number {
  let n = 0;
  for (const g of state.gates) if (g.applied) n += 1;
  return n;
}

export function nextGate(state: GateRunnerState): Gate | null {
  for (const g of state.gates) if (!g.applied) return g;
  return null;
}

export function speedOf(state: GateRunnerState): number {
  return state.slowLane || state.timeSlowTicks > 0 ? SPEED_SLOW : SPEED;
}

function shotInterval(state: GateRunnerState): number {
  return state.fireRateTicks > 0 ? SHOT_BOOST : SHOT_EVERY;
}

function hasHabit(party: Party, habit: string): boolean {
  return party.members.some((m) => m.habit === habit);
}

function habitPower(party: Party, habit: string): number {
  let best = 0;
  for (const m of party.members) if (m.habit === habit && m.power > best) best = m.power;
  return best;
}

export function startSquadOf(party: Party, run: RunContext): number {
  const powerSum = party.members.reduce((a, m) => a + m.power, 0);
  const base = START_BASE + party.members.length + Math.floor(powerSum / POWER_PER_MEMBER);
  const defense = buffAmount(run, 'defense');
  return Math.max(1, Math.floor((base * (100 + defense)) / 100));
}

function pickOp(rng: Rng): GateOp {
  const total = GATE_WEIGHTS.reduce((a, w) => a + w, 0);
  let r = rngInt(rng, total);
  for (let i = 0; i < OPS.length; i++) {
    r -= GATE_WEIGHTS[i] ?? 0;
    if (r < 0) return OPS[i]!;
  }
  return OPS[0]!;
}

function expectedShots(squad: number, attackPct: number): number {
  const ticks = Math.floor(RANGE / SPEED);
  const shots = Math.max(1, Math.floor(ticks / SHOT_EVERY));
  return shots * shotDamage(squad, attackPct);
}

function pairCount(d: number): number {
  return d >= 3 ? 5 : 4;
}

function setSquad(s: GateRunnerState, squad: number): GateRunnerState {
  if (squad >= 1) return { ...s, squad };
  if (s.reviveOn) {
    const events: Story[] = [...s.events, { t: 'revive', op: 'revive', n: REVIVE_SQUAD, before: 0, after: REVIVE_SQUAD }];
    return { ...s, squad: REVIVE_SQUAD, reviveOn: false, events };
  }
  return { ...s, squad: 0, phase: 'lost' };
}

function applyGates(s: GateRunnerState): GateRunnerState {
  const side = laneOf(s.x);
  let next = s;
  for (let i = 0; i < next.gates.length; i++) {
    const g = next.gates[i]!;
    if (g.applied || next.y < g.y) continue;
    const op = side === 0 ? g.left : g.right;
    const before = next.squad;
    const after = applyOp(before, op);
    const gates = next.gates.map((x, j) => (j === i ? { ...x, applied: true } : x));
    const hintLeft = next.hintLeft > 0 ? next.hintLeft - 1 : 0;
    const events: Story[] = [...next.events, { t: 'gate', op: formatOp(op), n: op.n, before, after }];
    next = setSquad({ ...next, gates, hintLeft, events, flash: after - before, flashTicks: 12 }, after);
    if (isOver(next)) return next;
  }
  return next;
}

function shoot(s: GateRunnerState): GateRunnerState {
  if (s.shotCd > 0 || s.squad <= 0) return s;
  const dmg = shotDamage(s.squad, s.attackPct);
  if (dmg <= 0) return s;
  if (s.phase === 'boss') {
    if (s.bossY - s.y > RANGE) return s;
    const bossHp = Math.max(0, s.bossHp - dmg);
    return { ...s, bossHp, shotCd: shotInterval(s), phase: bossHp <= 0 ? 'won' : s.phase };
  }
  const side = laneOf(s.x);
  let bestI = -1;
  let bestDy = RANGE + 1;
  for (let i = 0; i < s.enemies.length; i++) {
    const e = s.enemies[i]!;
    if (e.hp <= 0) continue;
    if (e.lane !== 2 && e.lane !== side) continue;
    const dy = e.y - s.y;
    if (dy < 0 || dy > RANGE) continue;
    if (dy < bestDy) {
      bestDy = dy;
      bestI = i;
    }
  }
  if (bestI < 0) return s;
  const hp = s.enemies[bestI]!.hp - dmg;
  const enemies = s.enemies.map((e, i) => (i === bestI ? { ...e, hp } : e)).filter((e) => e.hp > 0);
  return { ...s, enemies, shotCd: shotInterval(s) };
}

function collectPickups(s: GateRunnerState): GateRunnerState {
  const side = laneOf(s.x);
  let squad = s.squad;
  let fireRateTicks = s.fireRateTicks;
  let pickupsTaken = s.pickupsTaken;
  let events = s.events;
  const pickups: Pickup[] = [];
  for (const p of s.pickups) {
    if (p.taken || p.y > s.y || (p.lane !== 2 && p.lane !== side)) {
      pickups.push(p);
      continue;
    }
    if (p.kind === 'members') squad += p.n;
    else fireRateTicks = BOOST_TICKS;
    pickupsTaken += 1;
    events = [...events, { t: 'pick', op: p.kind, n: p.n, before: s.squad, after: squad }];
  }
  return { ...s, squad, fireRateTicks, pickupsTaken, events, pickups };
}

function takeHits(s: GateRunnerState, amount: number, kind: string): GateRunnerState {
  let rest = amount;
  let shield = s.shield;
  if (shield > 0 && rest > 0) {
    const used = rest < shield ? rest : shield;
    shield -= used;
    rest -= used;
  }
  const events: Story[] = [...s.events, { t: 'hit', op: kind, n: amount, before: s.squad, after: s.squad - rest }];
  const next = setSquad({ ...s, shield, events }, s.squad - rest);
  return next;
}

function contacts(s: GateRunnerState): GateRunnerState {
  const side = laneOf(s.x);
  let next = s;
  const remain: Enemy[] = [];
  for (const e of s.enemies) {
    const hits = e.y <= next.y && (e.lane === 2 || e.lane === side);
    if (!hits) {
      remain.push(e);
      continue;
    }
    next = takeHits(next, Math.max(0, e.hp), e.kind);
    if (isOver(next)) {
      const leftover = s.enemies.filter((rest) => rest.id !== e.id && (rest.y > s.y || (rest.lane !== 2 && rest.lane !== side)));
      return { ...next, enemies: leftover };
    }
  }
  return { ...next, enemies: remain };
}

/** One 50 ms tick. Solver and live play share this. */
export function step(s: GateRunnerState): GateRunnerState {
  if (isOver(s)) return s;
  let x = s.x + s.steer * s.steerRate;
  if (x < 0) x = 0;
  if (x > LANE_W) x = LANE_W;
  let y = s.y;
  let bossY = s.bossY;
  let phase: Phase = s.phase;
  if (phase === 'run') {
    y += speedOf(s);
    if (y >= s.bossLine) {
      y = s.bossLine;
      phase = 'boss';
    }
  } else if (phase === 'boss') {
    bossY -= BOSS_SPEED;
  }
  let next: GateRunnerState = {
    ...s,
    x,
    y,
    bossY,
    phase,
    step: s.step + 1,
    timeSlowTicks: s.timeSlowTicks > 0 ? s.timeSlowTicks - 1 : 0,
    fireRateTicks: s.fireRateTicks > 0 ? s.fireRateTicks - 1 : 0,
    flashTicks: s.flashTicks > 0 ? s.flashTicks - 1 : 0,
    shotCd: s.shotCd > 0 ? s.shotCd - 1 : 0,
  };
  next = applyGates(next);
  if (isOver(next)) return next;
  next = shoot(next);
  if (isOver(next)) return next;
  next = collectPickups(next);
  next = contacts(next);
  if (isOver(next)) return next;
  if (next.phase === 'boss') {
    if (next.bossHp <= 0) return { ...next, phase: 'won' };
    if (next.bossY <= next.y) return { ...next, phase: 'lost' };
  }
  if (next.step >= MAX_TICKS) return { ...next, phase: 'lost' };
  return next;
}

function snap(s: GateRunnerState, side: 0 | 1): GateRunnerState {
  const x = side === 0 ? LEFT_X : RIGHT_X;
  return s.x === x && s.steer === 0 ? s : { ...s, x, steer: 0 };
}

export function playUntilBoss(start: GateRunnerState, path: number[]): GateRunnerState {
  let s = start;
  let gi = 0;
  let guard = 0;
  while (s.phase === 'run' && guard++ < MAX_TICKS) {
    if (gi < path.length) s = snap(s, path[gi] === 0 ? 0 : 1);
    const before = countApplied(s);
    s = step(s);
    if (countApplied(s) > before) gi += 1;
  }
  return s;
}

export function greedyPath(start: GateRunnerState): number[] {
  const path: number[] = [];
  let s = start;
  let guard = 0;
  while (s.phase === 'run' && path.length < s.gates.length && guard++ < MAX_TICKS) {
    const g = nextGate(s);
    if (!g) break;
    const left = applyOp(s.squad, g.left);
    const right = applyOp(s.squad, g.right);
    const choice: 0 | 1 = left >= right ? 0 : 1;
    path.push(choice);
    const before = countApplied(s);
    while (countApplied(s) === before && s.phase === 'run' && guard++ < MAX_TICKS) {
      s = step(snap(s, choice));
    }
  }
  return path;
}

export function probeDamage(atBoss: GateRunnerState): number {
  if (atBoss.squad <= 0 || atBoss.phase === 'lost' || atBoss.phase === 'fled') return 0;
  let s: GateRunnerState = { ...atBoss, bossHp: PROBE_HP, bossMaxHp: PROBE_HP, phase: 'boss' };
  let guard = 0;
  while (s.phase === 'boss' && guard++ < MAX_TICKS) s = step(s);
  return PROBE_HP - Math.max(0, s.bossHp);
}

export interface LevelReport {
  bestPath: number[];
  greedyPath: number[];
  bestSquad: number;
  greedySquad: number;
  bestDealt: number;
  greedyDealt: number;
  bossHp: number;
  margin: number;
  winnable: boolean;
  greedyOptimal: boolean;
}

function pathFromMask(mask: number, n: number): number[] {
  const path: number[] = [];
  for (let i = 0; i < n; i++) path.push((mask >> i) & 1);
  return path;
}

export function analyzeLevel(state: GateRunnerState): LevelReport {
  const n = state.gates.length;
  const greedy = greedyPath(state);
  const gAt = playUntilBoss(state, greedy);
  const greedyDealt = probeDamage(gAt);
  let bestDealt = -1;
  let bestSquad = 0;
  let bestPath = greedy;
  const total = 1 << n;
  for (let mask = 0; mask < total; mask++) {
    const path = pathFromMask(mask, n);
    const at = playUntilBoss(state, path);
    const dealt = probeDamage(at);
    if (dealt > bestDealt) {
      bestDealt = dealt;
      bestSquad = at.squad;
      bestPath = path;
    }
  }
  const margin = marginPct(state.difficulty);
  return {
    bestPath,
    greedyPath: greedy,
    bestSquad,
    greedySquad: gAt.squad,
    bestDealt,
    greedyDealt,
    bossHp: state.bossHp,
    margin,
    winnable: bestDealt > 0 && bestDealt * 100 >= state.bossHp * (100 + margin),
    greedyOptimal: greedyDealt >= bestDealt,
  };
}

export function bestNextSide(state: GateRunnerState): 0 | 1 {
  const g = nextGate(state);
  if (!g) return 0;
  const remaining = state.gates.length - countApplied(state);
  if (remaining <= 0) return 0;
  let bestSide: 0 | 1 = 0;
  let bestDealt = -1;
  const total = 1 << remaining;
  for (let mask = 0; mask < total; mask++) {
    const path = pathFromMask(mask, remaining);
    const at = playUntilBoss(state, path);
    const dealt = probeDamage(at);
    if (dealt > bestDealt) {
      bestDealt = dealt;
      bestSide = path[0] === 1 ? 1 : 0;
    }
  }
  return bestSide;
}

export function studyPreview(state: GateRunnerState): { left: string; right: string; leftN: number; rightN: number }[] {
  if (!state.study) return [];
  const out: { left: string; right: string; leftN: number; rightN: number }[] = [];
  for (const g of state.gates) {
    if (g.applied) continue;
    out.push({
      left: formatOp(g.left),
      right: formatOp(g.right),
      leftN: applyOp(state.squad, g.left),
      rightN: applyOp(state.squad, g.right),
    });
    if (out.length >= 2) break;
  }
  return out;
}

function makeLayout(
  rng: Rng,
  difficulty: number,
  startSquad: number,
  hasSocial: boolean,
  luckPct: number,
  attackPct: number,
  guaranteed: boolean,
): { gates: Gate[]; enemies: Enemy[]; pickups: Pickup[]; bossLine: number; bossY: number } {
  const extra = hasSocial ? 1 : 0;
  const n = Math.min(6, pairCount(difficulty) + extra);
  const trapAt = difficulty >= 3 ? 1 + extra : -1;
  const gates: Gate[] = [];
  const enemies: Enemy[] = [];
  const pickups: Pickup[] = [];
  let y = FIRST_GATE_Y;
  let eid = 1;
  let pid = 1;
  let est = startSquad;

  for (let i = 0; i < n; i++) {
    let left: GateOp;
    let right: GateOp;
    if (hasSocial && i === 0) {
      left = { kind: 'add', n: 3 };
      right = { kind: 'add', n: 3 };
    } else if (i === trapAt) {
      left = guaranteed || rng() < 0.5 ? { kind: 'mul', n: 3 } : { kind: 'add', n: 25 };
      right = { kind: 'add', n: 10 };
      if (applyOp(est, left) < applyOp(est, right)) {
        const tmp = left;
        left = right;
        right = tmp;
      }
    } else if (guaranteed) {
      left = i % 2 === 0 ? { kind: 'add', n: 10 } : { kind: 'mul', n: 2 };
      right = i % 2 === 0 ? { kind: 'mul', n: 2 } : { kind: 'add', n: 10 };
    } else {
      left = pickOp(rng);
      right = pickOp(rng);
      if (applyOp(est, left) <= 0 && applyOp(est, right) <= 0) right = { kind: 'add', n: 10 };
    }
    gates.push({ y, left, right, applied: false });

    const yEnt = y + Math.floor(GATE_GAP / 2);
    if (i === trapAt) {
      const tempt = applyOp(est, left);
      const modest = applyOp(est, right);
      const shots = expectedShots(tempt, attackPct);
      const wall = Math.max(4, tempt - modest + 6 + shots);
      enemies.push({ id: eid++, y: yEnt, lane: 0, hp: wall, kind: 'wall' });
      enemies.push({ id: eid++, y: yEnt, lane: 1, hp: 1, kind: 'crowd' });
      est = Math.max(1, modest - 1);
    } else {
      const crowd = guaranteed ? 1 : 1 + rngInt(rng, Math.max(1, difficulty));
      enemies.push({ id: eid++, y: yEnt, lane: 2, hp: crowd, kind: 'crowd' });
      const afterGate = Math.max(applyOp(est, left), applyOp(est, right));
      est = Math.max(1, afterGate - Math.max(0, crowd - expectedShots(afterGate, attackPct)));
      const chance = guaranteed ? 40 : 18 + luckPct;
      if (rngInt(rng, 100) < chance) {
        const extraN = 3 + Math.floor(luckPct / 8);
        const kind: Pickup['kind'] = rngInt(rng, 4) === 0 ? 'firerate' : 'members';
        pickups.push({ id: pid++, y: yEnt + 24, lane: 2, kind, n: extraN, taken: false });
      }
    }
    y += GATE_GAP;
  }

  const bossLine = y + 48;
  return { gates, enemies, pickups, bossLine, bossY: bossLine + BOSS_DIST };
}

function blankState(args: {
  seed: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  squad: number;
  troopIds: string[];
  steerRate: number;
  study: boolean;
  attackPct: number;
  luckPct: number;
  hintLeft: number;
  reviveOn: boolean;
  timeSlowTicks: number;
  shield: number;
  layout: ReturnType<typeof makeLayout>;
}): GateRunnerState {
  return {
    seed: args.seed,
    step: 0,
    locale: args.locale,
    difficulty: args.difficulty,
    squad: args.squad,
    x: CENTER,
    y: 0,
    steer: 0,
    slowLane: false,
    shield: args.shield,
    reviveOn: args.reviveOn,
    fireRateTicks: 0,
    hintLeft: args.hintLeft,
    timeSlowTicks: args.timeSlowTicks,
    steerRate: args.steerRate,
    attackPct: args.attackPct,
    luckPct: args.luckPct,
    study: args.study,
    shotCd: 0,
    flash: 0,
    flashTicks: 0,
    pickupsTaken: 0,
    troopIds: args.troopIds,
    gates: args.layout.gates,
    enemies: args.layout.enemies,
    pickups: args.layout.pickups,
    bossHp: PROBE_HP,
    bossMaxHp: PROBE_HP,
    bossY: args.layout.bossY,
    bossLine: args.layout.bossLine,
    phase: 'run',
    events: [],
    bestPath: [],
  };
}

function finalize(draft: GateRunnerState): GateRunnerState | null {
  const report = analyzeLevel(draft);
  if (report.bestDealt < 4) return null;
  const hp = Math.max(1, Math.floor((report.bestDealt * 100) / (100 + report.margin)));
  if (report.bestDealt * 100 < hp * (100 + report.margin)) return null;
  if (draft.difficulty >= 3) {
    if (report.greedyDealt >= report.bestDealt) return null;
    if (report.greedyDealt >= hp) return null;
  }
  return { ...draft, bossHp: hp, bossMaxHp: hp, bestPath: report.bestPath };
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): GateRunnerState {
  const rng = mulberry32(fnv1a(`gate-runner:${seed >>> 0}`));
  const difficulty = run.difficulty;
  const squad = startSquadOf(party, run);
  const steerRate = STEER_BASE + (hasHabit(party, 'move') ? STEER_MOVE : 0) + Math.floor(habitPower(party, 'move') / 20);
  const base = {
    seed: seed >>> 0,
    locale,
    difficulty,
    squad,
    troopIds: party.members.map((m) => m.id),
    steerRate,
    study: hasHabit(party, 'study'),
    attackPct: buffAmount(run, 'attack'),
    luckPct: buffAmount(run, 'luck'),
    hintLeft: buffAmount(run, 'hint'),
    reviveOn: buffAmount(run, 'revive') > 0,
    timeSlowTicks: Math.floor((buffAmount(run, 'time') * 1000) / FIXED_DT_MS),
    shield: hasHabit(party, 'eat') ? SHIELD_EAT : 0,
  };

  for (let attempt = 0; attempt < 48; attempt++) {
    const layout = makeLayout(rng, difficulty, squad, hasHabit(party, 'social'), base.luckPct, base.attackPct, false);
    const done = finalize(blankState({ ...base, layout }));
    if (done) return done;
  }
  const layout = makeLayout(rng, difficulty, squad, hasHabit(party, 'social'), base.luckPct, base.attackPct, true);
  const forced = finalize(blankState({ ...base, layout }));
  if (forced) return forced;
  // Last resort: a tiny winnable corridor so the game always starts.
  const safe = makeLayout(rng, 1, squad, false, 0, base.attackPct, true);
  const fallback = blankState({ ...base, difficulty: difficulty, layout: safe });
  const report = analyzeLevel(fallback);
  const hp = Math.max(1, Math.floor((Math.max(4, report.bestDealt) * 100) / (100 + marginPct(difficulty))));
  return { ...fallback, bossHp: hp, bossMaxHp: hp, bestPath: report.bestPath };
}

function reduce(state: GateRunnerState, action: GateRunnerAction): GateRunnerState {
  if (isOver(state)) return state;
  if (action.type === 'tick') return step(state);
  if (action.type === 'steer') {
    if (action.dir !== -1 && action.dir !== 0 && action.dir !== 1) return state;
    if (action.dir === state.steer) return state;
    return { ...state, steer: action.dir };
  }
  if (action.type === 'slow') {
    if (action.on === state.slowLane) return state;
    return { ...state, slowLane: action.on };
  }
  if (action.type === 'forfeit') return { ...state, phase: 'fled' };
  return state;
}

export function outcomeLog(state: GateRunnerState, s: HavenRushStrings): string[] {
  const lines: string[] = [];
  for (const e of state.events) {
    if (e.t === 'gate') lines.push(formatText(s.log.gate, { op: e.op, before: e.before, after: e.after }));
    else if (e.t === 'hit') lines.push(formatText(s.log.hit, { kind: e.op === 'wall' ? s.log.wall : s.log.crowd, n: e.n }));
    else if (e.t === 'pick') lines.push(formatText(e.op === 'firerate' ? s.log.pickFire : s.log.pickMembers, { n: e.n }));
    else lines.push(s.log.revive);
  }
  if (state.phase === 'fled') lines.push(formatText(s.log.endFled, { n: state.squad }));
  else if (state.phase === 'won') lines.push(formatText(s.log.endWon, { n: state.squad }));
  else if (state.squad <= 0) lines.push(s.log.endLost);
  else lines.push(s.log.endLostBoss);
  return lines;
}

function scoreOf(state: GateRunnerState): number {
  const progress = Math.floor((state.y * 280) / Math.max(1, state.bossLine));
  if (state.phase === 'won') {
    const leftover = Math.min(400, state.squad * 10);
    const timeBonus = Math.min(250, Math.max(0, state.bossY - state.y));
    const pick = Math.min(200, state.pickupsTaken * 40);
    return clampScore(100 + leftover + timeBonus + pick);
  }
  if (state.phase === 'fled') return clampScore(40 + Math.floor(progress / 2) + state.pickupsTaken * 10);
  return clampScore(progress + state.pickupsTaken * 15);
}

function outcome(state: GateRunnerState): Outcome | null {
  if (!isOver(state)) return null;
  const result = state.phase === 'won' ? 'won' : state.phase === 'fled' ? 'fled' : 'lost';
  return {
    result,
    score: scoreOf(state),
    log: outcomeLog(state, strings[state.locale]),
    troopsUsed: [...state.troopIds],
    stats: {
      squad: state.squad,
      bossHp: state.bossHp,
      pickups: state.pickupsTaken,
      ticks: state.step,
    },
  };
}

function arrive(state: GateRunnerState, dest: number): GateRunnerAction {
  const window = state.steerRate < 2 ? 2 : state.steerRate;
  if (Math.abs(state.x - dest) <= window) return state.steer === 0 ? { type: 'tick' } : { type: 'steer', dir: 0 };
  if (state.x < dest) return state.steer === 1 ? { type: 'tick' } : { type: 'steer', dir: 1 };
  return state.steer === -1 ? { type: 'tick' } : { type: 'steer', dir: -1 };
}

function botPlay(state: GateRunnerState, rng: () => number): GateRunnerAction | null {
  if (isOver(state)) return null;
  rng();
  const g = nextGate(state);
  if (state.phase === 'boss' || !g) return arrive(state, state.x);
  const i = countApplied(state);
  const planned = state.bestPath[i];
  const best: 0 | 1 = planned === 1 ? 1 : 0;
  const err = Math.floor(turnRng(state.seed, 8000 + i)() * 100) < (BOT_ERROR_PCT[state.difficulty] ?? 14);
  const side: 0 | 1 = err ? (best === 0 ? 1 : 0) : best;
  return arrive(state, side === 0 ? LEFT_X : RIGHT_X);
}

function forfeit(): GateRunnerAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<GateRunnerState, GateRunnerAction> = { initial, reduce, outcome, botPlay, forfeit };
