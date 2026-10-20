import { describe, expect, it } from 'vitest';
import {
  applyRunOutcome,
  bankRun,
  buildParty,
  buyGear,
  buyTraining,
  drawLotteryOptions,
  entryFee,
  expectedDailyCoins,
  maxTrainingSpendPerPeriod,
  pickLotteryBuff,
  pickNextGame,
  startRun,
  submitArenaRequest,
  typicalDayCoins,
} from './index';
import { createNewSave, migrate, exportSave, SAVE_VERSION } from '../save';
import { deepFreeze, fresh, T0, TZ } from '../testUtils';
import { waveDefense } from '../wave';
import { clone } from '../draft';

describe('arena economy proof', () => {
  it('computes typical days from questRewards and Steady 90% can afford a run every two days', () => {
    const typical = typicalDayCoins('steady');
    const daily90 = expectedDailyCoins('steady', 0.9);
    expect(typical).toBeGreaterThan(0);
    expect(daily90).toBe(typical * 0.9);
    for (const ring of [1, 2, 3, 4, 5, 6, 7] as const) {
      const fee = entryFee(ring);
      expect(fee).toBeGreaterThan(0);
      expect(fee).toBeLessThanOrEqual(Math.round(typical));
      expect(daily90 * 2).toBeGreaterThanOrEqual(fee);
    }
  });

  it('weekly training spend cap is at most 25% of what habits give', () => {
    const habitWeek = typicalDayCoins('steady') * 7;
    const cap = maxTrainingSpendPerPeriod('steady');
    expect(cap).toBe(Math.floor(habitWeek * 0.25));
    expect(cap).toBeLessThanOrEqual(habitWeek * 0.25);
  });
});

describe('arena run loop', () => {
  it('refuses a run when short of coins and does not mutate the input', () => {
    const broke = fresh();
    broke.player.coins = 0;
    const snapshot = clone(broke);
    const r = startRun(broke, T0, TZ);
    expect(r.error).toBe('arena.shortCoins');
    expect(r.save).toBe(broke);
    expect(broke).toEqual(snapshot);
  });

  it('lottery is deterministic from the run seed and draws three unique ids', () => {
    const a = drawLotteryOptions(42, 1);
    const b = drawLotteryOptions(42, 1);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a).toHaveLength(3);
    expect(new Set(a.map((x) => x.id)).size).toBe(3);
    expect(drawLotteryOptions(7, 1).map((x) => x.id)).not.toEqual(a.map((x) => x.id));
  });

  it('loss clears buffs and pending score but keeps purchased gear and earlier banked defense', () => {
    let save = fresh();
    save.player.coins = 500;
    save.arena.waveBoost = { bonus: 4, forWeekIndex: save.week.index };
    save = buyGear(save, 'move', 'practice-blade', T0, TZ).save;
    const dp = save.player.domainPoints;
    save = startRun(save, T0, TZ).save;
    save = applyRunOutcome(save, { gameId: 'sample', result: 'won', score: 400 }, T0, TZ).save;
    save = pickLotteryBuff(save, save.arena.activeRun!.lotteryChoice![0]!).save;
    expect(save.arena.activeRun!.buffs.length).toBe(1);
    save = applyRunOutcome(save, { gameId: 'sample', result: 'lost', score: 0 }, T0, TZ).save;
    expect(save.arena.activeRun).toBeNull();
    expect(save.arena.gear.move[0]).toBe('practice-blade');
    expect(save.arena.waveBoost).toEqual({ bonus: 4, forWeekIndex: 0 });
    expect(save.player.domainPoints).toBe(dp);
  });

  it('fled is homecoming: buffs gone, kit kept', () => {
    let save = fresh();
    save.player.coins = 500;
    save = buyGear(save, 'move', 'practice-blade', T0, TZ).save;
    save = startRun(save, T0, TZ).save;
    save = applyRunOutcome(save, { gameId: 'sample', result: 'fled', score: 0 }, T0, TZ).save;
    expect(save.arena.activeRun).toBeNull();
    expect(save.arena.gear.move[0]).toBe('practice-blade');
  });

  it('banking converts pending score to coins and never awards Domain Points', () => {
    let save = fresh();
    save.player.coins = 500;
    const dp = save.player.domainPoints;
    save = startRun(save, T0, TZ).save;
    save = applyRunOutcome(save, { gameId: 'sample', result: 'won', score: 500 }, T0, TZ).save;
    save = pickLotteryBuff(save, save.arena.activeRun!.lotteryChoice![0]!).save;
    const before = save.player.coins;
    save = bankRun(save, 'coins', T0, TZ).save;
    expect(save.player.coins).toBeGreaterThan(before);
    expect(save.arena.activeRun).toBeNull();
    expect(save.player.domainPoints).toBe(dp);
  });

  it('banking defense writes the arena wave term', () => {
    let save = fresh();
    save.player.coins = 500;
    save = startRun(save, T0, TZ).save;
    save = applyRunOutcome(save, { gameId: 'sample', result: 'won', score: 800 }, T0, TZ).save;
    save = pickLotteryBuff(save, save.arena.activeRun!.lotteryChoice![0]!).save;
    save = bankRun(save, 'defense', T0, TZ).save;
    expect(save.arena.waveBoost.bonus).toBeGreaterThan(0);
    expect(save.arena.waveBoost.forWeekIndex).toBe(save.week.index);
    expect(waveDefense(save).breakdown.arena).toBe(save.arena.waveBoost.bonus);
  });

  it('never picks the same game twice in a row when alternatives exist, and respects minRing', () => {
    const eligible = [
      { id: 'a', minRing: 1 },
      { id: 'b', minRing: 1 },
      { id: 'c', minRing: 5 },
    ];
    for (let i = 0; i < 20; i++) {
      const next = pickNextGame('a', eligible, 99, i, 1);
      expect(next).not.toBe('a');
      expect(next).not.toBe('c');
    }
    expect(pickNextGame(null, eligible, 1, 0, 1)).not.toBe('c');
    expect(pickNextGame(null, [], 1, 0)).toBeNull();
  });
});

