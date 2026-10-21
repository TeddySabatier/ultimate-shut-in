/**
 * Haven Rush rules: the world, the gates and one 50 ms tick. Pure integer maths, no clock,
 * no randomness (the level generator in level.ts is the only seeded part).
 *
 * The squad runs up a lane split in two halves. A gate pair sits across the lane, one gate per
 * half; the half the squad stands in at the moment it crosses the gate line decides which gate
 * it takes, and what guards that gate (a wall or a crowd on the same line, an orb) is met in the
 * same tick. Between gate lines, crowds and walls span the whole lane, so the half only matters on
 * a gate line. The solver in level.ts relies on that: it chooses a half per gate and plays the very
 * same `tickMut` below, so the proof and the live game cannot disagree.
 *
 * `tickMut` changes the state it is given. The engine clones the state first (`cloneForTick`);
 * the solver clones once per branch and ticks in place, which is what keeps it fast.
 */
// ---- the world (integer units; the lane is 200 wide, 100 units are one half) ----------------
export const LANE_W = 200;
export const CENTER = 100;
export const LEFT_X = 50;
export const RIGHT_X = 150;
/** Lane speed in units per tick: 80 units per second; half of it under the slow lane or the time buff. */
export const SPEED = 4;
export const SPEED_SLOW = 2;
/** How far ahead the squad shoots a crowd or a wall (units). */
export const RANGE = 180;
/** Ticks between two volleys; a rapid-fire orb halves it for `RAPID_TICKS`. */
export const SHOT_EVERY = 4;
export const SHOT_RAPID = 2;
export const RAPID_TICKS = 100;
/** A volley hurts a crowd or a wall by `volley / FOE_DIV` (a wall takes half of that): the boss takes the whole volley. */
export const FOE_DIV = 6;
export const FIRST_GATE_Y = 280;
export const GATE_GAP = 450;
/** The gate a Social vassal adds before the first one. */
export const SOCIAL_GATE_Y = 140;
/** Distance from the last gate to the boss line. */
export const BOSS_LEAD = 400;
/** The boss starts this far ahead when the squad stops and closes in `BOSS_SPEED` per tick: 140 ticks, 7 seconds. */
export const BOSS_START = 280;
export const BOSS_SPEED = 2;
export const BOSS_TICKS = BOSS_START / BOSS_SPEED;
/** A hard stop so no game can run for ever (the slow lane all the way takes about 1,900 ticks). */
export const MAX_TICKS = 4000;
export const MAX_SQUAD = 9999;
/** The weakest legal squad: one vassal and no perk. Every level is proven for it. */
export const BASE_SQUAD = 6;
export const START_BASE = 5;
/** One extra member per `POWER_STEP` of the party's total power. */
export const POWER_STEP = 30;
export const REVIVE_SQUAD = 5;
export const SHIELD_EAT = 5;
export const STEER_BASE = 10;
export const MAX_EVENTS = 60;

export type OpKind = 'mul' | 'add' | 'sub' | 'div';
export interface Op {
  k: OpKind;
  n: number;
}
export interface Gate {
  y: number;
  l: Op;
  r: Op;
}
/** A crowd (`wall` false) or a wall: `hp` is the number shown, what is left of it. Lane 2 spans the whole lane. */
export interface Foe {
  y: number;
  lane: 0 | 1 | 2;
  hp: number;
  wall: boolean;
}
export interface Item {
  y: number;
  lane: 0 | 1 | 2;
  kind: 'members' | 'rapid';
  n: number;
}
export type Phase = 'run' | 'boss' | 'won' | 'lost' | 'fled';
/** What happened, for the log and the feed: `at` is the tick. */
export interface Ev {
  t: 'gate' | 'hit' | 'pick' | 'revive' | 'boss';
  at: number;
  op: string;
  a: number;
  b: number;
}

export interface GateRunnerState {
  seed: number;
  step: number;
  locale: 'en' | 'fr';
  difficulty: 1 | 2 | 3 | 4 | 5;
  phase: Phase;
  squad: number;
  /** Lane position 0..200; `side` is the half the player asked for. */
  x: number;
  side: 0 | 1;
  /** Units per tick the squad slides sideways (a Move vassal makes it faster). */
  rate: number;
  y: number;
  /** The slow-lane toggle, and the ticks left of the time buff. */
  slow: boolean;
  slowTicks: number;
  cd: number;
  rapid: number;
  shield: number;
  revives: number;
  /** Gate pairs still showing the hint arrow. */
  hints: number;
  /** Percent from the attack and luck buffs. */
  atk: number;
  luck: number;
  /** A Study vassal shows the results of the next two pairs. */
  study: boolean;
  gates: Gate[];
  gi: number;
  foes: Foe[];
  fi: number;
  items: Item[];
  ii: number;
  bossLine: number;
  bossHp: number;
  bossMax: number;
  bossGap: number;
  /** The proven best half for each gate (the Social gate first, if any), for the bot. */
  plan: number[];
  /** The squad the best path brings to the boss line, from the level proof: the yardstick of the score. */
  par: number;
  picks: number;
  troopIds: string[];
  events: Ev[];
}

