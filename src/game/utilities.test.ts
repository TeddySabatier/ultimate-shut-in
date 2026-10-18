import { describe, expect, it } from 'vitest';
import { TIED_HABIT, decayUtilities, decayUtilitiesDraft, isWellKept, restoreUtility, restoreUtilityDraft, revertUtilityDraft, tiedUtility, utilityState, wellKeptBonus } from './utilities';
import { fresh } from './testUtils';

describe('utilities', () => {
  it('maps habits to utilities', () => {
    expect(TIED_HABIT).toEqual({ power: 'sleep', water: 'hygiene', gas: 'eat' });
    expect(tiedUtility('sleep')).toBe('power');
    expect(tiedUtility('move')).toBeNull();
  });

  it('classifies states', () => {
    expect(utilityState(100)).toBe('bright');
    expect(utilityState(70)).toBe('bright');
    expect(utilityState(69)).toBe('flickering');
    expect(utilityState(40)).toBe('flickering');
    expect(utilityState(39)).toBe('dim');
    expect(utilityState(1)).toBe('dim');
    expect(utilityState(0)).toBe('out');
  });

  it('restores +25 (+40 for tier 3), caps at 100 and fires once on reaching full', () => {
    const save = fresh();
    save.utilities.power.value = 50;
    let r = restoreUtility(save, 'sleep', 1);
    expect(r.save.utilities.power.value).toBe(75);
    expect(r.events).toEqual([]);
    r = restoreUtility(r.save, 'sleep', 3);
    expect(r.save.utilities.power.value).toBe(100);
    expect(r.events).toEqual([{ type: 'utilityRestored', utility: 'power' }]);
    r = restoreUtility(r.save, 'sleep', 1);
    expect(r.events).toEqual([]);
    expect(restoreUtility(save, 'move', 1).save.utilities).toEqual(save.utilities);
    const draft = fresh();
    draft.utilities.water.value = 90;
    const applied = restoreUtilityDraft(draft, 'hygiene', 1);
    expect(applied.applied).toBe(10);
    revertUtilityDraft(draft, 'hygiene', 10);
    expect(draft.utilities.water.value).toBe(90);
    revertUtilityDraft(draft, 'move', 10);
    revertUtilityDraft(draft, 'hygiene', 0);
    expect(draft.utilities.water.value).toBe(90);
  });

  it('decays utilities whose habit was not done, with state-change nudges', () => {
    const save = fresh();
    save.utilities.power.value = 100;
    save.utilities.water.value = 75;
    save.utilities.gas.value = 45;
    const { save: next, events } = decayUtilities(save, ['sleep']);
    expect(next.utilities.power.value).toBe(100);
    expect(next.utilities.power.fullStreakDays).toBe(1);
    expect(next.utilities.water.value).toBe(60);
    expect(next.utilities.gas.value).toBe(30);
    expect(events).toEqual([
      { type: 'utilityDegraded', utility: 'water', state: 'flickering' },
      { type: 'utilityDegraded', utility: 'gas', state: 'dim' },
    ]);
    const again = decayUtilities(next, []);
    expect(again.save.utilities.power.value).toBe(85);
    expect(again.save.utilities.power.fullStreakDays).toBe(0);
    expect(again.save.utilities.gas.value).toBe(15);
    expect(again.events).toEqual([]); // dim -> dim: no second nudge
    const out = decayUtilities(again.save, []);
    expect(out.save.utilities.gas.value).toBe(0);
    expect(out.save.utilities.water.value).toBe(30);
    expect(out.events).toEqual([{ type: 'utilityDegraded', utility: 'water', state: 'dim' }]); // gas dim -> out: no extra line
    expect(decayUtilities(out.save, []).save.utilities.gas.value).toBe(0);
  });

  it('a straight drop from bright to dim reads as the dim nudge', () => {
    const save = fresh({ settings: { difficulty: 'hardcore' } });
    save.utilities.gas.value = 55;
    const { save: next, events } = decayUtilities(save, []);
    expect(next.utilities.gas.value).toBe(35);
    expect(events).toEqual([{ type: 'utilityDegraded', utility: 'gas', state: 'dim' }]);
    save.utilities.gas.value = 15;
    expect(decayUtilities(save, []).events).toEqual([]);
  });

  it('freezes the utility of a disabled habit and honours the cap flag', () => {
    const save = fresh({ settings: { enabledHabits: ['move', 'sleep'] } });
    save.utilities.water.value = 60;
    const next = decayUtilities(save, []).save;
    expect(next.utilities.water.value).toBe(60);
    expect(next.utilities.water.fullStreakDays).toBe(0);
    expect(next.utilities.power.value).toBe(85);
    const draft = fresh();
    draft.utilities.gas.value = 50;
    const out = decayUtilitiesDraft(draft, new Set(), new Set(['power', 'water', 'gas']));
    expect(out).toEqual({ events: [], decayed: [] });
    expect(draft.utilities.power.value).toBe(100);
    expect(draft.utilities.power.fullStreakDays).toBe(1);
    const partial = decayUtilitiesDraft(draft, new Set(['sleep']), new Set(['gas']));
    expect(partial.decayed).toEqual(['water']);
    expect(draft.utilities.gas.value).toBe(50);
  });

  it('well-kept needs all three at 70+, +8 with the Courtyard', () => {
    const save = fresh();
    expect(isWellKept(save)).toBe(true);
    expect(wellKeptBonus(save)).toBe(5);
    save.player.ring = 5;
    expect(wellKeptBonus(save)).toBe(8);
    save.utilities.gas.value = 69;
    expect(isWellKept(save)).toBe(false);
    expect(wellKeptBonus(save)).toBe(0);
  });
});
