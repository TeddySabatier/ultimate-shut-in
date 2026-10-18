/**
 * Seeded 365-day pacing simulation driving the public API only
 * (processBoundaries + completeQuest). Asserts ring arrival weeks against the
 * GDD 19 table within +-1.5 weeks and zero wave losses at 90% adherence.
 */
import { describe, expect, it } from 'vitest';
import { completeQuest } from './board';
import { mulberry32 } from './rng';
import { createNewSave } from './save';
import { processBoundaries } from './tick';
import { DAY_MS, fixedTz } from './time';
import type { Difficulty, SaveFile } from './types';

const TZ = { tz: fixedTz(0) };
const START = Date.UTC(2026, 0, 5, 12);

interface SimResult {
  ringWeek: Partial<Record<number, number>>;
  losses: number;
  wins: number;
  levelAt: { d30: number; d90: number; d365: number };
  save: SaveFile;
}

function simulate(difficulty: Difficulty, adherence: number, seed: number, days = 365): SimResult {
  const rng = mulberry32(seed);
  let save = createNewSave(START, `Sim ${difficulty}`, { ...TZ, settings: { difficulty } });
  const ringWeek: Partial<Record<number, number>> = {};
  let losses = 0;
  let wins = 0;
  const levelAt = { d30: 0, d90: 0, d365: 0 };
  const note = (events: { type: string; ring?: number; record?: { result: string } }[], d: number): void => {
    for (const e of events) {
      if (e.type === 'ringUnlocked' && e.ring !== undefined && ringWeek[e.ring] === undefined) ringWeek[e.ring] = d / 7;
      if (e.type === 'waveSettled' && e.record) {
        if (e.record.result === 'loss') losses += 1;
        else if (e.record.result !== 'quiet') wins += 1;
      }
    }
  };
  for (let d = 0; d < days; d++) {
    const now = START + d * DAY_MS;
    const r = processBoundaries(save, now, TZ);
    save = r.save;
    note(r.events, d);
    for (const q of save.board?.quests ?? []) {
      if (rng() < adherence) {
        const c = completeQuest(save, q.instanceId, now + 60_000);
        save = c.save;
        note(c.events, d);
      }
    }
    if (d === 29) levelAt.d30 = save.player.level;
    if (d === 89) levelAt.d90 = save.player.level;
  }
  const final = processBoundaries(save, START + days * DAY_MS, TZ);
  note(final.events, days);
  save = final.save;
  levelAt.d365 = save.player.level;
  return { ringWeek, losses, wins, levelAt, save };
}

const TABLE: Record<string, { difficulty: Difficulty; adherence: number; rings: Record<number, number> }> = {
  'Gentle 90%': { difficulty: 'gentle', adherence: 0.9, rings: { 2: 2.3, 3: 6.0, 4: 11.0, 5: 18.0 } },
  'Steady 90%': { difficulty: 'steady', adherence: 0.9, rings: { 2: 1.4, 3: 3.9, 4: 7.4, 5: 12.6 } },
  'Hardcore 90%': { difficulty: 'hardcore', adherence: 0.9, rings: { 2: 1.1, 3: 3.0, 4: 6.0, 5: 10.0 } },
};

describe('pacing simulation (365 days)', () => {
  for (const [label, spec] of Object.entries(TABLE)) {
    it(`${label}: ring weeks within +-1.5 of the GDD table and no wave losses`, () => {
      const sim = simulate(spec.difficulty, spec.adherence, 1234);
      for (const [ring, week] of Object.entries(spec.rings)) {
        const got = sim.ringWeek[Number(ring)];
        expect(got, `${label} ring ${ring} (got ${got}, want ${week})`).toBeDefined();
        expect(Math.abs((got ?? 0) - week), `${label} ring ${ring}: got week ${got?.toFixed(1)}, want ${week}`).toBeLessThanOrEqual(1.5);
      }
      expect(sim.losses, `${label} losses`).toBe(0);
      expect(sim.wins).toBeGreaterThanOrEqual(50);
      expect(sim.save.player.ring).toBeGreaterThanOrEqual(6);
      expect(sim.save.week.index).toBe(52);
    });
  }

  it('Hardcore 60%: slower rings, some losses allowed, nothing lost', () => {
    const sim = simulate('hardcore', 0.6, 99);
    expect(sim.ringWeek[2]).toBeGreaterThan(1.1);
    expect(sim.ringWeek[4]).toBeDefined();
    expect(Math.abs((sim.ringWeek[4] ?? 0) - 8.0)).toBeLessThanOrEqual(2.5);
    expect(sim.losses).toBeLessThanOrEqual(30);
    expect(sim.save.player.domainPoints).toBeGreaterThan(1500);
    expect(sim.save.player.coins).toBeGreaterThan(0);
    for (const v of Object.values(sim.save.vassals)) {
      expect(v.loyalty).toBeGreaterThanOrEqual(1);
      expect(v.away).toBe(false);
    }
  });

  it('level pacing is in the GDD neighbourhood', () => {
    const gentle = simulate('gentle', 0.9, 7);
    expect(gentle.levelAt.d30).toBeGreaterThanOrEqual(7);
    expect(gentle.levelAt.d30).toBeLessThanOrEqual(11);
    expect(gentle.levelAt.d365).toBeGreaterThanOrEqual(25);
    expect(gentle.levelAt.d365).toBeLessThanOrEqual(33);
    const hard = simulate('hardcore', 0.9, 7);
    expect(hard.levelAt.d365).toBeGreaterThanOrEqual(40);
    expect(hard.levelAt.d365).toBeLessThanOrEqual(50);
    expect(hard.save.vassals.move.level).toBeGreaterThanOrEqual(18);
  });

  it('is deterministic for the same seed', () => {
    const a = simulate('steady', 0.9, 5, 60);
    const b = simulate('steady', 0.9, 5, 60);
    expect(a.save).toEqual(b.save);
  });
});