const isLost = (s: GateRunnerState): boolean => s.phase === 'lost';
export const isOver = (s: GateRunnerState): boolean => s.phase === 'won' || s.phase === 'lost' || s.phase === 'fled';

export function formatOp(op: Op): string {
  if (op.k === 'mul') return `x${op.n}`;
  if (op.k === 'add') return `+${op.n}`;
  if (op.k === 'sub') return `-${op.n}`;
  return `÷${op.n}`;
}

/** A gate on a squad. Divide rounds down and keeps one member while anyone is left; only subtract can empty the squad. */
export function applyOp(squad: number, op: Op): number {
  if (squad <= 0) return 0;
  let r: number;
  if (op.k === 'mul') r = squad * op.n;
  else if (op.k === 'add') r = squad + op.n;
  else if (op.k === 'sub') r = squad - op.n < 1 ? 0 : squad - op.n;
  else r = Math.max(1, Math.floor(squad / op.n));
  return r > MAX_SQUAD ? MAX_SQUAD : r;
}

/** Damage of one volley on the boss: one point per member, plus the attack buff. */
export function volley(squad: number, atk: number): number {
  if (squad <= 0) return 0;
  const v = Math.floor((squad * (100 + atk)) / 100);
  return v < 1 ? 1 : v;
}

/** Damage of one volley on a crowd (a wall takes half of it), at least 1. */
export function foeDamage(squad: number, atk: number, wall: boolean): number {
  const d = Math.floor(volley(squad, atk) / FOE_DIV);
  const dmg = wall ? Math.floor(d / 2) : d;
  return dmg < 1 ? 1 : dmg;
}

export const halfOf = (x: number): 0 | 1 => (x < CENTER ? 0 : 1);
export const sideX = (side: 0 | 1): number => (side === 0 ? LEFT_X : RIGHT_X);
export const speedOf = (s: Pick<GateRunnerState, 'slow' | 'slowTicks'>): number => (s.slow || s.slowTicks > 0 ? SPEED_SLOW : SPEED);

/** A state safe to tick in place: foes still in play are copied, everything else is shared. */
export function cloneForTick(s: GateRunnerState): GateRunnerState {
  const foes = s.foes.slice();
  for (let j = s.fi; j < foes.length; j++) {
    const f = foes[j]!;
    if (f.hp > 0) foes[j] = { y: f.y, lane: f.lane, hp: f.hp, wall: f.wall };
  }
  return { ...s, foes };
}

function note(s: GateRunnerState, t: Ev['t'], op: string, a: number, b: number): void {
  const events = s.events.length >= MAX_EVENTS ? s.events.slice(1) : s.events.slice();
  events.push({ t, at: s.step, op, a, b });
  s.events = events;
}

/** The squad hit zero: a revive brings five members back, otherwise the run is lost. */
function settle(s: GateRunnerState, rec: boolean): void {
  if (s.squad > 0) return;
  if (s.revives > 0) {
    s.revives -= 1;
    s.squad = REVIVE_SQUAD;
    if (rec) note(s, 'revive', 'revive', 0, REVIVE_SQUAD);
  } else {
    s.squad = 0;
    s.phase = 'lost';
  }
}

function hurt(s: GateRunnerState, amount: number, wall: boolean, rec: boolean): void {
  let lost = amount;
  if (s.shield > 0) {
    const used = lost < s.shield ? lost : s.shield;
    s.shield -= used;
    lost -= used;
  }
  s.squad -= lost;
  if (rec) note(s, 'hit', wall ? 'wall' : 'crowd', amount, s.squad < 0 ? 0 : s.squad);
  settle(s, rec);
}

function applyGates(s: GateRunnerState, half: 0 | 1, rec: boolean): void {
  while (s.gi < s.gates.length && s.gates[s.gi]!.y <= s.y) {
    const g = s.gates[s.gi]!;
    const op = half === 0 ? g.l : g.r;
    const before = s.squad;
    s.squad = applyOp(before, op);
    s.gi += 1;
    if (s.hints > 0) s.hints -= 1;
    if (rec) note(s, 'gate', formatOp(op), before, s.squad);
    settle(s, rec);
    if (s.phase === 'lost') return;
  }
}

