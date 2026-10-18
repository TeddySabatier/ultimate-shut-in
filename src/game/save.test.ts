import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createNewSave, defaultSettings, exportSave, migrate, sanitizeName } from './save';
import { T0, TZ } from './testUtils';
import { gameDayIndex } from './time';
import { HABIT_IDS } from './types';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

describe('createNewSave', () => {
  it('builds the GDD defaults', () => {
    const s = createNewSave(T0, undefined, TZ);
    expect(s.version).toBe(2);
    expect(SAVE_VERSION).toBe(2);
    expect(s.player).toEqual({ name: 'Absolute', level: 1, xp: 0, coins: 0, domainPoints: 0, ring: 1, resurrectionMonth: null });
    expect(s.settings).toEqual(defaultSettings());
    expect(s.settings.enabledHabits).toEqual([...HABIT_IDS]);
    for (const h of HABIT_IDS) expect(s.vassals[h]).toMatchObject({ habit: h, level: 1, loyalty: 50, trust: 0, away: false, lastActiveDay: null });
    expect(s.utilities.power).toEqual({ id: 'power', value: 100, fullStreakDays: 0 });
    expect(s.board).toBeNull();
    expect(s.firstPlayDay).toBe(DAY0);
    expect(s.lastOpenDay).toBe(DAY0);
    expect(s.week).toEqual({ index: 0, history: [] });
  });

  it('sanitises the name and applies setting overrides', () => {
    expect(sanitizeName('')).toBe('Absolute');
    expect(sanitizeName('   ')).toBe('Absolute');
    expect(sanitizeName(42)).toBe('Absolute');
    expect(sanitizeName('  Pell  ')).toBe('Pell');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(24);
    const s = createNewSave(T0, 'Teddy', { ...TZ, settings: { difficulty: 'hardcore', resetHour: 6 } });
    expect(s.player.name).toBe('Teddy');
    expect(s.settings.difficulty).toBe('hardcore');
    expect(s.firstPlayDay).toBe(gameDayIndex(T0, 6, TZ.tz));
  });
});

describe('migrate', () => {
  it('accepts the legacy { name, level, xp } shape with or without the persist wrapper', () => {
    const a = migrate({ name: 'Old Hand', level: 3, xp: 50 }, T0, TZ);
    expect(a.version).toBe(2);
    expect(a.player).toMatchObject({ name: 'Old Hand', level: 3, xp: 50, coins: 0, ring: 1 });
    expect(a.firstPlayDay).toBe(DAY0);
    const b = migrate({ state: { name: 'Wrapped', level: 99, xp: -5 }, version: 1 }, T0, TZ);
    expect(b.player).toMatchObject({ name: 'Wrapped', level: 50, xp: 0 });
    const c = migrate({ version: 1, level: 2 }, T0, TZ);
    expect(c.player.name).toBe('Absolute');
    expect(c.player.level).toBe(2);
  });

  it('round-trips a v2 save through export', () => {
    const s = createNewSave(T0, 'Round', TZ);
    s.player.domainPoints = 400;
    s.player.ring = 3;
    s.titles.push({ titleId: 'herald', earnedAt: T0, habit: 'social' });
    s.combos.push({ comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 });
    s.log.push({ at: T0, day: DAY0, kind: 'x', text: 'y' });
    s.board = { day: DAY0, seed: 1, quests: [], bonusId: '', rerolledToday: true };
    s.week.history.push({ index: 0, ring: 1, attack: 1, defense: 2, breakdown: { vassals: 0, trust: 0, walls: 0, combos: 0, titles: 0, wellKept: 0 }, result: 'win', dpAwarded: 15, log: [], settledAt: T0 });
    const back = migrate(JSON.parse(exportSave(s)), T0 + 99, TZ);
    expect(back).toEqual(s);
  });

  it('fills missing v2 fields, clamps values and re-derives the ring', () => {
    const partial = {
      version: 2,
      player: { name: 'P', level: 0, xp: 10, coins: -3, domainPoints: 700, resurrectionMonth: 7 },
      settings: { difficulty: 'nope', benevolence: 'strict', enabledHabits: ['move', 'bogus'], resetHour: 30 },
      vassals: { move: { level: 99, trust: 9, loyalty: 150, lastActiveDay: 'x' } },
      utilities: { gas: { value: 500 } },
      stats: { questsTotal: 5, questsByHabit: { move: 2 }, lastQuestDay: 3 },
      week: { index: 2 },
      board: { day: 'x' },
      combos: 'no',
      titles: null,
      log: Array.from({ length: 300 }, (_, i) => ({ at: i, day: 0, kind: 'k', text: 't' })),
      firstPlayDay: 100,
      lastOpenDay: 50,
    };
    const s = migrate(partial, T0, TZ);
    expect(s.player).toEqual({ name: 'P', level: 1, xp: 10, coins: 0, domainPoints: 700, ring: 4, resurrectionMonth: null });
    expect(s.settings).toMatchObject({ difficulty: 'steady', benevolence: 'strict', enabledHabits: ['move'], resetHour: 23 });
    expect(s.vassals.move).toMatchObject({ level: 30, trust: 7, loyalty: 100, lastActiveDay: null, away: false });
    expect(s.vassals.clean.level).toBe(1);
    expect(s.utilities.gas.value).toBe(100);
    expect(s.utilities.power.value).toBe(100);
    expect(s.stats.questsTotal).toBe(5);
    expect(s.stats.questsByHabit.move).toBe(2);
    expect(s.stats.questsByHabit.clean).toBe(0);
    expect(s.stats.lastQuestDay).toBe(3);
    expect(s.week).toEqual({ index: 2, history: [] });
    expect(s.board).toBeNull();
    expect(s.combos).toEqual([]);
    expect(s.titles).toEqual([]);
    expect(s.log).toHaveLength(200);
    expect(s.firstPlayDay).toBe(100);
    expect(s.lastOpenDay).toBe(100);
    const empties = migrate({ version: 2, player: {}, settings: { enabledHabits: [] } }, T0, TZ);
    expect(empties.settings.enabledHabits).toEqual([...HABIT_IDS]);
    expect(empties.player.name).toBe('Absolute');
  });

  it('returns a fresh save for garbage', () => {
    expect(migrate(null, T0, TZ).player.name).toBe('Absolute');
    expect(migrate('text', T0, TZ).firstPlayDay).toBe(DAY0);
    expect(migrate([1, 2], T0, TZ).version).toBe(2);
  });
});
