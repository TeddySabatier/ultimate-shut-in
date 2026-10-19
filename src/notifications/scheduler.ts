/**
 * Reminder scheduler: pure. Given a save, the reminder prefs and `now`, it
 * returns the upcoming fire times. No DOM, no storage, no timers; the runtime
 * arms them. Time zones are injected like everywhere in the engine.
 *
 * Rules
 * - Board issued: daily at the chosen time, but never before the day's reset
 *   hour (the board is issued at the reset hour).
 * - Wave tomorrow: at the chosen time on the last game day of a wave period
 *   (the wave settles at the next reset hour, i.e. tomorrow).
 * - Timer finished: when a running timer quest reaches its duration.
 * - Quiet hours (lights-out to wake hour from Settings): nothing fires. A board
 *   reminder slides to the wake hour; a wave or timer reminder is dropped, a
 *   late "time is up" or "wave tomorrow" being worse than none.
 */
import {
  DAY_MS,
  dayInWavePeriod,
  defaultTzOffset,
  gameDayIndex,
  resolveTemplate,
  type SaveFile,
  type TzOffsetProvider,
} from '../game';
import type { ReminderPrefs } from './prefs';

export type ReminderKind = 'board' | 'wave' | 'timer';

export interface PlannedReminder {
  /** Stable while the situation is unchanged: `board`, `wave` or `timer:<instanceId>`. */
  id: string;
  kind: ReminderKind;
  /** Unix ms. */
  at: number;
  /** Quest title for timer reminders. */
  label?: string;
}

/** How far ahead waves are looked for (a wave a week away, plus a week of dropped ones). */
const HORIZON_DAYS = 21;
const MINUTE_MS = 60_000;

/** Minutes since local midnight. */
export function localMinutes(ms: number, tz: TzOffsetProvider = defaultTzOffset): number {
  const local = ms - tz(ms) * MINUTE_MS;
  const inDay = ((local % DAY_MS) + DAY_MS) % DAY_MS;
  return Math.floor(inDay / MINUTE_MS);
}

function localDayIndex(ms: number, tz: TzOffsetProvider): number {
  return Math.floor((ms - tz(ms) * MINUTE_MS) / DAY_MS);
}

/** Unix ms of local `minutes` on local calendar day `localDay` (days since the epoch, local). */
export function instantAt(localDay: number, minutes: number, tz: TzOffsetProvider = defaultTzOffset): number {
  const local = localDay * DAY_MS + minutes * MINUTE_MS;
  let utc = local + tz(local) * MINUTE_MS;
  utc = local + tz(utc) * MINUTE_MS;
  return utc;
}

/** True between lights-out and wake hour (`lightsOut === wake` means no quiet hours). */
export function isQuiet(ms: number, lightsOutHour: number, wakeHour: number, tz: TzOffsetProvider = defaultTzOffset): boolean {
  const m = localMinutes(ms, tz);
  const from = lightsOutHour * 60;
  const to = wakeHour * 60;
  if (from === to) return false;
  return from < to ? m >= from && m < to : m >= from || m < to;
}

/** First wake-hour instant at or after `ms`. */
function nextWake(ms: number, wakeHour: number, tz: TzOffsetProvider): number {
  const day = localDayIndex(ms, tz);
  const today = instantAt(day, wakeHour * 60, tz);
  return today >= ms ? today : instantAt(day + 1, wakeHour * 60, tz);
}

function planBoard(save: SaveFile, prefs: ReminderPrefs, now: number, tz: TzOffsetProvider): PlannedReminder | null {
  if (!prefs.board.on) return null;
  const { resetHour, lightsOutHour, wakeHour } = save.settings;
  const resetMinutes = resetHour * 60;
  const minutes = Math.max(prefs.board.minutes, resetMinutes);
  const day0 = localDayIndex(now, tz);
  let best: number | null = null;
  for (let k = 0; k <= 2; k++) {
    let at = instantAt(day0 + k, minutes, tz);
    if (at <= now) continue;
    if (isQuiet(at, lightsOutHour, wakeHour, tz)) {
      at = nextWake(at, wakeHour, tz);
      if (localMinutes(at, tz) < resetMinutes) at = instantAt(localDayIndex(at, tz), resetMinutes, tz);
    }
    if (best === null || at < best) best = at;
  }
  return best === null ? null : { id: 'board', kind: 'board', at: best };
}

function planWave(save: SaveFile, prefs: ReminderPrefs, now: number, tz: TzOffsetProvider): PlannedReminder | null {
  if (!prefs.wave.on) return null;
  const { resetHour, lightsOutHour, wakeHour } = save.settings;
  const day0 = localDayIndex(now, tz);
  for (let k = 0; k <= HORIZON_DAYS; k++) {
    const at = instantAt(day0 + k, prefs.wave.minutes, tz);
    if (at <= now) continue;
    if (dayInWavePeriod(gameDayIndex(at, resetHour, tz), save.firstPlayDay) !== 6) continue;
    if (isQuiet(at, lightsOutHour, wakeHour, tz)) continue;
    return { id: 'wave', kind: 'wave', at };
  }
  return null;
}

function planTimers(save: SaveFile, prefs: ReminderPrefs, now: number, tz: TzOffsetProvider): PlannedReminder[] {
  if (!prefs.timer.on || !save.board) return [];
  const { lightsOutHour, wakeHour } = save.settings;
  const out: PlannedReminder[] = [];
  for (const q of save.board.quests) {
    if (q.kind !== 'timer' || q.status !== 'open' || !q.timer || q.timer.startedAt === null) continue;
    const t = resolveTemplate(save, q.templateId);
    const needed = (t?.durationMin ?? 0) * MINUTE_MS;
    if (!t || needed <= 0) continue;
    const at = q.timer.startedAt + (needed - q.timer.accumulatedMs);
    if (at <= now || isQuiet(at, lightsOutHour, wakeHour, tz)) continue;
    out.push({ id: `timer:${q.instanceId}`, kind: 'timer', at, label: t.title });
  }
  return out;
}

/** Upcoming reminders in firing order; empty when the master switch is off. */
export function nextReminders(save: SaveFile, prefs: ReminderPrefs, now: number, tz: TzOffsetProvider = defaultTzOffset): PlannedReminder[] {
  if (!prefs.enabled) return [];
  const out: PlannedReminder[] = [];
  const board = planBoard(save, prefs, now, tz);
  if (board) out.push(board);
  const wave = planWave(save, prefs, now, tz);
  if (wave) out.push(wave);
  out.push(...planTimers(save, prefs, now, tz));
  return out.sort((a, b) => a.at - b.at);
}
