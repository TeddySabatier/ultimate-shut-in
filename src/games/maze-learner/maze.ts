/**
 * Maze layouts for the five lessons, generated from the seed.
 *
 * Pure and deterministic: `buildLayout(seed, level, difficulty)` always gives
 * the same maze, and every layout is solvable by construction (checked again
 * by the tests for hundreds of seeds). A layout is a grid of tile kinds; the
 * rewards the player writes live in the engine state, not here.
 */
import { fnv1a, mulberry32, rngInt, type Rng } from '../../game/rng';

export const WALL = 0;
export const FLOOR = 1;
export const START = 2;
export const EXIT = 3;
export const NEAR = 4;
export const FAR = 5;
export const WET = 6;
export const BONUS = 7;

export const MARK_NONE = 0;
export const MARK_CHEESE = 1;
export const MARK_PUDDLE = 2;

export const DR = [-1, 0, 1, 0];
export const DC = [0, 1, 0, -1];

export interface Layout {
  width: number;
  height: number;
  cells: number[];
  /** Where the keyboard cursor starts (the tile the lesson is about). */
  focus: number;
  /** Tiles the `hint` buff can point at, most useful first. */
  hints: number[];
  /** Rewards already on the board when the lesson opens. */
  marks: number[];
}

export function isTerminal(kind: number): boolean {
  return kind === EXIT || kind === NEAR || kind === FAR;
}

/** Index of the neighbour of tile `i` in direction `dir` (0 up, 1 right, 2 down, 3 left), or -1 off the grid. */
export function neighbor(width: number, height: number, i: number, dir: number): number {
  const r = Math.trunc(i / width) + (DR[dir] ?? 0);
  const c = (i % width) + (DC[dir] ?? 0);
  if (r < 0 || c < 0 || r >= height || c >= width) return -1;
  return r * width + c;
}

/**
 * Distances from `from` over walkable tiles. Terminal tiles are reached but
 * never crossed (the creature's episode ends on them); `blocked` kinds are
 * not entered at all. Unreachable tiles stay at -1.
 */
export function distances(cells: readonly number[], width: number, height: number, from: number, blocked: readonly number[] = []): number[] {
  const dist = cells.map(() => -1);
  dist[from] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    if (i !== from && isTerminal(cells[i] ?? WALL)) continue;
    for (let d = 0; d < 4; d++) {
      const n = neighbor(width, height, i, d);
      if (n < 0 || dist[n] !== -1) continue;
      const kind = cells[n] ?? WALL;
      if (kind === WALL || blocked.includes(kind)) continue;
      dist[n] = (dist[i] ?? 0) + 1;
      queue.push(n);
    }
  }
  return dist;
}

/** The tiles of one shortest path from `from` to `to` (both included), or [] when there is none. */
export function shortestPath(cells: readonly number[], width: number, height: number, from: number, to: number, blocked: readonly number[] = []): number[] {
  const back = distances(cells, width, height, from, blocked);
  if ((back[to] ?? -1) < 0) return [];
  // Walk back from `to` along strictly decreasing distances, then reverse.
  const path = [to];
  let i = to;
  while (i !== from) {
    let prev = -1;
    for (let d = 0; d < 4; d++) {
      const n = neighbor(width, height, i, d);
      if (n >= 0 && (back[n] ?? -1) >= 0 && (back[n] ?? 0) === (back[i] ?? 0) - 1 && !isTerminal(cells[n] ?? WALL)) {
        prev = n;
        break;
      }
    }
    if (prev < 0) return [];
    path.push(prev);
    i = prev;
  }
  return path.reverse();
}

function grid(width: number, height: number): number[] {
  return Array.from({ length: width * height }, () => FLOOR);
}

function at(width: number, r: number, c: number): number {
  return r * width + c;
}

/** Every walkable tile can be reached from `from` (terminals are dead ends, wet tiles are walkable). */
function allReachable(cells: readonly number[], width: number, height: number, from: number): boolean {
  const dist = distances(cells, width, height, from);
  for (let i = 0; i < cells.length; i++) if ((cells[i] ?? WALL) !== WALL && (dist[i] ?? -1) < 0) return false;
  return true;
}

/** Turn up to `count` random floor tiles into walls, keeping every remaining tile reachable from `from`. */
function sprinkle(
  cells: number[],
  width: number,
  height: number,
  from: number,
  count: number,
  rng: Rng,
  region: (r: number, c: number) => boolean = () => true,
): void {
  let placed = 0;
  for (let tries = 0; tries < count * 12 && placed < count; tries++) {
    const r = rngInt(rng, height);
    const c = rngInt(rng, width);
    const i = at(width, r, c);
    if (cells[i] !== FLOOR || !region(r, c)) continue;
    cells[i] = WALL;
    if (allReachable(cells, width, height, from)) placed += 1;
    else cells[i] = FLOOR;
  }
}

function mirror(cells: readonly number[], width: number, height: number, flipX: boolean, flipY: boolean): number[] {
  const out = cells.slice();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const sr = flipY ? height - 1 - r : r;
      const sc = flipX ? width - 1 - c : c;
      out[at(width, r, c)] = cells[at(width, sr, sc)] ?? WALL;
    }
  }
  return out;
}

function flipIndex(i: number, width: number, height: number, flipX: boolean, flipY: boolean): number {
  const r = Math.trunc(i / width);
  const c = i % width;
  return at(width, flipY ? height - 1 - r : r, flipX ? width - 1 - c : c);
}

const find = (cells: readonly number[], kind: number): number => cells.indexOf(kind);

function findAll(cells: readonly number[], kind: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === kind) out.push(i);
  return out;
}

