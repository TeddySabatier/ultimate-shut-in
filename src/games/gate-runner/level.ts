/**
 * Haven Rush levels: the seeded generator and the solver that proves each level winnable.
 *
 * A level is a list of gate pairs with crowds, walls and orbs, a boss line and a boss. It is a
 * function of the seed and the difficulty only: the party and the buffs never change the layout,
 * they make the same level easier. The proof is for the weakest legal squad (`BASE_SQUAD`, no perk,
 * no buff): the solver plays every choice of half for every gate pair with the live `tickMut`, and
 * the boss gets `bestDamage * 100 / (100 + margin)` hit points, so the best path beats it by the
 * margin of the difficulty (40, 32, 23, 14, 5 percent). A bigger squad can follow the same path and
 * only do better, which the tests check.
 *
 * From difficulty 3 the generator also plants tempting gates: a big number with a guard behind it,
 * next to a modest gate. The reflex "always take the larger result" is then not optimal (difficulty 3)
 * and loses to the boss (difficulty 4 and 5).
 */
import { type Rng, rngInt } from '../../game/rng';
import {
  BASE_SQUAD,
  BOSS_LEAD,
  BOSS_START,
  FIRST_GATE_Y,
  GATE_GAP,
  RAPID_TICKS,
  applyOp,
  cloneForTick,
  speedOf,
  sideX,
  tickMut,
  type Foe,
  type Gate,
  type GateRunnerState,
  type Item,
  type Op,
} from './rules';

/** Gate pairs per level by difficulty 1..5. */
export const PAIRS = [6, 7, 7, 8, 8] as const;

/** Fairness margin in percent: the best path beats the boss by this much (40, 32, 23, 14, 5). */
export function marginPct(difficulty: number): number {
  return 40 - Math.floor((35 * (difficulty - 1)) / 4);
}

export const OPS: readonly Op[] = [
  { k: 'mul', n: 2 },
  { k: 'add', n: 10 },
  { k: 'sub', n: 5 },
  { k: 'div', n: 2 },
  { k: 'mul', n: 3 },
  { k: 'add', n: 25 },
];
const X2 = OPS[0]!;
const PLUS10 = OPS[1]!;
const X3 = OPS[4]!;
const PLUS25 = OPS[5]!;

/** Gate weights in percent per difficulty, in the order of `OPS`: x2, +10, -5, ÷2, x3, +25. */
export const GATE_WEIGHTS: readonly (readonly number[])[] = [
  [32, 34, 4, 4, 13, 13],
  [30, 30, 8, 6, 13, 13],
  [28, 28, 10, 8, 13, 13],
  [26, 26, 12, 10, 13, 13],
  [24, 24, 14, 12, 13, 13],
];

/** Tuning by difficulty 1..5 (documented in docs/games/gate-runner.md). */
export const TUNING = {
  /** Size of a crowd or wall in the field, relative to the squad that meets it (percent). */
  crowdPct: [90, 120, 150, 180, 210],
  /** Chance in percent that a field crowd follows a gate pair. */
  crowdChance: [60, 70, 80, 85, 90],
  /** Chance in percent that a gate pair has a guard on one side (not counting the tempting gates). */
  guardChance: [0, 25, 35, 40, 45],
  /** Size of such a guard, relative to the squad (percent). */
  guardPct: [0, 25, 35, 45, 55],
  /** Chance in percent that a pair has an orb of extra members on one side. */
  orbChance: [35, 30, 25, 25, 20],
  /** Number of tempting gates by difficulty. */
  traps: [0, 0, 1, 2, 3],
} as const;

export interface Built {
  gates: Gate[];
  foes: Foe[];
  items: Item[];
  bossLine: number;
}

export interface Level extends Built {
  bossHp: number;
  /** The best half per gate, from the proof. */
  plan: number[];
  /** The squad the best path brings to the boss line. */
  par: number;
  report: LevelReport;
}

export interface LevelReport {
  bestDamage: number;
  bestSquad: number;
  greedyDamage: number;
  greedyPath: number[];
  bestPath: number[];
  margin: number;
  /** Paths (of 2^gates) whose damage beats the boss, and the total. */
  winning: number;
  paths: number;
  attempts: number;
  /** A level the generator could not make interesting: the plain fallback was used. */
  fallback: boolean;
}

const PROBE = 1_000_000_000;

