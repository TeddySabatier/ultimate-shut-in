import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '../game';
import { T0 } from '../game/testUtils';
import { useGameStore } from '../state/gameStore';
import { currentSave, seedStore } from '../test/storeUtils';
import { mockNotification, type NotificationMock } from './mockNotification';
import { DEFAULT_PREFS, REMINDERS_KEY, savePrefs } from './prefs';
import { notificationPermission, rearm, requestNotificationPermission, startReminderRuntime } from './runtime';
import { nextReminders } from './scheduler';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let mock: NotificationMock;
let stop: (() => void) | null = null;

function enable(patch: Partial<typeof DEFAULT_PREFS> = {}): void {
  savePrefs({ ...DEFAULT_PREFS, enabled: true, ...patch });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  mock = mockNotification('granted');
});

afterEach(() => {
  stop?.();
  stop = null;
  mock.restore();
  vi.useRealTimers();
  localStorage.removeItem(REMINDERS_KEY);
});

describe('reminder runtime', () => {
  it('arms nothing while the master switch is off', () => {
    seedStore();
    stop = startReminderRuntime();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('arms nothing without permission, even when the switch is on', () => {
    mock.setPermission('denied');
    seedStore();
    enable();
    stop = startReminderRuntime();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fires the board reminder at its time as a SYSTEM notification, then arms the next day', async () => {
    seedStore();
    enable();
    stop = startReminderRuntime();
    const first = nextReminders(currentSave(), { ...DEFAULT_PREFS, enabled: true }, T0).find((r) => r.kind === 'board');
    expect(first).toBeDefined();
    const at = first?.at ?? 0;

    await vi.advanceTimersByTimeAsync(at - T0 - 1000);
    expect(mock.shown).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    const board = mock.shown.filter((n) => n.options?.tag === 'haven-board');
    expect(board).toHaveLength(1);
    expect(board[0]?.title).toBe('SYSTEM');
    expect(strings.reminders.board).toContain(board[0]?.options?.body);

    await vi.advanceTimersByTimeAsync(DAY);
    expect(mock.shown.filter((n) => n.options?.tag === 'haven-board')).toHaveLength(2);
  });

  it('fires the timer reminder with the quest title when a running timer reaches its duration', async () => {
    seedStore();
    const timer = currentSave().board?.quests.find((q) => q.kind === 'timer');
    expect(timer).toBeDefined();
    enable({ board: { on: false, minutes: 510 }, wave: { on: false, minutes: 1140 } });
    stop = startReminderRuntime();
    expect(vi.getTimerCount()).toBe(0);

    useGameStore.getState().startTimer(timer?.instanceId ?? '');
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(3 * HOUR);
    const fired = mock.shown.filter((n) => n.options?.tag?.startsWith('haven-timer:'));
    expect(fired).toHaveLength(1);
    const quest = strings.reminders.timer.map((l) => l.split('{quest}'));
    expect(quest.some(([head, tail]) => fired[0]?.options?.body?.startsWith(head ?? '') && fired[0]?.options?.body?.endsWith(tail ?? ''))).toBe(true);
    expect(fired[0]?.options?.body).not.toContain('{quest}');
  });

  it('drops a timer reminder when the timer is paused before it ends', () => {
    seedStore();
    const timer = currentSave().board?.quests.find((q) => q.kind === 'timer');
    enable({ board: { on: false, minutes: 510 }, wave: { on: false, minutes: 1140 } });
    stop = startReminderRuntime();
    useGameStore.getState().startTimer(timer?.instanceId ?? '');
    expect(vi.getTimerCount()).toBe(1);
    useGameStore.getState().pauseTimer(timer?.instanceId ?? '');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-arms when the page becomes visible again', () => {
    seedStore();
    enable();
    stop = startReminderRuntime();
    const armed = vi.getTimerCount();
    expect(armed).toBeGreaterThan(0);
    vi.clearAllTimers();
    expect(vi.getTimerCount()).toBe(0);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(armed);
  });

  it('re-arms when the prefs change and clears everything when the switch goes off', () => {
    seedStore();
    enable();
    stop = startReminderRuntime();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    savePrefs({ ...DEFAULT_PREFS, enabled: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is idempotent and stopping it clears the timers', () => {
    seedStore();
    enable();
    stop = startReminderRuntime();
    expect(startReminderRuntime()).toBe(stop);
    stop();
    stop = null;
    expect(vi.getTimerCount()).toBe(0);
    rearm();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    vi.clearAllTimers();
  });

  it('uses the Notification Triggers API when the browser has it', async () => {
    const scheduled: { title: string; trigger: unknown }[] = [];
    const closed: string[] = [];
    class TimestampTrigger {
      constructor(public timestamp: number) {}
    }
    Object.defineProperty(globalThis, 'TimestampTrigger', { value: TimestampTrigger, configurable: true, writable: true });
    Object.defineProperty(window.Notification.prototype, 'showTrigger', { value: null, configurable: true });
    const reg = {
      getNotifications: vi.fn(async () => [{ tag: 'haven-old', close: () => closed.push('haven-old') }]),
      showNotification: vi.fn(async (title: string, options: { showTrigger?: unknown }) => {
        scheduled.push({ title, trigger: options.showTrigger });
      }),
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => reg }, configurable: true });
    try {
      seedStore();
      enable();
      stop = startReminderRuntime();
      await vi.advanceTimersByTimeAsync(0);
      expect(closed).toEqual(['haven-old']);
      expect(scheduled.length).toBeGreaterThan(0);
      expect(scheduled.every((s) => s.title === 'SYSTEM' && s.trigger instanceof TimestampTrigger)).toBe(true);
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
      Reflect.deleteProperty(globalThis, 'TimestampTrigger');
    }
  });
});

describe('permission helpers', () => {
  it('reads the permission state and requests it on demand', async () => {
    mock.setPermission('default');
    expect(notificationPermission()).toBe('default');
    expect(mock.requestPermission).not.toHaveBeenCalled();
    await expect(requestNotificationPermission()).resolves.toBe('granted');
    expect(mock.requestPermission).toHaveBeenCalledTimes(1);
    expect(notificationPermission()).toBe('granted');
  });
});
