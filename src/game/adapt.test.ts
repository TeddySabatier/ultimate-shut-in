import { describe, expect, it } from 'vitest';
import {
  MAX_VISIBLE_PROPOSALS,
  OPEN_PROPOSAL_DAYS,
  SNOOZE_DAYS,
  acceptProposal,
  computeProposalsDraft,
  dismissProposal,
  evaluateProposals,
  openProposals,
  recordActivityDraft,
  smallerDraft,
  stepUpDraft,
} from './adapt';
import { markTried, completeQuest } from './board';
import { getQuest, strings } from './content';
import { addCustomTemplate, archiveCustomTemplate, customOnBoardCount } from './custom';
import { clone } from './draft';
import { ACTIVITY_DAYS } from './save';
import { weekdayOf } from './template';
import { T0, TZ, at, deepFreeze, fresh, freshWithBoard, setBoard } from './testUtils';
import { changeResetHour, processBoundaries } from './tick';
import { gameDayIndex } from './time';
import { HABIT_IDS, type ActivityEntry, type CustomDraft, type HabitId, type SaveFile } from './types';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);
/** A Friday, sixty days after first play. */
const TODAY = DAY0 + 60;

type Row = [day: number, templateId: string, habit: HabitId, status: 'done' | 'tried'];

/**
 * A save "TODAY" with the given settled history. Unless `quiet` is false every
 * habit also has one old completion, so rule 4 (idle for 14 days) stays out of
 * the way of the rule under test.
 */
function history(rows: Row[], over: Partial<SaveFile> = {}, quiet = true): SaveFile {
  const s = fresh();
  if (quiet) for (const h of HABIT_IDS) rows = [...rows, [TODAY - 10, `${h}.old`, h, 'done']];
  s.firstPlayDay = TODAY - 60;
  s.lastOpenDay = TODAY;
  const byDay = new Map<number, ActivityEntry[]>();
  for (const [day, templateId, habit, status] of rows) byDay.set(day, [...(byDay.get(day) ?? []), { templateId, habit, status }]);
  s.activity = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, entries]) => ({ day, entries }));
  return { ...s, ...over };
}

const rules = (s: SaveFile): string[] => evaluateProposals(s, TODAY).map((c) => `${c.rule}:${c.habit}`);

