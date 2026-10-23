/**
 * Sudoku geometry and the small pure helpers every other file shares: units,
 * peers, digit masks, conflicts, per-digit counts. A grid is a plain array of
 * n*n digits, 0 for an empty cell, row-major. Boards are 6x6 (2x3 boxes) or
 * 9x9 (3x3 boxes). The tables below are constants computed from the size.
 */

export type Size = 6 | 9;
export type UnitKind = 'row' | 'col' | 'box';

export interface Geo {
  n: Size;
  cells: number;
  boxR: number;
  boxC: number;
  /** Rows 0..n-1, then columns n..2n-1, then boxes 2n..3n-1; each lists its cells. */
  units: number[][];
  rowOf: number[];
  colOf: number[];
  boxOf: number[];
  /** The three units (row, column, box) every cell belongs to. */
  unitsOfCell: number[][];
  /** Every other cell that shares a unit with the cell. */
  peers: number[][];
  /** Bit mask with every digit 1..n set. */
  all: number;
}

function makeGeo(n: Size): Geo {
  const boxR = n === 6 ? 2 : 3;
  const boxC = 3;
  const cells = n * n;
  const rowOf: number[] = [];
  const colOf: number[] = [];
  const boxOf: number[] = [];
  for (let i = 0; i < cells; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    rowOf.push(r);
    colOf.push(c);
    boxOf.push(Math.floor(r / boxR) * (n / boxC) + Math.floor(c / boxC));
  }
  const units: number[][] = Array.from({ length: 3 * n }, () => []);
  for (let i = 0; i < cells; i++) {
    units[rowOf[i]!]!.push(i);
    units[n + colOf[i]!]!.push(i);
    units[2 * n + boxOf[i]!]!.push(i);
  }
  const unitsOfCell = Array.from({ length: cells }, (_, i) => [rowOf[i]!, n + colOf[i]!, 2 * n + boxOf[i]!]);
  const peers = Array.from({ length: cells }, (_, i) => {
    const set: number[] = [];
    for (const u of unitsOfCell[i]!) for (const j of units[u]!) if (j !== i && !set.includes(j)) set.push(j);
    return set.sort((a, b) => a - b);
  });
  return { n, cells, boxR, boxC, units, rowOf, colOf, boxOf, unitsOfCell, peers, all: (1 << n) - 1 };
}

const GEO6 = makeGeo(6);
const GEO9 = makeGeo(9);

export function geoFor(n: Size): Geo {
  return n === 6 ? GEO6 : GEO9;
}

export function unitKind(geo: Geo, unit: number): UnitKind {
  return unit < geo.n ? 'row' : unit < 2 * geo.n ? 'col' : 'box';
}

/** Mask bit of digit `d` (1..n). */
export const bit = (d: number): number => 1 << (d - 1);

export function popcount(mask: number): number {
  let x = mask;
  let count = 0;
  while (x) {
    x &= x - 1;
    count += 1;
  }
  return count;
}

/** The lowest digit of a non-empty mask (0 for an empty mask). */
export function lowestDigit(mask: number): number {
  if (!mask) return 0;
  let d = 1;
  let m = mask;
  while (!(m & 1)) {
    m >>= 1;
    d += 1;
  }
  return d;
}

/** The digits of a mask, ascending. */
export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; mask >> (d - 1); d++) if (mask & bit(d)) out.push(d);
  return out;
}

export function emptyCount(grid: readonly number[]): number {
  let count = 0;
  for (const v of grid) if (v === 0) count += 1;
  return count;
}

/** Every cell that shares a row, column or box with an equal digit, ascending and exact. */
export function conflictCells(grid: readonly number[], geo: Geo): number[] {
  const bad = new Set<number>();
  for (const unit of geo.units) {
    const seen = new Map<number, number>();
    for (const i of unit) {
      const d = grid[i] ?? 0;
      if (!d) continue;
      const first = seen.get(d);
      if (first === undefined) seen.set(d, i);
      else {
        bad.add(first);
        bad.add(i);
      }
    }
  }
  return [...bad].sort((a, b) => a - b);
}

/** How many of each digit 1..n are still to place: index 0 is digit 1. */
export function remainingPerDigit(grid: readonly number[], geo: Geo): number[] {
  const left: number[] = Array.from({ length: geo.n }, () => geo.n as number);
  for (const d of grid) if (d > 0) left[d - 1] = (left[d - 1] ?? 0) - 1;
  return left;
}

/** True when the grid is full and every row, column and box holds each digit once. */
export function isValidComplete(grid: readonly number[], geo: Geo): boolean {
  if (grid.length !== geo.cells) return false;
  for (const unit of geo.units) {
    let mask = 0;
    for (const i of unit) {
      const d = grid[i] ?? 0;
      if (d < 1 || d > geo.n || mask & bit(d)) return false;
      mask |= bit(d);
    }
  }
  return true;
}

/** Digits a cell could still take, from the placed digits of its peers (ignores notes). */
export function candidatesOfCell(grid: readonly number[], cell: number, geo: Geo): number {
  let used = 0;
  for (const p of geo.peers[cell]!) {
    const d = grid[p] ?? 0;
    if (d) used |= bit(d);
  }
  return geo.all & ~used;
}
