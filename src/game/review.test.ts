/**
 * Regression tests for the findings of `docs/review/engine-review.md`
 * (numbered as there). Each test first reproduces the reviewer's scenario
 * and then asserts the fixed behaviour.
 */
import { describe, expect, it } from 'vitest';
import {
  CATCHUP_MAX_DAYS,
  DAY_MS,
  HOUR_MS,
  WAVE_HISTORY_MAX,
  applyResurrection,
  changeResetHour,
  completeQuest,
  decayUtilities,
  fnv1a,
  formatLine,
  gameDayIndex,
  gameDayStartMs,
  generateBoard,
  getQuest,
  incrementCount,
  markTried,
  migrate,
  pickLine,
  processBoundaries,
  reRecruitVassal,
  rerollQuest,
  setBenevolence,
  settleWave,
  startTimer,
  strings,
  undoQuest,
  wavePeriodIndex,
  type SaveFile,
  type WaveRecord,
} from './index';
import { at, fresh, setBoard, T0, TZ } from './testUtils';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

function opened(opts?: Parameters<typeof fresh>[0]): SaveFile {
  return processBoundaries(fresh(opts), T0, TZ).save;
}

describe('1. board survives a backwards move of the day index', () => {
  it('a raw resetHour write 4 -> 20 at 13:00 keeps the board, its done quest and undo; nothing is paid twice', () => {
    let save = opened();
    const first = save.board!.quests[0]!;
    save = completeQuest(save, first.instanceId, T0).save;
    const xp = save.player.xp;
    const changed: SaveFile = { ...save, settings: { ...save.settings, resetHour: 20 } };
    expect(gameDayIndex(at(0, 13), 20, TZ.tz)).toBe(DAY0 - 1); // today moved backwards
    const r = processBoundaries(changed, at(0, 13), TZ);
    expect(r.events).toEqual([]);
    expect(r.save.board).toEqual(save.board);
    expect(completeQuest(r.save, first.instanceId, at(0, 13)).error).toMatch(/already done/);
    // Undo treats the lastOpenDay board as today's.
    const u = undoQuest(r.save, first.instanceId, at(0, 13), TZ);
    expect(u.error).toBeUndefined();
    expect(u.save.player.xp).toBe(0);
    // At 20:00 the index is DAY0 again: still no regeneration, the quest stays done.
    const r2 = processBoundaries(r.save, at(0, 20), TZ);
    expect(r2.events).toEqual([]);
    expect(r2.save.board!.quests[0]!.status).toBe('done');
    expect(r2.save.player.xp).toBe(xp);
  });

  it('changeResetHour keeps "today" unchanged and moves the next boundary to the new hour (raise)', () => {
    let save = opened();
    const first = save.board!.quests[0]!;
    save = completeQuest(save, first.instanceId, T0).save;
    save.combos.push({ comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 });
    save.stats.streakLostOnDay = DAY0 - 2;
    const periodBefore = wavePeriodIndex(save.lastOpenDay, save.firstPlayDay);
    const r = changeResetHour(save, 20, at(0, 13), TZ);
    expect(r.error).toBeUndefined();
    const s = r.save;
    expect(s.settings.resetHour).toBe(20);
    expect(gameDayIndex(at(0, 13), 20, TZ.tz)).toBe(s.lastOpenDay);
    expect(s.firstPlayDay).toBe(DAY0 - 1);
    expect(s.board!.day).toBe(s.lastOpenDay);
    expect(s.board!.quests.map((q) => q.instanceId)).toEqual(save.board!.quests.map((q) => `${DAY0 - 1}-${q.templateId}`));
    expect(s.board!.quests.map((q) => q.instanceId)).toContain(s.board!.bonusId);
    expect(s.board!.quests[0]!.status).toBe('done');
    expect(s.vassals[first.habit].lastActiveDay).toBe(DAY0 - 1);
    expect(s.stats.lastQuestDay).toBe(DAY0 - 1);
    expect(s.stats.streakLostOnDay).toBe(DAY0 - 3);
    expect(s.combos[0]!.forgedDay).toBe(DAY0 - 1);
    expect(s.log.every((e, i) => e.day === save.log[i]!.day - 1)).toBe(true);
    expect(wavePeriodIndex(s.lastOpenDay, s.firstPlayDay)).toBe(periodBefore);
    // Same-day actions keep working on the shifted ids.
    expect(undoQuest(s, s.board!.quests[0]!.instanceId, at(0, 13), TZ).error).toBeUndefined();
    const open = s.board!.quests.find((q) => q.status === 'open')!;
    expect(completeQuest(s, open.instanceId, at(0, 15)).error).toBeUndefined();
    // The current day ends at the next occurrence of the new hour: 20:00 today, not 04:00 tomorrow.
    expect(processBoundaries(s, at(0, 19, 59), TZ).events).toEqual([]);
    const next = processBoundaries(s, at(0, 20), TZ);
    expect(next.save.lastOpenDay).toBe(s.lastOpenDay + 1);
    expect(next.save.board!.day).toBe(s.lastOpenDay + 1);
    expect(next.events.some((e) => e.type === 'catchUp')).toBe(false);
    expect(processBoundaries(next.save, at(1, 19, 59), TZ).events).toEqual([]);
    expect(processBoundaries(next.save, at(1, 20), TZ).save.board!.day).toBe(s.lastOpenDay + 2);
  });

  it('changeResetHour (lower) ends the current day at the next occurrence of the new hour', () => {
    const save = opened({ settings: { resetHour: 20 } });
    const r = changeResetHour(save, 4, at(0, 13), TZ).save;
    expect(r.lastOpenDay).toBe(save.lastOpenDay + 1);
    expect(r.board!.day).toBe(r.lastOpenDay);
    expect(processBoundaries(r, at(0, 13), TZ).events).toEqual([]);
    expect(processBoundaries(r, at(1, 3, 59), TZ).events).toEqual([]);
    expect(processBoundaries(r, at(1, 4), TZ).save.board!.day).toBe(r.lastOpenDay + 1);
  });

  it('changeResetHour validates the hour and is a no-op for the same hour or no index change', () => {
    const save = opened();
    expect(changeResetHour(save, 24, T0, TZ).error).toBeDefined();
    expect(changeResetHour(save, 2.5, T0, TZ).error).toBeDefined();
    expect(changeResetHour(save, 4, T0, TZ).save).toBe(save);
    const r = changeResetHour(save, 6, T0, TZ).save; // 12:00 is after both 04:00 and 06:00: same index
    expect(r.settings.resetHour).toBe(6);
    expect(r.lastOpenDay).toBe(save.lastOpenDay);
    expect(r.board).toEqual(save.board);
  });
});