/** A neutral state for sims: the weakest squad, the level's arrays, a boss that cannot die. */
export function simState(squad: number, b: Built, difficulty: 1 | 2 | 3 | 4 | 5): GateRunnerState {
  return {
    seed: 0,
    step: 0,
    locale: 'en',
    difficulty,
    phase: 'run',
    squad,
    x: sideX(1),
    side: 1,
    rate: 10,
    y: 0,
    slow: false,
    slowTicks: 0,
    cd: 0,
    rapid: 0,
    shield: 0,
    revives: 0,
    hints: 0,
    atk: 0,
    luck: 0,
    study: false,
    gates: b.gates,
    gi: 0,
    foes: b.foes.map((f) => ({ y: f.y, lane: f.lane, hp: f.hp, wall: f.wall })),
    fi: 0,
    items: b.items,
    ii: 0,
    bossLine: b.bossLine,
    bossHp: PROBE,
    bossMax: PROBE,
    bossGap: BOSS_START,
    plan: [],
    par: 0,
    picks: 0,
    troopIds: [],
    events: [],
  };
}

function branch(s: GateRunnerState, side: 0 | 1): GateRunnerState {
  const c = cloneForTick(s);
  c.side = side;
  c.x = sideX(side);
  return c;
}

/** Tick until the next gate has been crossed (or the run ended). */
function crossGate(s: GateRunnerState): void {
  const gi = s.gi;
  while (s.phase === 'run' && s.gi === gi) tickMut(s, false);
}

/** Tick until the very next tick crosses the next gate line: the squad is as it arrives at the gate. */
function arrive(s: GateRunnerState): void {
  const g = s.gates[s.gi];
  if (!g) return;
  while (s.phase === 'run' && s.y + speedOf(s) < g.y) tickMut(s, false);
}

/** Play the rest (field, boss) with no more choices; returns the damage dealt to the boss and the squad at the boss line. */
function finish(s: GateRunnerState): { dealt: number; squad: number } {
  let squad = s.squad;
  while (s.phase === 'run') tickMut(s, false);
  if (s.phase === 'boss') squad = s.squad;
  while (s.phase === 'boss') tickMut(s, false);
  const dealt = s.phase === 'lost' && s.bossHp === PROBE ? 0 : PROBE - s.bossHp;
  return { dealt, squad };
}

export interface Solution {
  dealt: number;
  squad: number;
  path: number[];
  paths: number;
}

/**
 * Every choice of half for every gate still ahead, played with the live rules and perfect steering:
 * the most damage the squad can deal to the boss and the path that does it. Ties keep the first path
 * found (left before right). `all` collects the damage of every path.
 */
export function solve(start: GateRunnerState, all?: number[]): Solution {
  const best: Solution = { dealt: -1, squad: 0, path: [], paths: 0 };
  const path: number[] = [];
  const walk = (s: GateRunnerState): void => {
    if (s.gi >= s.gates.length) {
      const r = finish(cloneForTick(s));
      best.paths += 1;
      all?.push(r.dealt);
      if (r.dealt > best.dealt) {
        best.dealt = r.dealt;
        best.squad = r.squad;
        best.path = path.slice();
      }
      return;
    }
    for (const side of [0, 1] as const) {
      const c = branch(s, side);
      crossGate(c);
      path.push(side);
      if (c.phase === 'lost') {
        // The squad fell at this gate: every way on from here deals nothing.
        const rest = 1 << (c.gates.length - c.gi);
        best.paths += rest;
        if (all) for (let k = 0; k < rest; k++) all.push(0);
        if (best.dealt < 0) {
          best.dealt = 0;
          best.path = path.concat(new Array<number>(c.gates.length - c.gi).fill(0));
        }
      } else walk(c);
      path.pop();
    }
  };
  walk(cloneForTick(start));
  return best;
}

/** The damage and the boss-line squad of one given choice of halves (missing entries mean right). */
export function playPath(start: GateRunnerState, path: readonly number[]): { dealt: number; squad: number } {
  const s = cloneForTick(start);
  let i = 0;
  while (s.phase === 'run' && s.gi < s.gates.length) {
    const side: 0 | 1 = path[i++] === 0 ? 0 : 1;
    s.side = side;
    s.x = sideX(side);
    crossGate(s);
  }
  return finish(s);
}

