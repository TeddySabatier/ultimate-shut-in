import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createNewSave, defaultSettings, exportSave, migrate, sanitizeName } from './save';
import { T0, TZ } from './testUtils';
import { gameDayIndex } from './time';
import { HABIT_IDS } from './types';

const DAY0 = gameDayIndex(T0, 4, TZ.tz);

describe('createNewSave', () => {
  it('builds the GDD defaults', () => {
    const s = createNewSave(T0, undefined, TZ);
    expect(s.version).toBe(5);
    expect(SAVE_VERSION).toBe(5);
    expect(s.notes).toEqual([]);
    expect(s.player).toEqual({ name: 'Absolute', level: 1, xp: 0, coins: 0, domainPoints: 0, ring: 1, highestRing: 1, resurrectionMonth: null });
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
    expect(a.version).toBe(5);
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
    s.player.highestRing = 3;
    s.titles.push({ titleId: 'herald', earnedAt: T0, habit: 'social' });
    s.combos.push({ comboId: 'sprinting_umbrella', power: 4, forgedDay: DAY0 });
    s.log.push({ at: T0, day: DAY0, kind: 'x', text: 'y' });
    s.board = { day: DAY0, seed: 1, quests: [], bonusId: '', rerolledToday: true };
    s.week.history.push({ index: 0, ring: 1, attack: 1, defense: 2, breakdown: { vassals: 0, trust: 0, walls: 0, combos: 0, titles: 0, wellKept: 0, outposts: 0 }, result: 'win', dpAwarded: 15, log: [], settledAt: T0 });
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
    expect(s.player).toEqual({ name: 'P', level: 1, xp: 10, coins: 0, domainPoints: 700, ring: 4, highestRing: 4, resurrectionMonth: null });
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
    expect(migrate([1, 2], T0, TZ).version).toBe(5);
  });
});