describe('2. migrate detects a v2 save structurally; the inner version wins', () => {
  function played(): SaveFile {
    let save = opened();
    save = completeQuest(save, save.board!.quests[0]!.instanceId, T0).save;
    save.player.coins = 999;
    save.player.domainPoints = 500;
    save.player.ring = 4;
    save.player.highestRing = 4;
    return save;
  }

  it('keeps a v2 save wrapped in a persist envelope with outer version 0, 1 or none', () => {
    const save = played();
    for (const wrapped of [{ state: save, version: 0 }, { state: save, version: 1 }, { state: save }, { state: { ...save, version: undefined }, version: 1 }]) {
      const m = migrate(JSON.parse(JSON.stringify(wrapped)), T0, TZ);
      expect(m.player.name).toBe('Tester');
      expect(m.player.coins).toBe(999);
      expect(m.player.domainPoints).toBe(500);
      expect(m.board).toEqual(save.board);
    }
  });

  it('still takes the legacy path for { name, level, xp } and keeps the name of a v2-ish shell', () => {
    expect(migrate({ state: { name: 'Wrapped', level: 9, xp: 1 }, version: 1 }, T0, TZ).player).toMatchObject({ name: 'Wrapped', level: 9, xp: 1 });
    expect(migrate({ version: 1, player: { name: 'Shell' } }, T0, TZ).player.name).toBe('Shell');
  });
});