/** Lesson 4: a snaking corridor, long enough that a lone reward at the end is almost never found by chance. */
function corridor(difficulty: number, rng: Rng): { width: number; height: number; cells: number[] } {
  const rows = 3;
  const width = ([6, 6, 7, 7, 7][difficulty - 1] ?? 7) + rngInt(rng, 2);
  const height = rows * 2 - 1;
  const cells = Array.from({ length: width * height }, () => WALL);
  for (let k = 0; k < rows; k++) for (let c = 0; c < width; c++) cells[at(width, k * 2, c)] = FLOOR;
  for (let k = 0; k < rows - 1; k++) cells[at(width, k * 2 + 1, k % 2 === 0 ? width - 1 : 0)] = FLOOR;
  cells[at(width, 0, 0)] = START;
  cells[at(width, (rows - 1) * 2, rows % 2 === 1 ? width - 1 : 0)] = EXIT;
  return { width, height, cells };
}

/** The layout of one lesson for a seed and a difficulty (1 to 5). */
export function buildLayout(seed: number, level: number, difficulty: number): Layout {
  const d = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const rng = mulberry32(fnv1a(`maze-learner:${seed >>> 0}:${level}:${d}`));
  const flipX = rng() < 0.5;
  const flipY = rng() < 0.5;
  let width = 5;
  let height = 5;
  let cells: number[] = [];
  let focus = 0;
  let hints: number[] = [];
  let marks: number[] = [];

  if (level === 1) {
    width = height = [5, 5, 5, 6, 6][d - 1] ?? 5;
    cells = grid(width, height);
    cells[0] = START;
    cells[at(width, height - 1, width - 1)] = EXIT;
    sprinkle(cells, width, height, 0, Math.floor(width * height * 0.2), rng);
    const exit = find(cells, EXIT);
    focus = exit;
    hints = [exit];
  } else if (level === 2) {
    // A wall across the middle with two doors: a short one over wet floor, a long dry one.
    width = [6, 7, 7, 8, 8][d - 1] ?? 7;
    height = [5, 5, 5, 6, 6][d - 1] ?? 5;
    const thick = d >= 4 ? 2 : 1;
    const barTop = Math.floor((height - thick) / 2);
    const wetCol = rngInt(rng, 2);
    const outside = (r: number) => r < barTop || r >= barTop + thick;
    const base = grid(width, height);
    for (let t = 0; t < thick; t++) {
      for (let c = 0; c < width; c++) base[at(width, barTop + t, c)] = c === wetCol ? WET : c === wetCol + 4 ? FLOOR : WALL;
    }
    base[0] = START;
    base[at(width, height - 1, 1 - wetCol)] = EXIT;
    cells = base;
    // Extra walls only where they keep a clearly longer dry route open.
    for (let attempt = 0; attempt < 24; attempt++) {
      const trial = base.slice();
      sprinkle(trial, width, height, 0, 2 + (d >= 3 ? 1 : 0), rng, (r) => outside(r));
      const { wet: wetLen, dry } = detourLength({ cells: trial, width, height });
      if (dry >= 0 && dry - wetLen >= 5) {
        cells = trial;
        break;
      }
    }
    const wet = findAll(cells, WET);
    focus = wet[0] ?? 0;
    hints = wet;
  } else if (level === 3) {
    width = [5, 5, 6, 6, 7][d - 1] ?? 6;
    height = [3, 3, 3, 4, 4][d - 1] ?? 4;
    cells = grid(width, height);
    const start = at(width, height - 1, 0);
    cells[start] = START;
    cells[at(width, height - 1, 2)] = NEAR;
    cells[at(width, 0, width - 1)] = FAR;
    sprinkle(cells, width, height, start, 3, rng);
    focus = start;
    hints = [find(cells, FAR)];
  } else if (level === 4) {
    const built = corridor(d, rng);
    ({ width, height, cells } = built);
    const path = shortestPath(cells, width, height, find(cells, START), find(cells, EXIT));
    const pick = (f: number) => path[Math.max(1, Math.min(path.length - 2, Math.floor(path.length * f)))] ?? 0;
    hints = [pick(0.5), pick(0.25), pick(0.75), pick(0.15), pick(0.4), pick(0.6), pick(0.88)];
    focus = hints[0] ?? 0;
  } else {
    width = height = [5, 6, 6, 6, 7][d - 1] ?? 6;
    cells = grid(width, height);
    cells[0] = START;
    const bonus = rngInt(rng, 2) === 0 ? 1 : width;
    cells[bonus] = BONUS;
    cells[at(width, height - 1, width - 1)] = EXIT;
    sprinkle(cells, width, height, 0, Math.floor(width * height * 0.15), rng, (r, c) => r + c > 1);
    focus = bonus;
    hints = [bonus];
    marks = cells.map((k) => (k === EXIT || k === BONUS ? MARK_CHEESE : MARK_NONE));
  }

  if (flipX || flipY) {
    cells = mirror(cells, width, height, flipX, flipY);
    focus = flipIndex(focus, width, height, flipX, flipY);
    hints = hints.map((h) => flipIndex(h, width, height, flipX, flipY));
    marks = marks.length ? mirror(marks, width, height, flipX, flipY) : marks;
  }
  if (marks.length === 0) marks = cells.map(() => MARK_NONE);
  return { width, height, cells, focus, hints, marks };
}

/** Lesson 2 sanity: the wet route against the dry one (lengths from the start to the exit). Exported for the tests. */
export function detourLength(layout: Pick<Layout, 'cells' | 'width' | 'height'>): { wet: number; dry: number } {
  const start = find(layout.cells, START);
  const exit = find(layout.cells, EXIT);
  const any = distances(layout.cells, layout.width, layout.height, start)[exit] ?? -1;
  const dry = distances(layout.cells, layout.width, layout.height, start, [WET])[exit] ?? -1;
  return { wet: any, dry };
}
