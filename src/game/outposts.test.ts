import { describe, expect, it } from 'vitest';
import { completeQuest, rerollQuest, undoQuest } from './board';
import { addCustomQuestToBoard, addCustomTemplate, updateCustomTemplate } from './custom';
import { outpostRules } from './content';
import { questRewards, recomputeRingDraft } from './economy';
import { markMapSeen } from './map';
import { canHoldOutpost, zoneOfCell } from './mapGeometry';
import {
  activeOutposts,
  createOutpost,
  editOutpost,
  forgetOutpost,
  isOutpostQuiet,
  logOutpostVisit,
  moveOutpost,
  nextOutpostState,
  outpostCap,
  outpostCoinMult,
  outpostDefense,
  outpostRerollDiscount,
  outpostStateFor,
  restoreOutpost,
  retireOutpost,
  suggestOutpostCell,
  tagQuestAtOutpost,
  undoOutpostVisit,
  type OutpostInput,
} from './outposts';
import { mulberry32 } from './rng';
import { T0, TZ, at, deepFreeze, fresh, freshWithBoard, setBoard } from './testUtils';
import { gameDayIndex } from './time';
import type { ActionResult, GameEvent, MapCell, SaveFile } from './types';
import { settleWave, waveDefense } from './wave';

const STATE_RANK: Record<string, number> = { marked: 0, scouted: 1, corridor: 2, stronghold: 3 };

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

/** Cells at least three apart, zones 3, 3, 4, 5, 6: the first four fit the ring-1 cap of 4. */
const CELLS: MapCell[] = [
  { x: 2, y: 1 },
  { x: -2, y: 1 },
  { x: 1, y: -3 },
  { x: -3, y: -3 },
  { x: 5, y: 3 },
];

function input(name: string, cell: MapCell, extra: Partial<OutpostInput> = {}): OutpostInput {
  return { name, type: 'gym', cell, ...extra };
}

function must(r: ActionResult): SaveFile {
  if (r.error !== undefined) throw new Error(`refused: ${r.error}`);
  return r.save;
}

function withOutposts(n: number, save: SaveFile = fresh()): SaveFile {
  let s = save;
  for (let i = 0; i < n; i++) s = must(createOutpost(s, input(`Place ${i + 1}`, CELLS[i]!), T0, TZ));
  return s;
}

/** Log a counted visit per day from relative day `from` for `n` days. */
function visitDays(save: SaveFile, id: string, from: number, n: number): { save: SaveFile; events: GameEvent[] } {
  let s = save;
  const events: GameEvent[] = [];
  for (let d = from; d < from + n; d++) {
    const r = logOutpostVisit(s, id, at(d), TZ);
    s = must(r);
    events.push(...r.events);
  }
  return { save: s, events };
}

/** The CITY-MAP 4.2 invariants, asserted after every action in the property test. */
function assertInvariants(s: SaveFile, dp: number, ring: number): void {
  expect(s.player.domainPoints).toBe(dp);
  expect(s.player.ring).toBe(ring);
  const ids = s.map.outposts.map((o) => o.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(Number(id.slice(2))).toBeLessThan(s.map.nextSeq);
  const active = activeOutposts(s);
  expect(active.length).toBeLessThanOrEqual(3 + s.player.ring);
  for (let z = 1; z <= 7; z++) expect(active.filter((o) => zoneOfCell(o.cell) === z).length).toBeLessThanOrEqual(z === 1 ? 0 : 3);
  for (const o of active) expect(canHoldOutpost(o.cell)).toBe(true);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      expect(Math.hypot(active[i]!.cell.x - active[j]!.cell.x, active[i]!.cell.y - active[j]!.cell.y)).toBeGreaterThanOrEqual(3);
    }
  }
  for (const o of s.map.outposts) {
    expect(STATE_RANK[o.peak]).toBeGreaterThanOrEqual(STATE_RANK[outpostStateFor(o.visits)]!);
    const counted = s.map.visits.filter((v) => v.outpostId === o.id && v.counted);
    const days = counted.map((v) => v.day);
    expect(new Set(days).size).toBe(days.length);
    if (counted.length > 0) expect(o.lastVisitDay).toBe(Math.max(...days));
    else if (o.visits === 0) expect(o.lastVisitDay).toBeNull();
  }
  for (let i = 1; i < s.map.snapshots.length; i++) expect(s.map.snapshots[i]!.periodIndex).toBeGreaterThan(s.map.snapshots[i - 1]!.periodIndex);
}

