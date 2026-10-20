/** Small pure helpers of the Screen (no DOM): the pad cursor and the feed text. */
import { formatText } from '../contract';
import { COLS, type FeedLine } from './engine';
import type { TDStrings } from './strings';

export type Dir = 'left' | 'right' | 'up' | 'down';

/**
 * The nearest pad strictly in a direction: the smallest `10 * primary + secondary`
 * distance in grid cells (ties: the lowest pad), or `from` when no pad lies that way.
 */
export function nextPad(cells: readonly number[], from: number, dir: Dir): number {
  const c = cells[from];
  if (c === undefined) return 0;
  const fx = c % COLS;
  const fy = Math.floor(c / COLS);
  let best = from;
  let bestScore = Infinity;
  cells.forEach((cell, i) => {
    const dx = (cell % COLS) - fx;
    const dy = Math.floor(cell / COLS) - fy;
    const primary = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    if (primary <= 0) return;
    const secondary = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = 10 * primary + secondary;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** The text of one engine feed line in the player's language. */
export function feedText(line: FeedLine, s: TDStrings): string {
  const template = (s.feed as Record<string, string>)[line.key];
  return template === undefined ? line.key : formatText(template, line.params);
}
