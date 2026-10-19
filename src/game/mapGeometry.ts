/**
 * City Map geometry shared by the engine and the UI (docs/design/CITY-MAP.md
 * 2.1, 2.2). The island is a 17 x 17 grid of cells kept when
 * `hypot(x, y) <= 8.25`; seven concentric zones are rings of cells by
 * distance from the centre and match the seven rings of `rings.json`.
 * Nothing here depends on a seed: the streets, river, park and landmarks are
 * fixed by zone, so the engine can place outposts without the UI's layout.
 */
import { rings } from './content';
import type { MapCell, RingId } from './types';

/** Outer radius of each zone, in cells (index 0 = zone 1, The Room). */
export const ZONE_RADII: readonly [number, number, number, number, number, number, number] = [0.62, 1.62, 2.62, 3.82, 5.02, 6.52, 8.25];
export const ISLAND_RADIUS = ZONE_RADII[6];
export const GRID_MIN = -8;
export const GRID_MAX = 8;
/** The wall stops at this fraction of the gap to the next zone until the threshold is crossed (2.2). */
export const WALL_CREEP = 0.85;
/** The wall sits this far outside the current zone's edge. */
export const WALL_PAD = 0.2;

export type CellKind = 'haven' | 'lot' | 'road' | 'river' | 'bridge' | 'pond' | 'park' | 'hill' | 'library' | 'clinic';

export function cellDistance(cell: MapCell): number {
  return Math.hypot(cell.x, cell.y);
}

export function isIntegerCell(cell: unknown): cell is MapCell {
  return (
    typeof cell === 'object' &&
    cell !== null &&
    Number.isInteger((cell as MapCell).x) &&
    Number.isInteger((cell as MapCell).y) &&
    (cell as MapCell).x >= GRID_MIN &&
    (cell as MapCell).x <= GRID_MAX &&
    (cell as MapCell).y >= GRID_MIN &&
    (cell as MapCell).y <= GRID_MAX
  );
}

export function isIslandCell(cell: MapCell): boolean {
  return isIntegerCell(cell) && cellDistance(cell) <= ISLAND_RADIUS;
}

/** Zone 1..7 of a cell by distance; 8 for a cell off the island. */
export function zoneOfDistance(d: number): number {
  for (let k = 0; k < ZONE_RADII.length; k++) if (d <= ZONE_RADII[k]!) return k + 1;
  return 8;
}

export function zoneOfCell(cell: MapCell): number {
  return zoneOfDistance(cellDistance(cell));
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Angle of a cell from the centre, degrees in (-180, 180], screen convention (y down). */
export function cellAngle(cell: MapCell): number {
  return (Math.atan2(cell.y, cell.x) * 180) / Math.PI;
}

/**
 * What stands on a cell, fixed by zone and position (2.1): streets every
 * fourth row and column from zone 4 out, the river arc and hills at the edge
 * of zone 7, the park and pond, library and clinic in zone 6. Lots take
 * seeded buildings in the UI; the engine only needs to know where an outpost
 * can stand.
 */
export function cellKind(cell: MapCell): CellKind {
  const { x, y } = cell;
  if (x === 0 && y === 0) return 'haven';
  const d = cellDistance(cell);
  const z = zoneOfDistance(d);
  const ang = cellAngle(cell);
  const road = z >= 4 && (mod(x, 4) === 0 || mod(y, 4) === 0);
  const river = z === 7 && d > 6.95 && ang > -40 && ang < 80;
  if (road && river) return 'bridge';
  if (road) return 'road';
  if (river) return 'river';
  if (z === 7 && d > 6.8 && (ang > 140 || ang < -165)) return 'hill';
  if (z === 6 && x <= -5 && x >= -6 && y >= 1 && y <= 3) return x === -5 && y === 2 ? 'pond' : 'park';
  if (x === 5 && y === -2) return 'library';
  if (x === 2 && y === -5) return 'clinic';
  return 'lot';
}

/** A cell an outpost may stand on: a lot or landmark, never a street, water, hill or the Haven. */
export function canHoldOutpost(cell: MapCell): boolean {
  if (!isIslandCell(cell)) return false;
  if (zoneOfCell(cell) === 1) return false;
  const k = cellKind(cell);
  return k === 'lot' || k === 'park' || k === 'library' || k === 'clinic';
}

/** Every island cell, in a stable order (`x + y`, then `x`): the painter's order of the map. */
export function islandCells(): MapCell[] {
  const out: MapCell[] = [];
  for (let y = GRID_MIN; y <= GRID_MAX; y++) {
    for (let x = GRID_MIN; x <= GRID_MAX; x++) {
      const c = { x, y };
      if (cellDistance(c) <= ISLAND_RADIUS) out.push(c);
    }
  }
  out.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
  return out;
}

/* ------------------------------ Progress ------------------------------ */

export interface RingFraction {
  ring: RingId;
  /** 0..1 progress toward the next ring; 1 at The City. */
  fraction: number;
  next: RingId | null;
}

/** Ring and progress inside it for a DP total, read straight from `rings.json`. */
export function ringFraction(dp: number): RingFraction {
  let ring: RingId = 1;
  for (const r of rings) if (dp >= r.domainPointsRequired) ring = r.id;
  const cur = rings[ring - 1]!;
  const nxt = rings[ring];
  if (!nxt) return { ring, fraction: 1, next: null };
  const span = nxt.domainPointsRequired - cur.domainPointsRequired;
  const f = span > 0 ? (dp - cur.domainPointsRequired) / span : 1;
  return { ring, fraction: Math.max(0, Math.min(1, f)), next: nxt.id };
}

/**
 * Radius of the wall, in cells (2.2): the current zone's edge plus a pad,
 * creeping 85% of the way to the next zone with every Domain Point, so
 * crossing the threshold is still an event. At The City it sits just outside
 * the last zone.
 */
export function wallRadius(dp: number): number {
  const p = ringFraction(dp);
  const inner = ZONE_RADII[p.ring - 1]!;
  if (p.next === null) return inner + WALL_PAD;
  const outer = ZONE_RADII[p.next - 1]!;
  return inner + WALL_PAD + (outer - inner - WALL_PAD) * WALL_CREEP * p.fraction;
}

/** Unit vector of a compass direction in grid space (north is "up" on the isometric map). */
export function compassVector(dir: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'): { x: number; y: number } {
  // Screen angles (degrees, y down), then mapped back through the isometric projection so that
  // "north" means the top of the drawn map rather than the top of the grid.
  const deg = { n: -90, ne: -45, e: 0, se: 45, s: 90, sw: 135, w: 180, nw: -135 }[dir];
  const phi = (deg * Math.PI) / 180;
  const ux = (Math.cos(phi) + 2 * Math.sin(phi)) / 2;
  const uy = (2 * Math.sin(phi) - Math.cos(phi)) / 2;
  const l = Math.hypot(ux, uy) || 1;
  return { x: ux / l, y: uy / l };
}
