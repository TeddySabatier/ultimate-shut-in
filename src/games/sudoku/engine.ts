/**
 * Sudoku: a seeded number-place puzzle with one solution.
 *
 * Difficulty picks the board and the grade: 1 is a 6x6 board needing only
 * naked singles, 2 a 6x6 needing hidden singles or pairs, 3 to 5 are 9x9 at
 * easy, medium and hard. The player cannot lose: a full correct grid is `won`,
 * stopping early is `fled` with a partial score. The Screen sends one coarse
 * `second` action per real second; the engine counts them against a par time.
 *
 * Plain data in, plain data out: the state holds numbers, strings, booleans
 * and arrays only. Undo history is a list of grid and note snapshots.
 */
import { buffAmount, clampScore, formatText, type GameEngine, type Locale, type Outcome, type Party, type RunContext } from '../contract';
import { addLuckClues, generate } from './generator';
import { bit, candidatesOfCell, conflictCells, emptyCount, geoFor, type Geo, type Size, type UnitKind } from './grid';
import { gradeOfPuzzle, nextStep, type Grade, type Tech } from './logic';
import { strings } from './strings';

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type Habit = 'study' | 'sleep' | 'clean' | 'social' | 'hygiene';

/** Seconds a player is expected to need, before the Sleep perk and the time buff. */
export const PAR_SECONDS: Record<Difficulty, number> = { 1: 120, 2: 180, 3: 360, 4: 540, 5: 780 };

/** Score weights (see docs/games/sudoku.md). */
export const SCORE = {
  /** A solved grid is worth this much before the bonuses. */
  base: 600,
  /** Speed bonus: full up to half the par, none from twice the par. */
  speedMax: 250,
  /** Accuracy bonus, lost 25 points per slip (a wrong digit placed). */
  accuracyMax: 150,
  mistake: 25,
  /** A hint costs 20 points, 5 when it is one of the free hints. A check costs 10, free for the first with Hygiene. */
  hint: 20,
  freeHint: 5,
  check: 10,
  /** Stopping early scores up to this much, in proportion to the blanks filled correctly. */
  partialMax: 500,
  partialMistake: 10,
} as const;

/** How the bot paces itself: it spends this part of the par on a whole grid. */
export const BOT_PACE_PERCENT = 85;
export const MAX_SECONDS = 99_999;

/** The difficulty table: board size and grade. */
export function sizeFor(difficulty: Difficulty): Size {
  return difficulty <= 2 ? 6 : 9;
}
export function gradeFor(difficulty: Difficulty): Grade {
  return (['easy', 'medium', 'easy', 'medium', 'hard'] as const)[difficulty - 1]!;
}

/** Both undo and redo move between these. */
export interface Snap {
  grid: number[];
  notes: number[];
}

export type LastKind = 'place' | 'erase' | 'note' | 'hint' | 'check' | 'undo' | 'redo' | 'clean';

/** What the last action did, for the Screen's live announcements. `id` changes on every action. */
export interface Last {
  id: number;
  kind: LastKind;
  cell: number;
  digit: number;
  /** For a check: how many digits are off. */
  count: number;
  /** For a hint: the technique, or 'mistake' when a wrong digit was pointed out. */
  tech?: Tech | 'mistake';
  unit?: UnitKind;
  unitIndex?: number;
}

export interface TechCounts {
  naked: number;
  hidden: number;
  deeper: number;
}

export interface SudokuState {
  seed: number;
  locale: Locale;
  difficulty: Difficulty;
  n: Size;
  grade: Grade;
  /** The grade that was asked for; `grade` is what the generator really made. */
  wanted: Grade;
  clues: number;
  given: number[];
  solution: number[];
  grid: number[];
  /** Pencil notes: one bit per digit, per cell. */
  notes: number[];
  past: Snap[];
  future: Snap[];
  seconds: number;
  par: number;
  mistakes: number;
  hints: number;
  freeHints: number;
  freeHintsTotal: number;
  checks: number;
  freeChecksTotal: number;
  /** Placements made (typed or hinted): the bot's pace and the "moves" shown. */
  moves: number;
  /** Cells the last check found wrong (until they are edited). */
  flagged: number[];
  /** Names of the party members whose habit gives a perk. */
  perks: Partial<Record<Habit, string>>;
  cleanOn: boolean;
  tech: TechCounts;
  last: Last | null;
  steps: number;
  forfeited: boolean;
  troops: string[];
  luckClues: number;
  ops: number;
}