describe('createOutpost', () => {
  it('appends with sequential ids, defaults the habits from the type and emits outpostCreated', () => {
    const r = createOutpost(fresh(), input('  Riverside   Gym ', CELLS[0]!, { note: ' Tuesday. ' }), T0, TZ);
    expect(r.error).toBeUndefined();
    expect(r.events).toEqual([{ type: 'outpostCreated', outpostId: 'op1' }]);
    const o = r.save.map.outposts[0]!;
    expect(o).toMatchObject({ id: 'op1', name: 'Riverside Gym', type: 'gym', habits: ['move', 'hygiene'], note: 'Tuesday.', visits: 0, lastVisitDay: null, peak: 'marked', retired: false, createdDay: DAY0 });
    expect(o.stateDays).toEqual({ marked: DAY0 });
    expect(r.save.map.nextSeq).toBe(2);
    const two = must(createOutpost(r.save, input('Second', CELLS[1]!, { type: 'park', habits: ['study'] }), T0, TZ));
    expect(two.map.outposts[1]).toMatchObject({ id: 'op2', habits: ['study'] });
    expect(two.log[two.log.length - 1]?.text).toContain('Second');
  });

  it('refuses an empty name, a duplicate name (case-insensitive), the cap, a fourth in a zone, the Room, a close cell and an off-island cell', () => {
    expect(createOutpost(fresh(), input('   ', CELLS[0]!), T0, TZ).error).toBe('name required');
    const one = withOutposts(1);
    expect(createOutpost(one, input('place 1', CELLS[1]!), T0, TZ).error).toBe('name taken');
    const four = withOutposts(4);
    expect(outpostCap(1)).toBe(4);
    expect(createOutpost(four, input('Fifth', CELLS[4]!), T0, TZ).error).toBe('cap reached');
    // Three in zone 3 (The Floor), each three apart, then a fourth.
    let s = fresh();
    s = { ...s, player: { ...s.player, ring: 4, highestRing: 4, domainPoints: 650 } };
    s = must(createOutpost(s, input('A', { x: 2, y: 1 }), T0, TZ));
    s = must(createOutpost(s, input('B', { x: -2, y: 1 }), T0, TZ));
    s = must(createOutpost(s, input('C', { x: 0, y: -2 }), T0, TZ));
    expect(createOutpost(s, input('D', { x: 1, y: -2 }), T0, TZ).error).toBe('zone full');
    expect(createOutpost(fresh(), input('Home', { x: 0, y: 0 }), T0, TZ).error).toBe('cell invalid');
    expect(createOutpost(fresh(), input('Street', { x: 4, y: 1 }), T0, TZ).error).toBe('cell invalid');
    expect(createOutpost(fresh(), input('Sea', { x: 8, y: 8 }), T0, TZ).error).toBe('cell invalid');
    expect(createOutpost(fresh(), input('Half', { x: 1.5, y: 0 }), T0, TZ).error).toBe('cell invalid');
    expect(createOutpost(one, input('Close', { x: 1, y: 0 }), T0, TZ).error).toBe('cell taken');
    expect(createOutpost(fresh(), input('Nowhere', CELLS[0]!, { type: 'other' }), T0, TZ).error).toBe('pick a habit');
    expect(createOutpost(fresh(), input('Three', CELLS[0]!, { habits: ['move', 'eat', 'sleep'] }), T0, TZ).error).toBe('pick a habit');
    const other = must(createOutpost(fresh(), input('Bench', CELLS[0]!, { type: 'other', habits: ['outside'] }), T0, TZ));
    expect(other.map.outposts[0]?.habits).toEqual(['outside']);
  });

  it('clamps the name and note to the content limits', () => {
    const s = must(createOutpost(fresh(), input('x'.repeat(40), CELLS[0]!, { note: 'y'.repeat(200) }), T0, TZ));
    expect(s.map.outposts[0]?.name).toHaveLength(outpostRules.nameMax);
    expect(s.map.outposts[0]?.note).toHaveLength(outpostRules.noteMax);
  });

  it('suggestOutpostCell picks the free cell nearest the direction and the zone middle, or null when full', () => {
    const s = fresh();
    const north = suggestOutpostCell(s, 4, 'n');
    expect(north).not.toBeNull();
    expect(zoneOfCell(north!)).toBe(4);
    expect(north!.x + north!.y).toBeLessThan(0); // "up" on the drawn map
    const south = suggestOutpostCell(s, 4, 's');
    expect(south!.x + south!.y).toBeGreaterThan(0);
    const east = suggestOutpostCell(s, 6, 'e');
    expect(east!.x - east!.y).toBeGreaterThan(0);
    expect(suggestOutpostCell(s, 1, 'n')).toBeNull();
    expect(suggestOutpostCell(s, 8, 'n')).toBeNull();
    // The Flat has 8 cells in a 3x3 ring: three outposts three apart cannot fit, so it runs out.
    let full = s;
    const first = suggestOutpostCell(full, 2, 'n')!;
    full = must(createOutpost(full, input('One', first), T0, TZ));
    expect(suggestOutpostCell(full, 2, 's')).toBeNull();
    // A suggestion always lands on a cell that create accepts.
    for (const dir of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const) {
      const c = suggestOutpostCell(s, 5, dir);
      expect(c).not.toBeNull();
      expect(createOutpost(s, input('Try', c!), T0, TZ).error).toBeUndefined();
    }
  });
});

