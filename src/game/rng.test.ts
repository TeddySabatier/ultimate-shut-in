import { describe, expect, it } from 'vitest';
import { fnv1a, mulberry32, rngInt, rngPick, rngWeightedIndex } from './rng';

describe('rng', () => {
  it('fnv1a matches known vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('mulberry32 is deterministic for a seed and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seq = Array.from({ length: 10 }, () => a());
    expect(seq).toEqual(Array.from({ length: 10 }, () => b()));
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('rngInt and rngPick stay in range', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const n = rngInt(rng, 5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
    }
    expect(['x', 'y']).toContain(rngPick(rng, ['x', 'y']));
    expect(() => rngPick(rng, [])).toThrow();
  });

  it('rngWeightedIndex respects weights', () => {
    const rng = mulberry32(99);
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[rngWeightedIndex(rng, [1, 0.0001, 9])]! += 1;
    expect(counts[2]).toBeGreaterThan(counts[0]! * 5);
    expect(counts[1]).toBeLessThan(10);
    expect(rngWeightedIndex(() => 0.999999, [1, 1])).toBe(1);
  });
});
