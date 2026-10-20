/**
 * Still Water: a calm breathing-rhythm game (practice, not therapy).
 *
 * A ring breathes in, rests, and breathes out. The player holds an input
 * while the ring grows and while it rests at the peak, and releases while
 * it shrinks. Each cycle is scored by how much of the ideal hold was
 * matched, minus the ticks held at the wrong time. Ripples (decoys) drift
 * by after the first two cycles: ignoring one adds to steadiness, tapping
 * one costs a little calm. The pond water is a running score and never a
 * failure state.
 *
 * Time is a `{ type: 'tick' }` of FIXED_DT_MS (50 ms); the engine never
 * reads a clock. Pure, seeded (setup salted `still-water:<seed>`), plain
 * data, integer scoring. The only floats are the Screen-facing `breathAt`
 * and the seeded generator's own output.
 */
import { fnv1a, mulberry32, rngInt, rngPick, type Rng } from '../../game/rng';
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
import { strings, type StillWaterStrings } from './strings';

// ---------------------------------------------------------------------------
// Tuning numbers (docs/games/still-water.md lists them)
// ---------------------------------------------------------------------------

/** Score at or above which the game is won: 60 percent of 1000. */
export const WIN_SCORE = 600;
/** The score ceiling before steadiness and calm raise it. */
export const BASE_CEILING = 850;
/** Extra ceiling for ignoring every ripple (scaled by the share ignored). */
export const STEADY_CEILING = 100;
/** Extra ceiling for keeping all of the calm (scaled by the calm left). */
export const CALM_CEILING = 50;
export const CALM_START = 100;
export const TAP_CALM_COST = 15;
/** A missed cycle (under this accuracy) is forgiven by a `revive` buff. */
export const REVIVE_BELOW = 50;
/** A `revive` buff forgives at most one cycle in this many, so it never turns no play into a win. */
export const REVIVE_SHARE = 3;
/** A forgiven cycle counts as this accuracy. */
export const REVIVE_ACCURACY = 70;
export const DECOY_KINDS = ['leaf', 'fish', 'light'] as const;
/** Ripples only drift by after this many cycles. */
export const DECOY_AFTER_CYCLES = 2;
/** A decoy stays on the water for 30 to 50 ticks (1.5 to 2.5 s). */
export const DECOY_MIN_TICKS = 30;
export const DECOY_EXTRA_TICKS = 21;
/** Ticks of "get ready" before the first inhale (2 s). */
export const LEAD_TICKS = 40;
/** One tick of grace per this many seconds of `time` buff. */
export const TIME_SECONDS_PER_GRACE = 2;
/** One tick of grace per this much Sleep power. */
export const SLEEP_POWER_PER_GRACE = 8;
/** Pace (Move troop): percent of every phase's length for brisk, steady, slow. */
export const PACE_PERCENT = { '-1': 80, '0': 100, '1': 125 } as const;

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type Pace = -1 | 0 | 1;
export type Phase = 'ready' | 'inhale' | 'hold' | 'exhale' | 'done';
/** The phases of a breath (not the get-ready lead, not the end). */
export type BreathPhase = 'inhale' | 'hold' | 'exhale';
export type DecoyKind = (typeof DECOY_KINDS)[number];
/** What one tick is worth: not scored (grace), should be held, should be released. */
export type TickKind = 'grace' | 'hold' | 'release';

export interface Rhythm {
  inhaleMs: number;
  holdMs: number;
  exhaleMs: number;
  cycles: number;
  /** Grace ticks at each phase boundary, before Sleep and the `time` buff. */
  baseGrace: number;
}

/** Difficulty 1 is 4-2-6; 2 is 5-3-7; 3 to 5 are faster. See docs/games/still-water.md. */
export const RHYTHM: Record<Difficulty, Rhythm> = {
  1: { inhaleMs: 4000, holdMs: 2000, exhaleMs: 6000, cycles: 5, baseGrace: 8 },
  2: { inhaleMs: 5000, holdMs: 3000, exhaleMs: 7000, cycles: 6, baseGrace: 6 },
  3: { inhaleMs: 4000, holdMs: 2000, exhaleMs: 5000, cycles: 6, baseGrace: 5 },
  4: { inhaleMs: 3000, holdMs: 2000, exhaleMs: 4000, cycles: 7, baseGrace: 3 },
  5: { inhaleMs: 3000, holdMs: 1000, exhaleMs: 3500, cycles: 8, baseGrace: 2 },
};

