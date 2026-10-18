import { describe, expect, it } from 'vitest';
import { applyResurrection, canResurrect, resurrectionOffer } from './resurrection';
import { fresh, T0, TZ } from './testUtils';
import { gameDayIndex } from './time';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

describe('resurrection', () => {
  it('offers nothing on a fresh save', () => {
    const o = resurrectionOffer(fresh(), T0, DAY0, TZ);
    expect(o).toEqual({ price: 500, availableThisMonth: true, affordable: false, streak: null, vassals: [] });
    expect(canResurrect(fresh(), T0, DAY0, TZ)).toBe(false);
    expect(applyResurrection(fresh(), { kind: 'streak' }, T0, DAY0, TZ).error).toMatch(/settlement/);
  });

  it('restores a streak lost within 14 days, once per calendar month', () => {
    const save = fresh();
    save.player.coins = 600;
    save.stats.streakLostOnDay = DAY0 - 3;
    save.stats.streakLostLength = 9;
    save.stats.questDayStreak = 1;
    save.stats.lastQuestDay = DAY0;
    expect(canResurrect(save, T0, DAY0, TZ)).toBe(true);
    const { save: next, events } = applyResurrection(save, { kind: 'streak' }, T0, DAY0, TZ);
    expect(next.player.coins).toBe(100);
    expect(next.player.resurrectionMonth).toBe('2026-01');
    expect(next.stats.questDayStreak).toBe(10);
    expect(next.stats.bestQuestDayStreak).toBe(10);
    expect(next.stats.lastQuestDay).toBe(DAY0);
    expect(next.stats.streakLostOnDay).toBeNull();
    expect(next.stats.resurrectionsUsed).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['resurrectionUsed', 'titleEarned', 'titleEarned']);
    expect(next.titles.map((t) => t.titleId).sort()).toEqual(['returned', 'seven_days']);
    // Same month again: unavailable.
    next.player.coins = 600;
    next.stats.streakLostOnDay = DAY0;
    next.stats.streakLostLength = 4;
    next.stats.questDayStreak = 0;
    expect(applyResurrection(next, { kind: 'streak' }, T0, DAY0, TZ).error).toMatch(/used this month/);
    expect(canResurrect(next, T0, DAY0, TZ)).toBe(false);
    // Next month it is back (for a streak lost inside the window).
    next.stats.streakLostOnDay = DAY0 + 20;
    const feb = Date.UTC(2026, 1, 2, 12);
    const r = applyResurrection(next, { kind: 'streak' }, feb, DAY0 + 28, TZ);
    expect(r.error).toBeUndefined();
    expect(r.save.player.resurrectionMonth).toBe('2026-02');
    expect(r.save.stats.questDayStreak).toBe(4);
    expect(r.save.stats.lastQuestDay).toBe(DAY0 + 27);
  });

  it('does not offer a streak older than 14 days or one already rebuilt', () => {
    const save = fresh();
    save.player.coins = 600;
    save.stats.streakLostOnDay = DAY0 - 15;
    save.stats.streakLostLength = 5;
    expect(resurrectionOffer(save, T0, DAY0, TZ).streak).toBeNull();
    save.stats.streakLostOnDay = DAY0 - 14;
    expect(resurrectionOffer(save, T0, DAY0, TZ).streak).toEqual({ length: 5, lostOnDay: DAY0 - 14 });
    save.stats.questDayStreak = 5;
    expect(resurrectionOffer(save, T0, DAY0, TZ).streak).toBeNull();
    expect(applyResurrection(save, { kind: 'streak' }, T0, DAY0, TZ).error).toMatch(/Nothing to restore/);
  });

  it('brings back an away vassal at loyalty 50 minimum, 450 at ring 5', () => {
    const save = fresh({ settings: { benevolence: 'strict' } });
    save.player.coins = 450;
    save.player.domainPoints = 1200;
    save.player.ring = 5;
    save.vassals.sleep.away = true;
    save.vassals.sleep.loyalty = 0;
    const offer = resurrectionOffer(save, T0, DAY0, TZ);
    expect(offer.price).toBe(450);
    expect(offer.vassals).toEqual(['sleep']);
    expect(applyResurrection(save, { kind: 'vassal', habit: 'move' }, T0, DAY0, TZ).error).toMatch(/Nothing to restore/);
    const { save: next, events } = applyResurrection(save, { kind: 'vassal', habit: 'sleep' }, T0, DAY0, TZ);
    expect(next.vassals.sleep).toMatchObject({ away: false, loyalty: 50, lastActiveDay: DAY0 });
    expect(next.player.coins).toBe(0);
    expect(events[0]).toEqual({ type: 'resurrectionUsed', restored: 'vassal', habit: 'sleep' });
    expect(next.log.some((l) => l.kind === 'resurrection')).toBe(true);
  });
});