describe('rule 1: tried but never done in the last 7 days -> a smaller version', () => {
  it('halves the duration of the most-tried template and drops a tier', () => {
    const s = history([[TODAY - 2, 'move.workout', 'move', 'tried'], [TODAY - 4, 'move.workout', 'move', 'tried']]);
    const c = evaluateProposals(s, TODAY);
    expect(c).toHaveLength(1);
    const p = c[0];
    expect(p).toMatchObject({ rule: 'smaller', habit: 'move', title: strings.proposals.titles.smaller });
    const base = getQuest('move.workout');
    expect(p?.action).toMatchObject({ type: 'create', addToBoard: true, draft: { habit: 'move', kind: 'timer', durationMin: Math.round((base?.durationMin ?? 0) / 2), tier: base ? base.tier - 1 : 0, recurrence: 'once', source: 'proposal' } });
    expect(p?.reason).toContain('Move');
    expect(p?.reason).toContain(`${base?.title} (Mini)`);
  });
  it('never goes below 5 minutes and skips a template that cannot shrink, taking the next most tried', () => {
    expect(smallerDraft({ habit: 'move', kind: 'timer', title: 'Stretch', description: 'd', tier: 1, durationMin: 5 })).toBeNull();
    expect(smallerDraft({ habit: 'move', kind: 'timer', title: 'Jog', description: 'd', tier: 1, durationMin: 8 })?.durationMin).toBe(5);
    expect(smallerDraft({ habit: 'move', kind: 'check', title: 'Dance', description: 'd', tier: 1 })).toBeNull();
    expect(smallerDraft({ habit: 'move', kind: 'check', title: 'Sport', description: 'd', tier: 3 })?.tier).toBe(2);
    expect(smallerDraft({ habit: 'eat', kind: 'count', title: 'Glasses', description: 'd', tier: 2, targetCount: 8 })).toMatchObject({ targetCount: 4, tier: 1 });
    expect(smallerDraft({ habit: 'eat', kind: 'count', title: 'Glass', description: 'd', tier: 1, targetCount: 1 })).toBeNull();
    // Halved down to one, a counter becomes a plain check.
    expect(smallerDraft({ habit: 'hygiene', kind: 'count', title: 'Brush twice', description: 'd', tier: 1, targetCount: 2 })).toMatchObject({ kind: 'check', tier: 1, title: 'Brush twice (Mini)' });
    const s = history([
      [TODAY - 1, 'move.stretch', 'move', 'tried'],
      [TODAY - 2, 'move.stretch', 'move', 'tried'],
      [TODAY - 3, 'move.workout', 'move', 'tried'],
    ]);
    expect((evaluateProposals(s, TODAY)[0]?.action as { draft: CustomDraft }).draft.title).toBe(`${getQuest('move.workout')?.title} (Mini)`);
  });
  it('does not fire when something was done, when the attempt is older than 7 days, or for a habit that is off or away', () => {
    expect(rules(history([[TODAY - 2, 'move.workout', 'move', 'tried'], [TODAY - 3, 'move.run', 'move', 'done']]))).toEqual([]);
    expect(rules(history([[TODAY - 8, 'move.workout', 'move', 'tried']]))).toEqual([]);
    const off = history([[TODAY - 2, 'move.workout', 'move', 'tried']]);
    off.settings.enabledHabits = off.settings.enabledHabits.filter((h) => h !== 'move');
    expect(rules(off)).toEqual([]);
    const away = history([[TODAY - 2, 'move.workout', 'move', 'tried']]);
    away.vassals.move.away = true;
    expect(rules(away)).toEqual([]);
  });
  it('does not count other habits\' attempts', () => {
    expect(rules(history([[TODAY - 2, 'move.workout', 'move', 'tried'], [TODAY - 2, 'study.deep', 'study', 'done']]))).toEqual(['smaller:move']);
  });
});

describe('rule 2: done on 5+ of the last 7 days -> a step up', () => {
  const doneDays = (n: number, template = 'move.workout'): Row[] => Array.from({ length: n }, (_, i): Row => [TODAY - 1 - i, template, 'move', 'done']);
  it('steps a timer up by x1.5 (to 5 minutes, at most 120)', () => {
    const c = evaluateProposals(history(doneDays(5)), TODAY);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ rule: 'stepUp', habit: 'move' });
    const draft = (c[0]?.action as { draft: CustomDraft }).draft;
    expect(draft).toMatchObject({ kind: 'timer', durationMin: 60, tier: 3, recurrence: 'once', source: 'proposal' });
    expect(draft.title).toMatch(/\(Plus\)$/);
    expect(c[0]?.reason).toMatch(/5 of/);
  });
  it('needs five distinct days, not five quests', () => {
    expect(rules(history(doneDays(4)))).toEqual([]);
    const sameDays: Row[] = [
      [TODAY - 1, 'move.workout', 'move', 'done'],
      [TODAY - 1, 'move.run', 'move', 'done'],
      [TODAY - 2, 'move.workout', 'move', 'done'],
      [TODAY - 2, 'move.run', 'move', 'done'],
      [TODAY - 3, 'move.workout', 'move', 'done'],
    ];
    expect(rules(history(sameDays))).toEqual([]);
  });
  it('is held back during the first week of play and when the step cannot go higher', () => {
    const young = history(doneDays(5));
    young.firstPlayDay = TODAY - 6;
    expect(rules(young)).toEqual([]);
    expect(stepUpDraft({ habit: 'move', kind: 'timer', title: 'Long', description: 'd', tier: 3, durationMin: 120 })).toBeNull();
    expect(stepUpDraft({ habit: 'move', kind: 'check', title: 'Sport', description: 'd', tier: 2 })).toBeNull();
    expect(stepUpDraft({ habit: 'move', kind: 'check', title: 'Dance', description: 'd', tier: 1 })?.tier).toBe(2);
    expect(stepUpDraft({ habit: 'eat', kind: 'count', title: 'Glasses', description: 'd', tier: 1, targetCount: 4 })).toMatchObject({ targetCount: 6, tier: 1 });
    expect(stepUpDraft({ habit: 'move', kind: 'timer', title: 'Walk (Plus)', description: 'd', tier: 2, durationMin: 20 })).toBeNull();
    expect(stepUpDraft({ habit: 'move', kind: 'timer', title: 'Quick', description: 'd', tier: 1, durationMin: 10 })).toMatchObject({ durationMin: 15, tier: 1 });
  });
  it('is not proposed when the habit is the subject of rule 1 (one proposal per habit)', () => {
    const rows = [...doneDays(5)];
    expect(rules(history(rows))).toEqual(['stepUp:move']);
  });
});