describe('migrate: v3 (custom quests, proposals, activity)', () => {
  const v2 = (): Record<string, unknown> => {
    const s = createNewSave(T0, 'Old', TZ) as unknown as Record<string, unknown>;
    delete s.customTemplates;
    delete s.proposals;
    delete s.activity;
    s.version = 2;
    return s;
  };

  it('upgrades a v2 save with empty arrays and keeps everything else', () => {
    const old = v2();
    const s = migrate(old, T0, TZ);
    expect(s.version).toBe(5);
    expect(s.customTemplates).toEqual([]);
    expect(s.proposals).toEqual([]);
    expect(s.activity).toEqual([]);
    expect(s.player.name).toBe('Old');
    expect(s.firstPlayDay).toBe(DAY0);
    // The persist envelope of the previous store version is unwrapped the same way.
    const wrapped = migrate({ state: { save: null }, version: 2 }, T0, TZ);
    expect(wrapped.customTemplates).toEqual([]);
  });

  it('is idempotent and round-trips custom templates, proposals and activity', () => {
    const s = createNewSave(T0, 'Mine', TZ);
    s.customTemplates.push({
      id: 'c-0123abcd',
      habit: 'study',
      kind: 'timer',
      durationMin: 25,
      title: 'Deep read',
      description: 'Twenty-five quiet minutes.',
      tier: 2,
      recurrence: 'weekly:1',
      pinWeekday: 3,
      timeSlot: 'evening',
      createdAt: T0,
      archivedAt: T0 + 5,
      source: 'voice',
      stats: { issued: 4, done: 3, tried: 1 },
    });
    s.proposals.push(
      {
        id: 'p-00000001',
        rule: 'smaller',
        habit: 'move',
        status: 'open',
        createdDay: DAY0,
        snoozeUntil: null,
        title: 'A smaller step',
        reason: 'Because.',
        action: {
          type: 'create',
          addToBoard: true,
          draft: { habit: 'move', kind: 'timer', durationMin: 10, title: 'Walk (Mini)', description: 'd', tier: 1, recurrence: 'once', timeSlot: 'any', source: 'proposal' },
        },
      },
      {
        id: 'p-00000002',
        rule: 'pinWeekday',
        habit: 'clean',
        status: 'dismissed',
        createdDay: DAY0,
        snoozeUntil: DAY0 + 7,
        title: 'Give it a day',
        reason: 'Because.',
        action: { type: 'update', templateId: 'c-0123abcd', patch: { recurrence: 'weekly:1', pinWeekday: 2 } },
      },
    );
    s.activity.push({ day: DAY0 - 1, entries: [{ templateId: 'move.stretch', habit: 'move', status: 'tried' }] });
    const once = migrate(JSON.parse(exportSave(s)), T0, TZ);
    expect(once).toEqual(s);
    expect(migrate(JSON.parse(exportSave(once)), T0, TZ)).toEqual(once);
  });

  it('sanitises corrupt entries instead of trusting them', () => {
    const raw = v2();
    raw.version = 3;
    raw.customTemplates = [
      'nope',
      { id: 'x-1', habit: 'move', kind: 'check', title: 'Wrong prefix' },
      { id: 'c-aaaaaaaa', habit: 'bogus', kind: 'check', title: 'Bad habit' },
      { id: 'c-bbbbbbbb', habit: 'move', kind: 'check', title: '   ' },
      { id: 'c-cccccccc', habit: 'move', kind: 'timer', durationMin: 9999, title: 'x'.repeat(90), tier: 3, recurrence: 'weekly:9', stats: { issued: -4, done: 'x' } },
      { id: 'c-cccccccc', habit: 'move', kind: 'check', title: 'Duplicate id' },
      { id: 'c-dddddddd', habit: 'eat', kind: 'check', title: 'Tidy check', tier: 3, recurrence: 'weekly:2', pinWeekday: 3, timeSlot: 'noon', source: 'telepathy' },
    ];
    raw.proposals = [
      42,
      { id: 'p-1', habit: 'move', action: { type: 'create', draft: { habit: 'move', kind: 'check', title: 'ok', recurrence: 'once' } }, rule: 'nonsense', status: 'weird' },
      { id: 'p-2', habit: 'move', action: { type: 'explode' } },
      { id: 'p-1', habit: 'move', action: { type: 'update', templateId: 'c-1', patch: { recurrence: 'daily' } } },
    ];
    raw.activity = [
      { day: 'x', entries: [] },
      { day: 5, entries: [{ templateId: 'move.stretch', habit: 'move', status: 'done' }, { templateId: 5 }, { templateId: 'a', habit: 'move', status: 'open' }] },
      { day: 5, entries: [] },
      ...Array.from({ length: 60 }, (_, i) => ({ day: 100 + i, entries: [] })),
    ];
    const s = migrate(raw, T0, TZ);
    expect(s.customTemplates.map((c) => c.id)).toEqual(['c-cccccccc', 'c-dddddddd']);
    const timer = s.customTemplates[0];
    expect(timer).toMatchObject({ durationMin: 240, tier: 3, recurrence: 'once', stats: { issued: 0, done: 0, tried: 0 } });
    expect(timer?.title).toHaveLength(40);
    const check = s.customTemplates[1];
    expect(check).toMatchObject({ kind: 'check', tier: 2, recurrence: 'weekly:2', timeSlot: 'any', source: 'text' });
    expect(check?.pinWeekday).toBeUndefined();
    expect(s.proposals).toHaveLength(1);
    expect(s.proposals[0]).toMatchObject({ id: 'p-1', rule: 'smaller', status: 'dismissed', action: { type: 'create', draft: { title: 'ok', tier: 1 } } });
    expect(s.activity).toHaveLength(42);
    expect(s.activity.at(-1)?.day).toBe(159);
    const day5 = migrate({ ...raw, activity: [raw.activity ? (raw.activity as unknown[])[1] : null] }, T0, TZ).activity;
    expect(day5).toEqual([{ day: 5, entries: [{ templateId: 'move.stretch', habit: 'move', status: 'done' }] }]);
  });
});

