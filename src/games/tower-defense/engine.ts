/**
 * Hold the Haven: a tower defense where the troops are the towers.
 * The build spec is docs/games/tower-defense.md; section numbers below refer to it.
 *
 * - Pure and deterministic: integer maths only (1 cell = 1000 units, 50 ms
 *   ticks, squared distances), no clock, no Math.random. Setup randomness is
 *   salted `tower-defense:`; `reduce` needs none.
 * - The state is plain JSON and never mutated: `reduce` works on a fresh copy
 *   and shares every untouched part with the input.
 * - Invalid actions, and any action after the end, return the state as is.
 */
import { fnv1a, mulberry32, rngInt, type Rng } from '../../game/rng';
import { buffAmount, clampScore, formatText, type GameEngine, type Locale, type Outcome, type Party, type RunContext } from '../contract';
import { strings, type TDStrings } from './strings';

// ---------------------------------------------------------------------------
// Types (spec section 8)
// ---------------------------------------------------------------------------

export type TowerKind = 'runner' | 'lantern' | 'sweeper' | 'chorus' | 'archivist' | 'lull' | 'hearth' | 'bubble';
export type MonsterId =
  | 'clutter-blob'
  | 'dust-bunny'
  | 'procrastination-moth'
  | 'junk-food-imp'
  | 'fog-wraith'
  | 'couch-leech'
  | 'snooze-golem'
  | 'silence-specter'
  | 'doomscroll-wyrm'
  | 'the-static';

export interface Member {
  id: string;
  name: string;
  kind: TowerKind | null;
  power: number;
  kills: number;
  dealt: number;
  placed: boolean;
}
export interface Tower {
  pad: number;
  member: string;
  kind: TowerKind;
  level: 1 | 2 | 3;
  power: number;
  cd: number;
  invested: number;
  jamUntil: number;
}
export interface Enemy {
  id: number;
  kind: MonsterId;
  wave: number;
  hp: number;
  maxHp: number;
  pos: number;
  speed: number;
  armour: number;
  glow: number;
  leak: number;
  markUntil: number;
  markPct: number;
  knockUntil: number;
  pulseAt: number;
}
/** `at` is an absolute tick. */
export interface Spawn {
  at: number;
  kind: MonsterId;
  wave: number;
}
/** A shot fired this tick, for drawing: the tower's pad and where it aimed (units). */
export interface Shot {
  pad: number;
  x: number;
  y: number;
  kind: TowerKind;
}
export interface FeedLine {
  seq: number;
  key: string;
  params: Record<string, string | number>;
}
export interface TDState {
  seed: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  layout: 0 | 1 | 2;
  mirror: boolean;
  path: number[];
  pads: number[];
  members: Member[];
  towers: Tower[];
  waves: Array<Array<{ offset: number; kind: MonsterId }>>;
  started: number;
  /** Tick at which the next wave starts by itself; -1: none scheduled. */
  waveAt: number;
  queue: Spawn[];
  enemies: Enemy[];
  nextId: number;
  tick: number;
  cleared: number;
  total: number;
  glow: number;
  glowEarned: number;
  havenHp: number;
  havenMax: number;
  revivesLeft: number;
  hintsLeft: number;
  attackPct: number;
  luckPct: number;
  timePct: number;
  earlyTicks: number;
  kills: number;
  leaks: number;
  speed: 1 | 2;
  shots: Shot[];
  feed: FeedLine[];
  feedSeq: number;
  result: 'won' | 'lost' | 'fled' | null;
}
export type TDAction =
  | { type: 'tick' }
  /** `hinted`: the Screen had starred this pad for this member; only then does a placement spend a hint. */
  | { type: 'place'; pad: number; member: string; hinted?: boolean }
  | { type: 'upgrade'; pad: number }
  | { type: 'sell'; pad: number }
  | { type: 'callWave' }
  | { type: 'setSpeed'; speed: 1 | 2 }
  | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Tunable numbers (spec sections 4 to 6; the balanced values live in docs/games/tower-defense.md)
// ---------------------------------------------------------------------------

export const COLS = 9;
export const ROWS = 7;
export const UNIT = 1000;
export const ENEMY_CAP = 48;
export const GUARD_TICKS = 18000;
export const FEED_KEEP = 6;
/** Hit points of the boss. */
export const STATIC_HP = 800;
/** Percent of base hit points per difficulty. */
export const HP_PCT: readonly number[] = [220, 310, 410, 470, 520];
/** Percent of the template's monster count per difficulty. */
export const CNT_PCT: readonly number[] = [90, 100, 110, 115, 120];
/** Glow at the start per difficulty. */
export const START_GLOW: readonly number[] = [120, 110, 100, 95, 90];
const HAVEN_HP: readonly number[] = [20, 15, 10, 8, 6];
const TOTAL_WAVES: readonly number[] = [5, 6, 8, 8, 8];
const FIRST_WAVE_TICK: readonly number[] = [400, 340, 300, 300, 300];
export const BREAK_TICKS: readonly number[] = [260, 230, 200, 200, 200];
const INTERVAL_DELTA: readonly number[] = [6, 3, 0, -2, -4];

export const TOWER_KINDS: readonly TowerKind[] = ['runner', 'lantern', 'sweeper', 'chorus', 'archivist', 'lull', 'hearth', 'bubble'];
/** Kinds the bot builds in numbers (spec section 9). */
export const DAMAGE_KINDS: readonly TowerKind[] = ['runner', 'lantern', 'sweeper', 'bubble'];

const HABIT_KIND: Record<string, TowerKind> = {
  move: 'runner',
  outside: 'lantern',
  clean: 'sweeper',
  social: 'chorus',
  study: 'archivist',
  sleep: 'lull',
  eat: 'hearth',
  hygiene: 'bubble',
};

