/**
 * Resurrection token (GDD 13): once per calendar month, restores one thing
 * lost within the last 14 game days: a quest-day streak, or an away vassal.
 */
import { clone, ok, pushLog, refuse } from './draft';
import { LOYALTY_START, RESURRECTION_WINDOW_DAYS, resurrectionPrice } from './economy';
import { evaluateTitlesDraft } from './titles';
import { currentMonthKey, type TimeOptions } from './time';
import type { ActionResult, GameEvent, HabitId, SaveFile } from './types';
import { HABIT_IDS } from './types';
import { strings } from './content';

export type ResurrectionChoice = { kind: 'streak' } | { kind: 'vassal'; habit: HabitId };

export interface ResurrectionOffer {
  price: number;
  /** False when the token was already used this calendar month. */
  availableThisMonth: boolean;
  affordable: boolean;
  /** Streak restorable: it ended within the window and the player has not rebuilt past it. */
  streak: { length: number; lostOnDay: number } | null;
  /** Away vassals (Strict mode) that can be brought back. */
  vassals: HabitId[];
}

/** What the token could restore right now (UI shows the section only when something applies). */
export function resurrectionOffer(save: SaveFile, now: number, today: number, opts?: TimeOptions): ResurrectionOffer {
  const price = resurrectionPrice(save.player.ring);
  const month = currentMonthKey(now, opts?.tz);
  const s = save.stats;
  const streak =
    s.streakLostOnDay !== null &&
    s.streakLostLength !== null &&
    today - s.streakLostOnDay <= RESURRECTION_WINDOW_DAYS &&
    s.questDayStreak < s.streakLostLength
      ? { length: s.streakLostLength, lostOnDay: s.streakLostOnDay }
      : null;
  const vassals = HABIT_IDS.filter((h) => save.vassals[h].away);
  return {
    price,
    availableThisMonth: save.player.resurrectionMonth !== month,
    affordable: save.player.coins >= price,
    streak,
    vassals,
  };
}

export function canResurrect(save: SaveFile, now: number, today: number, opts?: TimeOptions): boolean {
  const o = resurrectionOffer(save, now, today, opts);
  return o.availableThisMonth && o.affordable && (o.streak !== null || o.vassals.length > 0);
}

/** Buy and apply the token for one choice. */
export function applyResurrection(save: SaveFile, choice: ResurrectionChoice, now: number, today: number, opts?: TimeOptions): ActionResult {
  const offer = resurrectionOffer(save, now, today, opts);
  if (!offer.availableThisMonth) return refuse(save, strings.resurrection.unavailable);
  if (!offer.affordable) return refuse(save, 'not enough settlement');
  if (choice.kind === 'streak' && offer.streak === null) return refuse(save, strings.resurrection.nothingToRestore);
  if (choice.kind === 'vassal' && !offer.vassals.includes(choice.habit)) return refuse(save, strings.resurrection.nothingToRestore);

  const draft = clone(save);
  draft.player.coins -= offer.price;
  draft.player.resurrectionMonth = currentMonthKey(now, opts?.tz);
  draft.stats.resurrectionsUsed += 1;
  const events: GameEvent[] = [];

  if (choice.kind === 'streak' && offer.streak) {
    const s = draft.stats;
    // Back-fill the gap: the lost run plus whatever has been rebuilt since.
    s.questDayStreak = offer.streak.length + s.questDayStreak;
    s.bestQuestDayStreak = Math.max(s.bestQuestDayStreak, s.questDayStreak);
    if (s.lastQuestDay === null || s.lastQuestDay < today - 1) s.lastQuestDay = today - 1;
    s.streakLostOnDay = null;
    s.streakLostLength = null;
    events.push({ type: 'resurrectionUsed', restored: 'streak' });
  } else if (choice.kind === 'vassal') {
    const v = draft.vassals[choice.habit];
    v.away = false;
    v.loyalty = Math.max(v.loyalty, LOYALTY_START);
    v.lastActiveDay = today;
    events.push({ type: 'resurrectionUsed', restored: 'vassal', habit: choice.habit });
  }

  pushLog(draft, now, today, 'resurrection', strings.resurrection.used);
  events.push(...evaluateTitlesDraft(draft, now, today));
  return ok(draft, events);
}
