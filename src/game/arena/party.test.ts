import { describe, expect, it } from 'vitest';
import { derivePower } from '../../games/contract';
import { outcomeProblems } from '../../games/testing/validate';
import { fresh, deepFreeze, T0 } from '../testUtils';
import { buyGear, equipRare, trainVassal } from './armory';
import { buildParty, POWER_MAX, POWER_MIN } from './party';
import { rosterFor, titleTraitsOf, vassalMembers } from './roster';
import type { SaveFile } from '../types';

function save(): SaveFile {
  const s = fresh();
  s.player.coins = 100_000;
  s.player.ring = 4;
  s.player.highestRing = 4;
  return s;
}

describe('roster', () => {
  it('returns the eight vassals as party members with their own level, loyalty and derived power', () => {
    const s = save();
    s.vassals.move.level = 12;
    s.vassals.move.loyalty = 80;
    const roster = rosterFor(s);
    expect(roster.map((m) => m.id)).toEqual(['move', 'outside', 'clean', 'social', 'study', 'sleep', 'eat', 'hygiene']);
    const move = roster[0]!;
    expect(move).toMatchObject({ id: 'move', name: 'Pell', habit: 'move', level: 12, loyalty: 80, power: derivePower(12, 80), traits: [] });
    expect(roster[1]).toMatchObject({ level: 1, loyalty: 50, power: derivePower(1, 50) });
  });

  it('leaves out vassals that are disabled or away', () => {
    const s = save();
    s.settings.enabledHabits = ['move', 'outside', 'clean'];
    s.vassals.clean.away = true;
    expect(rosterFor(s).map((m) => m.id)).toEqual(['move', 'outside']);
    expect(vassalMembers(s)).toEqual(rosterFor(s));
  });

  it('carries the earned titles of the vassal\'s habit as traits, not the others', () => {
    const s = save();
    s.titles = [
      { titleId: 'pathfinder', earnedAt: T0 },
      { titleId: 'night_warden', earnedAt: T0 },
      { titleId: 'first_vassal', earnedAt: T0, habit: 'social' },
      { titleId: 'seven_days', earnedAt: T0 },
    ];
    expect(titleTraitsOf(s, 'move')).toEqual(['pathfinder']);
    expect(titleTraitsOf(s, 'sleep')).toEqual(['night_warden']);
    expect(titleTraitsOf(s, 'social')).toEqual(['first_vassal']);
    expect(titleTraitsOf(s, 'study')).toEqual([]);
  });
});

describe('the party builder', () => {
  it('without gear or training it is the roster, strongest first', () => {
    const s = save();
    s.vassals.study.level = 10;
    s.vassals.eat.level = 5;
    const party = buildParty(s);
    expect(party.members.map((m) => m.id).slice(0, 2)).toEqual(['study', 'eat']);
    expect(party.members).toHaveLength(8);
    for (const m of party.members) expect(m.power).toBe(derivePower(m.level, m.loyalty));
  });

  it('keeps the roster order for equal power', () => {
    expect(buildParty(save()).members.map((m) => m.id)).toEqual(['move', 'outside', 'clean', 'social', 'study', 'sleep', 'eat', 'hygiene']);
  });

  it('gear and training change power and traits, and nothing else about the member', () => {
    let s = save();
    s.vassals.move.level = 8;
    const plain = buildParty(s).members.find((m) => m.id === 'move')!;
    s = buyGear(s, T0, 'move', 'starlit_pike').save;
    s = buyGear(s, T0, 'move', 'lantern_mantle').save;
    s = trainVassal(s, T0, 'move').save;
    const equipped = buildParty(s).members.find((m) => m.id === 'move')!;
    expect(equipped.power).toBe(plain.power + 6 + 6 + 2);
    expect(equipped.traits).toEqual(['gear:weapon:3', 'gear:armor:3', 'training:1']);
    expect({ ...equipped, power: 0, traits: [] }).toEqual({ ...plain, power: 0, traits: [] });
  });

  it('title traits come before the Armory ones', () => {
    let s = save();
    s.titles = [{ titleId: 'pathfinder', earnedAt: T0 }];
    s = buyGear(s, T0, 'move', 'practice_baton').save;
    expect(buildParty(s).members.find((m) => m.id === 'move')!.traits).toEqual(['pathfinder', 'gear:weapon:1']);
  });

  it('stays inside the contract ranges even for a maxed troop', () => {
    let s = save();
    s.vassals.move.level = 30;
    s.vassals.move.loyalty = 100;
    s.arena.stash = ['moonlit_pike', 'dawnbreak_mantle', 'heart_of_the_haven'];
    for (const id of ['moonlit_pike', 'dawnbreak_mantle', 'heart_of_the_haven']) s = equipRare(s, T0, 'move', id).save;
    s.arena.training.move = 8;
    s.vassals.sleep.level = 1;
    s.vassals.sleep.loyalty = 0;
    for (const m of buildParty(s).members) {
      expect(m.power).toBeGreaterThanOrEqual(POWER_MIN);
      expect(m.power).toBeLessThanOrEqual(POWER_MAX);
      expect(m.level).toBeGreaterThanOrEqual(1);
      expect(m.level).toBeLessThanOrEqual(30);
      expect(m.loyalty).toBeGreaterThanOrEqual(0);
      expect(m.loyalty).toBeLessThanOrEqual(100);
    }
    expect(buildParty(s).members[0]!.power).toBe(POWER_MAX);
  });

  it('produces members the contract validator accepts as troops', () => {
    const s = buyGear(save(), T0, 'move', 'practice_baton').save;
    const party = buildParty(s);
    const ids = party.members.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(outcomeProblems({ result: 'won', score: 500, log: ['ok'], troopsUsed: ids.slice(0, 3) }, ids)).toEqual([]);
  });

  it('never mutates the save and returns fresh trait arrays', () => {
    const s = deepFreeze(buyGear(save(), T0, 'move', 'practice_baton').save);
    const a = buildParty(s);
    const b = buildParty(s);
    expect(a).toEqual(b);
    a.members[0]!.traits.push('x');
    expect(buildParty(s).members[0]!.traits).not.toContain('x');
  });
});