interface TowerBase {
  damage: number;
  range: number;
  interval: number;
  cost: number;
}
const BASE: Record<TowerKind, TowerBase> = {
  runner: { damage: 4, range: 1500, interval: 5, cost: 30 },
  lantern: { damage: 14, range: 2800, interval: 24, cost: 40 },
  sweeper: { damage: 5, range: 1200, interval: 12, cost: 35 },
  chorus: { damage: 0, range: 0, interval: 0, cost: 30 },
  archivist: { damage: 3, range: 2200, interval: 20, cost: 35 },
  lull: { damage: 0, range: 1600, interval: 0, cost: 30 },
  hearth: { damage: 0, range: 0, interval: 400, cost: 45 },
  bubble: { damage: 8, range: 1800, interval: 18, cost: 40 },
};
const DAMAGE_PCT = [100, 150, 220];
const RANGE_PLUS = [0, 250, 500];
const CHORUS_BASE = [25, 40, 60];
const MARK_TICKS = [60, 80, 100];
const MARK_BASE = [25, 35, 45];
const LULL_BASE = [30, 35, 40];
const HEARTH_BASE = [400, 300, 220];
const SPLASH_RADIUS = [700, 700, 900];
const KNOCK_BACK = [250, 300, 350];
const KNOCK_COOLDOWN = 40;
const MAX_SLOW = 50;
const PULSE_EVERY = 100;
const PULSE_RANGE = 3000;
const JAM_TICKS = 60;

interface EnemyBase {
  hp: number;
  speed: number;
  armour: number;
  glow: number;
  leak: number;
}
const ENEMY: Record<MonsterId, EnemyBase> = {
  'clutter-blob': { hp: 60, speed: 30, armour: 0, glow: 4, leak: 1 },
  'dust-bunny': { hp: 24, speed: 44, armour: 0, glow: 2, leak: 1 },
  'procrastination-moth': { hp: 40, speed: 52, armour: 0, glow: 3, leak: 1 },
  'junk-food-imp': { hp: 55, speed: 40, armour: 1, glow: 4, leak: 1 },
  'fog-wraith': { hp: 75, speed: 34, armour: 0, glow: 5, leak: 1 },
  'couch-leech': { hp: 130, speed: 20, armour: 2, glow: 7, leak: 2 },
  'snooze-golem': { hp: 170, speed: 18, armour: 4, glow: 9, leak: 2 },
  'silence-specter': { hp: 85, speed: 38, armour: 1, glow: 6, leak: 1 },
  'doomscroll-wyrm': { hp: 320, speed: 24, armour: 2, glow: 18, leak: 3 },
  'the-static': { hp: STATIC_HP, speed: 16, armour: 3, glow: 0, leak: 5 },
};

// ---------------------------------------------------------------------------
// Maps (spec section 2)
// ---------------------------------------------------------------------------

interface MapDef {
  waypoints: ReadonlyArray<readonly [number, number]>;
  /** Seven rows of nine cells: `S` start, `=` path, `H` the Haven, `o` pad, `.` grass. */
  rows: readonly string[];
}
export const MAPS: readonly MapDef[] = [
  {
    waypoints: [[0, 1], [6, 1], [6, 3], [1, 3], [1, 5], [8, 5]],
    rows: ['.........', 'S======..', '.oo.oo=o.', '.======..', '.=oo.oo..', '.=======H', '....o....'],
  },
  {
    waypoints: [[0, 1], [1, 1], [1, 5], [4, 5], [4, 1], [7, 1], [7, 5], [8, 5]],
    rows: ['.....o...', 'S=..====.', '.=..=..=.', 'o=oo=oo=o', '.=..=..=.', '.====oo=H', '..o......'],
  },
  {
    waypoints: [[0, 0], [3, 0], [3, 3], [0, 3], [0, 6], [5, 6], [5, 3], [8, 3]],
    rows: ['S===.....', '.o.=o....', '..o=..oo.', '====o===H', '=o...=oo.', '=.o.o=...', '======...'],
  },
];

/** Cell indices of the path, start to Haven, after the optional mirror. */
export function buildPath(layout: number, mirror: boolean): number[] {
  const wps = MAPS[layout]!.waypoints;
  const cells: number[] = [];
  const cell = (x: number, y: number) => y * COLS + (mirror ? COLS - 1 - x : x);
  let [x, y] = wps[0]!;
  cells.push(cell(x, y));
  for (let i = 1; i < wps.length; i++) {
    const [tx, ty] = wps[i]!;
    const dx = Math.sign(tx - x);
    const dy = Math.sign(ty - y);
    while (x !== tx || y !== ty) {
      x += dx;
      y += dy;
      cells.push(cell(x, y));
    }
  }
  return cells;
}

/** Cell indices of the build pads, row-major after the optional mirror. */
export function buildPads(layout: number, mirror: boolean): number[] {
  const pads: number[] = [];
  MAPS[layout]!.rows.forEach((row, y) => {
    for (let x = 0; x < COLS; x++) if (row[x] === 'o') pads.push(y * COLS + (mirror ? COLS - 1 - x : x));
  });
  return pads.sort((a, b) => a - b);
}

export interface Point {
  x: number;
  y: number;
}

/** Write the point at path position `pos` (units) into `out`: exact integer interpolation between cell centres. */
export function pointInto(path: readonly number[], pos: number, out: Point): void {
  const last = path.length - 1;
  if (pos >= last * UNIT) {
    const c = path[last]!;
    out.x = (c % COLS) * UNIT + UNIT / 2;
    out.y = Math.floor(c / COLS) * UNIT + UNIT / 2;
    return;
  }
  const k = Math.floor(pos / UNIT);
  const f = pos - k * UNIT;
  const a = path[k]!;
  const b = path[k + 1]!;
  const ax = a % COLS;
  const ay = (a - ax) / COLS;
  const bx = b % COLS;
  const by = (b - bx) / COLS;
  out.x = ax * UNIT + UNIT / 2 + (bx - ax) * f;
  out.y = ay * UNIT + UNIT / 2 + (by - ay) * f;
}

