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
} from './index';
import { createNewSave, migrate, exportSave, SAVE_VERSION } from '../save';
import { deepFreeze, fresh, T0, TZ } from '../testUtils';
import { waveDefense } from '../wave';

describe('arena economy proof', () => {
  it('steady 90% adherence can afford one run every two days', () => {
    const daily = expectedDailyCoins('steady', 0.9);
    const fee = entryFee(1);
    expect(daily * 2).toBeGreaterThanOrEqual(fee);
    expect(fee).toBeLessThanOrEqual(Math.round(daily));
  });

  it('weekly training spend cap is at most 25% of habit coins', () => {
    const habitWeek = expectedDailyCoins('steady', 0.9) * 7;
    const cap = maxTrainingSpendPerPeriod('steady', 0.9);
    expect(cap).toBeLessThanOrEqual(Math.floor(habitWeek * 0.25));
  });
});

describe('arena run loop', () => {
  it('refuses a run when short of coins', () => {
    const broke = fresh();
    broke.player.coins = 0;
    const r = startRun(broke, T0, TZ);
    expect(r.error).toBe('arena.shortCoins');
    expect(r.save).toBe(broke);
  });

  it('lottery is deterministic from the run seed', () => {
    const a = drawLotteryOptions(42, 1);
    const b = drawLotteryOptions(42, 1);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a).toHaveLength(3);
  });

  it('loss clears buffs and pending score but keeps purchased gear', () => {
    let save = fresh();
    save.player.coins = 500;
    save = buyGear(save, 'move', 'practice-blade', T0, TZ).save;
    save = startRun(save, T0, TZ).save;
    save = applyRunOutcome(save, { gameId: 'sample', result: 'won', score: 400 }, T0, TZ).save;
    save = pickLotteryBuff(save, save.arena.activeRun!.lotteryChoice![0]!).save;
    expect(save.arena.activeRun!.buffs.length).toBe(1);
    save = applyRunOutcome(save, { gameId: 'sample', result: 'lost', score: 0 }, T0, TZ).save;
    expect(save.arena.activeRun).toBeNull();
    expect(save.arena.gear.move[0]).toBe('practice-blade');
  });

  it('banking converts pending score to coins', () => {
    let save = fresh();
    save.player.coins = 500;
    save = startRun(save, T0, TZ).save;
    save = applyRunOutcome(save, { gameId: 'sample', result: 'won', score: 500 }, T0, TZ).save;
    save = pickLotteryBuff(save, save.arena.activeRun!.lotteryChoice![0]!).save;
    const before = save.player.coins;
    save = bankRun(save, 'coins', T0, TZ).save;
    expect(save.player.coins).toBeGreaterThan(before);
    expect(save.arena.activeRun).toBeNull();
  });

  it('never picks the same game twice in a row when alternatives exist', () => {
    const eligible = [
      { id: 'a', minRing: 1 },
      { id: 'b', minRing: 1 },
      { id: 'c', minRing: 1 },
    ];
    for (let i = 0; i < 20; i++) {
      const next = pickNextGame('a', eligible, 99, i);
      expect(next).not.toBe('a');
    }
  });
});

describe('armory and party', () => {
  it('training respects the weekly cap', () => {
    let save = fresh();
    save.player.coins = 10_000;
    const cap = maxTrainingSpendPerPeriod(save.settings.difficulty, 0.9);
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

  it('gear and training raise power within 1..100', () => {
    let save = fresh();
    save.player.coins = 500;
    save.vassals.move.level = 10;
    save.vassals.move.loyalty = 80;
    const base = buildParty(save).members[0]!.power;
    save = buyGear(save, 'move', 'ledger-rapier', T0, TZ).save;
    save = buyTraining(save, 'move', T0, TZ).save;
    const after = buildParty(save).members[0]!.power;
    expect(after).toBeGreaterThan(base);
    expect(after).toBeLessThanOrEqual(100);
  });

  it('does not mutate the input save', () => {
    const save = deepFreeze(fresh());
    startRun(save, T0, TZ);
    submitArenaRequest(save, 'Chess but cozy', T0, TZ);
  });
});

describe('requests', () => {
  it('trims and caps the request log', () => {
    let save = fresh();
    for (let i = 0; i < 25; i++) {
      save = submitArenaRequest(save, `idea ${i}`, T0 + i, TZ).save;
    }
    expect(save.arena.requests.length).toBeLessThanOrEqual(20);
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

  it('arena wave boost adds to defense breakdown', () => {
    const save = fresh();
    save.arena.waveBoost = { bonus: 4, forWeekIndex: save.week.index };
    const d = waveDefense(save);
    expect(d.breakdown.arena).toBe(4);
    expect(d.total).toBeGreaterThanOrEqual(4);
  });
});
