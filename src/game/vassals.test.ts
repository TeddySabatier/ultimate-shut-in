import { describe, expect, it } from 'vitest';
import { activeVassals, decayLoyalty, gainLoyaltyDraft, markActiveDraft, revertLoyaltyDraft, vassalName, waitingLine } from './vassals';
import { reRecruitVassal } from './recruit';
import { fresh, T0, TZ } from './testUtils';
import { gameDayIndex } from './time';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

describe('loyalty gain', () => {
  it('clamps at 100 and reports the applied amount', () => {
    const v = fresh().vassals.move;
    expect(gainLoyaltyDraft(v, 6)).toBe(6);
    v.loyalty = 97;
    expect(gainLoyaltyDraft(v, 6)).toBe(3);
    expect(v.loyalty).toBe(100);
    revertLoyaltyDraft(v, 3);
    expect(v.loyalty).toBe(97);
    revertLoyaltyDraft(v, 500);
    expect(v.loyalty).toBe(0);
  });
});

describe('trust', () => {
  it('rises once per distinct day, capped at 7', () => {
    const v = fresh().vassals.move;
    markActiveDraft(v, DAY0);
    markActiveDraft(v, DAY0);
    expect(v.trust).toBe(1);
    for (let d = 1; d < 12; d++) markActiveDraft(v, DAY0 + d);
    expect(v.trust).toBe(7);
    expect(v.lastActiveDay).toBe(DAY0 + 11);
    markActiveDraft(v, DAY0 + 3); // earlier day: ignored
    expect(v.lastActiveDay).toBe(DAY0 + 11);
  });
});

describe('loyalty decay', () => {
  it('gives one grace day: no decay on the first boundary, decay on the second', () => {
    const save = fresh();
    const first = decayLoyalty(save, DAY0, T0).save;
    expect(first.vassals.move.loyalty).toBe(50);
    const second = decayLoyalty(first, DAY0 + 1, T0).save;
    expect(second.vassals.move.loyalty).toBe(47);
    expect(second.vassals.hygiene.loyalty).toBe(47);
  });

  it('spares a vassal active on the day that ended or the day before', () => {
    const save = fresh();
    save.vassals.move.lastActiveDay = DAY0 + 4;
    save.vassals.clean.lastActiveDay = DAY0 + 5;
    save.vassals.study.lastActiveDay = DAY0 + 3;
    const next = decayLoyalty(save, DAY0 + 5, T0).save;
    expect(next.vassals.move.loyalty).toBe(50); // active yesterday: grace
    expect(next.vassals.clean.loyalty).toBe(50); // active today
    expect(next.vassals.study.loyalty).toBe(47);
  });

  it('uses the difficulty amount and leaves disabled or away vassals alone', () => {
    const save = fresh({ settings: { difficulty: 'hardcore', enabledHabits: ['move', 'clean'] } });
    save.vassals.clean.away = true;
    const next = decayLoyalty(save, DAY0 + 3, T0).save;
    expect(next.vassals.move.loyalty).toBe(45);
    expect(next.vassals.clean.loyalty).toBe(50);
    expect(next.vassals.study.loyalty).toBe(50);
  });

  it('Benevolent floors at 1 and nobody leaves', () => {
    const save = fresh({ settings: { difficulty: 'gentle' } });
    save.vassals.move.loyalty = 2;
    let next = decayLoyalty(save, DAY0 + 3, T0);
    expect(next.save.vassals.move.loyalty).toBe(1);
    expect(next.save.vassals.move.away).toBe(false);
    expect(next.events).toEqual([]);
    next = decayLoyalty(next.save, DAY0 + 4, T0);
    expect(next.save.vassals.move.loyalty).toBe(1);
    expect(waitingLine('move', DAY0)).toContain('Pell');
  });

  it('Strict lets loyalty reach 0 and the vassal goes away', () => {
    const save = fresh({ settings: { difficulty: 'gentle', benevolence: 'strict' } });
    save.vassals.move.loyalty = 2;
    save.vassals.move.trust = 3;
    const { save: next, events } = decayLoyalty(save, DAY0 + 3, T0);
    expect(next.vassals.move.loyalty).toBe(0);
    expect(next.vassals.move.away).toBe(true);
    expect(next.vassals.move.trust).toBe(0);
    expect(events).toEqual([{ type: 'vassalLeft', habit: 'move' }]);
    expect(next.log.at(-1)?.kind).toBe('vassalLeft');
    expect(activeVassals(next).map((v) => v.habit)).not.toContain('move');
    // Away vassals do not decay further.
    const again = decayLoyalty(next, DAY0 + 4, T0);
    expect(again.events).toEqual([]);
  });

  it('from 50 a fully ignored Steady vassal leaves after 18 days counting the grace day', () => {
    let save = fresh({ settings: { benevolence: 'strict' } });
    let leftOn: number | null = null;
    for (let d = 0; d < 30 && leftOn === null; d++) {
      const r = decayLoyalty(save, DAY0 + d, T0);
      save = r.save;
      if (r.events.some((e) => e.type === 'vassalLeft')) leftOn = d + 1;
    }
    expect(leftOn).toBe(18);
  });
});

describe('reRecruitVassal', () => {
  it('brings an away vassal back at 50 for free, keeping level and history', () => {
    const save = fresh({ settings: { benevolence: 'strict' } });
    save.vassals.move.away = true;
    save.vassals.move.loyalty = 0;
    save.vassals.move.level = 4;
    save.vassals.move.lifetimeQuests = 30;
    const { save: next, events } = reRecruitVassal(save, 'move', T0, DAY0 + 9);
    expect(next.vassals.move).toMatchObject({ away: false, loyalty: 50, level: 4, lifetimeQuests: 30, lastActiveDay: DAY0 + 9 });
    expect(next.stats.reRecruitments).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['vassalReturned', 'titleEarned']);
    expect(next.titles[0]?.titleId).toBe('re_recruiter');
    expect(next.player.coins).toBe(0);
    expect(vassalName('move')).toBe('Pell');
  });

  it('welcome gift costs 30 and returns at 70', () => {
    const save = fresh({ settings: { benevolence: 'strict' } });
    save.vassals.eat.away = true;
    expect(reRecruitVassal(save, 'eat', T0, DAY0, true).error).toMatch(/settlement/);
    save.player.coins = 40;
    const next = reRecruitVassal(save, 'eat', T0, DAY0, true).save;
    expect(next.vassals.eat.loyalty).toBe(70);
    expect(next.player.coins).toBe(10);
  });

  it('refuses when the vassal is present', () => {
    const save = fresh();
    expect(reRecruitVassal(save, 'move', T0, DAY0).error).toBeDefined();
  });
});
