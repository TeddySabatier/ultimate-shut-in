/** Save version 5: the arena field and the arena wave term (tests for every earlier version live here, next to the code they cover). */
import { describe, expect, it } from 'vitest';
import { createNewSave, exportSave, migrate } from '../save';
import { T0, TZ } from '../testUtils';

describe('migrate: v5 (arena)', () => {
  const v4 = (): Record<string, unknown> => {
    const s = createNewSave(T0, 'Armless', TZ) as unknown as Record<string, unknown>;
    delete s.arena;
    s.version = 4;
    return s;
  };

  it('gives a v4 save an empty arena and keeps everything else', () => {
    const old = v4();
    (old.player as Record<string, unknown>).coins = 321;
    const s = migrate(old, T0, TZ);
    expect(s.version).toBe(5);
    expect(s.arena).toEqual(createNewSave(T0, 'x', TZ).arena);
    expect(s.arena.run).toBeNull();
    expect(s.arena.nextSeq).toBe(1);
    expect(s.player.coins).toBe(321);
  });

  it('gives v2 and v3 saves (and the legacy shape) an arena too', () => {
    const v3 = v4();
    delete v3.map;
    v3.version = 3;
    expect(migrate(v3, T0, TZ).arena.stats.runs).toBe(0);
    const v2 = migrate({ version: 2, player: {}, settings: {}, vassals: {}, utilities: {} }, T0, TZ);
    expect(v2.arena.gear.move).toEqual({ weapon: null, armor: null, charm: null });
    expect(migrate({ name: 'Old', level: 4, xp: 10 }, T0, TZ).arena.requests).toEqual([]);
  });

  it('stored wave records without the arena term get 0, and keep their other terms', () => {
    const old = v4();
    (old.week as Record<string, unknown>).history = [
      { index: 0, ring: 1, attack: 10, defense: 12, breakdown: { vassals: 1, trust: 2, walls: 3, combos: 0, titles: 0, wellKept: 0, outposts: 2 }, result: 'win', dpAwarded: 15, log: [], settledAt: T0 },
    ];
    (old.week as Record<string, unknown>).index = 1;
    const s = migrate(old, T0, TZ);
    expect(s.week.history[0]!.breakdown).toMatchObject({ outposts: 2, arena: 0 });
  });

  it('round-trips an arena with gear, a stash, training, decor, a run, a log and requests', () => {
    const s = createNewSave(T0, 'Armed', TZ);
    s.player.coins = 900;
    s.arena.gear.move = { weapon: 'practice_baton', armor: 'waxed_cloak', charm: null };
    s.arena.gear.study.charm = 'heart_of_the_haven';
    s.arena.stash = ['moonlit_pike'];
    s.arena.training.move = 3;
    s.arena.trainingWeek = { period: 0, spent: 40, bumps: 2 };
    s.arena.decor = ['sprinting_umbrella'];
    s.arena.defense = { period: 0, amount: 3 };
    s.arena.run = {
      id: 'r2',
      seed: 12345,
      startedDay: s.lastOpenDay,
      startedAt: T0,
      ring: 1,
      fee: 20,
      phase: 'lottery',
      room: 1,
      buffs: [{ id: 'attack-s@0', kind: 'attack', amount: 10 }],
      pending: { coins: 18, wins: 1 },
      current: null,
      offers: [
        { id: 'time-s@1', kind: 'time', amount: 10 },
        { id: 'luck-s@1', kind: 'luck', amount: 10 },
      ],
      games: [{ gameId: 'alpha', room: 0, result: 'won', score: 700, coins: 18, learned: { topic: { en: 'T', fr: 'T' }, note: { en: 'N', fr: 'N' } } }],
      lastGameId: 'alpha',
    };
    s.arena.log = [{ id: 'r1', day: s.lastOpenDay, at: T0, ring: 1, fee: 20, wins: 2, end: 'banked', bank: 'coins', coins: 40, defense: 0, itemId: null, games: [] }];
    s.arena.stats = { runs: 2, gamesWon: 3, gamesLost: 1, bestChain: 2, coinsBanked: 40 };
    s.arena.today = { day: s.lastOpenDay, runs: 2 };
    s.arena.requests = [{ id: 'q3', at: T0, day: s.lastOpenDay, text: 'A game about tea', source: 'voice' }];
    s.arena.nextSeq = 4;
    const back = migrate(JSON.parse(exportSave(s)), T0 + 99, TZ);
    expect(back).toEqual(s);
  });

  it('normalises a damaged arena: unknown items, wrong slots, duplicate rare items, bad runs and text', () => {
    const raw = createNewSave(T0, 'Damaged', TZ) as unknown as Record<string, unknown>;
    raw.arena = {
      gear: {
        move: { weapon: 'moonlit_pike', armor: 'practice_baton', charm: 'knotted_cord', extra: 'x' },
        outside: { weapon: 'moonlit_pike', armor: 'ghost', charm: 7 },
        bogus: { weapon: 'practice_baton' },
      },
      stash: ['moonlit_pike', 'ladle_of_ages', 'ladle_of_ages', 'practice_baton', 5],
      training: { move: 99, outside: -3, clean: 'x' },
      trainingWeek: { period: 'now', spent: -5, bumps: 1e9 },
      decor: ['sprinting_umbrella', 'sprinting_umbrella', 'nothing'],
      defense: { period: 2, amount: 99 },
      run: { id: 'r1', phase: 'playing', current: null },
      log: [
        { id: 'r9', end: 'exploded' },
        { id: 'r8', end: 'lost', wins: 3, itemId: 'ghost', games: [{ gameId: 'a', result: 'won', score: 5000, coins: 3 }, { result: 'won' }] },
      ],
      stats: { runs: -4, gamesWon: 'many', bestChain: 99 },
      today: { day: 'x', runs: 7 },
      requests: [
        { id: 'q1', text: '  Tea   time  ', source: 'smoke' },
        { id: 'q1', text: 'duplicate id' },
        { id: 'q2', text: 'x' },
        { id: 'q5', text: 'y'.repeat(1000), source: 'voice' },
      ],
      nextSeq: 2,
    };
    const s = migrate(raw, T0, TZ);
    expect(s.arena.gear.move).toEqual({ weapon: 'moonlit_pike', armor: null, charm: 'knotted_cord' });
    expect(s.arena.gear.outside).toEqual({ weapon: null, armor: null, charm: null }); // the rare item is already worn by Move
    expect(s.arena.stash).toEqual(['ladle_of_ages']);
    expect(s.arena.training).toMatchObject({ move: 6, outside: 0, clean: 0 });
    expect(s.arena.trainingWeek.spent).toBe(0);
    expect(s.arena.trainingWeek.bumps).toBe(1000);
    expect(s.arena.decor).toEqual(['sprinting_umbrella']);
    expect(s.arena.defense).toEqual({ period: 2, amount: 6 });
    expect(s.arena.run).toBeNull(); // playing without a game cannot be resumed
    expect(s.arena.log).toHaveLength(1);
    expect(s.arena.log[0]).toMatchObject({ id: 'r8', end: 'lost', wins: 3, itemId: null });
    expect(s.arena.log[0]!.games).toEqual([{ gameId: 'a', room: 0, result: 'won', score: 1000, coins: 3 }]);
    expect(s.arena.stats).toEqual({ runs: 0, gamesWon: 0, gamesLost: 0, bestChain: 10, coinsBanked: 0 });
    expect(s.arena.today).toEqual({ day: 0, runs: 7 });
    expect(s.arena.requests.map((r) => [r.id, r.text.length, r.source])).toEqual([
      ['q1', 8, 'text'],
      ['q5', 400, 'voice'],
    ]);
    expect(s.arena.nextSeq).toBe(9); // above every stored id (r8)
    // Idempotent: a second pass changes nothing.
    expect(migrate(JSON.parse(exportSave(s)), T0, TZ)).toEqual(s);
  });

  it('rebuilds a run it can trust and drops buffs it does not know', () => {
    const raw = createNewSave(T0, 'Run', TZ) as unknown as Record<string, unknown>;
    raw.arena = {
      run: {
        id: 'r4',
        seed: 7,
        ring: 99,
        fee: 20,
        phase: 'decide',
        room: 2,
        buffs: [
          { id: 'attack-s@0', kind: 'attack', amount: 9999 },
          { id: 'zzz@1', kind: 'attack', amount: 5 },
          { id: 'luck-s@1', kind: 'attack', amount: 10 },
        ],
        pending: { coins: 30, wins: 2 },
        offers: [{ id: 'time-s@1', kind: 'time', amount: 10 }],
        current: { gameId: 'alpha', seed: 1, roomIndex: 1, difficulty: 3 },
      },
    };
    const run = migrate(raw, T0, TZ).arena.run!;
    expect(run.phase).toBe('decide');
    expect(run.ring).toBe(7);
    expect(run.buffs).toEqual([{ id: 'attack-s@0', kind: 'attack', amount: 10 }]); // the amount comes from the content, never from the file
    expect(run.offers).toEqual([]); // offers only exist in the lottery phase
    expect(run.current).toBeNull(); // a game only exists while playing
    expect(run.pending).toEqual({ coins: 30, wins: 2 });
  });

  it('a lottery run without offers cannot be resumed', () => {
    const raw = createNewSave(T0, 'Run', TZ) as unknown as Record<string, unknown>;
    raw.arena = { run: { id: 'r1', phase: 'lottery', offers: [] } };
    expect(migrate(raw, T0, TZ).arena.run).toBeNull();
  });
});