describe('rule 3: a custom "once" quest settled 3+ times -> make it recurring', () => {
  function withCustom(done: number, recurrence: CustomDraft['recurrence'] = 'once'): { s: SaveFile; id: string } {
    const created = addCustomTemplate(fresh(), T0, {
      habit: 'study',
      kind: 'timer',
      durationMin: 25,
      title: 'Deep read',
      description: 'd',
      recurrence,
      timeSlot: 'any',
      source: 'text',
    });
    const s = created.save;
    s.firstPlayDay = TODAY - 60;
    s.lastOpenDay = TODAY;
    // Every habit has an old completion, so rule 4 stays quiet.
    s.activity = HABIT_IDS.map((h) => ({ day: TODAY - 10, entries: [{ templateId: `${h}.old`, habit: h, status: 'done' as const }] }));
    const id = created.templateId ?? '';
    const t = s.customTemplates[0];
    if (t) t.stats.done = done;
    return { s, id };
  }
  it('proposes a recurrence sized to how often it was done', () => {
    const { s, id } = withCustom(3);
    s.activity.push(...[3, 6, 9].map((d) => ({ day: TODAY - d, entries: [{ templateId: id, habit: 'study' as const, status: 'done' as const }] })));
    const c = evaluateProposals(s, TODAY);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ rule: 'makeRecurring', habit: 'study', action: { type: 'update', templateId: id, patch: { recurrence: 'weekly:2' } } });
    expect(c[0]?.reason).toContain('Deep read');
    expect(c[0]?.reason).toContain('twice a week');
  });
  it('goes daily when it was done most days', () => {
    const { s, id } = withCustom(9);
    s.activity.push(...Array.from({ length: 9 }, (_, i) => ({ day: TODAY - 1 - i, entries: [{ templateId: id, habit: 'study' as const, status: 'done' as const }] })));
    const c = evaluateProposals(s, TODAY).find((x) => x.rule === 'makeRecurring');
    expect(c?.action).toMatchObject({ patch: { recurrence: 'daily' } });
  });
  it('needs 3 completions and a "once" quest that is not archived', () => {
    expect(rules(withCustom(2).s)).toEqual([]);
    expect(rules(withCustom(5, 'daily').s)).toEqual([]);
    const archived = withCustom(5);
    const t = archived.s.customTemplates[0];
    if (t) t.archivedAt = T0;
    expect(rules(archived.s)).toEqual([]);
  });
});