/** "Always take the larger result": at each pair the half whose gate gives the bigger squad as it arrives. */
export function greedy(start: GateRunnerState): { dealt: number; squad: number; path: number[] } {
  const s = cloneForTick(start);
  const path: number[] = [];
  while (s.phase === 'run' && s.gi < s.gates.length) {
    arrive(s);
    if (s.phase !== 'run') break;
    const g = s.gates[s.gi]!;
    const side = applyOp(s.squad, g.l) >= applyOp(s.squad, g.r) ? 0 : 1;
    s.side = side;
    s.x = sideX(side);
    path.push(side);
    crossGate(s);
  }
  const r = finish(s);
  return { dealt: r.dealt, squad: r.squad, path };
}

// ---------------------------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------------------------

function pickOp(rng: Rng, d: number): Op {
  const w = GATE_WEIGHTS[d - 1]!;
  let r = rngInt(rng, 100);
  for (let i = 0; i < OPS.length; i++) {
    r -= w[i]!;
    if (r < 0) return OPS[i]!;
  }
  return X2;
}

const pick = <T>(arr: readonly T[], d: number): T => arr[d - 1]!;
const isBad = (op: Op): boolean => op.k === 'sub' || op.k === 'div';
const jitter = (rng: Rng): number => 80 + rngInt(rng, 41);

interface Walker {
  /** The squad the generator follows: at each pair it takes the half that leaves it with more. */
  ref: GateRunnerState;
}

/** The two squads after the pair, on a copy of the walker: without committing anything. */
function trial(w: Walker, gate: Gate, foes: Foe[], items: Item[]): [GateRunnerState, GateRunnerState] {
  const base = cloneForTick(w.ref);
  base.gates = w.ref.gates.concat([gate]);
  base.foes = base.foes.concat(foes.map((f) => ({ ...f })));
  base.items = w.ref.items.concat(items);
  const out: GateRunnerState[] = [];
  for (const side of [0, 1] as const) {
    const c = branch(base, side);
    crossGate(c);
    out.push(c);
  }
  return [out[0]!, out[1]!];
}

/** Build one level layout. `calm` makes a plain level (no guards, no bad gates) used only as a last resort. */
export function build(rng: Rng, d: 1 | 2 | 3 | 4 | 5, calm: boolean): Built {
  const n = pick(PAIRS, d);
  const gates: Gate[] = [];
  const foes: Foe[] = [];
  const items: Item[] = [];
  const base: Built = { gates: [], foes: [], items: [], bossLine: 1_000_000 };
  const w: Walker = { ref: simState(BASE_SQUAD, base, d) };
  const trapCount = calm ? 0 : pick(TUNING.traps, d);
  const traps = new Set<number>();
  while (traps.size < Math.min(trapCount, n - 1)) traps.add(1 + rngInt(rng, n - 1));
  const orbSide = rngInt(rng, 2) as 0 | 1;
  let lastY = FIRST_GATE_Y;

  for (let i = 0; i < n; i++) {
    const y = FIRST_GATE_Y + i * GATE_GAP;
    lastY = y;
    // Walk the follower up to the line (the real gate is not in its list yet).
    const probe = w.ref;
    probe.gates = probe.gates.concat([{ y, l: X2, r: X2 }]);
    arrive(probe);
    probe.gates = probe.gates.slice(0, probe.gates.length - 1);
    const a = probe.squad;

    let l: Op;
    let r: Op;
    const newFoes: Foe[] = [];
    const newItems: Item[] = [];
    let trapSide: 0 | 1 | null = null;
    if (traps.has(i)) {
      trapSide = rngInt(rng, 2) as 0 | 1;
      const modest = rngInt(rng, 2) === 0 ? PLUS10 : X2;
      const tempt = rngInt(rng, 2) === 0 ? X3 : PLUS25;
      l = trapSide === 0 ? tempt : modest;
      r = trapSide === 0 ? modest : tempt;
    } else {
      l = pickOp(rng, d);
      r = pickOp(rng, d);
      if (calm) {
        if (isBad(l)) l = PLUS10;
        if (isBad(r)) r = X2;
      } else if (isBad(l) && isBad(r)) {
        if (rngInt(rng, 2) === 0) l = PLUS10;
        else r = X2;
      }
    }
    const gate: Gate = { y, l, r };

    if (trapSide !== null) {
      // A guard on the tempting gate, as big as it takes for the modest side to come out ahead.
      const tempt = trapSide === 0 ? l : r;
      const modest = trapSide === 0 ? r : l;
      const gain = applyOp(a, tempt) - applyOp(a, modest);
      const wall = rngInt(rng, 2) === 0;
      let hp = Math.max(4, gain + 2);
      for (let k = 0; k < 60; k++) {
        const guard: Foe = { y, lane: trapSide, hp, wall };
        const [cl, cr] = trial(w, gate, [guard], []);
        const t = trapSide === 0 ? cl : cr;
        const m = trapSide === 0 ? cr : cl;
        const slack = Math.max(2, Math.floor(m.squad / 10));
        if (t.squad + slack <= m.squad) break;
        hp += Math.max(2, Math.floor(hp / 8));
      }
      newFoes.push({ y, lane: trapSide, hp, wall });
    } else if (!calm && rngInt(rng, 100) < pick(TUNING.guardChance, d)) {
      const side = rngInt(rng, 2) as 0 | 1;
      const hp = Math.max(3, Math.round((a * pick(TUNING.guardPct, d) * jitter(rng)) / 10_000));
      newFoes.push({ y, lane: side, hp, wall: rngInt(rng, 2) === 0 });
    }
    if (rngInt(rng, 100) < pick(TUNING.orbChance, d)) {
      const side = rngInt(rng, 2) as 0 | 1;
      newItems.push({ y, lane: side, kind: 'members', n: Math.max(3, Math.round(a / 8) + 2) });
    }
    if (i === n - 1) newItems.push({ y, lane: orbSide, kind: 'rapid', n: RAPID_TICKS });

    const [cl, cr] = trial(w, gate, newFoes, newItems);
    const winner = cl.squad >= cr.squad ? cl : cr;
    gates.push(gate);
    for (const f of newFoes) foes.push(f);
    for (const it of newItems) items.push(it);
    w.ref = winner;

    // The field between this pair and the next (or the boss): a crowd or a wall across the whole lane.
    const reach = i === n - 1 ? BOSS_LEAD - 130 : 230;
    if (rngInt(rng, 100) < pick(TUNING.crowdChance, d)) {
      const wall = rngInt(rng, 100) < 30;
      const hp = Math.max(3, Math.round((w.ref.squad * pick(TUNING.crowdPct, d) * jitter(rng)) / 10_000));
      const f: Foe = { y: y + reach, lane: 2, hp, wall };
      foes.push(f);
      w.ref.foes = w.ref.foes.concat([{ ...f }]);
    }
    if (i < n - 1 && rngInt(rng, 100) < 40) {
      const it: Item = { y: y + 340, lane: 2, kind: 'members', n: Math.max(2, Math.round(w.ref.squad / 10) + 1) };
      items.push(it);
      w.ref.items = w.ref.items.concat([it]);
    }
  }
  return { gates, foes, items, bossLine: lastY + BOSS_LEAD };
}

