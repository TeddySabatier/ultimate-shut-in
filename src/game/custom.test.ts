import { describe, expect, it } from 'vitest';
import { completeQuest, incrementCount, markTried, rerollQuest, startTimer, undoQuest } from './board';
import { quests as shippedQuests, tierDefaults } from './content';
import {
  MAX_ACTIVE_CUSTOM,
  MAX_CUSTOM_ON_BOARD,
  activeCustomTemplates,
  addCustomQuestToBoard,
  addCustomTemplate,
  archiveCustomTemplate,
  cleanDraft,
  customOnBoardCount,
  previewCustomRewards,
  recurrenceDue,
  updateCustomTemplate,
} from './custom';
import { questRewards } from './economy';
import { migrate } from './save';
import { effortTier, maxTier, resolveTemplate, resolveTier, weekdayOf } from './template';
import { T0, TZ, at, deepFreeze, fresh, freshWithBoard, setBoard } from './testUtils';
import { processBoundaries } from './tick';
import { gameDayIndex } from './time';
import type { CustomDraft, SaveFile } from './types';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

function draft(over: Partial<CustomDraft> = {}): CustomDraft {
  return {
    habit: 'move',
    kind: 'timer',
    durationMin: 20,
    title: 'Park lap',
    description: 'Around the park.',
    recurrence: 'once',
    timeSlot: 'any',
    source: 'text',
    ...over,
  };
}

/** Add a template and return the new save plus its id. */
function withTemplate(save: SaveFile, over: Partial<CustomDraft> = {}, now = T0): { save: SaveFile; id: string } {
  const r = addCustomTemplate(save, now, draft(over));
  if (r.error || !r.templateId) throw new Error(r.error ?? 'no id');
  return { save: r.save, id: r.templateId };
}

function board(save: SaveFile, id: string, now = T0): SaveFile {
  const r = addCustomQuestToBoard(save, now, id, TZ);
  if (r.error) throw new Error(r.error);
  return r.save;
}

describe('effort and tier caps', () => {
  it('derives the tier from kind and duration', () => {
    expect(effortTier('timer', 5)).toBe(1);
    expect(effortTier('timer', 15)).toBe(1);
    expect(effortTier('timer', 16)).toBe(2);
    expect(effortTier('timer', 30)).toBe(2);
    expect(effortTier('timer', 31)).toBe(3);
    expect(effortTier('check')).toBe(1);
    expect(effortTier('count', undefined, 5)).toBe(1);
    expect(effortTier('count', undefined, 6)).toBe(2);
  });
  it('caps what a custom quest may claim', () => {
    expect(maxTier('timer', 10)).toBe(1);
    expect(maxTier('timer', 45)).toBe(3);
    expect(maxTier('check')).toBe(2);
    expect(maxTier('count', undefined, 50)).toBe(2);
    expect(resolveTier('check', 3)).toBe(2);
    expect(resolveTier('timer', 3, 10)).toBe(1);
    expect(resolveTier('timer', 1, 45)).toBe(1);
    expect(resolveTier('timer', undefined, 45)).toBe(3);
  });
  it('never out-earns a built-in of the same tier', () => {
    const s = freshWithBoard();
    for (const tier of [1, 2, 3] as const) {
      const maxBase = Math.max(...shippedQuests.filter((q) => q.tier === tier).map((q) => q.baseXp));
      expect(tierDefaults[tier].baseXp).toBeLessThanOrEqual(maxBase);
    }
    // A timer of 10 minutes asking for tier 3 is held at tier 1 and pays like tier 1.
    const r = previewCustomRewards(s, draft({ durationMin: 10, tier: 3 }));
    const t1 = questRewards({ tier: 1, baseXp: tierDefaults[1].baseXp, baseCoins: tierDefaults[1].baseCoins }, { difficulty: 'steady', bonus: false, timedBonus: false });
    expect(r).toEqual(t1);
  });
});

