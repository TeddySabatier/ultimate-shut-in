import { describe, expect, it } from 'vitest';
import {
  chooseBonus,
  completeQuest,
  eligiblePool,
  fallbackTier,
  generateBoard,
  incrementCount,
  markTried,
  pauseTimer,
  rerollQuest,
  startTimer,
  timerElapsedMs,
  undoQuest,
} from './board';
import { getQuest } from './content';
import { xpToNext } from './economy';
import { at, deepFreeze, fresh, freshWithBoard, setBoard, T0, TZ } from './testUtils';
import { gameDayIndex } from './time';
import type { SaveFile } from './types';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

describe('generateBoard', () => {
  it('is deterministic for the same save and day, and differs by name', () => {
    const save = fresh();
    const a = generateBoard(save, DAY0);
    const b = generateBoard(save, DAY0);
    expect(a).toEqual(b);
    expect(a.seed).toBe(b.seed);
    const other = generateBoard({ ...save, player: { ...save.player, name: 'Someone' } }, DAY0);
    expect(other.seed).not.toBe(a.seed);
  });

  it('issues questsPerDay quests over distinct habits when enough are enabled', () => {
    for (const [difficulty, n] of [
      ['gentle', 3],
      ['steady', 4],
      ['hardcore', 5],
    ] as const) {
      const board = generateBoard(fresh({ settings: { difficulty } }), DAY0);
      expect(board.quests).toHaveLength(n);
      expect(new Set(board.quests.map((q) => q.habit)).size).toBe(n);
      expect(board.quests.map((q) => q.instanceId)).toContain(board.bonusId);
      for (const q of board.quests) {
        expect(q.instanceId).toBe(`${DAY0}-${q.templateId}`);
        expect(q.status).toBe('open');
        expect(getQuest(q.templateId)?.minRing).toBe(1);
      }
    }
  });

  it('falls back to tier 1 for hygiene at ring 1 (no tier 2/3 templates there)', () => {
    const save = fresh({ settings: { difficulty: 'hardcore', enabledHabits: ['hygiene'] } });
    const board = generateBoard(save, DAY0);
    expect(board.quests.length).toBe(2);
    for (const q of board.quests) {
      expect(q.habit).toBe('hygiene');
      expect(getQuest(q.templateId)?.tier).toBe(1);
    }
    expect(new Set(board.quests.map((q) => q.templateId)).size).toBe(2);
  });

  it('never puts a habit on the board more than twice', () => {
    const save = fresh({ settings: { difficulty: 'hardcore', enabledHabits: ['move', 'study'] } });
    const board = generateBoard(save, DAY0);
    expect(board.quests).toHaveLength(4);
    const counts = new Map<string, number>();
    for (const q of board.quests) counts.set(q.habit, (counts.get(q.habit) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBe(2);
  });

  it('excludes away vassals, disabled habits and templates above the ring', () => {
    const save = fresh({ settings: { enabledHabits: ['move', 'outside', 'clean'] } });
    save.vassals.move.away = true;
    const pool = eligiblePool(save, DAY0);
    expect([...pool.keys()]).toEqual(['outside', 'clean']);
    for (const list of pool.values()) for (const t of list) expect(t.minRing).toBe(1);
    save.player.domainPoints = 400;
    save.player.ring = 3;
    const wider = eligiblePool(save, DAY0);
    expect(wider.get('outside')!.length).toBeGreaterThan(pool.get('outside')!.length);
  });

  it('avoids yesterday`s templates when the pool allows it', () => {
    const save = freshWithBoard();
    const yesterday = new Set(save.board!.quests.map((q) => q.templateId));
    const today = generateBoard(save, DAY0 + 1);
    for (const q of today.quests) expect(yesterday.has(q.templateId)).toBe(false);
  });

  it('keeps yesterday`s templates when removing them would empty the habit pool', () => {
    const save = fresh({ settings: { difficulty: 'gentle', enabledHabits: ['sleep'] } });
    save.player.ring = 1;
    const sleepRing1 = ['sleep.bedprep', 'sleep.naps', 'sleep.winddown', 'sleep.screens', 'sleep.lightsout', 'sleep.wake'];
    const withBoard = setBoard(save, DAY0, sleepRing1);
    const pool = eligiblePool(withBoard, DAY0 + 1);
    expect(pool.get('sleep')!.length).toBe(sleepRing1.length);
  });

  it('bonus is the highest tier, then highest baseXp', () => {
    const save = setBoard(fresh(), DAY0, ['clean.bed', 'move.walk15', 'social.call', 'eat.cook']);
    expect(save.board!.bonusId).toBe(`${DAY0}-eat.cook`);
    expect(chooseBonus([])).toBe('');
  });

  it('weights neglected vassals more heavily', () => {
    const save = fresh({ settings: { difficulty: 'gentle' } });
    for (const h of ['outside', 'clean', 'social', 'study', 'sleep', 'eat', 'hygiene'] as const) save.vassals[h].loyalty = 100;
    save.vassals.move.loyalty = 0;
    let moveDays = 0;
    for (let d = 0; d < 40; d++) if (generateBoard(save, DAY0 + d).quests.some((q) => q.habit === 'move')) moveDays += 1;
    expect(moveDays).toBeGreaterThan(30);
  });

  it('fallbackTier prefers lower tiers then higher', () => {
    expect(fallbackTier(3, new Set([1, 2]))).toBe(2);
    expect(fallbackTier(2, new Set([3]))).toBe(3);
    expect(fallbackTier(1, new Set([2, 3]))).toBe(2);
    expect(fallbackTier(2, new Set([2]))).toBe(2);
    expect(fallbackTier(2, new Set())).toBeNull();
  });
});

describe('completeQuest', () => {
  it('applies rewards, snapshots them and does not mutate the input', () => {
    const save = deepFreeze(setBoard(fresh(), DAY0, ['clean.bed', 'move.walk15', 'social.call', 'eat.cook']));
    const id = `${DAY0}-move.walk15`;
    const { save: next, events } = completeQuest(save, id, T0);
    const q = next.board!.quests.find((x) => x.instanceId === id)!;
    expect(q.status).toBe('done');
    expect(q.rewards).toEqual({ xp: 24, coins: 12, dp: 1, loyalty: 6, utility: 0 });
    expect(next.player.xp).toBe(24);
    expect(next.player.coins).toBe(12);
    expect(next.player.domainPoints).toBe(1);
    expect(next.vassals.move.xp).toBe(24);
    expect(next.vassals.move.loyalty).toBe(56);
    expect(next.vassals.move.trust).toBe(1);
    expect(next.vassals.move.lastActiveDay).toBe(DAY0);
    expect(next.vassals.move.lifetimeQuests).toBe(1);
    expect(next.stats.questsTotal).toBe(1);
    expect(next.stats.questsByHabit.move).toBe(1);
    expect(next.stats.questDaysTotal).toBe(1);
    expect(next.stats.questDayStreak).toBe(1);
    expect(next.stats.lastQuestDay).toBe(DAY0);
    expect(events[0]).toMatchObject({ type: 'questDone', instanceId: id });
    expect(next.log.at(-1)?.kind).toBe('questDone');
    expect(save.player.xp).toBe(0);
  });

  it('doubles the bonus contract and refuses a second completion', () => {
    const save = setBoard(fresh(), DAY0, ['clean.bed', 'eat.cook']);
    const id = `${DAY0}-eat.cook`;
    const r = completeQuest(save, id, T0);
    expect(r.save.board!.quests[1]!.rewards).toMatchObject({ xp: Math.round(36 * 1.1 * 2), coins: Math.round(18 * 1.1 * 2), dp: 4 });
    expect(r.save.utilities.gas.value).toBe(100);
    const again = completeQuest(r.save, id, T0);
    expect(again.error).toBeDefined();
    expect(again.save).toBe(r.save);
    expect(completeQuest(save, 'nope', T0).error).toBeDefined();
  });

  it('levels the player and the vassal and unlocks rings', () => {
    const save = setBoard(fresh(), DAY0, ['study.deep']);
    save.player.xp = xpToNext(1) - 1;
    save.player.domainPoints = 119;
    save.vassals.study.xp = 119;
    const { save: next, events } = completeQuest(save, `${DAY0}-study.deep`, T0);
    expect(next.player.level).toBe(2);
    expect(next.player.ring).toBe(2);
    expect(next.vassals.study.level).toBe(2);
    const types = events.map((e) => e.type);
    expect(types).toContain('levelUp');
    expect(types).toContain('vassalLevelUp');
    expect(types).toContain('ringUnlocked');
  });

  it('restores the tied utility and snapshots the applied amount', () => {
    const save = setBoard(fresh(), DAY0, ['sleep.bedprep']);
    save.utilities.power.value = 90;
    const id = `${DAY0}-sleep.bedprep`;
    const { save: next, events } = completeQuest(save, id, T0);
    expect(next.utilities.power.value).toBe(100);
    expect(next.board!.quests[0]!.rewards?.utility).toBe(10);
    expect(events.some((e) => e.type === 'utilityRestored')).toBe(true);
    const undone = undoQuest(next, id, T0, TZ).save;
    expect(undone.utilities.power.value).toBe(90);
  });

  it('continues the quest-day streak across consecutive days only', () => {
    let save = setBoard(fresh(), DAY0, ['clean.bed']);
    save = completeQuest(save, `${DAY0}-clean.bed`, T0).save;
    save = setBoard(save, DAY0 + 1, ['clean.bed']);
    save = completeQuest(save, `${DAY0 + 1}-clean.bed`, at(1)).save;
    expect(save.stats.questDayStreak).toBe(2);
    expect(save.stats.bestQuestDayStreak).toBe(2);
    save = setBoard(save, DAY0 + 3, ['clean.bed']);
    save = completeQuest(save, `${DAY0 + 3}-clean.bed`, at(3)).save;
    expect(save.stats.questDayStreak).toBe(1);
    expect(save.stats.questDaysTotal).toBe(3);
  });
});

describe('timers', () => {
  it('starts, pauses, resumes and awards the timed bonus', () => {
    let save = setBoard(fresh(), DAY0, ['move.stretch', 'outside.walk10']);
    const a = `${DAY0}-move.stretch`;
    const b = `${DAY0}-outside.walk10`;
    expect(startTimer(save, 'nope', T0).error).toBeDefined();
    expect(startTimer(save, a, T0).save.board!.quests[0]!.timer?.startedAt).toBe(T0);
    save = startTimer(save, a, T0).save;
    expect(startTimer(save, a, T0 + 1).save).toBe(save); // already running: no-op
    save = pauseTimer(save, a, T0 + 60_000).save;
    expect(save.board!.quests[0]!.timer).toEqual({ startedAt: null, accumulatedMs: 60_000 });
    expect(pauseTimer(save, a, T0).save).toBe(save);
    save = startTimer(save, a, T0 + 120_000).save;
    expect(timerElapsedMs(save.board!.quests[0]!, T0 + 180_000)).toBe(120_000);
    // Starting another pauses the first.
    save = startTimer(save, b, T0 + 200_000).save;
    expect(save.board!.quests[0]!.timer?.startedAt).toBeNull();
    expect(save.board!.quests[0]!.timer?.accumulatedMs).toBe(80_000 + 60_000);
    expect(save.board!.quests[1]!.timer?.startedAt).toBe(T0 + 200_000);
    // Complete the first with >= 5 minutes accumulated: bonus; the second with less: none.
    save = startTimer(save, a, T0 + 300_000).save;
    const done = completeQuest(save, a, T0 + 300_000 + 3 * 60_000).save;
    const qa = done.board!.quests[0]!;
    expect(qa.timedBonus).toBe(true);
    expect(qa.rewards?.xp).toBe(Math.round(18 * 1.1 * 1.1));
    const doneB = completeQuest(done, b, T0 + 400_000).save;
    expect(doneB.board!.quests[1]!.timedBonus).toBe(false);
    expect(timerElapsedMs(doneB.board!.quests[1]!, T0)).toBeGreaterThan(0);
    expect(timerElapsedMs({ ...qa, timer: null }, T0)).toBe(0);
  });

  it('refuses timer actions on non-timer or done quests', () => {
    const save = setBoard(fresh(), DAY0, ['clean.bed', 'move.stretch']);
    expect(startTimer(save, `${DAY0}-clean.bed`, T0).error).toBeDefined();
    expect(pauseTimer(save, `${DAY0}-clean.bed`, T0).error).toBeDefined();
    expect(pauseTimer(save, 'nope', T0).error).toBeDefined();
    const done = completeQuest(save, `${DAY0}-move.stretch`, T0).save;
    expect(startTimer(done, `${DAY0}-move.stretch`, T0).error).toBeDefined();
  });
});

describe('counters', () => {
  it('auto-completes at the target and undoes when stepping below it', () => {
    let save = setBoard(fresh(), DAY0, ['eat.water6', 'clean.bed']);
    const id = `${DAY0}-eat.water6`;
    expect(incrementCount(save, 'nope', 1, T0).error).toBeDefined();
    expect(incrementCount(save, `${DAY0}-clean.bed`, 1, T0).error).toBeDefined();
    for (let i = 0; i < 5; i++) save = incrementCount(save, id, 1, T0, TZ).save;
    expect(save.board!.quests[0]!.count).toBe(5);
    expect(save.board!.quests[0]!.status).toBe('open');
    const r = incrementCount(save, id, 1, T0, TZ);
    expect(r.save.board!.quests[0]!.status).toBe('done');
    expect(r.events[0]?.type).toBe('questDone');
    const over = incrementCount(r.save, id, 1, T0, TZ).save;
    expect(over.board!.quests[0]!.count).toBe(7);
    expect(over.player.xp).toBe(r.save.player.xp);
    const back = incrementCount(over, id, -2, T0, TZ);
    expect(back.save.board!.quests[0]!.status).toBe('open');
    expect(back.save.board!.quests[0]!.count).toBe(5);
    expect(back.save.player.xp).toBe(0);
    const floor = incrementCount(back.save, id, -10, T0, TZ).save;
    expect(floor.board!.quests[0]!.count).toBe(0);
  });

  it('completing a count quest directly fills the count', () => {
    const save = setBoard(fresh(), DAY0, ['eat.water6']);
    const done = completeQuest(save, `${DAY0}-eat.water6`, T0).save;
    expect(done.board!.quests[0]!.count).toBe(6);
  });

  it('undo below target after the day changed is refused', () => {
    const save = setBoard(fresh(), DAY0, ['eat.water6']);
    const done = completeQuest(save, `${DAY0}-eat.water6`, T0).save;
    expect(incrementCount(done, `${DAY0}-eat.water6`, -1, at(1), TZ).error).toBeDefined();
  });
});

describe('markTried', () => {
  it('counts for trust and loyalty hold only', () => {
    const save = setBoard(fresh(), DAY0, ['social.hello']);
    const id = `${DAY0}-social.hello`;
    const { save: next, events } = markTried(save, id, T0);
    expect(next.board!.quests[0]!.status).toBe('tried');
    expect(next.vassals.social.trust).toBe(1);
    expect(next.vassals.social.lastActiveDay).toBe(DAY0);
    expect(next.vassals.social.loyalty).toBe(50);
    expect(next.player.xp).toBe(0);
    expect(events[0]?.type).toBe('questTried');
    expect(markTried(next, id, T0).error).toBeDefined();
    expect(markTried(next, 'nope', T0).error).toBeDefined();
    // A tried quest can still be done the same day; trust does not double count.
    const done = completeQuest(next, id, T0).save;
    expect(done.board!.quests[0]!.status).toBe('done');
    expect(done.vassals.social.trust).toBe(1);
  });
});

describe('undoQuest', () => {
  function snapshot(s: SaveFile): unknown {
    return {
      player: s.player,
      utilities: s.utilities,
      stats: { ...s.stats, bestQuestDayStreak: 0 }, // high-water mark is never revoked
      vassal: { level: s.vassals.study.level, xp: s.vassals.study.xp, loyalty: s.vassals.study.loyalty, lifetime: s.vassals.study.lifetimeQuests },
    };
  }

  it('restores the exact snapshot including levels and ring', () => {
    const save = setBoard(fresh(), DAY0, ['study.deep', 'clean.bed']);
    save.player.xp = xpToNext(1) - 5;
    save.player.domainPoints = 118;
    save.vassals.study.xp = 115;
    save.vassals.study.loyalty = 97;
    const before = snapshot(save);
    const id = `${DAY0}-study.deep`;
    const done = completeQuest(save, id, T0).save;
    expect(done.player.level).toBe(2);
    expect(done.player.ring).toBe(2);
    expect(done.vassals.study.loyalty).toBe(100);
    expect(done.board!.quests[0]!.rewards?.loyalty).toBe(3);
    const { save: undone, events } = undoQuest(done, id, T0, TZ);
    expect(snapshot(undone)).toEqual(before);
    expect(undone.player.ring).toBe(1);
    expect(undone.board!.quests[0]!.status).toBe('open');
    expect(undone.board!.quests[0]!.rewards).toBeNull();
    expect(events[0]?.type).toBe('questUndone');
  });

  it('is refused after the day boundary and on non-done quests', () => {
    const save = setBoard(fresh(), DAY0, ['clean.bed']);
    const id = `${DAY0}-clean.bed`;
    expect(undoQuest(save, id, T0, TZ).error).toBeDefined();
    expect(undoQuest(save, 'nope', T0, TZ).error).toBeDefined();
    const done = completeQuest(save, id, T0).save;
    const late = undoQuest(done, id, at(1, 5), TZ);
    expect(late.error).toMatch(/same-day/);
    expect(late.save).toBe(done);
    // 03:59 the next morning is still the same game day with the 04:00 reset.
    expect(undoQuest(done, id, at(1, 3, 59), TZ).error).toBeUndefined();
  });

  it('keeps the streak when another quest is still done today, reverts it otherwise', () => {
    let save = setBoard(fresh(), DAY0, ['clean.bed', 'move.dance']);
    save.stats.questDayStreak = 4;
    save.stats.lastQuestDay = DAY0 - 1;
    save = completeQuest(save, `${DAY0}-clean.bed`, T0).save;
    save = completeQuest(save, `${DAY0}-move.dance`, T0).save;
    expect(save.stats.questDayStreak).toBe(5);
    save = undoQuest(save, `${DAY0}-clean.bed`, T0, TZ).save;
    expect(save.stats.questDayStreak).toBe(5);
    save = undoQuest(save, `${DAY0}-move.dance`, T0, TZ).save;
    expect(save.stats.questDayStreak).toBe(4);
    expect(save.stats.lastQuestDay).toBe(DAY0 - 1);
    expect(save.stats.questDaysTotal).toBe(0);
    // A fresh single-day streak reverts to nothing.
    let single = setBoard(fresh(), DAY0, ['clean.bed']);
    single = completeQuest(single, `${DAY0}-clean.bed`, T0).save;
    single = undoQuest(single, `${DAY0}-clean.bed`, T0, TZ).save;
    expect(single.stats.questDayStreak).toBe(0);
    expect(single.stats.lastQuestDay).toBeNull();
  });

  it('never revokes titles', () => {
    let save = setBoard(fresh(), DAY0, ['social.hello']);
    save.stats.questsByHabit.social = 19;
    save = completeQuest(save, `${DAY0}-social.hello`, T0).save;
    expect(save.titles.map((t) => t.titleId)).toContain('herald');
    save = undoQuest(save, `${DAY0}-social.hello`, T0, TZ).save;
    expect(save.titles.map((t) => t.titleId)).toContain('herald');
    expect(save.stats.questsByHabit.social).toBe(19);
  });
});

describe('rerollQuest', () => {
  it('swaps for the same habit and tier, charges once per day', () => {
    const save = setBoard(fresh(), DAY0, ['clean.bed', 'move.walk15']);
    save.player.coins = 20;
    const id = `${DAY0}-clean.bed`;
    const { save: next, events } = rerollQuest(save, id, T0);
    expect(events[0]).toMatchObject({ type: 'questRerolled', oldInstanceId: id, cost: 15 });
    expect(next.player.coins).toBe(5);
    expect(next.board!.rerolledToday).toBe(true);
    const replaced = next.board!.quests[0]!;
    expect(replaced.habit).toBe('clean');
    expect(replaced.templateId).not.toBe('clean.bed');
    expect(getQuest(replaced.templateId)?.tier).toBe(1);
    expect(next.board!.bonusId).toBe(`${DAY0}-move.walk15`);
    expect(rerollQuest(next, replaced.instanceId, T0).error).toMatch(/already/);
  });

  it('refuses without coins, on done quests, and falls back to any tier', () => {
    const save = setBoard(fresh(), DAY0, ['clean.bed']);
    expect(rerollQuest(save, `${DAY0}-clean.bed`, T0).error).toMatch(/settlement/);
    expect(rerollQuest(save, 'nope', T0).error).toBeDefined();
    save.player.coins = 100;
    const done = completeQuest(save, `${DAY0}-clean.bed`, T0).save;
    expect(rerollQuest(done, `${DAY0}-clean.bed`, T0).error).toMatch(/open/);
    // Hygiene has one ring-1 tier... make every other tier-1 template taken so the fallback triggers.
    const hyg = setBoard(fresh(), DAY0, ['hygiene.skin', 'hygiene.clothes', 'hygiene.floss', 'hygiene.teeth', 'hygiene.shower']);
    hyg.player.coins = 100;
    hyg.player.domainPoints = 200;
    hyg.player.ring = 2;
    const r = rerollQuest(hyg, `${DAY0}-hygiene.skin`, T0);
    expect(r.error).toBeUndefined();
    expect(getQuest(r.save.board!.quests[0]!.templateId)?.tier).toBe(2);
    // At ring 1 nothing else is available at all.
    const none = setBoard(fresh(), DAY0, ['hygiene.skin', 'hygiene.clothes', 'hygiene.floss', 'hygiene.teeth', 'hygiene.shower']);
    none.player.coins = 100;
    expect(rerollQuest(none, `${DAY0}-hygiene.skin`, T0).error).toMatch(/replacement/);
  });
});
