import { describe, expect, it } from 'vitest';
import { rings } from './content';
import {
  ISLAND_RADIUS,
  ZONE_RADII,
  canHoldOutpost,
  cellKind,
  compassVector,
  islandCells,
  isIslandCell,
  ringFraction,
  wallRadius,
  zoneOfCell,
} from './mapGeometry';

describe('mapGeometry', () => {
  it('keeps 221 island cells in seven zones with the design counts', () => {
    const cells = islandCells();
    expect(cells).toHaveLength(221);
    const perZone = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const c of cells) perZone[zoneOfCell(c)]! += 1;
    expect(perZone.slice(1)).toEqual([1, 8, 12, 24, 36, 56, 84]);
    expect(zoneOfCell({ x: 0, y: 0 })).toBe(1);
    expect(zoneOfCell({ x: 9, y: 0 })).toBe(8);
    expect(isIslandCell({ x: 8, y: 2 })).toBe(true);
    expect(isIslandCell({ x: 8, y: 3 })).toBe(false);
    expect(isIslandCell({ x: 1.5, y: 0 })).toBe(false);
    expect(ZONE_RADII[6]).toBe(ISLAND_RADIUS);
  });

  it('fixes streets, water, hills and landmarks by position', () => {
    expect(cellKind({ x: 0, y: 0 })).toBe('haven');
    expect(cellKind({ x: 4, y: 1 })).toBe('road');
    expect(cellKind({ x: 3, y: 1 })).toBe('lot');
    expect(cellKind({ x: 2, y: 1 })).toBe('lot'); // zone 3: no streets inside the home zones
    expect(cellKind({ x: 7, y: 1 })).toBe('river');
    expect(cellKind({ x: 8, y: 0 })).toBe('bridge');
    expect(cellKind({ x: -7, y: 1 })).toBe('hill');
    expect(cellKind({ x: -5, y: 2 })).toBe('pond');
    expect(cellKind({ x: -6, y: 1 })).toBe('park');
    expect(cellKind({ x: 5, y: -2 })).toBe('library');
    expect(cellKind({ x: 2, y: -5 })).toBe('clinic');
  });

  it('allows outposts on lots and landmarks only, never in the Room', () => {
    expect(canHoldOutpost({ x: 0, y: 0 })).toBe(false);
    expect(canHoldOutpost({ x: 1, y: 0 })).toBe(true);
    expect(canHoldOutpost({ x: 4, y: 1 })).toBe(false);
    expect(canHoldOutpost({ x: 7, y: 1 })).toBe(false);
    expect(canHoldOutpost({ x: -5, y: 2 })).toBe(false);
    expect(canHoldOutpost({ x: -6, y: 1 })).toBe(true);
    expect(canHoldOutpost({ x: 5, y: -2 })).toBe(true);
    expect(canHoldOutpost({ x: 9, y: 9 })).toBe(false);
    // Every zone from The Flat out has somewhere to stand.
    for (let z = 2; z <= 7; z++) expect(islandCells().some((c) => zoneOfCell(c) === z && canHoldOutpost(c)), `zone ${z}`).toBe(true);
  });

  it('wallRadius is monotonic, starts at the ring edge and stops short of the next zone', () => {
    let prev = -1;
    for (let dp = 0; dp <= 2600; dp += 5) {
      const r = wallRadius(dp);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
      const { ring, next } = ringFraction(dp);
      expect(r).toBeGreaterThanOrEqual(ZONE_RADII[ring - 1]!);
      if (next) expect(r).toBeLessThan(ZONE_RADII[next - 1]!);
    }
    expect(wallRadius(0)).toBeCloseTo(0.82, 5);
    // 85% of the gap (minus the pad) just before the threshold.
    const flatAt = rings[1]!.domainPointsRequired;
    const before = wallRadius(flatAt - 1);
    expect(before).toBeLessThan(0.62 + 0.2 + (1.62 - 0.62 - 0.2) * 0.85);
    expect(before).toBeGreaterThan(0.62 + 0.2 + (1.62 - 0.62 - 0.2) * 0.84);
    expect(wallRadius(flatAt)).toBeCloseTo(1.82, 5);
    expect(wallRadius(2500)).toBeCloseTo(ISLAND_RADIUS + 0.2, 5);
    expect(wallRadius(99_999)).toBeCloseTo(ISLAND_RADIUS + 0.2, 5);
  });

  it('ringFraction follows rings.json', () => {
    expect(ringFraction(0)).toEqual({ ring: 1, fraction: 0, next: 2 });
    expect(ringFraction(60)).toEqual({ ring: 1, fraction: 0.5, next: 2 });
    expect(ringFraction(2500)).toEqual({ ring: 7, fraction: 1, next: null });
    expect(ringFraction(1400).ring).toBe(5);
    expect(ringFraction(1400).fraction).toBeCloseTo(0.5, 5);
  });

  it('compass vectors are unit length and point the way the map is drawn', () => {
    for (const d of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const) {
      const v = compassVector(d);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
    }
    // North on screen is "up", which on the isometric grid is toward negative x and y.
    const n = compassVector('n');
    expect(n.x).toBeLessThan(0);
    expect(n.y).toBeLessThan(0);
    const e = compassVector('e');
    expect(e.x).toBeGreaterThan(0);
    expect(e.y).toBeLessThan(0);
  });
});