describe('visits and states', () => {
  it('counts one visit per outpost per game day and refuses a second check-in', () => {
    const s = withOutposts(1);
    const a = logOutpostVisit(s, 'op1', T0, TZ);
    expect(a.error).toBeUndefined();
    expect(a.events).toEqual([{ type: 'outpostVisited', outpostId: 'op1', visits: 1, source: 'checkin', counted: true }]);
    expect(a.save.map.outposts[0]).toMatchObject({ visits: 1, lastVisitDay: DAY0 });
    expect(a.save.map.visits).toEqual([{ outpostId: 'op1', day: DAY0, at: T0, source: 'checkin', instanceId: null, counted: true }]);
    expect(logOutpostVisit(a.save, 'op1', at(0, 20), TZ).error).toBe('already logged today');
    const next = logOutpostVisit(a.save, 'op1', at(1), TZ);
    expect(next.save.map.outposts[0]?.visits).toBe(2);
    expect(logOutpostVisit(s, 'nope', T0, TZ).error).toBe('unknown outpost');
  });

  it('reaches Scouted, Corridor and Stronghold at 3, 10 and 30 visits, each announced once', () => {
    const s = withOutposts(1);
    const { save: after, events } = visitDays(s, 'op1', 0, 31);
    const reached = events.filter((e) => e.type === 'outpostStateReached');
    expect(reached).toEqual([
      { type: 'outpostStateReached', outpostId: 'op1', state: 'scouted' },
      { type: 'outpostStateReached', outpostId: 'op1', state: 'corridor' },
      { type: 'outpostStateReached', outpostId: 'op1', state: 'stronghold' },
    ]);
    const visited = events.filter((e) => e.type === 'outpostVisited');
    expect(visited).toHaveLength(31);
    expect(visited[2]).toMatchObject({ visits: 3 });
    const o = after.map.outposts[0]!;
    expect(o.peak).toBe('stronghold');
    expect(o.stateDays).toEqual({ marked: DAY0, scouted: DAY0 + 2, corridor: DAY0 + 9, stronghold: DAY0 + 29 });
    expect(outpostStateFor(0)).toBe('marked');
    expect(outpostStateFor(2)).toBe('marked');
    expect(outpostStateFor(3)).toBe('scouted');
    expect(outpostStateFor(10)).toBe('corridor');
    expect(outpostStateFor(30)).toBe('stronghold');
    expect(nextOutpostState('corridor')).toMatchObject({ id: 'stronghold', minVisits: 30 });
    expect(nextOutpostState('stronghold')).toBeNull();
  });

  it('tags a done quest: counted when the day is free, uncounted after a check-in, and a check-in after a tag is refused', () => {
    let s = withOutposts(1, freshWithBoard());
    const q = s.board!.quests[0]!;
    expect(tagQuestAtOutpost(s, q.instanceId, 'op1', T0, TZ).error).toBe('quest not done');
    s = must(completeQuest(s, q.instanceId, T0));
    const tagged = tagQuestAtOutpost(s, q.instanceId, 'op1', T0, TZ);
    expect(tagged.events[0]).toMatchObject({ type: 'outpostVisited', source: 'quest', counted: true, visits: 1 });
    expect(tagged.save.map.visits[0]).toMatchObject({ instanceId: q.instanceId, source: 'quest', counted: true });
    expect(tagQuestAtOutpost(tagged.save, q.instanceId, 'op1', T0, TZ).error).toBe('already tagged');
    expect(logOutpostVisit(tagged.save, 'op1', T0, TZ).error).toBe('already logged today');
    expect(undoOutpostVisit(tagged.save, 'op1', T0, TZ).error).toBe('nothing to undo');

    // Check-in first, then a tag: the tag is kept for the Ledger but not counted.
    let t = withOutposts(1, freshWithBoard());
    t = must(logOutpostVisit(t, 'op1', T0, TZ));
    const q2 = t.board!.quests[1]!;
    t = must(completeQuest(t, q2.instanceId, T0));
    const r = tagQuestAtOutpost(t, q2.instanceId, 'op1', T0, TZ);
    expect(r.events[0]).toMatchObject({ type: 'outpostVisited', counted: false, visits: 1 });
    expect(r.save.map.outposts[0]?.visits).toBe(1);
    expect(r.save.map.visits.map((v) => v.counted)).toEqual([true, false]);
  });

  it('undoing a tagged quest removes its visit and keeps the peak; climbing back emits nothing new', () => {
    let s = withOutposts(1, freshWithBoard());
    s = visitDays(s, 'op1', -2, 2).save; // two counted visits on earlier days
    const q = s.board!.quests[0]!;
    s = must(completeQuest(s, q.instanceId, T0));
    const tagged = tagQuestAtOutpost(s, q.instanceId, 'op1', T0, TZ);
    expect(tagged.events.some((e) => e.type === 'outpostStateReached')).toBe(true);
    expect(tagged.save.map.outposts[0]).toMatchObject({ visits: 3, peak: 'scouted', lastVisitDay: DAY0 });
    const undone = must(undoQuest(tagged.save, q.instanceId, T0, TZ));
    expect(undone.map.visits.some((v) => v.instanceId === q.instanceId)).toBe(false);
    expect(undone.map.outposts[0]).toMatchObject({ visits: 2, peak: 'scouted', lastVisitDay: DAY0 - 1 });
    const back = logOutpostVisit(undone, 'op1', T0, TZ);
    expect(back.events.map((e) => e.type)).toEqual(['outpostVisited']);
    expect(back.save.map.outposts[0]).toMatchObject({ visits: 3, peak: 'scouted' });
    // A second tagged quest the same day inherits the count when the first is undone.
    const q2 = tagged.save.board!.quests[1]!;
    let both = must(completeQuest(tagged.save, q2.instanceId, T0));
    both = must(tagQuestAtOutpost(both, q2.instanceId, 'op1', T0, TZ));
    expect(both.map.visits.filter((v) => v.day === DAY0).map((v) => v.counted)).toEqual([true, false]);
    const u = must(undoQuest(both, q.instanceId, T0, TZ));
    expect(u.map.visits.filter((v) => v.day === DAY0)).toHaveLength(1);
    expect(u.map.visits.filter((v) => v.day === DAY0)[0]).toMatchObject({ instanceId: q2.instanceId, counted: true });
    expect(u.map.outposts[0]?.visits).toBe(3);
  });

  it('undoOutpostVisit takes back only a same-day check-in', () => {
    let s = withOutposts(1);
    s = visitDays(s, 'op1', 0, 3).save;
    expect(s.map.outposts[0]).toMatchObject({ visits: 3, peak: 'scouted' });
    expect(undoOutpostVisit(s, 'op1', at(3), TZ).error).toBe('nothing to undo');
    const r = undoOutpostVisit(s, 'op1', at(2), TZ);
    expect(r.events).toEqual([{ type: 'outpostVisitUndone', outpostId: 'op1' }]);
    expect(r.save.map.outposts[0]).toMatchObject({ visits: 2, peak: 'scouted', lastVisitDay: DAY0 + 1 });
    expect(r.save.map.visits).toHaveLength(2);
    expect(undoOutpostVisit(r.save, 'op1', at(2), TZ).error).toBe('nothing to undo');
    const one = undoOutpostVisit(visitDays(withOutposts(1), 'op1', 0, 1).save, 'op1', T0, TZ).save;
    expect(one.map.outposts[0]).toMatchObject({ visits: 0, lastVisitDay: null });
  });

  it('a custom quest with a default outpost tags itself on completion and untags on undo', () => {
    let s = withOutposts(1, freshWithBoard());
    const made = addCustomTemplate(s, T0, { habit: 'move', kind: 'check', title: 'Gym session', description: '', recurrence: 'once', timeSlot: 'any', source: 'text', outpostId: 'op1' });
    expect(made.error).toBeUndefined();
    s = made.save;
    expect(s.customTemplates[0]?.outpostId).toBe('op1');
    const boarded = addCustomQuestToBoard(s, T0, made.templateId!, TZ);
    s = boarded.save;
    const done = completeQuest(s, boarded.instanceId!, T0);
    expect(done.events.some((e) => e.type === 'outpostVisited' && e.source === 'quest' && e.counted)).toBe(true);
    expect(done.save.map.outposts[0]?.visits).toBe(1);
    const undone = must(undoQuest(done.save, boarded.instanceId!, T0, TZ));
    expect(undone.map.outposts[0]?.visits).toBe(0);
    expect(undone.map.visits).toHaveLength(0);
    expect(addCustomTemplate(s, T0, { habit: 'move', kind: 'check', title: 'Elsewhere', description: '', recurrence: 'once', timeSlot: 'any', source: 'text', outpostId: 'op9' }).error).toBe('unknown outpost');
    const cleared = updateCustomTemplate(s, T0, made.templateId!, { outpostId: null }, TZ);
    expect(cleared.save.customTemplates[0]?.outpostId).toBeUndefined();
    const retired = must(retireOutpost(s, 'op1', T0, TZ));
    expect(retired.customTemplates[0]?.outpostId).toBeUndefined();
  });

  it('caps the visit log at 400 entries while the counters keep counting', () => {
    let s = withOutposts(2);
    for (let d = 0; d < 210; d++) {
      s = must(logOutpostVisit(s, 'op1', at(d), TZ));
      s = must(logOutpostVisit(s, 'op2', at(d), TZ));
    }
    expect(s.map.visits).toHaveLength(400);
    expect(s.map.outposts[0]?.visits).toBe(210);
    expect(s.map.visits[0]?.day).toBe(DAY0 + 10);
  });
});