describe('rule 4: nothing done for 14 days -> a five-minute foot in the door', () => {
  it('proposes the habit\'s warm 5-minute check, for every idle enabled habit', () => {
    const s = history([], {}, false);
    const c = evaluateProposals(s, TODAY);
    expect(c).toHaveLength(8);
    const move = c.find((x) => x.habit === 'move');
    expect(move).toMatchObject({ rule: 'footInDoor', title: strings.proposals.titles.footInDoor });
    expect(move?.action).toMatchObject({
      type: 'create',
      addToBoard: true,
      draft: { kind: 'check', tier: 1, title: strings.proposals.footInDoor.titles.move, description: strings.proposals.footInDoor.description, source: 'proposal' },
    });
    expect(move?.reason).not.toMatch(/fail|miss|lazy|should/i);
  });
  it('waits until two weeks of play, and a done quest in the window silences that habit', () => {
    const young = history([], {}, false);
    young.firstPlayDay = TODAY - 13;
    expect(rules(young)).toEqual([]);
    const some = rules(history([[TODAY - 14, 'move.workout', 'move', 'done']], {}, false));
    expect(some).not.toContain('footInDoor:move');
    expect(some).toContain('footInDoor:study');
    expect(rules(history([[TODAY - 15, 'move.workout', 'move', 'done']], {}, false))).toContain('footInDoor:move');
  });
  it('skips disabled and away habits', () => {
    const s = history([], {}, false);
    s.settings.enabledHabits = ['move', 'study'];
    s.vassals.study.away = true;
    expect(rules(s)).toEqual(['footInDoor:move']);
  });
  it('an attempt is not a finish, but rule 1 takes the habit first when it can', () => {
    const s = history([[TODAY - 2, 'move.workout', 'move', 'tried']], {}, false);
    expect(rules(s)).toContain('smaller:move');
    expect(rules(s)).not.toContain('footInDoor:move');
  });
});

describe('rule 5: the same weekday three weeks running -> pin it to that weekday', () => {
  /** The most recent day before TODAY with weekday `w`. */
  const lastOn = (w: number): number => {
    for (let d = TODAY - 1; ; d--) if (weekdayOf(d) === w) return d;
  };
  const threeTuesdays = (template = 'move.workout'): Row[] => [0, 7, 14].map((k): Row => [lastOn(2) - k, template, 'move', 'done']);
  it('creates a pinned weekly copy of a built-in', () => {
    const c = evaluateProposals(history(threeTuesdays()), TODAY).filter((x) => x.rule === 'pinWeekday');
    expect(c).toHaveLength(1);
    expect(c[0]?.reason).toContain('Tuesday');
    expect(c[0]?.action).toMatchObject({ type: 'create', addToBoard: false, draft: { recurrence: 'weekly:1', pinWeekday: 2, habit: 'move', title: getQuest('move.workout')?.title } });
  });
  it('updates a custom template instead of copying it', () => {
    const created = addCustomTemplate(fresh(), T0, { habit: 'move', kind: 'check', title: 'Pool', description: 'd', recurrence: 'once', timeSlot: 'any', source: 'text' });
    const id = created.templateId ?? '';
    const s = history(threeTuesdays(id), { customTemplates: created.save.customTemplates });
    const c = evaluateProposals(s, TODAY).find((x) => x.rule === 'pinWeekday');
    expect(c?.action).toEqual({ type: 'update', templateId: id, patch: { recurrence: 'weekly:1', pinWeekday: 2 } });
    const already = history(threeTuesdays(id), { customTemplates: created.save.customTemplates.map((t) => ({ ...t, recurrence: 'weekly:1' as const, pinWeekday: 2 })) });
    expect(rules(already)).not.toContain('pinWeekday:move');
  });
  it('needs three in a row, a young-enough history, and a habit that is not already daily', () => {
    expect(rules(history(threeTuesdays().slice(0, 2)))).not.toContain('pinWeekday:move');
    const gap: Row[] = [[lastOn(2), 'move.workout', 'move', 'done'], [lastOn(2) - 7, 'move.workout', 'move', 'done'], [lastOn(2) - 21, 'move.workout', 'move', 'done']];
    expect(rules(history(gap))).not.toContain('pinWeekday:move');
    const young = history(threeTuesdays());
    young.firstPlayDay = TODAY - 20;
    expect(rules(young)).not.toContain('pinWeekday:move');
    const daily: Row[] = Array.from({ length: 21 }, (_, i): Row => [TODAY - 1 - i, 'move.workout', 'move', 'done']);
    expect(rules(history(daily))).not.toContain('pinWeekday:move');
  });
  it('other done days do not break the pattern', () => {
    const rows = [...threeTuesdays(), [lastOn(2) - 1, 'move.run', 'move', 'done'] as Row, [lastOn(2) - 8, 'move.run', 'move', 'done'] as Row];
    expect(rules(history(rows))).toContain('pinWeekday:move');
  });
});

