/**
 * The seeded city behind the City Map SVG (docs/design/CITY-MAP.md 2.1, 6.2,
 * 6.5): one tile per island cell and, on lots, a building. Everything here is
 * a plain string or number, memoised per layout seed, so a Domain Point
 * change only rewrites class names in the component.
 *
 * The map must serialise under 60 KB and 1,500 elements (5.4), so the
 * geometry is shared: every ground tile, building, tree, pin and scorch mark
 * is a `<use>` of a symbol defined once in `<defs>`. Building heights are
 * quantised to a short ladder per family, the cell size is 14 units so every
 * anchor is an integer, and the three faces of a box carry the classes `l`,
 * `r` and `t`, filled through custom properties inherited from the `<use>`
 * (`--l`, `--r`, `--t`), which is how one symbol serves claimed, dawn,
 * corridor-lit and fogged buildings alike. Inside a use's shadow tree Chrome
 * matches only bare selectors (no ancestor combinators), so those inner
 * classes (`cm-l`, `cm-r`, `cm-t`, `cm-x`, `cm-beacon`) are styled by global
 * single-class rules in `CityMap.module.css`. No `data-*` attributes.
 */
import { ISLAND_RADIUS, ZONE_RADII, cellKind, islandCells, zoneOfCell, type CellKind } from '../../game/mapGeometry';
import type { MapCell } from '../../game/types';
import { fnv1a, mulberry32 } from '../../game/rng';

/* ------------------------------ Projection ------------------------------ */

/** Cell size in SVG units: 14 keeps every cell centre on an integer. */
export const S = 14;
export const CX = 180;
export const CY = 158;
export const VIEW_W = 360;
export const VIEW_H = 264;
/** Screen units per cell along the ellipse's major axis. */
export const K = S * Math.SQRT2;

export function project(x: number, y: number, z = 0): [number, number] {
  return [CX + (x - y) * S, CY + ((x + y) * S) / 2 - z * S];
}

export function f1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** A compact number: one decimal, no leading zero, `-0` never. */
export function n(v: number): string {
  const r = f1(v);
  if (r === 0) return '0';
  return (r < 0 ? '-' : '') + String(Math.abs(r)).replace(/^0\./, '.');
}

/** `n(v)` with a separating space when it does not start with a minus. */
export function sp(v: number): string {
  const t = n(v);
  return t.startsWith('-') ? t : ` ${t}`;
}

export function pts(a: [number, number][]): string {
  return a.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
}

/** Path of the ground ellipse of radius `r` cells, centred on the Haven. */
export function ellipsePath(r: number): string {
  const rx = r * K;
  const ry = rx / 2;
  return `M${f1(CX - rx)} ${CY}a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(2 * rx)} 0a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(-2 * rx)} 0z`;
}

export function ellipseRadii(r: number): { rx: number; ry: number } {
  return { rx: f1(r * K), ry: f1((r * K) / 2) };
}

/* ------------------------------ Symbols ------------------------------ */

/**
 * One box as three faces (left, right, top) around the origin, in screen
 * units: `a` is half the footprint, `h` the height, `(ox, oy)` an offset and
 * `dz` a lift (stacked parts). Styled by class, filled by `--l`, `--r`, `--t`.
 */
export function boxPaths(a: number, h: number, ox = 0, oy = 0, dz = 0): string {
  const y0 = oy - dz;
  return (
    `<path class="cm-l" d="M${n(ox - 2 * a)}${sp(y0)}l${n(2 * a)}${sp(a)}v${n(-h)}l${n(-2 * a)}${sp(-a)}z"/>` +
    `<path class="cm-r" d="M${n(ox + 2 * a)}${sp(y0)}l${n(-2 * a)}${sp(a)}v${n(-h)}l${n(2 * a)}${sp(-a)}z"/>` +
    `<path class="cm-t" d="M${n(ox)}${sp(y0 - a - h)}l${n(2 * a)}${sp(a)}l${n(-2 * a)}${sp(a)}l${n(-2 * a)}${sp(-a)}z"/>`
  );
}

/** Height ladders per family, in units (CITY-MAP 6.2 ranges, quantised). */
const HOME_H = [6, 8, 10, 13, 17];
const BLD_H = [13, 18, 22, 26, 31];
const SHOP_H = [8, 11, 14];
const TOWER_H = [27, 34, 42, 50, 57];
const HOME_A = 5;
const BLD_A = 6;
const TOWER_A = 4.5;