describe('cleanDraft', () => {
  it('trims, bounds and fills the tier', () => {
    const r = cleanDraft(draft({ title: '  Park   lap  ', durationMin: 20.4 }));
    expect('draft' in r && r.draft).toMatchObject({ title: 'Park lap', durationMin: 20, tier: 2, kind: 'timer' });
  });
  it('refuses what cannot be a quest', () => {
    expect(cleanDraft(draft({ title: '   ' }))).toHaveProperty('error');
    expect(cleanDraft(draft({ durationMin: undefined }))).toHaveProperty('error');
    expect(cleanDraft(draft({ durationMin: 0 }))).toHaveProperty('error');
    expect(cleanDraft(draft({ durationMin: 241 }))).toHaveProperty('error');
    expect(cleanDraft(draft({ kind: 'count', targetCount: 0 }))).toHaveProperty('error');
    expect(cleanDraft(draft({ kind: 'count', targetCount: 100 }))).toHaveProperty('error');
    expect(cleanDraft(draft({ recurrence: 'weekly:9' as never }))).toHaveProperty('error');
    expect(cleanDraft(draft({ habit: 'nope' as never }))).toHaveProperty('error');
    expect(cleanDraft(draft({ timeSlot: 'noon' as never }))).toHaveProperty('error');
  });
  it('turns weekly:7 into daily and keeps the pin only for weekly:1', () => {
    const daily = cleanDraft(draft({ recurrence: 'weekly:7' as never }));
    expect('draft' in daily && daily.draft.recurrence).toBe('daily');
    const pinned = cleanDraft(draft({ recurrence: 'weekly:1', pinWeekday: 3 }));
    expect('draft' in pinned && pinned.draft.pinWeekday).toBe(3);
    const loose = cleanDraft(draft({ recurrence: 'weekly:2', pinWeekday: 3 }));
    expect('draft' in loose && loose.draft.pinWeekday).toBeUndefined();
  });
  it('clips the title at 40 characters', () => {
    const r = cleanDraft(draft({ title: 'x'.repeat(80) }));
    expect('draft' in r && r.draft.title).toHaveLength(40);
  });
});

