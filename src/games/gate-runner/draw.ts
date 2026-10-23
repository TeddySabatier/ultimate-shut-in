/**
 * Canvas drawing for Haven Rush. Pure drawing from two states and a few view numbers: it never
 * changes a state, and it reads no clock (everything that moves is a function of the tick count and
 * the interpolation factor, so a 30 or a 144 Hz screen shows the same game). No DOM here: the
 * Screen reads the colour tokens and hands the 2D context in.
 *
 * Nothing is allocated per frame beyond what the canvas calls need: loops walk the state arrays,
 * the scratch geometry and the bullet pool are reused, and number labels come from a cache.
 */
import { CENTER, LANE_W, RAPID_TICKS, applyOp, formatOp, halfOf, type Foe, type Gate, type GateRunnerState, type Item, type Op } from './rules';

export interface Palette {
  bg: string;
  lane: string;
  laneAlt: string;
  rail: string;
  text: string;
  muted: string;
  ink: string;
  accent: string;
  good: string;
  bad: string;
  ok: string;
  squad: string;
  boss: string;
}

/** Bullets: a pool of slots (spawn tick, x offset 0..1 across the squad, lane x, 0). */
const BULLET_SLOTS = 24;
const BULLET_STRIDE = 3;
const BULLET_LIFE = 3;
/** Floating numbers: a few fixed slots, never grown. */
const POP_SLOTS = 6;
export const POP_LIFE = 14;

export interface Pop {
  text: string;
  x: number;
  born: number;
  tone: 'good' | 'bad' | 'plain';
}

export interface Fx {
  bullets: Float32Array;
  bulletNext: number;
  pops: Pop[];
  popNext: number;
  /** The last event tick drawn as a pop, so each event is shown once. */
  lastEventAt: number;
  lastEventCount: number;
  shakeUntil: number;
  /** Scratch geometry, reused every frame. */
  g: Geometry;
}

export interface Geometry {
  w: number;
  h: number;
  laneW: number;
  laneL: number;
  k: number;
  sqY: number;
  gateH: number;
  font: number;
  y: number;
  shakeX: number;
  shakeY: number;
}

export function newFx(): Fx {
  const pops: Pop[] = [];
  for (let i = 0; i < POP_SLOTS; i++) pops.push({ text: '', x: 0, born: -1000, tone: 'plain' });
  return {
    bullets: new Float32Array(BULLET_SLOTS * BULLET_STRIDE),
    bulletNext: 0,
    pops,
    popNext: 0,
    lastEventAt: -1,
    lastEventCount: 0,
    shakeUntil: -1,
    g: { w: 0, h: 0, laneW: 0, laneL: 0, k: 1, sqY: 0, gateH: 30, font: 16, y: 0, shakeX: 0, shakeY: 0 },
  };
}

export interface View {
  /** 0..1 between the last two ticks; 1 under reduced motion. */
  alpha: number;
  reduced: boolean;
  /** Half the hint arrow points at, or -1. */
  hint: -1 | 0 | 1;
  /** Gate op texts, left then right for each gate (computed once per game). */
  texts: string[];
  /** The squad's number is drawn as this text, and the boss label under its bar. */
  bossLabel: string;
}

