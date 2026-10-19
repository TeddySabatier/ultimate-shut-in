/**
 * The seeded city behind the City Map SVG (docs/design/CITY-MAP.md 2.1, 6.2,
 * 6.5): one tile per island cell with its ground markup and, on lots, a
 * building drawn as three relative `<path>`s (left face, right face, top).
 * Everything here is a plain string or number, memoised per layout seed, so
 * a Domain Point change only rewrites class names in the component.
 *
 * The markup is kept compact on purpose: the whole map must serialise under
 * 60 KB (5.4). Integer anchors, one-decimal deltas, `<use>` for ground
 * tiles, no `data-*` attributes.
 */
import { ISLAND_RADIUS, ZONE_RADII, cellKind, islandCells, zoneOfCell, type CellKind } from '../../game/mapGeometry';
import type { MapCell } from '../../game/types';
import { fnv1a, mulberry32 } from '../../game/rng';

/* ------------------------------ Projection ------------------------------ */

export const S = 14.5;
export const CX = 180;
export const CY = 158;
export const VIEW_W = 360;
export const VIEW_H = 264;
/** Screen units per cell along the ellipse's major axis. */
export const K = S * Math.SQRT2;

export function project(x: number, y: number, z = 0): [number, number] {
  return [CX + (x - y) * S, CY + ((x + y) * S) / 2 - z * S];
}

export function f1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** A compact number: one decimal, no leading zero. */
export function n(v: number): string {
  const r = f1(v);
  return (r < 0 ? '-' : '') + String(Math.abs(r)).replace(/^0\./, '.');
}

/** `n(v)` with a separating space when it does not start with a minus. */
export function sp(v: number): string {
  const t = n(v);
  return t.startsWith('-') ? t : ` ${t}`;
}