describe('evaluateProposals', () => {
  it('is pure and yields one proposal per habit, in rule order', () => {
    const s = deepFreeze(history([[TODAY - 2, 'move.workout', 'move', 'tried']], {}, false));
    const c = evaluateProposals(s, TODAY);
    expect(c.map((x) => x.habit)).toEqual([...new Set(c.map((x) => x.habit))]);
    expect(c[0]?.rule).toBe('smaller');
    expect(c.slice(1).every((x) => x.rule === 'footInDoor')).toBe(true);
    expect(evaluateProposals(s, TODAY)).toEqual(c);
  });
  it('is quiet for a new save', () => {
    expect(evaluateProposals(fresh(), DAY0)).toEqual([]);
    expect(evaluateProposals(freshWithBoard(), DAY0)).toEqual([]);
  });
});

describe('computeProposalsDraft: limits, snoozes and expiry', () => {
  function run(s: SaveFile, day = TODAY): SaveFile {
    const d = clone(s);
    computeProposalsDraft(d, day);
    return d;
  }
  it('shows at most three, each with a reason, and reports how many are new', () => {
    const s = history([], {}, false);
    const d = clone(s);
    const events = computeProposalsDraft(d, TODAY);
    expect(openProposals(d)).toHaveLength(MAX_VISIBLE_PROPOSALS);
    expect(events).toEqual([{ type: 'proposalsIssued', count: 3 }]);
    for (const p of openProposals(d)) {
      expect(p.reason.length).toBeGreaterThan(10);
      expect(p).toMatchObject({ status: 'open', createdDay: TODAY, snoozeUntil: null });
    }
    expect(computeProposalsDraft(d, TODAY)).toEqual([]);
  });
  it('keeps the same open proposals from one day to the next (no churn, no nagging)', () => {
    const a = run(history([], {}, false));
    const ids = openProposals(a).map((p) => p.id);
    const b = run(a, TODAY + 1);
    expect(openProposals(b).map((p) => p.id)).toEqual(ids);
  });
  it('after "Not now" the same rule + habit stays quiet for 7 days, then may return', () => {
    // The player keeps trying move every day and never finishes, so rule 1 keeps holding.
    const tries: Row[] = Array.from({ length: 9 }, (_, i): Row => [TODAY + i, 'move.workout', 'move', 'tried']);
    const first = TODAY + 1;
    const key = (p: { rule: string; habit: string }): string => `${p.rule}:${p.habit}`;
    const a = run(history(tries), first);
    const proposal = openProposals(a).find((p) => key(p) === 'smaller:move');
    expect(proposal).toBeDefined();
    const dismissed = dismissProposal(a, at(0), proposal?.id ?? '', TZ);
    expect(dismissed.events).toEqual([{ type: 'proposalResolved', id: proposal?.id, accepted: false }]);
    const snoozeUntil = gameDayIndex(at(0), 4, TZ.tz) + SNOOZE_DAYS;
    expect(dismissed.save.proposals.find((p) => p.id === proposal?.id)).toMatchObject({ status: 'dismissed', snoozeUntil });
    // Pretend the dismissal happened on `first` so the days line up with the history above.
    const pinned = clone(dismissed.save);
    const dp = pinned.proposals.find((p) => p.id === proposal?.id);
    if (dp) dp.snoozeUntil = first + SNOOZE_DAYS;
    for (let k = 1; k < SNOOZE_DAYS; k++) expect(openProposals(run(pinned, first + k)).map(key), `day +${k}`).not.toContain('smaller:move');
    expect(openProposals(run(pinned, first + SNOOZE_DAYS)).map(key)).toContain('smaller:move');
  });
  it('an unanswered proposal leaves after a week and does not come back for a week', () => {
    let s = run(history([], {}, false));
    const first = openProposals(s)[0];
    const firstKey = `${first?.rule}:${first?.habit}`;
    const id = first?.id;
    s = run(s, TODAY + OPEN_PROPOSAL_DAYS - 1);
    expect(s.proposals.find((p) => p.id === id)?.status).toBe('open');
    s = run(s, TODAY + OPEN_PROPOSAL_DAYS);
    const retired = s.proposals.find((p) => p.id === id);
    expect(retired).toMatchObject({ status: 'dismissed', snoozeUntil: TODAY + OPEN_PROPOSAL_DAYS + SNOOZE_DAYS });
    expect(openProposals(s).map((p) => `${p.rule}:${p.habit}`)).not.toContain(firstKey);
  });
  it('drops an open proposal whose condition is gone, without a snooze', () => {
    const s = run(history([[TODAY - 2, 'move.workout', 'move', 'tried']]));
    expect(openProposals(s).map((p) => p.rule)).toContain('smaller');
    const healed = clone(s);
    const day = healed.activity.find((a) => a.day === TODAY - 2);
    if (day) day.entries = [{ templateId: 'move.workout', habit: 'move', status: 'done' }];
    const after = run(healed, TODAY + 1);
    expect(after.proposals.some((p) => p.rule === 'smaller' && p.status === 'open')).toBe(false);
    expect(after.proposals.some((p) => p.rule === 'smaller')).toBe(false);
  });
  it('forgets answered proposals once their snooze is over', () => {
    const s = run(history([], {}, false));
    const first = openProposals(s)[0];
    const answered = dismissProposal(s, at(0), first?.id ?? '', TZ).save;
    const dp = answered.proposals.find((p) => p.id === first?.id);
    if (dp) dp.snoozeUntil = TODAY + 3;
    expect(run(answered, TODAY + 2).proposals.some((p) => p.id === first?.id)).toBe(true);
    expect(run(answered, TODAY + 3).proposals.some((p) => p.id === first?.id)).toBe(false);
  });
});