export type SudokuAction =
  | { type: 'place'; cell: number; digit: number }
  | { type: 'erase'; cell: number }
  | { type: 'note'; cell: number; digit: number }
  | { type: 'hint' }
  | { type: 'check' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'toggleClean' }
  | { type: 'second' }
  | { type: 'forfeit' };

export const geoOf = (s: Pick<SudokuState, 'n'>): Geo => geoFor(s.n);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function isSolved(s: Pick<SudokuState, 'grid' | 'solution'>): boolean {
  for (let i = 0; i < s.grid.length; i++) if (s.grid[i] !== s.solution[i]) return false;
  return true;
}

export function isOver(s: SudokuState): boolean {
  return s.forfeited || isSolved(s);
}

/** Cells holding a digit the player typed that is not the solution's. */
export function wrongCells(s: Pick<SudokuState, 'grid' | 'solution' | 'given'>): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.grid.length; i++) if (!s.given[i] && s.grid[i] && s.grid[i] !== s.solution[i]) out.push(i);
  return out;
}

/** Blanks of the puzzle that now hold the right digit. */
export function filledRight(s: Pick<SudokuState, 'grid' | 'solution' | 'given'>): number {
  let k = 0;
  for (let i = 0; i < s.grid.length; i++) if (!s.given[i] && s.grid[i] === s.solution[i]) k += 1;
  return k;
}

export function blanksOfPuzzle(s: Pick<SudokuState, 'given'>): number {
  return emptyCount(s.given);
}

export function conflictsOf(s: Pick<SudokuState, 'grid' | 'n'>): number[] {
  return conflictCells(s.grid, geoOf(s));
}

/** `m:ss` for a number of seconds. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const r = seconds % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** The speed bonus: SCORE.speedMax up to half the par, down to 0 at twice the par (integer maths). */
export function speedBonus(seconds: number, par: number): number {
  if (par <= 0 || seconds * 2 <= par) return SCORE.speedMax;
  if (seconds >= par * 2) return 0;
  return Math.floor((2 * SCORE.speedMax * (par * 2 - seconds)) / (par * 3));
}

export function hintCost(s: Pick<SudokuState, 'hints' | 'freeHintsTotal'>): number {
  const free = Math.min(s.hints, s.freeHintsTotal);
  return free * SCORE.freeHint + (s.hints - free) * SCORE.hint;
}

export function checkCost(s: Pick<SudokuState, 'checks' | 'freeChecksTotal'>): number {
  return Math.max(0, s.checks - s.freeChecksTotal) * SCORE.check;
}

/** The score the game would give right now: solved if the grid is solved, else the partial one. */
export function scoreOf(s: SudokuState): number {
  const costs = hintCost(s) + checkCost(s);
  if (isSolved(s)) {
    return clampScore(SCORE.base + speedBonus(s.seconds, s.par) + Math.max(0, SCORE.accuracyMax - SCORE.mistake * s.mistakes) - costs);
  }
  const blanks = blanksOfPuzzle(s);
  const share = blanks === 0 ? 0 : Math.floor((SCORE.partialMax * filledRight(s)) / blanks);
  return clampScore(share - SCORE.partialMistake * s.mistakes - costs);
}

/** Which technique the player's own placement of `digit` in `cell` needed, from the grid before it. */
function classify(grid: readonly number[], cell: number, digit: number, geo: Geo): keyof TechCounts {
  if (candidatesOfCell(grid, cell, geo) === bit(digit)) return 'naked';
  for (const u of geo.unitsOfCell[cell]!) {
    let only = true;
    for (const i of geo.units[u]!) {
      if (i !== cell && !grid[i] && candidatesOfCell(grid, i, geo) & bit(digit)) {
        only = false;
        break;
      }
    }
    if (only) return 'hidden';
  }
  return 'deeper';
}

const techBucket = (t: Tech | 'mistake'): keyof TechCounts => (t === 'naked' ? 'naked' : t === 'hidden' ? 'hidden' : 'deeper');