describe('migrate: v4 (city map)', () => {
  const v3 = (): Record<string, unknown> => {
    const s = createNewSave(T0, 'Mapless', TZ) as unknown as Record<string, unknown>;
    delete s.map;
    s.version = 3;
    return s;
  };

  it('gives v2 and v3 saves an empty map seeded with one snapshot of the current state', () => {
    const old = v3();
    (old.player as Record<string, unknown>).domainPoints = 400;
    (old.week as Record<string, unknown>).index = 3;
    (old.week as Record<string, unknown>).history = [
      { index: 2, ring: 3, attack: 10, defense: 12, breakdown: { vassals: 1, trust: 2, walls: 3, combos: 0, titles: 0, wellKept: 0 }, result: 'win', dpAwarded: 15, log: [], settledAt: T0 },
    ];
    const s = migrate(old, T0, TZ);
    expect(s.version).toBe(5);
    expect(s.map.outposts).toEqual([]);
    expect(s.map.visits).toEqual([]);
    expect(s.map.lastSeen).toBeNull();
    expect(s.map.nextSeq).toBe(1);
    expect(s.map.snapshots).toEqual([{ periodIndex: 2, day: s.lastOpenDay, domainPoints: 400, ring: 3, result: 'win' }]);
    // Every stored wave record gets the new breakdown term.
    expect(s.week.history[0]?.breakdown.outposts).toBe(0);
    const v2 = migrate({ version: 2, player: {}, settings: {}, vassals: {}, utilities: {} }, T0, TZ);
    expect(v2.map.snapshots).toEqual([{ periodIndex: -1, day: DAY0, domainPoints: 0, ring: 1, result: 'quiet' }]);
  });

  it('round-trips a v4 save with outposts, visits and snapshots through export', () => {
    const s = createNewSave(T0, 'Mapped', TZ);
    s.map = {
      outposts: [
        { id: 'op1', name: 'Gym', type: 'gym', habits: ['move', 'hygiene'], note: 'Tue.', cell: { x: 2, y: 1 }, createdAt: T0, createdDay: DAY0, visits: 3, lastVisitDay: DAY0, peak: 'scouted', stateDays: { marked: DAY0, scouted: DAY0 }, retired: false },
        { id: 'op2', name: 'Park', type: 'park', habits: ['outside'], note: '', cell: { x: -2, y: 1 }, createdAt: T0, createdDay: DAY0, visits: 0, lastVisitDay: null, peak: 'marked', stateDays: { marked: DAY0 }, retired: true },
      ],
      visits: [{ outpostId: 'op1', day: DAY0, at: T0, source: 'quest', instanceId: DAY0 + '-move.dance', counted: true }],
      snapshots: [{ periodIndex: 0, day: DAY0 + 7, domainPoints: 15, ring: 1, result: 'win' }],
      lastSeen: { day: DAY0, domainPoints: 15 },
      nextSeq: 3,
    };
    s.customTemplates.push({ id: 'c-abc', habit: 'move', kind: 'check', title: 'Gym session', description: '', tier: 1, recurrence: 'once', timeSlot: 'any', createdAt: T0, source: 'text', stats: { issued: 0, done: 0, tried: 0 }, outpostId: 'op1' });
    const back = migrate(JSON.parse(exportSave(s)), T0 + 99, TZ);
    expect(back).toEqual(s);
    expect(migrate(JSON.parse(exportSave(createNewSave(T0, 'Empty', TZ))), T0, TZ).map.snapshots).toEqual([]);
  });

  it('normalises a damaged map: bad cells and types dropped, text clamped, peak raised, orphans dropped, sequence rebuilt', () => {
    const raw = createNewSave(T0, 'Damaged', TZ) as unknown as Record<string, unknown>;
    raw.map = {
      outposts: [
        { id: 'op1', name: ' x'.repeat(30), type: 'gym', cell: { x: 2, y: 1 }, visits: 12, peak: 'marked', note: 7, stateDays: { scouted: 'no', corridor: DAY0 } },
        { id: 'op2', name: 'Street', type: 'park', cell: { x: 4, y: 1 } },
        { id: 'op3', name: 'Room', type: 'park', cell: { x: 0, y: 0 } },
        { id: 'op4', name: 'Odd', type: 'spaceport', cell: { x: -2, y: 1 } },
        { id: 'op5', name: 'Sea', type: 'park', cell: { x: 8, y: 8 } },
        { id: 'op7', name: 'Other', type: 'other', cell: { x: -2, y: 1 }, habits: ['bogus'] },
        { id: 'op8', name: 'Too close', type: 'cafe', cell: { x: 1, y: 0 }, visits: 1 },
        { id: 'op9', name: 'Far', type: 'cafe', cell: { x: -3, y: -3 }, visits: 2, peak: 'stronghold', retired: 'yes' },
        { id: 'bad', name: 'No id', type: 'cafe', cell: { x: 5, y: 3 } },
      ],
      visits: [
        { outpostId: 'op1', day: DAY0, counted: true, source: 'checkin' },
        { outpostId: 'op1', day: DAY0, counted: true, source: 'quest', instanceId: 'q1' },
        { outpostId: 'op2', day: DAY0, counted: true },
        { outpostId: 'op9', day: 'x', counted: true },
        { outpostId: 'op9', day: DAY0 - 1, counted: 'maybe', source: 'teleport' },
      ],
      snapshots: [
        { periodIndex: 2, day: DAY0, domainPoints: -4, ring: 9, result: 'draw' },
        { periodIndex: 1, day: DAY0 },
        { periodIndex: 5, day: DAY0 + 7, domainPoints: 40, ring: 2, result: 'loss' },
      ],
      lastSeen: { day: 'yesterday' },
      nextSeq: 2,
    };
    raw.customTemplates = [
      { id: 'c-ok', habit: 'move', kind: 'check', title: 'At the gym', description: '', recurrence: 'once', timeSlot: 'any', source: 'text', outpostId: 'op1' },
      { id: 'c-orphan', habit: 'move', kind: 'check', title: 'Nowhere', description: '', recurrence: 'once', timeSlot: 'any', source: 'text', outpostId: 'op2' },
      { id: 'c-retired', habit: 'move', kind: 'check', title: 'Far away', description: '', recurrence: 'once', timeSlot: 'any', source: 'text', outpostId: 'op9' },
    ];
    const s = migrate(raw, T0, TZ);
    expect(s.map.outposts.map((o) => o.id)).toEqual(['op1', 'op8', 'op9']);
    const op1 = s.map.outposts[0]!;
    expect(op1.name).toHaveLength(23); // 24 would end in a space; trimmed after the cut
    expect(op1.note).toBe('');
    expect(op1.peak).toBe('corridor'); // 12 visits earn Corridor, whatever the stored peak said
    expect(op1.stateDays).toEqual({ marked: op1.createdDay, corridor: DAY0 });
    expect(op1.habits).toEqual(['move', 'hygiene']);
    // Too close to op1 for the spacing rule: kept, but retired rather than lost.
    expect(s.map.outposts[1]).toMatchObject({ id: 'op8', retired: true, visits: 1 });
    expect(s.map.outposts[2]).toMatchObject({ id: 'op9', retired: false, peak: 'stronghold' }); // a stored peak is kept; 'yes' is not a boolean
    expect(s.map.visits).toEqual([
      { outpostId: 'op1', day: DAY0, at: 0, source: 'checkin', instanceId: null, counted: true },
      { outpostId: 'op1', day: DAY0, at: 0, source: 'quest', instanceId: 'q1', counted: false },
      { outpostId: 'op9', day: DAY0 - 1, at: 0, source: 'checkin', instanceId: null, counted: false },
    ]);
    expect(s.map.snapshots).toEqual([
      { periodIndex: 2, day: DAY0, domainPoints: 0, ring: 7, result: 'quiet' },
      { periodIndex: 5, day: DAY0 + 7, domainPoints: 40, ring: 2, result: 'loss' },
    ]);
    expect(s.map.lastSeen).toBeNull();
    expect(s.map.nextSeq).toBe(10);
    expect(s.customTemplates.map((t) => t.outpostId)).toEqual(['op1', undefined, 'op9']);
    // Idempotent: a second pass changes nothing.
    expect(migrate(JSON.parse(exportSave(s)), T0, TZ)).toEqual(s);
  });
});

