/**
 * The solver: a human-style technique ladder (used for grading, hints and the
 * bot) and an exact backtracking counter (used to prove uniqueness).
 *
 * Ladder, easiest first: naked single, hidden single, naked pair, locked
 * candidates (pointing and claiming), then a guess. A puzzle's grade is the
 * hardest technique the ladder needs, always trying the easier ones first.
 */
import { bit, candidatesOfCell, emptyCount, lowestDigit, popcount, unitKind, type Geo, type UnitKind } from './grid';

export type Tech = 'naked' | 'hidden' | 'pair' | 'locked' | 'guess';
export type Grade = 'easy' | 'medium' | 'hard';

export const TECH_RANK: Record<Tech, number> = { naked: 1, hidden: 2, pair: 3, locked: 4, guess: 5 };
export const GRADE_OF: Record<Tech, Grade> = { naked: 'easy', hidden: 'medium', pair: 'medium', locked: 'hard', guess: 'hard' };
export const GRADE_RANK: Record<Grade, number> = { easy: 1, medium: 2, hard: 3 };
/** The hardest technique each grade may use when a puzzle is carved to that grade. */
export const GRADE_CEILING: Record<Grade, Tech> = { easy: 'naked', medium: 'pair', hard: 'guess' };

/** One placement the ladder found. `tech` is the hardest technique that was needed to reach it. */
export interface Step {
  cell: number;
  digit: number;
  tech: Tech;
  /** For a hidden single: where the digit has only one place. */
  unit?: UnitKind;
  /** The row, column or box number (0-based) of `unit`. */
  unitIndex?: number;
}

/** A counter passed down a call, never stored: how many solver steps and nodes were spent. */
export interface Ops {
  n: number;
}

/** Candidate masks of every cell of a grid (0 for filled cells). */
export function candidates(grid: readonly number[], geo: Geo): number[] {
  return grid.map((d, i) => (d ? 0 : candidatesOfCell(grid, i, geo)));
}

function findNaked(cand: readonly number[]): Step | null {
  for (let i = 0; i < cand.length; i++) {
    const m = cand[i] ?? 0;
    if (m && popcount(m) === 1) return { cell: i, digit: lowestDigit(m), tech: 'naked' };
  }
  return null;
}

function findHidden(cand: readonly number[], geo: Geo): Step | null {
  const n = geo.n;
  for (let u = 0; u < geo.units.length; u++) {
    const unit = geo.units[u]!;
    for (let d = 1; d <= n; d++) {
      const b = bit(d);
      let found = -1;
      let count = 0;
      for (const i of unit) {
        if ((cand[i] ?? 0) & b) {
          count += 1;
          found = i;
        }
      }
      if (count === 1) return { cell: found, digit: d, tech: 'hidden', unit: unitKind(geo, u), unitIndex: u % n };
    }
  }
  return null;
}

