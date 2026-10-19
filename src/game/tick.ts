/**
 * `processBoundaries` is the single entry point the UI calls on app open and
 * on every foreground event (GDD 6.8, 6.9). It advances missed day
 * boundaries one at a time with the catch-up caps, settles completed wave
 * periods, issues today's board when missing and bumps `lastOpenDay`.
 */
import { formatLine, pickLine, strings } from './content';
import { computeProposalsDraft, recordActivityDraft } from './adapt';
import { generateBoard, instanceId } from './board';
import { placeRecurringDraft } from './custom';
import { clone, ok, pushLog, refuse } from './draft';
import { CATCHUP_MAX_DAYS, LOYALTY_CATCHUP_CAP_DAYS, STREAK_LOSS_MIN_LENGTH, UTILITY_CATCHUP_CAP_DAYS } from './economy';
import { fnv1a } from './rng';
import { evaluateTitlesDraft } from './titles';
import { gameDayIndex, isWaveBoundary, wavePeriodIndex, type TimeOptions } from './time';
import { decayUtilitiesDraft } from './utilities';
import { activeVassals, decayLoyaltyDraft, vassalName } from './vassals';
import { settleWaveDraft } from './wave';
import type { ActionResult, GameEvent, HabitId, SaveFile, UtilityId } from './types';
import { HABIT_IDS } from './types';

/**
 * Catch-up caps (GDD 6.9): per catch-up, each vassal loses loyalty on at most
 * 7 boundaries and each utility decays on at most 3. The sets hold the
 * entities whose cap is spent; the counters feed them.
 */
export interface BoundaryCaps {
  loyaltySkip: Set<HabitId>;
  utilitySkip: Set<UtilityId>;
  loyaltyCount: Map<HabitId, number>;
  utilityCount: Map<UtilityId, number>;
}

export function newBoundaryCaps(): BoundaryCaps {
  return { loyaltySkip: new Set(), utilitySkip: new Set(), loyaltyCount: new Map(), utilityCount: new Map() };
}

function bump<K>(count: Map<K, number>, skip: Set<K>, keys: K[], cap: number): void {
  for (const k of keys) {
    const n = (count.get(k) ?? 0) + 1;
    count.set(k, n);
    if (n >= cap) skip.add(k);
  }
}

/** Habits with a `done` quest on the board for `day` (empty when the board is for another day). */
function doneHabitsOn(draft: SaveFile, day: number): Set<HabitId> {
  const out = new Set<HabitId>();
  if (draft.board && draft.board.day === day) {
    for (const q of draft.board.quests) if (q.status === 'done') out.add(q.habit);
  }
  return out;
}

/** The boundary routine for `dayEnded -> dayEnded + 1` (GDD 6.8), on a draft. */
export function processDayBoundaryDraft(draft: SaveFile, dayEnded: number, now: number, caps: BoundaryCaps = newBoundaryCaps()): GameEvent[] {
  const events: GameEvent[] = [];
  const nextDay = dayEnded + 1;

  // 1. Expire the board: stop any running timer; the board itself is replaced when today's is issued.
  // What was done or tried on it is archived first (the proposal rules read that history).
  recordActivityDraft(draft, dayEnded);
  if (draft.board && draft.board.day === dayEnded) {
    for (const q of draft.board.quests) {
      if (q.timer && q.timer.startedAt !== null) {
        q.timer.accumulatedMs += Math.max(0, now - q.timer.startedAt);
        q.timer.startedAt = null;
      }
    }
  }

  // 2. Utility decay (and full-streak bookkeeping).
  const utilities = decayUtilitiesDraft(draft, doneHabitsOn(draft, dayEnded), caps.utilitySkip);
  events.push(...utilities.events);
  bump(caps.utilityCount, caps.utilitySkip, utilities.decayed, UTILITY_CATCHUP_CAP_DAYS);

  // 3. Loyalty decay with the grace day.
  const loyalty = decayLoyaltyDraft(draft, dayEnded, now, caps.loyaltySkip);
  events.push(...loyalty.events);
  bump(caps.loyaltyCount, caps.loyaltySkip, loyalty.decayed, LOYALTY_CATCHUP_CAP_DAYS);

  // 4. Quest-day streak.
  const s = draft.stats;
  if (s.lastQuestDay !== dayEnded && s.questDayStreak > 0) {
    if (s.questDayStreak >= STREAK_LOSS_MIN_LENGTH) {
      s.streakLostOnDay = nextDay;
      s.streakLostLength = s.questDayStreak;
    }
    s.questDayStreak = 0;
  }

  // 5. Wave settlement when the period closes.
  if (isWaveBoundary(dayEnded, draft.firstPlayDay)) {
    events.push(...settleWaveDraft(draft, wavePeriodIndex(dayEnded, draft.firstPlayDay), now, nextDay));
  }

  // 6. Titles.
  events.push(...evaluateTitlesDraft(draft, now, nextDay));
  return events;
}

/**
 * Issue the board for `day` on the draft when there is none or the stored
 * one is for an earlier day. A board for `day` or later is never replaced:
 * when the day index moved backwards (clock set back, westward travel) the
 * current board, its done quests and its rewards survive (errata 7).
 */
export function issueBoardDraft(draft: SaveFile, day: number, now: number): GameEvent[] {
  if (draft.board && draft.board.day >= day) return [];
  draft.board = generateBoard(draft, day);
  // The player's recurring quests ride along, on top of the generated ones.
  placeRecurringDraft(draft, day, now);
  pushLog(draft, now, day, 'boardIssued', `Board issued: ${draft.board.quests.length} quests.`);
  return [{ type: 'boardIssued', day }];
}

