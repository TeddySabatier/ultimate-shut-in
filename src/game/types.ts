/**
 * Save-file schema for Haven Protocol, as specified in GDD section 4.
 *
 * Every value here is plain JSON-serialisable data. All times are Unix ms.
 * "Game day" values are absolute day indices (days since the Unix epoch,
 * shifted by the reset hour, see `time.ts`); `firstPlayDay` is the index of
 * the first day ever opened and relative day numbers used by the wave
 * schedule are `day - firstPlayDay`.
 */

export type HabitId = 'move' | 'outside' | 'clean' | 'social' | 'study' | 'sleep' | 'eat' | 'hygiene';
export type Difficulty = 'gentle' | 'steady' | 'hardcore';
export type Benevolence = 'benevolent' | 'strict';
export type UtilityId = 'power' | 'water' | 'gas';
export type QuestKind = 'check' | 'timer' | 'count';
export type WaveResult = 'decisive' | 'win' | 'loss' | 'quiet';
export type RingId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Tier = 1 | 2 | 3;
export type QuestStatus = 'open' | 'done' | 'tried';

export const HABIT_IDS: readonly HabitId[] = [
  'move',
  'outside',
  'clean',
  'social',
  'study',
  'sleep',
  'eat',
  'hygiene',
] as const;

export const UTILITY_IDS: readonly UtilityId[] = ['power', 'water', 'gas'] as const;

export interface SaveFile {
  version: 3;
  player: Player;
  settings: Settings;
  vassals: Record<HabitId, Vassal>;
  utilities: Record<UtilityId, Utility>;
  board: Board | null;
  week: WeekState;
  combos: ComboItem[];
  titles: EarnedTitle[];
  stats: LifetimeStats;
  log: LogEntry[];
  /** Player-authored quest templates (custom quests, `custom.ts`). */
  customTemplates: CustomTemplate[];
  /** Adaptive proposals, "the Haven notices" (`adapt.ts`). */
  proposals: Proposal[];
  /**
   * Settled days of the last ~6 weeks, one entry per day that had a done or
   * tried quest. Only the proposal rules read it; written at each boundary.
   */
  activity: ActivityDay[];
  firstPlayDay: number;
  lastOpenDay: number;
}

export interface Player {
  name: string;
  level: number;
  xp: number;
  coins: number;
  domainPoints: number;
  ring: RingId;
  /**
   * Highest ring ever reached (errata 15). `ring` never drops below it, and
   * `ringUnlocked` fires only when it rises, so an undo that reverts DP
   * below a threshold neither demotes the player nor re-shows the overlay.
   */
  highestRing: RingId;
  resurrectionMonth: string | null;
}

export interface Settings {
  difficulty: Difficulty;
  benevolence: Benevolence;
  enabledHabits: HabitId[];
  resetHour: number;
  lightsOutHour: number;
  wakeHour: number;
  reducedMotion: boolean;
}

export interface Vassal {
  habit: HabitId;
  level: number;
  xp: number;
  trust: number;
  loyalty: number;
  away: boolean;
  lastActiveDay: number | null;
  lifetimeQuests: number;
}

export interface Utility {
  id: UtilityId;
  value: number;
  fullStreakDays: number;
}

export interface Board {
  day: number;
  seed: number;
  quests: BoardQuest[];
  bonusId: string;
  rerolledToday: boolean;
}

export interface QuestTimer {
  startedAt: number | null;
  accumulatedMs: number;
}

/**
 * Reward snapshot taken at completion. `utility` is the utility points the
 * completion actually restored (0 when the habit feeds no utility); it is
 * needed so undo can revert the exact amount (GDD 6.7 "utility gains are
 * reverted") and is the one addition to the GDD 4 shape.
 */
export interface RewardSnapshot {
  xp: number;
  coins: number;
  dp: number;
  loyalty: number;
  utility: number;
}

export interface BoardQuest {
  instanceId: string;
  templateId: string;
  habit: HabitId;
  kind: QuestKind;
  status: QuestStatus;
  count: number;
  timer: QuestTimer | null;
  timedBonus: boolean;
  rewards: RewardSnapshot | null;
}

export interface WeekState {
  index: number;
  history: WaveRecord[];
}

export interface WaveBreakdown {
  vassals: number;
  trust: number;
  walls: number;
  combos: number;
  titles: number;
  wellKept: number;
}

export interface WaveRecord {
  index: number;
  ring: number;
  attack: number;
  defense: number;
  breakdown: WaveBreakdown;
  result: WaveResult;
  dpAwarded: number;
  log: string[];
  settledAt: number;
}

export interface ComboItem {
  comboId: string;
  power: number;
  forgedDay: number;
}

export interface EarnedTitle {
  titleId: string;
  earnedAt: number;
  habit?: HabitId;
}

export interface LifetimeStats {
  questsTotal: number;
  questsByHabit: Record<HabitId, number>;
  questDaysTotal: number;
  questDayStreak: number;
  bestQuestDayStreak: number;
  lastQuestDay: number | null;
  waveWins: number;
  waveLosses: number;
  decisiveStreak: number;
  combosForged: number;
  resurrectionsUsed: number;
  reRecruitments: number;
  streakLostOnDay: number | null;
  streakLostLength: number | null;
}

