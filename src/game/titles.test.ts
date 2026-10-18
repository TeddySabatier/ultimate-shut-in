import { describe, expect, it } from 'vitest';
import {
  evaluateTitles,
  hasTitle,
  titleCoinMult,
  titleComboPower,
  titleDefenseFlat,
  titleDpMult,
  titleLoyaltyFlat,
  titleUtilityDecayMult,
  titleXpMult,
} from './titles';
import { titles } from './content';
import { fresh, T0, TZ } from './testUtils';
import { gameDayIndex } from './time';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

describe('title conditions', () => {
  it('earns nothing on a fresh save', () => {
    expect(evaluateTitles(fresh(), T0).save.titles).toEqual([]);
  });

  it('evaluates every condition kind', () => {
    const save = fresh();
    save.stats.questsTotal = 100;
    save.stats.questsByHabit.move = 60;
    save.stats.questDaysTotal = 90;
    save.stats.questDayStreak = 7;
    save.vassals.eat.loyalty = 80;
    for (const h of ['move', 'outside', 'clean', 'social', 'study', 'sleep', 'hygiene'] as const) save.vassals[h].loyalty = 60;
    save.utilities.power.fullStreakDays = 7;
    save.stats.waveWins = 4;
    save.stats.decisiveStreak = 3;
    save.player.ring = 3;
    save.stats.combosForged = 10;
    save.stats.resurrectionsUsed = 1;
    save.stats.reRecruitments = 1;
    const { save: next, events } = evaluateTitles(save, T0, DAY0);
    const ids = next.titles.map((t) => t.titleId).sort();
    expect(ids).toEqual(
      [
        'first_vassal',
        'seven_days',
        'thirty_days',
        'long_season',
        'hundred_quests',
        'pathfinder',
        'keeper_of_lights',
        'wall_holder',
        'decisive',
        'cartographer',
        'smith_of_odd_things',
        'full_table',
        'returned',
        're_recruiter',
      ].sort(),
    );
    expect(next.titles.find((t) => t.titleId === 'first_vassal')?.habit).toBe('eat');
    expect(events.filter((e) => e.type === 'titleEarned')).toHaveLength(14);
    expect(next.log.length).toBe(14);
    // Second pass earns nothing new.
    expect(evaluateTitles(next, T0, DAY0).events).toEqual([]);
    expect(save.titles).toEqual([]);
  });

  it('Full Table only looks at enabled vassals and needs at least one', () => {
    const save = fresh({ settings: { enabledHabits: ['move'] } });
    save.vassals.move.loyalty = 60;
    expect(hasTitle(evaluateTitles(save, T0, DAY0).save, 'full_table')).toBe(true);
    const none = fresh({ settings: { enabledHabits: ['move'] } });
    none.settings.enabledHabits = [];
    expect(hasTitle(evaluateTitles(none, T0, DAY0).save, 'full_table')).toBe(false);
  });

  it('never revokes once earned even if the condition no longer holds', () => {
    const save = fresh();
    save.stats.questDayStreak = 7;
    let next = evaluateTitles(save, T0, DAY0).save;
    expect(hasTitle(next, 'seven_days')).toBe(true);
    next.stats.questDayStreak = 0;
    next = evaluateTitles(next, T0, DAY0).save;
    expect(hasTitle(next, 'seven_days')).toBe(true);
  });
});

describe('title effects', () => {
  it('sums and caps XP multipliers per scope', () => {
    const save = fresh();
    save.titles = [
      { titleId: 'seven_days', earnedAt: T0 }, // +3% all
      { titleId: 'long_season', earnedAt: T0 }, // +5% all
      { titleId: 'hundred_quests', earnedAt: T0 }, // +5% all
      { titleId: 'returned', earnedAt: T0 }, // +2% all
      { titleId: 'pathfinder', earnedAt: T0 }, // +5% move
      { titleId: 'first_vassal', earnedAt: T0, habit: 'move' }, // +5% move
      { titleId: 'keeper_of_lights', earnedAt: T0 }, // +5% sleep
      { titleId: 'unknown_title', earnedAt: T0 },
    ];
    expect(titleXpMult(save, 'clean')).toBeCloseTo(0.15);
    expect(titleXpMult(save, 'move')).toBeCloseTo(0.2); // 0.25 capped at 0.20
    expect(titleXpMult(save, 'sleep')).toBeCloseTo(0.2);
    save.player.ring = 6;
    expect(titleXpMult(save, 'move')).toBeCloseTo(0.25);
    expect(titleXpMult(save, 'sleep')).toBeCloseTo(0.2);
  });

  it('caps coins, dp and defense and sums the rest', () => {
    const save = fresh();
    save.titles = titles.map((t) => ({ titleId: t.id, earnedAt: T0 }));
    expect(titleCoinMult(save)).toBeCloseTo(0.1);
    expect(titleDpMult(save)).toBeCloseTo(0.05);
    expect(titleDefenseFlat(save)).toBe(6);
    expect(titleUtilityDecayMult(save, 'power')).toBe(0.75);
    expect(titleUtilityDecayMult(fresh(), 'power')).toBe(1);
    expect(titleComboPower(save)).toBe(1);
    expect(titleLoyaltyFlat(save)).toBe(1);
    save.titles = [...save.titles, { titleId: 'wall_holder', earnedAt: T0 }, { titleId: 'wall_holder', earnedAt: T0 }, { titleId: 'wall_holder', earnedAt: T0 }];
    expect(titleDefenseFlat(save)).toBe(12);
  });
});
