/**
 * "What I learned": one note per quest template, saved on the Haven.
 *
 * The note is not part of the board, so a new day does not throw it away.
 * Writing it changes no rewards, streaks or loyalty.
 */
import { clone, ok, refuse } from './draft';
import { TITLE_MAX, resolveTemplate } from './template';
import type { ActionResult, HabitId, QuestNote, SaveFile } from './types';
import { HABIT_IDS } from './types';

export const LEARNED_MAX = 2000;
export const NOTES_MAX = 80;

/** Collapse messy whitespace and keep line breaks. Empty means "no note". */
function withoutControls(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) out += ch;
  }
  return out;
}

export function tidyLearned(text: string): string {
  return withoutControls(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, LEARNED_MAX);
}

function isHabit(value: unknown): value is HabitId {
  return typeof value === 'string' && (HABIT_IDS as readonly string[]).includes(value);
}

/**
 * Read a stored notes array. Drops blanks, unknown habits and duplicate
 * templates (the later, newer entry wins), and keeps the newest `NOTES_MAX`.
 */
export function migrateNotes(raw: unknown): QuestNote[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, QuestNote>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const templateId = typeof row.templateId === 'string' ? row.templateId.trim().slice(0, 80) : '';
    const text = tidyLearned(typeof row.text === 'string' ? row.text : '');
    if (templateId === '' || text === '' || !isHabit(row.habit)) continue;
    const title = typeof row.title === 'string' ? row.title.trim().slice(0, TITLE_MAX) : '';
    const updatedAt = typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0;
    const prev = byId.get(templateId);
    if (prev && prev.updatedAt > updatedAt) continue;
    byId.set(templateId, { templateId, title: title || 'Quest', habit: row.habit, text, updatedAt });
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, NOTES_MAX);
}

/**
 * Save what the player learned on a quest. An empty note removes it.
 * Refuses a template the Haven has never heard of.
 */
export function setQuestLearned(save: SaveFile, templateId: string, text: string, now: number): ActionResult {
  const known = resolveTemplate(save, templateId);
  const existing = save.notes.find((n) => n.templateId === templateId);
  if (!known && !existing) return refuse(save, 'that quest is not in the Haven');
  const clean = tidyLearned(text);
  const draft = clone(save);
  draft.notes = draft.notes.filter((n) => n.templateId !== templateId);
  if (clean.length > 0) {
    draft.notes.unshift({
      templateId,
      title: known?.title ?? existing?.title ?? 'Quest',
      habit: known?.habit ?? existing!.habit,
      text: clean,
      updatedAt: now,
    });
  }
  if (draft.notes.length > NOTES_MAX) draft.notes.length = NOTES_MAX;
  return ok(draft, []);
}
