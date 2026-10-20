/**
 * "Ask for a game" (docs/design/ARENA.md 9): the player describes a game they
 * would like, by typing or by voice, and the request is kept in the save. The
 * app sends it nowhere; the engineers read the exports.
 */
import { arenaContent } from '../content';
import { clone, ok, refuse } from '../draft';
import { dayOf, REQUEST_MIN_LENGTH } from './state';
import type { TimeOptions } from '../time';
import type { ActionResult, ArenaRequest, SaveFile } from '../types';

/** Requests already saved on a game day, counted from their time stamps so a changed reset hour cannot shift them. */
export function requestsOn(save: Pick<SaveFile, 'arena' | 'settings'>, day: number, opts?: TimeOptions): number {
  return save.arena.requests.filter((r) => dayOf(save, r.at, opts) === day).length;
}

/** How many more requests the player can send today. */
export function requestsLeft(save: Pick<SaveFile, 'arena' | 'settings'>, now: number, opts?: TimeOptions): number {
  return Math.max(0, arenaContent.requests.perDay - requestsOn(save, dayOf(save, now, opts), opts));
}

/** Tidy what the player wrote: collapse white space, trim, cut at the limit. */
export function cleanRequestText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, arenaContent.requests.textMax).trim();
}

/**
 * Save a request. Refused when it is too short or the day's limit is reached;
 * the oldest requests fall off past `requests.keep`.
 */
export function requestGame(save: SaveFile, now: number, text: string, source: ArenaRequest['source'] = 'text', opts?: TimeOptions): ActionResult {
  const clean = cleanRequestText(text);
  if (clean.length < REQUEST_MIN_LENGTH) return refuse(save, 'request too short');
  const day = dayOf(save, now, opts);
  if (requestsOn(save, day, opts) >= arenaContent.requests.perDay) return refuse(save, 'request limit');
  const draft = clone(save);
  const id = `q${draft.arena.nextSeq}`;
  draft.arena.nextSeq += 1;
  draft.arena.requests.push({ id, at: now, day, text: clean, source: source === 'voice' ? 'voice' : 'text' });
  if (draft.arena.requests.length > arenaContent.requests.keep) draft.arena.requests.splice(0, draft.arena.requests.length - arenaContent.requests.keep);
  return ok(draft, [{ type: 'arenaRequestSaved', requestId: id }]);
}