/**
 * The bot's seeded timing error per difficulty, in ticks: it presses late by
 * 0..spread, releases within spread/2 of the ideal, and with `lapse` percent
 * chance per cycle loses focus (triple error). `tapPercent` is its chance to
 * tap a ripple it should have ignored.
 */
export const BOT: Record<Difficulty, { spread: number; lapse: number; tapPercent: number }> = {
  1: { spread: 40, lapse: 20, tapPercent: 0 },
  2: { spread: 52, lapse: 40, tapPercent: 10 },
  3: { spread: 42, lapse: 40, tapPercent: 15 },
  4: { spread: 36, lapse: 40, tapPercent: 20 },
  5: { spread: 32, lapse: 40, tapPercent: 25 },
};

export interface Decoy {
  id: string;
  kind: DecoyKind;
  appearTick: number;
  leaveTick: number;
  tapped: boolean;
}

export interface CycleScore {
  index: number;
  accuracy: number;
  revived: boolean;
}

export interface StillWaterState {
  seed: number;
  locale: Locale;
  difficulty: Difficulty;
  /** What the party and the run give, kept so a pace change can rebuild the layout. */
  sleepPower: number;
  timeSeconds: number;
  luckCut: number;
  canPace: boolean;
  pace: Pace;
  /** Cycles that show the hint line: all with Eat, otherwise the `hint` buff count. */
  hintCycles: number;
  /** Ticks of "get ready" left; the game proper starts at 0. */
  leadLeft: number;
  /** Game ticks played (not counting the get-ready lead). */
  tick: number;
  inhaleTicks: number;
  holdTicks: number;
  exhaleTicks: number;
  cycleTicks: number;
  cycleCount: number;
  totalTicks: number;
  /** Grace ticks on each side of a phase boundary. */
  tolerance: number;
  holding: boolean;
  decoys: Decoy[];
  cycleScores: CycleScore[];
  /** The running cycle: ideal ticks held, and ticks held when they should not be. */
  cycleHits: number;
  cycleFalse: number;
  /** The whole game so far, for the water level: hits, false holds, and the hold and release ticks seen. */
  hitsAll: number;
  falseAll: number;
  holdSeen: number;
  releaseSeen: number;
  revivesLeft: number;
  forfeited: boolean;
  troopIds: string[];
  sleepName: string | null;
  eatName: string | null;
  moveName: string | null;
}

export type StillWaterAction =
  | { type: 'tick' }
  | { type: 'hold'; down: boolean }
  | { type: 'tap'; decoyId: string }
  | { type: 'pace'; pace: Pace }
  | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function msToTicks(ms: number): number {
  return Math.max(1, Math.round(ms / FIXED_DT_MS));
}

/** Total power of the party's members of one habit. */
export function habitPower(party: Party, habit: string): number {
  let total = 0;
  for (const m of party.members) if (m.habit === habit) total += m.power;
  return total;
}

export function habitName(party: Party, habit: string): string | null {
  const m = party.members.find((x) => x.habit === habit);
  return m ? m.name : null;
}

export function isOver(state: Pick<StillWaterState, 'forfeited' | 'tick' | 'totalTicks'>): boolean {
  return state.forfeited || state.tick >= state.totalTicks;
}

/** Zero-based cycle the game is in (clamped to the last one). */
export function cycleIndex(state: Pick<StillWaterState, 'tick' | 'cycleTicks' | 'cycleCount'>): number {
  return Math.min(state.cycleCount - 1, Math.floor(state.tick / state.cycleTicks));
}

/** One-based cycle number for the Screen. */
export function displayCycle(state: Pick<StillWaterState, 'tick' | 'cycleTicks' | 'cycleCount'>): number {
  return cycleIndex(state) + 1;
}

