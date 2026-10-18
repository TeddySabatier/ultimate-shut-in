import { describe, expect, it } from 'vitest';
import { MONSTERS, classifyWave, monsterForWave, settleWave, vassalTitle, waveAttack, waveDefense, waveDpAward } from './wave';
import { fresh, T0, TZ } from './testUtils';
import { gameDayIndex } from './time';
import { HABIT_IDS } from './types';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

describe('wave formulas', () => {
  it('attack matches the GDD examples and caps the week term at 52', () => {
    expect(waveAttack(1, 1, 'steady')).toBe(18);
    expect(waveAttack(10, 3, 'steady')).toBe(64);
    expect(waveAttack(26, 5, 'hardcore')).toBe(155);
    expect(waveAttack(52, 7, 'gentle')).toBe(163);
    expect(waveAttack(90, 7, 'gentle')).toBe(163);
  });

  it('defense sums vassals, trust, walls, combos, titles and well-kept', () => {
    const save = fresh();
    save.vassals.move.level = 3;
    save.vassals.move.trust = 4;
    save.vassals.clean.trust = 1;
    save.vassals.study.away = true;
    save.vassals.study.trust = 7;
    save.settings.enabledHabits = ['move', 'clean', 'study'];
    save.combos = [
      { comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 },
      { comboId: 'tandem_kettlebell', power: 5, forgedDay: DAY0 },
    ];
    save.titles = [
      { titleId: 'wall_holder', earnedAt: T0 },
      { titleId: 'decisive', earnedAt: T0 },
    ];
    const d = waveDefense(save);
    expect(d.breakdown).toEqual({ vassals: 4, trust: 10, walls: 5, combos: 9, titles: 6, wellKept: 5 });
    expect(d.total).toBe(39);
    expect(d.vassals.map((v) => v.habit)).toEqual(['move', 'clean']);
    expect(d.combos[0]?.name).toBe('Tandem Kettlebell');
  });

  it('counts at most 6 combo items, highest first', () => {
    const save = fresh();
    save.combos = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ comboId: `sprinting_umbrella${id}`, power: i + 1, forgedDay: DAY0 }));
    const d = waveDefense(save);
    expect(d.breakdown.combos).toBe(7 + 6 + 5 + 4 + 3 + 2);
  });

  it('classifies and awards DP with the title multiplier', () => {
    expect(classifyWave(20, 30)).toBe('decisive');
    expect(classifyWave(20, 29)).toBe('win');
    expect(classifyWave(20, 20)).toBe('win');
    expect(classifyWave(20, 19)).toBe('loss');
    expect(waveDpAward('decisive', 0)).toBe(22);
    expect(waveDpAward('win', 0.05)).toBe(16);
    expect(waveDpAward('loss', 0)).toBe(5);
    expect(waveDpAward('quiet', 0.1)).toBe(0);
  });

  it('picks a seeded monster and the Static every tenth week', () => {
    expect(monsterForWave(10, 1).id).toBe('the-static');
    expect(monsterForWave(3, 1)).toEqual(monsterForWave(3, 1));
    expect(monsterForWave(3, 1).boss).toBeUndefined();
    expect(MONSTERS).toHaveLength(10);
    expect(vassalTitle('move')).toBe('Pell the Runner');
  });
});

