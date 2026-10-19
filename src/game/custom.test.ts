import { describe, expect, it } from 'vitest';
import { completeQuest, incrementCount, markTried, pauseTimer, rerollQuest, startTimer, undoQuest } from './board';
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
  customCopyInProgress,
  customTitleTaken,
  draftOf,
  recurrenceDue,
  restoreCustomTemplate,
  updateCustomTemplate,
} from './custom';
import { questRewards } from './economy';
import { migrate } from './save';
import { effortTier, maxTier, resolveTemplate, resolveTier, weekdayOf } from './template';
import { T0, TZ, at, deepFreeze, fresh, freshWithBoard, setBoard } from './testUtils';
import { processBoundaries } from './tick';
import { gameDayIndex } from './time';
import type { CustomDraft, CustomTemplate, SaveFile } from './types';

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
  it('refuses unknown, archived and invalid edits', () => {
    const { save, id } = withTemplate(freshWithBoard());
    expect(updateCustomTemplate(save, T0, 'c-nope', { title: 'x' }, TZ).error).toMatch(/not in My quests/);
    expect(updateCustomTemplate(save, T0, id, { durationMin: 999 }, TZ).error).toBeDefined();
    const onBoard = board(save, id);
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

describe('updateCustomTemplate: every editable field', () => {
  it('applies title, description, habit, kind, count, recurrence, pinned weekday and time slot together', () => {
    const { save, id } = withTemplate(freshWithBoard(), { recurrence: 'daily', timeSlot: 'morning' });
    const before = save.customTemplates[0];
    const r = updateCustomTemplate(
      save,
      T0,
      id,
      { title: 'Read a chapter', description: 'Before bed.', habit: 'study', kind: 'count', targetCount: 3, recurrence: 'weekly:1', pinWeekday: 3, timeSlot: 'evening' },
      TZ,
    );
    expect(r.error).toBeUndefined();
    expect(r.events).toEqual([{ type: 'customUpdated', templateId: id }]);
    const t = r.save.customTemplates[0];
    expect(t).toMatchObject({ title: 'Read a chapter', description: 'Before bed.', habit: 'study', kind: 'count', targetCount: 3, tier: 1, recurrence: 'weekly:1', pinWeekday: 3, timeSlot: 'evening' });
    expect(t?.durationMin).toBeUndefined();
    // Identity, history and origin are never part of an edit.
    expect(t).toMatchObject({ id, createdAt: before?.createdAt, source: before?.source, stats: before?.stats });
    expect(r.save.log.at(-1)).toMatchObject({ kind: 'customUpdated' });
  });
  it('does not mutate its input', () => {
    const { save, id } = withTemplate(fresh());
    deepFreeze(save);
    expect(updateCustomTemplate(save, T0, id, { title: 'Longer lap', durationMin: 40 }, TZ).error).toBeUndefined();
  });
  it('sets and clears the outpost, and refuses one that does not exist', () => {
    const { save, id } = withTemplate(fresh());
    expect(updateCustomTemplate(save, T0, id, { outpostId: 'o-nope' }, TZ).error).toMatch(/unknown outpost/);
    const stale = structuredClone(save);
    const s0 = stale.customTemplates[0];
    if (s0) s0.outpostId = 'o-gone';
    // An outpost retired since the quest was saved never blocks an unrelated edit; it is let go.
    const edited = updateCustomTemplate(stale, T0, id, { title: 'Park lap 2' }, TZ);
    expect(edited.error).toBeUndefined();
    expect(edited.save.customTemplates[0]?.outpostId).toBeUndefined();
    const cleared = updateCustomTemplate(stale, T0, id, { outpostId: null }, TZ);
    expect(cleared.save.customTemplates[0]?.outpostId).toBeUndefined();
  });
});

describe('updateCustomTemplate: the tier is re-capped by the effort rules', () => {
  it('holds a requested tier to the cap of the new kind and duration', () => {
    const { save, id } = withTemplate(fresh(), { kind: 'check', durationMin: undefined, tier: 2 });
    const asked = updateCustomTemplate(save, T0, id, { tier: 3 }, TZ);
    expect(asked.save.customTemplates[0]?.tier).toBe(2);
    const timer = updateCustomTemplate(save, T0, id, { kind: 'timer', durationMin: 10, tier: 3 }, TZ);
    expect(timer.save.customTemplates[0]?.tier).toBe(1);
    const long = updateCustomTemplate(save, T0, id, { kind: 'timer', durationMin: 45, tier: 3 }, TZ);
    expect(long.save.customTemplates[0]?.tier).toBe(3);
  });
  it('follows the effort when the patch changes it and sets no tier, and keeps a manual tier otherwise', () => {
    const { save, id } = withTemplate(fresh(), { durationMin: 45 });
    expect(save.customTemplates[0]?.tier).toBe(3);
    const shorter = updateCustomTemplate(save, T0, id, { durationMin: 10 }, TZ);
    expect(shorter.save.customTemplates[0]?.tier).toBe(1);
    const lowered = updateCustomTemplate(save, T0, id, { tier: 2 }, TZ);
    expect(lowered.save.customTemplates[0]?.tier).toBe(2);
    const renamed = updateCustomTemplate(lowered.save, T0, id, { title: 'Long walk' }, TZ);
    expect(renamed.save.customTemplates[0]?.tier).toBe(2);
    const toCheck = updateCustomTemplate(save, T0, id, { kind: 'check' }, TZ);
    expect(toCheck.save.customTemplates[0]).toMatchObject({ kind: 'check', tier: 1 });
    expect(toCheck.save.customTemplates[0]?.durationMin).toBeUndefined();
  });
  it('never lets an edit pay more than a built-in of the same effort', () => {
    const { save, id } = withTemplate(fresh(), { durationMin: 10 });
    const pushed = updateCustomTemplate(save, T0, id, { tier: 3 }, TZ).save;
    expect(pushed.customTemplates[0]?.tier).toBe(1);
    expect(resolveTemplate(pushed, id)?.baseXp).toBe(tierDefaults[1].baseXp);
  });
});

/** The patch the store sends from the Compose sheet: every field of the form, `outpostId` as null when empty. */
function formPatch(t: CustomTemplate, over: Partial<CustomDraft> = {}): Partial<Omit<CustomDraft, 'source'>> {
  const { source: _source, ...patch } = { ...draftOf(t), ...over };
  return { ...patch, outpostId: patch.outpostId ?? null };
}

/** Move a template to the board of day 0 and return the save and the board copy's instance id. */
function boarded(over: Partial<CustomDraft> = {}): { save: SaveFile; id: string; iid: string } {
  const made = withTemplate(freshWithBoard(), over);
  const save = board(made.save, made.id);
  return { save, id: made.id, iid: save.board?.quests.at(-1)?.instanceId ?? '' };
}

function paidFor(save: SaveFile, iid: string, now = T0): { xp: number; coins: number; dp: number } | undefined {
  const r = completeQuest(save, iid, now).save.board?.quests.find((x) => x.instanceId === iid)?.rewards;
  return r ? { xp: r.xp, coins: r.coins, dp: r.dp } : undefined;
}

describe('updateCustomTemplate: edits are for future boards', () => {
  it('lets name, note, time slot and recurrence change whatever the copy on the board is doing', () => {
    const { save, id, iid } = boarded({ durationMin: 20 });
    const running = startTimer(save, iid, T0).save;
    const edited = updateCustomTemplate(running, T0, id, { title: 'Park lap (slow)', description: 'Easy.', timeSlot: 'evening', recurrence: 'daily' }, TZ);
    expect(edited.error).toBeUndefined();
    expect(edited.save.customTemplates[0]).toMatchObject({ title: 'Park lap (slow)', timeSlot: 'evening', recurrence: 'daily', durationMin: 20 });
  });

  it('an untouched copy on today\'s board takes the new shape in place (a daily quest can be edited any day)', () => {
    const { save, id, iid } = boarded({ durationMin: 15, recurrence: 'daily' });
    const before = paidFor(save, iid);
    const edited = updateCustomTemplate(save, T0, id, { durationMin: 45 }, TZ);
    expect(edited.error).toBeUndefined();
    expect(edited.save.customTemplates[0]).toMatchObject({ durationMin: 45, tier: 3 });
    const copy = edited.save.board?.quests.find((q) => q.instanceId === iid);
    expect(copy).toMatchObject({ status: 'open', kind: 'timer', habit: 'move', timer: { startedAt: null, accumulatedMs: 0 } });
    // It pays the new tier, which is the tier-3 formula, not the old one.
    const after = paidFor(edited.save, iid);
    expect(before?.dp).toBe(1);
    expect(after?.xp).toBeGreaterThan(before?.xp ?? 0);
    expect(after?.dp).toBe(3);
    // Habit and kind follow too: the board copy is rebuilt to match.
    const other = updateCustomTemplate(edited.save, T0, id, { habit: 'study', kind: 'count', targetCount: 3 }, TZ);
    expect(other.error).toBeUndefined();
    expect(other.save.board?.quests.find((q) => q.instanceId === iid)).toMatchObject({ habit: 'study', kind: 'count', count: 0, timer: null });
    const done = incrementCount(other.save, iid, 3, T0);
    expect(done.save.board?.quests.find((q) => q.instanceId === iid)?.status).toBe('done');
    expect(done.save.board?.quests.find((q) => q.instanceId === iid)?.habit).toBe('study');
  });

  it('refuses a habit change for a vassal who is away or a habit that is off, while the copy is on the board', () => {
    const { save, id } = boarded();
    const away = structuredClone(save);
    away.vassals.study.away = true;
    expect(updateCustomTemplate(away, T0, id, { habit: 'study' }, TZ).error).toMatch(/is away/);
    const off = structuredClone(save);
    off.settings.enabledHabits = off.settings.enabledHabits.filter((h) => h !== 'study');
    expect(updateCustomTemplate(off, T0, id, { habit: 'study' }, TZ).error).toMatch(/switched off/);
  });

  it('holds habit, kind, length, count and tier while the copy is in progress, and says it is until settled', () => {
    const timerShapes: Partial<CustomDraft>[] = [{ habit: 'outside' }, { kind: 'check' }, { durationMin: 45 }, { tier: 1 }];
    const countShapes: Partial<CustomDraft>[] = [{ habit: 'outside' }, { kind: 'check' }, { targetCount: 9 }, { tier: 2 }];
    const checkShapes: Partial<CustomDraft>[] = [{ habit: 'outside' }, { kind: 'timer', durationMin: 20 }, { tier: 2 }];
    const check = (save: SaveFile, id: string, label: string, shapes = timerShapes): void => {
      for (const patch of shapes) expect(updateCustomTemplate(save, T0, id, patch, TZ).error, `${label} ${JSON.stringify(patch)}`).toMatch(/in progress.*once it is settled/);
      expect(updateCustomTemplate(save, T0, id, { title: 'Renamed' }, TZ).error, label).toBeUndefined();
    };
    const t = boarded({ durationMin: 20 });
    expect(customCopyInProgress(t.save, t.id)).toBe(false);
    const running = startTimer(t.save, t.iid, T0).save;
    expect(customCopyInProgress(running, t.id)).toBe(true);
    check(running, t.id, 'running timer');
    const paused = pauseTimer(startTimer(t.save, t.iid, T0).save, t.iid, T0 + 60_000).save;
    expect(customCopyInProgress(paused, t.id)).toBe(true);
    check(paused, t.id, 'paused with time on it');
    const c = boarded({ kind: 'count', durationMin: undefined, targetCount: 5, title: 'Glasses' });
    const counted = incrementCount(c.save, c.iid, 2, T0).save;
    check(counted, c.id, 'counter above zero', countShapes);
    const k = boarded({ title: 'Attempt', kind: 'check', durationMin: undefined });
    check(markTried(k.save, k.iid, T0).save, k.id, 'tried', checkShapes);
  });

  it('a settled copy keeps its reward snapshot and undo reverts it exactly; the new shape applies from the next copy', () => {
    const { save, id, iid } = boarded({ durationMin: 20 });
    const done = completeQuest(save, iid, T0);
    const snap = done.save.board?.quests.find((q) => q.instanceId === iid)?.rewards;
    expect(snap?.xp).toBeGreaterThan(0);
    const edited = updateCustomTemplate(done.save, T0, id, { durationMin: 45 }, TZ);
    expect(edited.error).toBeUndefined();
    expect(edited.save.customTemplates[0]).toMatchObject({ durationMin: 45, tier: 3 });
    const q = edited.save.board?.quests.find((x) => x.instanceId === iid);
    expect(q?.status).toBe('done');
    expect(q?.rewards).toEqual(snap);
    expect(edited.save.player.coins).toBe(done.save.player.coins);
    const undone = undoQuest(edited.save, iid, T0, TZ);
    expect(undone.error).toBeUndefined();
    expect(undone.save.player.coins).toBe(save.player.coins);
    expect(undone.save.player.domainPoints).toBe(save.player.domainPoints);
    // Tomorrow's copy is the new shape.
    const next = addCustomQuestToBoard(processBoundaries(edited.save, at(1), TZ).save, at(1), id, TZ);
    expect(paidFor(next.save, next.instanceId ?? '', at(1))?.dp).toBe(3);
  });

  it('a daily quest can be edited on every day, whatever the board holds', () => {
    let s = withTemplate(freshWithBoard(), { recurrence: 'daily', durationMin: 15 }).save;
    const id = s.customTemplates[0]?.id ?? '';
    for (let day = 1; day <= 4; day++) {
      s = processBoundaries(s, at(day), TZ).save;
      expect(s.board?.quests.some((q) => q.templateId === id), `day ${day}`).toBe(true);
      const r = updateCustomTemplate(s, at(day), id, { durationMin: 15 + day * 10 }, TZ);
      expect(r.error, `day ${day}`).toBeUndefined();
      expect(r.save.customTemplates[0]?.durationMin).toBe(15 + day * 10);
      s = r.save;
    }
  });

  it('keeps holding a copy in progress on a board that has gone stale', () => {
    const { save, id, iid } = boarded({ durationMin: 20 });
    const running = startTimer(save, iid, T0).save;
    expect(updateCustomTemplate(running, at(1), id, { durationMin: 45 }, TZ).error).toMatch(/in progress/);
    // An untouched one on a stale board may change; the next tick replaces that board anyway.
    expect(updateCustomTemplate(save, at(1), id, { durationMin: 45 }, TZ).error).toBeUndefined();
  });

  it('a recurring template changed today is placed on tomorrow\'s board as edited', () => {
    const { save, id } = withTemplate(freshWithBoard(), { recurrence: 'daily', durationMin: 10 });
    const edited = updateCustomTemplate(save, T0, id, { title: 'Evening lap', durationMin: 45, timeSlot: 'evening' }, TZ).save;
    const next = processBoundaries(edited, at(1), TZ).save;
    expect(next.board?.quests.some((q) => q.templateId === id)).toBe(true);
    expect(resolveTemplate(next, id)).toMatchObject({ title: 'Evening lap', durationMin: 45, tier: 3 });
  });
});

describe('updateCustomTemplate: the exact patch the Compose sheet sends', () => {
  it('unpins a weekday when the form goes from "Every Wednesday" back to "Once a week"', () => {
    const { save, id } = withTemplate(fresh(), { recurrence: 'weekly:1', pinWeekday: 3 });
    const t = save.customTemplates[0] as CustomTemplate;
    expect(t.pinWeekday).toBe(3);
    const unpinned = updateCustomTemplate(save, T0, id, formPatch(t, { recurrence: 'weekly:1', pinWeekday: undefined }), TZ);
    expect(unpinned.error).toBeUndefined();
    expect(unpinned.save.customTemplates[0]).toMatchObject({ recurrence: 'weekly:1' });
    expect(unpinned.save.customTemplates[0]?.pinWeekday).toBeUndefined();
    // Another weekday, another recurrence and the same pin all still work from the full form.
    const other = updateCustomTemplate(save, T0, id, formPatch(t, { pinWeekday: 5 }), TZ);
    expect(other.save.customTemplates[0]?.pinWeekday).toBe(5);
    const same = updateCustomTemplate(save, T0, id, formPatch(t), TZ);
    expect(same.save.customTemplates[0]?.pinWeekday).toBe(3);
    const daily = updateCustomTemplate(save, T0, id, formPatch(t, { recurrence: 'daily', pinWeekday: undefined }), TZ);
    expect(daily.save.customTemplates[0]?.pinWeekday).toBeUndefined();
  });
  it('clears an outpost and keeps every other field when the form is saved untouched', () => {
    const { save, id } = withTemplate(fresh(), { recurrence: 'weekdays', timeSlot: 'morning', description: 'x' });
    const t = save.customTemplates[0] as CustomTemplate;
    const same = updateCustomTemplate(save, T0, id, formPatch(t), TZ);
    expect(same.error).toBeUndefined();
    expect(same.save.customTemplates[0]).toEqual(t);
  });
});

describe('the duplicate-title guard', () => {
  it('compares within the habit, ignoring case and spacing, and ignoring archived quests and itself', () => {
    const a = withTemplate(fresh(), { title: 'Alpha' });
    const b = withTemplate(a.save, { title: 'Beta' });
    expect(customTitleTaken(b.save, 'move', 'alpha')).toBe(true);
    expect(customTitleTaken(b.save, 'move', '  ALPHA  ')).toBe(true);
    expect(customTitleTaken(b.save, 'study', 'Alpha')).toBe(false);
    expect(customTitleTaken(b.save, 'move', 'Alpha', a.id)).toBe(false);
    expect(customTitleTaken(b.save, 'move', '   ')).toBe(false);
    const archived = archiveCustomTemplate(b.save, T0, a.id, TZ).save;
    expect(customTitleTaken(archived, 'move', 'Alpha')).toBe(false);
  });
  it('treats the same name typed with a different accent encoding, case, accents or invisible characters as the same', () => {
    const a = withTemplate(fresh(), { title: 'Caf\u00e9 walk' });
    expect(a.save.customTemplates[0]?.title).toBe('Caf\u00e9 walk');
    expect(customTitleTaken(a.save, 'move', 'Cafe\u0301 walk')).toBe(true);
    expect(customTitleTaken(a.save, 'move', 'CAFE walk')).toBe(true);
    expect(customTitleTaken(a.save, 'move', 'Caf\u00e9\u200b walk')).toBe(true);
    expect(customTitleTaken(a.save, 'move', 'Caf\u00e9 \u00a0 walk')).toBe(true);
    expect(customTitleTaken(a.save, 'move', 'Cafe walks')).toBe(false);
    // The engine refuses it too, and stores a name in one Unicode form.
    expect(addCustomTemplate(a.save, T0 + 1, draft({ title: 'Cafe\u0301 walk' })).error).toMatch(/already have/);
    const other = withTemplate(a.save, { title: 'Ide\u0301e' });
    expect(other.save.customTemplates[1]?.title).toBe('Id\u00e9e');
    expect(updateCustomTemplate(other.save, T0, other.id, { title: 'Cafe\u0301  Walk' }, TZ).error).toMatch(/already have/);
  });
  it('lets an unchanged title through an edit, and refuses moving onto a taken name in another habit', () => {
    const a = withTemplate(fresh(), { title: 'Alpha' });
    const b = withTemplate(a.save, { title: 'Alpha', habit: 'study', kind: 'check', durationMin: undefined });
    expect(updateCustomTemplate(b.save, T0, a.id, { title: 'Alpha', description: 'x' }, TZ).error).toBeUndefined();
    expect(updateCustomTemplate(b.save, T0, b.id, { habit: 'move' }, TZ).error).toMatch(/already have/);
  });
});

describe('restoreCustomTemplate', () => {
  it('clears archivedAt, keeps every other field and the history, and reports one event', () => {
    const { save, id } = withTemplate(freshWithBoard(), { recurrence: 'daily' });
    const archived = archiveCustomTemplate(save, T0, id, TZ).save;
    deepFreeze(archived);
    const r = restoreCustomTemplate(archived, T0 + 1000, id, TZ);
    expect(r.error).toBeUndefined();
    expect(r.templateId).toBe(id);
    expect(r.events).toEqual([{ type: 'customUpdated', templateId: id }]);
    const t = r.save.customTemplates[0];
    expect(t?.archivedAt).toBeUndefined();
    expect(t).toMatchObject({ id, title: 'Park lap', recurrence: 'daily', stats: { issued: 0, done: 0, tried: 0 } });
    expect(activeCustomTemplates(r.save)).toHaveLength(1);
    expect(r.save.log.at(-1)).toMatchObject({ kind: 'customRestored' });
    // Restoring does not put it on today's board by itself.
    expect(r.save.board?.quests.some((q) => q.templateId === id)).toBe(false);
  });
  it('refuses a template that is unknown or not archived', () => {
    const { save, id } = withTemplate(fresh());
    expect(restoreCustomTemplate(save, T0, id, TZ).error).toMatch(/not archived/);
    expect(restoreCustomTemplate(save, T0, 'c-nope', TZ).error).toMatch(/not archived/);
    expect(restoreCustomTemplate(save, T0, id, TZ).save).toBe(save);
  });
  it('refuses when an active quest of the same habit took its name meanwhile', () => {
    const { save, id } = withTemplate(fresh());
    const archived = archiveCustomTemplate(save, T0, id, TZ).save;
    const again = addCustomTemplate(archived, T0 + 5, draft());
    expect(again.error).toBeUndefined();
    expect(restoreCustomTemplate(again.save, T0, id, TZ).error).toMatch(/already have "Park lap"/);
    // Another habit with the same name does not clash.
    const other = addCustomTemplate(archived, T0 + 5, draft({ habit: 'study', kind: 'check', durationMin: undefined }));
    expect(restoreCustomTemplate(other.save, T0, id, TZ).error).toBeUndefined();
  });
  it('refuses at 30 active quests', () => {
    let s = fresh();
    const first = withTemplate(s, { title: 'Archived one' });
    s = archiveCustomTemplate(first.save, T0, first.id, TZ).save;
    for (let i = 0; i < MAX_ACTIVE_CUSTOM; i++) s = withTemplate(s, { title: `Filler ${i}`, habit: 'clean', kind: 'check', durationMin: undefined }, T0 + i).save;
    expect(restoreCustomTemplate(s, T0, first.id, TZ).error).toMatch(/archive one/);
  });
  it('lets go of an outpost that is gone', () => {
    const { save, id } = withTemplate(fresh());
    const s = structuredClone(save);
    const t = s.customTemplates[0];
    if (t) t.outpostId = 'o-gone';
    const archived = archiveCustomTemplate(s, T0, id, TZ).save;
    expect(restoreCustomTemplate(archived, T0, id, TZ).save.customTemplates[0]?.outpostId).toBeUndefined();
  });
  it('comes back on the board when recurring, never above two of your own', () => {
    let s = freshWithBoard();
    const ids: string[] = [];
    for (const title of ['One', 'Two', 'Three']) {
      const made = withTemplate(s, { title, habit: 'clean', kind: 'check', durationMin: undefined, recurrence: 'daily' }, T0 + ids.length);
      s = made.save;
      ids.push(made.id);
    }
    const third = ids[2] ?? '';
    s = archiveCustomTemplate(s, T0, third, TZ).save;
    const day1 = processBoundaries(s, at(1), TZ).save;
    expect(customOnBoardCount(day1)).toBe(2);
    expect(day1.board?.quests.some((q) => q.templateId === third)).toBe(false);
    // Restored, it competes for the two places like any other (fairest first), never exceeding them.
    const back = restoreCustomTemplate(day1, at(1), third, TZ).save;
    expect(customOnBoardCount(back)).toBe(2);
    expect(addCustomQuestToBoard(back, at(1), third, TZ).error).toMatch(/two of your own/);
    const day2 = processBoundaries(back, at(2), TZ).save;
    expect(customOnBoardCount(day2)).toBe(2);
    expect(day2.board?.quests.some((q) => q.templateId === third)).toBe(true);
  });
  it('can be put on today\'s board with "Add to today" once restored and there is room', () => {
    const solo = withTemplate(freshWithBoard(), { title: 'Solo' });
    const back = restoreCustomTemplate(archiveCustomTemplate(solo.save, T0, solo.id, TZ).save, T0, solo.id, TZ).save;
    expect(addCustomQuestToBoard(back, T0, solo.id, TZ).error).toBeUndefined();
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