const NUM: string[] = [];
/** `String(n)` without a new string per frame: a small cache (the counters rarely go past a few thousand). */
export function num(n: number): string {
  if (n < 0 || n > 20_000 || !Number.isInteger(n)) return String(n);
  return (NUM[n] ??= String(n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** What the lane shows ahead and behind the squad, in world units. */
const AHEAD = 440;
const VIEW = 540;

function fit(g: Geometry, w: number, h: number, y: number): void {
  g.w = w;
  g.h = h;
  g.laneW = Math.min(w, h * 0.92);
  g.laneL = (w - g.laneW) / 2;
  g.k = h / VIEW;
  g.sqY = (h * AHEAD) / VIEW;
  g.gateH = Math.max(26, Math.min(40, g.laneW * 0.11));
  g.font = Math.max(12, Math.min(26, g.laneW * 0.075));
  g.y = y;
}

const sx = (g: Geometry, wx: number): number => g.laneL + (wx * g.laneW) / LANE_W + g.shakeX;
const sy = (g: Geometry, wy: number): number => g.sqY - (wy - g.y) * g.k + g.shakeY;

function isGood(op: Op): boolean {
  return op.k === 'mul' || op.k === 'add';
}

function laneBands(ctx: CanvasRenderingContext2D, g: Geometry, pal: Palette): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, g.w, g.h);
  ctx.fillStyle = pal.lane;
  ctx.fillRect(g.laneL, 0, g.laneW, g.h);
  ctx.fillStyle = pal.laneAlt;
  const first = Math.floor((g.y - 100) / 120);
  const last = Math.ceil((g.y + AHEAD) / 120);
  for (let i = first; i <= last; i++) {
    if ((i & 1) === 0) continue;
    const top = sy(g, i * 120 + 120);
    ctx.fillRect(g.laneL, top, g.laneW, 120 * g.k + 1);
  }
  // The divider: short dashes that scroll with the lane.
  ctx.fillStyle = pal.muted;
  const dashFirst = Math.floor((g.y - 100) / 48);
  const dashLast = Math.ceil((g.y + AHEAD) / 48);
  const cx = sx(g, CENTER);
  for (let i = dashFirst; i <= dashLast; i++) ctx.fillRect(cx - 1, sy(g, i * 48 + 24), 2, 24 * g.k);
  ctx.fillStyle = pal.rail;
  ctx.fillRect(g.laneL - 2, 0, 2, g.h);
  ctx.fillRect(g.laneL + g.laneW, 0, 2, g.h);
}

function drawGate(ctx: CanvasRenderingContext2D, g: Geometry, pal: Palette, gate: Gate, i: number, view: View, preview: boolean, squad: number, hint: boolean): void {
  const line = sy(g, gate.y);
  if (line < -g.gateH - 4 || line > g.h + g.gateH) return;
  const half = (g.laneW / 2) * 0.92;
  const ops = [gate.l, gate.r];
  for (let s = 0; s < 2; s++) {
    const op = ops[s]!;
    const cx = sx(g, s === 0 ? 50 : 150);
    const x0 = cx - half / 2;
    const good = isGood(op);
    ctx.fillStyle = good ? pal.good : pal.bad;
    ctx.globalAlpha = 0.28;
    ctx.fillRect(x0, line - g.gateH, half, g.gateH);
    ctx.globalAlpha = 1;
    ctx.fillRect(x0, line - g.gateH, half, 3);
    ctx.fillRect(x0, line - 3, half, 3);
    ctx.fillRect(x0, line - g.gateH, 3, g.gateH);
    ctx.fillRect(x0 + half - 3, line - g.gateH, 3, g.gateH);
    ctx.fillStyle = pal.text;
    ctx.font = `700 ${Math.round(g.font * 1.15)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(view.texts[i * 2 + s]!, cx, line - g.gateH / 2 + 1, half - 10);
    if (preview) {
      ctx.fillStyle = pal.muted;
      ctx.font = `${Math.round(g.font * 0.75)}px ui-monospace, monospace`;
      ctx.fillText(num(applyOp(squad, op)), cx, line - g.gateH - g.font * 0.55, half - 6);
    }
  }
  if (hint && view.hint >= 0) {
    const cx = sx(g, view.hint === 0 ? 50 : 150);
    const top = line - g.gateH - g.font * 1.5 - (preview ? 0 : 0);
    ctx.fillStyle = pal.ok;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx - 9, top - 12);
    ctx.lineTo(cx + 9, top - 12);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFoe(ctx: CanvasRenderingContext2D, g: Geometry, pal: Palette, f: Foe, gateH: number, onGate: boolean): void {
  const full = f.lane === 2;
  const lineY = sy(g, f.y) - (onGate ? gateH + 2 : 0);
  const h = Math.max(24, g.gateH * 0.95);
  if (lineY < -h - 4 || lineY > g.h + h) return;
  const width = full ? g.laneW * 0.9 : g.laneW * 0.46;
  const cx = full ? sx(g, CENTER) : sx(g, f.lane === 0 ? 50 : 150);
  const x0 = cx - width / 2;
  const top = lineY - h;
  if (f.wall) {
    ctx.fillStyle = pal.muted;
    ctx.fillRect(x0, top, width, h);
    ctx.fillStyle = pal.rail;
    // Brick lines.
    ctx.fillRect(x0, top + h / 2 - 1, width, 2);
    for (let b = 1; b < 6; b++) ctx.fillRect(x0 + (width * b) / 6, top + (b & 1 ? 0 : h / 2), 2, h / 2);
  } else {
    ctx.fillStyle = pal.bad;
    const cols = full ? 9 : 5;
    const gap = width / cols;
    for (let c = 0; c < cols; c++) {
      const bx = x0 + gap * (c + 0.5);
      const by = top + h * (c & 1 ? 0.62 : 0.38);
      ctx.fillRect(bx - gap * 0.32, by - gap * 0.32, gap * 0.64, gap * 0.64);
    }
  }
  const label = num(f.hp);
  const font = Math.round(g.font);
  ctx.font = `700 ${font}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.fillRect(cx - font * 1.4, top + h / 2 - font * 0.65, font * 2.8, font * 1.3);
  ctx.fillStyle = pal.text;
  ctx.fillText(label, cx, top + h / 2 + 1, font * 2.6);
}

function drawItem(ctx: CanvasRenderingContext2D, g: Geometry, pal: Palette, it: Item): void {
  const y = sy(g, it.y) + g.gateH * 0.55;
  if (y < -20 || y > g.h + 20) return;
  const cx = it.lane === 2 ? sx(g, CENTER) : sx(g, it.lane === 0 ? 50 : 150);
  const r = Math.max(9, g.font * 0.8);
  ctx.fillStyle = it.kind === 'members' ? pal.ok : pal.squad;
  ctx.beginPath();
  ctx.arc(cx, y, r, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = pal.ink;
  ctx.font = `700 ${Math.round(r * 1.05)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(it.kind === 'members' ? `+${num(it.n)}` : '>>', cx, y + 1, r * 1.9);
}

function drawBoss(ctx: CanvasRenderingContext2D, g: Geometry, pal: Palette, cur: GateRunnerState, bossWorldY: number, view: View): void {
  const line = sy(g, bossWorldY);
  const h = g.gateH * 2.6;
  if (line < -h - 30 || line > g.h + h) return;
  const width = g.laneW * 0.84;
  const x0 = sx(g, CENTER) - width / 2;
  const top = line - h;
  ctx.fillStyle = pal.boss;
  ctx.fillRect(x0, top, width, h);
  // Horns, eyes and a mouth: blocky, in the pixel spirit.
  ctx.fillRect(x0 + width * 0.08, top - h * 0.22, width * 0.14, h * 0.24);
  ctx.fillRect(x0 + width * 0.78, top - h * 0.22, width * 0.14, h * 0.24);
  ctx.fillStyle = pal.ink;
  ctx.fillRect(x0 + width * 0.22, top + h * 0.22, width * 0.16, h * 0.2);
  ctx.fillRect(x0 + width * 0.62, top + h * 0.22, width * 0.16, h * 0.2);
  ctx.fillRect(x0 + width * 0.3, top + h * 0.62, width * 0.4, h * 0.12);
  // The hit point bar across its brow and the number on its chin.
  const barY = top + 5;
  ctx.fillStyle = pal.ink;
  ctx.fillRect(x0 + 5, barY, width - 10, 10);
  ctx.fillStyle = pal.bad;
  const frac = cur.bossMax > 0 ? cur.bossHp / cur.bossMax : 0;
  ctx.fillRect(x0 + 6, barY + 1, Math.max(0, (width - 12) * frac), 8);
  const font = Math.round(g.font * 1.1);
  ctx.font = `700 ${font}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = Math.min(width * 0.7, font * (view.bossLabel.length * 0.62 + 1.2));
  ctx.fillStyle = pal.ink;
  ctx.fillRect(sx(g, CENTER) - tw / 2, top + h - font * 1.5, tw, font * 1.2);
  ctx.fillStyle = pal.text;
  ctx.fillText(view.bossLabel, sx(g, CENTER), top + h - font * 0.9 + 1, tw - 4);
}

function drawSquad(ctx: CanvasRenderingContext2D, g: Geometry, pal: Palette, x: number, squad: number): void {
  const cx = sx(g, x);
  const cy = g.sqY;
  const drawn = squad < 40 ? squad : 40;
  const spacing = Math.max(6, Math.min(12, g.laneW * 0.05));
  const cols = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(drawn * 1.6))));
  const rows = Math.ceil(drawn / cols);
  const r = spacing * 0.36;
  ctx.fillStyle = pal.ink;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(cx - (cols * spacing) / 2 - 2, cy - (rows * spacing) / 2 + 3, cols * spacing + 4, rows * spacing);
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.squad;
  ctx.beginPath();
  for (let i = 0; i < drawn; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? drawn - row * cols : cols;
    const col = i - row * cols;
    const px = cx + (col - (inRow - 1) / 2) * spacing;
    const py = cy + (row - (rows - 1) / 2) * spacing;
    ctx.moveTo(px + r, py);
    ctx.arc(px, py, r, 0, 6.2832);
  }
  ctx.fill();
  const label = num(squad);
  const font = Math.round(g.font * 1.25);
  ctx.font = `700 ${font}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ly = cy - (rows * spacing) / 2 - font * 0.8;
  const tw = Math.min(g.laneW * 0.46, font * (label.length * 0.62 + 1.2));
  ctx.fillStyle = pal.ink;
  ctx.fillRect(cx - tw / 2, ly - font * 0.62, tw, font * 1.24);
  ctx.fillStyle = pal.text;
  ctx.fillText(label, cx, ly + 1, tw - 4);
}

function drawBullets(ctx: CanvasRenderingContext2D, g: Geometry, pal: Palette, fx: Fx, step: number, alpha: number, x: number): void {
  const b = fx.bullets;
  ctx.fillStyle = pal.text;
  for (let i = 0; i < BULLET_SLOTS; i++) {
    const born = b[i * BULLET_STRIDE]!;
    const age = step - born + alpha;
    if (born < 0 || age < 0 || age >= BULLET_LIFE) continue;
    const bx = sx(g, x) + (b[i * BULLET_STRIDE + 1]! - 0.5) * g.laneW * 0.22;
    const by = g.sqY - 16 - age * g.h * 0.09;
    ctx.fillRect(bx - 1, by, 2, 8);
  }
}

function drawPops(ctx: CanvasRenderingContext2D, g: Geometry, pal: Palette, fx: Fx, step: number, alpha: number, reduced: boolean, x: number): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(g.font * 1.1)}px ui-monospace, monospace`;
  for (let i = 0; i < POP_SLOTS; i++) {
    const p = fx.pops[i]!;
    const age = step - p.born + (reduced ? 0 : alpha);
    if (age < 0 || age >= POP_LIFE) continue;
    const rise = reduced ? 0 : age * 2.2;
    const py = g.sqY - g.font * 3.4 - rise;
    ctx.fillStyle = pal.ink;
    ctx.fillRect(sx(g, x) + g.laneW * 0.16 - g.font * 1.6, py - g.font * 0.7, g.font * 3.2, g.font * 1.4);
    ctx.fillStyle = p.tone === 'good' ? pal.ok : p.tone === 'bad' ? pal.bad : pal.text;
    ctx.fillText(p.text, sx(g, x) + g.laneW * 0.16, py + 1, g.font * 3);
  }
}

