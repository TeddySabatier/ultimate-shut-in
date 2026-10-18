/**
 * Save creation and migration. `migrate` accepts the legacy `usi.player`
 * shape (`{name, level, xp}`, version missing or 1) and the current v2 file,
 * filling any missing v2 fields with defaults so older v2 saves keep loading.
 */
import { habits } from './content';
import { clamp } from './draft';
import { LOYALTY_START, PLAYER_LEVEL_CAP, UTILITY_MAX, ringForDomainPoints } from './economy';
import { gameDayIndex, type TimeOptions } from './time';
import type {
  Benevolence,
  Board,
  ComboItem,
  Difficulty,
  EarnedTitle,
  HabitId,
  LifetimeStats,
  LogEntry,
  Player,
  SaveFile,
  Settings,
  Utility,
  UtilityId,
  Vassal,
  WeekState,
} from './types';
import { HABIT_IDS, UTILITY_IDS } from './types';

export const SAVE_VERSION = 2 as const;
export const DEFAULT_NAME = 'Absolute';
export const DEFAULT_RESET_HOUR = 4;
export const NAME_MAX_LENGTH = 24;

export function sanitizeName(name: unknown): string {
  if (typeof name !== 'string') return DEFAULT_NAME;
  const trimmed = name.trim().slice(0, NAME_MAX_LENGTH);
  return trimmed.length === 0 ? DEFAULT_NAME : trimmed;
}

export function defaultSettings(): Settings {
  return {
    difficulty: 'steady',
    benevolence: 'benevolent',
    enabledHabits: habits.filter((h) => h.defaultEnabled).map((h) => h.id),
    resetHour: DEFAULT_RESET_HOUR,
    lightsOutHour: 23,
    wakeHour: 8,
    reducedMotion: false,
  };
}

export function defaultVassal(habit: HabitId): Vassal {
  return { habit, level: 1, xp: 0, trust: 0, loyalty: LOYALTY_START, away: false, lastActiveDay: null, lifetimeQuests: 0 };
}

export function defaultUtility(id: UtilityId): Utility {
  return { id, value: UTILITY_MAX, fullStreakDays: 0 };
}

function zeroByHabit(): Record<HabitId, number> {
  return { move: 0, outside: 0, clean: 0, social: 0, study: 0, sleep: 0, eat: 0, hygiene: 0 };
}

export function defaultStats(): LifetimeStats {
  return {
    questsTotal: 0,
    questsByHabit: zeroByHabit(),
    questDaysTotal: 0,
    questDayStreak: 0,
    bestQuestDayStreak: 0,
    lastQuestDay: null,
    waveWins: 0,
    waveLosses: 0,
    decisiveStreak: 0,
    combosForged: 0,
    resurrectionsUsed: 0,
    reRecruitments: 0,
    streakLostOnDay: null,
    streakLostLength: null,
  };
}

export interface NewSaveOptions extends TimeOptions {
  settings?: Partial<Settings>;
}

/** A fresh save for a player opening the app for the first time at `now`. No board yet. */
export function createNewSave(now: number, name?: string, opts?: NewSaveOptions): SaveFile {
  const settings: Settings = { ...defaultSettings(), ...(opts?.settings ?? {}) };
  const today = gameDayIndex(now, settings.resetHour, opts?.tz);
  return {
    version: SAVE_VERSION,
    player: { name: sanitizeName(name), level: 1, xp: 0, coins: 0, domainPoints: 0, ring: 1, resurrectionMonth: null },
    settings,
    vassals: {
      move: defaultVassal('move'),
      outside: defaultVassal('outside'),
      clean: defaultVassal('clean'),
      social: defaultVassal('social'),
      study: defaultVassal('study'),
      sleep: defaultVassal('sleep'),
      eat: defaultVassal('eat'),
      hygiene: defaultVassal('hygiene'),
    },
    utilities: { power: defaultUtility('power'), water: defaultUtility('water'), gas: defaultUtility('gas') },
    board: null,
    week: { index: 0, history: [] },
    combos: [],
    titles: [],
    stats: defaultStats(),
    log: [],
    firstPlayDay: today,
    lastOpenDay: today,
  };
}

