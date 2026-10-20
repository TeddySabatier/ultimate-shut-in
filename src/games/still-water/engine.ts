/**
 * Still Water: a calm breathing-rhythm game.
 *
 * Hold during inhale and the peak, release during exhale. Accuracy is the
 * overlap of that hold with the ideal. Ripples (decoys) appear after the
 * first two cycles: ignore them. The pond water is a running score, never
 * a failure state. Practice, not therapy.
 *
 * Time is a `{ type: 'tick' }` of FIXED_DT_MS (50 ms). Pure, seeded, plain
 * data. Setup RNG is salted `still-water:<seed>`.
 */
import { fnv1a, mulberry32, rngInt, rngPick } from '../../game/rng';
import {
  FIXED_DT_MS,
  buffAmount,
  clampScore,
  formatText,
  type GameEngine,
  type Locale,
  type Outcome,
  type Party,
  type RunContext,
} from '../contract';
import { strings, type StillWaterStrings } from './strings';

export const WIN_SCORE = 600;
export const CALM_START = 100;
export const TAP_CALM_COST = 15;
export const STEADINESS_POINTS = 8;
export const HINT_BONUS = 10;
export const REVIVE_ACCURACY = 70;
export const DECOY_KINDS = ['leaf', 'fish', 'light'] as const;
export const DECOY_AFTER_CYCLES = 2;

export type Phase = 'inhale' | 'hold' | 'exhale';
export type DecoyKind = (typeof DECOY_KINDS)[number];
export type TickKind = 'hold' | 'release' | 'grace';

export interface Rhythm {
  inhaleMs: number;
  holdMs: number;
  exhaleMs: number;
  cycles: number;
  /** Grace ticks at each phase boundary, before Sleep / time. */
  baseTol: number;
  /** Chance in 0..99 that a cycle is a gust the bot sits out. */
  gustP: number;
  /** Ticks the bot is late starting and ending the hold. */
  late: number;
}