/** Path length in units: the position at which an enemy reaches the Haven. */
export function pathEnd(path: readonly number[]): number {
  return (path.length - 1) * UNIT;
}

export function enemyPoint(state: TDState, enemy: Enemy): Point {
  const out = { x: 0, y: 0 };
  pointInto(state.path, enemy.pos, out);
  return out;
}

/** The pad's cell centre, in units, plus its grid column and row. */
export function padCell(state: TDState, pad: number): Point & { cx: number; cy: number } {
  const c = state.pads[pad] ?? 0;
  const cx = c % COLS;
  const cy = (c - cx) / COLS;
  return { x: cx * UNIT + UNIT / 2, y: cy * UNIT + UNIT / 2, cx, cy };
}

function padCenter(w: TDState, pad: number): Point {
  const c = w.pads[pad] ?? 0;
  const cx = c % COLS;
  return { x: cx * UNIT + UNIT / 2, y: ((c - cx) / COLS) * UNIT + UNIT / 2 };
}

// ---------------------------------------------------------------------------
// Tower numbers (spec section 3)
// ---------------------------------------------------------------------------

export function damageOf(kind: TowerKind, level: number, power: number): number {
  const base = BASE[kind].damage;
  if (base === 0) return 0;
  return Math.max(1, Math.floor((Math.floor((base * DAMAGE_PCT[level - 1]!) / 100) * (100 + power)) / 100));
}
export function rangeOf(kind: TowerKind, level: number, power: number): number {
  const base = BASE[kind].range;
  return base === 0 ? 0 : base + 5 * power + RANGE_PLUS[level - 1]!;
}
export function intervalOf(kind: TowerKind, level: number, power: number): number {
  if (kind === 'hearth') return Math.max(100, HEARTH_BASE[level - 1]! - 2 * power);
  if (BASE[kind].interval === 0) return 0;
  return Math.max(3, BASE[kind].interval - Math.floor(power / 30));
}
export function costOf(kind: TowerKind, power: number): number {
  return BASE[kind].cost + Math.floor(power / 5);
}
/** Percent damage boost a Chorus of this level and power gives its neighbours. */
export function chorusBoost(level: number, power: number): number {
  return CHORUS_BASE[level - 1]! + Math.floor(power / 4);
}
export function lullSlow(level: number, power: number): number {
  return Math.min(MAX_SLOW, LULL_BASE[level - 1]! + Math.floor(power / 5));
}
export function markPctOf(level: number, power: number): number {
  return MARK_BASE[level - 1]! + Math.floor(power / 5);
}
export function markTicksOf(level: number): number {
  return MARK_TICKS[level - 1]!;
}
export function splashRadiusOf(level: number): number {
  return SPLASH_RADIUS[level - 1]!;
}

export interface TowerStats {
  damage: number;
  range: number;
  interval: number;
  /** Percent damage boost a Chorus gives (0 for every other kind). */
  boost: number;
}
export function towerStats(tower: Tower): TowerStats {
  return {
    damage: damageOf(tower.kind, tower.level, tower.power),
    range: rangeOf(tower.kind, tower.level, tower.power),
    interval: intervalOf(tower.kind, tower.level, tower.power),
    boost: tower.kind === 'chorus' ? chorusBoost(tower.level, tower.power) : 0,
  };
}
export function placeCost(member: Member): number {
  return member.kind === null ? 0 : costOf(member.kind, member.power);
}
/** Glow for the next level, or `null` at the top. Level 2 costs one `cost`, level 3 two. */
export function upgradeCost(tower: Tower): number | null {
  if (tower.level >= 3) return null;
  return costOf(tower.kind, tower.power) * tower.level;
}
export function refund(tower: Tower): number {
  return Math.floor((tower.invested * 70) / 100);
}
export function isOver(state: TDState): boolean {
  return state.result !== null;
}
export function breakTicks(state: TDState): number {
  return BREAK_TICKS[state.difficulty - 1]!;
}
/** Glow an immediate `callWave` would give now, or `null` when it is not allowed. */
export function callWaveBonus(state: TDState): number | null {
  if (isOver(state) || state.started >= state.total || state.queue.length > 0) return null;
  const saved = state.waveAt >= 0 ? Math.max(0, state.waveAt - state.tick) : breakTicks(state);
  return Math.floor(saved / 10);
}

function chebyshev(a: number, b: number): number {
  const dx = (a % COLS) - (b % COLS);
  const dy = Math.floor(a / COLS) - Math.floor(b / COLS);
  return Math.max(Math.abs(dx), Math.abs(dy));
}

/** Slow (percent) the Lull towers of `state` put on `e` at tick `tick`; `pt` is scratch space. */
export function enemySlow(state: TDState, e: Enemy, tick: number, pt: Point): number {
  if (e.kind === 'silence-specter') return 0;
  let slow = 0;
  let placed = false;
  for (let i = 0; i < state.towers.length; i++) {
    const l = state.towers[i]!;
    if (l.kind !== 'lull' || tick < l.jamUntil) continue;
    if (!placed) {
      pointInto(state.path, e.pos, pt);
      placed = true;
    }
    const c = state.pads[l.pad] ?? 0;
    const cx = c % COLS;
    const dx = cx * UNIT + UNIT / 2 - pt.x;
    const dy = ((c - cx) / COLS) * UNIT + UNIT / 2 - pt.y;
    const r = rangeOf('lull', l.level, l.power);
    if (dx * dx + dy * dy <= r * r) slow = Math.max(slow, lullSlow(l.level, l.power));
  }
  return e.kind === 'the-static' ? Math.floor(slow / 2) : slow;
}

