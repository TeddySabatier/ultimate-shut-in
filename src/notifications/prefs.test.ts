import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, REMINDERS_KEY, loadPrefs, sanitizePrefs, savePrefs } from './prefs';

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
});