/** The vassal the catch-up line greets with: enabled, present, highest loyalty. */
function greeter(draft: SaveFile): string {
  const present = activeVassals(draft).sort((a, b) => b.loyalty - a.loyalty);
  return vassalName(present[0]?.habit ?? 'move');
}

/**
 * Advance the save to `now`: process every missed boundary in order (with
 * the catch-up caps), then make sure today's board exists.
 *
 * At most `CATCHUP_MAX_DAYS` boundaries are replayed per catch-up; after
 * that every period would be quiet (trust is reset at the first settlement
 * and the decay caps are long spent), so the rest of the absence is
 * fast-forwarded: `lastOpenDay` and `week.index` jump to today without a
 * wave record per period (errata 13).
 */
export function processBoundaries(save: SaveFile, now: number, opts?: TimeOptions): ActionResult {
  const draft = clone(save);
  const events: GameEvent[] = [];
  const today = gameDayIndex(now, draft.settings.resetHour, opts?.tz);

  if (today > draft.lastOpenDay) {
    const missed = today - draft.lastOpenDay;
    const caps = newBoundaryCaps();
    const replayUntil = Math.min(today, draft.lastOpenDay + CATCHUP_MAX_DAYS);
    for (let d = draft.lastOpenDay; d < replayUntil; d++) events.push(...processDayBoundaryDraft(draft, d, now, caps));
    if (replayUntil < today) draft.week.index = Math.max(draft.week.index, wavePeriodIndex(today, draft.firstPlayDay));
    draft.lastOpenDay = today;
    if (missed >= 2) {
      events.push({ type: 'catchUp', days: missed });
      pushLog(draft, now, today, 'catchUp', formatLine(pickLine(strings.catchUp, fnv1a(`catchup:${today}`)), { days: missed, name: greeter(draft) }));
    }
  }

  const issued = issueBoardDraft(draft, today, now);
  events.push(...issued);
  // "The Haven notices": once per new board, never on a plain re-open.
  if (issued.length > 0) events.push(...computeProposalsDraft(draft, today));
  return ok(draft, events);
}

/* ------------------------------ Reset hour ------------------------------ */

function shiftInstanceId(id: string, oldDay: number, newDay: number): string {
  const prefix = `${oldDay}-`;
  return id.startsWith(prefix) ? instanceId(newDay, id.slice(prefix.length)) : id;
}

/** A visit stores the quest id it tagged (`{day}-{template}`). Shift that day with every other index. */
function shiftVisitInstanceId(id: string | null, delta: number): string | null {
  if (!id) return id;
  const dash = id.indexOf('-');
  if (dash <= 0) return id;
  const dayText = id.slice(0, dash);
  const day = Number(dayText);
  if (!Number.isInteger(day) || String(day) !== dayText) return id;
  return instanceId(day + delta, id.slice(dash + 1));
}

/**
 * Change `settings.resetHour` without moving the player's "today" (GDD 15.4:
 * the new hour "applies from the next boundary"). Every stored game-day
 * index is in a frame that depends on the reset hour, so they are all
 * shifted by the difference between today's index under the old and the
 * new hour (always -1, 0 or +1). The current board, its done quests and
 * `lastOpenDay` therefore stay "today", nothing is regenerated and no
 * boundary runs early; the next boundary simply happens at the new hour
 * (errata 7). The store must call this instead of writing the setting.
 */
export function changeResetHour(save: SaveFile, newHour: number, now: number, opts?: TimeOptions): ActionResult {
  if (!Number.isInteger(newHour) || newHour < 0 || newHour > 23) return refuse(save, 'reset hour must be a whole hour from 0 to 23');
  const oldHour = save.settings.resetHour;
  if (newHour === oldHour) return ok(save, []);
  const delta = gameDayIndex(now, newHour, opts?.tz) - gameDayIndex(now, oldHour, opts?.tz);
  const draft = clone(save);
  draft.settings.resetHour = newHour;
  if (delta === 0) return ok(draft, []);

  const shift = (d: number | null): number | null => (d === null ? null : d + delta);
  draft.firstPlayDay += delta;
  draft.lastOpenDay += delta;
  if (draft.board) {
    const oldDay = draft.board.day;
    draft.board.day = oldDay + delta;
    for (const q of draft.board.quests) q.instanceId = shiftInstanceId(q.instanceId, oldDay, draft.board.day);
    draft.board.bonusId = shiftInstanceId(draft.board.bonusId, oldDay, draft.board.day);
  }
  for (const h of HABIT_IDS) draft.vassals[h].lastActiveDay = shift(draft.vassals[h].lastActiveDay);
  draft.stats.lastQuestDay = shift(draft.stats.lastQuestDay);
  draft.stats.streakLostOnDay = shift(draft.stats.streakLostOnDay);
  for (const c of draft.combos) c.forgedDay += delta;
  for (const e of draft.log) e.day += delta;
  for (const a of draft.activity) a.day += delta;
  for (const p of draft.proposals) {
    p.createdDay += delta;
    if (p.snoozeUntil !== null) p.snoozeUntil += delta;
  }
  for (const o of draft.map.outposts) {
    o.createdDay += delta;
    o.lastVisitDay = shift(o.lastVisitDay);
    for (const k of Object.keys(o.stateDays) as Array<keyof typeof o.stateDays>) {
      const d = o.stateDays[k];
      if (d !== undefined) o.stateDays[k] = d + delta;
    }
  }
  for (const v of draft.map.visits) {
    v.day += delta;
    v.instanceId = shiftVisitInstanceId(v.instanceId, delta);
  }
  for (const s of draft.map.snapshots) s.day += delta;
  if (draft.map.lastSeen) draft.map.lastSeen.day += delta;
  return ok(draft, []);
}