/** Per pad: how good a spot it is for this member's tower (-1: taken). Chorus: adjacent damage towers; Hearth: 0; others: path cell centres in range. */
export function padScores(state: TDState, member: Member): number[] {
  const kind = member.kind;
  const range = kind === null ? 0 : rangeOf(kind, 1, member.power);
  const r2 = range * range;
  return state.pads.map((cell, pad) => {
    if (kind === null || state.towers.some((t) => t.pad === pad)) return -1;
    if (kind === 'hearth') return 0;
    if (kind === 'chorus') {
      let n = 0;
      for (const t of state.towers) if (DAMAGE_KINDS.includes(t.kind) && chebyshev(state.pads[t.pad]!, cell) === 1) n++;
      return n;
    }
    const px = (cell % COLS) * UNIT;
    const py = Math.floor(cell / COLS) * UNIT;
    let n = 0;
    for (const p of state.path) {
      const dx = (p % COLS) * UNIT - px;
      const dy = Math.floor(p / COLS) * UNIT - py;
      if (dx * dx + dy * dy <= r2) n++;
    }
    return n;
  });
}

/** The free pad that suits this member's tower best (ties: lowest pad), or `null` when no pad is free. */
export function bestPad(state: TDState, memberId: string): number | null {
  const member = state.members.find((m) => m.id === memberId);
  if (!member || member.kind === null) return null;
  const scores = padScores(state, member);
  let best = -1;
  for (let i = 0; i < scores.length; i++) if (scores[i]! > (scores[best] ?? -1)) best = i;
  return best < 0 ? null : best;
}

// ---------------------------------------------------------------------------
// Waves (spec section 5)
// ---------------------------------------------------------------------------

type Group = readonly [MonsterId, number];
/** One template: groups in spawn order; a list of groups is a pick drawn on the setup rng. */
interface Template {
  interval: number;
  parts: ReadonlyArray<Group | readonly Group[]>;
}
const TEMPLATES: Record<number, Template> = {
  1: { interval: 40, parts: [['clutter-blob', 6]] },
  2: { interval: 32, parts: [['clutter-blob', 5], [['dust-bunny', 6], ['procrastination-moth', 4]]] },
  3: { interval: 30, parts: [[['junk-food-imp', 6], ['fog-wraith', 5]], ['dust-bunny', 6]] },
  4: { interval: 28, parts: [['couch-leech', 3], [['procrastination-moth', 6], ['junk-food-imp', 5]]] },
  5: { interval: 26, parts: [['clutter-blob', 6], ['doomscroll-wyrm', 1], [['silence-specter', 3], ['fog-wraith', 4]]] },
  6: { interval: 24, parts: [['snooze-golem', 3], [['dust-bunny', 10], ['procrastination-moth', 7]]] },
  7: { interval: 22, parts: [] },
  8: { interval: 24, parts: [['clutter-blob', 4], ['dust-bunny', 6], ['the-static', 1]] },
};
const SEVEN_OPTIONS: readonly Group[] = [['silence-specter', 4], ['couch-leech', 4], ['fog-wraith', 6], ['junk-food-imp', 7]];

function templateOrder(difficulty: number): number[] {
  if (difficulty <= 1) return [1, 2, 3, 4, 8];
  if (difficulty === 2) return [1, 2, 3, 4, 5, 8];
  return [1, 2, 3, 4, 5, 6, 7, 8];
}

function isGroup(part: Group | readonly Group[]): part is Group {
  return typeof part[0] === 'string';
}

/** The groups a template plays at this setup: picks are drawn from `rng` in order. */
function resolveGroups(template: number, rng: Rng): Group[] {
  if (template === 7) {
    const a = rngInt(rng, 4);
    let b = rngInt(rng, 3);
    if (b >= a) b += 1;
    return [SEVEN_OPTIONS[a]!, SEVEN_OPTIONS[b]!];
  }
  return TEMPLATES[template]!.parts.map((part) => (isGroup(part) ? part : part[rngInt(rng, part.length)]!));
}

function buildWave(template: number, difficulty: number, rng: Rng): Array<{ offset: number; kind: MonsterId }> {
  const groups = resolveGroups(template, rng);
  const interval = TEMPLATES[template]!.interval + INTERVAL_DELTA[difficulty - 1]!;
  const out: Array<{ offset: number; kind: MonsterId }> = [];
  let offset = 0;
  for (const [kind, count] of groups) {
    const n = kind === 'the-static' || kind === 'doomscroll-wyrm' ? count : Math.ceil((count * CNT_PCT[difficulty - 1]!) / 100);
    for (let i = 0; i < n; i++) {
      if (out.length > 0) offset += kind === 'dust-bunny' ? Math.floor(interval / 2) : interval;
      out.push({ offset, kind });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function initial(seed: number, party: Party, run: RunContext, locale: Locale): TDState {
  const rng = mulberry32(fnv1a(`tower-defense:${seed >>> 0}`));
  const layout = rngInt(rng, 3) as 0 | 1 | 2;
  const mirror = rngInt(rng, 2) === 1;
  const d = run.difficulty;
  const waves = templateOrder(d).map((t) => buildWave(t, d, rng));
  const haven = HAVEN_HP[d - 1]!;
  const havenMax = haven + Math.ceil((haven * buffAmount(run, 'defense')) / 100);
  return {
    seed: seed >>> 0,
    locale,
    difficulty: d,
    layout,
    mirror,
    path: buildPath(layout, mirror),
    pads: buildPads(layout, mirror),
    members: party.members.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.habit === null ? null : (HABIT_KIND[m.habit] ?? null),
      power: m.power,
      kills: 0,
      dealt: 0,
      placed: false,
    })),
    towers: [],
    waves,
    started: 0,
    waveAt: FIRST_WAVE_TICK[d - 1]!,
    queue: [],
    enemies: [],
    nextId: 1,
    tick: 0,
    cleared: 0,
    total: TOTAL_WAVES[d - 1]!,
    glow: START_GLOW[d - 1]!,
    glowEarned: 0,
    havenHp: havenMax,
    havenMax,
    revivesLeft: buffAmount(run, 'revive'),
    hintsLeft: buffAmount(run, 'hint'),
    attackPct: buffAmount(run, 'attack'),
    luckPct: buffAmount(run, 'luck'),
    timePct: Math.min(40, buffAmount(run, 'time')),
    earlyTicks: 0,
    kills: 0,
    leaks: 0,
    speed: 1,
    shots: [],
    feed: [],
    feedSeq: 0,
    result: null,
  };
}