describe('addCustomTemplate', () => {
  it('saves a template with an id, zero stats and the right tier, without touching the input', () => {
    const s = deepFreeze(freshWithBoard());
    const r = addCustomTemplate(s, T0, draft());
    expect(r.error).toBeUndefined();
    expect(r.templateId).toMatch(/^c-[0-9a-f]{8}$/);
    expect(r.events).toEqual([{ type: 'customSaved', templateId: r.templateId }]);
    const t = r.save.customTemplates[0];
    expect(t).toMatchObject({ habit: 'move', kind: 'timer', durationMin: 20, tier: 2, recurrence: 'once', source: 'text', createdAt: T0 });
    expect(t?.stats).toEqual({ issued: 0, done: 0, tried: 0 });
    expect(s.customTemplates).toHaveLength(0);
  });
  it('holds a tier request to the cap', () => {
    const { save, id } = withTemplate(fresh(), { kind: 'check', durationMin: undefined, tier: 3, title: 'Tidy desk' });
    expect(save.customTemplates.find((c) => c.id === id)?.tier).toBe(2);
  });
  it('refuses a duplicate name in the same habit and the 31st template', () => {
    const { save } = withTemplate(fresh());
    expect(addCustomTemplate(save, T0, draft({ title: 'PARK LAP' })).error).toMatch(/already have/);
    expect(addCustomTemplate(save, T0, draft({ title: 'Park lap', habit: 'outside' })).error).toBeUndefined();
    let s = fresh();
    for (let i = 0; i < MAX_ACTIVE_CUSTOM; i++) s = withTemplate(s, { title: `Quest ${i}` }, T0 + i).save;
    expect(addCustomTemplate(s, T0, draft({ title: 'One too many' })).error).toMatch(/archive one/);
  });
  it('gives the same two quests different ids even at the same instant', () => {
    let s = fresh();
    const a = withTemplate(s, { title: 'A thing' });
    s = a.save;
    const b = withTemplate(s, { title: 'A thing', habit: 'clean' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('addCustomQuestToBoard', () => {
  it('adds a quest at the end of today\'s board, never the Bonus contract', () => {
    const base = freshWithBoard();
    const bonusBefore = base.board?.bonusId;
    const n = base.board?.quests.length ?? 0;
    const { save, id } = withTemplate(base, { kind: 'timer', durationMin: 120, tier: 3, title: 'Long hike' });
    const r = addCustomQuestToBoard(save, T0, id, TZ);
    expect(r.error).toBeUndefined();
    expect(r.instanceId).toBe(`${DAY0}-${id}`);
    expect(r.save.board?.quests).toHaveLength(n + 1);
    const q = r.save.board?.quests.at(-1);
    expect(q).toMatchObject({ templateId: id, status: 'open', kind: 'timer', habit: 'move' });
    expect(q?.timer).toEqual({ startedAt: null, accumulatedMs: 0 });
    expect(r.save.board?.bonusId).toBe(bonusBefore);
    expect(r.save.board?.bonusId).not.toBe(r.instanceId);
    expect(r.save.customTemplates[0]?.stats.issued).toBe(1);
    expect(r.events).toEqual([{ type: 'customBoarded', instanceId: r.instanceId }]);
  });
  it('allows two of your own and refuses the third, a repeat, and a missing template', () => {
    let s = freshWithBoard();
    const ids = ['One', 'Two', 'Three'].map((title) => {
      const r = withTemplate(s, { title });
      s = r.save;
      return r.id;
    });
    s = board(s, ids[0] ?? '');
    s = board(s, ids[1] ?? '');
    expect(customOnBoardCount(s)).toBe(MAX_CUSTOM_ON_BOARD);
    expect(addCustomQuestToBoard(s, T0, ids[2] ?? '', TZ).error).toMatch(/two of your own/);
    expect(addCustomQuestToBoard(s, T0, ids[0] ?? '', TZ).error).toMatch(/already on today/);
    expect(addCustomQuestToBoard(s, T0, 'c-00000000', TZ).error).toMatch(/not in My quests/);
  });
  it('refuses with no board for today, a disabled habit, and an away vassal', () => {
    const { save, id } = withTemplate(freshWithBoard());
    expect(addCustomQuestToBoard(save, at(3), id, TZ).error).toMatch(/no board for today/);
    expect(addCustomQuestToBoard({ ...fresh(), customTemplates: save.customTemplates }, T0, id, TZ).error).toMatch(/no board for today/);
    const off = { ...save, settings: { ...save.settings, enabledHabits: save.settings.enabledHabits.filter((h) => h !== 'move') } };
    expect(addCustomQuestToBoard(off, T0, id, TZ).error).toMatch(/switched off/);
    const away: SaveFile = { ...save, vassals: { ...save.vassals, move: { ...save.vassals.move, away: true } } };
    expect(addCustomQuestToBoard(away, T0, id, TZ).error).toMatch(/is away/);
  });
});

describe('custom quests on the board behave like any quest', () => {
  it('a timer pays the tier formula, trusts the vassal, counts in the stats and undoes exactly', () => {
    const { save: s1, id } = withTemplate(freshWithBoard(), { durationMin: 20 });
    const s2 = board(s1, id);
    const q = s2.board?.quests.at(-1);
    const iid = q?.instanceId ?? '';
    const before = s2;
    const started = startTimer(s2, iid, T0);
    expect(started.error).toBeUndefined();
    const done = completeQuest(started.save, iid, T0 + 21 * 60_000);
    expect(done.error).toBeUndefined();
    const dq = done.save.board?.quests.find((x) => x.instanceId === iid);
    expect(dq?.status).toBe('done');
    expect(dq?.timedBonus).toBe(true);
    const expected = questRewards(
      { tier: 2, baseXp: tierDefaults[2].baseXp, baseCoins: tierDefaults[2].baseCoins },
      { difficulty: 'steady', bonus: false, timedBonus: true },
    );
    expect(dq?.rewards).toMatchObject({ xp: expected.xp, coins: expected.coins, dp: 2 });
    expect(done.save.stats.questsTotal).toBe(1);
    expect(done.save.vassals.move.lifetimeQuests).toBe(1);
    expect(done.save.vassals.move.lastActiveDay).toBe(DAY0);
    expect(done.save.customTemplates[0]?.stats).toEqual({ issued: 1, done: 1, tried: 0 });
    expect(done.events[0]).toMatchObject({ type: 'questDone', habit: 'move' });

    const undone = undoQuest(done.save, iid, T0 + 22 * 60_000, TZ);
    expect(undone.error).toBeUndefined();
    expect(undone.save.player).toEqual(before.player);
    expect(undone.save.vassals.move.xp).toBe(before.vassals.move.xp);
    expect(undone.save.customTemplates[0]?.stats).toEqual({ issued: 1, done: 0, tried: 0 });
    expect(undone.save.stats.questsTotal).toBe(0);
  });
  it('a counter completes at its target', () => {
    const { save: s1, id } = withTemplate(freshWithBoard(), { kind: 'count', durationMin: undefined, targetCount: 3, title: 'Glasses', habit: 'eat' });
    const s2 = board(s1, id);
    const iid = s2.board?.quests.at(-1)?.instanceId ?? '';
    let s = s2;
    for (let i = 0; i < 3; i++) s = incrementCount(s, iid, 1, T0, TZ).save;
    expect(s.board?.quests.find((x) => x.instanceId === iid)).toMatchObject({ status: 'done', count: 3 });
    expect(s.customTemplates[0]?.stats.done).toBe(1);
  });
  it('a sleep quest of your own restores the power utility like a built-in', () => {
    const { save: s1, id } = withTemplate(freshWithBoard(), { kind: 'check', durationMin: undefined, habit: 'sleep', title: 'Lights out' });
    const low: SaveFile = { ...s1, utilities: { ...s1.utilities, power: { ...s1.utilities.power, value: 40 } } };
    const iid = board(low, id).board?.quests.at(-1)?.instanceId ?? '';
    const done = completeQuest(board(low, id), iid, T0);
    expect(done.save.utilities.power.value).toBe(65);
  });
  it('"tried" counts for trust and the stats, and finishing it later takes the attempt back', () => {
    const { save: s1, id } = withTemplate(freshWithBoard());
    const s2 = board(s1, id);
    const iid = s2.board?.quests.at(-1)?.instanceId ?? '';
    const tried = markTried(s2, iid, T0);
    expect(tried.save.customTemplates[0]?.stats).toEqual({ issued: 1, done: 0, tried: 1 });
    expect(tried.save.vassals.move.lastActiveDay).toBe(DAY0);
    const done = completeQuest(tried.save, iid, T0);
    expect(done.save.customTemplates[0]?.stats).toEqual({ issued: 1, done: 1, tried: 0 });
  });
  it('is not swappable', () => {
    const { save: s1, id } = withTemplate(freshWithBoard());
    const s2: SaveFile = { ...board(s1, id), player: { ...s1.player, coins: 500 } };
    const r = rerollQuest(s2, s2.board?.quests.at(-1)?.instanceId ?? '', T0);
    expect(r.error).toMatch(/not swapped/);
  });
  it('resolves through the template lookup, archived or not', () => {
    const { save, id } = withTemplate(fresh());
    expect(resolveTemplate(save, id)).toMatchObject({ id, tier: 2, baseXp: tierDefaults[2].baseXp, tags: ['custom'] });
    const archived = archiveCustomTemplate(save, T0 + 1, id, TZ).save;
    expect(resolveTemplate(archived, id)?.title).toBe('Park lap');
    expect(resolveTemplate(save, 'move.stretch')?.id).toBe('move.stretch');
    expect(resolveTemplate(save, 'c-nothere')).toBeUndefined();
  });
});

describe('updateCustomTemplate', () => {
  it('edits fields, re-derives the tier from the new effort and clears fields of the old kind', () => {
    const { save, id } = withTemplate(fresh());
    const longer = updateCustomTemplate(save, T0, id, { durationMin: 45 }, TZ);
    expect(longer.save.customTemplates[0]).toMatchObject({ durationMin: 45, tier: 3 });
    const counter = updateCustomTemplate(longer.save, T0, id, { kind: 'count', targetCount: 4 }, TZ);
    expect(counter.save.customTemplates[0]?.durationMin).toBeUndefined();
    expect(counter.save.customTemplates[0]).toMatchObject({ kind: 'count', targetCount: 4, tier: 1 });
    const retitled = updateCustomTemplate(counter.save, T0, id, { title: 'Glasses', tier: 2 }, TZ);
    expect(retitled.save.customTemplates[0]).toMatchObject({ title: 'Glasses', tier: 2 });
  });
  it('sets and clears a pinned weekday through the recurrence', () => {
    const { save, id } = withTemplate(fresh());
    const pinned = updateCustomTemplate(save, T0, id, { recurrence: 'weekly:1', pinWeekday: 2 }, TZ);
    expect(pinned.save.customTemplates[0]).toMatchObject({ recurrence: 'weekly:1', pinWeekday: 2 });
    const daily = updateCustomTemplate(pinned.save, T0, id, { recurrence: 'daily' }, TZ);
    expect(daily.save.customTemplates[0]?.pinWeekday).toBeUndefined();
  });
  it('refuses unknown, archived and invalid edits and a habit change while on the board', () => {
    const { save, id } = withTemplate(freshWithBoard());
    expect(updateCustomTemplate(save, T0, 'c-nope', { title: 'x' }, TZ).error).toMatch(/not in My quests/);
    expect(updateCustomTemplate(save, T0, id, { durationMin: 999 }, TZ).error).toBeDefined();
    const onBoard = board(save, id);
    expect(updateCustomTemplate(onBoard, T0, id, { habit: 'outside' }, TZ).error).toMatch(/from tomorrow/);
    expect(updateCustomTemplate(onBoard, T0, id, { title: 'Park lap 2' }, TZ).error).toBeUndefined();
    const archived = archiveCustomTemplate(save, T0, id, TZ).save;
    expect(updateCustomTemplate(archived, T0, id, { title: 'x' }, TZ).error).toMatch(/not in My quests/);
  });
  it('refuses a rename onto another quest of the same habit', () => {
    const a = withTemplate(fresh(), { title: 'Alpha' });
    const b = withTemplate(a.save, { title: 'Beta' });
    expect(updateCustomTemplate(b.save, T0, b.id, { title: 'alpha' }, TZ).error).toMatch(/already have/);
  });
});

describe('archiveCustomTemplate', () => {
  it('stops recurrence, takes an untouched copy off today\'s board and keeps a settled one', () => {
    const { save: s1, id } = withTemplate(freshWithBoard(), { recurrence: 'daily' });
    const open = board(s1, id);
    const archived = archiveCustomTemplate(open, T0, id, TZ);
    expect(archived.error).toBeUndefined();
    expect(archived.events).toEqual([{ type: 'customArchived', templateId: id }]);
    expect(archived.save.customTemplates[0]?.archivedAt).toBe(T0);
    expect(archived.save.board?.quests.some((q) => q.templateId === id)).toBe(false);
    expect(activeCustomTemplates(archived.save)).toHaveLength(0);

    const iid = open.board?.quests.at(-1)?.instanceId ?? '';
    const settled = completeQuest(open, iid, T0).save;
    const keep = archiveCustomTemplate(settled, T0, id, TZ).save;
    expect(keep.board?.quests.find((q) => q.templateId === id)?.status).toBe('done');
    expect(undoQuest(keep, iid, T0, TZ).error).toBeUndefined();

    expect(addCustomQuestToBoard(archived.save, T0, id, TZ).error).toMatch(/not in My quests/);
    expect(archiveCustomTemplate(archived.save, T0, id, TZ).error).toMatch(/not in My quests/);
    const next = processBoundaries(archived.save, at(1), TZ).save;
    expect(next.board?.quests.some((q) => q.templateId === id)).toBe(false);
  });
  it('can be archived and then a same-named quest created again', () => {
    const { save, id } = withTemplate(fresh());
    const archived = archiveCustomTemplate(save, T0, id, TZ).save;
    expect(addCustomTemplate(archived, T0 + 5, draft()).error).toBeUndefined();
  });
});

describe('recurrence', () => {
  it('knows the weekday of a game day (T0 is a Monday)', () => {
    expect(weekdayOf(DAY0)).toBe(1);
    expect(weekdayOf(DAY0 + 6)).toBe(0);
  });
  it('once never recurs, daily always, weekdays Monday to Friday', () => {
    const t = { id: 'c-aaaaaaaa', pinWeekday: undefined } as const;
    for (let d = 0; d < 14; d++) {
      expect(recurrenceDue({ ...t, recurrence: 'once' }, DAY0 + d)).toBe(false);
      expect(recurrenceDue({ ...t, recurrence: 'daily' }, DAY0 + d)).toBe(true);
      const wd = weekdayOf(DAY0 + d);
      expect(recurrenceDue({ ...t, recurrence: 'weekdays' }, DAY0 + d)).toBe(wd >= 1 && wd <= 5);
    }
  });
  it('weekly:N lands on exactly N days of every week, spread out', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const r = `weekly:${n}` as const;
      for (const id of ['c-00000001', 'c-deadbeef', 'c-12345678']) {
        for (let week = 0; week < 3; week++) {
          const days = Array.from({ length: 7 }, (_, i) => DAY0 + week * 7 + i).filter((d) => recurrenceDue({ id, recurrence: r, pinWeekday: undefined }, d));
          expect(days, `${id} ${r} week ${week}`).toHaveLength(n);
        }
      }
    }
  });
  it('weekly:1 with a pinned weekday lands only on it', () => {
    const t = { id: 'c-aaaaaaaa', recurrence: 'weekly:1' as const, pinWeekday: 3 };
    const days = Array.from({ length: 14 }, (_, i) => DAY0 + i).filter((d) => recurrenceDue(t, d));
    expect(days.map(weekdayOf)).toEqual([3, 3]);
  });
});

describe('recurring quests on the next board', () => {
  it('places a daily quest on every new board, on top of the generated ones', () => {
    const base = freshWithBoard();
    const generated = base.board?.quests.length ?? 0;
    const { save, id } = withTemplate(base, { recurrence: 'daily', title: 'Daily lap' });
    const d1 = processBoundaries(save, at(1), TZ);
    expect(d1.save.board?.quests).toHaveLength(generated + 1);
    expect(d1.save.board?.quests.at(-1)?.templateId).toBe(id);
    expect(d1.save.board?.bonusId).not.toBe(`${DAY0 + 1}-${id}`);
    expect(d1.save.customTemplates[0]?.stats.issued).toBe(1);
    // A plain re-open on the same day adds nothing.
    expect(processBoundaries(d1.save, at(1, 15), TZ).save.board?.quests).toHaveLength(generated + 1);
    const d2 = processBoundaries(d1.save, at(2), TZ);
    expect(d2.save.board?.quests.filter((q) => q.templateId === id)).toHaveLength(1);
    expect(d2.save.customTemplates[0]?.stats.issued).toBe(2);
  });
  it('respects the limit of two and rotates the third in', () => {
    let s = freshWithBoard();
    const ids = ['A', 'B', 'C'].map((title, i) => {
      const r = withTemplate(s, { recurrence: 'daily', title }, T0 + i);
      s = r.save;
      return r.id;
    });
    const d1 = processBoundaries(s, at(1), TZ).save;
    expect(customOnBoardCount(d1)).toBe(2);
    expect(d1.board?.quests.filter((q) => ids.includes(q.templateId)).map((q) => q.templateId)).toEqual([ids[0], ids[1]]);
    const d2 = processBoundaries(d1, at(2), TZ).save;
    expect(customOnBoardCount(d2)).toBe(2);
    expect(d2.board?.quests.some((q) => q.templateId === ids[2])).toBe(true);
  });
  it('skips a switched-off habit and an away vassal, and places weekday-pinned ones only on their day', () => {
    let s = freshWithBoard();
    s = withTemplate(s, { recurrence: 'daily', title: 'Daily lap' }).save;
    s = withTemplate(s, { recurrence: 'weekly:1', pinWeekday: 2, title: 'Tuesday lap', habit: 'outside' }).save;
    const off: SaveFile = { ...s, settings: { ...s.settings, enabledHabits: s.settings.enabledHabits.filter((h) => h !== 'move') } };
    const d1 = processBoundaries(off, at(1), TZ).save; // Tuesday
    expect(d1.board?.quests.some((q) => q.habit === 'move' && q.templateId.startsWith('c-'))).toBe(false);
    expect(d1.board?.quests.some((q) => q.templateId.startsWith('c-') && q.habit === 'outside')).toBe(true);
    const d2 = processBoundaries(d1, at(2), TZ).save; // Wednesday
    expect(d2.board?.quests.some((q) => q.templateId.startsWith('c-') && q.habit === 'outside')).toBe(false);
  });
  it('is deterministic: the same save and day give the same board', () => {
    const { save } = withTemplate(freshWithBoard(), { recurrence: 'daily' });
    expect(processBoundaries(save, at(1), TZ).save).toEqual(processBoundaries(save, at(1), TZ).save);
  });
  it('keeps pre-existing generation untouched when no custom quest is due', () => {
    const s = freshWithBoard();
    const withUnused = withTemplate(s, { recurrence: 'once' }).save;
    const a = processBoundaries(s, at(1), TZ).save.board;
    const b = processBoundaries(withUnused, at(1), TZ).save.board;
    expect(b).toEqual(a);
  });
});

describe('migration of a board holding a custom quest', () => {
  it('keeps the quest when its template is present and drops it when it is not', () => {
    const { save: s1, id } = withTemplate(freshWithBoard());
    const s2 = board(s1, id);
    const back = migrate(JSON.parse(JSON.stringify(s2)), T0, TZ);
    expect(back.board?.quests.some((q) => q.templateId === id)).toBe(true);
    expect(back.customTemplates).toEqual(s2.customTemplates);
    const stripped = JSON.parse(JSON.stringify({ ...s2, customTemplates: [] }));
    expect(migrate(stripped, T0, TZ).board?.quests.some((q) => q.templateId === id)).toBe(false);
  });
  it('setBoard fixtures still work with shipped templates', () => {
    const s = setBoard(freshWithBoard(), DAY0, ['move.stretch']);
    expect(s.board?.quests[0]?.templateId).toBe('move.stretch');
  });
});
