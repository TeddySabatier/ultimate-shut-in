/**
 * Roguelike Chess: a turn-based tactics engine on a 6x6 board.
 *
 * The player's troops are the pieces (habit chooses how they move). Enemies
 * are the weekly-wave monsters. Three rooms; after the first two the player
 * picks one of three upgrades. Win by clearing room 3. Loss: every piece is
 * down, or the turn cap runs out in a room. Forfeit ends as `fled`.
 *
 * Pure, seeded, plain data. Randomness only from `mulberry32(fnv1a('roguelike-chess:'…))`
 * and `turnRng`. No clocks, no mutation of the incoming state.
 */
import { fnv1a, mulberry32, rngInt, rngPick, rngWeightedIndex, type Rng } from '../../game/rng';
import {
  buffAmount,
  clampScore,
  formatText,
  type GameEngine,
  type Locale,
  type Outcome,
  type Party,
  type PartyMember,
  type RunContext,
} from '../contract';
import { strings, type ChessStrings } from './strings';

export const BOARD = 6;
export const ROOM_COUNT = 3;
export const BASE_TURN_CAP = 40;
const FILES = 'abcdef';

export type PieceKind = 'knight' | 'bishop' | 'rook' | 'queenLite' | 'king' | 'pawn' | 'rookLite' | 'bishopLite';
export type EnemyKind = 'blob' | 'moth' | 'wyrm' | 'bunny' | 'golem' | 'leech' | 'wraith' | 'imp' | 'specter' | 'static';
export type UpgradeKind =
  | 'sharpen'
  | 'mend'
  | 'dash'
  | 'swap'
  | 'ward'
  | 'recall'
  | 'reach'
  | 'brace'
  | 'clock'
  | 'pierce'
  | 'guard'
  | 'blink';
export type PassiveId = 'vanguard' | 'skirmisher' | 'longstep' | 'tidy' | 'barrier' | 'rally' | 'insight' | 'sentinel';
export type IntentVerb = 'step' | 'strike' | 'split' | 'drain' | 'wait';
export type Phase = 'play' | 'upgrade' | 'over';
export type EndKind = 'none' | 'won' | 'lost' | 'fled';

export const ALL_UPGRADES: readonly UpgradeKind[] = [
  'sharpen',
  'mend',
  'dash',
  'swap',
  'ward',
  'recall',
  'reach',
  'brace',
  'clock',
  'pierce',
  'guard',
  'blink',
];

export const TITLE_PASSIVE: Record<string, PassiveId> = {
  first_vassal: 'vanguard',
  pathfinder: 'skirmisher',
  dawn_walker: 'longstep',
  steward_apprentice: 'tidy',
  scrubbed_spotless: 'barrier',
  herald: 'rally',
  stairwell_scholar: 'insight',
  night_warden: 'sentinel',
};

export interface Pos {
  x: number;
  y: number;
}

export interface Piece {
  id: string;
  name: string;
  habit: string | null;
  kind: PieceKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  rangeBonus: number;
  shield: number;
  alive: boolean;
  passives: PassiveId[];
}

export interface Enemy {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  alive: boolean;
  intentX: number;
  intentY: number;
  intentVerb: IntentVerb;
}

export interface UpgradeOffer {
  kind: UpgradeKind;
  targetId: string;
  secondId: string;
}

export interface ChessState {
  seed: number;
  step: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  room: number;
  turnInRoom: number;
  turnCap: number;
  totalTurns: number;
  phase: Phase;
  end: EndKind;
  pieces: Piece[];
  enemies: Enemy[];
  offers: UpgradeOffer[];
  log: string[];
  roomsCleared: number;
  luck: number;
  hint: number;
  reviveLeft: number;
  pierce: number;
  dashPieceId: string;
  dashLeft: number;
  extraMoveId: string;
  recallArmed: boolean;
  nextEnemySerial: number;
}

export type ChessAction =
  | { type: 'play'; id: string; x: number; y: number }
  | { type: 'upgrade'; index: number }
  | { type: 'wait' }
  | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function onBoard(x: number, y: number): boolean {
  return x >= 0 && x < BOARD && y >= 0 && y < BOARD;
}

