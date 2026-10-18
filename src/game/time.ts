/**
 * Game-day computation (GDD 6.8) and wave-period helpers (GDD 9.1).
 *
 * A game day index is the number of whole days since the Unix epoch, measured
 * on the local wall clock shifted back by the reset hour. A quest done at
 * 01:30 with a 04:00 reset therefore belongs to the previous calendar day.
 * The timezone is injected (minutes, same sign convention as
 * `Date#getTimezoneOffset`) so tests can pass fixed values; the default reads
 * the environment's local zone.
 */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const DAYS_PER_WAVE = 7;

export type TzOffsetProvider = (ms: number) => number;

export const defaultTzOffset: TzOffsetProvider = (ms) => new Date(ms).getTimezoneOffset();

/** Fixed-offset provider for tests, e.g. `fixedTz(0)` for UTC, `fixedTz(-120)` for UTC+2. */
export function fixedTz(offsetMinutes: number): TzOffsetProvider {
  return () => offsetMinutes;
}

export interface TimeOptions {
  tz?: TzOffsetProvider;
}

/** Absolute game day index for an instant, given the player's reset hour (0..23). */
export function gameDayIndex(nowMs: number, resetHour: number, tz: TzOffsetProvider = defaultTzOffset): number {
  const shifted = nowMs - resetHour * HOUR_MS;
  const local = shifted - tz(shifted) * 60_000;
  return Math.floor(local / DAY_MS);
}

/** Unix ms at which the given game day starts (its reset hour), for display. */
export function gameDayStartMs(day: number, resetHour: number, tz: TzOffsetProvider = defaultTzOffset): number {
  const approxLocal = day * DAY_MS + resetHour * HOUR_MS;
  // Two passes handle the offset being evaluated near the boundary.
  let utc = approxLocal + tz(approxLocal) * 60_000;
  utc = approxLocal + tz(utc) * 60_000;
  return utc;
}

/** Local calendar month key "YYYY-MM" (GDD 13: one resurrection per calendar month). */
export function currentMonthKey(nowMs: number, tz: TzOffsetProvider = defaultTzOffset): string {
  const local = new Date(nowMs - tz(nowMs) * 60_000);
  const m = local.getUTCMonth() + 1;
  return `${local.getUTCFullYear()}-${m < 10 ? '0' : ''}${m}`;
}

/** Day index relative to the first play day (0 on the first day). */
export function relativeDay(day: number, firstPlayDay: number): number {
  return day - firstPlayDay;
}

/** 0-based wave period index containing `day`. Period i covers relative days [7i, 7i+7). */
export function wavePeriodIndex(day: number, firstPlayDay: number): number {
  return Math.floor(relativeDay(day, firstPlayDay) / DAYS_PER_WAVE);
}

/** Position of `day` inside its wave period, 0..6. */
export function dayInWavePeriod(day: number, firstPlayDay: number): number {
  const r = relativeDay(day, firstPlayDay) % DAYS_PER_WAVE;
  return r < 0 ? r + DAYS_PER_WAVE : r;
}

/** Days until the current period settles (1 means "settles tonight"). */
export function daysUntilWave(day: number, firstPlayDay: number): number {
  return DAYS_PER_WAVE - dayInWavePeriod(day, firstPlayDay);
}

/** True when the boundary from `dayEnded` to `dayEnded + 1` closes a wave period. */
export function isWaveBoundary(dayEnded: number, firstPlayDay: number): boolean {
  return relativeDay(dayEnded + 1, firstPlayDay) % DAYS_PER_WAVE === 0;
}
