import { describe, expect, it } from 'vitest';
import { completeQuest, undoQuest } from './board';
import { comboDefense, comboPowerBonus, countedCombos, doneHabitsOnBoard, forgeCombos } from './combos';
import { fresh, setBoard, T0, TZ } from './testUtils';
import { gameDayIndex } from './time';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

function atRing2(): ReturnType<typeof fresh> {
  const save = fresh();
  save.player.domainPoints = 150;
  save.player.ring = 2;
  return save;
}

describe('combos', () => {
  it('does not forge below ring 2', () => {
    let save = setBoard(fresh(), DAY0, ['move.dance', 'outside.errand']);
    save = completeQuest(save, `${DAY0}-move.dance`, T0).save;
    save = completeQuest(save, `${DAY0}-outside.errand`, T0).save;
    expect(save.combos).toEqual([]);
    expect(doneHabitsOnBoard(save)).toEqual(new Set(['move', 'outside']));
    expect(doneHabitsOnBoard(fresh())).toEqual(new Set());
  });

  it('forges a pair item once per period on completion and unforges on undo', () => {
    let save = setBoard(atRing2(), DAY0, ['move.dance', 'outside.errand', 'clean.bed']);
    save = completeQuest(save, `${DAY0}-move.dance`, T0).save;
    expect(save.combos).toEqual([]);
    const r = completeQuest(save, `${DAY0}-outside.errand`, T0);
    expect(r.events).toContainEqual({ type: 'comboForged', comboId: 'sprinting_umbrella', power: 4 });
    expect(r.save.combos).toEqual([{ comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 }]);
    expect(r.save.stats.combosForged).toBe(1);
    expect(r.save.log.at(-1)?.text).toMatch(/^Forged: Sprinting Umbrella/);
    // Clean completes: two more pairs.
    const r2 = completeQuest(r.save, `${DAY0}-clean.bed`, T0);
    expect(r2.save.combos.map((c) => c.comboId).sort()).toEqual(['dustpan_buckler', 'sprinting_umbrella']);
    // Re-running the forge pass forges nothing new.
    expect(forgeCombos(r2.save, DAY0, T0).events).toEqual([]);
    // Undo outside: umbrella breaks, buckler stays.
    const u = undoQuest(r2.save, `${DAY0}-outside.errand`, T0, TZ);
    expect(u.events).toContainEqual({ type: 'comboUnforged', comboId: 'sprinting_umbrella' });
    expect(u.save.combos.map((c) => c.comboId)).toEqual(['dustpan_buckler']);
    expect(u.save.stats.combosForged).toBe(1);
  });

  it('keeps items forged on earlier days through an undo today', () => {
    let save = setBoard(atRing2(), DAY0, ['move.dance']);
    save.combos = [{ comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 - 1 }, { comboId: 'ghost', power: 1, forgedDay: DAY0 }];
    save = completeQuest(save, `${DAY0}-move.dance`, T0).save;
    const u = undoQuest(save, `${DAY0}-move.dance`, T0, TZ).save;
    expect(u.combos.map((c) => c.comboId)).toEqual(['sprinting_umbrella']);
  });

  it('forges The Full Set when all eight habits are done in a day', () => {
    const all = ['move.dance', 'outside.errand', 'clean.bed', 'social.hello', 'study.plan', 'sleep.bedprep', 'eat.veg', 'hygiene.skin'];
    let save = setBoard(atRing2(), DAY0, all);
    for (const id of all) save = completeQuest(save, `${DAY0}-${id}`, T0).save;
    expect(save.combos.some((c) => c.comboId === 'the_full_set')).toBe(true);
    expect(save.combos.length).toBe(18);
    expect(countedCombos(save)).toHaveLength(6);
    // Ten forges earned Smith of Odd Things, so every item carries +1.
    expect(save.titles.some((t) => t.titleId === 'smith_of_odd_things')).toBe(true);
    expect(countedCombos(save)[0]?.power).toBe(13);
    expect(comboDefense(save)).toBe(13 + 5 * 6);
  });

  it('Workshop and Smith add +1 power each at the wave', () => {
    const save = atRing2();
    save.combos = [{ comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 }];
    expect(comboPowerBonus(save)).toBe(0);
    expect(comboDefense(save)).toBe(4);
    save.player.ring = 4;
    expect(comboPowerBonus(save)).toBe(1);
    save.titles = [{ titleId: 'smith_of_odd_things', earnedAt: T0 }];
    expect(comboPowerBonus(save)).toBe(2);
    expect(comboDefense(save)).toBe(6);
    expect(countedCombos(save)[0]?.name).toBe('Sprinting Umbrella');
  });
});