describe('quiet', () => {
  it('is quiet after 14 days without a visit, 7 days when never visited, and a visit clears it without changing anything else', () => {
    const s = withOutposts(1);
    const o = s.map.outposts[0]!;
    expect(isOutpostQuiet(o, DAY0 + 6)).toBe(false);
    expect(isOutpostQuiet(o, DAY0 + 7)).toBe(true);
    const visited = must(logOutpostVisit(s, 'op1', at(2), TZ));
    const v = visited.map.outposts[0]!;
    expect(isOutpostQuiet(v, DAY0 + 2 + 13)).toBe(false);
    expect(isOutpostQuiet(v, DAY0 + 2 + 14)).toBe(true);
    const woken = must(logOutpostVisit(visited, 'op1', at(30), TZ));
    const w = woken.map.outposts[0]!;
    expect(isOutpostQuiet(w, DAY0 + 30)).toBe(false);
    expect(w.visits).toBe(2);
    expect(w.peak).toBe('marked');
  });
});

describe('edit, move, retire, restore, forget', () => {
  it('edits name, type, habits and note while visits and state stay', () => {
    let s = visitDays(withOutposts(1), 'op1', 0, 3).save;
    s = must(editOutpost(s, 'op1', { name: 'New Name', type: 'park', note: 'Loop.' }, T0, TZ));
    expect(s.map.outposts[0]).toMatchObject({ name: 'New Name', type: 'park', habits: ['outside', 'move'], note: 'Loop.', visits: 3, peak: 'scouted' });
    s = must(editOutpost(s, 'op1', { habits: ['study', 'eat'] }, T0, TZ));
    expect(s.map.outposts[0]?.habits).toEqual(['study', 'eat']);
    expect(editOutpost(s, 'op1', { name: '' }, T0, TZ).error).toBe('name required');
    const two = withOutposts(2);
    expect(editOutpost(two, 'op2', { name: 'PLACE 1' }, T0, TZ).error).toBe('name taken');
    expect(editOutpost(two, 'op2', { type: 'other' }, T0, TZ).error).toBeUndefined(); // keeps the current habits
    expect(editOutpost(two, 'nope', {}, T0, TZ).error).toBe('unknown outpost');
  });

  it('moves with the same checks as create', () => {
    const two = withOutposts(2);
    expect(moveOutpost(two, 'op1', { x: -1, y: 0 }, T0, TZ).error).toBe('cell taken');
    expect(moveOutpost(two, 'op1', { x: 0, y: 0 }, T0, TZ).error).toBe('cell invalid');
    const moved = must(moveOutpost(two, 'op1', { x: 5, y: 3 }, T0, TZ));
    expect(moved.map.outposts[0]?.cell).toEqual({ x: 5, y: 3 });
    expect(moveOutpost(two, 'op1', CELLS[0]!, T0, TZ).save).toBe(two); // no-op
  });

  it('retire frees the slot and the perks, restore re-checks the caps and the cell, forget needs retired', () => {
    let s = withOutposts(4);
    expect(forgetOutpost(s, 'op1', T0, TZ).error).toBe('not retired');
    const r = retireOutpost(s, 'op1', T0, TZ);
    expect(r.events).toEqual([{ type: 'outpostRetired', outpostId: 'op1' }]);
    s = r.save;
    expect(activeOutposts(s).map((o) => o.id)).toEqual(['op2', 'op3', 'op4']);
    expect(retireOutpost(s, 'op1', T0, TZ).save).toBe(s);
    // The slot is free: a new one fits, and then the retired one cannot come back.
    s = must(createOutpost(s, input('Fifth', CELLS[4]!), T0, TZ));
    expect(restoreOutpost(s, 'op1', T0, TZ).error).toBe('cap reached');
    s = must(retireOutpost(s, 'op5', T0, TZ));
    // Its old cell was taken meanwhile: the engine finds another in the same zone.
    s = must(createOutpost(s, input('Squatter', { x: 2, y: 1 }), T0, TZ));
    const back = restoreOutpost(must(retireOutpost(s, 'op2', T0, TZ)), 'op1', T0, TZ);
    expect(back.error).toBeUndefined();
    expect(back.events).toEqual([{ type: 'outpostRestored', outpostId: 'op1' }]);
    const restored = back.save.map.outposts.find((o) => o.id === 'op1')!;
    expect(restored.retired).toBe(false);
    expect(zoneOfCell(restored.cell)).toBe(3);
    expect(restored.cell).not.toEqual({ x: 2, y: 1 });
    const named = must(createOutpost(must(retireOutpost(back.save, 'op1', T0, TZ)), input('place 1', { x: -3, y: 1 }), T0, TZ));
    expect(restoreOutpost(must(retireOutpost(named, 'op3', T0, TZ)), 'op1', T0, TZ).error).toBe('name taken');
    // Forget deletes the outpost and its visits.
    let f = visitDays(withOutposts(2), 'op1', 0, 2).save;
    f = must(logOutpostVisit(f, 'op2', T0, TZ));
    f = must(retireOutpost(f, 'op1', T0, TZ));
    const gone = must(forgetOutpost(f, 'op1', T0, TZ));
    expect(gone.map.outposts.map((o) => o.id)).toEqual(['op2']);
    expect(gone.map.visits).toHaveLength(1);
    expect(gone.map.nextSeq).toBe(3); // ids are never reused
    expect(createOutpost(gone, input('Again', CELLS[0]!), T0, TZ).save.map.outposts[1]?.id).toBe('op3');
  });
});

