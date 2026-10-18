import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  currentMonthKey,
  dayInWavePeriod,
  daysUntilWave,
  defaultTzOffset,
  fixedTz,
  gameDayIndex,
  gameDayStartMs,
  isWaveBoundary,
  relativeDay,
  wavePeriodIndex,
} from './time';

const utc = fixedTz(0);
const plus2 = fixedTz(-120); // UTC+2, Date#getTimezoneOffset convention

describe('gameDayIndex', () => {
  it('a quest at 01:30 belongs to the previous day with a 04:00 reset', () => {
    const midnight = Date.UTC(2026, 2, 10, 0, 0, 0);
    const before = gameDayIndex(midnight + 1.5 * 3_600_000, 4, utc);
    const after = gameDayIndex(midnight + 4 * 3_600_000, 4, utc);
    const justBefore = gameDayIndex(midnight + 4 * 3_600_000 - 1, 4, utc);
    expect(after).toBe(before + 1);
    expect(justBefore).toBe(before);
    expect(gameDayIndex(midnight - 1, 4, utc)).toBe(before);
  });

  it('honours the timezone provider', () => {
    // 02:30 UTC on 2026-03-10 is 04:30 in UTC+2: a new day there, still the old day in UTC.
    const t = Date.UTC(2026, 2, 10, 2, 30, 0);
    expect(gameDayIndex(t, 4, plus2)).toBe(gameDayIndex(t, 4, utc) + 1);
  });

  it('reset hour 0 is plain local midnight', () => {
    const t = Date.UTC(2026, 2, 10, 0, 0, 0);
    expect(gameDayIndex(t, 0, utc)).toBe(Math.floor(t / DAY_MS));
    expect(gameDayIndex(t - 1, 0, utc)).toBe(Math.floor(t / DAY_MS) - 1);
  });

  it('is consistent across a DST-like offset change when passing fixed instants', () => {
    // Offset switches from UTC+1 to UTC+2 at 01:00 UTC on 2026-03-29.
    const change = Date.UTC(2026, 2, 29, 1, 0, 0);
    const tz = (ms: number): number => (ms < change ? -60 : -120);
    const dayBefore = gameDayIndex(change - 2 * 3_600_000, 4, tz); // 00:00 local (UTC+1) -> previous game day
    const dayAfter = gameDayIndex(change + 3 * 3_600_000, 4, tz); // 06:00 local (UTC+2) -> next game day
    expect(dayAfter).toBe(dayBefore + 1);
  });

  it('gameDayStartMs inverts gameDayIndex at the reset hour', () => {
    const day = gameDayIndex(Date.UTC(2026, 5, 1, 12), 4, plus2);
    const start = gameDayStartMs(day, 4, plus2);
    expect(gameDayIndex(start, 4, plus2)).toBe(day);
    expect(gameDayIndex(start - 1, 4, plus2)).toBe(day - 1);
  });

  it('defaultTzOffset reads the environment', () => {
    expect(typeof defaultTzOffset(Date.now())).toBe('number');
  });
});

describe('currentMonthKey', () => {
  it('formats YYYY-MM in local time', () => {
    expect(currentMonthKey(Date.UTC(2026, 0, 15), utc)).toBe('2026-01');
    expect(currentMonthKey(Date.UTC(2026, 11, 31, 23, 30), utc)).toBe('2026-12');
    expect(currentMonthKey(Date.UTC(2026, 11, 31, 23, 30), plus2)).toBe('2027-01');
  });
});

describe('wave periods', () => {
  it('computes period index and position', () => {
    expect(relativeDay(107, 100)).toBe(7);
    expect(wavePeriodIndex(100, 100)).toBe(0);
    expect(wavePeriodIndex(106, 100)).toBe(0);
    expect(wavePeriodIndex(107, 100)).toBe(1);
    expect(dayInWavePeriod(106, 100)).toBe(6);
    expect(dayInWavePeriod(107, 100)).toBe(0);
    expect(dayInWavePeriod(99, 100)).toBe(6);
    expect(daysUntilWave(100, 100)).toBe(7);
    expect(daysUntilWave(106, 100)).toBe(1);
  });

  it('isWaveBoundary is true when the next day starts a period', () => {
    expect(isWaveBoundary(106, 100)).toBe(true);
    expect(isWaveBoundary(105, 100)).toBe(false);
    expect(isWaveBoundary(113, 100)).toBe(true);
  });
});
