/**
 * "Ask for a game" requests stored locally on the save.
 */
import { clone, ok, refuse } from '../draft';
import { gameDayIndex, type TimeOptions } from '../time';
import { arenaContent } from './content';
import type { ActionResult, SaveFile } from '../types';

function nextRequestId(save: SaveFile, now: number): string {
  return `req-${save.arena.requests.length + 1}-${now}`;
}

export function submitArenaRequest(
  save: SaveFile,
  text: string,
  now: number,
  opts?: TimeOptions & { source?: 'text' | 'voice' },
): ActionResult {
  const trimmed = text.trim().slice(0, arenaContent.requests.textMax);
  if (!trimmed) return refuse(save, 'arena.requestEmpty');
  const draft = clone(save);
  const day = gameDayIndex(now, save.settings.resetHour, opts?.tz);
  const id = nextRequestId(save, now);
  draft.arena.requests.push({ id, text: trimmed, source: opts?.source === 'voice' ? 'voice' : 'text', at: now, day });
  if (draft.arena.requests.length > arenaContent.requests.maxEntries) {
    draft.arena.requests.splice(0, draft.arena.requests.length - arenaContent.requests.maxEntries);
  }
  return ok(draft, [{ type: 'arenaRequestSent', id }]);
}