// ---------------------------------------------------------------------------
// Working on a draft: `reduce` copies the state once, then reassigns fields
// (never mutating an array or object that came from the input).
// ---------------------------------------------------------------------------

function say(w: TDState, key: string, params: Record<string, string | number> = {}): void {
  w.feedSeq += 1;
  const line: FeedLine = { seq: w.feedSeq, key, params };
  w.feed = w.feed.length >= FEED_KEEP ? [...w.feed.slice(w.feed.length - FEED_KEEP + 1), line] : [...w.feed, line];
}

function monsterName(w: TDState, kind: MonsterId): string {
  return strings[w.locale].monsters[kind];
}
function towerName(w: TDState, kind: TowerKind): string {
  return strings[w.locale].towers[kind].name;
}

/** "Clutter Blob x5, Dust Bunny x6" for a wave. */
function waveSummary(w: TDState, index: number): string {
  const s = strings[w.locale];
  const counts = new Map<MonsterId, number>();
  for (const g of w.waves[index] ?? []) counts.set(g.kind, (counts.get(g.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => formatText(s.monsterCount, { name: s.monsters[kind], n })).join(', ');
}

/** Queue the next wave. A scheduled wave starts inside a tick (`lead` 0: its first monster spawns that tick); a called wave starts between ticks (`lead` 1: the first spawns on the next tick), so the gaps match. */
function startWave(w: TDState, lead: 0 | 1): void {
  const index = w.started;
  const spawns: Spawn[] = (w.waves[index] ?? []).map((g) => ({ at: w.tick + lead + g.offset, kind: g.kind, wave: index + 1 }));
  w.queue = [...w.queue, ...spawns];
  w.started = index + 1;
  w.waveAt = -1;
  say(w, 'waveStart', { n: index + 1, total: w.total, monsters: waveSummary(w, index) });
}

function makeEnemy(w: TDState, spawn: Spawn): Enemy {
  const base = ENEMY[spawn.kind];
  const n = spawn.wave;
  let hp = Math.max(1, Math.floor((Math.floor((base.hp * HP_PCT[w.difficulty - 1]!) / 100) * (100 + 6 * (n - 1))) / 100));
  if (n === 1) hp = Math.max(1, Math.floor((hp * 80) / 100));
  const speed = n <= 2 ? Math.floor((base.speed * (100 - w.timePct)) / 100) : base.speed;
  return {
    id: w.nextId,
    kind: spawn.kind,
    wave: n,
    hp,
    maxHp: hp,
    pos: 0,
    speed,
    armour: base.armour,
    glow: base.glow,
    leak: base.leak,
    markUntil: 0,
    markPct: 0,
    knockUntil: 0,
    pulseAt: spawn.kind === 'the-static' ? w.tick + PULSE_EVERY : 0,
  };
}

/** Damage of one hit on `e` (spec section 3): boost, mark, armour (unless ignored), at least 1. */
function hitDamage(damage: number, pct: number, e: Enemy, tick: number, ignoreArmour: boolean): number {
  let d = Math.floor((damage * (100 + pct)) / 100);
  if (tick < e.markUntil) d = Math.floor((d * (100 + e.markPct)) / 100);
  if (!ignoreArmour) d -= e.armour;
  return Math.max(1, d);
}

// ---------------------------------------------------------------------------
// One tick (spec section 8, "Tick order")
// ---------------------------------------------------------------------------

type Credit = (member: string, dealt: number, kill: boolean) => void;

function end(w: TDState, result: 'won' | 'lost' | 'fled'): void {
  w.result = result;
  if (result === 'won') say(w, 'won', { total: w.total });
  else if (result === 'lost') say(w, 'lost', { n: Math.max(1, w.started) });
  else say(w, 'fled');
}

function step(s: TDState): TDState {
  const w: TDState = { ...s, tick: s.tick + 1, shots: [] };
  const tick = w.tick;

  // (2) the scheduled wave starts
  if (tick === w.waveAt) startWave(w, 0);

  // (3) due spawns, under the cap
  const enemies: Enemy[] = s.enemies.length > 0 ? s.enemies.map((e) => ({ ...e })) : [];
  if (w.queue.length > 0) {
    let kept: Spawn[] | null = null;
    let alive = enemies.length;
    for (let i = 0; i < w.queue.length; i++) {
      const q = w.queue[i]!;
      if (q.at <= tick && alive < ENEMY_CAP) {
        if (kept === null) kept = w.queue.slice(0, i);
        enemies.push(makeEnemy(w, q));
        w.nextId += 1;
        alive += 1;
        if (q.kind === 'the-static') say(w, 'bossArrives');
      } else if (kept !== null) kept.push(q);
    }
    if (kept !== null) w.queue = kept;
  }
  w.enemies = enemies;

  const towers: Tower[] = s.towers.length > 0 ? s.towers.map((t) => ({ ...t })) : s.towers;
  w.towers = towers;
  let membersOwned = false;
  const credit: Credit = (member, dealt, kill) => {
    if (!membersOwned) {
      w.members = w.members.map((m) => ({ ...m }));
      membersOwned = true;
    }
    const m = w.members.find((x) => x.id === member);
    if (m) {
      m.dealt += dealt;
      if (kill) m.kills += 1;
    }
  };
  const pt: Point = { x: 0, y: 0 };

  if (enemies.length > 0) {
    // (4) move with slow; leaks (a leaking enemy is flagged with pos -1 and dropped)
    const pathLen = pathEnd(w.path);
    let leaked = false;
    const hasLull = towers.some((t) => t.kind === 'lull');
    for (const e of enemies) {
      const slow = hasLull ? enemySlow(w, e, tick, pt) : 0;
      e.pos += Math.max(1, Math.floor((e.speed * (100 - slow)) / 100));
      if (e.pos >= pathLen) {
        w.havenHp = Math.max(0, w.havenHp - e.leak);
        w.leaks += 1;
        e.pos = -1;
        say(w, 'leak', { monster: monsterName(w, e.kind), hp: w.havenHp, max: w.havenMax });
        leaked = true;
      }
    }
    if (leaked) w.enemies = enemies.filter((e) => e.pos >= 0);
    // The Haven at 0 is settled right here: a second wind, or the end. Nothing later in the tick (a Hearth, a kill) can undo it.
    if (w.havenHp === 0) {
      if (w.revivesLeft > 0) {
        w.revivesLeft -= 1;
        w.havenHp = Math.ceil(w.havenMax / 2);
        say(w, 'revive', { hp: w.havenHp });
      } else {
        end(w, 'lost');
        return w;
      }
    }
  }
  const live = w.enemies;

  // (5) the Static pulses
  for (const e of live) {
    if (e.kind !== 'the-static' || tick < e.pulseAt) continue;
    pointInto(w.path, e.pos, pt);
    let best = -1;
    let bestD = PULSE_RANGE * PULSE_RANGE + 1;
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i]!;
      if (tick < t.jamUntil) continue;
      const c = padCenter(w, t.pad);
      const dx = c.x - pt.x;
      const dy = c.y - pt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    if (best >= 0) {
      const t = towers[best]!;
      t.jamUntil = tick + JAM_TICKS;
      const owner = w.members.find((m) => m.id === t.member);
      say(w, 'jam', { name: owner?.name ?? '', tower: towerName(w, t.kind) });
    }
    e.pulseAt += PULSE_EVERY;
  }

  // (6) towers act in pad order
  if (towers.length > 0) actTowers(w, towers, live, credit);

  // (7) the fallen pay glow
  let dead = false;
  for (const e of live) if (e.hp <= 0) dead = true;
  if (dead) {
    let gain = 0;
    const survivors: Enemy[] = [];
    for (const e of live) {
      if (e.hp > 0) {
        survivors.push(e);
        continue;
      }
      const reward = Math.floor((e.glow * (100 + w.luckPct)) / 100);
      gain += e.wave === 1 ? reward * 2 : reward;
      w.kills += 1;
    }
    w.glow += gain;
    w.glowEarned += gain;
    w.enemies = survivors;
  }

  // (8) the trickle
  if (tick % 20 === 0) {
    w.glow += 1;
    w.glowEarned += 1;
  }

  // (9) cleared waves, the next one is scheduled
  let oldest = Infinity;
  for (const q of w.queue) oldest = Math.min(oldest, q.wave);
  for (const e of w.enemies) oldest = Math.min(oldest, e.wave);
  const cleared = Math.min(w.started, oldest - 1);
  if (cleared > w.cleared) {
    w.cleared = cleared;
    if (cleared < w.total) {
      if (w.started === cleared) {
        w.waveAt = tick + BREAK_TICKS[w.difficulty - 1]!;
        say(w, 'waveCleared', { n: cleared, s: Math.ceil(BREAK_TICKS[w.difficulty - 1]! / 20) });
      } else say(w, 'waveDone', { n: cleared });
    }
  }

  // (10) won, or the guard (a lost Haven ended the tick at step 4)
  if (w.cleared === w.total || tick >= GUARD_TICKS) end(w, 'won');
  return w;
}

/** Step 6: every tower in pad order. `towers` and `live` are this tick's private copies. */
function actTowers(w: TDState, towers: Tower[], live: Enemy[], credit: Credit): void {
  const tick = w.tick;
  const nE = live.length;
  const ex = new Array<number>(nE);
  const ey = new Array<number>(nE);
  const pt: Point = { x: 0, y: 0 };
  for (let j = 0; j < nE; j++) {
    pointInto(w.path, live[j]!.pos, pt);
    ex[j] = pt.x;
    ey[j] = pt.y;
  }

  // Chorus boosts: the highest of the non-jammed Chorus towers on the 8 neighbouring cells; they never add up.
  const boost = new Array<number>(towers.length).fill(0);
  for (const c of towers) {
    if (c.kind !== 'chorus' || tick < c.jamUntil) continue;
    const b = chorusBoost(c.level, c.power);
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i]!;
      if (t !== c && chebyshev(w.pads[c.pad]!, w.pads[t.pad]!) === 1 && b > boost[i]!) boost[i] = b;
    }
  }

  for (let i = 0; i < towers.length; i++) {
    const t = towers[i]!;
    if (tick < t.jamUntil) continue;
    const kind = t.kind;
    if (kind === 'chorus' || kind === 'lull') continue;
    t.cd = Math.max(0, t.cd - 1);
    if (t.cd > 0) continue;
    if (kind === 'hearth') {
      if (w.havenHp < w.havenMax) {
        w.havenHp += 1;
        t.cd = intervalOf('hearth', t.level, t.power);
      }
      continue;
    }

    const c = padCenter(w, t.pad);
    const r = rangeOf(kind, t.level, t.power);
    const r2 = r * r;
    const pct = w.attackPct + boost[i]!;
    const damage = damageOf(kind, t.level, t.power);

    if (kind === 'sweeper') {
      let first = -1;
      for (let j = 0; j < nE; j++) {
        const e = live[j]!;
        if (e.hp <= 0) continue;
        const dx = ex[j]! - c.x;
        const dy = ey[j]! - c.y;
        if (dx * dx + dy * dy > r2) continue;
        if (first < 0) first = j;
        hit(e, hitDamage(damage, pct, e, tick, false), t.member, credit);
      }
      if (first >= 0) {
        w.shots.push({ pad: t.pad, x: ex[first]!, y: ey[first]!, kind });
        t.cd = intervalOf(kind, t.level, t.power);
      }
      continue;
    }

    // Single target: the first enemy in range (highest pos, lowest id); the Archivist prefers an unmarked one.
    let target = -1;
    let fallback = -1;
    for (let j = 0; j < nE; j++) {
      const e = live[j]!;
      if (e.hp <= 0) continue;
      const dx = ex[j]! - c.x;
      const dy = ey[j]! - c.y;
      if (dx * dx + dy * dy > r2) continue;
      if (fallback < 0 || e.pos > live[fallback]!.pos) fallback = j;
      if (kind === 'archivist' && tick < e.markUntil) continue;
      if (target < 0 || e.pos > live[target]!.pos) target = j;
    }
    if (target < 0) target = fallback;
    if (target < 0) continue;
    const e = live[target]!;
    const tx = ex[target]!;
    const ty = ey[target]!;
    t.cd = intervalOf(kind, t.level, t.power);
    w.shots.push({ pad: t.pad, x: tx, y: ty, kind });
    hit(e, hitDamage(damage, pct, e, tick, kind === 'lantern'), t.member, credit);

    if (kind === 'archivist') {
      const stillMarked = tick < e.markUntil;
      e.markUntil = Math.max(e.markUntil, tick + markTicksOf(t.level));
      e.markPct = Math.max(stillMarked ? e.markPct : 0, markPctOf(t.level, t.power));
    } else if (kind === 'bubble') {
      const radius = splashRadiusOf(t.level);
      const rad2 = radius * radius;
      const boosted = Math.floor((damage * (100 + pct)) / 100);
      for (let j = 0; j < nE; j++) {
        const o = live[j]!;
        if (j === target || o.hp <= 0) continue;
        const dx = ex[j]! - tx;
        const dy = ey[j]! - ty;
        if (dx * dx + dy * dy > rad2) continue;
        const marked = tick < o.markUntil ? Math.floor((boosted * (100 + o.markPct)) / 100) : boosted;
        hit(o, Math.max(1, Math.floor((marked * 50) / 100) - o.armour), t.member, credit);
      }
      if (e.kind !== 'the-static' && e.hp > 0 && tick >= e.knockUntil) {
        e.pos = Math.max(0, e.pos - KNOCK_BACK[t.level - 1]!);
        e.knockUntil = tick + KNOCK_COOLDOWN;
        pointInto(w.path, e.pos, pt);
        ex[target] = pt.x;
        ey[target] = pt.y;
      }
    }
  }
}

