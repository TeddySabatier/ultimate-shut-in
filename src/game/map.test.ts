import { describe, expect, it } from 'vitest';
import { completeQuest, undoQuest } from './board';
import { WAVE_HISTORY_MAX } from './economy';
import { COMPARE_DAYS, SNAPSHOT_MAX, compareSnapshot, markMapSeen, wallsHeld, waveResidue } from './map';
import { createOutpost, logOutpostVisit, tagQuestAtOutpost } from './outposts';
import { T0, TZ, at, fresh, freshWithBoard } from './testUtils';
import { changeResetHour, processBoundaries } from './tick';
import { gameDayIndex } from './time';
import type { SaveFile } from './types';
import { settleWave } from './wave';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

function trusted(save: SaveFile, trust: number): SaveFile {
  return { ...save, vassals: { ...save.vassals, move: { ...save.vassals.move, trust } } };
}

describe('snapshots', () => {
  it('records one per settlement, quiet included, after the DP award, strictly increasing and capped', () => {
    const s = fresh();
    expect(s.map.snapshots).toEqual([]);
    const quiet = settleWave(s, 0, T0, DAY0 + 7).save;
    expect(quiet.map.snapshots).toEqual([{ periodIndex: 0, day: DAY0 + 7, domainPoints: 0, ring: 1, result: 'quiet' }]);
    const fought = settleWave(trusted(quiet, 3), 1, T0, DAY0 + 14).save;
    const rec = fought.week.history[1]!;
    expect(rec.result).not.toBe('quiet');
    expect(fought.map.snapshots[1]).toEqual({ periodIndex: 1, day: DAY0 + 14, domainPoints: rec.dpAwarded, ring: 1, result: rec.result });
    // A replayed period never duplicates its snapshot.
    const replay = settleWave(fought, 1, T0, DAY0 + 14).save;
    expect(replay.map.snapshots).toHaveLength(2);
    let many = fought;
    for (let p = 2; p < SNAPSHOT_MAX + 10; p++) many = settleWave(many, p, T0, DAY0 + 7 * (p + 1)).save;
    expect(SNAPSHOT_MAX).toBe(WAVE_HISTORY_MAX);
    expect(many.map.snapshots).toHaveLength(SNAPSHOT_MAX);
    expect(many.map.snapshots[0]?.periodIndex).toBe(SNAPSHOT_MAX + 10 - SNAPSHOT_MAX);
    for (let i = 1; i < many.map.snapshots.length; i++) expect(many.map.snapshots[i]!.periodIndex).toBeGreaterThan(many.map.snapshots[i - 1]!.periodIndex);
  });

  it('is taken by the boundary routine on wave days and by the quiet path alike', () => {
    const s = freshWithBoard();
    const week = processBoundaries(s, at(7), TZ).save;
    expect(week.map.snapshots).toHaveLength(1);
    expect(week.map.snapshots[0]).toMatchObject({ periodIndex: 0, day: DAY0 + 7, result: 'quiet' });
    const month = processBoundaries(week, at(30), TZ).save;
    expect(month.map.snapshots.map((x) => x.periodIndex)).toEqual([0, 1, 2, 3]);
  });

  it('compareSnapshot picks the newest at least 7 days old, else the oldest, else DP 0', () => {
    const s = fresh();
    expect(COMPARE_DAYS).toBe(7);
    expect(compareSnapshot(s, DAY0 + 20)).toEqual({ periodIndex: -1, day: DAY0, domainPoints: 0, ring: 1, result: 'quiet' });
    let m = settleWave(trusted(s, 2), 0, T0, DAY0 + 7).save;
    m = settleWave(trusted(m, 2), 1, T0, DAY0 + 14).save;
    m = settleWave(trusted(m, 2), 2, T0, DAY0 + 21).save;
    expect(compareSnapshot(m, DAY0 + 22).periodIndex).toBe(1); // period 2 settled yesterday, too fresh
    expect(compareSnapshot(m, DAY0 + 28).periodIndex).toBe(2);
    expect(compareSnapshot(m, DAY0 + 8).periodIndex).toBe(0); // nothing is 7 days old yet: the oldest
  });

  it('waveResidue lists non-quiet settlements under 14 days old with their age', () => {
    let m = settleWave(fresh(), 0, T0, DAY0 + 7).save; // quiet: no mark
    m = settleWave(trusted(m, 2), 1, T0, DAY0 + 14).save;
    m = settleWave(trusted(m, 2), 2, T0, DAY0 + 21).save;
    expect(waveResidue(m, DAY0 + 21).map((r) => [r.periodIndex, r.age])).toEqual([
      [1, 7],
      [2, 0],
    ]);
    expect(waveResidue(m, DAY0 + 28).map((r) => r.periodIndex)).toEqual([2]);
    expect(waveResidue(m, DAY0 + 35)).toEqual([]);
    expect(wallsHeld(m)).toBe(2);
  });
});

