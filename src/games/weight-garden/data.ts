/**
 * The seeds scattered on each plot: two clusters, four corners (XOR), noisy
 * clusters with a few mislabelled training seeds, and a ring. All from a seeded
 * generator, with integer-looking arithmetic only (sums of uniforms stand in for
 * a bell curve, so no log, cos or exp).
 */
import { clamp, countRight, round4, train, zeroNet, type Seed } from './net';

export type RoomKind = 'line' | 'train' | 'xor' | 'noise' | 'boss';
export const ROOM_KINDS: readonly RoomKind[] = ['line', 'train', 'xor', 'noise', 'boss'];

/** Unit directions the two clusters can lie along (exact ratios, no trigonometry). */
const AXES: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.8, 0.6],
  [0.6, 0.8],
  [0, 1],
  [-0.6, 0.8],
  [-0.8, 0.6],
];

type Rng = () => number;

function bell(rng: Rng): number {
  return (rng() + rng() + rng()) / 1.5 - 1; // roughly -1..1, peaked at 0
}

function pt(x: number, y: number, l: number, t: number): Seed {
  return { x: round4(clamp(x, -1.15, 1.15)), y: round4(clamp(y, -1.15, 1.15)), l, t };
}

/** Two clusters along a random direction. `flips` training seeds get the wrong label. */
function clusters(rng: Rng, o: { gap: number; spread: number; nTrain: number; nTest: number; flips: number }): Seed[] {
  const axis = AXES[Math.floor(rng() * AXES.length)] ?? AXES[0]!;
  const ux = axis[0];
  const uy = axis[1];
  const out: Seed[] = [];
  for (const [t, n] of [
    [1, o.nTrain],
    [0, o.nTest],
  ] as const) {
    for (const l of [1, -1]) {
      for (let i = 0; i < n; i++) {
        const along = l * o.gap + bell(rng) * o.spread;
        const across = bell(rng) * o.spread * 1.6;
        out.push(pt(ux * along - uy * across, uy * along + ux * across, l, t));
      }
    }
  }
  // Mislabel a few training seeds (the "noise"), each one only once.
  const pool: number[] = [];
  out.forEach((p, i) => {
    if (p.t === 1) pool.push(i);
  });
  for (let k = 0; k < o.flips && pool.length > 0; k++) {
    const pick = pool.splice(Math.floor(rng() * pool.length), 1)[0] ?? 0;
    const p = out[pick];
    if (p) out[pick] = { ...p, l: -p.l };
  }
  return out;
}

/** Four corners: opposite corners share a kind. No single line separates them. */
function corners(rng: Rng, o: { inner: number; reach: number; nTrain: number; nTest: number }): Seed[] {
  const out: Seed[] = [];
  for (const [t, n] of [
    [1, o.nTrain],
    [0, o.nTest],
  ] as const) {
    for (const qx of [-1, 1]) {
      for (const qy of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          out.push(pt(qx * (o.inner + rng() * o.reach), qy * (o.inner + rng() * o.reach), qx === qy ? 1 : -1, t));
        }
      }
    }
  }
  return out;
}

/** A disc of one kind inside a ring of the other, with an empty margin between them. */
function ring(rng: Rng, o: { radius: number; margin: number; nTrain: number; nTest: number }): Seed[] {
  const out: Seed[] = [];
  for (const [t, n] of [
    [1, o.nTrain],
    [0, o.nTest],
  ] as const) {
    let made = 0;
    let guard = 0;
    while (made < n && guard < n * 60) {
      guard += 1;
      const x = rng() * 2.1 - 1.05;
      const y = rng() * 2.1 - 1.05;
      const r2 = x * x + y * y;
      const inner = o.radius * o.radius;
      const outer = (o.radius + o.margin) * (o.radius + o.margin);
      if (r2 > inner && r2 < outer) continue;
      if (r2 > 1.12) continue;
      // Alternate so both kinds are present in every set.
      const l = r2 <= inner ? 1 : -1;
      const want = made % 2 === 0 ? 1 : -1;
      if (l !== want && rng() < 0.7) continue;
      out.push(pt(x, y, l, t));
      made += 1;
    }
  }
  return out;
}

/** Test accuracy (percent) the noisy plot asks for, by difficulty 1 to 5. */
export const NOISE_GOAL: readonly number[] = [82, 86, 88, 89, 90];

/**
 * Noisy clusters. A plain line must be able to reach the goal on the test seeds
 * (so that stopping early or staying small always works): candidates are drawn
 * until one qualifies, at most ten times.
 */
function noisy(rng: Rng, d: number): Seed[] {
  const goal = NOISE_GOAL[d - 1] ?? 86;
  let best: Seed[] = [];
  let bestAcc = -1;
  for (let i = 0; i < 10; i++) {
    const seeds = clusters(rng, { gap: 0.4 - 0.02 * (d - 1), spread: 0.24 + 0.015 * (d - 1), nTrain: 6, nTest: 20, flips: 2 + (d > 2 ? 1 : 0) });
    const line = train(zeroNet(0), seeds, 0.3, 150);
    const test = seeds.filter((s) => s.t === 0);
    const acc = (countRight(line, test) * 100) / test.length;
    if (acc >= goal + 4) return seeds;
    if (acc > bestAcc) {
      best = seeds;
      bestAcc = acc;
    }
  }
  return best;
}

/** The seeds of a plot. Difficulty 1 is roomy and clean; 5 is tight and noisy. */
export function makeSeeds(rng: Rng, kind: RoomKind, difficulty: number): Seed[] {
  const d = difficulty;
  if (kind === 'xor') {
    return corners(rng, { inner: 0.34 - 0.03 * (d - 1), reach: 0.5, nTrain: 5, nTest: 3 });
  }
  if (kind === 'noise') return noisy(rng, d);
  if (kind === 'boss') {
    return ring(rng, { radius: 0.55, margin: 0.2 - 0.03 * (d - 1), nTrain: 28, nTest: 36 });
  }
  return clusters(rng, { gap: 0.72 - 0.05 * (d - 1), spread: 0.12 + 0.02 * (d - 1), nTrain: 10, nTest: 6, flips: 0 });
}

/** The line through the middle of the two class averages (training seeds), as slider values: score = a*x + b*y + c. */
export function centroidLine(seeds: readonly Seed[]): { a: number; b: number; c: number } {
  let n1 = 0;
  let n0 = 0;
  let x1 = 0;
  let y1 = 0;
  let x0 = 0;
  let y0 = 0;
  for (const p of seeds) {
    if (p.t !== 1) continue;
    if (p.l > 0) {
      n1 += 1;
      x1 += p.x;
      y1 += p.y;
    } else {
      n0 += 1;
      x0 += p.x;
      y0 += p.y;
    }
  }
  if (n1 === 0 || n0 === 0) return { a: 1, b: 0, c: 0 };
  x1 /= n1;
  y1 /= n1;
  x0 /= n0;
  y0 /= n0;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const s = len > 0.01 ? 2 / len : 1; // a steady slope: about 2 per unit across the gap
  const a = dx * s;
  const b = dy * s;
  return { a, b, c: -(a * ((x1 + x0) / 2) + b * ((y1 + y0) / 2)) };
}
