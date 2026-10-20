/**
 * Save creation and migration. `migrate` accepts the legacy `usi.player`
 * shape (`{name, level, xp}`, version missing or 1), v2 files (no custom
 * quests, proposals or activity: they get empty arrays), v3 files (no city
 * map: they get an empty one seeded with one snapshot of the current state),
 * v4 files (City Map: `map`, `WaveBreakdown.outposts`) and v5 (Arena: `arena`,
 * `WaveBreakdown.arena`), filling any missing field with a default so older saves keep loading.
 */
import { getCombo, habits } from './content';
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
import {
  DESCRIPTION_MAX,
  MAX_DURATION_MIN,
  MAX_TARGET_COUNT,
  TITLE_MAX,
  normalizeRecurrence,
  resolveTemplate,
  resolveTier,
} from './template';
import { canHoldOutpost } from './mapGeometry';
import { SNAPSHOT_MAX } from './map';
import { defaultArenaState } from './arena/defaults';
import type { ArenaState } from './types';
import { OUTPOST_NAME_MAX, OUTPOST_NOTE_MAX, VISIT_LOG_MAX, higherState, isOutpostTypeId, outpostStateFor, placementError, resolveOutpostHabits } from './outposts';
import { gameDayIndex, type TimeOptions } from './time';
import type {
  ActivityDay,
  ActivityEntry,
  ArenaRunLogEntry,
  Benevolence,
  Board,
  BoardQuest,
  ComboItem,
  CustomDraft,
  CustomSource,
  CustomStats,
  CustomTemplate,
  Difficulty,
  DomainSnapshot,
  EarnedTitle,
  HabitId,
  LifetimeStats,
  LogEntry,
  MapState,
  Outpost,
  OutpostState,
  OutpostVisit,
  Player,
  Proposal,
  ProposalAction,
  ProposalRule,
  QuestKind,
  QuestStatus,
  RingId,
  SaveFile,
  Settings,
  TimeSlot,
  Utility,
  UtilityId,
  Vassal,
  VisitSource,
  WaveRecord,
  WaveResult,
  WeekState,
} from './types';
import { HABIT_IDS, OUTPOST_STATES, UTILITY_IDS } from './types';

export const SAVE_VERSION = 5 as const;
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