function sym(id: string, body: string): string {
  return `<g id="${id}">${body}</g>`;
}

function boxSymbols(): string {
  let s = '';
  for (const h of HOME_H) s += sym(`b${HOME_A}-${h}`, boxPaths(HOME_A, h));
  for (const h of BLD_H) s += sym(`b${BLD_A}-${h}`, boxPaths(BLD_A, h));
  for (const h of SHOP_H) s += sym(`b${BLD_A}-${h}`, boxPaths(BLD_A, h));
  for (const h of TOWER_H) s += sym(`b${TOWER_A}-${h}`, boxPaths(TOWER_A, h));
  return (
    s +
    sym('t2', boxPaths(2, 5)) +
    sym('t3', boxPaths(3, 7)) +
    sym('hl1', boxPaths(6.5, 4) + boxPaths(3.5, 3, 0, 0, 4)) +
    sym('hl2', boxPaths(6.5, 6) + boxPaths(3.5, 4, 0, 0, 6)) +
    sym('lib', boxPaths(6, 10) + boxPaths(3, 4, 0, 0, 10)) +
    sym('cli', boxPaths(5.5, 15) + '<rect class="cm-x" x="-4" y="-21.5" width="8" height="2"/><rect class="cm-x" x="-1" y="-23" width="2" height="5"/>') +
    sym('hv', boxPaths(4, 43) + boxPaths(2.7, 6, 0, 0, 43) + '<rect x="-.6" y="-61.2" width="1.2" height="9.5" fill="#a08cff"/><rect class="cm-beacon" x="-1.3" y="-62.5" width="2.6" height="2.6"/>') +
    sym('ax', boxPaths(4, 12) + boxPaths(1, 2.3, 0, -3.5, 12) + boxPaths(1, 2.3, 7, 0, 12) + boxPaths(1, 2.3, 0, 3.5, 12)) +
    sym('ws', boxPaths(3, 6)) +
    sym('cp', boxPaths(1.7, 5)) +
    '<path id="aw" d="M-12-3.6L0 2.2l-1 1.3-11.7-5.9z"/>'
  );
}