function M(p: [number, number]): string {
  return `M${Math.round(p[0])}${p[1] < 0 ? '' : ' '}${Math.round(p[1])}`;
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

/** One box = three relative paths: left face, right face, top. Styled by position in the CSS. */
export function box(x0: number, y0: number, w: number, d: number, z0: number, h: number): string {
  const x1 = x0 + w;
  const y1 = y0 + d;
  const z1 = z0 + h;
  const W = w * S;
  const D = d * S;
  const H = h * S;
  return (
    `<path d="${M(project(x0, y1, z0))}l${n(W)}${sp(W / 2)}v${n(-H)}l${n(-W)}${sp(-W / 2)}z"/>` +
    `<path d="${M(project(x1, y0, z0))}l${n(-D)}${sp(D / 2)}v${n(-H)}l${n(D)}${sp(-D / 2)}z"/>` +
    `<path d="${M(project(x0, y0, z1))}l${n(W)}${sp(W / 2)}l${n(-D)}${sp(D / 2)}l${n(-W)}${sp(-W / 2)}z"/>`
  );
}

export function tree(x: number, y: number, sz: number): string {
  return box(x - sz / 2, y - sz / 2, sz, sz, 0.08, sz * 1.15);
}

/* ------------------------------ Tiles ------------------------------ */

export type BuildingFamily = 'haven' | 'home' | 'bld' | 'shop' | 'civic' | 'tower' | 'tree' | 'hill';

export interface Building {
  family: BuildingFamily;
  /** Alternate window pattern. */
  variant: boolean;
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
  groundMarkup: string;
  building: Building | null;
  /** Fog sparks on this tile, as `<rect>` markup. */
  sparks: string[];
}

export interface CityLayout {
  seed: number;
  tiles: Tile[];
  /** Tiles that carry a building, in painter's order (the `#blds` children). */
  buildingTiles: Tile[];
  /** Every spark, in order, with its tile index. */
  sparks: { tile: number; markup: string }[];
  defs: string;
  sky: string;
  guides: string;
  /** Band path per zone (index 0 = zone 1), even-odd rings. */
  bands: string[];
  tileAt: Map<string, Tile>;
}

const HABIT_COLORS = ['#f2893b', '#5ba7d9', '#e0b33a', '#4fc3c7', '#d9774f', '#a98bd6'];

function buildingFor(t: Tile): Building | null {
  const rnd = mulberry32(Math.floor(t.r * 1e9) + 7);
  const gx = t.cell.x;
  const gy = t.cell.y;
  const variant = rnd() < 0.5;
  let h: number;
  let ins: number;
  switch (t.kind) {
    case 'haven': {
      const top = project(0, 0, 4.2);
      return {
        family: 'haven',
        variant: false,
        markup:
          box(-0.3, -0.3, 0.6, 0.6, 0, 3.1) +
          box(-0.19, -0.19, 0.38, 0.38, 3.1, 0.42) +
          `<rect class="ant" x="${f1(top[0] - 0.6)}" y="${f1(top[1])}" width="1.2" height="9.5"/>` +
          `<rect class="beacon" x="${f1(top[0] - 1.3)}" y="${f1(top[1] - 1.3)}" width="2.6" height="2.6"/>`,
      };
    }
    case 'road':
    case 'river':
    case 'bridge':
    case 'pond':
      return null;
    case 'park':
      return { family: 'tree', variant: false, markup: tree(gx - 0.2, gy - 0.15, 0.36) + (rnd() < 0.7 ? tree(gx + 0.22, gy + 0.2, 0.3) : '') };
    case 'hill':
      h = 0.25 + rnd() * 0.35;
      return { family: 'hill', variant: false, markup: box(gx - 0.46, gy - 0.46, 0.92, 0.92, 0, h) + box(gx - 0.25, gy - 0.25, 0.5, 0.5, h, 0.2 + rnd() * 0.25) };
    case 'library':
      return { family: 'civic', variant: false, markup: box(gx - 0.42, gy - 0.4, 0.84, 0.8, 0, 0.75) + box(gx - 0.2, gy - 0.2, 0.4, 0.4, 0.75, 0.3) };
    case 'clinic': {
      const c = project(gx, gy, 1.12);
      return {
        family: 'civic',
        variant: false,
        markup:
          box(gx - 0.38, gy - 0.38, 0.76, 0.76, 0, 1.1) +
          `<rect class="cross" x="${f1(c[0] - 4)}" y="${f1(c[1] - 1)}" width="8" height="2"/><rect class="cross" x="${f1(c[0] - 1)}" y="${f1(c[1] - 2.5)}" width="2" height="5"/>`,
      };
    }
    case 'lot':
      break;
  }
  const z = t.z;
  if (z === 2) {
    if (t.r > 0.92) return null;
    h = 0.42 + rnd() * 0.3;
    return { family: 'home', variant: false, markup: box(gx - 0.36, gy - 0.36, 0.72, 0.72, 0, h) };
  }
  if (z === 3) {
    if (t.r > 0.88) return null;
    h = 0.7 + rnd() * 0.55;
    return { family: 'home', variant: false, markup: box(gx - 0.38, gy - 0.38, 0.76, 0.76, 0, h) };
  }
  if (z === 4) {
    if (t.r > 0.86) return { family: 'tree', variant: false, markup: tree(gx, gy, 0.4) };
    h = 1.25 + rnd() * 1.0;
    ins = 0.08 + rnd() * 0.06;
    return { family: 'bld', variant, markup: box(gx - 0.5 + ins, gy - 0.5 + ins, 1 - 2 * ins, 1 - 2 * ins, 0, h) };
  }
  if (z === 5) {
    if (t.r > 0.84) return { family: 'tree', variant: false, markup: tree(gx - 0.15, gy, 0.38) + tree(gx + 0.2, gy + 0.18, 0.3) };
    h = 0.55 + rnd() * 0.5;
    ins = 0.08;
    const x0 = gx - 0.5 + ins;
    const y0 = gy - 0.5 + ins;
    const w = 1 - 2 * ins;
    const col = HABIT_COLORS[Math.floor(rnd() * HABIT_COLORS.length)] ?? HABIT_COLORS[0]!;
    const aw = `<polygon class="aw" style="--aw:${col}" points="${pts([project(x0, y0 + w, 0.26), project(x0 + w, y0 + w, 0.26), project(x0 + w, y0 + w + 0.07, 0.2), project(x0, y0 + w + 0.07, 0.2)])}"/>`;
    return { family: 'shop', variant, markup: box(x0, y0, w, w, 0, h) + aw };
  }
  if (z === 6) {
    if (t.r > 0.8) return { family: 'tree', variant: false, markup: tree(gx - 0.18, gy - 0.1, 0.36) + tree(gx + 0.2, gy + 0.2, 0.32) };
    h = 0.9 + rnd() * 1.3;
    ins = 0.08 + rnd() * 0.08;
    return { family: 'bld', variant, markup: box(gx - 0.5 + ins, gy - 0.5 + ins, 1 - 2 * ins, 1 - 2 * ins, 0, h) };
  }
  if (t.r > 0.9) return { family: 'tree', variant: false, markup: tree(gx, gy, 0.4) };
  if (t.r > 0.78) {
    h = 0.9 + rnd() * 0.5;
    return { family: 'bld', variant, markup: box(gx - 0.4, gy - 0.4, 0.8, 0.8, 0, h) };
  }
  ins = 0.15 + rnd() * 0.07;
  h = 1.9 + rnd() * 2.2;
  return {
    family: 'tower',
    variant,
    markup: box(gx - 0.5 + ins, gy - 0.5 + ins, 1 - 2 * ins, 1 - 2 * ins, 0, h) + (rnd() < 0.4 ? box(gx - 0.12, gy - 0.12, 0.24, 0.24, h, 0.35) : ''),
  };
}

/* ------------------------------ Patterns ------------------------------ */

function noisePattern(id: string, bg: string, seed: number, dots: number): string {
  const rnd = mulberry32(seed);
  let s = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="9" height="9"><rect width="9" height="9" fill="${bg}"/>`;
  for (let i = 0; i < dots; i++) {
    s += `<rect x="${Math.floor(rnd() * 9)}" y="${Math.floor(rnd() * 9)}" width="1" height="1" fill="${rnd() < 0.3 ? '#4a4a5c' : '#2b2b3a'}"/>`;
  }
  return `${s}</pattern>`;
}

/** Windows as a pattern inside a side fill, with the face colour as background. */
function winPattern(id: string, side: 'l' | 'r', bg: string, cells: (string | null)[]): string {
  const m = side === 'l' ? `matrix(${S},${S / 2},0,${-S},${CX},${CY})` : `matrix(${-S},${S / 2},0,${-S},${CX},${CY})`;
  let s = `<pattern id="${id}" patternUnits="userSpaceOnUse" width=".5" height=".62" patternTransform="${m}"><rect width=".5" height=".62" fill="${bg}"/>`;
  const pos = [
    [0.07, 0.1],
    [0.3, 0.1],
    [0.07, 0.41],
    [0.3, 0.41],
  ] as const;
  cells.forEach((c, i) => {
    const p = pos[i];
    if (c && p) s += `<rect x="${p[0]}" y="${p[1]}" width="0.13" height="0.17" fill="${c}"/>`;
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
    '<rect id="ss" width="1.4" height="1.4" class="star" opacity=".45"/><rect id="sb" width="2" height="2" class="star" opacity=".7"/>' +
    '<g id="lp"><circle r="3.2" style="fill:var(--lh,#ffb84d);opacity:var(--lo,.22)"/><rect x="-.8" y="-.8" width="1.6" height="1.6" style="fill:var(--lc,#ffcf87)"/></g>' +
    `<path id="tt" d="M0 0l${n(S)}${sp(S / 2)}l${n(-S)}${sp(S / 2)}l${n(-S)}${sp(-S / 2)}z"/>` +
    `<path id="sl" d="M0 0l${n(S)}${sp(S / 2)}v${n(0.3 * S)}l${n(-S)}${sp(-S / 2)}z"/>` +
    `<path id="sr" d="M0 0l${n(-S)}${sp(S / 2)}v${n(0.3 * S)}l${n(S)}${sp(-S / 2)}z"/>` +
    '<radialGradient id="cm-glow"><stop offset="0" stop-color="#7c5cff" stop-opacity=".55"/><stop offset="1" stop-color="#7c5cff" stop-opacity="0"/></radialGradient>' +
    '<pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(30)"><rect width="1.2" height="4" fill="#ffb84d" opacity=".55"/></pattern>' +
    noisePattern('fT', '#1a1a23', 3, 7) +
    noisePattern('fL', '#14141c', 5, 6) +
    noisePattern('fR', '#101016', 9, 6) +
    noisePattern('fG', '#121218', 13, 6) +
    noisePattern('fW', '#121a28', 17, 6) +
    winPattern('bLa', 'l', '#2a2a3d', [A, A, o, a]) +
    winPattern('bRa', 'r', '#1f1f2d', [A, A, o, a]) +
    winPattern('bLb', 'l', '#2a2a3d', [a, o, A, A]) +
    winPattern('bRb', 'r', '#1f1f2d', [a, o, A, A]) +
    winPattern('hL', 'l', '#3c3079', [V, v2, V, V]) +
    winPattern('hR', 'r', '#2c235b', [V, v2, V, V]) +
    winPattern('vL', 'l', '#7c5cff', [H, H, V, H]) +
    winPattern('vR', 'r', '#4a36a8', [H, H, V, H]) +
    winPattern('dL', 'l', '#222230', [Dm, a, Dm, Dm]) +
    winPattern('dR', 'r', '#191925', [Dm, Dm, a, Dm])
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

/* ------------------------------ Layout ------------------------------ */

const cache = new Map<number, CityLayout>();

/** The city for a layout seed (`fnv1a(firstPlayDay)`); built once and memoised. */
export function buildLayout(seed: number): CityLayout {
  const hit = cache.get(seed);
  if (hit) return hit;
  const tiles: Tile[] = islandCells().map((cell, index) => {
    const d = Math.hypot(cell.x, cell.y);
    const z = zoneOfCell(cell);
    return { index, cell, d, z, kind: cellKind(cell), r: fnv1a(`${seed}:${cell.x}:${cell.y}`) / 4294967296, home: z <= 3, groundMarkup: '', building: null, sparks: [] };
  });
  const tileAt = new Map(tiles.map((t) => [`${t.cell.x},${t.cell.y}`, t] as const));
  for (const t of tiles) {
    const x0 = t.cell.x - 0.5;
    const y0 = t.cell.y - 0.5;
    const x1 = t.cell.x + 0.5;
    const y1 = t.cell.y + 0.5;
    const pt = project(x0, y0);
    const pl = project(x0, y1);
    const pr = project(x1, y0);
    let inner = `<use href="#tt" x="${n(pt[0])}" y="${n(pt[1])}"/>`;
    if (!tileAt.has(`${t.cell.x},${t.cell.y + 1}`)) inner += `<use href="#sl" x="${n(pl[0])}" y="${n(pl[1])}"/>`;
    if (!tileAt.has(`${t.cell.x + 1},${t.cell.y}`)) inner += `<use href="#sr" x="${n(pr[0])}" y="${n(pr[1])}"/>`;
    if ((t.kind === 'road' || t.kind === 'bridge') && (t.cell.x + t.cell.y) % 2 === 0) {
      const c = project(t.cell.x, t.cell.y);
      inner += `<use class="lp" href="#lp" x="${n(c[0])}" y="${n(c[1])}"/>`;
    }
    if (t.kind === 'river' || t.kind === 'pond') {
      const c = project(t.cell.x, t.cell.y);
      inner += `<path class="rp" d="M${f1(c[0] - 5)} ${f1(c[1])}h4m2 2h4"/>`;
    }
    t.groundMarkup = inner;
    t.building = buildingFor(t);
  }
  const buildingTiles = tiles.filter((t) => t.building !== null);
  const sparks: CityLayout['sparks'] = [];
  const rr = mulberry32(77);
  for (const t of tiles) {
    if (t.z < 3 || rr() > 0.19) continue;
    const c = project(t.cell.x + (rr() - 0.5) * 0.6, t.cell.y + (rr() - 0.5) * 0.6, t.building && t.building.family !== 'tree' ? 0.2 + rr() * 1.2 : 0);
    const markup = `<rect x="${f1(c[0])}" y="${f1(c[1])}" width="${rr() < 0.5 ? 2 : 1}" height="1"/>`;
    t.sparks.push(markup);
    sparks.push({ tile: t.index, markup });
  }
  const guides = ZONE_RADII.slice(0, 6)
    .map((r) => `<path class="zguide" d="${ellipsePath(r)}"/>`)
    .join('');
  const bands = ZONE_RADII.map((r, i) => ellipsePath(r) + (i > 0 ? ellipsePath(ZONE_RADII[i - 1]!) : ''));
  const layout: CityLayout = { seed, tiles, buildingTiles, sparks, defs: buildDefs(), sky: buildSky(), guides, bands, tileAt };
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
      const x = f1(c[0]);
      const y = f1(c[1]);
      scorch +=
        `<g class="scorch" opacity="${op}" transform="translate(${x} ${y})">` +
        '<ellipse rx="9" ry="3.8"/><ellipse rx="7" ry="2.9"/><ellipse rx="3.8" ry="1.5" cx="1.5" cy="-.3"/>' +
        '<path d="M-7 0l-4 1.5M6 -1l5 -1.5M2 2l2.5 2.5M-3 -2l-1.5 -2"/>' +
        (w.age < 7
          ? '<rect class="em" x="-3" y="-1.5" width="1.5" height="1.5"/><rect class="em a" x="2" y=".2" width="1.5" height="1.5"/><rect class="em a" x="-.5" y="1" width="1" height="1"/>'
          : '') +
        '</g>';
      if (i === 0 && w.age < 7) {
        flags +=
          `<g class="held r-${w.result}" transform="translate(${x} ${y})">` +
          '<rect class="pole" x="-.6" y="-15" width="1.2" height="15"/>' +
          '<path class="flag" d="M-5 -22h10v5c0 3-2.5 4.5-5 5.5-2.5-1-5-2.5-5-5.5z"/>' +
          (w.result === 'loss' ? '<path class="mark" d="M-2.5 -17h5"/>' : '<path class="mark" d="M-2.6 -17.5l1.8 1.8 3.4-3.6"/>') +
          (w.result === 'decisive' ? '<path d="M0 -27l1 2 2 .2-1.5 1.4.5 2-2-1-2 1 .5-2-1.5-1.4 2-.2z" fill="#ffb84d" stroke="#0f0f14" stroke-width=".5"/>' : '') +
          '</g>';
      }
    }
  }
  return { scorch, flags };
}

/** The Haven annex (Stronghold) or waystation (Corridor) under a pin. */
export function pinBaseMarkup(cell: MapCell, state: PinLike['state']): string {
  const { x, y } = cell;
  if (state === 'stronghold') {
    return `<g class="b f-annex s-c">${box(x - 0.28, y - 0.28, 0.56, 0.56, 0, 0.85)}${box(x - 0.3, y - 0.3, 0.14, 0.14, 0.85, 0.16)}${box(x + 0.16, y + 0.16, 0.14, 0.14, 0.85, 0.16)}${box(x + 0.16, y - 0.3, 0.14, 0.14, 0.85, 0.16)}</g>`;
  }
  if (state === 'corridor') return `<g class="b f-post s-c">${box(x - 0.22, y - 0.22, 0.44, 0.44, 0, 0.45)}</g>`;
  return '';
}

export { ISLAND_RADIUS, ZONE_RADII };
