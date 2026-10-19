import { describe, expect, it } from 'vitest';
import { fixedTz, resolveTemplate, type SaveFile } from '../game';
import { T0, at, freshWithBoard } from '../game/testUtils';
import { DEFAULT_PREFS, type ReminderPrefs } from './prefs';
import { instantAt, isQuiet, localMinutes, nextReminders } from './scheduler';

const UTC = fixedTz(0);
const ON: ReminderPrefs = { ...DEFAULT_PREFS, enabled: true };

function withSettings(save: SaveFile, patch: Partial<SaveFile['settings']>): SaveFile {
  return { ...save, settings: { ...save.settings, ...patch } };
}

/** Save whose first timer quest was started at `startedAt`; also returns the quest's duration and ids. */
function withRunningTimer(startedAt: number, accumulatedMs = 0): { save: SaveFile; needed: number; instanceId: string } {
  const base = freshWithBoard();
  const timer = base.board?.quests.find((x) => x.kind === 'timer' && x.status === 'open');
  if (!timer || !base.board) throw new Error('the fresh board has no timer quest');
  const needed = (resolveTemplate(base, timer.templateId)?.durationMin ?? 0) * 60_000;
  const quests = base.board.quests.map((x) => (x === timer ? { ...x, timer: { startedAt, accumulatedMs } } : x));
  return { save: { ...base, board: { ...base.board, quests } }, needed, instanceId: timer.instanceId };
}

describe('time helpers', () => {
  it('computes local minutes and instants with an injected zone', () => {
    expect(localMinutes(at(0, 8, 30), UTC)).toBe(8 * 60 + 30);
    // UTC+2 (offset -120): 06:30 UTC is 08:30 local.
    expect(localMinutes(at(0, 6, 30), fixedTz(-120))).toBe(8 * 60 + 30);
    const day = Math.floor(at(0, 0) / 86_400_000);
    expect(instantAt(day, 8 * 60 + 30, UTC)).toBe(at(0, 8, 30));
    expect(instantAt(day, 8 * 60 + 30, fixedTz(-120))).toBe(at(0, 6, 30));
  });

  it('knows quiet hours that wrap midnight, that do not, and none', () => {
    expect(isQuiet(at(0, 23, 30), 23, 8, UTC)).toBe(true);
    expect(isQuiet(at(0, 3), 23, 8, UTC)).toBe(true);
    expect(isQuiet(at(0, 8), 23, 8, UTC)).toBe(false);
    expect(isQuiet(at(0, 22, 59), 23, 8, UTC)).toBe(false);
    // Lights out after midnight, wake later the same day.
    expect(isQuiet(at(0, 2), 1, 9, UTC)).toBe(true);
    expect(isQuiet(at(0, 12), 1, 9, UTC)).toBe(false);
    expect(isQuiet(at(0, 3), 6, 6, UTC)).toBe(false);
  });
});

describe('nextReminders: master switch', () => {
  it('returns nothing while the master switch is off', () => {
    expect(nextReminders(freshWithBoard(), { ...ON, enabled: false }, T0, UTC)).toEqual([]);
  });
});

describe('nextReminders: board issued', () => {
  it('fires at 08:30 today when it is still ahead, else tomorrow', () => {
    const save = freshWithBoard();
    const morning = nextReminders(save, ON, at(0, 7, 0), UTC).find((r) => r.kind === 'board');
    expect(morning?.at).toBe(at(0, 8, 30));
    const afternoon = nextReminders(save, ON, at(0, 12, 0), UTC).find((r) => r.kind === 'board');
    expect(afternoon?.at).toBe(at(1, 8, 30));
  });

  it('never fires at the exact current instant', () => {
    const r = nextReminders(freshWithBoard(), ON, at(0, 8, 30), UTC).find((x) => x.kind === 'board');
    expect(r?.at).toBe(at(1, 8, 30));
  });

  it('honours a custom time and the local time zone', () => {
    const prefs = { ...ON, board: { on: true, minutes: 9 * 60 } };
    const r = nextReminders(freshWithBoard(), prefs, at(0, 0, 10), fixedTz(-120)).find((x) => x.kind === 'board');
    expect(r?.at).toBe(at(0, 7, 0));
  });

  it('is skipped when its own toggle is off', () => {
    const prefs = { ...ON, board: { on: false, minutes: 8 * 60 + 30 } };
    expect(nextReminders(freshWithBoard(), prefs, at(0, 7), UTC).some((r) => r.kind === 'board')).toBe(false);
  });

  it('never fires before the reset hour: the board does not exist yet', () => {
    const save = withSettings(freshWithBoard(), { resetHour: 10, wakeHour: 6, lightsOutHour: 22 });
    const prefs = { ...ON, board: { on: true, minutes: 8 * 60 + 30 } };
    const r = nextReminders(save, prefs, at(0, 7), UTC).find((x) => x.kind === 'board');
    expect(r?.at).toBe(at(0, 10, 0));
  });

  it('slides out of quiet hours to the wake hour', () => {
    const save = withSettings(freshWithBoard(), { lightsOutHour: 23, wakeHour: 8 });
    const prefs = { ...ON, board: { on: true, minutes: 23 * 60 + 30 } };
    const r = nextReminders(save, prefs, at(0, 12), UTC).find((x) => x.kind === 'board');
    expect(r?.at).toBe(at(1, 8, 0));
    expect(isQuiet(r?.at ?? 0, 23, 8, UTC)).toBe(false);
  });

  it('after sliding it still waits for the reset hour', () => {
    const save = withSettings(freshWithBoard(), { lightsOutHour: 22, wakeHour: 2, resetHour: 5 });
    const prefs = { ...ON, board: { on: true, minutes: 23 * 60 } };
    const r = nextReminders(save, prefs, at(0, 12), UTC).find((x) => x.kind === 'board');
    expect(r?.at).toBe(at(1, 5, 0));
  });
});