function noisePattern(id: string, bg: string, seed: number, dots: number): string {
  const rnd = mulberry32(seed);
  let s = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="9" height="9"><rect width="9" height="9" fill="${bg}"/>`;
  for (let i = 0; i < dots; i++) s += `<use href="#${rnd() < 0.3 ? 'd2' : 'd1'}" x="${Math.floor(rnd() * 9)}" y="${Math.floor(rnd() * 9)}"/>`;
  return `${s}</pattern>`;
}

/** Windows as a pattern inside a side fill, with the face colour as background. */
function winPattern(id: string, side: 'l' | 'r', bg: string, cells: (string | null)[]): string {
  const m = side === 'l' ? `matrix(${S},${S / 2},0,${-S},${CX},${CY})` : `matrix(${-S},${S / 2},0,${-S},${CX},${CY})`;
  let s = `<pattern id="${id}" patternUnits="userSpaceOnUse" width=".5" height=".62" patternTransform="${m}"><rect width=".5" height=".62" fill="${bg}"/>`;
  const pos = [
    [0.07, 0.1],
    [0.3, 0.1],
    [0.18, 0.41],
  ] as const;
  cells.forEach((c, i) => {
    const p = pos[i];
    if (c && p) s += `<rect x="${p[0]}" y="${p[1]}" width=".13" height=".17" fill="${c}"/>`;
  });
  return `${s}</pattern>`;
}

function buildDefs(): string {
  const A = '#ffb84d';
  const a = '#c98a35';
  const o = '#3a3a52';
  const V = '#b9a8ff';
  const v2 = '#6a4fe0';
  const H = '#efeaff';
  const Dm = '#2c2c3c';
  return (
    '<rect id="d1" width="1" height="1" fill="#2b2b3a"/><rect id="d2" width="1" height="1" fill="#4a4a5c"/>' +
    '<rect id="ss" width="1.4" height="1.4" fill="#e8e8f0" opacity=".45"/><rect id="sb" width="2" height="2" fill="#e8e8f0" opacity=".7"/>' +
    '<g id="lp"><circle r="3.2" style="fill:var(--lh);opacity:var(--lo)"/><rect x="-.8" y="-.8" width="1.6" height="1.6" style="fill:var(--lc)"/></g>' +
    `<path id="tt" d="M0${sp(-S / 2)}l${n(S)}${sp(S / 2)}l${n(-S)}${sp(S / 2)}l${n(-S)}${sp(-S / 2)}z"/>` +
    `<path id="sl" d="M${n(-S)} 0l${n(S)}${sp(S / 2)}v4l${n(-S)}${sp(-S / 2)}z"/>` +
    `<path id="sr" d="M${n(S)} 0l${n(-S)}${sp(S / 2)}v4l${n(S)}${sp(-S / 2)}z"/>` +
    boxSymbols() +
    '<g id="pn"><ellipse rx="5.5" ry="2.2" fill="#000" opacity=".45"/><rect x="-.8" y="-16" width="1.6" height="16" fill="#8a8a9e"/>' +
    '<path d="M-7-29h14l2 2v10l-2 2h-14l-2-2v-10z" style="fill:var(--pf);stroke:var(--ps);stroke-width:var(--pw)"/></g>' +
    '<path id="cr" d="M-5-30v-4.5l2.5 2 2.5-3 2.5 3 2.5-2v4.5z" fill="#ffb84d" stroke="#0f0f14" stroke-width=".8"/>' +
    '<path id="zz" d="M9-33h3.5l-3.5 3.5h3.5M13.5-38h2.5l-2.5 2.5h2.5" fill="none" stroke="#9a9ab0" stroke-width="1.1"/>' +
    '<g id="sc"><ellipse rx="9" ry="3.8" fill="#3a1a1e" opacity=".55"/><ellipse rx="7" ry="2.9" fill="#050507" opacity=".9"/><ellipse rx="3.8" ry="1.5" cx="1.5" cy="-.3" fill="#1a0c0e"/>' +
    '<path d="M-7 0l-4 1.5M6-1l5-1.5M2 2l2.5 2.5M-3-2l-1.5-2" stroke="#5a2a30" stroke-width=".9"/></g>' +
    '<g id="em"><rect x="-3" y="-1.5" width="1.5" height="1.5" fill="#ff6b85"/><rect x="2" y=".2" width="1.5" height="1.5" fill="#ffb84d"/><rect x="-.5" y="1" width="1" height="1" fill="#ffb84d"/></g>' +
    '<g id="fl"><rect x="-.6" y="-15" width="1.2" height="15" fill="#8a8a9e"/><path d="M-5-22h10v5c0 3-2.5 4.5-5 5.5-2.5-1-5-2.5-5-5.5z" fill="#1a1a24" stroke="#ffb84d" stroke-width="1.1"/></g>' +
    '<path id="fk" d="M-2.6-17.5l1.8 1.8 3.4-3.6" fill="none" stroke="#4dff9a" stroke-width="1.2"/>' +
    '<path id="fb" d="M-2.5-17h5" fill="none" stroke="#e8e8f0" stroke-width="1.2"/>' +
    '<path id="fs" d="M0-27l1 2 2 .2-1.5 1.4.5 2-2-1-2 1 .5-2-1.5-1.4 2-.2z" fill="#ffb84d" stroke="#0f0f14" stroke-width=".5"/>' +
    '<radialGradient id="cm-glow"><stop offset="0" stop-color="#7c5cff" stop-opacity=".55"/><stop offset="1" stop-color="#7c5cff" stop-opacity="0"/></radialGradient>' +
    '<pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(30)"><rect width="1.2" height="4" fill="#ffb84d" opacity=".55"/></pattern>' +
    noisePattern('fT', '#1a1a23', 3, 7) +
    noisePattern('fL', '#14141c', 5, 6) +
    noisePattern('fR', '#101016', 9, 6) +
    noisePattern('fG', '#121218', 13, 6) +
    noisePattern('fW', '#121a28', 17, 6) +
    winPattern('bLa', 'l', '#2a2a3d', [A, A, a]) +
    winPattern('bRa', 'r', '#1f1f2d', [A, o, A]) +
    winPattern('bLb', 'l', '#2a2a3d', [a, o, A]) +
    winPattern('bRb', 'r', '#1f1f2d', [A, A, o]) +
    winPattern('hL', 'l', '#3c3079', [V, v2, V]) +
    winPattern('hR', 'r', '#2c235b', [V, V, v2]) +
    winPattern('vL', 'l', '#7c5cff', [H, H, V]) +
    winPattern('vR', 'r', '#4a36a8', [H, V, H]) +
    winPattern('dL', 'l', '#222230', [Dm, a, Dm]) +
    winPattern('dR', 'r', '#191925', [Dm, Dm, a])
  );
}

function buildSky(): string {
  let sky = `<rect width="${VIEW_W}" height="${VIEW_H}" fill="#0f0f14"/><g id="stars">`;
  const rs = mulberry32(42);
  for (let i = 0; i < 90; i++) {
    const sx = rs() * VIEW_W;
    const sy = rs() * VIEW_H;
    const dx = (sx - CX) / (8.6 * K);
    const dy = (sy - CY) / ((8.6 * K) / 2);
    const big = i % 7 === 0;
    const tw = i % 5 === 0;
    rs();
    if (dx * dx + dy * dy < 1 || sy > 220 || (sx < 40 && sy > 50 && sy < 90)) continue;
    sky += `<use href="#${big ? 'sb' : 'ss'}" x="${Math.round(sx)}" y="${Math.round(sy)}"${tw ? ' class="tw"' : ''}/>`;
  }
  return `${sky}</g><circle cx="22" cy="68" r="8" fill="#e8e8f0" opacity=".85"/><circle cx="26" cy="65" r="7.2" fill="#0f0f14"/>`;
}

/* ------------------------------ Tiles ------------------------------ */

export type BuildingFamily = 'haven' | 'home' | 'bld' | 'shop' | 'civic' | 'tower' | 'tree' | 'hill';

/** One `<use>` of a building symbol, offset from the tile's centre. */
export interface Part {
  href: string;
  dx: number;
  dy: number;
  /** Class prefix before the state class: `b f-bld vb`, `aw`. */
  cls: string;
  /** Awning colour. */
  fill?: string;
}

export interface Building {
  family: BuildingFamily;
  /** Alternate window pattern. */
  variant: boolean;
  parts: Part[];
  /** A deterministic key of the parts, for tests and memo keys. */
  markup: string;
}

export interface Tile {
  index: number;
  cell: MapCell;
  d: number;
  z: number;
  kind: CellKind;
  /** Stable random in [0, 1) from the seed and the cell. */
  r: number;
  home: boolean;
  /** Projected centre, integers. */
  x: number;
  y: number;
  /** Front-edge skirts: no neighbour at (x, y+1) is the left one, none at (x+1, y) the right one. */
  skirts: ('sl' | 'sr')[];
  lamp: boolean;
  ripple: boolean;
  building: Building | null;
}

export interface Spark {
  tile: number;
  x: number;
  y: number;
  w: number;
}

export interface CityLayout {
  seed: number;
  tiles: Tile[];
  /** Tiles that carry a building, in painter's order. */
  buildingTiles: Tile[];
  /** Tile index behind each child of the buildings group (one child per part). */
  buildingParts: { tile: number; part: Part }[];
  /** Tile index behind each child of the extras group (skirts, lamps, ripples). */
  extras: { tile: number; kind: 'sl' | 'sr' | 'lp' | 'rp' }[];
  sparks: Spark[];
  defs: string;
  sky: string;
  guides: string;
  /** Band path per zone (index 0 = zone 1), even-odd rings. */
  bands: string[];
  tileAt: Map<string, Tile>;
}

const HABIT_COLORS = ['#f2893b', '#5ba7d9', '#e0b33a', '#4fc3c7', '#d9774f', '#a98bd6'];

function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)] ?? arr[0]!;
}

function one(href: string, cls: string, dx = 0, dy = 0, fill?: string): Part {
  const p: Part = { href, dx, dy, cls };
  if (fill) p.fill = fill;
  return p;
}

/** A pair of trees on one tile: the back one first (painter's order). */
function treePair(): Part[] {
  return [one('t3', 'b f-tree', 0, -3.5), one('t2', 'b f-tree', 3.5, 2)];
}

function building(family: BuildingFamily, variant: boolean, parts: Part[]): Building {
  return { family, variant, parts, markup: parts.map((p) => `${p.href}@${p.dx},${p.dy}${p.fill ?? ''}`).join(' ') };
}

function buildingFor(t: Tile): Building | null {
  const rnd = mulberry32(Math.floor(t.r * 1e9) + 7);
  const variant = rnd() < 0.5;
  const vb = variant ? ' vb' : '';
  switch (t.kind) {
    case 'haven':
      return building('haven', false, [one('hv', 'b f-haven')]);
    case 'road':
    case 'river':
    case 'bridge':
    case 'pond':
      return null;
    case 'park':
      return building('tree', false, rnd() < 0.7 ? treePair() : [one('t3', 'b f-tree')]);
    case 'hill':
      return building('hill', false, [one(rnd() < 0.5 ? 'hl1' : 'hl2', 'b f-hill')]);
    case 'library':
      return building('civic', false, [one('lib', 'b f-civic')]);
    case 'clinic':
      return building('civic', false, [one('cli', 'b f-civic')]);
    case 'lot':
      break;
  }
  const z = t.z;
  if (z === 2) return t.r > 0.92 ? null : building('home', false, [one(`b${HOME_A}-${pick(rnd, HOME_H.slice(0, 3))}`, 'b f-home')]);
  if (z === 3) return t.r > 0.88 ? null : building('home', false, [one(`b${HOME_A}-${pick(rnd, HOME_H.slice(2))}`, 'b f-home')]);
  if (z === 4) {
    if (t.r > 0.86) return building('tree', false, [one('t3', 'b f-tree')]);
    return building('bld', variant, [one(`b${BLD_A}-${pick(rnd, BLD_H.slice(1))}`, `b f-bld${vb}`)]);
  }
  if (z === 5) {
    if (t.r > 0.84) return building('tree', false, treePair());
    const col = pick(rnd, HABIT_COLORS);
    return building('shop', variant, [one(`b${BLD_A}-${pick(rnd, SHOP_H)}`, `b f-shop${vb}`), one('aw', 'aw', 0, 0, col)]);
  }
  if (z === 6) {
    if (t.r > 0.8) return building('tree', false, treePair());
    return building('bld', variant, [one(`b${BLD_A}-${pick(rnd, BLD_H)}`, `b f-bld${vb}`)]);
  }
  if (t.r > 0.9) return building('tree', false, [one('t3', 'b f-tree')]);
  if (t.r > 0.78) return building('bld', variant, [one(`b${BLD_A}-${pick(rnd, BLD_H.slice(0, 2))}`, `b f-bld${vb}`)]);
  const h = pick(rnd, TOWER_H);
  const parts = [one(`b${TOWER_A}-${h}`, `b f-tower${vb}`)];
  if (rnd() < 0.4) parts.push(one('cp', `b f-tower${vb}`, 0, -h));
  return building('tower', variant, parts);
}

/* ------------------------------ Layout ------------------------------ */

const cache = new Map<number, CityLayout>();

/** The city for a layout seed (`fnv1a(firstPlayDay)`); built once and memoised. */
export function buildLayout(seed: number): CityLayout {
  const hit = cache.get(seed);
  if (hit) return hit;
  const tiles: Tile[] = islandCells().map((cell, index) => {
    const d = Math.hypot(cell.x, cell.y);
    const z = zoneOfCell(cell);
    const [x, y] = project(cell.x, cell.y);
    return { index, cell, d, z, kind: cellKind(cell), r: fnv1a(`${seed}:${cell.x}:${cell.y}`) / 4294967296, home: z <= 3, x, y, skirts: [], lamp: false, ripple: false, building: null };
  });
  const tileAt = new Map(tiles.map((t) => [`${t.cell.x},${t.cell.y}`, t] as const));
  const extras: CityLayout['extras'] = [];
  for (const t of tiles) {
    if (!tileAt.has(`${t.cell.x},${t.cell.y + 1}`)) t.skirts.push('sl');
    if (!tileAt.has(`${t.cell.x + 1},${t.cell.y}`)) t.skirts.push('sr');
    t.lamp = (t.kind === 'road' || t.kind === 'bridge') && (t.cell.x + t.cell.y) % 2 === 0;
    t.ripple = t.kind === 'river' || t.kind === 'pond';
    for (const k of t.skirts) extras.push({ tile: t.index, kind: k });
    if (t.lamp) extras.push({ tile: t.index, kind: 'lp' });
    if (t.ripple) extras.push({ tile: t.index, kind: 'rp' });
    t.building = buildingFor(t);
  }
  const buildingTiles = tiles.filter((t) => t.building !== null);
  const buildingParts: CityLayout['buildingParts'] = [];
  for (const t of buildingTiles) for (const part of t.building!.parts) buildingParts.push({ tile: t.index, part });
  const sparks: Spark[] = [];
  const rr = mulberry32(77);
  for (const t of tiles) {
    if (t.z < 3 || rr() > 0.19) continue;
    const c = project(t.cell.x + (rr() - 0.5) * 0.6, t.cell.y + (rr() - 0.5) * 0.6, t.building && t.building.family !== 'tree' ? 0.2 + rr() * 1.2 : 0);
    sparks.push({ tile: t.index, x: Math.round(c[0]), y: Math.round(c[1]), w: rr() < 0.5 ? 2 : 1 });
  }
  const guides = ZONE_RADII.slice(0, 6)
    .map((r) => `<path class="zguide" d="${ellipsePath(r)}"/>`)
    .join('');
  // Zone 1 is the Haven tower itself: its band is a box around the tower so the focus ring (and its
  // 44 px target) reads. Zones 2 and 3 are small rings of tall home blocks, so their outer edge is
  // raised to a 60-unit-tall oval that takes the buildings in; the rest are even-odd rings between
  // two zone edges.
  const tallBand = (r: number): string => {
    const rx = f1(r * K);
    return `M${f1(CX - rx)} ${CY - 6}a${rx} 30 0 1 0 ${f1(2 * rx)} 0a${rx} 30 0 1 0 ${f1(-2 * rx)} 0z`;
  };
  const bands = ZONE_RADII.map((r, i) => (i === 0 ? `M${CX - 28} ${CY - 64}h56v74h-56z` : (i <= 2 ? tallBand(r) : ellipsePath(r)) + ellipsePath(ZONE_RADII[i - 1]!)));
  const layout: CityLayout = { seed, tiles, buildingTiles, buildingParts, extras, sparks, defs: buildDefs(), sky: buildSky(), guides, bands, tileAt };
  cache.set(seed, layout);
  return layout;
}

/* ------------------------------ Dynamic shapes ------------------------------ */

export type TileState = 'c' | 'd' | 'k' | 'f';

export interface CorridorShape {
  type: 'strip' | 'bubble';
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

export interface PinLike {
  cell: MapCell;
  state: 'marked' | 'scouted' | 'corridor' | 'stronghold';
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l = vx * vx + vy * vy;
  const tt = l ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l)) : 0;
  return Math.hypot(px - ax - tt * vx, py - ay - tt * vy);
}

/** Corridor strips (wall to a Corridor pin beyond it) and Stronghold bubbles (3.4). */
export function corridorShapes(pins: PinLike[], wallR: number): CorridorShape[] {
  const shapes: CorridorShape[] = [];
  for (const p of pins) {
    if (p.state !== 'corridor' && p.state !== 'stronghold') continue;
    const d = Math.hypot(p.cell.x, p.cell.y);
    if (d > wallR) {
      const ux = p.cell.x / d;
      const uy = p.cell.y / d;
      shapes.push({ type: 'strip', ax: ux * wallR, ay: uy * wallR, bx: p.cell.x, by: p.cell.y, r: 0 });
    }
    if (p.state === 'stronghold') shapes.push({ type: 'bubble', ax: p.cell.x, ay: p.cell.y, bx: 0, by: 0, r: 1.35 });
  }
  return shapes;
}

export function inShapes(cell: MapCell, shapes: CorridorShape[]): boolean {
  for (const s of shapes) {
    if (s.type === 'strip' && segDist(cell.x, cell.y, s.ax, s.ay, s.bx, s.by) <= 0.72) return true;
    if (s.type === 'bubble' && Math.hypot(cell.x - s.ax, cell.y - s.ay) <= s.r) return true;
  }
  return false;
}

/** Claimed (zone within the ring), dawn (inside the wall), corridor-lit, or fog. */
export function tileState(t: Tile, ring: number, wallR: number, shapes: CorridorShape[]): TileState {
  if (t.z <= ring) return 'c';
  if (t.d <= wallR) return 'd';
  return inShapes(t.cell, shapes) ? 'k' : 'f';
}

/** Corridor strips, bubbles, trails and supply lines as markup. */
export function corridorMarkup(pins: PinLike[], wallR: number, shapes: CorridorShape[]): string {
  let s = '';
  for (const sh of shapes) {
    if (sh.type === 'strip') {
      const dx = sh.bx - sh.ax;
      const dy = sh.by - sh.ay;
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * 0.62;
      const ny = (dx / l) * 0.62;
      const a1 = project(sh.ax + nx, sh.ay + ny);
      const b1 = project(sh.bx + nx, sh.by + ny);
      const a2 = project(sh.ax - nx, sh.ay - ny);
      const b2 = project(sh.bx - nx, sh.by - ny);
      s += `<polygon class="corr-fill" points="${pts([a1, b1, b2, a2])}"/>`;
      s += `<path class="corr-edge" d="M${f1(a1[0])} ${f1(a1[1])}L${f1(b1[0])} ${f1(b1[1])}M${f1(a2[0])} ${f1(a2[1])}L${f1(b2[0])} ${f1(b2[1])}"/>`;
    } else {
      const c = project(sh.ax, sh.ay);
      const { rx, ry } = ellipseRadii(sh.r);
      s += `<ellipse class="corr-fill" cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${rx}" ry="${ry}"/><ellipse class="corr-edge" cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${rx}" ry="${ry}"/>`;
    }
  }
  for (const p of pins) {
    const d = Math.hypot(p.cell.x, p.cell.y) || 1;
    const reaching = p.state === 'corridor' || p.state === 'stronghold';
    if (d > wallR && !reaching) {
      const a = project((p.cell.x / d) * wallR, (p.cell.y / d) * wallR);
      const b = project(p.cell.x, p.cell.y);
      s += `<path class="trail" d="M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}"/>`;
    } else if (d <= wallR && reaching) {
      const h0 = project((p.cell.x / d) * 0.5, (p.cell.y / d) * 0.5);
      const b = project(p.cell.x, p.cell.y);
      s += `<path class="supply" d="M${f1(h0[0])} ${f1(h0[1])}L${f1(b[0])} ${f1(b[1])}"/>`;
    }
  }
  return s;
}

export interface ResidueLike {
  result: 'decisive' | 'win' | 'loss';
  age: number;
  wallR: number;
  seed: number;
}

/** Scorch marks (fading over 14 days) and the walls-held flag (7 days) of each settled wave (2.4). */
export function residueMarkup(residue: ResidueLike[]): { scorch: string; flags: string } {
  let scorch = '';
  let flags = '';
  for (const w of residue) {
    if (w.age >= 14) continue;
    const rnd = mulberry32(w.seed);
    const count = { decisive: 2, win: 3, loss: 4 }[w.result];
    const r = w.wallR + 0.05;
    const op = (1 - w.age / 14).toFixed(2);
    const base = rnd() * 360;
    for (let i = 0; i < count; i++) {
      const ang = ((base + i * (360 / count) + (rnd() - 0.5) * 40) * Math.PI) / 180;
      const c = project(Math.cos(ang) * r, Math.sin(ang) * r);
      const x = Math.round(c[0]);
      const y = Math.round(c[1]);
      scorch += `<g class="scorch" opacity="${op}" transform="translate(${x} ${y})"><use href="#sc"/>${w.age < 7 ? '<use class="em" href="#em"/>' : ''}</g>`;
      if (i === 0 && w.age < 7) {
        flags +=
          `<g class="held r-${w.result}" transform="translate(${x} ${y})"><use href="#fl"/>` +
          `<use href="#${w.result === 'loss' ? 'fb' : 'fk'}"/>${w.result === 'decisive' ? '<use href="#fs"/>' : ''}</g>`;
      }
    }
  }
  return { scorch, flags };
}

/** The Haven annex (Stronghold) or waystation (Corridor) under a pin, as a symbol reference. */
export function pinBase(state: PinLike['state']): { href: string; cls: string } | null {
  if (state === 'stronghold') return { href: 'ax', cls: 'b f-annex s-c' };
  if (state === 'corridor') return { href: 'ws', cls: 'b f-post s-c' };
  return null;
}

export { ISLAND_RADIUS };
