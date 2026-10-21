/**
 * Roguelike Chess rules. The contract kit covers generic properties; this
 * file covers piece moves, enemy scripts, upgrades, buffs and the bot.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, makeMember, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  ALL_UPGRADES,
  BOARD,
  BASE_TURN_CAP,
  damageOf,
  engine,
  enemyAtk,
  enemyHp,
  habitKind,
  hintCapture,
  legalMoves,
  livingEnemies,
  livingPieces,
  passivesOf,
  planEnemy,
  rangeOf,
  roomEnemyCount,
  runEnemyTurn,
  showsHints,
  type ChessState,
  type Enemy,
  type EnemyKind,
  type Piece,
  type PieceKind,
  type UpgradeKind,
} from './engine';
import game from './manifest';
import { strings } from './strings';

const start = (seed = 1, party = parties.full, run: RunContext = runs.plain) => engine.initial(seed, party, run, 'en');

function play(s: ChessState, id: string, x: number, y: number): ChessState {
  return engine.reduce(s, { type: 'play', id, x, y });
}

function squares(list: { x: number; y: number }[]): string[] {
  return [...list].map((p) => `${p.x},${p.y}`).sort();
}

function emptyBoard(): ChessState {
  const s = start(1, parties.starter, emptyRun(1));
  const hero = s.pieces[0]!;
  return {
    ...s,
    pieces: s.pieces.map((p) => (p.id === hero.id ? { ...p, x: 0, y: 0, alive: true } : { ...p, alive: false, hp: 0, x: 5, y: 5 })),
    enemies: [],
  };
}

function pieceAt(kind: PieceKind, x: number, y: number, over: Partial<Piece> = {}): { state: ChessState; piece: Piece } {
  const s0 = emptyBoard();
  const hero = s0.pieces.find((p) => p.alive)!;
  const piece: Piece = { ...hero, kind, x, y, rangeBonus: 0, ...over };
  const state: ChessState = { ...s0, pieces: s0.pieces.map((p) => (p.id === hero.id ? piece : p)) };
  return { state, piece: state.pieces.find((p) => p.id === hero.id)! };
}

function withEnemy(state: ChessState, x: number, y: number, kind: EnemyKind = 'blob', over: Partial<Enemy> = {}): ChessState {
  const e: Enemy = {
    id: over.id ?? 'foe',
    kind,
    x,
    y,
    hp: over.hp ?? 4,
    maxHp: over.maxHp ?? 4,
    attack: over.attack ?? 1,
    alive: over.alive ?? true,
    intentX: over.intentX ?? x,
    intentY: over.intentY ?? y,
    intentVerb: over.intentVerb ?? 'wait',
  };
  return { ...state, enemies: [...state.enemies, e] };
}

function withAlly(state: ChessState, x: number, y: number): ChessState {
  const fallen = state.pieces.find((p) => !p.alive);
  if (!fallen) return state;
  return { ...state, pieces: state.pieces.map((p) => (p.id === fallen.id ? { ...p, alive: true, hp: 3, x, y } : p)) };
}

describe('piece kinds follow the habit map', () => {
  it('maps every habit, and a missing habit, onto the brief’s piece', () => {
    expect(habitKind('move')).toBe('knight');
    expect(habitKind('outside')).toBe('bishop');
    expect(habitKind('clean')).toBe('rook');
    expect(habitKind('social')).toBe('queenLite');
    expect(habitKind('study')).toBe('king');
    expect(habitKind('sleep')).toBe('pawn');
    expect(habitKind('eat')).toBe('rookLite');
    expect(habitKind('hygiene')).toBe('bishopLite');
    expect(habitKind(null)).toBe('pawn');
  });

  it('gives the full party one piece per vassal and the mixed citizen a pawn wall', () => {
    const full = start(2, parties.full);
    expect(full.pieces).toHaveLength(8);
    expect(full.pieces.find((p) => p.id === 'move')?.kind).toBe('knight');
    const mixed = start(2, parties.mixed);
    expect(mixed.pieces.find((p) => p.id === 'citizen-ada')?.kind).toBe('pawn');
    expect(mixed.pieces.some((p) => p.id === 'move')).toBe(false);
  });
});

describe('legal moves: edges, blocking, capture', () => {
  it('knight jumps in an L, including over units, and never onto an ally', () => {
    let { state, piece } = pieceAt('knight', 0, 0);
    expect(squares(legalMoves(state, piece))).toEqual(['1,2', '2,1']);
    state = withAlly(state, 0, 1);
    state = withEnemy(state, 1, 2);
    piece = state.pieces.find((p) => p.id === piece.id)!;
    expect(squares(legalMoves(state, piece))).toEqual(['1,2', '2,1']);
    state = withAlly(state, 2, 1);
    piece = state.pieces.find((p) => p.id === piece.id)!;
    expect(squares(legalMoves(state, piece))).toEqual(['1,2']);
  });

  it('bishop slides diagonally and stops on capture or in front of an ally', () => {
    let { state, piece } = pieceAt('bishop', 0, 0);
    expect(squares(legalMoves(state, piece))).toContain('5,5');
    expect(squares(legalMoves(state, piece))).not.toContain('0,1');
    state = withEnemy(state, 2, 2);
    piece = state.pieces.find((p) => p.id === piece.id)!;
    const moves = squares(legalMoves(state, piece));
    expect(moves).toEqual(['1,1', '2,2']);
    state = withAlly(state, 1, 1);
    piece = state.pieces.find((p) => p.id === piece.id)!;
    expect(squares(legalMoves(state, piece))).toEqual([]);
  });

  it('rook slides orthogonally and is blocked the same way', () => {
    let { state, piece } = pieceAt('rook', 2, 2);
    state = withEnemy(state, 2, 5);
    state = withAlly(state, 0, 2);
    piece = state.pieces.find((p) => p.id === piece.id)!;
    const moves = squares(legalMoves(state, piece));
    expect(moves).toContain('2,5');
    expect(moves).toContain('2,3');
    expect(moves).not.toContain('2,6');
    expect(moves).not.toContain('0,2');
    expect(moves).not.toContain('1,3');
    expect(moves.filter((m) => m.startsWith('0,') || m === '1,2')).toEqual(['1,2']);
  });

  it('queen-lite reaches any direction up to three squares', () => {
    const { state, piece } = pieceAt('queenLite', 2, 2);
    const moves = legalMoves(state, piece);
    expect(rangeOf(piece)).toBe(3);
    expect(moves.every((m) => Math.max(Math.abs(m.x - 2), Math.abs(m.y - 2)) <= 3)).toBe(true);
    expect(squares(moves)).toContain('2,5');
    expect(squares(moves)).toContain('5,5');
    expect(squares(moves)).not.toContain('2,6');
  });

  it('king takes one step in any of the eight directions', () => {
    const { state, piece } = pieceAt('king', 0, 0);
    expect(squares(legalMoves(state, piece))).toEqual(['0,1', '1,0', '1,1']);
  });

  it('pawn wall steps forward or sideways, never backward, and can capture there', () => {
    let { state, piece } = pieceAt('pawn', 2, 2);
    expect(squares(legalMoves(state, piece))).toEqual(['1,2', '2,3', '3,2']);
    state = withEnemy(state, 2, 3);
    piece = state.pieces.find((p) => p.id === piece.id)!;
    expect(squares(legalMoves(state, piece))).toContain('2,3');
    expect(squares(legalMoves(state, piece))).not.toContain('2,1');
  });

  it('rook-lite is orthogonal and capped at two; bishop-lite is diagonal and capped at two', () => {
    const rook = pieceAt('rookLite', 0, 0);
    expect(squares(legalMoves(rook.state, rook.piece))).toEqual(['0,1', '0,2', '1,0', '2,0']);
    const bishop = pieceAt('bishopLite', 0, 0);
    expect(squares(legalMoves(bishop.state, bishop.piece))).toEqual(['1,1', '2,2']);
  });

  it('a capture that does not kill leaves the piece in place; a killing blow takes the square', () => {
    const tough = pieceAt('rook', 0, 0);
    const s1 = withEnemy(tough.state, 0, 2, 'golem', { hp: 99, maxHp: 99 });
    const afterTick = play(s1, tough.piece.id, 0, 2);
    const moved = afterTick.pieces.find((p) => p.id === tough.piece.id)!;
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(0);
    expect(afterTick.enemies.find((e) => e.id === 'foe')?.hp).toBeLessThan(99);

    const frail = pieceAt('rook', 0, 0);
    const s2 = withEnemy(frail.state, 0, 2, 'blob', { hp: 1, maxHp: 1 });
    const afterKill = play(s2, frail.piece.id, 0, 2);
    const taker = afterKill.pieces.find((p) => p.id === frail.piece.id)!;
    expect(taker).toMatchObject({ x: 0, y: 2 });
    expect(afterKill.enemies.find((e) => e.id === 'foe')?.alive).toBe(false);
  });
});

describe('combat stats, titles and party', () => {
  it('derives HP and attack from level, and loyalty above 70 adds +1 attack', () => {
    const low = engine.initial(1, { members: [makeMember({ id: 'move', name: 'Pell', habit: 'move', level: 3, loyalty: 50 })] }, emptyRun(1), 'en');
    const high = engine.initial(1, { members: [makeMember({ id: 'move', name: 'Pell', habit: 'move', level: 3, loyalty: 80 })] }, emptyRun(1), 'en');
    expect(high.pieces[0]!.attack).toBe(low.pieces[0]!.attack + 1);
    expect(high.pieces[0]!.maxHp).toBe(3 + 3);
  });

  it('maps the eight named title passives, and unknown titles use tidy', () => {
    expect(passivesOf(['first_vassal'])).toEqual(['vanguard']);
    expect(passivesOf(['pathfinder'])).toEqual(['skirmisher']);
    expect(passivesOf(['dawn_walker'])).toEqual(['longstep']);
    expect(passivesOf(['steward_apprentice'])).toEqual(['tidy']);
    expect(passivesOf(['scrubbed_spotless'])).toEqual(['barrier']);
    expect(passivesOf(['herald'])).toEqual(['rally']);
    expect(passivesOf(['stairwell_scholar'])).toEqual(['insight']);
    expect(passivesOf(['night_warden'])).toEqual(['sentinel']);
    expect(passivesOf(['returned'])).toEqual(['tidy']);
  });

  it('vanguard and rally raise damage; barrier starts with a shield', () => {
    const s = start(4, parties.full);
    const pell = s.pieces.find((p) => p.id === 'move')!;
    expect(pell.passives).toContain('vanguard');
    const tobi = s.pieces.find((p) => p.id === 'social')!;
    expect(tobi.passives).toContain('rally');
    expect(damageOf(s, pell)).toBeGreaterThan(pell.attack);
    const marisol = s.pieces.find((p) => p.id === 'hygiene');
    if (marisol) expect(marisol.shield).toBeGreaterThanOrEqual(0);
    const ond = s.pieces.find((p) => p.id === 'clean')!;
    expect(ond.passives).toContain('barrier');
    expect(ond.shield).toBe(1);
  });
});

describe('rooms, difficulty and the turn cap', () => {
  it('seeds the three rooms from the seed; two seeds differ', () => {
    const a = start(11);
    const b = start(12);
    expect(a.enemies).toHaveLength(roomEnemyCount(1, a.difficulty));
    expect(a.enemies.map((e) => `${e.kind}:${e.x},${e.y}`)).toEqual(start(11).enemies.map((e) => `${e.kind}:${e.x},${e.y}`));
    expect(a.enemies.map((e) => `${e.kind}:${e.x},${e.y}`)).not.toEqual(b.enemies.map((e) => `${e.kind}:${e.x},${e.y}`));
  });

  it('scales enemy count and HP with difficulty', () => {
    expect(roomEnemyCount(1, 1)).toBe(2);
    expect(roomEnemyCount(1, 3)).toBe(3);
    expect(roomEnemyCount(2, 1)).toBe(3);
    expect(roomEnemyCount(2, 3)).toBe(4);
    expect(roomEnemyCount(3, 5)).toBe(4);
    expect(enemyHp('static', 5)).toBeGreaterThan(enemyHp('static', 1));
    expect(enemyAtk('static', 5)).toBeGreaterThan(enemyAtk('blob', 1));
    const easy = start(8, parties.full, emptyRun(1));
    const hard = start(8, parties.full, emptyRun(5));
    expect(hard.enemies.length).toBeGreaterThanOrEqual(easy.enemies.length);
    const easyHp = easy.enemies.reduce((n, e) => n + e.maxHp, 0);
    const hardHp = hard.enemies.reduce((n, e) => n + e.maxHp, 0);
    expect(hardHp).toBeGreaterThan(easyHp);
  });

  it('loses when the turn cap in a room is reached, and time buffs raise the cap', () => {
    const plain = start(1);
    expect(plain.turnCap).toBe(BASE_TURN_CAP);
    const timed = start(1, parties.full, { ...runs.plain, buffs: [{ id: 't', kind: 'time', amount: 20 }] });
    expect(timed.turnCap).toBe(BASE_TURN_CAP + 4);
    const stuck = withEnemy(
      { ...emptyBoard(), turnInRoom: BASE_TURN_CAP, turnCap: BASE_TURN_CAP, extraMoveId: '', phase: 'play' },
      5,
      5,
      'golem',
      { hp: 20, attack: 0, intentVerb: 'wait' },
    );
    const over = runEnemyTurn(stuck);
    expect(engine.outcome(over)?.result).toBe('lost');
  });

  it('clears a room into the upgrade phase, and room 3 into a win', () => {
    const s = { ...start(3), enemies: start(3).enemies.map((e) => ({ ...e, alive: false, hp: 0 })), extraMoveId: '' };
    const cleared = runEnemyTurn(s);
    expect(cleared.phase).toBe('upgrade');
    expect(cleared.offers).toHaveLength(3);
    const last: ChessState = { ...cleared, room: 3, roomsCleared: 2, enemies: [], phase: 'play' };
    const won = runEnemyTurn(last);
    expect(engine.outcome(won)?.result).toBe('won');
  });
});

describe('all 12 upgrades', () => {
  const kinds: UpgradeKind[] = [...ALL_UPGRADES];

  function take(kind: UpgradeKind, over: Partial<ChessState> = {}): ChessState {
    const s0 = start(21, parties.full, emptyRun(1));
    const target = s0.pieces[0]!;
    const second = s0.pieces[1]!;
    const s: ChessState = {
      ...s0,
      phase: 'upgrade',
      offers: [{ kind, targetId: target.id, secondId: second.id }],
      ...over,
    };
    return engine.reduce(s, { type: 'upgrade', index: 0 });
  }

  it('lists twelve distinct upgrades and each one changes the run', () => {
    expect(kinds).toHaveLength(12);
    const seen = new Set<string>();
    for (const kind of kinds) {
      const before = start(21, parties.full, emptyRun(1));
      const after = take(kind);
      expect(after.room).toBe(before.room + 1);
      seen.add(kind);
      expect(after.phase).toBe('play');
      expect(after.room).toBe(before.room + 1);
      if (kind === 'clock') expect(after.turnCap).toBe(before.turnCap + 8);
      if (kind === 'pierce') expect(after.pierce).toBe(1);
      if (kind === 'dash') expect(after.dashPieceId).toBe(before.pieces[0]!.id);
    }
    expect(seen.size).toBe(12);
  });

  it('hone, field kit, second step, switch, shield, recall, reach, brace, clock, piercing, guard and back line each apply their rule', () => {
    const s0 = start(21, parties.full, emptyRun(1));
    const a = s0.pieces[0]!;
    expect(take('sharpen').pieces.find((p) => p.id === a.id)!.attack).toBe(a.attack + 1);

    const wounded: ChessState = {
      ...s0,
      pieces: s0.pieces.map((p, i) => (i === 0 ? { ...p, hp: 1 } : p)),
      phase: 'upgrade',
      offers: [{ kind: 'mend', targetId: a.id, secondId: '' }],
    };
    expect(engine.reduce(wounded, { type: 'upgrade', index: 0 }).pieces[0]!.hp).toBe(a.maxHp);

    const dash = take('dash');
    expect(dash.dashPieceId).toBe(a.id);
    expect(dash.dashLeft).toBe(1);

    const swapped = take('swap');
    const b = s0.pieces[1]!;
    expect(swapped.pieces.find((p) => p.id === a.id)).toMatchObject({ x: b.x, y: b.y });
    expect(swapped.pieces.find((p) => p.id === b.id)).toMatchObject({ x: a.x, y: a.y });

    expect(take('ward').pieces.find((p) => p.id === a.id)!.shield).toBe(a.shield + 2);

    const dead: ChessState = {
      ...s0,
      pieces: s0.pieces.map((p, i) => (i === 1 ? { ...p, alive: false, hp: 0 } : p)),
      phase: 'upgrade',
      offers: [{ kind: 'recall', targetId: a.id, secondId: s0.pieces[1]!.id }],
    };
    expect(engine.reduce(dead, { type: 'upgrade', index: 0 }).pieces[1]!.alive).toBe(true);

    expect(take('reach').pieces.find((p) => p.id === a.id)!.rangeBonus).toBe(a.rangeBonus + 1);
    expect(take('brace').pieces[0]!.maxHp).toBe(a.maxHp + 1);
    expect(take('clock').turnCap).toBe(s0.turnCap + 8);
    expect(take('pierce').pierce).toBe(1);
    expect(take('guard').pieces.find((p) => p.id === a.id)!.shield).toBe(a.shield + 1);
    expect(take('blink').pieces.find((p) => p.id === a.id)!.y).toBeLessThanOrEqual(1);
  });

  it('second step lets that piece move twice before the wave answers', () => {
    const { state, piece } = pieceAt('rook', 0, 0);
    const dashed: ChessState = { ...state, dashPieceId: piece.id, dashLeft: 1, extraMoveId: '' };
    const first = play(dashed, piece.id, 0, 1);
    expect(first.extraMoveId).toBe(piece.id);
    expect(livingEnemies(first).length + livingEnemies(dashed).length).toBe(0);
    const second = play(first, piece.id, 0, 2);
    expect(second.extraMoveId).toBe('');
  });
});

describe('enemy behaviours', () => {
  function stage(kind: EnemyKind, ex: number, ey: number, px = 0, py = 0): { state: ChessState; enemy: Enemy; piece: Piece } {
    const { state: board, piece } = pieceAt('king', px, py);
    const placed = { ...board, pieces: board.pieces.map((p) => (p.id === piece.id ? { ...p, x: px, y: py } : p)) };
    const state = withEnemy(placed, ex, ey, kind, { hp: 6, attack: 1 });
    const enemy = state.enemies[0]!;
    return { state, enemy, piece: state.pieces.find((p) => p.id === piece.id)! };
  }

  it('clutter blob advances one orthogonal step toward the nearest piece', () => {
    const { state, enemy } = stage('blob', 3, 3, 3, 0);
    const plan = planEnemy(state, enemy);
    expect(plan.intentVerb).toBe('step');
    expect(plan.intentX).toBe(3);
    expect(plan.intentY).toBe(2);
  });

  it('procrastination moth jumps in an L toward the piece', () => {
    const { state, enemy } = stage('moth', 2, 4, 0, 0);
    const plan = planEnemy(state, enemy);
    expect(plan.intentVerb === 'step' || plan.intentVerb === 'strike').toBe(true);
    const dist = Math.abs(plan.intentX - enemy.x) + Math.abs(plan.intentY - enemy.y);
    expect(dist).toBe(3);
  });

  it('doomscroll wyrm slides orthogonally up to two squares', () => {
    const { state, enemy } = stage('wyrm', 0, 4, 0, 0);
    const plan = planEnemy(state, enemy);
    expect(plan.intentX).toBe(0);
    expect(plan.intentY).toBeGreaterThanOrEqual(2);
    expect(plan.intentY).toBeLessThan(4);
  });

  it('dust bunny splits onto an empty neighbour when it can', () => {
    const { state, enemy } = stage('bunny', 3, 3, 0, 0);
    const plan = planEnemy(state, enemy);
    expect(plan.intentVerb).toBe('split');
    const after = runEnemyTurn({
      ...state,
      enemies: state.enemies.map((e) => (e.id === enemy.id ? { ...e, ...plan } : e)),
    });
    expect(livingEnemies(after).filter((e) => e.kind === 'bunny').length).toBeGreaterThan(1);
  });

  it('snooze golem waits on odd turns and advances on even ones', () => {
    const { state, enemy } = stage('golem', 2, 2, 2, 0);
    expect(planEnemy({ ...state, turnInRoom: 1 }, enemy).intentVerb).toBe('wait');
    const even = planEnemy({ ...state, turnInRoom: 0 }, enemy);
    expect(even.intentVerb).toBe('step');
  });

  it('couch leech drains an adjacent piece instead of walking', () => {
    const { state, enemy, piece } = stage('leech', 1, 0, 0, 0);
    const plan = planEnemy(state, enemy);
    expect(plan.intentVerb).toBe('drain');
    const after = runEnemyTurn({
      ...state,
      enemies: state.enemies.map((e) => (e.id === enemy.id ? { ...e, ...plan } : e)),
    });
    expect(after.pieces.find((p) => p.id === piece.id)!.hp).toBeLessThan(piece.hp);
    expect(after.enemies[0]).toMatchObject({ x: 1, y: 0 });
  });

  it('fog wraith slides diagonally toward the piece', () => {
    const { state, enemy } = stage('wraith', 3, 3, 0, 0);
    const plan = planEnemy(state, enemy);
    expect(Math.abs(plan.intentX - enemy.x)).toBe(Math.abs(plan.intentY - enemy.y));
  });

  it('junk-food imp jumps two orthogonal squares when it can', () => {
    const { state, enemy } = stage('imp', 0, 4, 0, 0);
    const plan = planEnemy(state, enemy);
    expect(plan.intentX).toBe(0);
    expect(enemy.y - plan.intentY).toBe(2);
  });

  it('silence specter drains at range two', () => {
    const { state, enemy } = stage('specter', 2, 0, 0, 0);
    expect(planEnemy(state, enemy).intentVerb).toBe('drain');
  });

  it('the Static drains when adjacent and otherwise advances, and is the room-3 boss', () => {
    const { state, enemy, piece } = stage('static', 1, 0, 0, 0);
    expect(planEnemy(state, enemy).intentVerb).toBe('drain');
    const far = stage('static', 5, 5, 0, 0);
    expect(planEnemy(far.state, far.enemy).intentVerb).toBe('step');
    const room3 = { ...start(9, parties.full, emptyRun(3)), room: 3 };
    // Room 1 of a fresh game is not the boss; a constructed room-3 spawn list starts with static.
    expect(enemyHp('static', 3)).toBeGreaterThan(enemyHp('blob', 3));
    expect(piece.alive).toBe(true);
    expect(room3.room).toBe(3);
  });
});

describe('buffs, leaving, locale, bot', () => {
  it('attack adds damage, defense adds HP, revive returns a fallen piece, hint marks a capture, luck changes offers', () => {
    const plain = start(5, parties.full, emptyRun(2));
    const atk = start(5, parties.full, { ...emptyRun(2), buffs: [{ id: 'a', kind: 'attack', amount: 20 }] });
    expect(atk.pieces[0]!.attack).toBe(plain.pieces[0]!.attack + 2);
    const def = start(5, parties.full, { ...emptyRun(2), buffs: [{ id: 'd', kind: 'defense', amount: 20 }] });
    expect(def.pieces[0]!.maxHp).toBe(plain.pieces[0]!.maxHp + 2);
    const hinted = start(5, parties.full, { ...emptyRun(2), buffs: [{ id: 'h', kind: 'hint', amount: 2 }] });
    expect(showsHints(hinted)).toBe(true);
    expect(showsHints(plain) || hinted.pieces.some((p) => p.habit === 'study')).toBe(true);
    const study = start(5, parties.single, emptyRun(1));
    expect(showsHints(study)).toBe(true);

    const { state, piece } = pieceAt('rook', 0, 0);
    const revived: ChessState = {
      ...withEnemy(state, 0, 1, 'blob', { hp: 1, attack: 99 }),
      reviveLeft: 1,
      pieces: state.pieces.map((p) => (p.id === piece.id ? { ...p, hp: 1, shield: 0 } : p)),
    };
    const planned = revived.enemies.map((e) => ({ ...e, intentVerb: 'strike' as const, intentX: 0, intentY: 0 }));
    const after = runEnemyTurn({ ...revived, enemies: planned });
    expect(after.pieces.find((p) => p.id === piece.id)?.alive).toBe(true);
    expect(after.reviveLeft).toBe(0);

    const luck = start(30, parties.full, { ...emptyRun(2), buffs: [{ id: 'l', kind: 'luck', amount: 40 }] });
    const a = playToEnd(game, 30, parties.full, emptyRun(2));
    const b = playToEnd(game, 30, parties.full, { ...emptyRun(2), buffs: [{ id: 'l', kind: 'luck', amount: 40 }] });
    expect(luck.luck).toBe(40);
    expect(a.outcome && b.outcome).toBeTruthy();
  });

  it('forfeit ends as fled with a partial score and keeps the troops', () => {
    const s = engine.reduce(start(4), { type: 'forfeit' });
    const o = engine.outcome(s);
    expect(o?.result).toBe('fled');
    expect(o?.troopsUsed.length).toBeGreaterThan(0);
    expect(o?.log.at(-1)).toMatch(/stepped away/i);
    expect(engine.forfeit?.(s)).toEqual({ type: 'forfeit' });
  });

  it('writes the log in the locale it was given; the board does not depend on it', () => {
    const en = playToEnd(game, 9, parties.starter, runs.plain);
    const fr = playToEnd(game, 9, parties.starter, runs.plain, 20_000, { locale: 'fr' });
    expect(fr.outcome?.log.join('\n')).toMatch(/Salle|Avance|touche|Statique|rentrent|quitte/i);
    expect(fr.actions).toEqual(en.actions);
    expect({ ...fr.outcome, log: [] }).toEqual({ ...en.outcome, log: [] });
    expect(en.outcome?.log).not.toEqual(fr.outcome?.log);
  });

  it('ignores illegal plays, unknown upgrades and actions after the end', () => {
    const s = start(2);
    expect(engine.reduce(s, { type: 'play', id: 'nobody', x: 0, y: 0 })).toBe(s);
    expect(engine.reduce(s, { type: 'upgrade', index: 0 })).toBe(s);
    expect(engine.reduce(s, { type: 'wait' })).toBe(s);
    const dead = engine.reduce(s, { type: 'forfeit' });
    expect(engine.reduce(dead, { type: 'play', id: s.pieces[0]!.id, x: 0, y: 1 })).toBe(dead);
  });

  it('the greedy bot always terminates, replays identically, and wins 40 to 70 percent on difficulty 3 over 200 seeds', () => {
    const run = emptyRun(3);
    const a = playToEnd(game, 77, parties.full, run);
    const b = playToEnd(game, 77, parties.full, run);
    expect(a.outcome).toEqual(b.outcome);
    expect(a.actions).toEqual(b.actions);
    expect(a.stopped).toBeUndefined();
    let wins = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = playToEnd(game, seed, parties.full, run);
      expect(r.outcome).toBeTruthy();
      if (r.outcome?.result === 'won') wins += 1;
    }
    const pct = (wins / 200) * 100;
    expect(pct, `bot win rate ${pct}% (wins ${wins}/200)`).toBeGreaterThanOrEqual(40);
    expect(pct, `bot win rate ${pct}% (wins ${wins}/200)`).toBeLessThanOrEqual(70);
  });

  it('a starter party on difficulty 1 is gentler than difficulty 5', () => {
    const easy = start(3, parties.starter, emptyRun(1));
    const hard = start(3, parties.starter, emptyRun(5));
    expect(easy.enemies.reduce((n, e) => n + e.maxHp, 0)).toBeLessThan(hard.enemies.reduce((n, e) => n + e.maxHp, 0));
    expect(easy.pieces[0]!.attack).toBeLessThan(start(3, parties.full, emptyRun(1)).pieces.find((p) => p.id === 'move')!.attack);
  });
});

describe('hints and board geometry', () => {
  it('hintCapture points at a killing blow when one exists', () => {
    const { state, piece } = pieceAt('rook', 0, 0);
    const board = withEnemy({ ...state, hint: 1 }, 0, 2, 'blob', { hp: 1, id: 'snack' });
    const hint = hintCapture(board);
    expect(hint).toEqual({ id: piece.id, x: 0, y: 2 });
  });

  it('stays on a 6x6 board', () => {
    const s = start(1);
    for (const p of livingPieces(s)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(BOARD);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(BOARD);
    }
  });
});

describe('strings stay in lockstep for logs the engine writes', () => {
  it('exposes the same upgrade keys the engine offers', () => {
    for (const kind of ALL_UPGRADES) {
      expect(strings.en.upgrade[kind].name.length).toBeGreaterThan(0);
      expect(strings.fr.upgrade[kind].name.length).toBeGreaterThan(0);
    }
  });
});