/** Position inside the current cycle, 0 to cycleTicks - 1. */
export function tickInCycle(state: Pick<StillWaterState, 'tick' | 'cycleTicks'>): number {
  return state.tick % state.cycleTicks;
}

export function phaseAt(state: Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'cycleTicks'>, tick: number): BreathPhase {
  const t = tick % state.cycleTicks;
  if (t < state.inhaleTicks) return 'inhale';
  if (t < state.inhaleTicks + state.holdTicks) return 'hold';
  return 'exhale';
}

export function phaseOf(state: StillWaterState): Phase {
  if (isOver(state)) return 'done';
  if (state.leadLeft > 0) return 'ready';
  return phaseAt(state, state.tick);
}

/** The ideal hold without grace: the inhale and the rest at the peak. */
export function idealHold(state: Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'cycleTicks'>, tick: number): boolean {
  return tick % state.cycleTicks < state.inhaleTicks + state.holdTicks;
}

/** What a tick is worth: the first and last `tolerance` ticks of a cycle and both sides of the release point are grace. */
export function tickKind(state: Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'cycleTicks' | 'tolerance'>, tick: number): TickKind {
  const t = tick % state.cycleTicks;
  const holdEnd = state.inhaleTicks + state.holdTicks;
  const tol = state.tolerance;
  if (t < tol || (t >= holdEnd - tol && t < holdEnd + tol) || t >= state.cycleTicks - tol) return 'grace';
  return t < holdEnd ? 'hold' : 'release';
}

/** Ticks per cycle that should be held and are not grace: what a perfect cycle matches. */
export function idealTicksPerCycle(state: Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'tolerance'>): number {
  return Math.max(1, state.inhaleTicks + state.holdTicks - 2 * state.tolerance);
}

/** Ticks per cycle that should be let go and are not grace: what a perfect cycle leaves alone. */
export function releaseTicksPerCycle(state: Pick<StillWaterState, 'exhaleTicks' | 'tolerance'>): number {
  return Math.max(1, state.exhaleTicks - 2 * state.tolerance);
}

/**
 * Accuracy 0 to 100: the share of the hold ticks that were held, minus the
 * share of the release ticks that were held anyway, each on its own scale.
 * Holding all the time is 100 - 100 = 0 and never holding is 0, however wide
 * the grace is.
 */
export function accuracyOf(hits: number, falseHolds: number, hold: number, release: number): number {
  if (hold <= 0 || release <= 0) return 0;
  return Math.max(0, Math.floor((100 * (hits * release - falseHolds * hold)) / (hold * release)));
}

/** Accuracy of the running cycle so far, against the whole cycle's hold and release ticks. */
export function currentAccuracy(state: StillWaterState): number {
  return accuracyOf(state.cycleHits, state.cycleFalse, idealTicksPerCycle(state), releaseTicksPerCycle(state));
}

/**
 * The pond water, 0 to 100: how much of the breath was matched so far.
 * It fills over the first cycle instead of jumping, then follows the running
 * accuracy of the whole game. Smooth, and never a failure state.
 */
export function waterLevel(state: Pick<StillWaterState, 'hitsAll' | 'falseAll' | 'holdSeen' | 'releaseSeen' | 'inhaleTicks' | 'holdTicks' | 'exhaleTicks' | 'tolerance'>): number {
  const hold = Math.max(state.holdSeen, idealTicksPerCycle(state));
  const release = Math.max(state.releaseSeen, releaseTicksPerCycle(state));
  return Math.min(100, accuracyOf(state.hitsAll, state.falseAll, hold, release));
}

/** Ticks before a phase change in which a press already counts for the new phase. */
export const EARLY_TAP_TICKS = 10;

/**
 * What a press means in "tap each phase" mode: hold or let go. A press says
 * "this phase starts now", so one just before the breath out lets go and one
 * just before the breath in holds. It never toggles, so a missed tap cannot
 * turn every later one around.
 */
export function tapTarget(state: StillWaterState): boolean {
  if (state.leadLeft > 0) return true;
  const t = tickInCycle(state);
  const holdEnd = state.inhaleTicks + state.holdTicks;
  if (t >= holdEnd - EARLY_TAP_TICKS && t < holdEnd) return false;
  if (t >= state.cycleTicks - EARLY_TAP_TICKS) return cycleIndex(state) < state.cycleCount - 1;
  return t < holdEnd;
}