/** The technique placed most often (ties: the harder one); null when nothing was placed by logic. */
export function topTechnique(t: TechCounts): keyof TechCounts | null {
  const order: (keyof TechCounts)[] = ['deeper', 'hidden', 'naked'];
  let best: keyof TechCounts | null = null;
  for (const k of order) if (t[k] > 0 && (best === null || t[k] > t[best])) best = k;
  return best;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function memberFor(party: Party, habit: Habit): { id: string; name: string; power: number } | null {
  for (const m of party.members) if (m.habit === habit) return { id: m.id, name: m.name, power: m.power };
  return null;
}

function initialState(seed: number, party: Party, run: RunContext, locale: Locale): SudokuState {
  const difficulty = run.difficulty;
  const n = sizeFor(difficulty);
  const geo = geoFor(n);
  const wanted = gradeFor(difficulty);
  const made = generate(seed, geo, wanted);
  const luck = buffAmount(run, 'luck');
  const luckClues = luck > 0 ? Math.min(4, 1 + Math.floor(luck / 10)) : 0;
  const given = luckClues > 0 ? addLuckClues(made.given, made.solution, geo, luckClues) : made.given;
  const grade = luckClues > 0 ? gradeOfPuzzle(given, geo) : made.grade;

  const perks: Partial<Record<Habit, string>> = {};
  const study = memberFor(party, 'study');
  const sleep = memberFor(party, 'sleep');
  const clean = memberFor(party, 'clean');
  const social = memberFor(party, 'social');
  const hygiene = memberFor(party, 'hygiene');
  if (study) perks.study = study.name;
  if (sleep) perks.sleep = sleep.name;
  if (clean) perks.clean = clean.name;
  if (social) perks.social = social.name;
  if (hygiene) perks.hygiene = hygiene.name;

  const freeHintsTotal = buffAmount(run, 'hint') + (study ? 1 + (study.power >= 24 ? 1 : 0) : 0);
  const sleepPercent = sleep ? Math.min(60, 10 + Math.floor(sleep.power / 2)) : 0;
  const par = Math.floor((PAR_SECONDS[difficulty] * (100 + sleepPercent)) / 100) + buffAmount(run, 'time');

  return {
    seed,
    locale,
    difficulty,
    n,
    grade,
    wanted,
    clues: geo.cells - emptyCount(given),
    given,
    solution: made.solution,
    grid: given,
    notes: Array.from({ length: geo.cells }, () => 0),
    past: [],
    future: [],
    seconds: 0,
    par,
    mistakes: 0,
    hints: 0,
    freeHints: freeHintsTotal,
    freeHintsTotal,
    checks: 0,
    freeChecksTotal: hygiene ? 1 : 0,
    moves: 0,
    flagged: [],
    perks,
    cleanOn: clean !== null,
    tech: { naked: 0, hidden: 0, deeper: 0 },
    last: null,
    steps: 0,
    forfeited: false,
    troops: party.members.map((m) => m.id),
    luckClues,
    ops: made.ops,
  };
}

// ---------------------------------------------------------------------------
// Reduce
// ---------------------------------------------------------------------------

/** Remove `digit` from the notes of every peer of `cell`; returns the same array when nothing changes. */
function dropNotes(notes: number[], cell: number, digit: number, geo: Geo): number[] {
  const b = bit(digit);
  let out = notes;
  for (const p of geo.peers[cell]!) {
    if ((out[p] ?? 0) & b) {
      if (out === notes) out = notes.slice();
      out[p] = (out[p] ?? 0) & ~b;
    }
  }
  return out;
}

/** Remove every note that a placed digit of a peer rules out. */
function purgeNotes(grid: readonly number[], notes: number[], geo: Geo): number[] {
  let out = notes;
  for (let i = 0; i < grid.length; i++) {
    const d = grid[i] ?? 0;
    if (d) out = dropNotes(out, i, d, geo);
  }
  return out;
}

function remember(s: SudokuState): Snap[] {
  return [...s.past, { grid: s.grid, notes: s.notes }];
}

function stillWrong(s: SudokuState, flagged: readonly number[], grid: readonly number[]): number[] {
  return flagged.filter((i) => !s.given[i] && grid[i] && grid[i] !== s.solution[i]);
}

function last(s: SudokuState, base: Omit<Last, 'id' | 'count'> & { count?: number }): Last {
  return { count: 0, ...base, id: s.steps + 1 };
}

function place(s: SudokuState, cell: number, digit: number): SudokuState {
  const geo = geoOf(s);
  if (!Number.isInteger(cell) || cell < 0 || cell >= geo.cells || !Number.isInteger(digit) || digit < 1 || digit > s.n) return s;
  if (s.given[cell] || s.grid[cell] === digit) return s;
  const wrong = digit !== s.solution[cell];
  const bucket = wrong ? null : classify(s.grid, cell, digit, geo);
  const grid = s.grid.slice();
  grid[cell] = digit;
  let notes = s.notes.slice();
  notes[cell] = 0;
  if (s.cleanOn) notes = dropNotes(notes, cell, digit, geo);
  return {
    ...s,
    grid,
    notes,
    past: remember(s),
    future: [],
    mistakes: s.mistakes + (wrong ? 1 : 0),
    moves: s.moves + 1,
    flagged: s.flagged.filter((i) => i !== cell),
    tech: bucket ? { ...s.tech, [bucket]: s.tech[bucket] + 1 } : s.tech,
    last: last(s, { kind: 'place', cell, digit }),
    steps: s.steps + 1,
  };
}

function erase(s: SudokuState, cell: number): SudokuState {
  if (!Number.isInteger(cell) || cell < 0 || cell >= s.grid.length || s.given[cell]) return s;
  if (!s.grid[cell] && !s.notes[cell]) return s;
  const grid = s.grid.slice();
  grid[cell] = 0;
  const notes = s.notes.slice();
  notes[cell] = 0;
  return {
    ...s,
    grid,
    notes,
    past: remember(s),
    future: [],
    flagged: s.flagged.filter((i) => i !== cell),
    last: last(s, { kind: 'erase', cell, digit: 0 }),
    steps: s.steps + 1,
  };
}

function note(s: SudokuState, cell: number, digit: number): SudokuState {
  if (!Number.isInteger(cell) || cell < 0 || cell >= s.grid.length || !Number.isInteger(digit) || digit < 1 || digit > s.n) return s;
  if (s.given[cell] || s.grid[cell]) return s;
  const notes = s.notes.slice();
  notes[cell] = (notes[cell] ?? 0) ^ bit(digit);
  return { ...s, notes, past: remember(s), future: [], last: last(s, { kind: 'note', cell, digit }), steps: s.steps + 1 };
}

function hint(s: SudokuState): SudokuState {
  const geo = geoOf(s);
  const counted = { hints: s.hints + 1, freeHints: Math.max(0, s.freeHints - 1), steps: s.steps + 1 };
  const wrong = wrongCells(s);
  if (wrong.length > 0) {
    const cell = wrong[0]!;
    return { ...s, ...counted, flagged: s.flagged.includes(cell) ? s.flagged : [...s.flagged, cell], last: last(s, { kind: 'hint', cell, digit: s.grid[cell] ?? 0, tech: 'mistake' }) };
  }
  const step = nextStep(s.grid, s.solution, geo);
  if (!step) return s;
  const grid = s.grid.slice();
  grid[step.cell] = step.digit;
  let notes = s.notes.slice();
  notes[step.cell] = 0;
  if (s.cleanOn) notes = dropNotes(notes, step.cell, step.digit, geo);
  const bucket = techBucket(step.tech);
  return {
    ...s,
    ...counted,
    grid,
    notes,
    past: remember(s),
    future: [],
    moves: s.moves + 1,
    flagged: s.flagged.filter((i) => i !== step.cell),
    tech: { ...s.tech, [bucket]: s.tech[bucket] + 1 },
    last: last(s, {
      kind: 'hint',
      cell: step.cell,
      digit: step.digit,
      tech: step.tech,
      ...(step.unit ? { unit: step.unit, unitIndex: step.unitIndex ?? 0 } : {}),
    }),
  };
}

function check(s: SudokuState): SudokuState {
  const wrong = wrongCells(s);
  let typed = 0;
  for (let i = 0; i < s.grid.length; i++) if (!s.given[i] && s.grid[i]) typed += 1;
  if (typed === 0) return s;
  return { ...s, checks: s.checks + 1, flagged: wrong, last: last(s, { kind: 'check', cell: wrong[0] ?? -1, digit: 0, count: wrong.length }), steps: s.steps + 1 };
}

function undo(s: SudokuState): SudokuState {
  const snap = s.past[s.past.length - 1];
  if (!snap) return s;
  return {
    ...s,
    grid: snap.grid,
    notes: snap.notes,
    past: s.past.slice(0, -1),
    future: [...s.future, { grid: s.grid, notes: s.notes }],
    flagged: stillWrong(s, s.flagged, snap.grid),
    last: last(s, { kind: 'undo', cell: -1, digit: 0 }),
    steps: s.steps + 1,
  };
}

function redo(s: SudokuState): SudokuState {
  const snap = s.future[s.future.length - 1];
  if (!snap) return s;
  return {
    ...s,
    grid: snap.grid,
    notes: snap.notes,
    past: [...s.past, { grid: s.grid, notes: s.notes }],
    future: s.future.slice(0, -1),
    flagged: stillWrong(s, s.flagged, snap.grid),
    last: last(s, { kind: 'redo', cell: -1, digit: 0 }),
    steps: s.steps + 1,
  };
}

function toggleClean(s: SudokuState): SudokuState {
  if (!s.perks.clean) return s;
  if (s.cleanOn) return { ...s, cleanOn: false, last: last(s, { kind: 'clean', cell: -1, digit: 0 }), steps: s.steps + 1 };
  const notes = purgeNotes(s.grid, s.notes, geoOf(s));
  const changed = notes !== s.notes;
  return {
    ...s,
    cleanOn: true,
    notes,
    past: changed ? remember(s) : s.past,
    future: changed ? [] : s.future,
    last: last(s, { kind: 'clean', cell: -1, digit: 0, count: 1 }),
    steps: s.steps + 1,
  };
}

function reduce(s: SudokuState, a: SudokuAction): SudokuState {
  if (isOver(s)) return s;
  switch (a.type) {
    case 'second':
      return s.seconds >= MAX_SECONDS ? s : { ...s, seconds: s.seconds + 1 };
    case 'place':
      return place(s, a.cell, a.digit);
    case 'erase':
      return erase(s, a.cell);
    case 'note':
      return note(s, a.cell, a.digit);
    case 'hint':
      return hint(s);
    case 'check':
      return check(s);
    case 'undo':
      return undo(s);
    case 'redo':
      return redo(s);
    case 'toggleClean':
      return toggleClean(s);
    case 'forfeit':
      return { ...s, forfeited: true, steps: s.steps + 1 };
    default:
      return s;
  }
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

function outcome(s: SudokuState): Outcome | null {
  if (!isOver(s)) return null;
  const won = isSolved(s);
  const t = strings[s.locale];
  const size = `${s.n}x${s.n}`;
  const blanks = blanksOfPuzzle(s);
  const log: string[] = [];
  const out: Outcome = {
    result: won ? 'won' : 'fled',
    score: scoreOf(s),
    log,
    troopsUsed: s.troops.slice(),
    stats: {
      grade: s.grade,
      size,
      seconds: s.seconds,
      par: s.par,
      mistakes: s.mistakes,
      hints: s.hints,
      checks: s.checks,
      clues: s.clues,
      blanks,
      filled: filledRight(s),
    },
  };
  if (won) {
    log.push(formatText(t.log.won, { time: formatTime(s.seconds), grade: t.grade[s.grade], size }));
    log.push(formatText(t.log.par, { par: formatTime(s.par) }));
    log.push(formatText(t.log.slips, { mistakes: s.mistakes, hints: s.hints, checks: s.checks }));
    const top = topTechnique(s.tech);
    if (top) {
      log.push(formatText(t.log.technique, { technique: t.technique[top].name }));
      out.learned = {
        topic: { en: strings.en.technique[top].name, fr: strings.fr.technique[top].name },
        note: { en: strings.en.technique[top].note, fr: strings.fr.technique[top].note },
      };
    }
  } else {
    log.push(formatText(t.log.fled, { filled: filledRight(s), blanks }));
    log.push(formatText(t.log.slips, { mistakes: s.mistakes, hints: s.hints, checks: s.checks }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------

/**
 * The bot solves by logic, easiest technique first, and when only a deeper
 * step is left it spends a free hint if it has one. It lets seconds go by in
 * proportion to its moves (BOT_PACE_PERCENT of the base par over a whole
 * grid), so its games are timed too.
 */
function botPlay(s: SudokuState): SudokuAction | null {
  if (isOver(s)) return null;
  const blanks = blanksOfPuzzle(s);
  // seconds so far must reach moves * pace / blanks, in integers
  if (blanks > 0 && s.seconds * 100 * blanks < s.moves * BOT_PACE_PERCENT * PAR_SECONDS[s.difficulty]) return { type: 'second' };
  const wrong = wrongCells(s);
  if (wrong.length > 0) return { type: 'erase', cell: wrong[0]! };
  const step = nextStep(s.grid, s.solution, geoOf(s));
  if (!step) return { type: 'forfeit' };
  if ((step.tech === 'guess' || step.tech === 'locked') && s.freeHints > 0) return { type: 'hint' };
  return { type: 'place', cell: step.cell, digit: step.digit };
}

export const engine: GameEngine<SudokuState, SudokuAction> = {
  initial: initialState,
  reduce,
  outcome,
  botPlay,
  forfeit: () => ({ type: 'forfeit' }),
};