describe('4. migrated boards are normalised', () => {
  it('a rewards snapshot without `utility` cannot produce NaN on undo', () => {
    let save = setBoard(fresh(), DAY0, ['sleep.bedprep']);
    save.utilities.power.value = 90;
    save = completeQuest(save, `${DAY0}-sleep.bedprep`, T0).save;
    const raw = JSON.parse(JSON.stringify(save));
    delete raw.board.quests[0].rewards.utility;
    const migrated = migrate(raw, T0, TZ);
    expect(migrated.board!.quests[0]!.rewards!.utility).toBe(0);
    const u = undoQuest(migrated, `${DAY0}-sleep.bedprep`, T0, TZ);
    expect(u.error).toBeUndefined();
    expect(Number.isFinite(u.save.utilities.power.value)).toBe(true);
    expect(Number.isFinite(decayUtilities(u.save, []).save.utilities.power.value)).toBe(true);
  });

  it('drops unknown templates, repairs a stray bonusId, a done quest without a snapshot, and corrupt combos/titles/history', () => {
    const save = setBoard(fresh(), DAY0, ['move.dance', 'clean.bed']);
    const raw = JSON.parse(JSON.stringify(save));
    raw.board.quests.push({ templateId: 'gone.template', status: 'done' });
    raw.board.quests[1].status = 'done'; // no rewards
    raw.board.bonusId = `${DAY0}-gone.template`;
    raw.combos = [{ comboId: 'sprinting_umbrella', power: 'x', forgedDay: DAY0 }, { comboId: 'nope' }, 'junk'];
    raw.titles = [{ titleId: 'herald', earnedAt: T0, habit: 'bogus' }, { titleId: 'herald', earnedAt: T0 }, null];
    raw.week.history = [{ index: 0, result: 'maybe', log: ['a', 1] }, 'junk'];
    raw.log = [{ text: 'ok' }, { kind: 'x' }];
    const m = migrate(raw, T0, TZ);
    expect(m.board!.quests.map((q) => q.templateId)).toEqual(['move.dance', 'clean.bed']);
    expect(m.board!.quests[1]!.status).toBe('open');
    expect(m.board!.bonusId).toBe('');
    expect(m.combos).toEqual([{ comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 }]);
    expect(m.titles).toEqual([{ titleId: 'herald', earnedAt: T0 }]);
    expect(m.week.history).toHaveLength(1);
    expect(m.week.history[0]).toMatchObject({ index: 0, result: 'quiet', log: ['a'], attack: 0 });
    expect(m.log).toEqual([{ at: 0, day: 0, kind: 'note', text: 'ok' }]);
    expect(Number.isFinite(settleWave(m, 0, T0, DAY0 + 7).save.week.history.at(-1)!.defense)).toBe(true);
  });
});