/** Naked pairs: two cells of a unit with the same two candidates own them. Edits `cand`; true when anything changed. */
function eliminatePairs(cand: number[], geo: Geo): boolean {
  let changed = false;
  for (const unit of geo.units) {
    for (let a = 0; a < unit.length; a++) {
      const i = unit[a]!;
      const mask = cand[i] ?? 0;
      if (popcount(mask) !== 2) continue;
      for (let b = a + 1; b < unit.length; b++) {
        const j = unit[b]!;
        if (cand[j] !== mask) continue;
        for (const k of unit) {
          if (k === i || k === j) continue;
          const before = cand[k] ?? 0;
          const after = before & ~mask;
          if (after !== before) {
            cand[k] = after;
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}

/** The other units that contain every cell of `where` (a box when `where` lies in one line; a row or a column when it lies in one box). */
function sharedUnits(where: readonly number[], isBox: boolean, geo: Geo): number[] {
  const first = where[0]!;
  const out: number[] = [];
  if (isBox) {
    if (where.every((i) => geo.rowOf[i] === geo.rowOf[first])) out.push(geo.rowOf[first]!);
    if (where.every((i) => geo.colOf[i] === geo.colOf[first])) out.push(geo.n + geo.colOf[first]!);
  } else if (where.every((i) => geo.boxOf[i] === geo.boxOf[first])) out.push(2 * geo.n + geo.boxOf[first]!);
  return out;
}

/**
 * Locked candidates. Pointing: a digit confined to one line inside a box
 * leaves the rest of that line. Claiming: a digit confined to one box inside
 * a line leaves the rest of that box.
 */
function eliminateLocked(cand: number[], geo: Geo): boolean {
  let changed = false;
  const n = geo.n;
  for (let u = 0; u < geo.units.length; u++) {
    const unit = geo.units[u]!;
    for (let d = 1; d <= n; d++) {
      const b = bit(d);
      const where = unit.filter((i) => (cand[i] ?? 0) & b);
      if (where.length < 2) continue;
      for (const id of sharedUnits(where, u >= 2 * n, geo)) {
        for (const k of geo.units[id]!) {
          if (unit.includes(k)) continue;
          const before = cand[k] ?? 0;
          if (before & b) {
            cand[k] = before & ~b;
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}

export interface LogicResult {
  solved: boolean;
  grid: number[];
  steps: Step[];
  /** Hardest technique that was needed; `guess` when the ladder got stuck. */
  hardest: Tech;
}

function place(grid: number[], cand: number[], cell: number, digit: number, geo: Geo): void {
  grid[cell] = digit;
  cand[cell] = 0;
  const b = bit(digit);
  for (const p of geo.peers[cell]!) cand[p] = (cand[p] ?? 0) & ~b;
}

/**
 * Solve with the ladder, never using a technique above `ceiling`. Easier
 * techniques are always tried first, so `hardest` is what the puzzle needs.
 */
export function logicSolve(puzzle: readonly number[], geo: Geo, ceiling: Tech = 'locked', ops?: Ops): LogicResult {
  const grid = puzzle.slice();
  const cand = candidates(grid, geo);
  const steps: Step[] = [];
  let hardest: Tech = 'naked';
  const cap = TECH_RANK[ceiling];
  const note = (t: Tech) => {
    if (TECH_RANK[t] > TECH_RANK[hardest]) hardest = t;
  };
  let guard = geo.cells * 4;
  while (emptyCount(grid) > 0 && guard-- > 0) {
    if (ops) ops.n += 1;
    const naked = findNaked(cand);
    if (naked) {
      steps.push(naked);
      place(grid, cand, naked.cell, naked.digit, geo);
      continue;
    }
    const hidden = cap >= TECH_RANK.hidden ? findHidden(cand, geo) : null;
    if (hidden) {
      steps.push(hidden);
      note('hidden');
      place(grid, cand, hidden.cell, hidden.digit, geo);
      continue;
    }
    if (cap >= TECH_RANK.pair && eliminatePairs(cand, geo)) {
      note('pair');
      continue;
    }
    if (cap >= TECH_RANK.locked && eliminateLocked(cand, geo)) {
      note('locked');
      continue;
    }
    return { solved: false, grid, steps, hardest: 'guess' };
  }
  return { solved: emptyCount(grid) === 0, grid, steps, hardest };
}

export function gradeOfPuzzle(puzzle: readonly number[], geo: Geo, ops?: Ops): Grade {
  return GRADE_OF[logicSolve(puzzle, geo, 'locked', ops).hardest];
}

/**
 * The next placement a person could make from `grid`, with the technique that
 * justifies it. When only a guess is left, the digit comes from `solution`
 * (the cell with the fewest candidates is chosen). Null for a full grid or a
 * grid with a contradiction.
 */
export function nextStep(grid: readonly number[], solution: readonly number[], geo: Geo): Step | null {
  const fresh = candidates(grid, geo);
  const cand = fresh.slice();
  const naked = findNaked(cand);
  if (naked) return naked;
  const hidden = findHidden(cand, geo);
  if (hidden) return hidden;
  let tech: Tech = 'pair';
  for (let guard = 0; guard < geo.cells; guard++) {
    const pair = eliminatePairs(cand, geo);
    const locked = !pair && eliminateLocked(cand, geo);
    if (!pair && !locked) break;
    if (locked) tech = 'locked';
    const s = findNaked(cand) ?? findHidden(cand, geo);
    if (s) return { cell: s.cell, digit: s.digit, tech };
  }
  let best = -1;
  let bestCount = 99;
  for (let i = 0; i < fresh.length; i++) {
    const m = fresh[i] ?? 0;
    if (!m) continue;
    const c = popcount(m);
    if (c < bestCount) {
      best = i;
      bestCount = c;
    }
  }
  if (best < 0) return null;
  return { cell: best, digit: solution[best] ?? lowestDigit(fresh[best] ?? 0), tech: 'guess' };
}

/**
 * Count solutions up to `limit` by backtracking on the cell with the fewest
 * candidates. `ops.n` counts visited nodes; past `cap` the count is reported
 * as `limit` (so a caller that wants "exactly one" safely rejects).
 */
export function countSolutions(grid: readonly number[], geo: Geo, limit = 2, ops?: Ops, cap = Infinity): number {
  const cells = grid.slice();
  const row = Array.from({ length: geo.n }, () => 0);
  const col = Array.from({ length: geo.n }, () => 0);
  const box = Array.from({ length: geo.n }, () => 0);
  for (let i = 0; i < cells.length; i++) {
    const d = cells[i] ?? 0;
    if (!d) continue;
    const b = bit(d);
    if (row[geo.rowOf[i]!]! & b || col[geo.colOf[i]!]! & b || box[geo.boxOf[i]!]! & b) return 0;
    row[geo.rowOf[i]!]! |= b;
    col[geo.colOf[i]!]! |= b;
    box[geo.boxOf[i]!]! |= b;
  }
  let found = 0;
  const visit = (): void => {
    if (ops) {
      ops.n += 1;
      if (ops.n > cap) {
        found = limit;
        return;
      }
    }
    let best = -1;
    let bestMask = 0;
    let bestCount = 99;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) continue;
      const mask = geo.all & ~row[geo.rowOf[i]!]! & ~col[geo.colOf[i]!]! & ~box[geo.boxOf[i]!]!;
      const c = popcount(mask);
      if (c < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = c;
        if (c <= 1) break;
      }
    }
    if (best < 0) {
      found += 1;
      return;
    }
    if (bestCount === 0) return;
    const r = geo.rowOf[best]!;
    const c = geo.colOf[best]!;
    const bx = geo.boxOf[best]!;
    for (let d = 1; d <= geo.n && found < limit; d++) {
      const b = bit(d);
      if (!(bestMask & b)) continue;
      cells[best] = d;
      row[r]! |= b;
      col[c]! |= b;
      box[bx]! |= b;
      visit();
      cells[best] = 0;
      row[r]! &= ~b;
      col[c]! &= ~b;
      box[bx]! &= ~b;
    }
  };
  visit();
  return found;
}

/** The unique solution of a puzzle, or null when it has none or several. */
export function solveUnique(puzzle: readonly number[], geo: Geo): number[] | null {
  if (countSolutions(puzzle, geo, 2) !== 1) return null;
  const cells = puzzle.slice();
  const fill = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 99;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) continue;
      const mask = candidatesOfCell(cells, i, geo);
      const c = popcount(mask);
      if (c < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = c;
      }
    }
    if (best < 0) return true;
    for (let d = 1; d <= geo.n; d++) {
      if (!(bestMask & bit(d))) continue;
      cells[best] = d;
      if (fill()) return true;
      cells[best] = 0;
    }
    return false;
  };
  return fill() ? cells : null;
}
