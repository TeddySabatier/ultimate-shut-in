/**
 * Save creation and migration. `migrate` accepts the legacy `usi.player`
 * shape (`{name, level, xp}`, version missing or 1) and the current v2 file,
 * filling any missing v2 fields with defaults so older v2 saves keep loading.
 */
import { getCombo, getQuest, habits } from './content';
import { instanceId } from './board';
import { MAX_LOG_ENTRIES, clamp } from './draft';
import {
  LOYALTY_START,
  PLAYER_LEVEL_CAP,
  TRUST_MAX,
  UTILITY_MAX,
  VASSAL_LEVEL_CAP,
  WAVE_HISTORY_MAX,
  ringForDomainPoints,
} from './economy';
import { gameDayIndex, type TimeOptions } from './time';
import type {
  Benevolence,
  Board,
  BoardQuest,
  ComboItem,
  Difficulty,
  EarnedTitle,
  HabitId,
  LifetimeStats,
  LogEntry,
  Player,
  QuestStatus,
  RingId,
  SaveFile,
  Settings,
  Utility,
  UtilityId,
  Vassal,
  WaveRecord,
  WaveResult,
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
  if (settings.enabledHabits.length === 0) settings.enabledHabits = defaultSettings().enabledHabits;
  const today = gameDayIndex(now, settings.resetHour, opts?.tz);
  return {
    version: SAVE_VERSION,
    player: { name: sanitizeName(name), level: 1, xp: 0, coins: 0, domainPoints: 0, ring: 1, highestRing: 1, resurrectionMonth: null },
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
  // The ring is sticky (errata 15): derived from DP, but never below the highest ring ever reached.
  const storedHighest = clamp(Math.floor(num(raw.highestRing, 1)), 1, 7) as RingId;
  const ring = Math.max(ringForDomainPoints(domainPoints), storedHighest) as RingId;
  return {
    name: sanitizeName(raw.name ?? base.name),
    level,
    xp: Math.max(0, num(raw.xp, base.xp)),
    coins: Math.max(0, num(raw.coins, base.coins)),
    domainPoints,
    ring,
    highestRing: ring,
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
    level: clamp(Math.floor(num(raw.level, base.level)), 1, VASSAL_LEVEL_CAP),
    xp: Math.max(0, num(raw.xp, base.xp)),
    trust: clamp(Math.floor(num(raw.trust, base.trust)), 0, TRUST_MAX),
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

const QUEST_STATUSES: readonly QuestStatus[] = ['open', 'done', 'tried'];
const WAVE_RESULTS: readonly WaveResult[] = ['decisive', 'win', 'loss', 'quiet'];

function nullableNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function isHabitId(v: unknown): v is HabitId {
  return typeof v === 'string' && (HABIT_IDS as readonly string[]).includes(v);
}

/**
 * Normalise one stored quest; `null` drops it (unknown template, no id). A
 * `rewards` snapshot without `utility` (pre-errata-3 saves, GDD 4 shape)
 * gets 0 so undo never computes with `undefined` (errata 8).
 */
function migrateQuest(raw: unknown, day: number): BoardQuest | null {
  if (!isDict(raw) || typeof raw.templateId !== 'string') return null;
  const t = getQuest(raw.templateId);
  if (!t) return null;
  const timerRaw = isDict(raw.timer) ? raw.timer : null;
  const r = isDict(raw.rewards) ? raw.rewards : null;
  const status = oneOf(raw.status, QUEST_STATUSES, 'open');
  const rewards = r ? { xp: num(r.xp, 0), coins: num(r.coins, 0), dp: num(r.dp, 0), loyalty: num(r.loyalty, 0), utility: num(r.utility, 0) } : null;
  return {
    instanceId: typeof raw.instanceId === 'string' && raw.instanceId.length > 0 ? raw.instanceId : instanceId(day, t.id),
    templateId: t.id,
    habit: t.habit,
    kind: t.kind,
    // A done quest needs its snapshot for undo; without one it reopens.
    status: status === 'done' && rewards === null ? 'open' : status,
    count: Math.max(0, Math.floor(num(raw.count, 0))),
    timer: t.kind === 'timer' ? { startedAt: nullableNum(timerRaw?.startedAt), accumulatedMs: Math.max(0, num(timerRaw?.accumulatedMs, 0)) } : null,
    timedBonus: bool(raw.timedBonus, false),
    rewards: status === 'done' ? rewards : null,
  };
}

function migrateBoard(raw: unknown): Board | null {
  if (!isDict(raw) || !Array.isArray(raw.quests) || typeof raw.day !== 'number' || !Number.isFinite(raw.day)) return null;
  const day = Math.floor(raw.day);
  const quests: BoardQuest[] = [];
  for (const q of raw.quests) {
    const m = migrateQuest(q, day);
    if (m && !quests.some((x) => x.instanceId === m.instanceId)) quests.push(m);
  }
  const bonusId = typeof raw.bonusId === 'string' && quests.some((q) => q.instanceId === raw.bonusId) ? raw.bonusId : '';
  return { day, seed: Math.floor(num(raw.seed, 0)), quests, bonusId, rerolledToday: bool(raw.rerolledToday, false) };
}

function migrateCombos(raw: unknown): ComboItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ComboItem[] = [];
  for (const c of raw) {
    if (!isDict(c) || typeof c.comboId !== 'string') continue;
    const def = getCombo(c.comboId);
    if (!def) continue;
    out.push({ comboId: def.id, power: num(c.power, def.power), forgedDay: Math.floor(num(c.forgedDay, 0)) });
  }
  return out;
}

function migrateTitles(raw: unknown): EarnedTitle[] {
  if (!Array.isArray(raw)) return [];
  const out: EarnedTitle[] = [];
  for (const t of raw) {
    if (!isDict(t) || typeof t.titleId !== 'string' || out.some((x) => x.titleId === t.titleId)) continue;
    const entry: EarnedTitle = { titleId: t.titleId, earnedAt: num(t.earnedAt, 0) };
    if (isHabitId(t.habit)) entry.habit = t.habit;
    out.push(entry);
  }
  return out;
}

function migrateWaveRecord(raw: unknown): WaveRecord | null {
  if (!isDict(raw) || typeof raw.index !== 'number') return null;
  const b = isDict(raw.breakdown) ? raw.breakdown : {};
  return {
    index: Math.floor(num(raw.index, 0)),
    ring: clamp(Math.floor(num(raw.ring, 1)), 1, 7),
    attack: num(raw.attack, 0),
    defense: num(raw.defense, 0),
    breakdown: {
      vassals: num(b.vassals, 0),
      trust: num(b.trust, 0),
      walls: num(b.walls, 0),
      combos: num(b.combos, 0),
      titles: num(b.titles, 0),
      wellKept: num(b.wellKept, 0),
    },
    result: oneOf(raw.result, WAVE_RESULTS, 'quiet'),
    dpAwarded: num(raw.dpAwarded, 0),
    log: Array.isArray(raw.log) ? raw.log.filter((l): l is string => typeof l === 'string') : [],
    settledAt: num(raw.settledAt, 0),
  };
}

function migrateLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LogEntry[] = [];
  for (const e of raw) {
    if (!isDict(e) || typeof e.text !== 'string') continue;
    out.push({ at: num(e.at, 0), day: Math.floor(num(e.day, 0)), kind: typeof e.kind === 'string' ? e.kind : 'note', text: e.text });
  }
  return out.slice(-MAX_LOG_ENTRIES);
}

/** True when `v` has the shape of a v2 SaveFile, whatever its `version` field says. */
function looksLikeV2(v: unknown): v is Dict {
  return isDict(v) && isDict(v.player) && isDict(v.vassals) && isDict(v.utilities) && isDict(v.settings);
}

/**
 * Accept any previously persisted shape and return a valid v2 SaveFile.
 * Unknown or corrupt input yields a fresh save (name kept when readable).
 *
 * A zustand/persist envelope `{ state, version }` is unwrapped; the inner
 * save is detected structurally and its own `version` wins over the
 * envelope's, so a v2 save persisted under an older store version is never
 * downgraded to the legacy path (errata 8).
 */
export function migrate(raw: unknown, now: number, opts?: TimeOptions): SaveFile {
  const outer = isDict(raw) ? raw : null;
  const inner: unknown = outer && isDict(outer.state) ? outer.state : raw;
  if (!isDict(inner)) return createNewSave(now, undefined, opts);

  const isV2 = looksLikeV2(inner);
  const version = typeof inner.version === 'number' ? inner.version : isV2 ? SAVE_VERSION : typeof outer?.version === 'number' ? outer.version : 1;
  if (!isV2 || version < 2) {
    // Legacy { name, level, xp }: keep the name and the progress, start everything else fresh.
    const legacyName = inner.name ?? (isDict(inner.player) ? inner.player.name : undefined);
    const fresh = createNewSave(now, sanitizeName(legacyName), opts);
    fresh.player.level = clamp(Math.floor(num(inner.level, 1)), 1, PLAYER_LEVEL_CAP);
    fresh.player.xp = Math.max(0, num(inner.xp, 0));
    return fresh;
  }
  const unwrapped = inner;

  const fresh = createNewSave(now, undefined, opts);
  const settings = migrateSettings(unwrapped.settings, fresh.settings);
  const vassalsRaw = isDict(unwrapped.vassals) ? unwrapped.vassals : {};
  const utilitiesRaw = isDict(unwrapped.utilities) ? unwrapped.utilities : {};
  const vassals = {} as Record<HabitId, Vassal>;
  for (const h of HABIT_IDS) vassals[h] = migrateVassal(vassalsRaw[h], h);
  const utilities = {} as Record<UtilityId, Utility>;
  for (const u of UTILITY_IDS) utilities[u] = migrateUtility(utilitiesRaw[u], u);
  const weekRaw = isDict(unwrapped.week) ? unwrapped.week : {};
  const history: WaveRecord[] = [];
  if (Array.isArray(weekRaw.history)) {
    for (const r of weekRaw.history) {
      const m = migrateWaveRecord(r);
      if (m) history.push(m);
    }
  }
  const week: WeekState = { index: Math.max(0, num(weekRaw.index, 0)), history: history.slice(-WAVE_HISTORY_MAX) };
  // `today` is measured with the migrated reset hour, like the rest of the save's day indices.
  const today = gameDayIndex(now, settings.resetHour, opts?.tz);
  const firstPlayDay = Math.floor(num(unwrapped.firstPlayDay, today));
  // A missing `lastOpenDay` defaults to today, not to the first play day: a damaged
  // save must not replay years of boundaries (errata 13).
  const lastOpenDay = Math.floor(num(unwrapped.lastOpenDay, today));

  return {
    version: SAVE_VERSION,
    player: migratePlayer(unwrapped.player, fresh.player),
    settings,
    vassals,
    utilities,
    board: migrateBoard(unwrapped.board),
    week,
    combos: migrateCombos(unwrapped.combos),
    titles: migrateTitles(unwrapped.titles),
    stats: migrateStats(unwrapped.stats),
    log: migrateLog(unwrapped.log),
    firstPlayDay,
    lastOpenDay: Math.max(firstPlayDay, lastOpenDay),
  };
}

/** Serialise for export; the inverse is `migrate(JSON.parse(text), now)`. */
export function exportSave(save: SaveFile): string {
  return JSON.stringify(save);
}
