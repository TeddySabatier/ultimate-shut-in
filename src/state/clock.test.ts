import { afterEach, describe, expect, it } from 'vitest';
import { getNowOffsetMs, now, setNowOffsetMs } from './clock';

describe('clock', () => {
  afterEach(() => setNowOffsetMs(0));

  it('reads the wall clock with no offset', () => {
    const before = Date.now();
    const n = now();
    expect(n).toBeGreaterThanOrEqual(before);
    expect(n - before).toBeLessThan(1000);
    expect(getNowOffsetMs()).toBe(0);
  });

  it('shifts now() by the offset, forward and backward', () => {
    setNowOffsetMs(86_400_000 * 3);
    expect(now() - Date.now()).toBeGreaterThanOrEqual(86_400_000 * 3 - 5);
    expect(getNowOffsetMs()).toBe(86_400_000 * 3);
    setNowOffsetMs(-60_000);
    expect(Date.now() - now()).toBeGreaterThanOrEqual(60_000 - 5);
  });

  it('truncates fractions and ignores non-finite values', () => {
    setNowOffsetMs(1500.9);
    expect(getNowOffsetMs()).toBe(1500);
    setNowOffsetMs(Number.NaN);
    expect(getNowOffsetMs()).toBe(0);
    setNowOffsetMs(Number.POSITIVE_INFINITY);
    expect(getNowOffsetMs()).toBe(0);
  });
});
