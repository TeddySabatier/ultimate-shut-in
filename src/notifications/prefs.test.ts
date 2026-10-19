import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, REMINDERS_KEY, loadPrefs, sanitizePrefs, savePrefs, subscribePrefs } from './prefs';

describe('reminder prefs', () => {
  it('defaults to off with board 08:30, wave 19:00 and the timer on', () => {
    expect(loadPrefs()).toEqual({
      enabled: false,
      board: { on: true, minutes: 510 },
      wave: { on: true, minutes: 1140 },
      timer: { on: true },
    });
  });

  it('round-trips through localStorage', () => {
    savePrefs({ ...DEFAULT_PREFS, enabled: true, board: { on: false, minutes: 9 * 60 } });
    expect(loadPrefs().enabled).toBe(true);
    expect(loadPrefs().board).toEqual({ on: false, minutes: 540 });
    expect(JSON.parse(localStorage.getItem(REMINDERS_KEY) ?? '{}')).toMatchObject({ enabled: true });
  });

  it('repairs junk instead of throwing', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({ enabled: 'yes', board: { minutes: 99999 }, wave: { minutes: -5, on: false }, timer: 3 })).toEqual({
      enabled: false,
      board: { on: true, minutes: 1439 },
      wave: { on: false, minutes: 0 },
      timer: { on: true },
    });
    localStorage.setItem(REMINDERS_KEY, '{not json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('says so when the browser will not store the prefs, and keeps what was there', () => {
    expect(savePrefs({ ...DEFAULT_PREFS, enabled: true })).toBe(true);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      expect(savePrefs({ ...DEFAULT_PREFS, enabled: false })).toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(loadPrefs().enabled).toBe(true);
  });

  it('notifies listeners on local saves and on storage events from other tabs', () => {
    const listener = vi.fn();
    const off = subscribePrefs(listener);
    savePrefs(DEFAULT_PREFS);
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: REMINDERS_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: REMINDERS_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