describe('accepting and dismissing', () => {
  /** A save today with an issued board, a recorded attempt and proposals computed. */
  function proposed(): SaveFile {
    const base = freshWithBoard();
    const today = gameDayIndex(T0, 4, TZ.tz);
    const s = setBoard(base, today, ['study.deep']);
    s.firstPlayDay = today - 30;
    s.activity = [{ day: today - 1, entries: [{ templateId: 'move.workout', habit: 'move', status: 'tried' }] }];
    computeProposalsDraft(s, today);
    return s;
  }
  it('creates the smaller template, puts it on today\'s board and marks the proposal accepted', () => {
    const s = proposed();
    const p = openProposals(s).find((x) => x.rule === 'smaller');
    expect(p).toBeDefined();
    const r = acceptProposal(s, T0, p?.id ?? '', TZ);
    expect(r.error).toBeUndefined();
    expect(r.templateId).toBeDefined();
    const t = r.save.customTemplates.find((c) => c.id === r.templateId);
    expect(t).toMatchObject({ source: 'proposal', recurrence: 'once', habit: 'move' });
    expect(t?.stats.issued).toBe(1);
    expect(r.save.board?.quests.some((q) => q.templateId === r.templateId)).toBe(true);
    expect(r.save.proposals.find((x) => x.id === p?.id)).toMatchObject({ status: 'accepted', snoozeUntil: gameDayIndex(T0, 4, TZ.tz) + SNOOZE_DAYS });
    expect(r.events.map((e) => e.type)).toEqual(['customSaved', 'customBoarded', 'proposalResolved']);
    expect(s.customTemplates).toHaveLength(0);
  });
  it('still saves the template when the board already holds two of your own', () => {
    let s = proposed();
    for (const title of ['One', 'Two']) {
      const made = addCustomTemplate(s, T0, { habit: 'clean', kind: 'check', title, description: 'd', recurrence: 'once', timeSlot: 'any', source: 'text' });
      s = made.save;
      s.board?.quests.push({ instanceId: `x-${title}`, templateId: made.templateId ?? '', habit: 'clean', kind: 'check', status: 'open', count: 0, timer: null, timedBonus: false, rewards: null });
    }
    const p = openProposals(s).find((x) => x.rule === 'smaller');
    expect(customOnBoardCount(s)).toBe(2);
    const r = acceptProposal(s, T0, p?.id ?? '', TZ);
    expect(r.error).toBeUndefined();
    expect(r.save.customTemplates.some((c) => c.source === 'proposal')).toBe(true);
    expect(r.events.map((e) => e.type)).toEqual(['customSaved', 'proposalResolved']);
  });
  it('updates a custom template for rule 3', () => {
    const base = freshWithBoard();
    const made = addCustomTemplate(base, T0, { habit: 'study', kind: 'check', title: 'Journal', description: 'd', recurrence: 'once', timeSlot: 'any', source: 'text' });
    const s = made.save;
    const today = gameDayIndex(T0, 4, TZ.tz);
    s.firstPlayDay = today - 30;
    s.activity = [{ day: today - 10, entries: HABIT_IDS.map((h) => ({ templateId: `${h}.old`, habit: h, status: 'done' as const })) }];
    const t = s.customTemplates[0];
    if (t) t.stats.done = 4;
    computeProposalsDraft(s, today);
    const p = openProposals(s).find((x) => x.rule === 'makeRecurring');
    expect(p).toBeDefined();
    const r = acceptProposal(s, T0, p?.id ?? '', TZ);
    expect(r.error).toBeUndefined();
    expect(r.save.customTemplates[0]?.recurrence).not.toBe('once');
    expect(r.events.map((e) => e.type)).toEqual(['customUpdated', 'proposalResolved']);
  });
  it('rule 3 edits the template in place: same id, same history, no copy, and an archived one is refused', () => {
    const base = freshWithBoard();
    const made = addCustomTemplate(base, T0, { habit: 'study', kind: 'check', title: 'Journal', description: 'd', recurrence: 'once', timeSlot: 'morning', source: 'text' });
    const s = made.save;
    const today = gameDayIndex(T0, 4, TZ.tz);
    s.firstPlayDay = today - 30;
    s.activity = [{ day: today - 10, entries: HABIT_IDS.map((h) => ({ templateId: `${h}.old`, habit: h, status: 'done' as const })) }];
    const t = s.customTemplates[0];
    if (t) t.stats = { issued: 5, done: 4, tried: 1 };
    computeProposalsDraft(s, today);
    const p = openProposals(s).find((x) => x.rule === 'makeRecurring');
    expect(p?.action).toMatchObject({ type: 'update', templateId: made.templateId });
    const r = acceptProposal(s, T0, p?.id ?? '', TZ);
    expect(r.error).toBeUndefined();
    expect(r.save.customTemplates).toHaveLength(1);
    expect(r.save.customTemplates[0]).toMatchObject({ id: made.templateId, title: 'Journal', timeSlot: 'morning', stats: { issued: 5, done: 4, tried: 1 } });
    expect(r.save.customTemplates[0]?.recurrence).not.toBe('once');
    expect(r.save.proposals.find((x) => x.id === p?.id)?.status).toBe('accepted');
    // The player archived it in the meantime: nothing is created, the proposal stays open.
    const archived = archiveCustomTemplate(s, T0, made.templateId ?? '', TZ).save;
    const refused = acceptProposal(archived, T0, p?.id ?? '', TZ);
    expect(refused.error).toMatch(/not in My quests/);
    expect(archived.customTemplates).toHaveLength(1);
    expect(archived.proposals.find((x) => x.id === p?.id)?.status).toBe('open');
  });
  it('refuses an unknown or already answered proposal and leaves the save as it was', () => {
    const s = proposed();
    expect(acceptProposal(s, T0, 'p-nope', TZ).error).toMatch(/no longer open/);
    expect(dismissProposal(s, T0, 'p-nope', TZ).error).toMatch(/no longer open/);
    const id = openProposals(s)[0]?.id ?? '';
    const answered = dismissProposal(s, T0, id, TZ).save;
    expect(acceptProposal(answered, T0, id, TZ).error).toMatch(/no longer open/);
    expect(acceptProposal(s, T0, 'p-nope', TZ).save).toBe(s);
  });
  it('keeps the proposal open when accepting fails', () => {
    const s = proposed();
    const p = openProposals(s).find((x) => x.rule === 'smaller');
    const blocked = clone(s);
    // Fill the 30 slots so creating is refused.
    for (let i = 0; i < 30; i++) {
      blocked.customTemplates.push({ id: `c-${i.toString(16).padStart(8, '0')}`, habit: 'clean', kind: 'check', title: `Filler ${i}`, description: '', tier: 1, recurrence: 'once', timeSlot: 'any', createdAt: 0, source: 'text', stats: { issued: 0, done: 0, tried: 0 } });
    }
    const r = acceptProposal(blocked, T0, p?.id ?? '', TZ);
    expect(r.error).toMatch(/archive one/);
    expect(blocked.proposals.find((x) => x.id === p?.id)?.status).toBe('open');
  });
});