/**
 * The breath, 0 (empty) to 1 (full), at `tick + alpha` (alpha in [0, 1)
 * between two ticks, for a smooth ring). Linear in each phase.
 */
export function breathAt(state: StillWaterState, alpha = 0): number {
  if (state.leadLeft > 0 || isOver(state)) return 0;
  const pos = Math.min(state.totalTicks, state.tick + alpha);
  const t = pos % state.cycleTicks;
  if (t < state.inhaleTicks) return t / state.inhaleTicks;
  if (t < state.inhaleTicks + state.holdTicks) return 1;
  return 1 - (t - state.inhaleTicks - state.holdTicks) / state.exhaleTicks;
}

/** Ticks left in the current phase (during "get ready": ticks before the first inhale). */
export function phaseTicksLeft(state: StillWaterState): number {
  if (state.leadLeft > 0) return state.leadLeft;
  const t = tickInCycle(state);
  const holdEnd = state.inhaleTicks + state.holdTicks;
  if (t < state.inhaleTicks) return state.inhaleTicks - t;
  if (t < holdEnd) return holdEnd - t;
  return state.cycleTicks - t;
}

/** What comes after the current phase, or null after the very last exhale. */
export function nextPhase(state: StillWaterState): BreathPhase | null {
  const p = phaseOf(state);
  if (p === 'done') return null;
  if (p === 'ready') return 'inhale';
  if (p === 'inhale') return 'hold';
  if (p === 'hold') return 'exhale';
  return cycleIndex(state) >= state.cycleCount - 1 ? null : 'inhale';
}

/** True while the hint line shows: Eat shows it all game, the `hint` buff for that many cycles. */
export function hintActive(state: StillWaterState): boolean {
  if (isOver(state)) return false;
  return state.leadLeft > 0 ? state.hintCycles > 0 : cycleIndex(state) < state.hintCycles;
}

export function visibleDecoys(state: Pick<StillWaterState, 'decoys' | 'tick'>): Decoy[] {
  return state.decoys.filter((d) => !d.tapped && d.appearTick <= state.tick && state.tick < d.leaveTick);
}

/** Ripples that drifted away untouched so far: the steadiness counter. */
export function steadiness(state: Pick<StillWaterState, 'decoys' | 'tick'>): number {
  return state.decoys.filter((d) => !d.tapped && d.leaveTick <= state.tick).length;
}

export function tapCount(state: Pick<StillWaterState, 'decoys'>): number {
  return state.decoys.filter((d) => d.tapped).length;
}

/** Calm left, 0 to 100: every tapped ripple costs a little. */
export function calmOf(state: Pick<StillWaterState, 'decoys'>): number {
  return Math.max(0, CALM_START - TAP_CALM_COST * tapCount(state));
}

/** Percent 0 to 100 of the ripples that were let go (100 when there were none). */
export function steadyPercent(state: Pick<StillWaterState, 'decoys' | 'tick'>): number {
  if (state.decoys.length === 0) return 100;
  return Math.floor((100 * steadiness(state)) / state.decoys.length);
}

/** Sum of the cycle accuracies; cycles not played count as 0. */
export function accuracySum(state: Pick<StillWaterState, 'cycleScores'>): number {
  let sum = 0;
  for (const c of state.cycleScores) sum += c.accuracy;
  return sum;
}

/** Mean cycle accuracy 0 to 100 over all cycles of the game (unplayed cycles count 0). */
export function averageAccuracy(state: Pick<StillWaterState, 'cycleScores' | 'cycleCount'>): number {
  return Math.round(accuracySum(state) / state.cycleCount);
}

/** The score ceiling: 850, plus up to 100 for steadiness and 50 for calm. */
export function ceilingOf(state: Pick<StillWaterState, 'decoys' | 'tick'>): number {
  return BASE_CEILING + Math.floor((STEADY_CEILING * steadyPercent(state)) / 100) + Math.floor((CALM_CEILING * calmOf(state)) / 100);
}

