import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY,
  addPlayerXpDraft,
  addVassalXpDraft,
  cumulativeXp,
  hasFacility,
  loyaltyGain,
  nextRing,
  questRewards,
  recomputeRingDraft,
  removePlayerXpDraft,
  removeVassalXpDraft,
  rerollPrice,
  resurrectionPrice,
  ringForDomainPoints,
  ringName,
  utilityDecayAmount,
  utilityRestoreAmount,
  vassalXpToNext,
  wallBonus,
  xpToNext,
} from './economy';
import { fresh } from './testUtils';

describe('xp curves', () => {
  it('matches the GDD player table', () => {
    expect(xpToNext(1)).toBe(97);
    expect(xpToNext(2)).toBe(148);
    expect(xpToNext(5)).toBe(325);
    expect(xpToNext(10)).toBe(700);
    expect(xpToNext(20)).toBe(1750);
    expect(xpToNext(40)).toBe(5050);
    expect(cumulativeXp(2)).toBe(97);
    expect(cumulativeXp(10)).toBe(3045);
    expect(cumulativeXp(50)).toBe(138_425);
  });

  it('matches the vassal curve', () => {
    expect(vassalXpToNext(1)).toBe(120);
    expect(vassalXpToNext(29)).toBe(1240);
  });

  it('levels up and down the player, capping at 50', () => {
    const s = fresh();
    const events = addPlayerXpDraft(s, 250);
    expect(s.player.level).toBe(3);
    expect(s.player.xp).toBe(250 - 97 - 148);
    expect(events.map((e) => e.type)).toEqual(['levelUp', 'levelUp']);
    removePlayerXpDraft(s, 250);
    expect(s.player.level).toBe(1);
    expect(s.player.xp).toBe(0);
    removePlayerXpDraft(s, 10);
    expect(s.player.xp).toBe(0);
    s.player.level = 50;
    s.player.xp = 0;
    addPlayerXpDraft(s, 1_000_000);
    expect(s.player.level).toBe(50);
    expect(s.player.xp).toBe(1_000_000);
  });

  it('levels vassals up and down, capping at 30', () => {
    const s = fresh();
    const v = s.vassals.move;
    const events = addVassalXpDraft(v, 300);
    expect(v.level).toBe(3);
    expect(v.xp).toBe(300 - 120 - 160);
    expect(events).toHaveLength(2);
    removeVassalXpDraft(v, 300);
    expect(v.level).toBe(1);
    expect(v.xp).toBe(0);
    v.level = 30;
    addVassalXpDraft(v, 99_999);
    expect(v.level).toBe(30);
  });
});

describe('rings', () => {
  it('derives the ring from domain points', () => {
    expect(ringForDomainPoints(0)).toBe(1);
    expect(ringForDomainPoints(119)).toBe(1);
    expect(ringForDomainPoints(120)).toBe(2);
    expect(ringForDomainPoints(2499)).toBe(6);
    expect(ringForDomainPoints(2500)).toBe(7);
    expect(ringForDomainPoints(99_999)).toBe(7);
  });

  it('wall bonus, names, next ring, facilities and prices', () => {
    expect(wallBonus(1)).toBe(5);
    expect(wallBonus(7)).toBe(23);
    expect(wallBonus(9)).toBe(0);
    expect(ringName(3)).toBe('The Floor');
    expect(ringName(42)).toBe('Ring 42');
    expect(nextRing(1)?.domainPointsRequired).toBe(120);
    expect(nextRing(7)).toBeNull();
    expect(hasFacility(4, 'workshop')).toBe(true);
    expect(hasFacility(3, 'workshop')).toBe(false);
    expect(rerollPrice(4)).toBe(15);
    expect(rerollPrice(5)).toBe(10);
    expect(resurrectionPrice(1)).toBe(500);
    expect(resurrectionPrice(6)).toBe(450);
  });

  it('recomputeRingDraft emits one event per ring crossed', () => {
    const s = fresh();
    s.player.domainPoints = 700;
    const events = recomputeRingDraft(s);
    expect(s.player.ring).toBe(4);
    expect(events.map((e) => (e.type === 'ringUnlocked' ? e.ring : 0))).toEqual([2, 3, 4]);
    expect(s.player.highestRing).toBe(4);
    // The ring is sticky: losing DP never demotes, and re-crossing never re-fires (errata 15).
    s.player.domainPoints = 0;
    expect(recomputeRingDraft(s)).toEqual([]);
    expect(s.player.ring).toBe(4);
    s.player.domainPoints = 700;
    expect(recomputeRingDraft(s)).toEqual([]);
    s.player.domainPoints = 1200;
    expect(recomputeRingDraft(s).map((e) => (e.type === 'ringUnlocked' ? e.ring : 0))).toEqual([5]);
  });
});

describe('rewards', () => {
  it('reproduces the GDD worked example', () => {
    const r = questRewards({ tier: 2, baseXp: 35, baseCoins: 18 }, { difficulty: 'steady', bonus: true, timedBonus: true });
    expect(r).toEqual({ xp: 85, coins: 40, dp: 4, loyalty: 7 });
  });

  it('applies title multipliers and flats', () => {
    const r = questRewards(
      { tier: 1, baseXp: 20, baseCoins: 10 },
      { difficulty: 'gentle', bonus: false, timedBonus: false, titleXpMult: 0.2, titleCoinMult: 0.15, titleLoyaltyFlat: 1 },
    );
    expect(r).toEqual({ xp: 24, coins: 12, dp: 1, loyalty: 9 });
    expect(loyaltyGain('hardcore', 3, 1)).toBe(8);
  });

  it('difficulty tables carry the GDD numbers', () => {
    expect(DIFFICULTY.gentle.questsPerDay).toBe(3);
    expect(DIFFICULTY.steady.tierWeights).toEqual([30, 50, 20]);
    expect(DIFFICULTY.hardcore.attackMult).toBe(1.25);
  });

  it('utility numbers', () => {
    expect(utilityRestoreAmount(1)).toBe(25);
    expect(utilityRestoreAmount(3)).toBe(40);
    expect(utilityDecayAmount('steady', 1)).toBe(15);
    expect(utilityDecayAmount('steady', 6)).toBe(11);
    expect(utilityDecayAmount('hardcore', 6, 0.75)).toBe(11);
    expect(utilityDecayAmount('gentle', 1, 0.75)).toBe(8);
  });
});