describe('nextReminders: wave tomorrow', () => {
  // The fixture's first day is Mon 2026-01-05; period 0 ends with its last game day, Sun 2026-01-11.
  it('fires at 19:00 on the last game day of the wave period', () => {
    const r = nextReminders(freshWithBoard(), ON, at(0, 12), UTC).find((x) => x.kind === 'wave');
    expect(r?.at).toBe(at(6, 19, 0));
  });

  it('moves to the next period once this one is past', () => {
    const r = nextReminders(freshWithBoard(), ON, at(6, 20), UTC).find((x) => x.kind === 'wave');
    expect(r?.at).toBe(at(13, 19, 0));
  });

  it('uses the reset hour to decide which game day a time belongs to', () => {
    // Reset 20:00, first day Mon 2026-01-05: Sunday 19:00 still belongs to Saturday's game day,
    // so the last game day's 19:00 is the next calendar day, Monday 2026-01-12 at 19:00.
    const now = at(0, 21);
    const late = freshWithBoard({ settings: { resetHour: 20, lightsOutHour: 23, wakeHour: 8 } }, now);
    expect(nextReminders(late, ON, now + 60_000, UTC).find((x) => x.kind === 'wave')?.at).toBe(at(7, 19, 0));
    const early = freshWithBoard({ settings: { resetHour: 4 } }, now);
    expect(nextReminders(early, ON, now + 60_000, UTC).find((x) => x.kind === 'wave')?.at).toBe(at(6, 19, 0));
  });

  it('is dropped, not moved, when its time falls in quiet hours', () => {
    const prefs = { ...ON, wave: { on: true, minutes: 23 * 60 + 30 } };
    const r = nextReminders(freshWithBoard(), prefs, at(0, 12), UTC).find((x) => x.kind === 'wave');
    // The first period's evening is quiet; the next period's is quiet too, so nothing is planned.
    expect(r).toBeUndefined();
  });

  it('is skipped when its toggle is off', () => {
    const prefs = { ...ON, wave: { on: false, minutes: 19 * 60 } };
    expect(nextReminders(freshWithBoard(), prefs, at(0, 12), UTC).some((r) => r.kind === 'wave')).toBe(false);
  });
});

describe('nextReminders: timer finished', () => {
  it('fires exactly when a running timer reaches its duration', () => {
    const started = at(0, 14, 0);
    const { save, needed, instanceId } = withRunningTimer(started);
    expect(needed).toBeGreaterThan(0);
    const planned = nextReminders(save, ON, at(0, 14, 1), UTC).filter((r) => r.kind === 'timer');
    expect(planned).toEqual([{ id: `timer:${instanceId}`, kind: 'timer', at: started + needed, label: expect.any(String) }]);
  });

  it('counts time already accumulated before a pause', () => {
    const started = at(0, 14, 0);
    const a = nextReminders(withRunningTimer(started, 0).save, ON, at(0, 14, 1), UTC).find((r) => r.kind === 'timer');
    const b = nextReminders(withRunningTimer(started, 120_000).save, ON, at(0, 14, 1), UTC).find((r) => r.kind === 'timer');
    expect((a?.at ?? 0) - (b?.at ?? 0)).toBe(120_000);
  });

  it('ignores untouched quests and timers that already ran out', () => {
    expect(nextReminders(freshWithBoard(), ON, T0, UTC).some((r) => r.kind === 'timer')).toBe(false);
    const { save } = withRunningTimer(at(0, 9, 0));
    expect(nextReminders(save, ON, at(0, 20), UTC).some((r) => r.kind === 'timer')).toBe(false);
  });

  it('ignores a paused timer (no start instant)', () => {
    const base = freshWithBoard();
    const { save } = withRunningTimer(at(0, 14, 0));
    const quests = (save.board?.quests ?? []).map((q) => (q.timer ? { ...q, timer: { startedAt: null, accumulatedMs: 60_000 } } : q));
    const paused = { ...base, board: save.board ? { ...save.board, quests } : null };
    expect(nextReminders(paused, ON, at(0, 14, 1), UTC).some((r) => r.kind === 'timer')).toBe(false);
  });

  it('is dropped when it would finish in quiet hours', () => {
    const probe = withRunningTimer(at(0, 0, 0));
    const started = at(0, 23, 30) - probe.needed;
    const { save } = withRunningTimer(started);
    expect(nextReminders(save, ON, started + 1, UTC).some((r) => r.kind === 'timer')).toBe(false);
  });

  it('is skipped when its toggle is off', () => {
    const { save } = withRunningTimer(at(0, 14, 0));
    expect(nextReminders(save, { ...ON, timer: { on: false } }, at(0, 14, 1), UTC).some((r) => r.kind === 'timer')).toBe(false);
  });
});

describe('nextReminders: ordering', () => {
  it('lists reminders in firing order', () => {
    const { save } = withRunningTimer(at(0, 6, 0));
    const planned = nextReminders(save, ON, at(0, 6, 1), UTC);
    const times = planned.map((r) => r.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(planned.map((r) => r.kind)).toContain('board');
    expect(planned.map((r) => r.kind)).toContain('wave');
  });
});