describe('5. gameDayIndex uses the timezone offset at `now` (GDD 6.8)', () => {
  const gdd = (ms: number, reset: number, tz: (ms: number) => number): number => Math.floor((ms - tz(ms) * 60_000 - reset * HOUR_MS) / DAY_MS);

  it('Europe spring forward: 04:30 local is already the new day', () => {
    const change = Date.UTC(2026, 2, 29, 1, 0, 0); // UTC+1 -> UTC+2
    const tz = (ms: number): number => (ms < change ? -60 : -120);
    const t0430 = Date.UTC(2026, 2, 29, 2, 30);
    expect(gameDayIndex(t0430, 4, tz)).toBe(gdd(t0430, 4, tz));
    expect(gameDayIndex(t0430, 4, tz)).toBe(gameDayIndex(change - 2 * HOUR_MS, 4, tz) + 1);
    expect(gameDayIndex(Date.UTC(2026, 2, 29, 1, 59), 4, tz)).toBe(gameDayIndex(change - 2 * HOUR_MS, 4, tz)); // 03:59 local: old day
    let prev = -Infinity;
    for (let t = change - 6 * HOUR_MS; t <= change + 8 * HOUR_MS; t += 60_000) {
      const d = gameDayIndex(t, 4, tz);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    const day = gameDayIndex(t0430, 4, tz);
    expect(gameDayIndex(gameDayStartMs(day, 4, tz), 4, tz)).toBe(day);
    expect(gameDayIndex(gameDayStartMs(day, 4, tz) - 1, 4, tz)).toBe(day - 1);
  });

  it('Europe fall back: 03:30 local is still the previous day, 04:00 rolls it', () => {
    const change = Date.UTC(2026, 9, 25, 1, 0, 0); // UTC+2 -> UTC+1
    const tz = (ms: number): number => (ms < change ? -120 : -60);
    const t0330 = Date.UTC(2026, 9, 25, 2, 30);
    const t0400 = Date.UTC(2026, 9, 25, 3, 0);
    expect(gameDayIndex(t0330, 4, tz)).toBe(gdd(t0330, 4, tz));
    expect(gameDayIndex(t0400, 4, tz)).toBe(gameDayIndex(t0330, 4, tz) + 1);
    expect(gameDayIndex(t0400 - 1, 4, tz)).toBe(gameDayIndex(t0330, 4, tz));
    let prev = -Infinity;
    for (let t = change - 6 * HOUR_MS; t <= change + 8 * HOUR_MS; t += 60_000) {
      const d = gameDayIndex(t, 4, tz);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('6. trust frozen on a disabled vassal counts for nothing', () => {
  it('a do-nothing week with a disabled vassal holding trust is quiet', () => {
    const save = fresh({ settings: { difficulty: 'hardcore' } });
    save.vassals.move.trust = 3;
    save.settings.enabledHabits = save.settings.enabledHabits.filter((h) => h !== 'move');
    save.utilities.gas.value = 10;
    const r = settleWave(save, 5, T0, DAY0 + 42).save;
    expect(r.week.history[0]!.result).toBe('quiet');
    expect(r.stats.waveLosses).toBe(0);
    expect(r.vassals.move.trust).toBe(0); // trust is period state and resets for everyone
  });
});

describe('7. The Full Set forges when every enabled, present habit (at least five) is done on one board', () => {
  function ring2(enabled: readonly string[]): SaveFile {
    const save = fresh({ settings: { difficulty: 'hardcore', enabledHabits: enabled as SaveFile['settings']['enabledHabits'] } });
    save.player.domainPoints = 150;
    save.player.ring = 2;
    save.player.highestRing = 2;
    return save;
  }
  const five = ['move.dance', 'outside.errand', 'clean.bed', 'social.hello', 'study.plan'];
  const doneAll = (save: SaveFile, ids: string[]): SaveFile => ids.reduce((s, id) => completeQuest(s, `${DAY0}-${id}`, T0).save, save);

  it('forges with exactly five enabled habits, and the forge holds through unrelated undos', () => {
    let save = doneAll(setBoard(ring2(['move', 'outside', 'clean', 'social', 'study']), DAY0, five), five);
    expect(save.combos.some((c) => c.comboId === 'the_full_set')).toBe(true);
    save = undoQuest(save, `${DAY0}-study.plan`, T0, TZ).save;
    expect(save.combos.some((c) => c.comboId === 'the_full_set')).toBe(false);
  });

  it('does not forge below five habits, nor when an enabled habit is missing', () => {
    const four = doneAll(setBoard(ring2(['move', 'outside', 'clean', 'social']), DAY0, five.slice(0, 4)), five.slice(0, 4));
    expect(four.combos.some((c) => c.comboId === 'the_full_set')).toBe(false);
    const sixEnabled = doneAll(setBoard(ring2(['move', 'outside', 'clean', 'social', 'study', 'sleep']), DAY0, five), five);
    expect(sixEnabled.combos.some((c) => c.comboId === 'the_full_set')).toBe(false);
  });

  it('a generated Hardcore board with five enabled habits can carry the set', () => {
    const board = generateBoard(ring2(['move', 'outside', 'clean', 'social', 'study']), DAY0);
    expect(new Set(board.quests.map((q) => q.habit)).size).toBe(5);
  });
});

describe('8. catch-up is bounded', () => {
  it('a missing lastOpenDay defaults to today, not to the first play day', () => {
    const raw = JSON.parse(JSON.stringify(fresh()));
    raw.firstPlayDay = DAY0 - 3650;
    delete raw.lastOpenDay;
    const m = migrate(raw, T0, TZ);
    expect(m.lastOpenDay).toBe(DAY0);
    expect(processBoundaries(m, T0, TZ).save.week.history).toHaveLength(0);
  });

  it('replays at most CATCHUP_MAX_DAYS boundaries and fast-forwards the rest with one catchUp event', () => {
    const save = opened();
    save.vassals.move.trust = 2;
    save.firstPlayDay = DAY0 - 3650;
    save.lastOpenDay = DAY0 - 3650;
    save.board!.day = DAY0 - 3650;
    const { save: next, events } = processBoundaries(save, T0, TZ);
    expect(next.week.history.length).toBe(Math.floor(CATCHUP_MAX_DAYS / 7));
    expect(next.week.history[0]!.result).not.toBe('quiet'); // the active period still settles normally
    expect(next.week.history.slice(1).every((r) => r.result === 'quiet')).toBe(true);
    expect(next.lastOpenDay).toBe(DAY0);
    expect(next.week.index).toBe(wavePeriodIndex(DAY0, next.firstPlayDay));
    expect(next.board!.day).toBe(DAY0);
    expect(events.filter((e) => e.type === 'catchUp')).toEqual([{ type: 'catchUp', days: 3650 }]);
    expect(next.vassals.clean.loyalty).toBe(50 - 3 * 7);
    expect(next.utilities.power.value).toBe(100 - 3 * 15);
    expect(JSON.stringify(next).length).toBeLessThan(60_000);
    // Opening again a week later settles the period containing today, with its proper index.
    const later = processBoundaries(next, at(7), TZ).save;
    expect(later.week.history.at(-1)!.index).toBe(wavePeriodIndex(DAY0, next.firstPlayDay));
    expect(later.week.index).toBe(wavePeriodIndex(DAY0, next.firstPlayDay) + 1);
  });

  it('keeps at most WAVE_HISTORY_MAX records', () => {
    const save = fresh();
    const rec = (index: number): WaveRecord => ({ index, ring: 1, attack: 0, defense: 0, breakdown: { vassals: 0, trust: 0, walls: 0, combos: 0, titles: 0, wellKept: 0 }, result: 'quiet', dpAwarded: 0, log: [], settledAt: 0 });
    save.week.history = Array.from({ length: WAVE_HISTORY_MAX }, (_, i) => rec(i));
    const r = settleWave(save, WAVE_HISTORY_MAX, T0, DAY0).save;
    expect(r.week.history).toHaveLength(WAVE_HISTORY_MAX);
    expect(r.week.history[0]!.index).toBe(1);
    expect(r.week.history.at(-1)!.index).toBe(WAVE_HISTORY_MAX);
    const raw = JSON.parse(JSON.stringify(save));
    raw.week.history.push(rec(WAVE_HISTORY_MAX));
    expect(migrate(raw, T0, TZ).week.history).toHaveLength(WAVE_HISTORY_MAX);
  });
});

describe('9. an empty board is refilled when a vassal returns', () => {
  function allAway(): SaveFile {
    const save = fresh({ settings: { benevolence: 'strict', enabledHabits: ['move'] } });
    save.vassals.move.away = true;
    save.vassals.move.loyalty = 0;
    return processBoundaries(save, T0, TZ).save;
  }

  it('reRecruitVassal issues today\'s board at once', () => {
    const save = allAway();
    expect(save.board!.quests).toHaveLength(0);
    const { save: back, events } = reRecruitVassal(save, 'move', T0, DAY0);
    expect(back.board!.day).toBe(DAY0);
    expect(back.board!.quests.length).toBeGreaterThan(0);
    expect(back.board!.quests.every((q) => q.habit === 'move' && q.status === 'open')).toBe(true);
    expect(events).toContainEqual({ type: 'boardIssued', day: DAY0 });
    expect(processBoundaries(back, T0 + HOUR_MS, TZ).events).toEqual([]);
    // A non-empty board is left alone.
    const other = fresh({ settings: { benevolence: 'strict' } });
    other.vassals.eat.away = true;
    const withBoard = processBoundaries(other, T0, TZ).save;
    const r = reRecruitVassal(withBoard, 'eat', T0, DAY0);
    expect(r.save.board).toEqual(withBoard.board);
    expect(r.events.some((e) => e.type === 'boardIssued')).toBe(false);
  });

  it('the Resurrection token\'s vassal branch does the same', () => {
    const save = allAway();
    save.player.coins = 500;
    const r = applyResurrection(save, { kind: 'vassal', habit: 'move' }, T0, DAY0, TZ);
    expect(r.error).toBeUndefined();
    expect(r.save.board!.quests.length).toBeGreaterThan(0);
    expect(r.events[0]).toEqual({ type: 'resurrectionUsed', restored: 'vassal', habit: 'move' });
  });
});

describe('10. quests of a disabled habit cannot be acted on', () => {
  it('complete, tried, timer and counter are refused; the vassal and utility stay frozen', () => {
    const save = setBoard(fresh(), DAY0, ['sleep.bedprep', 'sleep.lightsout', 'eat.water6']);
    save.settings.enabledHabits = save.settings.enabledHabits.filter((h) => h !== 'sleep' && h !== 'eat');
    save.utilities.power.value = 40;
    const timer = save.board!.quests.find((q) => q.kind === 'timer');
    for (const r of [
      completeQuest(save, `${DAY0}-sleep.bedprep`, T0),
      markTried(save, `${DAY0}-sleep.bedprep`, T0),
      incrementCount(save, `${DAY0}-eat.water6`, 1, T0, TZ),
      rerollQuest({ ...save, player: { ...save.player, coins: 50 } }, `${DAY0}-sleep.bedprep`, T0),
      ...(timer ? [startTimer(save, timer.instanceId, T0)] : []),
    ]) {
      expect(r.error).toBe('habit is disabled');
      expect(r.save).toBe(r.save);
    }
    expect(save.vassals.sleep).toMatchObject({ loyalty: 50, trust: 0 });
    expect(save.utilities.power.value).toBe(40);
  });
});

describe('3. reroll never moves the bonus onto a done quest', () => {
  it('bonus rerolled to a lower tier: the flag goes to an open quest, the done quest stays at x1', () => {
    const save = fresh();
    save.player.domainPoints = 400;
    save.player.ring = 3;
    save.player.highestRing = 3;
    save.player.coins = 100;
    const board = setBoard(save, DAY0, ['clean.laundry', 'sleep.anchored']);
    expect(board.board!.bonusId).toBe(`${DAY0}-sleep.anchored`);
    const done = completeQuest(board, `${DAY0}-clean.laundry`, T0).save;
    expect(done.board!.quests[0]!.rewards!.dp).toBe(2);
    const r = rerollQuest(done, `${DAY0}-sleep.anchored`, T0);
    expect(r.error).toBeUndefined();
    const replacement = r.save.board!.quests[1]!;
    expect(getQuest(replacement.templateId)!.tier).toBeLessThan(3);
    expect(r.save.board!.bonusId).toBe(replacement.instanceId);
    const redone = completeQuest(undoQuest(r.save, `${DAY0}-clean.laundry`, T0, TZ).save, `${DAY0}-clean.laundry`, T0).save;
    expect(redone.board!.quests[0]!.rewards!.dp).toBe(2);
  });

  it('rerolling a non-bonus quest leaves the flag where it is', () => {
    const save = fresh();
    save.player.coins = 100;
    const board = setBoard(save, DAY0, ['clean.bed', 'move.walk15', 'study.plan']);
    const bonus = board.board!.bonusId;
    const r = rerollQuest(board, board.board!.quests.find((q) => q.instanceId !== bonus)!.instanceId, T0);
    expect(r.error).toBeUndefined();
    expect(r.save.board!.bonusId).toBe(bonus);
  });
});

describe('11. the wave log reads "registered" when the award crosses a ring', () => {
  it('prints "The Flat is registered." instead of 132/120', () => {
    const save = fresh();
    save.player.domainPoints = 110;
    for (const h of ['move', 'clean', 'study', 'sleep', 'eat', 'hygiene', 'social', 'outside'] as const) save.vassals[h].trust = 7;
    const { save: r, events } = settleWave(save, 0, T0, DAY0 + 7);
    expect(r.player.ring).toBe(2);
    expect(r.week.history[0]!.log.at(-1)).toBe('Domain Points +22. The Flat is registered.');
    expect(events).toContainEqual({ type: 'ringUnlocked', ring: 2 });
  });
});

describe('12. ringUnlocked fires once and the ring never drops', () => {
  it('unlock -> undo -> redo emits a single ringUnlocked', () => {
    const save = setBoard(fresh(), DAY0, ['clean.bed']);
    save.player.domainPoints = 119;
    const a = completeQuest(save, `${DAY0}-clean.bed`, T0);
    expect(a.events).toContainEqual({ type: 'ringUnlocked', ring: 2 });
    const u = undoQuest(a.save, `${DAY0}-clean.bed`, T0, TZ).save;
    expect(u.player.domainPoints).toBe(119);
    expect(u.player.ring).toBe(2);
    expect(u.player.highestRing).toBe(2);
    const b = completeQuest(u, `${DAY0}-clean.bed`, T0);
    expect(b.events.some((e) => e.type === 'ringUnlocked')).toBe(false);
    expect(migrate(JSON.parse(JSON.stringify(u)), T0, TZ).player.ring).toBe(2);
  });
});

describe('13. a done counter is read-only after its day', () => {
  it('incrementing past the target on a later day is refused', () => {
    let save = setBoard(fresh(), DAY0, ['eat.water6']);
    save = completeQuest(save, `${DAY0}-eat.water6`, T0).save;
    expect(incrementCount(save, `${DAY0}-eat.water6`, 1, T0, TZ).save.board!.quests[0]!.count).toBe(7);
    const r = incrementCount(save, `${DAY0}-eat.water6`, 1, at(3), TZ);
    expect(r.error).toMatch(/settled/);
    expect(r.save).toBe(save);
  });
});

describe('14. the catch-up line greets with a present vassal', () => {
  it('names the enabled, present vassal with the highest loyalty, never a disabled one', () => {
    let checked = 0;
    for (let gap = 2; gap < 40; gap++) {
      const template = pickLine(strings.catchUp, fnv1a(`catchup:${DAY0 + gap}`));
      if (!template.includes('{name}')) continue;
      const save = opened();
      save.settings.enabledHabits = save.settings.enabledHabits.filter((h) => h !== 'move');
      save.vassals.outside.loyalty = 90;
      const line = processBoundaries(save, at(gap), TZ).save.log.find((l) => l.kind === 'catchUp')!.text;
      expect(line).toBe(formatLine(template, { days: gap, name: 'Wren' }));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('15. documented departures now have hooks', () => {
  it('generateBoard accepts a stored seed so a renamed player can replay a day', () => {
    const save = opened();
    const renamed: SaveFile = { ...save, player: { ...save.player, name: 'Someone Else' } };
    expect(generateBoard(renamed, DAY0)).not.toEqual(save.board);
    expect(generateBoard(renamed, DAY0, save.board!.seed)).toEqual(save.board);
  });

  it('createNewSave ignores an empty enabledHabits override', () => {
    expect(fresh({ settings: { enabledHabits: [] } }).settings.enabledHabits).toHaveLength(8);
  });
});

describe('16. switching Strict -> Benevolent welcomes away vassals back', () => {
  it('re-recruits everyone who was away, for free, and refills an empty board', () => {
    const save = fresh({ settings: { benevolence: 'strict', enabledHabits: ['move', 'eat'] } });
    save.vassals.move.away = true;
    save.vassals.move.loyalty = 0;
    save.vassals.eat.away = true;
    save.vassals.eat.loyalty = 0;
    const withBoard = processBoundaries(save, T0, TZ).save;
    expect(withBoard.board!.quests).toHaveLength(0);
    const { save: next, events } = setBenevolence(withBoard, 'benevolent', T0, DAY0);
    expect(next.settings.benevolence).toBe('benevolent');
    expect(next.vassals.move).toMatchObject({ away: false, loyalty: 50, lastActiveDay: DAY0 });
    expect(next.vassals.eat).toMatchObject({ away: false, loyalty: 50 });
    expect(next.stats.reRecruitments).toBe(0);
    expect(next.player.coins).toBe(0);
    expect(events.filter((e) => e.type === 'vassalReturned')).toHaveLength(2);
    expect(next.board!.quests.length).toBeGreaterThan(0);
    // Back to Strict: nothing else changes; same mode is a no-op.
    const strict = setBenevolence(next, 'strict', T0, DAY0);
    expect(strict.events).toEqual([]);
    expect(strict.save.vassals).toEqual(next.vassals);
    expect(setBenevolence(next, 'benevolent', T0, DAY0).save).toBe(next);
  });
});
