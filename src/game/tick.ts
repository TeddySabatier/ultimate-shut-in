/**
 * `processBoundaries` is the single entry point the UI calls on app open and
 * on every foreground event (GDD 6.8, 6.9). It advances missed day
 * boundaries one at a time with the catch-up caps, settles completed wave
 * periods, issues today's board when missing and bumps `lastOpenDay`.
 */
import { formatLine, pickLine, strings } from './content';
import { generateBoard } from './board';
import { clone, ok, pushLog } from './draft';
import { LOYALTY_CATCHUP_CAP_DAYS, STREAK_LOSS_MIN_LENGTH, UTILITY_CATCHUP_CAP_DAYS } from './economy';
import { fnv1a } from './rng';
import { evaluateTitlesDraft } from './titles';
import { gameDayIndex, isWaveBoundary, wavePeriodIndex, type TimeOptions } from './time';
import { decayUtilitiesDraft } from './utilities';
import { decayLoyaltyDraft } from './vassals';
import { settleWaveDraft } from './wave';
import type { ActionResult, GameEvent, HabitId, SaveFile, UtilityId } from './types';

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

/** Issue the board for `day` on the draft if it is missing or stale. */
export function issueBoardDraft(draft: SaveFile, day: number, now: number): GameEvent[] {
  if (draft.board && draft.board.day === day) return [];
  draft.board = generateBoard(draft, day);
  pushLog(draft, now, day, 'boardIssued', `Board issued: ${draft.board.quests.length} quests.`);
  return [{ type: 'boardIssued', day }];
}

/**
 * Advance the save to `now`: process every missed boundary in order (with
 * the catch-up caps), then make sure today's board exists.
 */
export function processBoundaries(save: SaveFile, now: number, opts?: TimeOptions): ActionResult {
  const draft = clone(save);
  const events: GameEvent[] = [];
  const today = gameDayIndex(now, draft.settings.resetHour, opts?.tz);

  if (today > draft.lastOpenDay) {
    const missed = today - draft.lastOpenDay;
    const caps = newBoundaryCaps();
    for (let d = draft.lastOpenDay; d < today; d++) events.push(...processDayBoundaryDraft(draft, d, now, caps));
    draft.lastOpenDay = today;
    if (missed >= 2) {
      events.push({ type: 'catchUp', days: missed });
      pushLog(draft, now, today, 'catchUp', formatLine(pickLine(strings.catchUp, fnv1a(`catchup:${today}`)), { days: missed, name: 'Pell' }));
    }
  }

  events.push(...issueBoardDraft(draft, today, now));
  return ok(draft, events);
}