describe('perks', () => {
  function withState(save: SaveFile, id: string, visits: number): SaveFile {
    return {
      ...save,
      map: { ...save.map, outposts: save.map.outposts.map((o) => (o.id === id ? { ...o, visits, peak: outpostStateFor(visits) } : o)) },
    };
  }

  it('a Scouted outpost makes swaps of related habits 5 cheaper (15 -> 10, 10 -> 5 with the Corner Shop), not others', () => {
    let s = withOutposts(1, fresh());
    s = setBoard(s, DAY0, ['move.dance', 'study.plan', 'clean.bed', 'clean.trash']);
    s = { ...s, player: { ...s.player, coins: 100 } };
    expect(outpostRerollDiscount(s, 'move')).toBe(0);
    const marked = rerollQuest(s, s.board!.quests[0]!.instanceId, T0);
    expect(marked.events.find((e) => e.type === 'questRerolled')).toMatchObject({ cost: 15 });
    const scouted = withState(s, 'op1', 3);
    expect(outpostRerollDiscount(scouted, 'move')).toBe(5);
    expect(outpostRerollDiscount(scouted, 'study')).toBe(0);
    const cheaper = rerollQuest(scouted, scouted.board!.quests[0]!.instanceId, T0);
    expect(cheaper.events.find((e) => e.type === 'questRerolled')).toMatchObject({ cost: 10 });
    expect(cheaper.save.player.coins).toBe(90);
    const study = rerollQuest(scouted, scouted.board!.quests[1]!.instanceId, T0);
    expect(study.events.find((e) => e.type === 'questRerolled')).toMatchObject({ cost: 15 });
    const shop = { ...scouted, player: { ...scouted.player, ring: 5 as const, highestRing: 5 as const, domainPoints: 1100 } };
    const five = rerollQuest(shop, shop.board!.quests[0]!.instanceId, T0);
    expect(five.events.find((e) => e.type === 'questRerolled')).toMatchObject({ cost: 5 });
    const retired = must(retireOutpost(scouted, 'op1', T0, TZ));
    expect(outpostRerollDiscount(retired, 'move')).toBe(0);
  });

  it('a Corridor adds +10% settlement to related habits, outside the title cap and never stacked', () => {
    let s = withOutposts(2, fresh());
    s = setBoard(s, DAY0, ['move.dance', 'study.plan']);
    expect(outpostCoinMult(s, 'move')).toBe(0);
    const base = completeQuest(s, s.board!.quests[0]!.instanceId, T0).save.board!.quests[0]!.rewards!;
    const corridor = withState(withState(s, 'op1', 10), 'op2', 12);
    expect(outpostCoinMult(corridor, 'move')).toBe(0.1);
    expect(outpostCoinMult(corridor, 'study')).toBe(0);
    const paid = completeQuest(corridor, corridor.board!.quests[0]!.instanceId, T0).save.board!.quests[0]!.rewards!;
    expect(paid.coins).toBeGreaterThan(base.coins);
    const q = s.board!.quests[0]!;
    const template = { tier: 1 as const, baseXp: 10, baseCoins: 10 };
    expect(questRewards(template, { difficulty: 'steady', bonus: false, timedBonus: false, outpostCoinMult: 0.1 }).coins).toBe(Math.round(10 * 1.1 * 1.1));
    expect(questRewards(template, { difficulty: 'steady', bonus: false, timedBonus: false, titleCoinMult: 0.15, outpostCoinMult: 0.1 }).coins).toBe(Math.round(10 * 1.1 * 1.25));
    expect(paid.xp).toBe(base.xp);
    expect(paid.dp).toBe(base.dp);
    expect(q.habit).toBe('move');
  });

  it('Strongholds add +2 defense each, capped at +6, with a log line; retired ones give nothing', () => {
    const s = withOutposts(4, fresh());
    expect(outpostDefense(s)).toBe(0);
    expect(waveDefense(s).breakdown.outposts).toBe(0);
    const one = withState(s, 'op1', 30);
    expect(outpostDefense(one)).toBe(2);
    const d = waveDefense(one);
    expect(d.breakdown.outposts).toBe(2);
    expect(d.total).toBe(waveDefense(s).total + 2);
    const four = withState(withState(withState(one, 'op2', 31), 'op3', 40), 'op4', 99);
    expect(outpostDefense(four)).toBe(6);
    const retired = must(retireOutpost(one, 'op1', T0, TZ));
    expect(outpostDefense(retired)).toBe(0);
    // The battle log names a single stronghold, and the outer line for several.
    const trusted = { ...one, vassals: { ...one.vassals, move: { ...one.vassals.move, trust: 2 } } };
    const settled = settleWave(trusted, 0, T0, DAY0 + 7);
    const record = settled.save.week.history[0]!;
    expect(record.breakdown.outposts).toBe(2);
    expect(record.log).toContain('The Place 1 stronghold holds. +2');
    const many = settleWave({ ...four, vassals: trusted.vassals }, 0, T0, DAY0 + 7).save.week.history[0]!;
    expect(many.log).toContain('Three strongholds hold the outer line. +6');
  });

  it('outpostWithinWalls fires once, on the unlock that covers the outpost', () => {
    let s = withOutposts(1, freshWithBoard()); // op1 in zone 3, The Floor
    s = { ...s, player: { ...s.player, domainPoints: 329 } };
    const done = completeQuest(s, s.board!.quests[0]!.instanceId, T0);
    const rings = done.events.filter((e) => e.type === 'ringUnlocked').map((e) => (e.type === 'ringUnlocked' ? e.ring : 0));
    expect(rings).toEqual([2, 3]);
    expect(done.events.filter((e) => e.type === 'outpostWithinWalls')).toEqual([{ type: 'outpostWithinWalls', outpostId: 'op1', ring: 3 }]);
    const undone = must(undoQuest(done.save, s.board!.quests[0]!.instanceId, T0, TZ));
    expect(undone.player.ring).toBe(3);
    const again = completeQuest(undone, s.board!.quests[0]!.instanceId, T0);
    expect(again.events.some((e) => e.type === 'outpostWithinWalls')).toBe(false);
    const draft = structuredClone(done.save);
    expect(recomputeRingDraft(draft)).toEqual([]);
  });
});

