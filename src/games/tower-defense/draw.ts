/**
 * Canvas drawing for Hold the Haven. Pure drawing from the state and a few view
 * numbers: it never changes a state. No DOM here (the Screen makes the offscreen
 * canvas and reads the colour tokens); nothing is allocated per frame beyond what
 * the canvas calls themselves need: the loops walk the state arrays, the scratch
 * points are reused and the particles live in one typed array.
 */
import { COLS, ROWS, UNIT, enemySlow, pathEnd, pointInto, rangeOf, type Point, type TDState, type TowerKind } from './engine';
import { GLYPH, MONSTER_SHAPE, MONSTER_SIZE, MONSTER_TONE } from './glyphs';

export interface Palette {
  bg: string;
  grass: string;
  grassAlt: string;
  path: string;
  pathEdge: string;
  text: string;
  muted: string;
  accent: string;
  danger: string;
  success: string;
  panel: string;
  tower: Record<TowerKind, string>;
  /** The letter drawn on each tower, in the player's language. */
  letters: Record<TowerKind, string>;
  /** The mark drawn beside a slowed monster, in the player's language. */
  slowMark: string;
  /** Seven body colours for the monsters. */
  monster: string[];
}

export interface Geometry {
  cell: number;
  ox: number;
  oy: number;
}

/** `cell = floor(min(w / 9, h / 7))`, the board centred. */
export function geometry(w: number, h: number): Geometry {
  return geometryInto({ cell: 1, ox: 0, oy: 0 }, w, h);
}

/** Same, written into `out` (the frame loop reuses one object). */
export function geometryInto(out: Geometry, w: number, h: number): Geometry {
  const cell = Math.max(1, Math.floor(Math.min(w / COLS, h / ROWS)));
  out.cell = cell;
  out.ox = Math.floor((w - COLS * cell) / 2);
  out.oy = Math.floor((h - ROWS * cell) / 2);
  return out;
}

/** Particles, shake and bookkeeping that live outside React state. */
export interface Fx {
  /** Pool of 32 particles: x, y, vx, vy, life, colour index. */
  particles: Float32Array;
  lastTick: number;
  lastHaven: number;
  shake: number;
  frame: number;
  /** Scratch the frame loop reuses, so a frame allocates nothing of its own. */
  geo: Geometry;
  pt: Point;
  scratch: Point;
  fontSize: number;
  fontBold: string;
}
export const PARTICLE_COUNT = 32;
const STRIDE = 6;

export function newFx(): Fx {
  return {
    particles: new Float32Array(PARTICLE_COUNT * STRIDE),
    lastTick: -1,
    lastHaven: -1,
    shake: 0,
    frame: 0,
    geo: { cell: 1, ox: 0, oy: 0 },
    pt: { x: 0, y: 0 },
    scratch: { x: 0, y: 0 },
    fontSize: 0,
    fontBold: '',
  };
}

export interface View {
  /** 0..1 between the last two ticks; 1 under reduced motion. */
  alpha: number;
  reduced: boolean;
  cursor: number;
  /** The tower kind picked on a card, and its power, for the range preview. */
  pickedKind: TowerKind | null;
  pickedPower: number;
  /** Pad to star (a hint), or -1. */
  hintPad: number;
  /** Positions the enemies had one render ago, by id. */
  prevPos: Map<number, number>;
  fx: Fx;
}

const TWO_PI = Math.PI * 2;
const DASH_PATH = [6, 6];
const DASH_PAD = [2, 4];
const DASH_RANGE = [5, 5];
const NO_DASH: number[] = [];
const SQUARE = [-1, -1, 1, -1, 1, 1, -1, 1];
const DIAMOND = [0, -1.25, 1, 0, 0, 1.25, -1, 0];
const HEX = [1, 0, 0.5, 0.87, -0.5, 0.87, -1, 0, -0.5, -0.87, 0.5, -0.87];
const STAR = [0, -1, 0.29, -0.4, 0.95, -0.31, 0.47, 0.15, 0.59, 0.81, 0, 0.5, -0.59, 0.81, -0.47, 0.15, -0.95, -0.31, -0.29, -0.4];
const SHAPES = [[], SQUARE, DIAMOND, HEX];