/**
 * Watch two states for what the canvas shows once: a volley (the volley cooldown went up) spawns
 * bullets, a new event spawns a floating number, a heavy hit shakes the lane. Call it once per tick.
 */
export function noteTick(fx: Fx, prev: GateRunnerState, cur: GateRunnerState, reduced: boolean): void {
  if (cur.step === prev.step) return;
  if (!reduced && cur.cd > prev.cd && cur.phase !== 'lost') {
    for (let k = 0; k < 3; k++) {
      const i = fx.bulletNext;
      fx.bulletNext = (i + 1) % BULLET_SLOTS;
      fx.bullets[i * BULLET_STRIDE] = cur.step;
      fx.bullets[i * BULLET_STRIDE + 1] = (k + 0.5) / 3;
    }
  }
  const events = cur.events;
  if (events.length === 0) return;
  const last = events[events.length - 1]!;
  if (last.at === fx.lastEventAt && events.length === fx.lastEventCount) return;
  fx.lastEventAt = last.at;
  fx.lastEventCount = events.length;
  const pop = fx.pops[fx.popNext]!;
  fx.popNext = (fx.popNext + 1) % POP_SLOTS;
  pop.born = cur.step;
  pop.x = cur.x;
  if (last.t === 'gate') {
    pop.text = last.op;
    pop.tone = last.b >= last.a ? 'good' : 'bad';
  } else if (last.t === 'hit') {
    pop.text = `-${last.a}`;
    pop.tone = 'bad';
    if (!reduced && last.a >= 3) fx.shakeUntil = cur.step + 4;
  } else if (last.t === 'pick') {
    pop.text = last.op === 'rapid' ? '>>' : `+${last.a}`;
    pop.tone = 'good';
  } else {
    pop.text = 'x2';
    pop.tone = 'good';
  }
}

