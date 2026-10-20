import { describe, expect, it } from 'vitest';
import { arenaContent } from '../content';
import { deepFreeze, fresh } from '../testUtils';
import { T0 } from '../testUtils';
import { armoryTraits, buyDecor, buyGear, equipRare, gearPower, gearRefusal, soldItems, trainVassal, trainingBonus, trainingRefusal, trainingStatus, trainingWeek } from './armory';
import { decorPrice, gearPrice, ringFactor, trainingPrice, trainingWeeklyCap } from './economics';
import type { SaveFile } from '../types';

function save(coins = 5000, ring = 1): SaveFile {
  const s = fresh();
  s.player.coins = coins;
  s.player.ring = ring as SaveFile['player']['ring'];
  s.player.highestRing = s.player.ring;
  return s;
}

function ok(r: { save: SaveFile; error?: string }): SaveFile {
  expect(r.error).toBeUndefined();
  return r.save;
}

describe('gear', () => {
  it('sells three tiers per slot and scales prices with the ring', () => {
    expect(soldItems('weapon').map((i) => i.tier)).toEqual([1, 2, 3]);
    expect(soldItems().length).toBe(9);
    const baton = soldItems('weapon')[0]!;
    expect(gearPrice(baton, 1)).toBe(60);
    expect(gearPrice(baton, 7)).toBe(105); // 60 * 1.72 = 103.2, rounded to 5
    expect(ringFactor(7, arenaContent.armory.ringPriceStep)).toBeCloseTo(1.72, 5);
    expect(gearPrice(arenaContent.armory.items.find((i) => i.rare)!, 3)).toBe(0);
  });

  it('buys an item for one vassal and slot, pays the ring price, raises power and traits', () => {
    const s = save();
    const r = buyGear(s, T0, 'move', 'practice_baton');
    expect(r.error).toBeUndefined();
    expect(r.save.player.coins).toBe(5000 - 60);
    expect(r.save.arena.gear.move.weapon).toBe('practice_baton');
    expect(r.save.arena.gear.outside.weapon).toBeNull();
    expect(gearPower(r.save, 'move')).toBe(2);
    expect(armoryTraits(r.save, 'move')).toEqual(['gear:weapon:1']);
    expect(r.events).toEqual([{ type: 'arenaGearBought', habit: 'move', slot: 'weapon', itemId: 'practice_baton', price: 60 }]);
  });

  it('refuses short of coins, below the ring, and a downgrade or a repeat', () => {
    expect(buyGear(save(59), T0, 'move', 'practice_baton').error).toBe('not enough coins');
    expect(buyGear(save(), T0, 'move', 'starlit_pike').error).toBe('ring too low');
    expect(buyGear(save(5000, 4), T0, 'move', 'starlit_pike').error).toBeUndefined();
    const owned = ok(buyGear(save(), T0, 'move', 'practice_baton'));
    expect(buyGear(owned, T0, 'move', 'practice_baton').error).toBe('not an upgrade');
    const upgraded = ok(buyGear(save(5000, 2), T0, 'move', 'walking_staff'));
    expect(buyGear(upgraded, T0, 'move', 'practice_baton').error).toBe('not an upgrade');
    expect(buyGear(save(), T0, 'move', 'nope').error).toBe('unknown item');
    expect(buyGear(save(), T0, 'move', 'moonlit_pike').error).toBe('rare item');
    expect(gearRefusal(save(), 'move', 'practice_baton')).toBeNull();
  });

  it('an upgrade replaces the lower tier and adds up across slots', () => {
    let s = save(5000, 4);
    for (const id of ['practice_baton', 'starlit_pike', 'quilted_vest', 'lantern_mantle', 'haven_seal']) s = ok(buyGear(s, T0, 'study', id));
    expect(s.arena.gear.study).toEqual({ weapon: 'starlit_pike', armor: 'lantern_mantle', charm: 'haven_seal' });
    expect(gearPower(s, 'study')).toBe(6 + 6 + 3);
    expect(armoryTraits(s, 'study')).toEqual(['gear:weapon:3', 'gear:armor:3', 'gear:charm:3']);
  });

  it('rare items come from the stash, push the previous rare item back, and replace sold gear', () => {
    let s = save();
    s.arena.stash = ['moonlit_pike', 'ladle_of_ages'];
    s = ok(buyGear(s, T0, 'move', 'practice_baton'));
    s = ok(equipRare(s, T0, 'move', 'moonlit_pike'));
    expect(s.arena.gear.move.weapon).toBe('moonlit_pike');
    expect(s.arena.stash).toEqual(['ladle_of_ages']);
    expect(gearPower(s, 'move')).toBe(9);
    s = ok(equipRare(s, T0, 'move', 'ladle_of_ages'));
    expect(s.arena.gear.move.weapon).toBe('ladle_of_ages');
    expect(s.arena.stash).toEqual(['moonlit_pike']);
    expect(armoryTraits(s, 'move')).toEqual(['gear:weapon:4']);
    expect(equipRare(s, T0, 'move', 'dawnbreak_mantle').error).toBe('not in the stash');
    expect(equipRare(s, T0, 'move', 'practice_baton').error).toBe('unknown item');
    // A sold item cannot overwrite a rare one.
    s.player.ring = 4;
    expect(buyGear(s, T0, 'move', 'starlit_pike').error).toBe('not an upgrade');
  });

  it('never mutates its input', () => {
    const s = deepFreeze(save());
    expect(() => buyGear(s, T0, 'move', 'practice_baton')).not.toThrow();
    expect(() => trainVassal(s, T0, 'move')).not.toThrow();
    expect(() => buyDecor(s, T0, 'sprinting_umbrella')).not.toThrow();
  });
});