/** Raw score: the mean accuracy, as a share of the ceiling. */
export function rawScore(state: StillWaterState): number {
  return (accuracySum(state) * ceilingOf(state)) / (100 * state.cycleCount);
}

export function decoyName(kind: DecoyKind, s: StillWaterStrings): string {
  return s.decoy[kind];
}

export function outcomeLog(state: StillWaterState, s: StillWaterStrings): string[] {
  const lines: string[] = [s.log.start];
  if (state.pace !== 0) lines.push(state.pace < 0 ? s.log.paceBrisk : s.log.paceSlow);
  if (state.hintCycles > 0) lines.push(s.log.hint);
  for (const c of state.cycleScores) {
    lines.push(formatText(c.revived ? s.log.revived : s.log.cycle, { n: c.index + 1, accuracy: c.accuracy }));
  }
  const gone = state.decoys.filter((d) => d.tapped || d.leaveTick <= state.tick);
  for (const d of gone) lines.push(d.tapped ? s.log.tapped[d.kind] : s.log.ignored[d.kind]);
  const score = clampScore(rawScore(state));
  lines.push(state.forfeited ? s.log.endFled : score >= WIN_SCORE ? s.log.endWon : s.log.endLost);
  return lines;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Ticks of one phase at a pace: `ms` scaled by the pace percent, rounded to a tick. */
function paced(ms: number, pace: Pace): number {
  return Math.max(1, Math.round((ms * PACE_PERCENT[`${pace}`]) / (100 * FIXED_DT_MS)));
}

export function buildRhythm(difficulty: Difficulty, pace: Pace = 0): Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'exhaleTicks' | 'cycleTicks' | 'cycleCount' | 'totalTicks'> {
  const spec = RHYTHM[difficulty];
  const inhaleTicks = paced(spec.inhaleMs, pace);
  const holdTicks = paced(spec.holdMs, pace);
  const exhaleTicks = paced(spec.exhaleMs, pace);
  const cycleTicks = inhaleTicks + holdTicks + exhaleTicks;
  return { inhaleTicks, holdTicks, exhaleTicks, cycleTicks, cycleCount: spec.cycles, totalTicks: cycleTicks * spec.cycles };
}

/**
 * Grace ticks on each side of a boundary: the difficulty's base, plus one per
 * 8 Sleep power, plus one per 2 seconds of `time` buff, capped so every phase
 * keeps a core that is scored (shortest phase minus 2).
 */
export function graceTicks(difficulty: Difficulty, sleepPower: number, timeSeconds: number, inhaleTicks: number, holdTicks: number, exhaleTicks: number): number {
  const raw = RHYTHM[difficulty].baseGrace + Math.floor(sleepPower / SLEEP_POWER_PER_GRACE) + Math.floor(timeSeconds / TIME_SECONDS_PER_GRACE);
  const cap = Math.max(0, Math.min(inhaleTicks, holdTicks, exhaleTicks) - 2);
  return Math.max(0, Math.min(raw, cap));
}

/** Ripples: one per slot after the first two cycles, so at most one is on the water at a time. */
function placeDecoys(rng: Rng, count: number, cycleTicks: number, totalTicks: number): Decoy[] {
  const decoys: Decoy[] = [];
  if (count <= 0) return decoys;
  const start = cycleTicks * DECOY_AFTER_CYCLES;
  const slot = Math.floor((totalTicks - start) / count);
  for (let i = 0; i < count; i++) {
    const appearTick = start + i * slot + rngInt(rng, Math.max(1, slot - DECOY_MIN_TICKS - DECOY_EXTRA_TICKS - 5));
    const leaveTick = Math.min(totalTicks, appearTick + DECOY_MIN_TICKS + rngInt(rng, DECOY_EXTRA_TICKS));
    decoys.push({ id: `d${i}`, kind: rngPick(rng, DECOY_KINDS), appearTick, leaveTick, tapped: false });
  }
  return decoys;
}

type Layout = Pick<
  StillWaterState,
  'pace' | 'inhaleTicks' | 'holdTicks' | 'exhaleTicks' | 'cycleTicks' | 'cycleCount' | 'totalTicks' | 'tolerance' | 'decoys'
>;

/** Everything that depends on the pace: phase lengths, grace, and where the ripples drift. */
function layout(seed: number, difficulty: Difficulty, sleepPower: number, timeSeconds: number, luckCut: number, pace: Pace): Layout {
  const parts = buildRhythm(difficulty, pace);
  const tolerance = graceTicks(difficulty, sleepPower, timeSeconds, parts.inhaleTicks, parts.holdTicks, parts.exhaleTicks);
  const rng = mulberry32(fnv1a(`still-water:${seed >>> 0}`));
  const planned = difficulty <= 2 ? 1 : difficulty <= 4 ? 2 : 3;
  const decoys = placeDecoys(rng, Math.max(0, planned - luckCut), parts.cycleTicks, parts.totalTicks);
  return { pace, ...parts, tolerance, decoys };
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): StillWaterState {
  const difficulty = run.difficulty;
  const sleepPower = habitPower(party, 'sleep');
  const timeSeconds = buffAmount(run, 'time');
  const luckCut = buffAmount(run, 'luck') > 0 ? 1 : 0;
  const spec = RHYTHM[difficulty];
  return {
    seed: seed >>> 0,
    locale,
    difficulty,
    sleepPower,
    timeSeconds,
    luckCut,
    canPace: habitPower(party, 'move') > 0,
    hintCycles: habitPower(party, 'eat') > 0 ? spec.cycles : Math.min(spec.cycles, buffAmount(run, 'hint')),
    leadLeft: LEAD_TICKS,
    tick: 0,
    ...layout(seed, difficulty, sleepPower, timeSeconds, luckCut, 0),
    holding: false,
    cycleScores: [],
    cycleHits: 0,
    cycleFalse: 0,
    hitsAll: 0,
    falseAll: 0,
    holdSeen: 0,
    releaseSeen: 0,
    revivesLeft: Math.min(buffAmount(run, 'revive'), Math.floor(spec.cycles / REVIVE_SHARE)),
    forfeited: false,
    troopIds: party.members.map((m) => m.id),
    sleepName: habitName(party, 'sleep'),
    eatName: habitName(party, 'eat'),
    moveName: habitName(party, 'move'),
  };
}

// ---------------------------------------------------------------------------
// Reduce
// ---------------------------------------------------------------------------

function finalizeCycle(state: StillWaterState): StillWaterState {
  let accuracy = currentAccuracy(state);
  let revived = false;
  let revivesLeft = state.revivesLeft;
  if (accuracy < REVIVE_BELOW && revivesLeft > 0) {
    accuracy = REVIVE_ACCURACY;
    revived = true;
    revivesLeft -= 1;
  }
  return {
    ...state,
    cycleScores: [...state.cycleScores, { index: state.cycleScores.length, accuracy, revived }],
    cycleHits: 0,
    cycleFalse: 0,
    revivesLeft,
  };
}

function scoreTick(state: StillWaterState): StillWaterState {
  const kind = tickKind(state, state.tick);
  if (kind === 'grace') return state;
  const held = state.holding ? 1 : 0;
  if (kind === 'hold') {
    return { ...state, holdSeen: state.holdSeen + 1, cycleHits: state.cycleHits + held, hitsAll: state.hitsAll + held };
  }
  return { ...state, releaseSeen: state.releaseSeen + 1, cycleFalse: state.cycleFalse + held, falseAll: state.falseAll + held };
}

/** Whether a pace can still be chosen: before the first tick, with a Move troop. */
export function canChoosePace(state: StillWaterState): boolean {
  return state.canPace && state.tick === 0 && state.leadLeft === LEAD_TICKS && !state.forfeited;
}

function reduce(state: StillWaterState, action: StillWaterAction): StillWaterState {
  if (isOver(state)) return state;

  switch (action.type) {
    case 'forfeit':
      return { ...state, forfeited: true };
    case 'hold':
      return action.down === state.holding ? state : { ...state, holding: action.down };
    case 'pace': {
      if (!canChoosePace(state) || action.pace === state.pace || !(`${action.pace}` in PACE_PERCENT)) return state;
      return { ...state, ...layout(state.seed, state.difficulty, state.sleepPower, state.timeSeconds, state.luckCut, action.pace) };
    }
    case 'tap': {
      const decoy = state.decoys.find((d) => d.id === action.decoyId);
      if (!decoy || decoy.tapped || state.tick < decoy.appearTick || state.tick >= decoy.leaveTick) return state;
      return { ...state, decoys: state.decoys.map((d) => (d.id === decoy.id ? { ...d, tapped: true } : d)) };
    }
    case 'tick': {
      if (state.leadLeft > 0) return { ...state, leadLeft: state.leadLeft - 1 };
      let next = scoreTick(state);
      const nextTick = state.tick + 1;
      if (nextTick % state.cycleTicks === 0) next = finalizeCycle(next);
      return { ...next, tick: nextTick };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Outcome and bot
// ---------------------------------------------------------------------------

function outcome(state: StillWaterState): Outcome | null {
  if (!isOver(state)) return null;
  const score = clampScore(rawScore(state));
  const result = state.forfeited ? 'fled' : score >= WIN_SCORE ? 'won' : 'lost';
  return {
    result,
    score,
    log: outcomeLog(state, strings[state.locale]),
    troopsUsed: [...state.troopIds],
    learned: {
      topic: { en: strings.en.learned.topic, fr: strings.fr.learned.topic },
      note: { en: strings.en.learned.note, fr: strings.fr.learned.note },
    },
    stats: {
      cycles: state.cycleScores.length,
      accuracy: averageAccuracy(state),
      water: waterLevel(state),
      steadiness: steadiness(state),
      ripples: state.decoys.length,
      taps: tapCount(state),
      calm: calmOf(state),
      revivesUsed: state.cycleScores.filter((c) => c.revived).length,
      grace: state.tolerance,
      hint: state.hintCycles,
      pace: state.pace,
    },
  };
}

/** The bot's timing error for one cycle, from the seed: how late it presses and how far from the ideal it releases. */
export function botCycleError(state: Pick<StillWaterState, 'seed' | 'difficulty'>, cycle: number): { press: number; release: number } {
  const spec = BOT[state.difficulty];
  const rng = turnRng(state.seed, 1000 + cycle);
  const lapse = rngInt(rng, 100) < spec.lapse ? 3 : 1;
  const press = rngInt(rng, spec.spread + 1) * lapse;
  const release = (rngInt(rng, spec.spread + 1) - Math.floor(spec.spread / 2)) * lapse;
  return { press, release };
}

/** Whether the bot wants to hold at this moment: late into the inhale, off near the end of the rest. */
export function botDesiredHold(state: StillWaterState): boolean {
  if (state.leadLeft > 0) return false;
  const { press, release } = botCycleError(state, cycleIndex(state));
  const t = tickInCycle(state);
  const holdEnd = state.inhaleTicks + state.holdTicks;
  return t >= press && t < Math.min(state.cycleTicks - 1, holdEnd + release);
}

/** The ripple, if any, the bot taps right now (a seeded share of them, a few ticks after they appear). */
function botTap(state: StillWaterState): string | null {
  const spec = BOT[state.difficulty];
  if (spec.tapPercent <= 0) return null;
  for (const d of visibleDecoys(state)) {
    const rng = turnRng(state.seed, 2000 + Number(d.id.slice(1)));
    const wants = rngInt(rng, 100) < spec.tapPercent;
    const delay = 4 + rngInt(rng, 10);
    if (wants && state.tick === d.appearTick + delay) return d.id;
  }
  return null;
}

function botPlay(state: StillWaterState): StillWaterAction | null {
  if (isOver(state)) return null;
  const want = botDesiredHold(state);
  if (want !== state.holding) return { type: 'hold', down: want };
  const tap = botTap(state);
  if (tap !== null) return { type: 'tap', decoyId: tap };
  return { type: 'tick' };
}

function forfeit(): StillWaterAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<StillWaterState, StillWaterAction> = { initial, reduce, outcome, botPlay, forfeit };
