import { describe, expect, it } from 'vitest';
import { arenaContent, tierDefaults } from '../content';
import { DIFFICULTY, questRewards } from '../economy';
import { fresh } from '../testUtils';
import { entryFee, expectedQuestCoins, gearPrice, roomDifficulty, trainingPrice, trainingPower, trainingWeeklyCap, typicalDailyCoins, typicalWeeklyCoins, winCoins } from './economics';
import { trainingStatus } from './armory';
import type { Difficulty, RingId, Tier } from '../types';

/** Independent re-computation of one quest's coins through the real reward formula. */
function coinsOfTier(difficulty: Difficulty, tier: Tier): number {
  return questRewards({ tier, baseXp: tierDefaults[tier].baseXp, baseCoins: tierDefaults[tier].baseCoins }, { difficulty, bonus: false, timedBonus: false }).coins;
}

function dailyFromRewards(difficulty: Difficulty, adherence: number): number {
  const t = DIFFICULTY[difficulty];
  const perQuest = (t.tierWeights[0] * coinsOfTier(difficulty, 1) + t.tierWeights[1] * coinsOfTier(difficulty, 2) + t.tierWeights[2] * coinsOfTier(difficulty, 3)) / 100;
  return t.questsPerDay * adherence * perQuest;
}

const RINGS: RingId[] = [1, 2, 3, 4, 5, 6, 7];
const DIFFICULTIES: Difficulty[] = ['gentle', 'steady', 'hardcore'];

describe('arena economy proof (ARENA.md 9)', () => {
  it('the typical day is computed from questRewards, and matches the GDD table within rounding', () => {
    for (const d of DIFFICULTIES) {
      // `questRewards` rounds per quest; the expected value does not: they agree within half a coin per quest.
      expect(Math.abs(typicalDailyCoins(d, 0.9) - dailyFromRewards(d, 0.9))).toBeLessThan(DIFFICULTY[d].questsPerDay * 0.5);
    }
    // GDD 6.4: Steady is about 75 coins on a full day.
    expect(typicalDailyCoins('steady', 1)).toBeGreaterThan(70);
    expect(typicalDailyCoins('steady', 1)).toBeLessThan(85);
    expect(expectedQuestCoins('steady')).toBeCloseTo(19.8, 5);
  });

  it('a Steady player at 90% adherence affords one run every two days at every ring, with room left for the Armory', () => {
    const twoDays = 2 * typicalDailyCoins('steady', 0.9);
    for (const ring of RINGS) {
      const fee = entryFee(ring, 'steady');
      expect(fee, `ring ${ring}`).toBeLessThanOrEqual(twoDays);
      expect(fee, `ring ${ring}`).toBeLessThanOrEqual(twoDays / 2); // half of two days at most
    }
    expect(Math.round(twoDays)).toBe(143);
    expect(entryFee(1, 'steady')).toBe(20);
    expect(entryFee(7, 'steady')).toBe(56);
  });

  it('the fee is never more than one day of typical earnings, at any difficulty', () => {
    for (const d of DIFFICULTIES) {
      for (const ring of RINGS) expect(entryFee(ring, d)).toBeLessThanOrEqual(Math.floor(typicalDailyCoins(d, arenaContent.run.feeAdherence)));
    }
    // Gentle earns about 37 a day, so the fee is capped there from ring 3 on.
    expect(entryFee(7, 'gentle')).toBe(Math.floor(typicalDailyCoins('gentle', 0.9)));
    expect(entryFee(1, 'gentle')).toBe(20);
  });

  it('weekly training can never exceed 25% of what habits give, at any difficulty and ring', () => {
    for (const d of DIFFICULTIES) {
      const week = typicalWeeklyCoins(d, 0.9);
      const cap = trainingWeeklyCap(d);
      expect(cap).toBeLessThanOrEqual(0.25 * week);
      expect(cap).toBeGreaterThan(0.2 * week);
    }
    expect(trainingWeeklyCap('steady')).toBe(Math.floor(0.25 * 7 * typicalDailyCoins('steady', 0.9)));
    expect(trainingWeeklyCap('gentle')).toBe(65);
  });

  it('even the most expensive allowed training week stays under the cap through the engine, ring 7, every difficulty', () => {
    for (const d of DIFFICULTIES) {
      const save = fresh({ settings: { difficulty: d } });
      save.player.ring = 7;
      save.player.coins = 1_000_000;
      const status = trainingStatus(save, 'move');
      expect(status.weekCap).toBe(trainingWeeklyCap(d));
      expect(status.weekBumpsMax).toBe(2);
    }
  });

  it('training has steep diminishing returns: each bump costs more and gives no more', () => {
    const prices = arenaContent.training.bumpPower.map((_, n) => trainingPrice(n, 1));
    for (let i = 1; i < prices.length; i++) expect(prices[i]!).toBeGreaterThan(prices[i - 1]!);
    const powers = arenaContent.training.bumpPower;
    for (let i = 1; i < powers.length; i++) expect(powers[i]!).toBeLessThanOrEqual(powers[i - 1]!);
    expect(trainingPower(0)).toBe(0);
    expect(trainingPower(99)).toBe(powers.reduce((a, b) => a + b, 0));
    // Price per point of power at least quadruples from the first bump to the last.
    const first = prices[0]! / powers[0]!;
    const last = prices[prices.length - 1]! / powers[powers.length - 1]!;
    expect(last / first).toBeGreaterThan(4);
  });

  it('every training bump is reachable under the weekly cap at the highest ring, even for a Gentle player', () => {
    for (const d of DIFFICULTIES) {
      for (let n = 0; n < arenaContent.training.bumpPower.length; n++) expect(trainingPrice(n, 7), `${d} bump ${n + 1}`).toBeLessThanOrEqual(trainingWeeklyCap(d));
    }
  });

  it('a full set of gear for one vassal costs weeks of habits, not days', () => {
    const sold = arenaContent.armory.items.filter((i) => i.rare !== true);
    const oneVassal = sold.reduce((s, i) => s + gearPrice(i, 1), 0);
    expect(oneVassal / typicalDailyCoins('steady', 0.9)).toBeGreaterThan(14);
  });

  it('the expected run roughly pays its fee back and a long chain pays well, so the Armory stays the sink', () => {
    const fee = entryFee(1, 'steady');
    const twoWins = winCoins(fee, 700, 0) + winCoins(fee, 700, 1);
    const fiveWins = [0, 1, 2, 3, 4].reduce((s, r) => s + winCoins(fee, 700, r), 0);
    expect(twoWins).toBeGreaterThan(fee * 1.5);
    expect(twoWins).toBeLessThan(fee * 2.5);
    expect(fiveWins).toBeLessThan(fee * 8);
    // A perfect score never pays more than the room-growth curve says.
    expect(winCoins(fee, 1000, 0)).toBe(fee);
    expect(winCoins(fee, 0, 0)).toBe(Math.round(fee * 0.4));
  });

  it('difficulty rises every other room, one step more from ring 4, and stops at 5', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => roomDifficulty(r, 1))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(roomDifficulty(0, 4)).toBe(2);
    expect(roomDifficulty(9, 7)).toBe(5);
  });
});