function meetFoes(s: GateRunnerState, half: 0 | 1, rec: boolean): void {
  while (s.fi < s.foes.length && s.foes[s.fi]!.y <= s.y) {
    const f = s.foes[s.fi]!;
    s.fi += 1;
    if (f.hp <= 0 || (f.lane !== 2 && f.lane !== half)) continue;
    const lost = f.hp;
    f.hp = 0;
    hurt(s, lost, f.wall, rec);
    if (s.phase === 'lost') return;
  }
}

function collect(s: GateRunnerState, half: 0 | 1, rec: boolean): void {
  while (s.ii < s.items.length && s.items[s.ii]!.y <= s.y) {
    const it = s.items[s.ii]!;
    s.ii += 1;
    if (it.lane !== 2 && it.lane !== half) continue;
    const n = it.n + Math.floor((it.n * s.luck) / 100);
    if (it.kind === 'members') {
      s.squad = s.squad + n > MAX_SQUAD ? MAX_SQUAD : s.squad + n;
    } else {
      s.rapid = n;
    }
    s.picks += 1;
    if (rec) note(s, 'pick', it.kind, n, s.squad);
  }
}

/** The first live crowd or wall ahead, in the squad's half and within range; -1 if none. */
function target(s: GateRunnerState, half: 0 | 1): number {
  for (let j = s.fi; j < s.foes.length; j++) {
    const f = s.foes[j]!;
    if (f.y - s.y > RANGE) return -1;
    if (f.hp > 0 && (f.lane === 2 || f.lane === half)) return j;
  }
  return -1;
}

/**
 * One tick of 50 ms, in place. `rec` writes the events (the live game); the solver passes false.
 * Order: the squad slides, the lane moves, the gate line is crossed (gate, then what stands on
 * it, then orbs), then the squad shoots, then the boss phase starts when the line is reached.
 */
export function tickMut(s: GateRunnerState, rec: boolean): void {
  if (s.phase !== 'run' && s.phase !== 'boss') return;
  s.step += 1;
  const fast = s.rapid > 0;
  const spd = speedOf(s);
  if (s.slowTicks > 0) s.slowTicks -= 1;
  if (s.rapid > 0) s.rapid -= 1;
  if (s.cd > 0) s.cd -= 1;
  const goal = sideX(s.side);
  if (s.x < goal) s.x = s.x + s.rate > goal ? goal : s.x + s.rate;
  else if (s.x > goal) s.x = s.x - s.rate < goal ? goal : s.x - s.rate;
  const half = halfOf(s.x);

  if (s.phase === 'run') {
    s.y = s.y + spd > s.bossLine ? s.bossLine : s.y + spd;
    applyGates(s, half, rec);
    if (isLost(s)) return;
    meetFoes(s, half, rec);
    if (isLost(s)) return;
    collect(s, half, rec);
    if (s.cd === 0) {
      const j = target(s, half);
      if (j >= 0) {
        const f = s.foes[j]!;
        const hp = f.hp - foeDamage(s.squad, s.atk, f.wall);
        f.hp = hp < 0 ? 0 : hp;
        s.cd = fast ? SHOT_RAPID : SHOT_EVERY;
      }
    }
    if (s.y >= s.bossLine) s.phase = 'boss';
  } else {
    s.bossGap -= BOSS_SPEED;
    if (s.cd === 0) {
      s.bossHp -= volley(s.squad, s.atk);
      s.cd = fast ? SHOT_RAPID : SHOT_EVERY;
    }
    if (s.bossHp <= 0) {
      s.bossHp = 0;
      s.phase = 'won';
    } else if (s.bossGap <= 0) {
      s.bossGap = 0;
      s.phase = 'lost';
    }
  }
  if (s.phase !== 'lost' && s.phase !== 'won' && s.step >= MAX_TICKS) s.phase = 'lost';
}

/** The gate the squad meets next, or null. */
export function nextGate(s: GateRunnerState): Gate | null {
  return s.gi < s.gates.length ? s.gates[s.gi]! : null;
}

/** What a Study vassal shows: the results of the next `count` gate pairs on the squad as it is now. */
export function previewPairs(s: GateRunnerState, count = 2): { left: string; right: string; leftN: number; rightN: number }[] {
  const out: { left: string; right: string; leftN: number; rightN: number }[] = [];
  for (let i = s.gi; i < s.gates.length && out.length < count; i++) {
    const g = s.gates[i]!;
    out.push({ left: formatOp(g.l), right: formatOp(g.r), leftN: applyOp(s.squad, g.l), rightN: applyOp(s.squad, g.r) });
  }
  return out;
}