const glyphPaths: Partial<Record<TowerKind, Path2D>> = {};
function glyphPath(kind: TowerKind): Path2D | null {
  if (typeof Path2D === 'undefined') return null;
  return (glyphPaths[kind] ??= new Path2D(GLYPH[kind]));
}

function drawGlyph(ctx: CanvasRenderingContext2D, kind: TowerKind, cx: number, cy: number, size: number, color: string): void {
  const p = glyphPath(kind);
  if (!p) return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke(p);
  ctx.restore();
}

function polygon(ctx: CanvasRenderingContext2D, pts: number[], cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const x = cx + pts[i]! * r;
    const y = cy + pts[i + 1]! * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** The static layer: grass, path, the Haven, pad rings with their numbers. Drawn once per size. */
export function drawStatic(ctx: CanvasRenderingContext2D, w: number, h: number, s: TDState, pal: Palette): void {
  const { cell, ox, oy } = geometry(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? pal.grass : pal.grassAlt;
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
  }
  const path = s.path;
  ctx.fillStyle = pal.path;
  for (let i = 0; i < path.length; i++) {
    const c = path[i]!;
    ctx.fillRect(ox + (c % COLS) * cell, oy + Math.floor(c / COLS) * cell, cell, cell);
  }
  // A dashed line down the middle of the road, so the path never relies on colour.
  ctx.strokeStyle = pal.pathEdge;
  ctx.lineWidth = Math.max(2, cell * 0.08);
  ctx.setLineDash(DASH_PATH);
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const c = path[i]!;
    const x = ox + (c % COLS) * cell + cell / 2;
    const y = oy + Math.floor(c / COLS) * cell + cell / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  // The Haven: a little house at the end of the road.
  const hc = path[path.length - 1]!;
  const hx = ox + (hc % COLS) * cell + cell / 2;
  const hy = oy + Math.floor(hc / COLS) * cell + cell / 2;
  ctx.fillStyle = pal.success;
  ctx.fillRect(hx - cell * 0.28, hy - cell * 0.05, cell * 0.56, cell * 0.33);
  ctx.beginPath();
  ctx.moveTo(hx - cell * 0.38, hy - cell * 0.05);
  ctx.lineTo(hx, hy - cell * 0.36);
  ctx.lineTo(hx + cell * 0.38, hy - cell * 0.05);
  ctx.closePath();
  ctx.fill();
  // Where the monsters come from: a chevron on the first cell.
  const sc = path[0]!;
  const sx = ox + (sc % COLS) * cell + cell / 2;
  const sy = oy + Math.floor(sc / COLS) * cell + cell / 2;
  ctx.strokeStyle = pal.danger;
  ctx.lineWidth = Math.max(2, cell * 0.07);
  ctx.beginPath();
  ctx.moveTo(sx - cell * 0.12, sy - cell * 0.2);
  ctx.lineTo(sx + cell * 0.12, sy);
  ctx.lineTo(sx - cell * 0.12, sy + cell * 0.2);
  ctx.stroke();
  // Pads: dotted rings with their number.
  ctx.strokeStyle = pal.muted;
  ctx.lineWidth = Math.max(1.5, cell * 0.05);
  ctx.setLineDash(DASH_PAD);
  ctx.fillStyle = pal.muted;
  ctx.font = `${Math.max(8, Math.round(cell * 0.2))}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < s.pads.length; i++) {
    const c = s.pads[i]!;
    const x = ox + (c % COLS) * cell;
    const y = oy + Math.floor(c / COLS) * cell;
    ctx.beginPath();
    ctx.arc(x + cell / 2, y + cell / 2, cell * 0.38, 0, TWO_PI);
    ctx.stroke();
    ctx.fillText(String(i + 1), x + cell * 0.08, y + cell * 0.05);
  }
  ctx.setLineDash(NO_DASH);
}

function emit(fx: Fx, x: number, y: number, colour: number, n: number): void {
  const p = fx.particles;
  for (let k = 0; k < n; k++) {
    // Reuse the oldest-looking slot: the one with the least life left.
    let slot = 0;
    let least = Infinity;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const life = p[i * STRIDE + 4]!;
      if (life < least) {
        least = life;
        slot = i;
      }
    }
    const o = slot * STRIDE;
    const a = ((fx.frame * 7 + k * 3 + slot) % 8) * (TWO_PI / 8);
    p[o] = x;
    p[o + 1] = y;
    p[o + 2] = Math.cos(a) * 1.6;
    p[o + 3] = Math.sin(a) * 1.6;
    p[o + 4] = 10;
    p[o + 5] = colour;
  }
}

/** One frame: the static layer, then towers, shots, monsters, particles and the cursor. */
export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, base: CanvasImageSource | null, s: TDState, pal: Palette, v: View): void {
  const fx = v.fx;
  const { cell, ox, oy } = geometryInto(fx.geo, w, h);
  const k = cell / UNIT;
  fx.frame += 1;
  if (!v.reduced) {
    if (fx.lastHaven >= 0 && s.havenHp < fx.lastHaven) fx.shake = 8;
    if (s.tick !== fx.lastTick) {
      for (let i = 0; i < s.shots.length; i++) {
        const sh = s.shots[i]!;
        emit(fx, ox + sh.x * k, oy + sh.y * k, 1, 1);
      }
    }
  }
  fx.lastTick = s.tick;
  fx.lastHaven = s.havenHp;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (fx.shake > 0 && !v.reduced) {
    ctx.translate(((fx.frame % 3) - 1) * 2, ((fx.frame % 2) - 0.5) * 2);
    fx.shake -= 1;
  }
  if (base) ctx.drawImage(base, 0, 0, w, h);

  // Range preview: the cursor tower's reach, or the reach of the picked card on the cursor pad.
  const cursorCell = s.pads[v.cursor];
  if (cursorCell !== undefined) {
    const cx = ox + (cursorCell % COLS) * cell + cell / 2;
    const cy = oy + Math.floor(cursorCell / COLS) * cell + cell / 2;
    let reach = 0;
    for (let i = 0; i < s.towers.length; i++) {
      const t = s.towers[i]!;
      if (t.pad === v.cursor) reach = rangeOf(t.kind, t.level, t.power);
    }
    if (reach === 0 && v.pickedKind !== null) reach = rangeOf(v.pickedKind, 1, v.pickedPower);
    if (reach > 0) {
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(DASH_RANGE);
      ctx.beginPath();
      ctx.arc(cx, cy, reach * k, 0, TWO_PI);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
    }
  }

  // Towers: a glyph and a letter each; a cross-hatch when jammed; pips for the level.
  const letterSize = Math.max(8, Math.round(cell * 0.24));
  if (fx.fontSize !== letterSize) {
    fx.fontSize = letterSize;
    fx.fontBold = `bold ${letterSize}px sans-serif`;
  }
  for (let i = 0; i < s.towers.length; i++) {
    const t = s.towers[i]!;
    const c = s.pads[t.pad]!;
    const x = ox + (c % COLS) * cell;
    const y = oy + Math.floor(c / COLS) * cell;
    const color = pal.tower[t.kind];
    ctx.fillStyle = pal.panel;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + cell / 2, y + cell / 2, cell * 0.4, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();
    drawGlyph(ctx, t.kind, x + cell / 2, y + cell * 0.46, cell * 0.5, color);
    ctx.fillStyle = pal.text;
    ctx.font = fx.fontBold;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(pal.letters[t.kind], x + cell * 0.95, y + cell * 0.98);
    ctx.fillStyle = color;
    for (let p = 0; p < t.level; p++) ctx.fillRect(x + cell * 0.1 + p * cell * 0.1, y + cell * 0.9, cell * 0.07, cell * 0.07);
    if (s.tick < t.jamUntil) {
      ctx.strokeStyle = pal.danger;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let d = -2; d <= 2; d++) {
        ctx.moveTo(x + cell * (0.25 + d * 0.12), y + cell * 0.2);
        ctx.lineTo(x + cell * (0.55 + d * 0.12), y + cell * 0.8);
        ctx.moveTo(x + cell * (0.75 + d * 0.12), y + cell * 0.2);
        ctx.lineTo(x + cell * (0.45 + d * 0.12), y + cell * 0.8);
      }
      ctx.stroke();
    }
  }

  // Shots: a line from the tower to what it aimed at. Under reduced motion they would only blink for one tick, so none is drawn.
  ctx.lineWidth = 2;
  for (let i = 0; i < s.shots.length && !v.reduced; i++) {
    const sh = s.shots[i]!;
    const c = s.pads[sh.pad]!;
    ctx.strokeStyle = pal.tower[sh.kind];
    ctx.beginPath();
    ctx.moveTo(ox + (c % COLS) * cell + cell / 2, oy + Math.floor(c / COLS) * cell + cell / 2);
    ctx.lineTo(ox + sh.x * k, oy + sh.y * k);
    ctx.stroke();
  }

  // Monsters, at prev + (cur - prev) * alpha.
  let hasLull = false;
  for (let i = 0; i < s.towers.length; i++) if (s.towers[i]!.kind === 'lull') hasLull = true;
  const pt = fx.pt;
  const scratch = fx.scratch;
  const end = pathEnd(s.path);
  ctx.font = fx.fontBold;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < s.enemies.length; i++) {
    const e = s.enemies[i]!;
    const before = v.prevPos.get(e.id);
    const pos = v.reduced || before === undefined ? e.pos : Math.min(end, before + (e.pos - before) * v.alpha);
    pointInto(s.path, pos, pt);
    const x = ox + pt.x * k;
    const y = oy + pt.y * k;
    const r = MONSTER_SIZE[e.kind] * cell * 0.1;
    ctx.fillStyle = pal.monster[MONSTER_TONE[e.kind] % pal.monster.length]!;
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 1.5;
    const shape = MONSTER_SHAPE[e.kind];
    if (shape === 0) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TWO_PI);
    } else polygon(ctx, SHAPES[shape]!, x, y, r);
    ctx.fill();
    ctx.stroke();
    if (e.hp < e.maxHp) {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(x - r, y - r - 5, r * 2, 3);
      ctx.fillStyle = pal.success;
      ctx.fillRect(x - r, y - r - 5, (r * 2 * e.hp) / e.maxHp, 3);
    }
    if (s.tick < e.markUntil) {
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, TWO_PI);
      ctx.stroke();
    }
    if (hasLull && enemySlow(s, e, s.tick + 1, scratch) > 0) {
      ctx.fillStyle = pal.text;
      ctx.fillText(pal.slowMark, x + r + 3, y - r);
    }
  }

  // Particles.
  if (!v.reduced) {
    const p = fx.particles;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const o = i * STRIDE;
      if (p[o + 4]! <= 0) continue;
      p[o] = p[o]! + p[o + 2]!;
      p[o + 1] = p[o + 1]! + p[o + 3]!;
      p[o + 4] = p[o + 4]! - 1;
      ctx.globalAlpha = Math.min(1, p[o + 4]! / 10);
      ctx.fillStyle = pal.accent;
      ctx.fillRect(p[o]!, p[o + 1]!, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // The hint star.
  const hint = v.hintPad >= 0 ? s.pads[v.hintPad] : undefined;
  if (hint !== undefined) {
    ctx.fillStyle = pal.accent;
    polygon(ctx, STAR, ox + (hint % COLS) * cell + cell * 0.82, oy + Math.floor(hint / COLS) * cell + cell * 0.2, cell * 0.17);
    ctx.fill();
  }

  // The cursor: four corner brackets round the cell.
  if (cursorCell !== undefined) {
    const x = ox + (cursorCell % COLS) * cell;
    const y = oy + Math.floor(cursorCell / COLS) * cell;
    const pulse = v.reduced ? 0 : (fx.frame >> 4) % 2;
    const m = cell * 0.04 + pulse;
    const a = cell * 0.24;
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = Math.max(2.5, cell * 0.07);
    ctx.beginPath();
    ctx.moveTo(x + m, y + m + a);
    ctx.lineTo(x + m, y + m);
    ctx.lineTo(x + m + a, y + m);
    ctx.moveTo(x + cell - m - a, y + m);
    ctx.lineTo(x + cell - m, y + m);
    ctx.lineTo(x + cell - m, y + m + a);
    ctx.moveTo(x + cell - m, y + cell - m - a);
    ctx.lineTo(x + cell - m, y + cell - m);
    ctx.lineTo(x + cell - m - a, y + cell - m);
    ctx.moveTo(x + m + a, y + cell - m);
    ctx.lineTo(x + m, y + cell - m);
    ctx.lineTo(x + m, y + cell - m - a);
    ctx.stroke();
  }
  ctx.restore();
}