describe('the day boundary', () => {
  it('records the done and tried quests of the day that ended and nothing else', () => {
    let s = setBoard(freshWithBoard(), DAY0, ['move.workout', 'study.deep', 'eat.batch']);
    s = markTried(s, `${DAY0}-move.workout`, T0).save;
    s = completeQuest(s, `${DAY0}-study.deep`, T0).save;
    const next = processBoundaries(s, at(1), TZ).save;
    expect(next.activity).toEqual([
      {
        day: DAY0,
        entries: [
          { templateId: 'move.workout', habit: 'move', status: 'tried' },
          { templateId: 'study.deep', habit: 'study', status: 'done' },
        ],
      },
    ]);
  });
  it('leaves no record for an empty day and keeps only the last six weeks', () => {
    const s = freshWithBoard();
    expect(processBoundaries(s, at(1), TZ).save.activity).toEqual([]);
    const d = clone(s);
    d.activity = Array.from({ length: ACTIVITY_DAYS }, (_, i) => ({ day: DAY0 - 100 + i, entries: [{ templateId: 'move.stretch', habit: 'move' as const, status: 'done' as const }] }));
    d.board = setBoard(s, DAY0, ['study.deep']).board;
    if (d.board?.quests[0]) d.board.quests[0].status = 'tried';
    recordActivityDraft(d, DAY0);
    expect(d.activity).toHaveLength(ACTIVITY_DAYS);
    expect(d.activity.at(-1)?.day).toBe(DAY0);
    expect(d.activity[0]?.day).toBe(DAY0 - 100 + 1);
  });
  it('turns a week of attempts into a proposal on the new board, once', () => {
    let s = setBoard(freshWithBoard(), DAY0, ['move.workout', 'study.deep']);
    s = markTried(s, `${DAY0}-move.workout`, T0).save;
    const next = processBoundaries(s, at(1), TZ);
    expect(next.events.some((e) => e.type === 'proposalsIssued')).toBe(true);
    const open = openProposals(next.save);
    expect(open.map((p) => p.rule)).toContain('smaller');
    const again = processBoundaries(next.save, at(1, 20), TZ);
    expect(again.events.some((e) => e.type === 'proposalsIssued')).toBe(false);
    expect(again.save.proposals).toEqual(next.save.proposals);
  });
  it('a new save gets no proposals on its first days', () => {
    let s = freshWithBoard();
    for (let d = 1; d <= 5; d++) s = processBoundaries(s, at(d), TZ).save;
    expect(s.proposals).toEqual([]);
  });
  it('changing the reset hour shifts the history and the snoozes with it', () => {
    let s = setBoard(freshWithBoard(), DAY0, ['move.workout']);
    s = markTried(s, `${DAY0}-move.workout`, T0).save;
    s = processBoundaries(s, at(1), TZ).save;
    const before = { day: s.activity[0]?.day, created: openProposals(s)[0]?.createdDay };
    // 02:00 local on day 1 is "yesterday" under a 4:00 reset hour and "today" under a 0:00 one.
    const r = changeResetHour(s, 0, at(1, 2), TZ);
    expect(r.error).toBeUndefined();
    const delta = (r.save.firstPlayDay ?? 0) - s.firstPlayDay;
    expect(r.save.activity[0]?.day).toBe((before.day ?? 0) + delta);
    expect(openProposals(r.save)[0]?.createdDay).toBe((before.created ?? 0) + delta);
  });
});