describe('training', () => {
  it('buys a bump: coins out, power up, trait added, the week counted', () => {
    const s = save();
    const price = trainingPrice(0, 1);
    const r = trainVassal(s, T0, 'clean');
    expect(r.error).toBeUndefined();
    expect(r.save.player.coins).toBe(5000 - price);
    expect(r.save.arena.training.clean).toBe(1);
    expect(trainingBonus(r.save, 'clean')).toBe(2);
    expect(armoryTraits(r.save, 'clean')).toEqual(['training:1']);
    expect(trainingWeek(r.save)).toEqual({ period: 0, spent: price, bumps: 1 });
    expect(r.events).toEqual([{ type: 'arenaTrained', habit: 'clean', bumps: 1, price }]);
  });

  it('has diminishing returns: later bumps add less and cost more', () => {
    let s = save(100_000, 1);
    const gains: number[] = [];
    for (let i = 0; i < arenaContent.training.bumpPower.length; i++) {
      s.arena.trainingWeek = { period: s.week.index, spent: 0, bumps: 0 }; // lift the weekly limits to test the curve alone
      const before = trainingBonus(s, 'move');
      s = ok(trainVassal(s, T0, 'move'));
      gains.push(trainingBonus(s, 'move') - before);
    }
    expect(gains).toEqual(arenaContent.training.bumpPower);
    expect(trainVassal(s, T0, 'move').error).toBe('training maxed');
  });

  it('allows two bumps per wave period, then waits for the next period', () => {
    let s = save(100_000);
    s = ok(trainVassal(s, T0, 'move'));
    s = ok(trainVassal(s, T0, 'outside'));
    expect(trainVassal(s, T0, 'clean').error).toBe('training week full');
    expect(trainingStatus(s, 'clean').weekBumps).toBe(2);
    s.week.index += 1; // the next wave settled
    expect(trainingStatus(s, 'clean').weekBumps).toBe(0);
    expect(trainVassal(s, T0, 'clean').error).toBeUndefined();
  });

  it('never spends more than the weekly cap, which is a quarter of a habit week', () => {
    for (const difficulty of ['gentle', 'steady', 'hardcore'] as const) {
      const s = save(100_000, 7);
      s.settings.difficulty = difficulty;
      const cap = trainingWeeklyCap(difficulty);
      let cur = s;
      let guard = 0;
      while (trainingRefusal(cur, 'move') === null && guard++ < 10) cur = ok(trainVassal(cur, T0, 'move'));
      expect(trainingWeek(cur).spent).toBeLessThanOrEqual(cap);
    }
  });

  it('the cap itself refuses a bump that would pass it, with its own code', () => {
    const s = save(100_000, 7);
    s.settings.difficulty = 'gentle';
    s.arena.trainingWeek = { period: s.week.index, spent: trainingWeeklyCap('gentle') - 5, bumps: 1 };
    expect(trainingRefusal(s, 'move')).toBe('training week cap');
    s.arena.trainingWeek = { period: s.week.index, spent: 0, bumps: 1 };
    expect(trainingRefusal(s, 'move')).toBeNull();
  });

  it('refuses short of coins', () => {
    expect(trainVassal(save(10), T0, 'move').error).toBe('not enough coins');
  });

  it('a weekly counter left from an older period reads as empty and is rewritten on the next purchase', () => {
    const s = save();
    s.arena.trainingWeek = { period: 0, spent: 999, bumps: 2 };
    s.week.index = 3;
    expect(trainingWeek(s)).toEqual({ period: 3, spent: 0, bumps: 0 });
    const r = ok(trainVassal(s, T0, 'move'));
    expect(r.arena.trainingWeek.period).toBe(3);
    expect(r.arena.trainingWeek.bumps).toBe(1);
  });
});

