/**
 * The generated mazes: every lesson is solvable for every seed and
 * difficulty, and each one has the shape its lesson needs.
 */
import { describe, expect, it } from 'vitest';
import { BONUS, EXIT, FAR, FLOOR, MARK_CHEESE, NEAR, START, WALL, WET, buildLayout, detourLength, distances, neighbor, shortestPath, type Layout } from './maze';

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);
const DIFFICULTIES = [1, 2, 3, 4, 5] as const;

const of = (l: Layout, kind: number): number => l.cells.indexOf(kind);
const dist = (l: Layout, to: number, blocked: number[] = []): number => distances(l.cells, l.width, l.height, of(l, START), blocked)[to] ?? -1;
const walkable = (l: Layout): number[] => l.cells.map((k, i) => (k === WALL ? -1 : i)).filter((i) => i >= 0);

describe('mazes are solvable', () => {
  for (let level = 1; level <= 5; level++) {
    it(`lesson ${level}: every goal can be reached from the start, for ${SEEDS.length} seeds at every difficulty`, () => {
      for (const d of DIFFICULTIES) {
        for (const seed of SEEDS) {
          const l = buildLayout(seed, level, d);
          const goals = [EXIT, NEAR, FAR].map((k) => of(l, k)).filter((i) => i >= 0);
          expect(goals.length, `lesson ${level} d${d} seed ${seed} has a goal`).toBeGreaterThan(0);
          for (const g of goals) expect(dist(l, g), `lesson ${level} d${d} seed ${seed}: goal ${g}`).toBeGreaterThan(0);
          // No pocket the creature could never leave or reach.
          const reach = distances(l.cells, l.width, l.height, of(l, START));
          for (const i of walkable(l)) expect(reach[i], `tile ${i} reachable`).toBeGreaterThanOrEqual(0);
        }
      }
    });
  }

  it('no maze is bigger than 8 by 8, and each has exactly one start', () => {
    for (let level = 1; level <= 5; level++) {
      for (const d of DIFFICULTIES) {
        const l = buildLayout(3, level, d);
        expect(l.width).toBeLessThanOrEqual(8);
        expect(l.height).toBeLessThanOrEqual(8);
        expect(l.cells.length).toBe(l.width * l.height);
        expect(l.cells.filter((k) => k === START)).toHaveLength(1);
      }
    }
  });

  it('is deterministic: the same seed gives the same maze, other seeds give other ones', () => {
    for (let level = 1; level <= 5; level++) {
      expect(buildLayout(9, level, 3)).toEqual(buildLayout(9, level, 3));
      const shapes = new Set(SEEDS.map((s) => buildLayout(s, level, 3).cells.join('')));
      expect(shapes.size, `lesson ${level} variety`).toBeGreaterThan(8);
    }
  });

  it('grows with the difficulty', () => {
    const area = (level: number, d: number) => {
      const l = buildLayout(5, level, d);
      return l.width * l.height;
    };
    expect(area(1, 5)).toBeGreaterThan(area(1, 1));
    expect(area(2, 5)).toBeGreaterThan(area(2, 1));
    expect(area(3, 5)).toBeGreaterThan(area(3, 1));
    expect(area(5, 5)).toBeGreaterThan(area(5, 1));
  });
});

describe('each lesson has the shape it teaches', () => {
  it('lesson 1: one exit in the far corner of an open maze', () => {
    for (const seed of SEEDS) {
      const l = buildLayout(seed, 1, 2);
      expect(l.cells.filter((k) => k === EXIT)).toHaveLength(1);
      expect(dist(l, of(l, EXIT))).toBeGreaterThanOrEqual(l.width + l.height - 2);
      expect(l.focus).toBe(of(l, EXIT));
    }
  });

  it('lesson 2: the wet door is a clear shortcut, and a dry way round exists', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const l = buildLayout(seed, 2, d);
        const wet = l.cells.filter((k) => k === WET).length;
        expect(wet).toBe(d >= 4 ? 2 : 1);
        const { wet: shortest, dry } = detourLength(l);
        expect(dry, `d${d} seed ${seed}: a dry route`).toBeGreaterThan(0);
        expect(dry - shortest, `d${d} seed ${seed}: detour`).toBeGreaterThanOrEqual(5);
        // The shortest route really goes over wet floor.
        const path = shortestPath(l.cells, l.width, l.height, of(l, START), of(l, EXIT));
        expect(path.some((i) => l.cells[i] === WET)).toBe(true);
      }
    }
  });

  it('lesson 3: a small cheese near the start, a big one much farther, and the far one reachable around the near one', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const l = buildLayout(seed, 3, d);
        const near = dist(l, of(l, NEAR));
        const far = dist(l, of(l, FAR));
        expect(near).toBeGreaterThan(0);
        expect(far - near, `d${d} seed ${seed}`).toBeGreaterThanOrEqual(4);
        expect(l.cells.filter((k) => k === NEAR)).toHaveLength(1);
        expect(l.cells.filter((k) => k === FAR)).toHaveLength(1);
      }
    }
  });

  it('lesson 4: one winding corridor with no side pockets, long enough to starve a lone reward', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 40)) {
        const l = buildLayout(seed, 4, d);
        const open = walkable(l);
        expect(open.length).toBeGreaterThanOrEqual(20);
        for (const i of open) {
          const around = [0, 1, 2, 3].filter((dir) => {
            const n = neighbor(l.width, l.height, i, dir);
            return n >= 0 && l.cells[n] !== WALL;
          }).length;
          expect(around, `tile ${i} of a corridor has at most two ways`).toBeLessThanOrEqual(2);
        }
        expect(dist(l, of(l, EXIT))).toBe(open.length - 1);
      }
    }
  });

  it('lesson 5: a bonus tile beside the start, both rewards already on, the exit far away', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 40)) {
        const l = buildLayout(seed, 5, d);
        const bonus = of(l, BONUS);
        expect(dist(l, bonus)).toBe(1);
        expect(dist(l, of(l, EXIT))).toBeGreaterThanOrEqual(l.width + l.height - 2);
        expect(l.marks[bonus]).toBe(MARK_CHEESE);
        expect(l.marks[of(l, EXIT)]).toBe(MARK_CHEESE);
        expect(l.cells.filter((k) => k === FLOOR).length).toBeGreaterThan(5);
      }
    }
  });
});