/** Apply `d` damage to `e`, crediting the member's damage and, for the blow that drops it, a kill. */
function hit(e: Enemy, d: number, member: string, credit: Credit): void {
  const before = e.hp;
  e.hp -= d;
  credit(member, Math.min(d, before), before > 0 && e.hp <= 0);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function towerAt(state: TDState, pad: number): number {
  return state.towers.findIndex((t) => t.pad === pad);
}

function reduce(state: TDState, action: TDAction): TDState {
  if (state.result !== null || !action || typeof action !== 'object') return state;
  switch (action.type) {
    case 'tick':
      return step(state);

    case 'place': {
      const { pad } = action;
      const member = state.members.find((m) => m.id === action.member);
      if (!Number.isInteger(pad) || pad < 0 || pad >= state.pads.length || !member || member.kind === null) return state;
      if (towerAt(state, pad) >= 0) return state;
      const cost = placeCost(member);
      if (state.glow < cost) return state;
      const w: TDState = { ...state };
      const tower: Tower = { pad, member: member.id, kind: member.kind, level: 1, power: member.power, cd: 0, invested: cost, jamUntil: 0 };
      w.towers = [...state.towers, tower].sort((a, b) => a.pad - b.pad);
      w.glow = state.glow - cost;
      if (action.hinted === true && state.hintsLeft > 0 && bestPad(state, member.id) === pad) w.hintsLeft = state.hintsLeft - 1;
      w.members = state.members.map((m) => (m.id === member.id ? { ...m, placed: true } : m));
      say(w, 'placed', { name: member.name, tower: towerName(w, member.kind), pad: pad + 1 });
      return w;
    }

    case 'upgrade': {
      const i = Number.isInteger(action.pad) ? towerAt(state, action.pad) : -1;
      const t = state.towers[i];
      if (!t) return state;
      const cost = upgradeCost(t);
      if (cost === null || state.glow < cost) return state;
      const w: TDState = { ...state };
      const level = (t.level + 1) as 2 | 3;
      w.towers = state.towers.map((x, k) => (k === i ? { ...x, level, invested: x.invested + cost } : x));
      w.glow = state.glow - cost;
      const owner = state.members.find((m) => m.id === t.member);
      say(w, 'upgraded', { name: owner?.name ?? '', tower: towerName(w, t.kind), level });
      return w;
    }

    case 'sell': {
      const i = Number.isInteger(action.pad) ? towerAt(state, action.pad) : -1;
      const t = state.towers[i];
      // A jammed tower cannot be sold: that would undo the Static's only trick.
      if (!t || state.tick < t.jamUntil) return state;
      const w: TDState = { ...state };
      const back = refund(t);
      w.towers = state.towers.filter((_, k) => k !== i);
      w.glow = state.glow + back;
      const owner = state.members.find((m) => m.id === t.member);
      say(w, 'sold', { name: owner?.name ?? '', pad: t.pad + 1, glow: back });
      return w;
    }

    case 'callWave': {
      const bonus = callWaveBonus(state);
      if (bonus === null) return state;
      const w: TDState = { ...state };
      const saved = state.waveAt >= 0 ? Math.max(0, state.waveAt - state.tick) : BREAK_TICKS[state.difficulty - 1]!;
      w.glow += bonus;
      w.glowEarned += bonus;
      w.earlyTicks += saved;
      startWave(w, 1);
      return w;
    }

    case 'setSpeed':
      return (action.speed !== 1 && action.speed !== 2) || action.speed === state.speed ? state : { ...state, speed: action.speed };

    case 'forfeit': {
      const w: TDState = { ...state };
      end(w, 'fled');
      return w;
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Outcome (spec section 7)
// ---------------------------------------------------------------------------

export function scoreOf(state: TDState): number {
  const { result, cleared, total, havenHp, havenMax, earlyTicks } = state;
  if (result === 'won') return clampScore(400 + Math.floor((400 * havenHp) / havenMax) + Math.min(200, Math.floor(earlyTicks / 10)));
  if (result === 'lost') return clampScore(Math.floor((300 * cleared) / total));
  return clampScore(Math.floor((200 * cleared) / total));
}

export function outcomeLog(state: TDState, s: TDStrings): string[] {
  const lines: string[] = [formatText(s.log.map, { map: s.maps[state.layout]!, waves: state.total })];
  const placed = state.members.filter((m) => m.kind !== null && m.placed);
  // Stable sort by damage dealt: party order breaks ties.
  const top = placed.map((m, i) => ({ m, i })).sort((a, b) => b.m.dealt - a.m.dealt || a.i - b.i).slice(0, 4);
  for (const { m } of top) lines.push(formatText(s.log.tower, { name: m.name, tower: s.towers[m.kind!].name, kills: m.kills }));
  for (const m of state.members) if (m.kind === null) lines.push(formatText(s.log.cheer, { name: m.name }));
  lines.push(formatText(s.log.haven, { hp: state.havenHp, max: state.havenMax }));
  if (state.result === 'won') lines.push(formatText(s.log.won, { total: state.total }));
  else if (state.result === 'lost') lines.push(formatText(s.log.lost, { n: Math.max(1, state.started) }));
  else lines.push(formatText(s.log.fled, { n: state.cleared, total: state.total }));
  return lines;
}

function outcome(state: TDState): Outcome | null {
  if (state.result === null) return null;
  return {
    result: state.result,
    score: scoreOf(state),
    log: outcomeLog(state, strings[state.locale]),
    troopsUsed: state.members.filter((m) => m.placed).map((m) => m.id),
    stats: {
      map: strings[state.locale].maps[state.layout]!,
      waves: state.total,
      cleared: state.cleared,
      haven: state.havenHp,
      kills: state.kills,
      leaks: state.leaks,
      glowEarned: state.glowEarned,
    },
  };
}

// ---------------------------------------------------------------------------
// The bot (spec section 9)
// ---------------------------------------------------------------------------

const OPENERS: readonly TowerKind[] = ['lantern', 'bubble', 'sweeper', 'runner', 'archivist'];
export const MAX_BOT_TOWERS = 7;

function memberOf(state: TDState, kind: TowerKind): Member | undefined {
  return state.members.find((m) => m.kind === kind);
}
function countOf(state: TDState, kind: TowerKind): number {
  let n = 0;
  for (const t of state.towers) if (t.kind === kind) n++;
  return n;
}

/** The member whose tower the bot wants next: the first rule of spec section 9 that applies. */
function desiredMember(state: TDState): Member | undefined {
  if (state.towers.length === 0) {
    for (const k of OPENERS) {
      const m = memberOf(state, k);
      if (m) return m;
    }
  }
  const chorus = memberOf(state, 'chorus');
  if (chorus && countOf(state, 'chorus') === 0 && padScores(state, chorus).some((n) => n >= 2)) return chorus;
  const lull = memberOf(state, 'lull');
  if (lull && countOf(state, 'lull') === 0 && state.started >= 2) return lull;
  const hearth = memberOf(state, 'hearth');
  if (hearth && countOf(state, 'hearth') === 0 && state.havenHp < state.havenMax) return hearth;
  const archivist = memberOf(state, 'archivist');
  if (archivist && countOf(state, 'archivist') === 0) return archivist;
  let best: Member | undefined;
  let bestN = Infinity;
  for (const k of DAMAGE_KINDS) {
    const m = memberOf(state, k);
    if (!m) continue;
    const n = countOf(state, k);
    if (n < bestN) {
      best = m;
      bestN = n;
    }
  }
  // A party with no damage kind at all still builds its Archivist.
  return best ?? archivist;
}

function botPlay(state: TDState, rng: () => number): TDAction | null {
  if (state.result !== null) return null;
  let placing = false;
  if (state.pads.length > state.towers.length && state.towers.length < MAX_BOT_TOWERS) {
    const m = desiredMember(state);
    if (m) {
      placing = true;
      if (state.glow >= placeCost(m)) {
        const scores = padScores(state, m);
        const top = Math.max(...scores);
        const ties: number[] = [];
        scores.forEach((n, pad) => {
          if (n === top) ties.push(pad);
        });
        return { type: 'place', pad: ties[Math.floor(rng() * ties.length)]!, member: m.id };
      }
    }
  }
  if (!placing) {
    const kinds: readonly TowerKind[] = DAMAGE_KINDS.some((k) => memberOf(state, k)) ? DAMAGE_KINDS : ['archivist'];
    let pick: Tower | null = null;
    let pickCost = Infinity;
    for (const t of state.towers) {
      const cost = upgradeCost(t);
      if (cost === null || cost > state.glow || !kinds.includes(t.kind)) continue;
      if (cost < pickCost) {
        pick = t;
        pickCost = cost;
      }
    }
    if (pick) return { type: 'upgrade', pad: pick.pad };
  }
  if (state.enemies.length === 0 && state.queue.length === 0 && state.started < state.total) return { type: 'callWave' };
  return { type: 'tick' };
}

export const engine: GameEngine<TDState, TDAction> = {
  initial,
  reduce,
  outcome,
  botPlay,
  forfeit: () => ({ type: 'forfeit' }),
};
