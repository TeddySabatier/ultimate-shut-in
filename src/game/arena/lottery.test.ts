import { describe, expect, it } from 'vitest';
import { arenaContent } from '../content';
import { buffFromDef, buffWeight, drawOdds, drawOffers, eligibleBuffs } from './lottery';
import type { ArenaBuff } from '../types';

const defOf = (id: string) => arenaContent.lottery.buffs.find((b) => b.id === id)!;

describe('the lottery', () => {
  it('has a buff of every kind and a positive weight table', () => {
    const kinds = new Set(arenaContent.lottery.buffs.map((b) => b.kind));
    expect([...kinds].sort()).toEqual(['attack', 'defense', 'hint', 'luck', 'revive', 'time']);
    const total = arenaContent.lottery.buffs.reduce((s, b) => s + b.weight, 0);
    expect(total).toBe(78);
    const odds = drawOdds([]);
    expect(odds.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1, 10);
    expect(odds.find((o) => o.id === 'attack-s')!.chance).toBeCloseTo(12 / 78, 10);
  });

  it('draws three distinct buffs, the same ones for the same seed and room', () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = drawOffers(seed, 0, []);
      expect(a).toHaveLength(3);
      expect(new Set(a.map((b) => b.id.split('@')[0])).size).toBe(3);
      expect(drawOffers(seed, 0, [])).toEqual(a);
    }
  });

  it('differs between rooms and seeds', () => {
    const rooms = new Set(Array.from({ length: 10 }, (_, r) => drawOffers(7, r, []).map((b) => b.id).join()));
    expect(rooms.size).toBeGreaterThan(5);
    const seeds = new Set(Array.from({ length: 20 }, (_, s) => drawOffers(s, 0, []).map((b) => b.id).join()));
    expect(seeds.size).toBeGreaterThan(10);
  });

  it('follows the weights over many draws', () => {
    const counts = new Map<string, number>();
    const N = 6000;
    for (let seed = 0; seed < N; seed++) {
      const first = drawOffers(seed, 0, [])[0]!;
      const id = first.id.split('@')[0]!;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const o of drawOdds([])) {
      const seen = (counts.get(o.id) ?? 0) / N;
      expect(Math.abs(seen - o.chance), o.id).toBeLessThan(0.025);
    }
  });

  it('gives each offer a unique instance id carrying the room', () => {
    const [a] = drawOffers(1, 3, []);
    expect(a!.id).toMatch(/@3$/);
    expect(buffFromDef(defOf('time-s'), 2)).toEqual({ id: 'time-s@2', kind: 'time', amount: 10 });
  });

  it('leaves out kinds already at their cap, so a run can never exceed it', () => {
    const buffs: ArenaBuff[] = [
      { id: 'revive-s@0', kind: 'revive', amount: 1 },
      { id: 'revive-s@1', kind: 'revive', amount: 1 },
    ];
    expect(eligibleBuffs(buffs).some((b) => b.kind === 'revive')).toBe(false);
    for (let seed = 0; seed < 100; seed++) expect(drawOffers(seed, 2, buffs).some((o) => o.kind === 'revive')).toBe(false);
    // 50 attack already: +10 fits (cap 60), +20 does not.
    const heavy: ArenaBuff[] = Array.from({ length: 5 }, (_, i) => ({ id: `attack-s@${i}`, kind: 'attack' as const, amount: 10 }));
    expect(eligibleBuffs(heavy).filter((b) => b.kind === 'attack').map((b) => b.id)).toEqual(['attack-s']);
    // 60 attack: nothing more of that kind.
    const full: ArenaBuff[] = Array.from({ length: 3 }, (_, i) => ({ id: `attack-l@${i}`, kind: 'attack' as const, amount: 20 }));
    expect(eligibleBuffs(full).some((b) => b.kind === 'attack')).toBe(false);
  });

  it('luck makes the rare buffs heavier and leaves the common ones alone', () => {
    const luck: ArenaBuff[] = [{ id: 'luck-l@0', kind: 'luck', amount: 25 }];
    expect(buffWeight(defOf('attack-s'), luck)).toBe(12);
    expect(buffWeight(defOf('attack-l'), luck)).toBe(5 * 1.5);
    expect(buffWeight(defOf('attack-l'), [])).toBe(5);
    const without = drawOdds([]).find((o) => o.id === 'revive-s')!.chance;
    const withLuck = drawOdds(luck).find((o) => o.id === 'revive-s')!.chance;
    expect(withLuck).toBeGreaterThan(without);
  });

  it('every shipped buff respects its cap and the units of the contract', () => {
    for (const b of arenaContent.lottery.buffs) {
      expect(b.amount).toBeLessThanOrEqual(arenaContent.lottery.caps[b.kind]);
      if (b.kind === 'hint' || b.kind === 'revive') expect(b.amount).toBeLessThanOrEqual(2);
    }
  });
});