describe('armory and party', () => {
  it('training respects the weekly cap', () => {
    let save = fresh();
    save.player.coins = 10_000;
    const cap = maxTrainingSpendPerPeriod(save.settings.difficulty);
    const habits = ['move', 'outside', 'clean', 'social', 'study', 'sleep', 'eat', 'hygiene'] as const;
    let hitCap = false;
    for (let i = 0; i < 80; i++) {
      const r = buyTraining(save, habits[i % habits.length]!, T0, TZ);
      if (r.error === 'arena.trainingCap') {
        hitCap = true;
        break;
      }
      if (r.error) continue;
      save = r.save;
    }
    expect(hitCap).toBe(true);
    expect(save.arena.trainingCoinsThisPeriod).toBeLessThanOrEqual(cap);
  });

  it('gear and training raise power and traits within contract ranges', () => {
    let save = fresh();
    save.player.coins = 500;
    save.vassals.move.level = 10;
    save.vassals.move.loyalty = 80;
    save.titles = [{ titleId: 'pathfinder', earnedAt: T0, habit: 'move' }];
    const before = buildParty(save).members.find((m) => m.id === 'move')!;
    save = buyGear(save, 'move', 'ledger-rapier', T0, TZ).save;
    save = buyTraining(save, 'move', T0, TZ).save;
    const after = buildParty(save).members.find((m) => m.id === 'move')!;
    expect(after.power).toBeGreaterThan(before.power);
    expect(after.power).toBeGreaterThanOrEqual(1);
    expect(after.power).toBeLessThanOrEqual(100);
    expect(after.traits).toContain('pathfinder');
    expect(after.traits).toContain('arena_blade_3');
  });

  it('does not mutate the input save', () => {
    const save = deepFreeze(fresh());
    const coins = save.player.coins;
    startRun(save, T0, TZ);
    submitArenaRequest(save, 'Chess but cozy', T0, TZ);
    buyGear(save, 'move', 'practice-blade', T0, TZ);
    expect(save.player.coins).toBe(coins);
    expect(save.arena.activeRun).toBeNull();
  });
});

describe('requests', () => {
  it('trims, caps the request log, and refuses empty text', () => {
    let save = fresh();
    expect(submitArenaRequest(save, '   ', T0, TZ).error).toBe('arena.requestEmpty');
    for (let i = 0; i < 25; i++) {
      save = submitArenaRequest(save, `idea ${i}`, T0 + i, { ...TZ, source: 'text' }).save;
    }
    expect(save.arena.requests.length).toBeLessThanOrEqual(20);
    expect(save.arena.requests.at(-1)?.source).toBe('text');
  });
});

describe('save migration v5', () => {
  it('migrates v4 saves with default arena state', () => {
    const v4 = createNewSave(T0, 'Legacy', TZ);
    const raw = JSON.parse(exportSave(v4)) as Record<string, unknown>;
    raw.version = 4;
    delete raw.arena;
    const s = migrate(raw, T0, TZ);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.arena.activeRun).toBeNull();
    expect(s.arena.gear.move).toEqual([null, null, null]);
  });

  it('v2 and v3 saves also receive an empty arena', () => {
    const v2 = migrate({ version: 2, player: {}, settings: {}, vassals: {}, utilities: {} }, T0, TZ);
    expect(v2.version).toBe(5);
    expect(v2.arena.totalRuns).toBe(0);
    const v3raw = createNewSave(T0, 'Mapless', TZ) as unknown as Record<string, unknown>;
    delete v3raw.map;
    delete v3raw.arena;
    v3raw.version = 3;
    const v3 = migrate(v3raw, T0, TZ);
    expect(v3.arena.activeRun).toBeNull();
  });

  it('arena wave boost adds to defense breakdown', () => {
    const save = fresh();
    save.arena.waveBoost = { bonus: 4, forWeekIndex: save.week.index };
    const d = waveDefense(save);
    expect(d.breakdown.arena).toBe(4);
    expect(d.total).toBeGreaterThanOrEqual(4);
  });
});