/** The map of a player who has not marked anything yet. */
export function emptyMap(): MapState {
  return { outposts: [], visits: [], snapshots: [], lastSeen: null, nextSeq: 1 };
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
    customTemplates: [],
    proposals: [],
    activity: [],
    map: emptyMap(),
    arena: defaultArenaState(),
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
function migrateQuest(raw: unknown, day: number, customs: CustomTemplate[]): BoardQuest | null {
  if (!isDict(raw) || typeof raw.templateId !== 'string') return null;
  const t = resolveTemplate({ customTemplates: customs }, raw.templateId);
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

function migrateBoard(raw: unknown, customs: CustomTemplate[]): Board | null {
  if (!isDict(raw) || !Array.isArray(raw.quests) || typeof raw.day !== 'number' || !Number.isFinite(raw.day)) return null;
  const day = Math.floor(raw.day);
  const quests: BoardQuest[] = [];
  for (const q of raw.quests) {
    const m = migrateQuest(q, day, customs);
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
      outposts: num(b.outposts, 0),
      arena: num(b.arena, 0),
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

/* ------------------- Custom quests, proposals, activity ------------------- */

const QUEST_KINDS: readonly QuestKind[] = ['check', 'timer', 'count'];
const TIME_SLOTS: readonly TimeSlot[] = ['any', 'morning', 'afternoon', 'evening'];
const SOURCES: readonly CustomSource[] = ['voice', 'text', 'proposal'];
const RULES: readonly ProposalRule[] = ['smaller', 'stepUp', 'makeRecurring', 'footInDoor', 'pinWeekday'];
const PROPOSAL_STATUSES: readonly Proposal['status'][] = ['open', 'dismissed', 'accepted'];
export const ACTIVITY_DAYS = 42;
export const MAX_PROPOSAL_RECORDS = 60;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function weekday(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6 ? v : undefined;
}

/** Lenient reader for a stored draft: anything unusable returns null. */
function coerceDraft(raw: unknown): CustomDraft | null {
  if (!isDict(raw) || !isHabitId(raw.habit)) return null;
  const kind = oneOf(raw.kind, QUEST_KINDS, 'check');
  const title = str(raw.title, TITLE_MAX);
  if (title === '') return null;
  const durationMin = kind === 'timer' ? clamp(Math.round(num(raw.durationMin, 15)), 1, MAX_DURATION_MIN) : undefined;
  const targetCount = kind === 'count' ? clamp(Math.round(num(raw.targetCount, 1)), 1, MAX_TARGET_COUNT) : undefined;
  const recurrence = normalizeRecurrence(raw.recurrence) ?? 'once';
  const pin = recurrence === 'weekly:1' ? weekday(raw.pinWeekday) : undefined;
  const manual = raw.tier === 1 || raw.tier === 2 || raw.tier === 3 ? raw.tier : undefined;
  return {
    habit: raw.habit,
    kind,
    durationMin,
    targetCount,
    title,
    description: str(raw.description, DESCRIPTION_MAX),
    tier: resolveTier(kind, manual, durationMin, targetCount),
    recurrence,
    pinWeekday: pin,
    timeSlot: oneOf(raw.timeSlot, TIME_SLOTS, 'any'),
    source: oneOf(raw.source, SOURCES, 'text'),
  };
}

function migrateStatsOf(raw: unknown): CustomStats {
  const r = isDict(raw) ? raw : {};
  const n = (v: unknown): number => Math.max(0, Math.floor(num(v, 0)));
  return { issued: n(r.issued), done: n(r.done), tried: n(r.tried) };
}

function migrateCustomTemplates(raw: unknown): CustomTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomTemplate[] = [];
  for (const c of raw) {
    if (!isDict(c) || typeof c.id !== 'string' || !c.id.startsWith('c-') || out.some((x) => x.id === c.id)) continue;
    const d = coerceDraft(c);
    if (!d) continue;
    const t: CustomTemplate = {
      id: c.id,
      habit: d.habit,
      kind: d.kind,
      title: d.title,
      description: d.description,
      tier: d.tier ?? 1,
      recurrence: d.recurrence,
      timeSlot: d.timeSlot,
      createdAt: num(c.createdAt, 0),
      source: d.source,
      stats: migrateStatsOf(c.stats),
    };
    if (d.durationMin !== undefined) t.durationMin = d.durationMin;
    if (d.targetCount !== undefined) t.targetCount = d.targetCount;
    if (d.pinWeekday !== undefined) t.pinWeekday = d.pinWeekday;
    if (typeof c.archivedAt === 'number' && Number.isFinite(c.archivedAt)) t.archivedAt = c.archivedAt;
    if (typeof c.outpostId === 'string' && c.outpostId !== '') t.outpostId = c.outpostId; // checked against the map below
    out.push(t);
  }
  return out;
}

function migrateAction(raw: unknown): ProposalAction | null {
  if (!isDict(raw)) return null;
  if (raw.type === 'create') {
    const draft = coerceDraft(raw.draft);
    return draft ? { type: 'create', draft, addToBoard: bool(raw.addToBoard, false) } : null;
  }
  if (raw.type === 'update' && typeof raw.templateId === 'string' && isDict(raw.patch)) {
    const patch: Extract<ProposalAction, { type: 'update' }>['patch'] = {};
    const rec = normalizeRecurrence(raw.patch.recurrence);
    if (rec) patch.recurrence = rec;
    const pin = weekday(raw.patch.pinWeekday);
    if (pin !== undefined) patch.pinWeekday = pin;
    return { type: 'update', templateId: raw.templateId, patch };
  }
  return null;
}

function migrateProposals(raw: unknown): Proposal[] {
  if (!Array.isArray(raw)) return [];
  const out: Proposal[] = [];
  for (const p of raw) {
    if (!isDict(p) || typeof p.id !== 'string' || out.some((x) => x.id === p.id) || !isHabitId(p.habit)) continue;
    const action = migrateAction(p.action);
    if (!action) continue;
    out.push({
      id: p.id,
      rule: oneOf(p.rule, RULES, 'smaller'),
      habit: p.habit,
      status: oneOf(p.status, PROPOSAL_STATUSES, 'dismissed'),
      createdDay: Math.floor(num(p.createdDay, 0)),
      snoozeUntil: nullableNum(p.snoozeUntil),
      title: str(p.title, 80),
      reason: str(p.reason, 300),
      action,
    });
  }
  return out.slice(-MAX_PROPOSAL_RECORDS);
}

function migrateActivity(raw: unknown): ActivityDay[] {
  if (!Array.isArray(raw)) return [];
  const out: ActivityDay[] = [];
  for (const d of raw) {
    if (!isDict(d) || typeof d.day !== 'number' || !Number.isFinite(d.day) || !Array.isArray(d.entries)) continue;
    const day = Math.floor(d.day);
    if (out.some((x) => x.day === day)) continue;
    const entries: ActivityEntry[] = [];
    for (const e of d.entries) {
      if (!isDict(e) || typeof e.templateId !== 'string' || !isHabitId(e.habit) || (e.status !== 'done' && e.status !== 'tried')) continue;
      entries.push({ templateId: e.templateId, habit: e.habit, status: e.status });
    }
    out.push({ day, entries: entries.slice(0, 40) });
  }
  out.sort((a, b) => a.day - b.day);
  return out.slice(-ACTIVITY_DAYS);
}

/* ------------------------------ City map ------------------------------ */

const VISIT_SOURCES: readonly VisitSource[] = ['quest', 'checkin'];

/** Outpost text the way `outposts.ts` tidies it (collapsed, trimmed after the cut), so a migration is idempotent. */
function tidyText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
}

/** Snapshot of the current state, the baseline a map-less save starts with so *7 days* has something honest. */
function seedSnapshot(player: Player, week: WeekState, day: number): DomainSnapshot {
  const last = week.history[week.history.length - 1];
  return { periodIndex: week.index - 1, day, domainPoints: player.domainPoints, ring: player.ring, result: last?.result ?? 'quiet' };
}

/** Normalise one stored outpost; `null` drops it (bad id, type, cell or name). `peak` never ends below what the visits earn. */
function migrateOutpost(raw: unknown, fallbackDay: number): Outpost | null {
  if (!isDict(raw) || typeof raw.id !== 'string' || !/^op[1-9]\d*$/.test(raw.id) || !isOutpostTypeId(raw.type)) return null;
  const cellRaw = isDict(raw.cell) ? raw.cell : null;
  const cell = cellRaw ? { x: num(cellRaw.x, Number.NaN), y: num(cellRaw.y, Number.NaN) } : null;
  if (!cell || !canHoldOutpost(cell)) return null;
  const name = tidyText(raw.name, OUTPOST_NAME_MAX);
  if (name === '') return null;
  const habits = resolveOutpostHabits(raw.type, Array.isArray(raw.habits) ? raw.habits.filter((h): h is string => typeof h === 'string') : undefined);
  if (!habits) return null;
  const visits = Math.max(0, Math.floor(num(raw.visits, 0)));
  const createdDay = Math.floor(num(raw.createdDay, fallbackDay));
  const stateDays: Partial<Record<OutpostState, number>> = {};
  if (isDict(raw.stateDays)) {
    for (const st of OUTPOST_STATES) {
      const d = raw.stateDays[st];
      if (typeof d === 'number' && Number.isFinite(d)) stateDays[st] = Math.floor(d);
    }
  }
  if (stateDays.marked === undefined) stateDays.marked = createdDay;
  return {
    id: raw.id,
    name,
    type: raw.type,
    habits,
    note: tidyText(raw.note, OUTPOST_NOTE_MAX),
    cell,
    createdAt: num(raw.createdAt, 0),
    createdDay,
    visits,
    lastVisitDay: nullableNum(raw.lastVisitDay),
    peak: higherState(oneOf(raw.peak, OUTPOST_STATES, 'marked'), outpostStateFor(visits)),
    stateDays,
    retired: bool(raw.retired, false),
  };
}

/**
 * Normalise a stored map like boards: drop outposts with invalid cells or
 * types, clamp text, rebuild `nextSeq`, drop orphan visits, keep snapshots
 * strictly increasing. Active outposts that break the caps or the spacing
 * (two saves merged by hand, say) are retired rather than lost.
 */
function migrateArena(raw: unknown): ArenaState {
  const base = defaultArenaState();
  if (!isDict(raw)) return base;
  const gear = base.gear;
  if (isDict(raw.gear)) {
    for (const h of HABIT_IDS) {
      const slots = raw.gear[h];
      if (Array.isArray(slots) && slots.length === 3) {
        gear[h] = [
          typeof slots[0] === 'string' ? slots[0] : null,
          typeof slots[1] === 'string' ? slots[1] : null,
          typeof slots[2] === 'string' ? slots[2] : null,
        ];
      }
    }
  }
  if (isDict(raw.trainingSessions)) {
    for (const h of HABIT_IDS) {
      const n = raw.trainingSessions[h];
      if (typeof n === 'number' && Number.isFinite(n)) base.trainingSessions[h] = Math.max(0, Math.floor(n));
    }
  }
  if (Array.isArray(raw.decor)) {
    base.decor = raw.decor.filter((d): d is string => typeof d === 'string');
  }
  base.trainingCoinsThisPeriod = Math.max(0, num(raw.trainingCoinsThisPeriod, 0));
  base.trainingPeriodIndex = Math.max(0, Math.floor(num(raw.trainingPeriodIndex, 0)));
  if (raw.activeRun === null || raw.activeRun === undefined) base.activeRun = null;
  else if (isDict(raw.activeRun)) {
    const r = raw.activeRun;
    base.activeRun = {
      seed: num(r.seed, 0),
      roomIndex: Math.max(0, Math.floor(num(r.roomIndex, 0))),
      lastGameId: typeof r.lastGameId === 'string' ? r.lastGameId : null,
      buffs: Array.isArray(r.buffs)
        ? r.buffs
            .filter((b): b is Dict => isDict(b))
            .map((b) => ({
              id: typeof b.id === 'string' ? b.id : 'unknown',
              kind: oneOf(b.kind, ['attack', 'defense', 'time', 'hint', 'revive', 'luck'] as const, 'attack'),
              amount: num(b.amount, 0),
            }))
        : [],
      pendingScore: Math.max(0, num(r.pendingScore, 0)),
      bankedCoins: Math.max(0, num(r.bankedCoins, 0)),
      log: Array.isArray(r.log)
        ? r.log
            .filter((e): e is Dict => isDict(e))
            .map((e) => {
              const row: ArenaRunLogEntry = {
                gameId: typeof e.gameId === 'string' ? e.gameId : 'unknown',
                result: oneOf(e.result, ['won', 'lost', 'fled'] as const, 'fled'),
                score: Math.max(0, num(e.score, 0)),
              };
              if (typeof e.learnedTopic === 'string') row.learnedTopic = e.learnedTopic;
              return row;
            })
        : [],
      startedAt: num(r.startedAt, 0),
      entryFee: Math.max(0, num(r.entryFee, 0)),
      lotteryChoice: Array.isArray(r.lotteryChoice)
        ? r.lotteryChoice.filter((x): x is string => typeof x === 'string')
        : null,
    };
  }
  const wb = isDict(raw.waveBoost) ? raw.waveBoost : isDict(raw.banked) ? raw.banked : null;
  if (wb) {
    base.waveBoost = {
      bonus: Math.max(0, num(wb.bonus, num(wb.defenseBonus, 0))),
      forWeekIndex: nullableNum(wb.forWeekIndex ?? wb.defenseBonusExpiresPeriod),
    };
  }
  if (Array.isArray(raw.requests)) {
    for (const req of raw.requests) {
      if (!isDict(req) || typeof req.text !== 'string') continue;
      base.requests.push({
        id: typeof req.id === 'string' ? req.id : `req-${base.requests.length}`,
        text: req.text.slice(0, 500),
        source: req.source === 'voice' ? 'voice' : 'text',
        at: num(req.at, 0),
        day: Math.floor(num(req.day, 0)),
      });
    }
    base.requests = base.requests.slice(-20);
  }
  base.totalRuns = Math.max(0, Math.floor(num(raw.totalRuns, 0)));
  return base;
}

function migrateMap(raw: unknown, seed: DomainSnapshot, fallbackDay: number): MapState {
  const map = emptyMap();
  const r = isDict(raw) ? raw : {};
  if (Array.isArray(r.outposts)) {
    for (const o of r.outposts) {
      const m = migrateOutpost(o, fallbackDay);
      if (m && !map.outposts.some((x) => x.id === m.id)) map.outposts.push(m);
    }
  }
  // Active invariants (CITY-MAP 4.2): unique names and cells, 3 per zone, 3 apart. Later offenders are retired.
  const kept: SaveFile = { map: { ...map, outposts: [] } } as unknown as SaveFile;
  for (const o of map.outposts) {
    if (o.retired) continue;
    const dup = kept.map.outposts.some((x) => x.name.toLowerCase() === o.name.toLowerCase());
    if (dup || placementError(kept, o.cell) !== null) o.retired = true;
    else kept.map.outposts.push(o);
  }
  const ids = new Set(map.outposts.map((o) => o.id));
  if (Array.isArray(r.visits)) {
    const countedKeys = new Set<string>();
    for (const v of r.visits) {
      if (!isDict(v) || typeof v.outpostId !== 'string' || !ids.has(v.outpostId) || typeof v.day !== 'number' || !Number.isFinite(v.day)) continue;
      const day = Math.floor(v.day);
      const key = `${v.outpostId}:${day}`;
      let counted = bool(v.counted, false);
      if (counted && countedKeys.has(key)) counted = false;
      if (counted) countedKeys.add(key);
      const visit: OutpostVisit = {
        outpostId: v.outpostId,
        day,
        at: num(v.at, 0),
        source: oneOf(v.source, VISIT_SOURCES, 'checkin'),
        instanceId: typeof v.instanceId === 'string' ? v.instanceId : null,
        counted,
      };
      map.visits.push(visit);
    }
    map.visits = map.visits.slice(-VISIT_LOG_MAX);
  }
  // 4.2: lastVisitDay is the newest counted visit still in the log. With none left the stored day stays (old
  // visits can fall off the 400-entry cap, and nulling it would mark the outpost quiet on every load); an
  // outpost with no visits at all has none.
  for (const o of map.outposts) {
    let newest: number | null = null;
    for (const v of map.visits) {
      if (v.outpostId === o.id && v.counted && (newest === null || v.day > newest)) newest = v.day;
    }
    if (newest !== null) o.lastVisitDay = newest;
    else if (o.visits === 0) o.lastVisitDay = null;
  }
  if (Array.isArray(r.snapshots)) {
    for (const sn of r.snapshots) {
      if (!isDict(sn) || typeof sn.periodIndex !== 'number' || !Number.isFinite(sn.periodIndex)) continue;
      const periodIndex = Math.floor(sn.periodIndex);
      const last = map.snapshots[map.snapshots.length - 1];
      if (last && periodIndex <= last.periodIndex) continue;
      map.snapshots.push({
        periodIndex,
        day: Math.floor(num(sn.day, fallbackDay)),
        domainPoints: Math.max(0, num(sn.domainPoints, 0)),
        ring: clamp(Math.floor(num(sn.ring, 1)), 1, 7) as RingId,
        result: oneOf(sn.result, WAVE_RESULTS, 'quiet'),
      });
    }
    map.snapshots = map.snapshots.slice(-SNAPSHOT_MAX);
  }
  // A save without a map (v3 and older) starts from a snapshot of its current state; a v4 map keeps its own list, even empty.
  if (!isDict(raw)) map.snapshots.push(seed);
  const ls = isDict(r.lastSeen) ? r.lastSeen : null;
  map.lastSeen = ls && typeof ls.day === 'number' && Number.isFinite(ls.day) ? { day: Math.floor(ls.day), domainPoints: Math.max(0, num(ls.domainPoints, 0)) } : null;
  const maxSeq = map.outposts.reduce((m, o) => Math.max(m, Number(o.id.slice(2))), 0);
  map.nextSeq = Math.max(maxSeq + 1, Math.floor(num(r.nextSeq, 1)), 1);
  return map;
}

/** True when `v` has the shape of a v2 SaveFile, whatever its `version` field says. */
function looksLikeV2(v: unknown): v is Dict {
  return isDict(v) && isDict(v.player) && isDict(v.vassals) && isDict(v.utilities) && isDict(v.settings);
}

/**
 * Accept any previously persisted shape and return a valid v5 SaveFile.
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
  const customTemplates = migrateCustomTemplates(unwrapped.customTemplates);
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
  const lastOpenDay = Math.max(firstPlayDay, Math.floor(num(unwrapped.lastOpenDay, today)));
  const player = migratePlayer(unwrapped.player, fresh.player);
  const map = migrateMap(unwrapped.map, seedSnapshot(player, week, lastOpenDay), lastOpenDay);
  const arena = migrateArena(unwrapped.arena);
  // A template may only default to an outpost that is on the map and active.
  for (const t of customTemplates) {
    if (t.outpostId !== undefined && !map.outposts.some((o) => o.id === t.outpostId && !o.retired)) delete t.outpostId;
  }

  return {
    version: SAVE_VERSION,
    player,
    settings,
    vassals,
    utilities,
    board: migrateBoard(unwrapped.board, customTemplates),
    week,
    combos: migrateCombos(unwrapped.combos),
    titles: migrateTitles(unwrapped.titles),
    stats: migrateStats(unwrapped.stats),
    log: migrateLog(unwrapped.log),
    customTemplates,
    proposals: migrateProposals(unwrapped.proposals),
    activity: migrateActivity(unwrapped.activity),
    map,
    arena,
    firstPlayDay,
    lastOpenDay,
  };
}

/** Serialise for export; the inverse is `migrate(JSON.parse(text), now)`. */
export function exportSave(save: SaveFile): string {
  return JSON.stringify(save);
}