export function squareFile(x: number): string {
  return FILES[x] ?? '?';
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function habitKind(habit: string | null): PieceKind {
  if (habit === 'move') return 'knight';
  if (habit === 'outside') return 'bishop';
  if (habit === 'clean') return 'rook';
  if (habit === 'social') return 'queenLite';
  if (habit === 'study') return 'king';
  if (habit === 'sleep') return 'pawn';
  if (habit === 'eat') return 'rookLite';
  if (habit === 'hygiene') return 'bishopLite';
  return 'pawn';
}

export function passivesOf(traits: string[]): PassiveId[] {
  const out: PassiveId[] = [];
  const seen: Partial<Record<PassiveId, true>> = {};
  for (const t of traits) {
    const p: PassiveId = TITLE_PASSIVE[t] ?? 'tidy';
    if (!seen[p]) {
      seen[p] = true;
      out.push(p);
    }
  }
  return out;
}

export function txt(state: ChessState): ChessStrings {
  return strings[state.locale];
}

function axis(from: number, to: number): number {
  if (to > from) return 1;
  if (to < from) return -1;
  return 0;
}

function copyLog(log: string[], line: string): string[] {
  const next = [...log, line];
  return next.length > 18 ? next.slice(next.length - 18) : next;
}

// ---------------------------------------------------------------------------
// Occupancy and derived combat numbers
// ---------------------------------------------------------------------------

export function occupant(state: ChessState, x: number, y: number): { side: 'ally' | 'foe'; id: string } | null {
  for (const p of state.pieces) if (p.alive && p.x === x && p.y === y) return { side: 'ally', id: p.id };
  for (const e of state.enemies) if (e.alive && e.x === x && e.y === y) return { side: 'foe', id: e.id };
  return null;
}

export function livingPieces(state: ChessState): Piece[] {
  return state.pieces.filter((p) => p.alive);
}

export function livingEnemies(state: ChessState): Enemy[] {
  return state.enemies.filter((e) => e.alive);
}

export function hasRally(state: ChessState): boolean {
  return state.pieces.some((p) => p.alive && p.passives.includes('rally'));
}

export function damageOf(state: ChessState, piece: Piece): number {
  return piece.attack + (hasRally(state) ? 1 : 0) + state.pierce;
}

export function showsHints(state: ChessState): boolean {
  if (state.hint > 0) return true;
  return state.pieces.some((p) => p.alive && (p.habit === 'study' || p.passives.includes('insight')));
}

export function isOver(state: ChessState): boolean {
  return state.phase === 'over' || state.end !== 'none';
}

function pieceById(state: ChessState, id: string): Piece | undefined {
  return state.pieces.find((p) => p.id === id);
}

function enemyById(state: ChessState, id: string): Enemy | undefined {
  return state.enemies.find((e) => e.id === id);
}

function firstEmpty(state: ChessState, preferLow = true): Pos | null {
  const ys = preferLow ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
  for (const y of ys) {
    for (let x = 0; x < BOARD; x++) if (!occupant(state, x, y)) return { x, y };
  }
  return null;
}

function weakestLiving(pieces: Piece[]): Piece | undefined {
  const living = pieces.filter((p) => p.alive);
  if (living.length === 0) return undefined;
  return [...living].sort((a, b) => a.hp - b.hp || a.attack - b.attack || a.id.localeCompare(b.id))[0];
}

function nearestPiece(state: ChessState, from: Pos): Piece | undefined {
  const living = livingPieces(state);
  if (living.length === 0) return undefined;
  return [...living].sort((a, b) => manhattan(from, a) - manhattan(from, b) || a.id.localeCompare(b.id))[0];
}

function nearestEnemy(state: ChessState, from: Pos): Enemy | undefined {
  const living = livingEnemies(state);
  if (living.length === 0) return undefined;
  return [...living].sort((a, b) => manhattan(from, a) - manhattan(from, b) || a.id.localeCompare(b.id))[0];
}

// ---------------------------------------------------------------------------
// Legal moves
// ---------------------------------------------------------------------------

const KNIGHT_DELTAS: ReadonlyArray<Pos> = [
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: -1, y: 2 },
  { x: -2, y: 1 },
  { x: 1, y: -2 },
  { x: 2, y: -1 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
];
const KING_DELTAS: ReadonlyArray<Pos> = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];
const ROOK_DIRS: ReadonlyArray<Pos> = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
const BISHOP_DIRS: ReadonlyArray<Pos> = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

export function rangeOf(piece: Piece): number {
  const extra = piece.rangeBonus + (piece.passives.includes('longstep') ? 1 : 0);
  if (piece.kind === 'rook' || piece.kind === 'bishop') return BOARD;
  if (piece.kind === 'queenLite') return 3 + extra;
  if (piece.kind === 'rookLite' || piece.kind === 'bishopLite') return 2 + extra;
  if (piece.kind === 'king' || piece.kind === 'pawn') return 1 + piece.rangeBonus;
  return 1;
}

function pushJump(out: Pos[], state: ChessState, x: number, y: number): void {
  if (!onBoard(x, y)) return;
  const occ = occupant(state, x, y);
  if (occ?.side === 'ally') return;
  out.push({ x, y });
}

function slide(out: Pos[], state: ChessState, from: Pos, dir: Pos, max: number): void {
  let x = from.x + dir.x;
  let y = from.y + dir.y;
  let n = 0;
  while (onBoard(x, y) && n < max) {
    const occ = occupant(state, x, y);
    if (occ?.side === 'ally') break;
    out.push({ x, y });
    if (occ?.side === 'foe') break;
    x += dir.x;
    y += dir.y;
    n += 1;
  }
}

function uniquePos(list: Pos[]): Pos[] {
  const seen: Record<string, true> = {};
  const out: Pos[] = [];
  for (const p of list) {
    const k = `${p.x},${p.y}`;
    if (seen[k]) continue;
    seen[k] = true;
    out.push(p);
  }
  return out;
}

/** Legal destination squares for a living piece. */
export function legalMoves(state: ChessState, piece: Piece): Pos[] {
  if (!piece.alive) return [];
  if (state.extraMoveId && state.extraMoveId !== piece.id) return [];
  const max = rangeOf(piece);
  const from: Pos = { x: piece.x, y: piece.y };
  const out: Pos[] = [];
  if (piece.kind === 'knight') {
    for (const d of KNIGHT_DELTAS) pushJump(out, state, from.x + d.x, from.y + d.y);
    if (piece.passives.includes('skirmisher') || piece.rangeBonus > 0) {
      for (const d of KING_DELTAS) pushJump(out, state, from.x + d.x, from.y + d.y);
    }
    if (piece.rangeBonus > 0) {
      for (const d of KNIGHT_DELTAS) pushJump(out, state, from.x + d.x * 1, from.y + (d.y > 0 ? d.y + 1 : d.y - 1));
    }
  } else if (piece.kind === 'king') {
    const dist = Math.min(max, 2);
    for (const d of KING_DELTAS) {
      for (let n = 1; n <= dist; n++) {
        const x = from.x + d.x * n;
        const y = from.y + d.y * n;
        if (!onBoard(x, y)) break;
        const occ = occupant(state, x, y);
        if (occ?.side === 'ally') break;
        out.push({ x, y });
        if (occ?.side === 'foe') break;
        if (n === 1 && dist === 1) break;
      }
    }
  } else if (piece.kind === 'pawn') {
    const steps: Pos[] = [
      { x: from.x, y: from.y + 1 },
      { x: from.x - 1, y: from.y },
      { x: from.x + 1, y: from.y },
    ];
    if (max >= 2 && !occupant(state, from.x, from.y + 1)) steps.push({ x: from.x, y: from.y + 2 });
    for (const s of steps) pushJump(out, state, s.x, s.y);
  } else if (piece.kind === 'rook' || piece.kind === 'rookLite') {
    for (const d of ROOK_DIRS) slide(out, state, from, d, max);
  } else if (piece.kind === 'bishop' || piece.kind === 'bishopLite') {
    for (const d of BISHOP_DIRS) slide(out, state, from, d, max);
  } else {
    for (const d of ROOK_DIRS) slide(out, state, from, d, max);
    for (const d of BISHOP_DIRS) slide(out, state, from, d, max);
  }
  return uniquePos(out);
}

