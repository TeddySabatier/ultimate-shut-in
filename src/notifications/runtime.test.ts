import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '../game';
import { T0 } from '../game/testUtils';
import { useGameStore } from '../state/gameStore';
import { currentSave, seedStore } from '../test/storeUtils';
import { mockNotification, type NotificationMock } from './mockNotification';
import { DEFAULT_PREFS, REMINDERS_KEY, savePrefs } from './prefs';
import { HOP_MS, notificationPermission, rearm, requestNotificationPermission, startReminderRuntime, startReminderRuntimeWhenReady } from './runtime';
import { nextReminders } from './scheduler';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SW_WAIT_FOR_TEST = 4_000;

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

  it('shows through the active service worker registration when there is one', async () => {
    const calls: { title: string; options: NotificationOptions }[] = [];
    const reg = { showNotification: vi.fn(async (title: string, options: NotificationOptions) => void calls.push({ title, options })) };
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve(reg) }, configurable: true });
    try {
      seedStore();
      enable();
      stop = startReminderRuntime();
      const first = nextReminders(currentSave(), { ...DEFAULT_PREFS, enabled: true }, T0)[0];
      await vi.advanceTimersByTimeAsync((first?.at ?? T0) - T0 + 1000);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.title).toBe('SYSTEM');
      expect(calls[0]?.options.tag).toMatch(/^haven-/);
      expect(mock.shown).toHaveLength(0);
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('falls back to the page API when the service worker never becomes active', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: new Promise(() => undefined) }, configurable: true });
    try {
      seedStore();
      enable();
      stop = startReminderRuntime();
      const first = nextReminders(currentSave(), { ...DEFAULT_PREFS, enabled: true }, T0)[0];
      await vi.advanceTimersByTimeAsync((first?.at ?? T0) - T0 + 1000);
      await vi.advanceTimersByTimeAsync(SW_WAIT_FOR_TEST);
      expect(mock.shown.length).toBeGreaterThan(0);
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('never asks the browser to schedule notifications itself', async () => {
    const trigger = vi.fn();
    Object.defineProperty(globalThis, 'TimestampTrigger', { value: trigger, configurable: true, writable: true });
    const reg = { showNotification: vi.fn(async () => undefined), getNotifications: vi.fn(async () => []) };
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve(reg) }, configurable: true });
    try {
      seedStore();
      enable();
      stop = startReminderRuntime();
      await vi.advanceTimersByTimeAsync(0);
      expect(trigger).not.toHaveBeenCalled();
      expect(reg.getNotifications).not.toHaveBeenCalled();
      expect(reg.showNotification).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
      Reflect.deleteProperty(globalThis, 'TimestampTrigger');
    }
  });

  it('waits in short hops and re-reads the clock, so a long sleep cannot leave a reminder hours late', async () => {
    seedStore();
    enable();
    stop = startReminderRuntime();
    const first = nextReminders(currentSave(), { ...DEFAULT_PREFS, enabled: true }, T0)[0];
    const wait = (first?.at ?? T0) - T0;
    expect(wait).toBeGreaterThan(HOP_MS);
    // Jump the wall clock to just before the reminder without running any timer (the OS slept).
    vi.setSystemTime(T0 + wait - 1000);
    await vi.advanceTimersByTimeAsync(HOP_MS);
    expect(mock.shown.map((n) => n.options?.tag)).toContain(`haven-${first?.id}`);
  });

  it('stops when another tab turns the reminders off (storage event)', () => {
    seedStore();
    enable();
    stop = startReminderRuntime();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    localStorage.setItem(REMINDERS_KEY, JSON.stringify({ ...DEFAULT_PREFS, enabled: false }));
    window.dispatchEvent(new StorageEvent('storage', { key: REMINDERS_KEY }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-arms on window focus', () => {
    seedStore();
    enable();
    stop = startReminderRuntime();
    const armed = vi.getTimerCount();
    vi.clearAllTimers();
    window.dispatchEvent(new Event('focus'));
    expect(vi.getTimerCount()).toBe(armed);
  });

  it('does not show a reminder if the switch was turned off while its timer was pending', async () => {
    seedStore();
    enable();
    stop = startReminderRuntime();
    const first = nextReminders(currentSave(), { ...DEFAULT_PREFS, enabled: true }, T0)[0];
    // Off in storage only: no event, so the pending timer is still armed.
    localStorage.setItem(REMINDERS_KEY, JSON.stringify({ ...DEFAULT_PREFS, enabled: false }));
    await vi.advanceTimersByTimeAsync((first?.at ?? T0) - T0 + 1000);
    expect(mock.shown).toHaveLength(0);
  });
});

describe('startReminderRuntimeWhenReady', () => {
  it('starts right away without a service worker and never throws', () => {
    seedStore();
    enable();
    expect(() => startReminderRuntimeWhenReady()).not.toThrow();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    stop = startReminderRuntime();
  });

  it('waits for an active service worker before starting', async () => {
    let resolveReady: (reg: unknown) => void = () => undefined;
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: new Promise((r) => (resolveReady = r)) }, configurable: true });
    try {
      seedStore();
      enable();
      startReminderRuntimeWhenReady();
      await vi.advanceTimersByTimeAsync(0);
      // Only the wait for the worker is pending: no reminder is armed yet.
      expect(vi.getTimerCount()).toBe(1);
      resolveReady({ showNotification: vi.fn() });
      await vi.advanceTimersByTimeAsync(0);
      // The wait is cleared and the board and wave reminders are armed.
      expect(vi.getTimerCount()).toBeGreaterThan(1);
      stop = startReminderRuntime();
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
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
