/**
 * The puzzle generator. All randomness comes from `seed`.
 *
 * 1. Build a full valid grid by seeded randomised backtracking.
 * 2. Remove clues in a seeded order. A removal is kept only when the puzzle
 *    still has exactly one solution (the exact counter, up to two) and, for
 *    the easy and medium tiers, when the technique ladder can still solve it
 *    without anything above that tier's ceiling.
 * 3. Grade the result by the hardest technique the ladder needs. A puzzle
 *    graded below the request is thrown away and the next derived seed is
 *    tried (bounded attempts); if every attempt falls short, the best one is
 *    returned with its true grade (never a relabelled one).
 */
import { fnv1a, mulberry32, rngInt, type Rng } from '../../game/rng';
import { bit, emptyCount, popcount, type Geo, type Size } from './grid';
import { GRADE_CEILING, GRADE_RANK, TECH_RANK, countSolutions, gradeOfPuzzle, logicSolve, type Grade, type Ops } from './logic';

/** Carving stops at this many clues even if more could go: the easy tiers stay easy. */
export const CLUE_FLOOR: Record<Size, Record<Grade, number>> = {
  6: { easy: 14, medium: 9, hard: 8 },
  9: { easy: 34, medium: 28, hard: 24 },
};

/** Derived seeds tried before the best puzzle so far is accepted. */
export const MAX_ATTEMPTS = 12;
/** Solver nodes and steps one `generate` call may spend (a safety stop; real calls use a small part of it). */
export const OPS_CAP = 400_000;

export interface Generated {
  given: number[];
  solution: number[];
  /** The true grade of `given`, from the ladder. */
  grade: Grade;
  clues: number;
  /** Derived seeds used (1 = the first worked). */
  attempts: number;
  /** Solver nodes and steps spent: the bound the tests assert, never wall time. */
  ops: number;
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/** A complete valid grid: randomised backtracking on the cell with the fewest candidates. */
export function completeGrid(rng: Rng, geo: Geo, ops: Ops): number[] {
  const cells = Array.from({ length: geo.cells }, () => 0);
  const row = Array.from({ length: geo.n }, () => 0);
  const col = Array.from({ length: geo.n }, () => 0);
  const box = Array.from({ length: geo.n }, () => 0);
  const visit = (): boolean => {
    ops.n += 1;
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
      }
    }
    if (best < 0) return true;
    const r = geo.rowOf[best]!;
    const c = geo.colOf[best]!;
    const bx = geo.boxOf[best]!;
    const digits: number[] = [];
    for (let d = 1; d <= geo.n; d++) if (bestMask & bit(d)) digits.push(d);
    for (const d of shuffle(rng, digits)) {
      const b = bit(d);
      cells[best] = d;
      row[r]! |= b;
      col[c]! |= b;
      box[bx]! |= b;
      if (visit()) return true;
      cells[best] = 0;
      row[r]! &= ~b;
      col[c]! &= ~b;
      box[bx]! &= ~b;
    }
    return false;
  };
  visit();
  return cells;
}

/** Remove clues in a seeded order, keeping the solution unique and the puzzle inside the grade's ceiling. */
function carve(solution: readonly number[], rng: Rng, geo: Geo, grade: Grade, ops: Ops): number[] {
  const puzzle = solution.slice();
  let clues = puzzle.length;
  const floor = CLUE_FLOOR[geo.n][grade];
  const ceiling = GRADE_CEILING[grade];
  const bounded = TECH_RANK[ceiling] < TECH_RANK.guess;
  for (const cell of shuffle(rng, Array.from({ length: puzzle.length }, (_, i) => i))) {
    if (clues <= floor || ops.n > OPS_CAP) break;
    const digit = puzzle[cell]!;
    puzzle[cell] = 0;
    const ok = (!bounded || logicSolve(puzzle, geo, ceiling, ops).solved) && countSolutions(puzzle, geo, 2, ops, OPS_CAP) === 1;
    if (ok) clues -= 1;
    else puzzle[cell] = digit;
  }
  return puzzle;
}

export function generate(seed: number, geo: Geo, grade: Grade): Generated {
  const ops: Ops = { n: 0 };
  let best: Generated | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = mulberry32(fnv1a(`sudoku:${seed >>> 0}:${geo.n}:${attempt}`));
    const solution = completeGrid(rng, geo, ops);
    const given = carve(solution, rng, geo, grade, ops);
    const got = gradeOfPuzzle(given, geo, ops);
    const result: Generated = { given, solution, grade: got, clues: geo.cells - emptyCount(given), attempts: attempt + 1, ops: ops.n };
    if (GRADE_RANK[got] >= GRADE_RANK[grade]) return result;
    if (best === null || GRADE_RANK[got] > GRADE_RANK[best.grade]) best = result;
    if (ops.n > OPS_CAP) break;
  }
  return { ...(best as Generated), ops: ops.n };
}

/**
 * The luck buff: put `extra` more digits in the grid, taken from where the
 * ladder had the most trouble (the cells it could not reach, then hidden
 * singles, then the latest placements), so the same seed feels gentler.
 */
export function addLuckClues(given: readonly number[], solution: readonly number[], geo: Geo, extra: number): number[] {
  const out = given.slice();
  if (extra <= 0) return out;
  const trace = logicSolve(given, geo, 'locked');
  const rank = new Map<number, number>();
  trace.steps.forEach((s, k) => rank.set(s.cell, (s.tech === 'hidden' ? 2000 : 1000) + k));
  const empties: number[] = [];
  for (let i = 0; i < given.length; i++) if (!given[i]) empties.push(i);
  const weight = (i: number) => (trace.grid[i] === 0 ? 100000 - i : (rank.get(i) ?? 0));
  empties.sort((a, b) => weight(b) - weight(a) || a - b);
  for (const i of empties.slice(0, Math.min(extra, Math.max(0, empties.length - 2)))) out[i] = solution[i]!;
  return out;
}