describe('settleWave', () => {
  it('resolves a quiet week when nobody had trust', () => {
    const save = fresh();
    save.combos = [{ comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 }];
    const { save: next, events } = settleWave(save, 0, T0, DAY0 + 7);
    const rec = next.week.history[0]!;
    expect(rec.result).toBe('quiet');
    expect(rec.dpAwarded).toBe(0);
    expect(rec.attack).toBe(0);
    expect(rec.log).toHaveLength(1);
    expect(next.week.index).toBe(1);
    expect(next.combos).toEqual([]);
    expect(next.stats.waveWins + next.stats.waveLosses).toBe(0);
    expect(events[0]?.type).toBe('waveSettled');
    expect(save.week.history).toEqual([]); // input untouched
  });

  it('resolves a loss, keeps everything, resets trust and clears combos', () => {
    const save = fresh({ settings: { difficulty: 'hardcore' } });
    save.vassals.move.trust = 1;
    save.player.domainPoints = 10;
    save.stats.decisiveStreak = 2;
    save.combos = [{ comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 }];
    const { save: next } = settleWave(save, 0, T0, DAY0 + 7);
    const rec = next.week.history[0]!;
    // attack round(18 * 1.25) = 23; defense 8 levels + 2 trust + 5 walls + 4 combo + 5 wellKept = 24 -> win, actually
    expect(rec.attack).toBe(23);
    expect(rec.defense).toBe(24);
    expect(rec.result).toBe('win');
    // Make it a loss by removing the combo and the well-kept bonus.
    save.combos = [];
    save.utilities.gas.value = 10;
    const loss = settleWave(save, 0, T0, DAY0 + 7).save;
    const lrec = loss.week.history[0]!;
    expect(lrec.result).toBe('loss');
    expect(lrec.dpAwarded).toBe(5);
    expect(loss.player.domainPoints).toBe(15);
    expect(loss.stats.waveLosses).toBe(1);
    expect(loss.stats.decisiveStreak).toBe(0);
    for (const h of HABIT_IDS) expect(loss.vassals[h].trust).toBe(0);
    expect(lrec.log[0]).toMatch(/^Wave 1 reaches The Room: .* Attack 23\.$/);
    expect(lrec.log.at(-1)).toMatch(/^Domain Points \+5\. 15\/120 toward The Flat$/);
    expect(lrec.log.length).toBeGreaterThanOrEqual(4);
  });

  it('resolves a decisive win, tracks the streak, titles and ring unlock', () => {
    const save = fresh({ settings: { difficulty: 'gentle' } });
    for (const h of HABIT_IDS) save.vassals[h].trust = 3;
    save.vassals.move.level = 4;
    save.vassals.outside.trust = 0;
    save.vassals.outside.level = 3;
    save.player.domainPoints = 100;
    save.stats.decisiveStreak = 2;
    save.stats.waveWins = 3;
    save.combos = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ comboId: id, power: i + 1, forgedDay: DAY0 }));
    const { save: next, events } = settleWave(save, 3, T0, DAY0 + 28);
    const rec = next.week.history[0]!;
    expect(rec.index).toBe(3);
    expect(rec.ring).toBe(1);
    expect(rec.result).toBe('decisive');
    expect(rec.dpAwarded).toBe(22);
    expect(next.player.domainPoints).toBe(122);
    expect(next.player.ring).toBe(2);
    expect(next.stats.decisiveStreak).toBe(3);
    expect(next.stats.waveWins).toBe(4);
    const types = events.map((e) => e.type);
    expect(types).toContain('ringUnlocked');
    expect(types.filter((t) => t === 'titleEarned').length).toBe(2); // wall_holder + decisive
    expect(rec.log.some((l) => l.includes('The regulars hold the line. +3'))).toBe(true);
    expect(rec.log.some((l) => l.includes('and 2 other odd things. +3'))).toBe(true);
    expect(rec.log.some((l) => l.startsWith('The walls of The Room hold. +5'))).toBe(true);
    expect(rec.log.some((l) => l.includes('Lights, water and gas all steady. +5'))).toBe(true);
    expect(rec.log.filter((l) => /\+\d+$/.test(l)).length).toBeGreaterThanOrEqual(7);
  });

  it('a win that is not decisive resets the decisive streak and mentions titles', () => {
    const save = fresh();
    save.vassals.move.trust = 7;
    save.vassals.clean.trust = 1;
    save.stats.decisiveStreak = 2;
    save.titles = [{ titleId: 'wall_holder', earnedAt: T0 }];
    save.utilities.power.value = 10;
    // attack 18; defense = 8 + 16 + 5 + 3 = 32 -> 32 >= 27 -> decisive; bump attack with a later week.
    const { save: next } = settleWave(save, 9, T0, DAY0 + 70);
    const rec = next.week.history[0]!;
    expect(rec.attack).toBe(36);
    expect(rec.defense).toBe(32);
    expect(rec.result).toBe('loss');
    const save2 = fresh();
    save2.vassals.move.trust = 7;
    save2.vassals.clean.trust = 7;
    save2.stats.decisiveStreak = 2;
    save2.titles = [{ titleId: 'wall_holder', earnedAt: T0 }];
    save2.utilities.power.value = 10;
    const r2 = settleWave(save2, 9, T0, DAY0 + 70).save;
    const rec2 = r2.week.history[0]!;
    expect(rec2.defense).toBe(44);
    expect(rec2.result).toBe('win');
    expect(r2.stats.decisiveStreak).toBe(0);
    expect(rec2.log.some((l) => l.includes('Old honours count for something. +3'))).toBe(true);
  });

  it('writes the city line at ring 7', () => {
    const save = fresh();
    save.player.domainPoints = 2600;
    save.player.ring = 7;
    save.vassals.move.trust = 1;
    const rec = settleWave(save, 0, T0, DAY0 + 7).save.week.history[0]!;
    expect(rec.log.at(-1)).toContain('The City is registered');
  });
});