describe('markMapSeen', () => {
  it('records today and the current DP, without events, and is a no-op when unchanged', () => {
    const s = fresh();
    const r = markMapSeen(s, T0, TZ);
    expect(r.events).toEqual([]);
    expect(r.save.map.lastSeen).toEqual({ day: DAY0, domainPoints: 0 });
    expect(markMapSeen(r.save, T0, TZ).save).toBe(r.save);
    const later = markMapSeen({ ...r.save, player: { ...r.save.player, domainPoints: 38 } }, at(3), TZ);
    expect(later.save.map.lastSeen).toEqual({ day: DAY0 + 3, domainPoints: 38 });
  });
});

describe('reset hour', () => {
  it('shifts every map day index with the rest of the save', () => {
    let s = createOutpost(fresh(), { name: 'Gym', type: 'gym', cell: { x: 2, y: 1 } }, T0, TZ).save;
    s = logOutpostVisit(s, 'op1', at(0, 0, 30), TZ).save; // 00:30 belongs to the previous game day with a 04:00 reset
    s = settleWave(s, 0, T0, s.lastOpenDay).save;
    s = markMapSeen(s, T0, TZ).save;
    const before = JSON.stringify(s.map);
    // Moving the reset to 23:00 at noon shifts "today" by one (the engine decides which way).
    const shifted = changeResetHour(s, 23, T0, TZ).save;
    const delta = shifted.firstPlayDay - s.firstPlayDay;
    expect(Math.abs(delta)).toBe(1);
    expect(shifted.map.outposts[0]?.createdDay).toBe(s.map.outposts[0]!.createdDay + delta);
    expect(shifted.map.outposts[0]?.lastVisitDay).toBe(s.map.outposts[0]!.lastVisitDay! + delta);
    expect(shifted.map.outposts[0]?.stateDays.marked).toBe(s.map.outposts[0]!.stateDays.marked! + delta);
    expect(shifted.map.visits[0]?.day).toBe(s.map.visits[0]!.day + delta);
    expect(shifted.map.snapshots[0]?.day).toBe(s.map.snapshots[0]!.day + delta);
    expect(shifted.map.lastSeen?.day).toBe(s.map.lastSeen!.day + delta);
    expect(JSON.stringify(s.map)).toBe(before);
  });

  it('keeps a tagged visit attached to its quest, so undo still removes the visit', () => {
    let s = createOutpost(freshWithBoard(), { name: 'Gym', type: 'gym', cell: { x: 2, y: 1 } }, T0, TZ).save;
    const q = s.board!.quests[0]!;
    s = completeQuest(s, q.instanceId, T0).save;
    s = tagQuestAtOutpost(s, q.instanceId, 'op1', T0, TZ).save;
    expect(s.map.outposts[0]?.visits).toBe(1);
    const shifted = changeResetHour(s, 23, T0, TZ).save;
    const delta = shifted.firstPlayDay - s.firstPlayDay;
    expect(Math.abs(delta)).toBe(1);
    const moved = shifted.board!.quests[0]!;
    expect(moved.instanceId).not.toBe(q.instanceId); // the board's own ids shift with the day
    expect(shifted.map.visits[0]?.instanceId).toBe(moved.instanceId);
    const undone = undoQuest(shifted, moved.instanceId, T0, TZ);
    expect(undone.error).toBeUndefined();
    expect(undone.save.map.visits).toHaveLength(0);
    expect(undone.save.map.outposts[0]?.visits).toBe(0);
  });
});