/* ------------------------------ Migration ------------------------------ */

type Dict = Record<string, unknown>;

function isDict(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const DIFFICULTIES: readonly Difficulty[] = ['gentle', 'steady', 'hardcore'];
const BENEVOLENCES: readonly Benevolence[] = ['benevolent', 'strict'];

function migratePlayer(raw: unknown, base: Player): Player {
  if (!isDict(raw)) return base;
  const level = clamp(Math.floor(num(raw.level, base.level)), 1, PLAYER_LEVEL_CAP);
  const domainPoints = Math.max(0, num(raw.domainPoints, base.domainPoints));
  return {
    name: sanitizeName(raw.name ?? base.name),
    level,
    xp: Math.max(0, num(raw.xp, base.xp)),
    coins: Math.max(0, num(raw.coins, base.coins)),
    domainPoints,
    ring: ringForDomainPoints(domainPoints),
    resurrectionMonth: typeof raw.resurrectionMonth === 'string' ? raw.resurrectionMonth : null,
  };
}

function migrateSettings(raw: unknown, base: Settings): Settings {
  if (!isDict(raw)) return base;
  const enabledRaw = Array.isArray(raw.enabledHabits) ? raw.enabledHabits : base.enabledHabits;
  const enabled = HABIT_IDS.filter((h) => enabledRaw.includes(h));
  return {
    difficulty: oneOf(raw.difficulty, DIFFICULTIES, base.difficulty),
    benevolence: oneOf(raw.benevolence, BENEVOLENCES, base.benevolence),
    enabledHabits: enabled.length > 0 ? enabled : base.enabledHabits,
    resetHour: clamp(Math.floor(num(raw.resetHour, base.resetHour)), 0, 23),
    lightsOutHour: clamp(Math.floor(num(raw.lightsOutHour, base.lightsOutHour)), 0, 23),
    wakeHour: clamp(Math.floor(num(raw.wakeHour, base.wakeHour)), 0, 23),
    reducedMotion: bool(raw.reducedMotion, base.reducedMotion),
  };
}

function migrateVassal(raw: unknown, habit: HabitId): Vassal {
  const base = defaultVassal(habit);
  if (!isDict(raw)) return base;
  return {
    habit,
    level: clamp(Math.floor(num(raw.level, base.level)), 1, 30),
    xp: Math.max(0, num(raw.xp, base.xp)),
    trust: clamp(Math.floor(num(raw.trust, base.trust)), 0, 7),
    loyalty: clamp(num(raw.loyalty, base.loyalty), 0, 100),
    away: bool(raw.away, false),
    lastActiveDay: typeof raw.lastActiveDay === 'number' ? raw.lastActiveDay : null,
    lifetimeQuests: Math.max(0, num(raw.lifetimeQuests, 0)),
  };
}

function migrateUtility(raw: unknown, id: UtilityId): Utility {
  const base = defaultUtility(id);
  if (!isDict(raw)) return base;
  return { id, value: clamp(num(raw.value, base.value), 0, UTILITY_MAX), fullStreakDays: Math.max(0, num(raw.fullStreakDays, 0)) };
}

function migrateStats(raw: unknown): LifetimeStats {
  const base = defaultStats();
  if (!isDict(raw)) return base;
  const byHabit = zeroByHabit();
  if (isDict(raw.questsByHabit)) for (const h of HABIT_IDS) byHabit[h] = Math.max(0, num(raw.questsByHabit[h], 0));
  const nullable = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    questsTotal: Math.max(0, num(raw.questsTotal, 0)),
    questsByHabit: byHabit,
    questDaysTotal: Math.max(0, num(raw.questDaysTotal, 0)),
    questDayStreak: Math.max(0, num(raw.questDayStreak, 0)),
    bestQuestDayStreak: Math.max(0, num(raw.bestQuestDayStreak, 0)),
    lastQuestDay: nullable(raw.lastQuestDay),
    waveWins: Math.max(0, num(raw.waveWins, 0)),
    waveLosses: Math.max(0, num(raw.waveLosses, 0)),
    decisiveStreak: Math.max(0, num(raw.decisiveStreak, 0)),
    combosForged: Math.max(0, num(raw.combosForged, 0)),
    resurrectionsUsed: Math.max(0, num(raw.resurrectionsUsed, 0)),
    reRecruitments: Math.max(0, num(raw.reRecruitments, 0)),
    streakLostOnDay: nullable(raw.streakLostOnDay),
    streakLostLength: nullable(raw.streakLostLength),
  };
}

