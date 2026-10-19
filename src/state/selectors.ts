/**
 * Read-only view helpers over a SaveFile. Every number here comes from an
 * engine function; this file only arranges results for display.
 */
import {
  DAYS_PER_WAVE,
  daysUntilWave,
  fnv1a,
  formatLine,
  gameDayIndex,
  gameDayStartMs,
  getHabit,
  getRing,
  monsterForWave,
  nextRing,
  outpostCoinMult,
  pickLine,
  questRewards,
  resolveTemplate,
  resurrectionOffer,
  ringName,
  strings,
  TIED_HABIT,
  titleCoinMult,
  titleLoyaltyFlat,
  titleXpMult,
  utilityState,
  vassalName,
  waveAttack,
  waveDefense,
  wavePeriodIndex,
  xpToNext,
  type BoardQuest,
  type DefenseDetail,
  type HabitId,
  type Monster,
  type QuestRewards,
  type QuestTemplate,
  type ResurrectionOffer,
  type RingDef,
  type SaveFile,
  type TitleCondition,
  type UtilityId,
  type UtilityState,
  UTILITY_IDS,
} from '../game';

export function todayIndex(save: SaveFile, now: number): number {
  return gameDayIndex(now, save.settings.resetHour);
}

/** Undo is same-day only: the board must belong to the current game day. */
export function canUndoToday(save: SaveFile, now: number): boolean {
  return save.board !== null && save.board.day === todayIndex(save, now);
}

/** Milliseconds until the next board (the next reset hour). */
export function msUntilReset(save: SaveFile, now: number): number {
  return Math.max(0, gameDayStartMs(todayIndex(save, now) + 1, save.settings.resetHour) - now);
}

/** The template behind a board quest: shipped, or one of the player's own. */
export function templateOf(save: SaveFile, q: BoardQuest): QuestTemplate | undefined {
  return resolveTemplate(save, q.templateId);
}

/** Rewards the quest would pay if settled now (timed bonus excluded). */
export function rewardPreview(save: SaveFile, q: BoardQuest): QuestRewards | null {
  const t = templateOf(save, q);
  if (!t || !save.board) return null;
  return questRewards(t, {
    difficulty: save.settings.difficulty,
    bonus: save.board.bonusId === q.instanceId,
    timedBonus: false,
    titleXpMult: titleXpMult(save, q.habit),
    titleCoinMult: titleCoinMult(save),
    titleLoyaltyFlat: titleLoyaltyFlat(save),
    outpostCoinMult: outpostCoinMult(save, q.habit),
  });
}

export interface Progress {
  value: number;
  max: number;
}

export function playerXpProgress(save: SaveFile): Progress {
  return { value: save.player.xp, max: xpToNext(save.player.level) };
}

export interface RingProgress extends Progress {
  ring: RingDef;
  next: RingDef | null;
}

export function ringProgress(save: SaveFile): RingProgress {
  const ring = getRing(save.player.ring);
  const n = nextRing(save.player.ring);
  const next = n ? getRing(n.id) : null;
  const base = ring.domainPointsRequired;
  const max = next ? next.domainPointsRequired - base : 1;
  const value = next ? Math.min(max, save.player.domainPoints - base) : 1;
  return { ring, next, value, max };
}

export interface UtilityView {
  id: UtilityId;
  label: string;
  value: number;
  state: UtilityState;
  habit: HabitId;
  enabled: boolean;
}

export function utilityViews(save: SaveFile): UtilityView[] {
  return UTILITY_IDS.map((id) => {
    const habit = TIED_HABIT[id];
    return {
      id,
      label: strings.ui[id],
      value: save.utilities[id].value,
      state: utilityState(save.utilities[id].value),
      habit,
      enabled: save.settings.enabledHabits.includes(habit),
    };
  });
}

export interface WaveOutlook {
  daysUntil: number;
  /** 1-based week number of the period being fought. */
  week: number;
  defense: DefenseDetail;
  attack: number;
  monster: Monster;
}

export function waveOutlook(save: SaveFile, now: number): WaveOutlook {
  const today = todayIndex(save, now);
  const period = wavePeriodIndex(today, save.firstPlayDay);
  const week = period + 1;
  const seed = fnv1a(`${save.firstPlayDay}:${period}`);
  return {
    daysUntil: daysUntilWave(today, save.firstPlayDay),
    week,
    defense: waveDefense(save),
    attack: waveAttack(week, save.player.ring, save.settings.difficulty),
    monster: monsterForWave(week, seed),
  };
}

/** Monster that fought a settled wave (same seed the engine used). */
export function monsterForRecord(save: SaveFile, periodIndex: number): Monster {
  return monsterForWave(periodIndex + 1, fnv1a(`${save.firstPlayDay}:${periodIndex}`));
}

export function offerFor(save: SaveFile, now: number): ResurrectionOffer {
  return resurrectionOffer(save, now, todayIndex(save, now));
}

export function boardDoneCount(save: SaveFile): { done: number; total: number } {
  const quests = save.board?.quests ?? [];
  return { done: quests.filter((q) => q.status === 'done').length, total: quests.length };
}

export function anyTimerRunning(save: SaveFile): boolean {
  return save.board?.quests.some((q) => q.timer !== null && q.timer.startedAt !== null) ?? false;
}

/** Daily encouragement line (stable for the day). */
export function encouragementLine(save: SaveFile, now: number): string {
  return pickLine(strings.encouragement, fnv1a(`enc:${todayIndex(save, now)}`));
}

export function seededLine(pool: readonly string[], key: string, vars: Record<string, string | number> = {}): string {
  return formatLine(pickLine(pool, fnv1a(key)), vars);
}

/** Vassal display label: "Pell the Runner". */
export function vassalLabel(habit: HabitId): string {
  const h = getHabit(habit);
  return `${h.vassal.name} ${h.vassal.epithet}`;
}

/** Player-facing text for a locked title's condition. */
export function describeCondition(c: TitleCondition): string {
  switch (c.type) {
    case 'questsTotal':
      return `Settle ${c.count} quests`;
    case 'questsOfHabit':
      return `Settle ${c.count} ${getHabit(c.habit).label} quests`;
    case 'questDaysTotal':
      return `${c.count} days with a quest settled`;
    case 'questDayStreak':
      return `${c.count} quest days in a row`;
    case 'anyVassalLoyaltyAtLeast':
      return `Any vassal at ${c.value} loyalty`;
    case 'allVassalsLoyaltyAtLeast':
      return `Every vassal at ${c.value} loyalty at once`;
    case 'utilityFullStreak':
      return `${strings.ui[c.utility]} at full for ${c.days} days running`;
    case 'waveWins':
      return `Hold ${c.count} waves`;
    case 'decisiveWinStreak':
      return `${c.count} decisive waves in a row`;
    case 'ringReached':
      return `Reach ${ringName(c.ring)}`;
    case 'combosForged':
      return `Forge ${c.count} combo items`;
    case 'resurrectionUsed':
      return 'Use a Resurrection token';
    case 'vassalReRecruited':
      return 'Welcome a vassal back';
  }
}

export { vassalName, DAYS_PER_WAVE };