describe('migrate: v5 (what I learned)', () => {
  it('gives a v4 save an empty notes list and keeps a tidy note', () => {
    const old = createNewSave(T0, 'Noted', TZ) as unknown as Record<string, unknown>;
    delete old.notes;
    old.version = 4;
    old.notes = [
      { templateId: 'study.read', habit: 'study', title: 'Read', text: '  A chapter\n\n\nabout doors.  ', updatedAt: T0 },
      { templateId: 'study.read', habit: 'study', title: 'Older', text: 'stale', updatedAt: T0 - 1 },
      { templateId: '', habit: 'study', title: 'Blank', text: 'nope', updatedAt: T0 },
      { templateId: 'move.walk', habit: 'flying', title: 'Walk', text: 'nope', updatedAt: T0 },
      { templateId: 'clean.sweep', habit: 'clean', title: 'Sweep', text: '   ', updatedAt: T0 },
    ];
    const s = migrate(old, T0, TZ);
    expect(s.version).toBe(5);
    expect(s.notes).toEqual([{ templateId: 'study.read', habit: 'study', title: 'Read', text: 'A chapter\n\nabout doors.', updatedAt: T0 }]);
    const bare = createNewSave(T0, 'Bare', TZ) as unknown as Record<string, unknown>;
    delete bare.notes;
    bare.version = 4;
    expect(migrate(bare, T0, TZ).notes).toEqual([]);
    expect(migrate(JSON.parse(exportSave(s)), T0, TZ).notes).toEqual(s.notes);
  });
});