export function movablePieces(state: ChessState): Piece[] {
  return livingPieces(state).filter((p) => legalMoves(state, p).length > 0);
}

export function hasLegalMove(state: ChessState): boolean {
  return movablePieces(state).length > 0;
}

/** The capture the hint buff / Study troop would highlight, or null. */
export function hintCapture(state: ChessState): { id: string; x: number; y: number } | null {
  if (state.phase !== 'play' || isOver(state) || !showsHints(state)) return null;
  let best: { id: string; x: number; y: number; score: number } | null = null;
  for (const p of movablePieces(state)) {
    for (const m of legalMoves(state, p)) {
      const occ = occupant(state, m.x, m.y);
      if (occ?.side !== 'foe') continue;
      const e = enemyById(state, occ.id);
      if (!e) continue;
      const dmg = damageOf(state, p);
      const score = (dmg >= e.hp ? 1000 : 0) + Math.min(dmg, e.hp) * 10 + e.hp;
      if (!best || score > best.score || (score === best.score && p.id < best.id)) {
        best = { id: p.id, x: m.x, y: m.y, score };
      }
    }
  }
  return best ? { id: best.id, x: best.x, y: best.y } : null;
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function applyShield(unit: { hp: number; shield: number }, dmg: number): { hp: number; shield: number } {
  let left = dmg;
  let shield = unit.shield;
  if (shield > 0) {
    const use = Math.min(shield, left);
    shield -= use;
    left -= use;
  }
  return { hp: Math.max(0, unit.hp - left), shield };
}

function tryRevive(state: ChessState, fallen: Piece, log: string[]): { pieces: Piece[]; reviveLeft: number; recallArmed: boolean; log: string[] } {
  const can = state.reviveLeft > 0 || state.recallArmed;
  if (!can) return { pieces: state.pieces, reviveLeft: state.reviveLeft, recallArmed: state.recallArmed, log };
  const ghost: ChessState = { ...state, pieces: state.pieces.map((p) => (p.id === fallen.id ? { ...p, alive: false } : p)) };
  const spot = firstEmpty(ghost);
  if (!spot) return { pieces: state.pieces, reviveLeft: state.reviveLeft, recallArmed: state.recallArmed, log };
  const revived: Piece = { ...fallen, alive: true, hp: 1, shield: 0, x: spot.x, y: spot.y };
  const pieces = state.pieces.map((p) => (p.id === fallen.id ? revived : p));
  const s = txt(state);
  return {
    pieces,
    reviveLeft: state.reviveLeft > 0 ? state.reviveLeft - 1 : 0,
    recallArmed: state.reviveLeft > 0 ? state.recallArmed : false,
    log: copyLog(log, formatText(s.log.revive, { name: fallen.name })),
  };
}

function hurtPiece(state: ChessState, id: string, dmg: number): ChessState {
  const piece = pieceById(state, id);
  if (!piece || !piece.alive || dmg <= 0) return state;
  const next = applyShield(piece, dmg);
  if (next.hp > 0) {
    return { ...state, pieces: state.pieces.map((p) => (p.id === id ? { ...p, hp: next.hp, shield: next.shield } : p)) };
  }
  const fallen: Piece = { ...piece, hp: 0, shield: 0, alive: false };
  const withFall = { ...state, pieces: state.pieces.map((p) => (p.id === id ? fallen : p)) };
  const s = txt(state);
  const logged = copyLog(withFall.log, formatText(s.log.fall, { name: piece.name }));
  const rev = tryRevive({ ...withFall, log: logged }, fallen, logged);
  return { ...withFall, pieces: rev.pieces, reviveLeft: rev.reviveLeft, recallArmed: rev.recallArmed, log: rev.log };
}

function hurtEnemy(state: ChessState, id: string, dmg: number): ChessState {
  const enemy = enemyById(state, id);
  if (!enemy || !enemy.alive || dmg <= 0) return state;
  const hp = Math.max(0, enemy.hp - dmg);
  return {
    ...state,
    enemies: state.enemies.map((e) => (e.id === id ? { ...e, hp, alive: hp > 0 } : e)),
  };
}

// ---------------------------------------------------------------------------
// Intentions (locked at the start of the player's turn)
// ---------------------------------------------------------------------------

function stepToward(state: ChessState, from: Pos, target: Pos): Pos | null {
  const dx = axis(from.x, target.x);
  const dy = axis(from.y, target.y);
  const ax = Math.abs(target.x - from.x);
  const ay = Math.abs(target.y - from.y);
  const order: Pos[] = ax >= ay ? [{ x: dx, y: 0 }, { x: 0, y: dy }] : [{ x: 0, y: dy }, { x: dx, y: 0 }];
  for (const d of order) {
    if (d.x === 0 && d.y === 0) continue;
    const x = from.x + d.x;
    const y = from.y + d.y;
    if (!onBoard(x, y)) continue;
    if (occupant(state, x, y)?.side === 'foe') continue;
    return { x, y };
  }
  return null;
}

function slideToward(state: ChessState, from: Pos, target: Pos, diag: boolean, max: number): Pos | null {
  const dx = axis(from.x, target.x);
  const dy = axis(from.y, target.y);
  const dirs: Pos[] = diag
    ? dx !== 0 && dy !== 0
      ? [{ x: dx, y: dy }, { x: dx, y: 0 }, { x: 0, y: dy }]
      : [
          { x: dx === 0 ? 1 : dx, y: dy === 0 ? 1 : dy },
          { x: dx, y: dy },
        ]
    : Math.abs(target.x - from.x) >= Math.abs(target.y - from.y)
      ? [{ x: dx, y: 0 }, { x: 0, y: dy }]
      : [{ x: 0, y: dy }, { x: dx, y: 0 }];
  for (const d of dirs) {
    if (d.x === 0 && d.y === 0) continue;
    let last: Pos | null = null;
    let x = from.x;
    let y = from.y;
    for (let n = 0; n < max; n++) {
      x += d.x;
      y += d.y;
      if (!onBoard(x, y)) break;
      const occ = occupant(state, x, y);
      if (occ?.side === 'foe') break;
      last = { x, y };
      if (occ?.side === 'ally') break;
    }
    if (last) return last;
  }
  return null;
}

function knightToward(state: ChessState, from: Pos, target: Pos): Pos | null {
  const opts: Pos[] = [];
  for (const d of KNIGHT_DELTAS) {
    const x = from.x + d.x;
    const y = from.y + d.y;
    if (!onBoard(x, y)) continue;
    if (occupant(state, x, y)?.side === 'foe') continue;
    opts.push({ x, y });
  }
  if (opts.length === 0) return stepToward(state, from, target);
  return [...opts].sort((a, b) => manhattan(a, target) - manhattan(b, target) || a.y - b.y || a.x - b.x)[0] ?? null;
}

function jumpTwo(state: ChessState, from: Pos, target: Pos): Pos | null {
  const dx = axis(from.x, target.x);
  const dy = axis(from.y, target.y);
  const tries: Pos[] =
    Math.abs(target.x - from.x) >= Math.abs(target.y - from.y)
      ? [
          { x: from.x + dx * 2, y: from.y },
          { x: from.x + dx, y: from.y },
          { x: from.x, y: from.y + dy },
        ]
      : [
          { x: from.x, y: from.y + dy * 2 },
          { x: from.x, y: from.y + dy },
          { x: from.x + dx, y: from.y },
        ];
  for (const t of tries) {
    if (!onBoard(t.x, t.y)) continue;
    if (t.x === from.x && t.y === from.y) continue;
    if (occupant(state, t.x, t.y)?.side === 'foe') continue;
    return t;
  }
  return null;
}

function splitSquare(state: ChessState, from: Pos): Pos | null {
  const livingBunnies = livingEnemies(state).filter((e) => e.kind === 'bunny').length;
  if (livingBunnies >= 3) return null;
  const spots: Pos[] = [];
  for (const d of KING_DELTAS) {
    const x = from.x + d.x;
    const y = from.y + d.y;
    if (onBoard(x, y) && !occupant(state, x, y)) spots.push({ x, y });
  }
  if (spots.length === 0) return null;
  return [...spots].sort((a, b) => a.y - b.y || a.x - b.x)[0] ?? null;
}

function drainTarget(state: ChessState, from: Pos, range: number): Piece | undefined {
  const living = livingPieces(state).filter((p) => manhattan(from, p) <= range);
  if (living.length === 0) return undefined;
  return [...living].sort((a, b) => manhattan(from, a) - manhattan(from, b) || a.id.localeCompare(b.id))[0];
}

function planEnemy(state: ChessState, e: Enemy): Pick<Enemy, 'intentX' | 'intentY' | 'intentVerb'> {
  const here = { x: e.x, y: e.y };
  const wait = { intentX: e.x, intentY: e.y, intentVerb: 'wait' as const };
  if (!e.alive) return wait;
  if (e.kind === 'golem' && state.turnInRoom % 2 === 1) return wait;
  const prey = nearestPiece(state, here);
  if (!prey) return wait;

  if (e.kind === 'leech' || e.kind === 'specter' || e.kind === 'static') {
    const range = e.kind === 'specter' ? 2 : 1;
    const drain = drainTarget(state, here, range);
    if (drain) return { intentX: drain.x, intentY: drain.y, intentVerb: 'drain' };
    if (e.kind === 'static') {
      const step = stepToward(state, here, prey);
      if (!step) return wait;
      const occ = occupant(state, step.x, step.y);
      return { intentX: step.x, intentY: step.y, intentVerb: occ?.side === 'ally' ? 'strike' : 'step' };
    }
  }

  if (e.kind === 'bunny') {
    const spawn = splitSquare(state, here);
    if (spawn) return { intentX: spawn.x, intentY: spawn.y, intentVerb: 'split' };
  }

  let dest: Pos | null = null;
  if (e.kind === 'moth') dest = knightToward(state, here, prey);
  else if (e.kind === 'imp') dest = jumpTwo(state, here, prey);
  else if (e.kind === 'wyrm') dest = slideToward(state, here, prey, false, 2);
  else if (e.kind === 'wraith') dest = slideToward(state, here, prey, true, 2);
  else dest = stepToward(state, here, prey);

  if (!dest) return wait;
  const occ = occupant(state, dest.x, dest.y);
  return { intentX: dest.x, intentY: dest.y, intentVerb: occ?.side === 'ally' ? 'strike' : 'step' };
}

function withIntentions(state: ChessState): ChessState {
  return {
    ...state,
    enemies: state.enemies.map((e) => {
      const plan = planEnemy(state, e);
      return { ...e, ...plan };
    }),
  };
}

// ---------------------------------------------------------------------------
// Rooms, stats, setup
// ---------------------------------------------------------------------------

function roomEnemyCount(room: number, d: number): number {
  if (room === 1) return d <= 2 ? 2 : 3;
  if (room === 2) return d === 1 ? 3 : d >= 5 ? 5 : 4;
  return 1 + (d <= 2 ? 1 : d <= 4 ? 2 : 3);
}

function enemyHp(kind: EnemyKind, d: number): number {
  if (kind === 'static') return 7 + d * 3;
  if (kind === 'golem') return 5 + d * 2;
  if (kind === 'blob' || kind === 'bunny' || kind === 'imp') return 3 + d * 2;
  return 4 + d * 2;
}

function enemyAtk(kind: EnemyKind, d: number): number {
  if (kind === 'static') return 2 + d;
  if (kind === 'golem') return 1 + d;
  if (kind === 'leech' || kind === 'specter') return 1 + d;
  return 1 + Math.floor(d / 2);
}

const ROOM1: readonly EnemyKind[] = ['blob', 'bunny', 'imp', 'golem'];
const ROOM2: readonly EnemyKind[] = ['moth', 'wyrm', 'leech', 'wraith', 'specter', 'blob', 'bunny', 'imp'];
const ROOM3: readonly EnemyKind[] = ['specter', 'wyrm', 'leech', 'golem', 'moth'];

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

function pickKinds(rng: Rng, room: number, d: number): EnemyKind[] {
  const n = roomEnemyCount(room, d);
  if (room === 3) {
    const rest = shuffle(rng, ROOM3);
    const extra: EnemyKind[] = [];
    for (let i = 0; i < n - 1; i++) extra.push(rest[i % rest.length]!);
    return ['static', ...extra];
  }
  const pool = room === 1 ? ROOM1 : ROOM2;
  const mixed = shuffle(rng, pool);
  const out: EnemyKind[] = [];
  for (let i = 0; i < n; i++) out.push(mixed[i % mixed.length]!);
  return out;
}

function enemySpots(rng: Rng, n: number): Pos[] {
  const spots: Pos[] = [];
  for (let y = 5; y >= 3; y--) {
    for (const x of shuffle(rng, [0, 1, 2, 3, 4, 5])) spots.push({ x, y });
  }
  return spots.slice(0, n);
}

function makeEnemy(kind: EnemyKind, pos: Pos, id: string, d: number): Enemy {
  const hp = enemyHp(kind, d);
  return { id, kind, x: pos.x, y: pos.y, hp, maxHp: hp, attack: enemyAtk(kind, d), alive: true, intentX: pos.x, intentY: pos.y, intentVerb: 'wait' };
}

function makePiece(m: PartyMember, pos: Pos, defensePts: number, attackPts: number): Piece {
  const passives = passivesOf(m.traits);
  let hp = 3 + m.level + Math.floor(defensePts / 10);
  if (passives.includes('tidy')) hp += 1;
  if (passives.includes('sentinel')) hp += 2;
  let attack = 1 + Math.floor(m.level / 3) + Math.floor(attackPts / 10);
  if (m.loyalty > 70) attack += 1;
  if (passives.includes('vanguard')) attack += 1;
  return {
    id: m.id,
    name: m.name,
    habit: m.habit,
    kind: habitKind(m.habit),
    x: pos.x,
    y: pos.y,
    hp,
    maxHp: hp,
    attack,
    rangeBonus: 0,
    shield: passives.includes('barrier') ? 1 : 0,
    alive: true,
    passives,
  };
}

function placeParty(members: PartyMember[], defensePts: number, attackPts: number): Piece[] {
  return members.map((m, i) => makePiece(m, { x: i % BOARD, y: Math.floor(i / BOARD) }, defensePts, attackPts));
}

function roomRng(seed: number, room: number): Rng {
  return mulberry32(fnv1a(`roguelike-chess:${seed >>> 0}:room:${room}`));
}

function buildEnemies(seed: number, room: number, d: number, serial0: number): { enemies: Enemy[]; nextEnemySerial: number } {
  const rng = roomRng(seed, room);
  const kinds = pickKinds(rng, room, d);
  const spots = enemySpots(rng, kinds.length);
  let serial = serial0;
  const enemies = kinds.map((kind, i) => {
    serial += 1;
    const pos = spots[i] ?? { x: i % BOARD, y: 5 };
    return makeEnemy(kind, pos, `e${room}-${serial}`, d);
  });
  return { enemies, nextEnemySerial: serial };
}

function upgradeWeight(kind: UpgradeKind, luck: number): number {
  const high = kind === 'mend' || kind === 'recall' || kind === 'pierce' || kind === 'dash';
  const mid = kind === 'sharpen' || kind === 'ward' || kind === 'reach' || kind === 'brace';
  const t = high ? 2 : mid ? 1 : 0;
  return 1 + t * (1 + Math.floor(luck / 10));
}

function livingOr(pieces: Piece[]): Piece[] {
  const living = pieces.filter((p) => p.alive);
  return living.length > 0 ? living : pieces;
}

function offerUpgrades(state: ChessState): UpgradeOffer[] {
  const rng = mulberry32(fnv1a(`roguelike-chess:${state.seed >>> 0}:up:${state.roomsCleared}`));
  const living = livingOr(state.pieces).filter((p) => p.alive);
  const fallen = state.pieces.filter((p) => !p.alive);
  const pool = ALL_UPGRADES.filter((k) => {
    if (k === 'swap' && living.length < 2) return false;
    if (k === 'blink' && living.length === 0) return false;
    if (k === 'recall' && fallen.length === 0 && state.recallArmed) return false;
    return true;
  });
  const left = [...pool];
  const kinds: UpgradeKind[] = [];
  while (kinds.length < 3 && left.length > 0) {
    const i = rngWeightedIndex(
      rng,
      left.map((k) => upgradeWeight(k, state.luck)),
    );
    kinds.push(left[i]!);
    left.splice(i, 1);
  }
  const weak = weakestLiving(state.pieces);
  const strong = [...living].sort((a, b) => b.attack - a.attack || a.id.localeCompare(b.id))[0];
  const other = [...living].filter((p) => p.id !== (weak?.id ?? '')).sort((a, b) => a.id.localeCompare(b.id))[0];
  return kinds.map((kind) => {
    const target = kind === 'sharpen' || kind === 'dash' || kind === 'reach' || kind === 'guard' ? (strong ?? weak) : (weak ?? strong);
    const second = kind === 'swap' ? other : undefined;
    return { kind, targetId: target?.id ?? '', secondId: second?.id ?? '' };
  });
}

function enterRoom(state: ChessState, room: number): ChessState {
  const built = buildEnemies(state.seed, room, state.difficulty, state.nextEnemySerial);
  const next: ChessState = {
    ...state,
    room,
    turnInRoom: 0,
    extraMoveId: '',
    dashLeft: state.dashPieceId ? 1 : 0,
    enemies: built.enemies,
    nextEnemySerial: built.nextEnemySerial,
    offers: [],
    phase: 'play',
  };
  return withIntentions(next);
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): ChessState {
  const pieces = placeParty(party.members.slice(0, 8), buffAmount(run, 'defense'), buffAmount(run, 'attack'));
  const base: ChessState = {
    seed: seed >>> 0,
    step: 0,
    locale,
    difficulty: run.difficulty,
    room: 1,
    turnInRoom: 0,
    turnCap: BASE_TURN_CAP + Math.floor(buffAmount(run, 'time') / 5),
    totalTurns: 0,
    phase: 'play',
    end: 'none',
    pieces,
    enemies: [],
    offers: [],
    log: [],
    roomsCleared: 0,
    luck: buffAmount(run, 'luck'),
    hint: buffAmount(run, 'hint'),
    reviveLeft: buffAmount(run, 'revive'),
    pierce: 0,
    dashPieceId: '',
    dashLeft: 0,
    extraMoveId: '',
    recallArmed: false,
    nextEnemySerial: 0,
  };
  return enterRoom(base, 1);
}

// ---------------------------------------------------------------------------
// Enemy turn and end-of-turn
// ---------------------------------------------------------------------------

function spawnBunny(state: ChessState, at: Pos): ChessState {
  if (occupant(state, at.x, at.y)) return state;
  const serial = state.nextEnemySerial + 1;
  const hp = 1;
  const baby: Enemy = {
    id: `e${state.room}-${serial}`,
    kind: 'bunny',
    x: at.x,
    y: at.y,
    hp,
    maxHp: hp,
    attack: 1,
    alive: true,
    intentX: at.x,
    intentY: at.y,
    intentVerb: 'wait',
  };
  const s = txt(state);
  const parent = livingEnemies(state).find((e) => e.kind === 'bunny');
  return {
    ...state,
    nextEnemySerial: serial,
    enemies: [...state.enemies, baby],
    log: copyLog(state.log, formatText(s.log.foeSplit, { foe: parent ? enemyName(state, parent) : s.enemy.bunny })),
  };
}

function enemyName(state: ChessState, e: Enemy): string {
  return txt(state).enemy[e.kind];
}

function executeLocked(state: ChessState, e: Enemy): ChessState {
  if (!e.alive) return state;
  const current = enemyById(state, e.id);
  if (!current || !current.alive) return state;
  const s = txt(state);
  const verb = current.intentVerb;
  const tx = current.intentX;
  const ty = current.intentY;

  if (verb === 'wait') return state;

  if (verb === 'split') {
    let next = spawnBunny(state, { x: tx, y: ty });
    const prey = nearestPiece(next, current);
    if (prey) {
      const step = stepToward(next, current, prey);
      if (step) next = moveEnemyTo(next, current.id, step);
    }
    return next;
  }

  if (verb === 'drain') {
    const range = current.kind === 'specter' ? 2 : 1;
    const planned = livingPieces(state).find((p) => p.x === tx && p.y === ty && p.alive);
    const target = planned && manhattan(current, planned) <= range ? planned : drainTarget(state, current, range);
    if (!target) return state;
    const dmg = current.attack;
    const after = hurtPiece(state, target.id, dmg);
    return { ...after, log: copyLog(after.log, formatText(s.log.foeDrain, { foe: enemyName(state, current), name: target.name, n: dmg })) };
  }

  return moveEnemyTo(state, current.id, { x: tx, y: ty });
}

function moveEnemyTo(state: ChessState, id: string, dest: Pos): ChessState {
  const e = enemyById(state, id);
  if (!e || !e.alive) return state;
  if (!onBoard(dest.x, dest.y)) return state;
  const s = txt(state);
  const occ = occupant(state, dest.x, dest.y);
  if (occ?.side === 'foe' && occ.id !== id) return state;
  if (occ?.side === 'ally') {
    const p = pieceById(state, occ.id);
    if (!p) return state;
    const dmg = e.attack;
    let next = hurtPiece(state, p.id, dmg);
    const still = pieceById(next, p.id);
    if (still?.alive) {
      return { ...next, log: copyLog(next.log, formatText(s.log.foeStrike, { foe: enemyName(state, e), name: p.name, n: dmg })) };
    }
    next = {
      ...next,
      enemies: next.enemies.map((en) => (en.id === id ? { ...en, x: dest.x, y: dest.y } : en)),
      log: copyLog(next.log, formatText(s.log.foeTake, { foe: enemyName(state, e), name: p.name })),
    };
    return next;
  }
  return {
    ...state,
    enemies: state.enemies.map((en) => (en.id === id ? { ...en, x: dest.x, y: dest.y } : en)),
    log: copyLog(state.log, formatText(s.log.foeStep, { foe: enemyName(state, e), file: squareFile(dest.x), rank: dest.y + 1 })),
  };
}

function finishPlayerTurn(state: ChessState): ChessState {
  const actedIds = livingEnemies(state).map((e) => e.id).sort();
  let next = state;
  for (const id of actedIds) {
    const e = enemyById(next, id);
    if (!e || !e.alive) continue;
    next = executeLocked(next, e);
  }
  next = {
    ...next,
    turnInRoom: next.turnInRoom + 1,
    totalTurns: next.totalTurns + 1,
    extraMoveId: '',
    step: next.step + 1,
  };
  return resolveRoom(next);
}

function resolveRoom(state: ChessState): ChessState {
  if (state.end !== 'none') return state;
  if (livingPieces(state).length === 0) {
    const s = txt(state);
    return { ...state, phase: 'over', end: 'lost', log: copyLog(state.log, s.log.loseAll) };
  }
  if (livingEnemies(state).length === 0) {
    const cleared = state.roomsCleared + 1;
    const s = txt(state);
    const logged = copyLog(state.log, formatText(s.log.roomClear, { n: state.room }));
    if (state.room >= ROOM_COUNT) {
      return {
        ...state,
        roomsCleared: cleared,
        phase: 'over',
        end: 'won',
        log: copyLog(logged, formatText(s.log.win, { n: livingPieces(state).length, turns: state.totalTurns })),
        offers: [],
      };
    }
    const offered: ChessState = { ...state, roomsCleared: cleared, log: logged, phase: 'upgrade', extraMoveId: '' };
    return { ...offered, offers: offerUpgrades(offered) };
  }
  if (state.turnInRoom >= state.turnCap) {
    const s = txt(state);
    return { ...state, phase: 'over', end: 'lost', log: copyLog(state.log, formatText(s.log.loseTurns, { n: state.turnCap })) };
  }
  return withIntentions(state);
}

function applyUpgrade(state: ChessState, offer: UpgradeOffer): ChessState {
  const s = txt(state);
  const target = pieceById(state, offer.targetId);
  const other = pieceById(state, offer.secondId);
  const label = s.upgrade[offer.kind].name;
  let next = { ...state, log: copyLog(state.log, formatText(s.log.tookUpgrade, { name: label })) };
  if (offer.kind === 'sharpen' && target?.alive) {
    next = { ...next, pieces: next.pieces.map((p) => (p.id === target.id ? { ...p, attack: p.attack + 1 } : p)) };
  } else if (offer.kind === 'mend') {
    next = { ...next, pieces: next.pieces.map((p) => (p.alive ? { ...p, hp: p.maxHp } : p)) };
  } else if (offer.kind === 'dash' && target) {
    next = { ...next, dashPieceId: target.id, dashLeft: 1 };
  } else if (offer.kind === 'swap' && target?.alive && other?.alive) {
    next = {
      ...next,
      pieces: next.pieces.map((p) => {
        if (p.id === target.id) return { ...p, x: other.x, y: other.y };
        if (p.id === other.id) return { ...p, x: target.x, y: target.y };
        return p;
      }),
    };
  } else if (offer.kind === 'ward' && target?.alive) {
    next = { ...next, pieces: next.pieces.map((p) => (p.id === target.id ? { ...p, shield: p.shield + 2 } : p)) };
  } else if (offer.kind === 'recall') {
    const fallen = [...next.pieces.filter((p) => !p.alive)].sort((a, b) => a.id.localeCompare(b.id))[0];
    if (fallen) {
      const spot = firstEmpty(next) ?? { x: fallen.x, y: fallen.y };
      next = {
        ...next,
        pieces: next.pieces.map((p) => (p.id === fallen.id ? { ...p, alive: true, hp: 1, shield: 0, x: spot.x, y: spot.y } : p)),
        log: copyLog(next.log, formatText(s.log.revive, { name: fallen.name })),
      };
    } else {
      next = { ...next, recallArmed: true };
    }
  } else if (offer.kind === 'reach' && target?.alive) {
    next = { ...next, pieces: next.pieces.map((p) => (p.id === target.id ? { ...p, rangeBonus: p.rangeBonus + 1 } : p)) };
  } else if (offer.kind === 'brace') {
    next = { ...next, pieces: next.pieces.map((p) => (p.alive ? { ...p, maxHp: p.maxHp + 1, hp: p.hp + 1 } : p)) };
  } else if (offer.kind === 'clock') {
    next = { ...next, turnCap: next.turnCap + 8 };
  } else if (offer.kind === 'pierce') {
    next = { ...next, pierce: next.pierce + 1 };
  } else if (offer.kind === 'guard' && target?.alive) {
    next = { ...next, pieces: next.pieces.map((p) => (p.id === target.id ? { ...p, shield: p.shield + 1 } : p)) };
  } else if (offer.kind === 'blink' && target?.alive) {
    const ghost: ChessState = {
      ...next,
      pieces: next.pieces.map((p) => (p.id === target.id ? { ...p, x: -1, y: -1 } : p)),
    };
    const spot = firstEmpty(ghost) ?? { x: target.x, y: target.y };
    next = { ...next, pieces: next.pieces.map((p) => (p.id === target.id ? { ...p, x: spot.x, y: spot.y } : p)) };
  }
  return enterRoom(next, state.room + 1);
}

function playMove(state: ChessState, id: string, x: number, y: number): ChessState {
  const piece = pieceById(state, id);
  if (!piece?.alive) return state;
  if (state.extraMoveId && state.extraMoveId !== id) return state;
  const legal = legalMoves(state, piece);
  if (!legal.some((m) => m.x === x && m.y === y)) return state;
  const s = txt(state);
  const occ = occupant(state, x, y);
  let next = state;
  if (occ?.side === 'foe') {
    const foe = enemyById(state, occ.id);
    if (!foe) return state;
    const dmg = damageOf(state, piece);
    next = hurtEnemy(state, foe.id, dmg);
    const still = enemyById(next, foe.id);
    next = { ...next, log: copyLog(next.log, formatText(s.log.capture, { name: piece.name, foe: enemyName(state, foe), n: dmg })) };
    if (still?.alive) {
      next = { ...next, log: copyLog(next.log, formatText(s.log.bounce, { name: piece.name, foe: enemyName(state, foe) })) };
    } else {
      next = {
        ...next,
        pieces: next.pieces.map((p) => (p.id === id ? { ...p, x, y } : p)),
        log: copyLog(next.log, formatText(s.log.take, { name: piece.name, foe: enemyName(state, foe) })),
      };
    }
  } else if (occ) {
    return state;
  } else {
    next = {
      ...state,
      pieces: state.pieces.map((p) => (p.id === id ? { ...p, x, y } : p)),
      log: copyLog(state.log, formatText(s.log.move, { name: piece.name, file: squareFile(x), rank: y + 1 })),
    };
  }
  next = { ...next, step: next.step + 1 };
  const mover = pieceById(next, id);
  if (mover && next.dashLeft > 0 && next.dashPieceId === id && !next.extraMoveId) {
    const dashed: ChessState = { ...next, dashLeft: 0, extraMoveId: id };
    if (legalMoves(dashed, mover).length > 0) return dashed;
  }
  return finishPlayerTurn(next);
}

function reduce(state: ChessState, action: ChessAction): ChessState {
  if (isOver(state)) return state;
  if (action.type === 'forfeit') {
    const s = txt(state);
    return { ...state, phase: 'over', end: 'fled', log: copyLog(state.log, formatText(s.log.flee, { n: state.roomsCleared })) };
  }
  if (state.phase === 'upgrade') {
    if (action.type !== 'upgrade') return state;
    const offer = state.offers[action.index];
    if (!offer) return state;
    return applyUpgrade(state, offer);
  }
  if (action.type === 'wait') {
    if (hasLegalMove(state)) return state;
    const s = txt(state);
    const waiting = livingPieces(state)[0];
    const named = waiting?.name ?? '—';
    return finishPlayerTurn({ ...state, log: copyLog(state.log, formatText(s.log.wait, { name: named })) });
  }
  if (action.type !== 'play') return state;
  return playMove(state, action.id, action.x, action.y);
}

function scoreOf(state: ChessState): number {
  const alive = livingPieces(state);
  const hp = alive.reduce((n, p) => n + p.hp, 0);
  if (state.end === 'fled') return clampScore(state.roomsCleared * 120 + alive.length * 25);
  if (state.end === 'lost') return clampScore(state.roomsCleared * 180 + state.turnInRoom * 2);
  return clampScore(700 + alive.length * 30 + hp * 2 - state.totalTurns * 3);
}

function outcomeLog(state: ChessState): string[] {
  const lines = state.log.filter((line) => line.length > 0);
  return lines.length > 0 ? lines : [txt(state).log.loseAll];
}

function outcome(state: ChessState): Outcome | null {
  if (!isOver(state) || state.end === 'none') return null;
  const result = state.end === 'won' ? 'won' : state.end === 'fled' ? 'fled' : 'lost';
  return {
    result,
    score: scoreOf(state),
    log: outcomeLog(state),
    troopsUsed: state.pieces.map((p) => p.id),
    stats: { rooms: state.roomsCleared, turns: state.totalTurns, survivors: livingPieces(state).length },
  };
}

function upgradeScore(state: ChessState, offer: UpgradeOffer): number {
  const fallen = state.pieces.some((p) => !p.alive);
  const hurt = livingPieces(state).some((p) => p.hp < p.maxHp);
  if (offer.kind === 'pierce') return 100;
  if (offer.kind === 'mend') return hurt ? 95 : 40;
  if (offer.kind === 'recall') return fallen ? 90 : 55;
  if (offer.kind === 'dash') return 80;
  if (offer.kind === 'sharpen') return 70;
  if (offer.kind === 'brace') return 65;
  if (offer.kind === 'ward') return 60;
  if (offer.kind === 'reach') return 55;
  if (offer.kind === 'guard') return 50;
  if (offer.kind === 'clock') return 40;
  if (offer.kind === 'blink') return 30;
  return 20;
}

function moveScore(state: ChessState, piece: Piece, dest: Pos): number {
  const occ = occupant(state, dest.x, dest.y);
  let score = 0;
  if (occ?.side === 'foe') {
    const e = enemyById(state, occ.id);
    if (e) {
      const dmg = damageOf(state, piece);
      score += 120 + Math.min(dmg, e.hp) * 12;
      if (dmg >= e.hp) score += 60 + e.attack * 6 + (e.kind === 'static' ? 90 : 0);
    }
  } else {
    const t = nearestEnemy(state, dest);
    if (t) score += 24 - manhattan(dest, t) * 2;
    for (const e of livingEnemies(state)) {
      if (e.intentVerb === 'wait') continue;
      if (e.intentX === dest.x && e.intentY === dest.y) {
        score -= e.attack * 4;
        if (e.attack >= piece.hp + piece.shield) score -= 50;
      }
    }
  }
  return score;
}

function botPlay(state: ChessState, rng: () => number): ChessAction | null {
  if (isOver(state)) return null;
  if (state.phase === 'upgrade') {
    if (state.offers.length === 0) return { type: 'forfeit' };
    const scored = state.offers.map((o, i) => ({ i, s: upgradeScore(state, o) }));
    const best = Math.max(...scored.map((x) => x.s));
    const pick = rngPick(
      rng,
      scored.filter((x) => x.s >= best - 8),
    );
    return { type: 'upgrade', index: pick.i };
  }
  const options: { id: string; x: number; y: number; score: number }[] = [];
  for (const p of movablePieces(state)) {
    for (const m of legalMoves(state, p)) options.push({ id: p.id, x: m.x, y: m.y, score: moveScore(state, p, m) });
  }
  if (options.length === 0) return { type: 'wait' };
  const best = Math.max(...options.map((o) => o.score));
  const pick = rngPick(
    rng,
    options.filter((o) => o.score >= best - 2),
  );
  return { type: 'play', id: pick.id, x: pick.x, y: pick.y };
}

function forfeit(): ChessAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<ChessState, ChessAction> = { initial, reduce, outcome, botPlay, forfeit };

/** Exported for tests that build a custom board from a real initial state. */
export function placePiece(state: ChessState, id: string, x: number, y: number): ChessState {
  return { ...state, pieces: state.pieces.map((p) => (p.id === id ? { ...p, x, y } : p)) };
}

export function clearEnemies(state: ChessState): ChessState {
  return { ...state, enemies: state.enemies.map((e) => ({ ...e, alive: false, hp: 0 })) };
}

/** Apply the locked enemy intentions and the end-of-turn checks (for unit tests). */
export function runEnemyTurn(state: ChessState): ChessState {
  return finishPlayerTurn(state);
}

export { enemyHp, enemyAtk, roomEnemyCount, planEnemy };
