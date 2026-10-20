import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  combos,
  formatLine,
  getHabit,
  getOutpostState,
  getOutpostType,
  getQuest,
  getRing,
  getTitle,
  habitForUtility,
  habits,
  outpostRules,
  outpostStates,
  outpostTypes,
  pickLine,
  quests,
  rings,
  strings,
  tierDefaults,
  titles,
  utilityForHabit,
  validateContent,
  arenaCatalog,
} from './index';
import { HABIT_IDS, OUTPOST_TYPE_IDS } from '../types';

describe('content', () => {
  it('validates with no errors at module load', () => {
    expect(validateContent()).toEqual([]);
  });

  it('every quest references a valid habit and ids are unique', () => {
    const ids = new Set<string>();
    for (const q of quests) {
      expect(HABIT_IDS).toContain(q.habit);
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
    }
  });

  it('each habit has at least 7 templates and 3 at ring 1', () => {
    for (const h of HABIT_IDS) {
      const mine = quests.filter((q) => q.habit === h);
      expect(mine.length).toBeGreaterThanOrEqual(7);
      expect(mine.filter((q) => q.minRing === 1).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('ring thresholds ascend strictly from 0', () => {
    expect(rings[0]?.domainPointsRequired).toBe(0);
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i]!.domainPointsRequired).toBeGreaterThan(rings[i - 1]!.domainPointsRequired);
    }
  });

  it('combos reference valid habit pairs', () => {
    for (const c of combos) {
      expect(c.habits.length === 2 || c.habits.length === 8).toBe(true);
      for (const h of c.habits) expect(HABIT_IDS).toContain(h);
    }
  });

  it('title conditions reference known kinds and habits', () => {
    for (const t of titles) {
      expect(typeof t.condition.type).toBe('string');
      if ('habit' in t.condition) expect(HABIT_IDS).toContain(t.condition.habit);
    }
    expect(titles.length).toBe(21);
  });

  it('exposes lookups', () => {
    expect(getHabit('move').vassal.name).toBe('Pell');
    expect(getQuest('move.stretch')?.tier).toBe(1);
    expect(getQuest('nope')).toBeUndefined();
    expect(getRing(2).name).toBe('The Flat');
    expect(() => getRing(9)).toThrow();
    expect(getTitle('herald')?.name).toBe('Herald');
    expect(getTitle('nope')).toBeUndefined();
    expect(habitForUtility('power')).toBe('sleep');
    expect(habitForUtility('water')).toBe('hygiene');
    expect(habitForUtility('gas')).toBe('eat');
    expect(utilityForHabit('move')).toBeNull();
    expect(tierDefaults[3].domainPoints).toBe(3);
    expect(habits.length).toBe(8);
    expect(strings.app.name).toBe('Haven Protocol');
  });

  it('picks lines stably and formats placeholders', () => {
    const pool = ['a {x}', 'b {x}', 'c {x}'];
    expect(pickLine(pool, 4)).toBe('b {x}');
    expect(pickLine(pool, 4)).toBe(pickLine(pool, 4));
    expect(pickLine([], 1)).toBe('');
    expect(formatLine('Level {level} for {name}, {missing}', { level: 3, name: 'Pell' })).toBe('Level 3 for Pell, {missing}');
  });
});

describe('outposts content', () => {
  it('ships the eleven types with icons and default habits, and four ascending states', () => {
    expect(outpostTypes.map((t) => t.id)).toEqual([...OUTPOST_TYPE_IDS]);
    for (const t of outpostTypes) {
      expect(t.icon).toBe(t.id);
      expect(t.placeholder.length).toBeGreaterThan(0);
      expect(t.visitLines.length).toBeGreaterThanOrEqual(2);
      if (t.id === 'other') expect(t.habits).toEqual([]);
      else expect(t.habits.length).toBeGreaterThanOrEqual(1);
    }
    expect(outpostStates.map((s) => [s.id, s.minVisits])).toEqual([
      ['marked', 0],
      ['scouted', 3],
      ['corridor', 10],
      ['stronghold', 30],
    ]);
    expect(getOutpostType('gym').habits).toEqual(['move', 'hygiene']);
    expect(getOutpostState('corridor').label).toBe('Corridor');
    expect(outpostRules).toMatchObject({ baseCap: 3, capPerRing: 1, maxCap: 10, perZone: 3, minSpacing: 3, quietAfterDays: 14, rerollDiscount: 5, corridorCoinMult: 0.1, strongholdDefense: 2, strongholdDefenseCap: 6, visitLogMax: 400 });
    expect(Object.keys(strings.map.errors).length).toBeGreaterThanOrEqual(14);
    expect(strings.arena.cardTitle).toBe('The Arena');
    expect(strings.arena.troopsHome.length).toBeGreaterThan(0);
    for (const t of outpostTypes) {
      expect(existsSync(resolve('src/assets/outposts', `${t.icon}.svg`)), t.icon).toBe(true);
    }
  });
});

describe('arena content', () => {
  it('ships at least three gear pieces and three lottery buffs', () => {
    expect(arenaCatalog.gear.length).toBeGreaterThanOrEqual(3);
    expect(arenaCatalog.lottery.buffs.length).toBeGreaterThanOrEqual(3);
    expect(arenaCatalog.entry.base).toBeGreaterThan(0);
  });
});
