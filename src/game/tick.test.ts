import { describe, expect, it } from 'vitest';
import { completeQuest, startTimer } from './board';
import { processBoundaries } from './tick';
import { at, deepFreeze, fresh, setBoard, T0, TZ } from './testUtils';
import { gameDayIndex } from './time';
import { HABIT_IDS, type SaveFile } from './types';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

function doneOn(save: SaveFile, day: number, templateIds: string[], now: number): SaveFile {
  let s = setBoard(save, day, templateIds);
  for (const id of templateIds) s = completeQuest(s, `${day}-${id}`, now).save;
  return s;
}

describe('processBoundaries', () => {
  it('issues the first board and is idempotent within the day', () => {
    const save = deepFreeze(fresh());
    const first = processBoundaries(save, T0, TZ);
    expect(first.events).toEqual([{ type: 'boardIssued', day: DAY0 }]);
    expect(first.save.board?.day).toBe(DAY0);
    expect(first.save.board?.quests.length).toBe(4);
    expect(first.save.lastOpenDay).toBe(DAY0);
    const again = processBoundaries(first.save, T0 + 3_600_000, TZ);
    expect(again.events).toEqual([]);
    expect(again.save.board).toEqual(first.save.board);
    expect(save.board).toBeNull();
  });

  it('rolls the day at the reset hour, not at midnight', () => {
    const save = processBoundaries(fresh(), T0, TZ).save;
    expect(processBoundaries(save, at(1, 3, 59), TZ).save.board?.day).toBe(DAY0);
    const next = processBoundaries(save, at(1, 4, 0), TZ);
    expect(next.save.board?.day).toBe(DAY0 + 1);
    expect(next.save.lastOpenDay).toBe(DAY0 + 1);
    expect(next.events.some((e) => e.type === 'catchUp')).toBe(false);
  });

  it('runs one boundary: utilities decay for undone habits, loyalty has a grace day, streak holds', () => {
    let save = setBoard(processBoundaries(fresh(), T0, TZ).save, DAY0, ['sleep.bedprep', 'move.dance', 'move.stretch']);
    save = completeQuest(save, `${DAY0}-sleep.bedprep`, T0).save;
    save = completeQuest(save, `${DAY0}-move.dance`, T0).save;
    save = startTimer(save, `${DAY0}-move.stretch`, T0).save;
    const next = processBoundaries(save, at(1), TZ).save;
    expect(next.board?.day).toBe(DAY0 + 1);
    expect(next.utilities.power.value).toBe(100);
    expect(next.utilities.power.fullStreakDays).toBe(1);
    expect(next.utilities.water.value).toBe(85);
    expect(next.utilities.gas.value).toBe(85);
    for (const h of HABIT_IDS) expect(next.vassals[h].loyalty).toBeGreaterThanOrEqual(50);
    expect(next.stats.questDayStreak).toBe(1);
    expect(next.stats.streakLostOnDay).toBeNull();
    // The day after with nothing done: loyalty decays for everyone idle two days, streak resets quietly (< 3).
    const after = processBoundaries(next, at(2), TZ).save;
    expect(after.vassals.clean.loyalty).toBe(47);
    expect(after.vassals.sleep.loyalty).toBe(56); // active on day 0: grace covers day 1
    expect(after.stats.questDayStreak).toBe(0);
    expect(after.stats.streakLostOnDay).toBeNull();
    const later = processBoundaries(after, at(3), TZ).save;
    expect(later.vassals.sleep.loyalty).toBe(53);
  });

  it('records a lost streak of 3+ for the token', () => {
    let save = processBoundaries(fresh(), T0, TZ).save;
    for (let d = 0; d < 3; d++) {
      save = processBoundaries(save, at(d), TZ).save;
      save = doneOn(save, DAY0 + d, ['clean.bed'], at(d));
    }
    expect(save.stats.questDayStreak).toBe(3);
    const next = processBoundaries(save, at(4), TZ).save;
    expect(next.stats.questDayStreak).toBe(0);
    expect(next.stats.streakLostOnDay).toBe(DAY0 + 4);
    expect(next.stats.streakLostLength).toBe(3);
  });

  it('caps catch-up decay at 7 loyalty days and 3 utility days and resolves absent waves as quiet', () => {
    const save = processBoundaries(fresh(), T0, TZ).save;
    for (const h of HABIT_IDS) save.vassals[h].loyalty = 60;
    save.vassals.move.lastActiveDay = DAY0; // active on the last day: still capped at 7 decays
    const { save: next, events } = processBoundaries(save, at(30), TZ);
    for (const h of HABIT_IDS) expect(next.vassals[h].loyalty).toBe(60 - 3 * 7);
    expect(next.utilities.power.value).toBe(100 - 3 * 15);
    expect(next.utilities.gas.value).toBe(55);
    const waves = events.filter((e) => e.type === 'waveSettled');
    expect(waves).toHaveLength(4);
    for (const w of waves) if (w.type === 'waveSettled') expect(w.record.result).toBe('quiet');
    expect(next.week.index).toBe(4);
    expect(next.week.history.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    expect(next.player.domainPoints).toBe(0);
    expect(events).toContainEqual({ type: 'catchUp', days: 30 });
    expect(next.board?.day).toBe(DAY0 + 30);
    expect(next.lastOpenDay).toBe(DAY0 + 30);
    expect(next.log.some((l) => l.kind === 'catchUp')).toBe(true);
  });

  it('a Gentle Strict absence of 30 days takes at most 14 loyalty and nobody leaves from 20', () => {
    const save = processBoundaries(fresh({ settings: { difficulty: 'gentle', benevolence: 'strict' } }), T0, TZ).save;
    for (const h of HABIT_IDS) save.vassals[h].loyalty = 20;
    const next = processBoundaries(save, at(30), TZ).save;
    for (const h of HABIT_IDS) {
      expect(next.vassals[h].loyalty).toBe(6);
      expect(next.vassals[h].away).toBe(false);
    }
  });

  it('settles an active period normally, then quiet periods during the absence', () => {
    let save = processBoundaries(fresh(), T0, TZ).save;
    for (let d = 0; d < 7; d++) {
      save = processBoundaries(save, at(d), TZ).save;
      save = doneOn(save, DAY0 + d, ['move.dance', 'clean.bed'], at(d));
    }
    expect(save.vassals.move.trust).toBe(7);
    const { save: next, events } = processBoundaries(save, at(21), TZ);
    const waves = events.filter((e) => e.type === 'waveSettled').map((e) => (e.type === 'waveSettled' ? e.record : null));
    expect(waves.map((w) => w?.result)).toEqual(['decisive', 'quiet', 'quiet']);
    expect(waves[0]?.index).toBe(0);
    expect(waves[0]?.attack).toBe(18);
    expect(waves[0]?.defense).toBeGreaterThanOrEqual(18);
    expect(next.stats.waveWins).toBe(1);
    expect(next.vassals.move.trust).toBe(0);
    expect(next.week.index).toBe(3);
  });

  it('settles the wave exactly on the seventh boundary and not before', () => {
    const save = processBoundaries(fresh(), T0, TZ).save;
    save.vassals.move.trust = 2;
    const sixth = processBoundaries(save, at(6), TZ);
    expect(sixth.events.some((e) => e.type === 'waveSettled')).toBe(false);
    const seventh = processBoundaries(sixth.save, at(7), TZ);
    expect(seventh.events.some((e) => e.type === 'waveSettled')).toBe(true);
    expect(seventh.save.week.history[0]?.index).toBe(0);
  });

  it('evaluates titles at the boundary', () => {
    let save = processBoundaries(fresh(), T0, TZ).save;
    save.utilities.power.fullStreakDays = 6;
    save = doneOn(save, DAY0, ['sleep.bedprep'], T0);
    const { save: next, events } = processBoundaries(save, at(1), TZ);
    expect(next.utilities.power.fullStreakDays).toBe(7);
    expect(events).toContainEqual({ type: 'titleEarned', titleId: 'keeper_of_lights' });
  });

  it('handles a reset-hour change: the new board comes at the next boundary', () => {
    const save = processBoundaries(fresh(), T0, TZ).save;
    const changed = { ...save, settings: { ...save.settings, resetHour: 20 } };
    // The current day now runs until 20:00 tomorrow.
    expect(processBoundaries(changed, at(1, 19), TZ).save.board?.day).toBe(DAY0);
    const next = processBoundaries(changed, at(1, 20), TZ);
    expect(next.save.board?.day).toBe(DAY0 + 1);
  });
});