/** Draw one frame. `prev` and `cur` are the states of the last two ticks; the lane and squad are drawn `alpha` of the way between. */
export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, prev: GateRunnerState, cur: GateRunnerState, pal: Palette, view: View, fx: Fx): void {
  const a = view.alpha;
  const y = lerp(prev.y, cur.y, a);
  const x = lerp(prev.x, cur.x, a);
  const g = fx.g;
  fit(g, w, h, y);
  const shaking = !view.reduced && cur.step < fx.shakeUntil;
  g.shakeX = shaking ? ((cur.step * 7) % 5) - 2 : 0;
  g.shakeY = shaking ? ((cur.step * 3) % 5) - 2 : 0;
  laneBands(ctx, g, pal);

  // The half the squad stands in, tinted, so the choice is never only a colour: the squad is also there.
  const half = halfOf(cur.x);
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.08;
  ctx.fillRect(g.laneL + (half === 0 ? 0 : g.laneW / 2), 0, g.laneW / 2, g.h);
  ctx.globalAlpha = 1;

  const gi = cur.gi;
  for (let i = cur.gates.length - 1; i >= 0; i--) {
    const gate = cur.gates[i]!;
    if (gate.y < y - 60 || gate.y > y + AHEAD + 60) continue;
    const next = i >= gi && i < gi + 2 && cur.study;
    drawGate(ctx, g, pal, gate, i, view, next, cur.squad, i === gi && cur.hints > 0);
  }
  for (let j = cur.foes.length - 1; j >= 0; j--) {
    const f = cur.foes[j]!;
    if (f.hp <= 0 || f.y < y - 40 || f.y > y + AHEAD + 80) continue;
    drawFoe(ctx, g, pal, f, g.gateH, f.lane !== 2);
  }
  for (let j = cur.items.length - 1; j >= cur.ii; j--) {
    const it = cur.items[j]!;
    if (it.y > y + AHEAD + 40) continue;
    drawItem(ctx, g, pal, it);
  }
  const bossY = lerp(prev.bossLine + prev.bossGap, cur.bossLine + cur.bossGap, a);
  drawBoss(ctx, g, pal, cur, bossY, view);
  if (!view.reduced) drawBullets(ctx, g, pal, fx, cur.step, a, x);
  drawSquad(ctx, g, pal, x, cur.squad);
  drawPops(ctx, g, pal, fx, cur.step, a, view.reduced, x);

  if (cur.rapid > 0) {
    // A thin amber bar under the lane while rapid fire lasts.
    ctx.fillStyle = pal.accent;
    ctx.fillRect(g.laneL, g.h - 4, Math.min(g.laneW, (g.laneW * cur.rapid) / RAPID_TICKS), 4);
  }
}

/** The text of every gate op, left then right, for `View.texts`. */
export function gateTexts(gates: readonly Gate[]): string[] {
  const out: string[] = [];
  for (const gate of gates) out.push(formatOp(gate.l), formatOp(gate.r));
  return out;
}