describe('decor', () => {
  it('buys a combo item name as cosmetic decor, once, for power times thirty', () => {
    expect(decorPrice('sprinting_umbrella')).toBe(120);
    expect(decorPrice('the_full_set')).toBe(360);
    expect(decorPrice('nope')).toBeNull();
    const r = buyDecor(save(), T0, 'sprinting_umbrella');
    expect(r.error).toBeUndefined();
    expect(r.save.player.coins).toBe(5000 - 120);
    expect(r.save.arena.decor).toEqual(['sprinting_umbrella']);
    expect(buyDecor(r.save, T0, 'sprinting_umbrella').error).toBe('already owned');
    expect(buyDecor(save(100), T0, 'sprinting_umbrella').error).toBe('not enough coins');
    expect(buyDecor(save(), T0, 'nope').error).toBe('unknown decor');
  });

  it('decor changes nothing but coins and the decor list', () => {
    const s = save();
    const r = ok(buyDecor(s, T0, 'dustpan_buckler'));
    expect(r.combos).toEqual(s.combos);
    expect({ ...r.player, coins: 0 }).toEqual({ ...s.player, coins: 0 });
    expect(r.vassals).toEqual(s.vassals);
  });
});

describe('purchases that would change nothing', () => {
  it('refuses gear and training for a troop already at full power, and says so', () => {
    const s = save(100_000, 4);
    s.vassals.move.level = 30;
    s.vassals.move.loyalty = 100; // derivePower is 100 already
    expect(buyGear(s, T0, 'move', 'practice_baton').error).toBe('power full');
    expect(trainVassal(s, T0, 'move').error).toBe('power full');
    expect(buyGear(s, T0, 'outside', 'practice_baton').error).toBeUndefined();
  });

  it('allows an upgrade that still adds power, refuses one once the troop is full', () => {
    const s = save(100_000, 4);
    s.vassals.study.level = 28; // 84 + 5 (loyalty 50) = 89
    let cur = ok(buyGear(s, T0, 'study', 'practice_baton')); // +2 = 91
    cur = ok(buyGear(cur, T0, 'study', 'walking_staff')); // replaces +2 with +4 = 93
    cur = ok(buyGear(cur, T0, 'study', 'quilted_vest')); // 95
    cur = ok(buyGear(cur, T0, 'study', 'waxed_cloak')); // 97
    cur = ok(buyGear(cur, T0, 'study', 'lantern_mantle')); // 99
    expect(buyGear(cur, T0, 'study', 'starlit_pike').error).toBeUndefined(); // 99 -> 101: still helps at 99
    const full = ok(buyGear(cur, T0, 'study', 'starlit_pike'));
    expect(buyGear(full, T0, 'study', 'knotted_cord').error).toBe('power full');
  });
});
