/**
 * In-run spaced repetition, lifted from Word Forge so any card game can use
 * it: a missed card returns after a short gap (2 cards), then a longer one
 * (5); a first right answer returns once more after a long gap (8) for a
 * final check; a card is finished after that check, or after `maxShows`.
 *
 * Pure and plain-data: the queue is an array of ids, progress an array of
 * records. Nothing here reads a clock or a random source.
 */

export interface CardProgress {
  id: string;
  /** Times the card was answered. */
  shows: number;
  /** Times it was answered wrong (credit under 0.5). */
  wrongs: number;
  /** A right (or almost) answer already booked the final check. */
  scheduledFinal: boolean;
}

export interface ScheduleGaps {
  /** Cards between a first miss and the card's return. */
  firstMiss: number;
  /** Cards between a later miss and the return. */
  laterMiss: number;
  /** Cards between a first right answer and the final check. */
  right: number;
  /** A card is never shown more than this many times. */
  maxShows: number;
}

/** Word Forge's gaps: miss after 2 then 5, right after 8, four shows at most. */
export const DEFAULT_GAPS: ScheduleGaps = { firstMiss: 2, laterMiss: 5, right: 8, maxShows: 4 };

/** A new queue with `id` inserted after `delay` cards (clamped to the queue). */
export function insertAfter(queue: readonly string[], delay: number, id: string): string[] {
  const i = Math.min(Math.max(0, delay), queue.length);
  return [...queue.slice(0, i), id, ...queue.slice(i)];
}

/** The record of `id`, or a blank one. */
export function progressOf(progress: readonly CardProgress[], id: string): CardProgress {
  return progress.find((p) => p.id === id) ?? { id, shows: 0, wrongs: 0, scheduledFinal: false };
}

export interface ScheduleResult {
  queue: string[];
  progress: CardProgress[];
  /** The updated record of the card just answered. */
  record: CardProgress;
}

/**
 * Book the next show of `id` after an answer worth `credit` (0 wrong, 0.5
 * almost, 1 right): a miss returns soon, a first right answer returns once
 * for the final check, and nothing is booked past `maxShows`. The record of
 * `id` moves to the end of `progress`.
 */
export function schedule(queue: readonly string[], progress: readonly CardProgress[], id: string, credit: number, gaps: ScheduleGaps = DEFAULT_GAPS): ScheduleResult {
  const prev = progressOf(progress, id);
  const missed = credit < 0.5;
  const record: CardProgress = {
    id,
    shows: prev.shows + 1,
    wrongs: missed ? prev.wrongs + 1 : prev.wrongs,
    scheduledFinal: prev.scheduledFinal || !missed,
  };
  let next: string[] = [...queue];
  if (record.shows < gaps.maxShows) {
    if (missed) next = insertAfter(next, record.wrongs <= 1 ? gaps.firstMiss : gaps.laterMiss, id);
    else if (!prev.scheduledFinal) next = insertAfter(next, gaps.right, id);
  }
  return { queue: next, progress: [...progress.filter((p) => p.id !== id), record], record };
}