describe('contract', () => {
  it('never moves Domain Points or the ring, and keeps the invariants, over random action sequences', () => {
    const rng = mulberry32(2026);
    let s = fresh();
    s = { ...s, player: { ...s.player, domainPoints: 700, ring: 4, highestRing: 4 } };
    const dp = s.player.domainPoints;
    const ring = s.player.ring;
    const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
    let day = 0;
    for (let step = 0; step < 400; step++) {
      const roll = rng();
      const ids = s.map.outposts.map((o) => o.id);
      const pick = ids[Math.floor(rng() * ids.length)];
      let r: ActionResult;
      if (roll < 0.2 || !pick) {
        const zone = 2 + Math.floor(rng() * 6);
        const cell = suggestOutpostCell(s, zone, dirs[Math.floor(rng() * 8)]!);
        r = cell ? createOutpost(s, input(`P${step}`, cell, { type: 'park' }), at(day), TZ) : { save: s, events: [] };
      } else if (roll < 0.7) {
        if (rng() < 0.3) day += 1;
        r = logOutpostVisit(s, pick, at(day), TZ);
      } else if (roll < 0.8) r = undoOutpostVisit(s, pick, at(day), TZ);
      else if (roll < 0.9) r = retireOutpost(s, pick, at(day), TZ);
      else if (roll < 0.97) r = restoreOutpost(s, pick, at(day), TZ);
      else r = forgetOutpost(s, pick, at(day), TZ);
      const beforePeaks = new Map(s.map.outposts.map((o) => [o.id, o.peak]));
      if (r.error === undefined) s = r.save;
      else expect(r.save).toBe(s);
      for (const o of s.map.outposts) {
        const prev = beforePeaks.get(o.id);
        if (prev !== undefined) expect(STATE_RANK[o.peak]).toBeGreaterThanOrEqual(STATE_RANK[prev]!);
      }
      assertInvariants(s, dp, ring);
    }
    expect(s.map.outposts.length).toBeGreaterThan(3);
    expect(s.map.outposts.some((o) => o.peak !== 'marked')).toBe(true);
  });

  it('leaves every input untouched', () => {
    const s = deepFreeze(visitDays(withOutposts(2, freshWithBoard()), 'op1', -1, 1).save);
    const before = JSON.stringify(s);
    createOutpost(s, input('New', CELLS[2]!), T0, TZ);
    logOutpostVisit(s, 'op1', T0, TZ);
    editOutpost(s, 'op1', { name: 'Edited' }, T0, TZ);
    moveOutpost(s, 'op1', CELLS[3]!, T0, TZ);
    retireOutpost(s, 'op1', T0, TZ);
    forgetOutpost(s, 'op1', T0, TZ);
    undoOutpostVisit(s, 'op1', at(-1), TZ);
    markMapSeen(s, T0, TZ);
    const retired = retireOutpost(s, 'op2', T0, TZ);
    restoreOutpost(deepFreeze(retired.save), 'op2', T0, TZ);
    forgetOutpost(deepFreeze(retired.save), 'op2', T0, TZ);
    const done = completeQuest(s, s.board!.quests[0]!.instanceId, T0);
    tagQuestAtOutpost(deepFreeze(done.save), s.board!.quests[0]!.instanceId, 'op1', T0, TZ);
    expect(JSON.stringify(s)).toBe(before);
  });
});