export interface LogEntry {
  at: number;
  day: number;
  kind: string;
  text: string;
}

/* ------------------------------------------------------------------ */
/* Custom quests and adaptive proposals (docs/design/CUSTOM-QUESTS.md). */
/* ------------------------------------------------------------------ */

export type TimeSlot = 'any' | 'morning' | 'afternoon' | 'evening';
export type CustomSource = 'voice' | 'text' | 'proposal';
/** `weekly:N` is N times a week (1..6); N = 7 is stored as `daily`. */
export type Recurrence = 'once' | 'daily' | 'weekdays' | `weekly:${number}`;

export interface CustomStats {
  /** Times the template was put on a board (by hand or by recurrence). */
  issued: number;
  /** Completions that currently stand (an undo takes one back). */
  done: number;
  /** Quests left at "tried" at the end of the day, or still tried now. */
  tried: number;
}

export interface CustomTemplate {
  /** `c-<fnv1a hex>`; never reused, even after archiving. */
  id: string;
  habit: HabitId;
  kind: QuestKind;
  durationMin?: number;
  targetCount?: number;
  title: string;
  description: string;
  tier: Tier;
  recurrence: Recurrence;
  /** 0 (Sunday) .. 6: with `weekly:1`, only that weekday. */
  pinWeekday?: number;
  timeSlot: TimeSlot;
  createdAt: number;
  archivedAt?: number;
  source: CustomSource;
  stats: CustomStats;
}

export type ProposalRule = 'smaller' | 'stepUp' | 'makeRecurring' | 'footInDoor' | 'pinWeekday';

/** The fields a player (or a proposal) sets when creating a custom quest. */
export interface CustomDraft {
  habit: HabitId;
  kind: QuestKind;
  durationMin?: number | undefined;
  targetCount?: number | undefined;
  title: string;
  description: string;
  /** Manual tier; clamped to what the effort allows. Omit to use the derived tier. */
  tier?: Tier | undefined;
  recurrence: Recurrence;
  pinWeekday?: number | undefined;
  timeSlot: TimeSlot;
  source: CustomSource;
}

export type ProposalAction =
  | { type: 'create'; draft: CustomDraft; addToBoard: boolean }
  | { type: 'update'; templateId: string; patch: Partial<Omit<CustomDraft, 'source'>> };

export interface Proposal {
  id: string;
  rule: ProposalRule;
  habit: HabitId;
  status: 'open' | 'dismissed' | 'accepted';
  createdDay: number;
  /** For dismissed or accepted: the game day until which rule + habit stays quiet. */
  snoozeUntil: number | null;
  /** Short heading, e.g. "A smaller Walk in the Park". */
  title: string;
  /** The reason the UI shows. */
  reason: string;
  action: ProposalAction;
}

export interface ActivityEntry {
  templateId: string;
  habit: HabitId;
  status: 'done' | 'tried';
}

export interface ActivityDay {
  day: number;
  entries: ActivityEntry[];
}

/* ------------------------------------------------------------------ */
/* Events: emitted by every state transition so the UI can toast them. */
/* ------------------------------------------------------------------ */

export type GameEvent =
  | { type: 'boardIssued'; day: number }
  | { type: 'questDone'; instanceId: string; habit: HabitId; rewards: RewardSnapshot; timedBonus: boolean }
  | { type: 'questTried'; instanceId: string; habit: HabitId }
  | { type: 'questUndone'; instanceId: string; habit: HabitId }
  | { type: 'questRerolled'; oldInstanceId: string; newInstanceId: string; cost: number }
  | { type: 'levelUp'; level: number }
  | { type: 'vassalLevelUp'; habit: HabitId; level: number }
  | { type: 'utilityRestored'; utility: UtilityId }
  | { type: 'utilityDegraded'; utility: UtilityId; state: 'flickering' | 'dim' }
  | { type: 'titleEarned'; titleId: string; habit?: HabitId }
  | { type: 'comboForged'; comboId: string; power: number }
  | { type: 'comboUnforged'; comboId: string }
  | { type: 'ringUnlocked'; ring: RingId }
  | { type: 'waveSettled'; record: WaveRecord }
  | { type: 'vassalLeft'; habit: HabitId }
  | { type: 'vassalReturned'; habit: HabitId }
  | { type: 'catchUp'; days: number }
  | { type: 'resurrectionUsed'; restored: 'streak' | 'vassal'; habit?: HabitId }
  | { type: 'customSaved'; templateId: string }
  | { type: 'customUpdated'; templateId: string }
  | { type: 'customArchived'; templateId: string }
  | { type: 'customBoarded'; instanceId: string }
  | { type: 'proposalsIssued'; count: number }
  | { type: 'proposalResolved'; id: string; accepted: boolean };

export interface ActionResult {
  save: SaveFile;
  events: GameEvent[];
  /** Set when the action was refused; `save` is then the input, unchanged. */
  error?: string;
}