function migrateBoard(raw: unknown): Board | null {
  if (!isDict(raw) || !Array.isArray(raw.quests) || typeof raw.day !== 'number') return null;
  return raw as unknown as Board;
}

/**
 * Accept any previously persisted shape and return a valid v2 SaveFile.
 * Unknown or corrupt input yields a fresh save (name kept when readable).
 */
export function migrate(raw: unknown, now: number, opts?: TimeOptions): SaveFile {
  // zustand/persist wraps state as { state, version }.
  const unwrapped = isDict(raw) && isDict(raw.state) ? { ...raw.state, version: raw.version } : raw;
  if (!isDict(unwrapped)) return createNewSave(now, undefined, opts);

  const version = typeof unwrapped.version === 'number' ? unwrapped.version : 1;
  if (version < 2 || !isDict(unwrapped.player)) {
    // Legacy { name, level, xp }: keep the name and the progress, start everything else fresh.
    const fresh = createNewSave(now, sanitizeName(unwrapped.name), opts);
    fresh.player.level = clamp(Math.floor(num(unwrapped.level, 1)), 1, PLAYER_LEVEL_CAP);
    fresh.player.xp = Math.max(0, num(unwrapped.xp, 0));
    return fresh;
  }

  const fresh = createNewSave(now, undefined, opts);
  const settings = migrateSettings(unwrapped.settings, fresh.settings);
  const vassalsRaw = isDict(unwrapped.vassals) ? unwrapped.vassals : {};
  const utilitiesRaw = isDict(unwrapped.utilities) ? unwrapped.utilities : {};
  const vassals = {} as Record<HabitId, Vassal>;
  for (const h of HABIT_IDS) vassals[h] = migrateVassal(vassalsRaw[h], h);
  const utilities = {} as Record<UtilityId, Utility>;
  for (const u of UTILITY_IDS) utilities[u] = migrateUtility(utilitiesRaw[u], u);
  const weekRaw = isDict(unwrapped.week) ? unwrapped.week : {};
  const week: WeekState = {
    index: Math.max(0, num(weekRaw.index, 0)),
    history: Array.isArray(weekRaw.history) ? (weekRaw.history as WeekState['history']) : [],
  };
  const firstPlayDay = num(unwrapped.firstPlayDay, fresh.firstPlayDay);
  const lastOpenDay = num(unwrapped.lastOpenDay, firstPlayDay);

  return {
    version: SAVE_VERSION,
    player: migratePlayer(unwrapped.player, fresh.player),
    settings,
    vassals,
    utilities,
    board: migrateBoard(unwrapped.board),
    week,
    combos: Array.isArray(unwrapped.combos) ? (unwrapped.combos as ComboItem[]) : [],
    titles: Array.isArray(unwrapped.titles) ? (unwrapped.titles as EarnedTitle[]) : [],
    stats: migrateStats(unwrapped.stats),
    log: Array.isArray(unwrapped.log) ? (unwrapped.log as LogEntry[]).slice(-200) : [],
    firstPlayDay,
    lastOpenDay: Math.max(firstPlayDay, lastOpenDay),
  };
}

/** Serialise for export; the inverse is `migrate(JSON.parse(text), now)`. */
export function exportSave(save: SaveFile): string {
  return JSON.stringify(save);
}
