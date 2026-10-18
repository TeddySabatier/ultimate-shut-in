/** Deterministic hashing and PRNG (GDD 6.3): FNV-1a 32-bit and mulberry32. */

/** 32-bit FNV-1a hash of a string; returns an unsigned integer. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rng = () => number;

/** mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n) from the PRNG. */
export function rngInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Uniform pick from a non-empty array. */
export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rngInt(rng, items.length)];
  if (item === undefined) throw new Error('rngPick: empty array');
  return item;
}

/** Weighted pick; weights must be positive. Returns the index. */
export function rngWeightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}