/** Prove a layout and give the boss its hit points; null when it does not qualify. */
export function prove(b: Built, d: 1 | 2 | 3 | 4 | 5): { level: Level; ok: boolean } {
  const s0 = simState(BASE_SQUAD, b, d);
  const all: number[] = [];
  const best = solve(s0, all);
  const g = greedy(s0);
  const margin = marginPct(d);
  const hp = Math.max(1, Math.floor((best.dealt * 100) / (100 + margin)));
  let ok = best.dealt >= 200 && best.dealt * 100 >= hp * (100 + margin);
  // Easy levels forgive the reflex (the larger number wins); from difficulty 3 the reflex is not the best
  // play, and from difficulty 4 it loses.
  if (d <= 2) ok = ok && g.dealt >= hp;
  if (d >= 3) ok = ok && g.dealt * 10 <= best.dealt * 9;
  if (d >= 4) ok = ok && g.dealt < hp;
  const report: LevelReport = {
    bestDamage: best.dealt,
    bestSquad: best.squad,
    greedyDamage: g.dealt,
    greedyPath: g.path,
    bestPath: best.path,
    margin,
    winning: all.filter((v) => v >= hp).length,
    paths: best.paths,
    attempts: 1,
    fallback: false,
  };
  return { level: { ...b, bossHp: hp, plan: best.path, par: best.squad, report }, ok };
}

export const MAX_ATTEMPTS = 60;

/** The level for a seed and a difficulty: the first layout of the seeded stream that passes the proof. */
export function makeLevel(rng: Rng, d: 1 | 2 | 3 | 4 | 5): Level {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { level, ok } = prove(build(rng, d, false), d);
    if (ok) return { ...level, report: { ...level.report, attempts: attempt } };
  }
  // Never seen in the tests; a plain level is still proven, so the game always starts fair.
  const { level } = prove(build(rng, d, true), d);
  return { ...level, report: { ...level.report, attempts: MAX_ATTEMPTS + 1, fallback: true } };
}