/** Difficulty 1 is 4-2-6; 2 is 5-3-7; 3–5 are faster. See docs/games/still-water.md. */
export const RHYTHM: Record<1 | 2 | 3 | 4 | 5, Rhythm> = {
  1: { inhaleMs: 4000, holdMs: 2000, exhaleMs: 6000, cycles: 5, baseTol: 8, gustP: 8, late: 2 },
  2: { inhaleMs: 5000, holdMs: 3000, exhaleMs: 7000, cycles: 6, baseTol: 6, gustP: 22, late: 8 },
  3: { inhaleMs: 4000, holdMs: 2000, exhaleMs: 5000, cycles: 6, baseTol: 5, gustP: 30, late: 12 },
  4: { inhaleMs: 3000, holdMs: 2000, exhaleMs: 4000, cycles: 7, baseTol: 3, gustP: 36, late: 16 },
  5: { inhaleMs: 3000, holdMs: 1000, exhaleMs: 3500, cycles: 8, baseTol: 2, gustP: 42, late: 22 },
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
  difficulty: 1 | 2 | 3 | 4 | 5;
  tick: number;
  totalTicks: number;
  cycleCount: number;
  inhaleTicks: number;
  holdTicks: number;
  exhaleTicks: number;
  cycleTicks: number;
  holding: boolean;
  tolerance: number;
  showHint: boolean;
  revivesLeft: number;
  decoys: Decoy[];
  /** One flag per cycle: a gust the bot sits out. From the seed. */
  gusts: boolean[];
  cycleScores: CycleScore[];
  cycleMatch: number;
  cycleUnion: number;
  calm: number;
  steadiness: number;
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
  | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function msToTicks(ms: number): number {
  return Math.max(1, Math.round(ms / FIXED_DT_MS));
}

export function habitPower(party: Party, habit: string): number {
  let total = 0;
  for (const m of party.members) if (m.habit === habit) total += m.power;
  return total;
}

export function habitName(party: Party, habit: string): string | null {
  const m = party.members.find((x) => x.habit === habit);
  return m ? m.name : null;
}

export function cycleTicksOf(state: Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'exhaleTicks'>): number {
  return state.inhaleTicks + state.holdTicks + state.exhaleTicks;
}

export function cycleIndex(state: Pick<StillWaterState, 'tick' | 'cycleTicks' | 'cycleCount'>): number {
  if (state.cycleTicks <= 0) return 0;
  return Math.min(state.cycleCount - 1, Math.floor(state.tick / state.cycleTicks));
}

/** 1-based cycle number for the Screen. */
export function displayCycle(state: Pick<StillWaterState, 'tick' | 'cycleTicks' | 'cycleCount'>): number {
  return cycleIndex(state) + 1;
}

export function tickInCycle(state: Pick<StillWaterState, 'tick' | 'cycleTicks'>): number {
  return state.tick % state.cycleTicks;
}

export function phaseAt(state: Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'cycleTicks'>, tick: number): Phase {
  const t = tick % state.cycleTicks;
  if (t < state.inhaleTicks) return 'inhale';
  if (t < state.inhaleTicks + state.holdTicks) return 'hold';
  return 'exhale';
}

export function phaseOf(state: StillWaterState): Phase {
  return phaseAt(state, state.tick);
}

/** Ideal hold without grace: inhale and the peak. */
export function idealHold(state: Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'cycleTicks'>, tick: number): boolean {
  const t = tick % state.cycleTicks;
  return t < state.inhaleTicks + state.holdTicks;
}

export function tickKind(state: Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'cycleTicks' | 'tolerance'>, tick: number): TickKind {
  const t = tick % state.cycleTicks;
  const holdEnd = state.inhaleTicks + state.holdTicks;
  const cycle = state.cycleTicks;
  const tol = state.tolerance;
  if (t < tol || (t >= holdEnd - tol && t < holdEnd + tol) || t >= cycle - tol) return 'grace';
  if (t < holdEnd) return 'hold';
  return 'release';
}

export function currentAccuracy(state: Pick<StillWaterState, 'cycleMatch' | 'cycleUnion'>): number {
  if (state.cycleUnion <= 0) return 100;
  return Math.floor((state.cycleMatch * 100) / state.cycleUnion);
}

export function waterLevel(state: StillWaterState): number {
  const done = state.cycleScores.map((c) => c.accuracy);
  if (!isOver(state) && state.cycleUnion > 0) {
    done.push(currentAccuracy(state));
  }
  if (done.length === 0) return 0;
  let sum = 0;
  for (const n of done) sum += n;
  return Math.round(sum / done.length);
}

/** 0 empty, 100 full: the visual breath, linear in the current phase. */
export function breathProgress(state: StillWaterState): number {
  const t = tickInCycle(state);
  if (t < state.inhaleTicks) return state.inhaleTicks <= 0 ? 100 : Math.round((t * 100) / state.inhaleTicks);
  if (t < state.inhaleTicks + state.holdTicks) return 100;
  const e = t - state.inhaleTicks - state.holdTicks;
  return state.exhaleTicks <= 0 ? 0 : Math.round(100 - (e * 100) / state.exhaleTicks);
}

export function visibleDecoys(state: StillWaterState): Decoy[] {
  return state.decoys.filter((d) => !d.tapped && d.appearTick <= state.tick && state.tick < d.leaveTick);
}

export function isOver(state: StillWaterState): boolean {
  return state.forfeited || state.tick >= state.totalTicks;
}

export function averageAccuracy(state: Pick<StillWaterState, 'cycleScores'>): number {
  if (state.cycleScores.length === 0) return 0;
  let sum = 0;
  for (const c of state.cycleScores) sum += c.accuracy;
  return Math.round(sum / state.cycleScores.length);
}

export function rawScore(state: StillWaterState): number {
  const rhythm = averageAccuracy(state) * 10;
  const steady = state.steadiness * STEADINESS_POINTS;
  const hint = state.showHint ? HINT_BONUS : 0;
  const calmCost = Math.max(0, CALM_START - state.calm);
  return rhythm + steady + hint - calmCost;
}

export function decoyName(kind: DecoyKind, s: StillWaterStrings): string {
  return s.decoy[kind];
}

export function outcomeLog(state: StillWaterState, s: StillWaterStrings): string[] {
  const lines: string[] = [s.log.start];
  if (state.showHint) lines.push(s.log.hint);
  for (const c of state.cycleScores) {
    lines.push(formatText(c.revived ? s.log.revived : s.log.cycle, { n: c.index + 1, accuracy: c.accuracy }));
  }
  const ignored = state.decoys.filter((d) => !d.tapped && d.leaveTick <= state.tick);
  const tapped = state.decoys.filter((d) => d.tapped);
  for (const d of ignored) lines.push(formatText(s.log.decoyIgnored, { name: decoyName(d.kind, s) }));
  for (const d of tapped) lines.push(formatText(s.log.decoyTapped, { name: decoyName(d.kind, s) }));
  const end = state.forfeited ? s.log.endFled : clampScore(rawScore(state)) >= WIN_SCORE ? s.log.endWon : s.log.endLost;
  lines.push(end);
  return lines;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function ticksFromMs(ms: number, stretch: number): number {
  return msToTicks(ms) + stretch;
}

export function buildRhythm(difficulty: 1 | 2 | 3 | 4 | 5, movePower: number): Pick<StillWaterState, 'inhaleTicks' | 'holdTicks' | 'exhaleTicks' | 'cycleTicks' | 'cycleCount' | 'totalTicks'> {
  const spec = RHYTHM[difficulty];
  const stretch = Math.floor(movePower / 10);
  const inhaleTicks = ticksFromMs(spec.inhaleMs, stretch);
  const holdTicks = ticksFromMs(spec.holdMs, stretch);
  const exhaleTicks = ticksFromMs(spec.exhaleMs, stretch);
  const cycleTicks = inhaleTicks + holdTicks + exhaleTicks;
  return {
    inhaleTicks,
    holdTicks,
    exhaleTicks,
    cycleTicks,
    cycleCount: spec.cycles,
    totalTicks: cycleTicks * spec.cycles,
  };
}

export function graceTicks(difficulty: 1 | 2 | 3 | 4 | 5, sleepPower: number, timeBuff: number, inhaleTicks: number, holdTicks: number, exhaleTicks: number): number {
  const raw = RHYTHM[difficulty].baseTol + Math.floor(sleepPower / 8) + timeBuff;
  const cap = Math.max(0, Math.min(inhaleTicks, holdTicks, exhaleTicks) - 2);
  return Math.max(0, Math.min(raw, cap));
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): StillWaterState {
  const difficulty = run.difficulty;
  const spec = RHYTHM[difficulty];
  const move = habitPower(party, 'move');
  const sleep = habitPower(party, 'sleep');
  const eat = habitPower(party, 'eat');
  const parts = buildRhythm(difficulty, move);
  const tolerance = graceTicks(difficulty, sleep, buffAmount(run, 'time'), parts.inhaleTicks, parts.holdTicks, parts.exhaleTicks);
  const showHint = eat > 0 || buffAmount(run, 'hint') > 0;

  const rng = mulberry32(fnv1a(`still-water:${seed >>> 0}`));
  const gusts = Array.from({ length: spec.cycles }, () => rngInt(rng, 100) < spec.gustP);

  const decoyCount = Math.max(0, (difficulty <= 2 ? 1 : difficulty <= 4 ? 2 : 3) - (buffAmount(run, 'luck') > 0 ? 1 : 0));
  const decoys: Decoy[] = [];
  const start = parts.cycleTicks * DECOY_AFTER_CYCLES;
  const window = Math.max(1, parts.totalTicks - start - 40);
  for (let i = 0; i < decoyCount; i++) {
    const appearTick = start + rngInt(rng, window);
    const leaveTick = Math.min(parts.totalTicks, appearTick + 30 + rngInt(rng, 21));
    decoys.push({
      id: `d${i}`,
      kind: rngPick(rng, DECOY_KINDS),
      appearTick,
      leaveTick,
      tapped: false,
    });
  }

  return {
    seed: seed >>> 0,
    locale,
    difficulty,
    tick: 0,
    ...parts,
    holding: false,
    tolerance,
    showHint,
    revivesLeft: buffAmount(run, 'revive'),
    decoys,
    gusts,
    cycleScores: [],
    cycleMatch: 0,
    cycleUnion: 0,
    calm: CALM_START,
    steadiness: 0,
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
  if (accuracy < 50 && revivesLeft > 0) {
    accuracy = REVIVE_ACCURACY;
    revived = true;
    revivesLeft -= 1;
  }
  const index = state.cycleScores.length;
  return {
    ...state,
    cycleScores: [...state.cycleScores, { index, accuracy, revived }],
    cycleMatch: 0,
    cycleUnion: 0,
    revivesLeft,
  };
}

function scoreCurrentTick(state: StillWaterState): StillWaterState {
  const kind = tickKind(state, state.tick);
  if (kind === 'grace') return state;
  const ideal = kind === 'hold';
  const player = state.holding;
  if (!ideal && !player) return state;
  return {
    ...state,
    cycleUnion: state.cycleUnion + 1,
    cycleMatch: state.cycleMatch + (ideal && player ? 1 : 0),
  };
}

function collectSteadiness(state: StillWaterState, nextTick: number): StillWaterState {
  let extra = 0;
  for (const d of state.decoys) {
    if (!d.tapped && d.leaveTick === nextTick) extra += 1;
  }
  return extra === 0 ? state : { ...state, steadiness: state.steadiness + extra };
}

function reduce(state: StillWaterState, action: StillWaterAction): StillWaterState {
  if (isOver(state)) return state;

  if (action.type === 'forfeit') return { ...state, forfeited: true };

  if (action.type === 'hold') {
    if (action.down === state.holding) return state;
    return { ...state, holding: action.down };
  }

  if (action.type === 'tap') {
    const decoy = state.decoys.find((d) => d.id === action.decoyId);
    if (!decoy || decoy.tapped) return state;
    if (state.tick < decoy.appearTick || state.tick >= decoy.leaveTick) return state;
    return {
      ...state,
      decoys: state.decoys.map((d) => (d.id === decoy.id ? { ...d, tapped: true } : d)),
      calm: Math.max(0, state.calm - TAP_CALM_COST),
    };
  }

  if (action.type !== 'tick') return state;

  let next = scoreCurrentTick(state);
  const nextTick = state.tick + 1;
  next = collectSteadiness(next, nextTick);
  const cycleEnded = nextTick % state.cycleTicks === 0;
  if (cycleEnded) next = finalizeCycle(next);
  return { ...next, tick: nextTick };
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
      water: waterLevel(state),
      steadiness: state.steadiness,
      calm: state.calm,
      decoysIgnored: state.decoys.filter((d) => !d.tapped).length,
      decoysTapped: state.decoys.filter((d) => d.tapped).length,
      revivesUsed: state.cycleScores.filter((c) => c.revived).length,
      hint: state.showHint ? 1 : 0,
      gusts: state.gusts.filter(Boolean).length,
    },
  };
}

export function botDesiredHold(state: StillWaterState): boolean {
  const i = Math.min(state.gusts.length - 1, Math.floor(state.tick / state.cycleTicks));
  if (state.gusts[i]) return false;
  const t = tickInCycle(state);
  const holdEnd = state.inhaleTicks + state.holdTicks;
  const late = RHYTHM[state.difficulty].late;
  return t >= late && t < holdEnd + late;
}

function botPlay(state: StillWaterState): StillWaterAction | null {
  if (isOver(state)) return null;
  const want = botDesiredHold(state);
  if (want !== state.holding) return { type: 'hold', down: want };
  return { type: 'tick' };
}

function forfeit(): StillWaterAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<StillWaterState, StillWaterAction> = { initial, reduce, outcome, botPlay, forfeit };
