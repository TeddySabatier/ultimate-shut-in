/**
 * Bringing away vassals back (GDD 5, 13, 15.4): "Welcome back" in Strict
 * mode, the Resurrection token's vassal branch, and the Strict -> Benevolent
 * switch. Kept apart from `vassals.ts` because a returning vassal may have
 * to refill an empty board, which needs `board.ts`.
 */
import { formatLine, pickLine, strings } from './content';
import { refillEmptyBoardDraft } from './board';
import { clone, ok, pushLog, refuse } from './draft';
import { LOYALTY_START, LOYALTY_WELCOME_GIFT, WELCOME_GIFT_PRICE } from './economy';
import { fnv1a } from './rng';
import { evaluateTitlesDraft } from './titles';
import { vassalName } from './vassals';
import type { ActionResult, Benevolence, GameEvent, HabitId, SaveFile } from './types';
import { HABIT_IDS } from './types';

/**
 * Bring an away vassal back on the draft. `lastActiveDay` becomes `day` so
 * the vassal gets a fresh grace day (errata 17). When the board for `day`
 * is empty because every eligible vassal was away, it is re-issued at once
 * so the player has something to do today (errata 14).
 */
export function returnVassalDraft(draft: SaveFile, habit: HabitId, loyalty: number, now: number, day: number): GameEvent[] {
  const dv = draft.vassals[habit];
  dv.away = false;
  dv.loyalty = loyalty;
  dv.lastActiveDay = day;
  const events: GameEvent[] = [{ type: 'vassalReturned', habit }];
  const line = formatLine(pickLine(strings.vassalReturning, fnv1a(`${habit}:${day}:return`)), { name: vassalName(habit) });
  pushLog(draft, now, day, 'vassalReturned', line);
  events.push(...refillEmptyBoardDraft(draft, day, now));
  return events;
}

/**
 * Welcome an away vassal back (Strict mode). Free; the optional welcome gift
 * costs 30 settlement and returns them at loyalty 70 instead of 50.
 */
export function reRecruitVassal(save: SaveFile, habit: HabitId, now: number, day: number, welcomeGift = false): ActionResult {
  const v = save.vassals[habit];
  if (!v.away) return refuse(save, 'vassal is not away');
  if (welcomeGift && save.player.coins < WELCOME_GIFT_PRICE) return refuse(save, 'not enough settlement for the welcome gift');
  const draft = clone(save);
  if (welcomeGift) draft.player.coins -= WELCOME_GIFT_PRICE;
  draft.stats.reRecruitments += 1;
  const events = returnVassalDraft(draft, habit, welcomeGift ? LOYALTY_WELCOME_GIFT : LOYALTY_START, now, day);
  events.push(...evaluateTitlesDraft(draft, now, day));
  return ok(draft, events);
}

/**
 * Switch the benevolence mode. Leaving Strict for Benevolent welcomes every
 * away vassal back (free, loyalty 50, no re-recruitment counted): Benevolent
 * mode has no "away" state and no Welcome-back button, so they would
 * otherwise be stranded (errata 18). Switching to Strict changes nothing
 * else. The store should call this instead of writing the setting.
 */
export function setBenevolence(save: SaveFile, mode: Benevolence, now: number, day: number): ActionResult {
  if (save.settings.benevolence === mode) return ok(save, []);
  const draft = clone(save);
  draft.settings.benevolence = mode;
  const events: GameEvent[] = [];
  if (mode === 'benevolent') {
    for (const h of HABIT_IDS) {
      if (!draft.vassals[h].away) continue;
      events.push(...returnVassalDraft(draft, h, Math.max(draft.vassals[h].loyalty, LOYALTY_START), now, day));
    }
    if (events.length > 0) events.push(...evaluateTitlesDraft(draft, now, day));
  }
  return ok(draft, events);
}
