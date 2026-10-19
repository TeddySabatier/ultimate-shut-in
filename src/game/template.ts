/**
 * Template resolution and effort rules shared by the board, the custom-quest
 * engine and the parser. A board quest names its template by id; ids that
 * start with `c-` live in `save.customTemplates`, everything else in the
 * shipped `quests.json`. Nothing here mutates a save except the one stats
 * helper, which works on a draft like every other `*Draft` function.
 */
import { getQuest, tierDefaults, type QuestTemplate } from './content';
import type { CustomStats, CustomTemplate, QuestKind, Recurrence, SaveFile, Tier } from './types';

export const CUSTOM_ID_PREFIX = 'c-';
export const TITLE_MAX = 40;
export const DESCRIPTION_MAX = 160;
export const MAX_DURATION_MIN = 240;
export const MIN_DURATION_MIN = 1;
export const MAX_TARGET_COUNT = 99;

export function isCustomId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX);
}

/** A custom template as the engine's `QuestTemplate`: it pays exactly what a built-in of the same tier pays. */
export function customToTemplate(c: CustomTemplate): QuestTemplate {
  const d = tierDefaults[c.tier];
  const t: QuestTemplate = {
    id: c.id,
    habit: c.habit,
    title: c.title,
    description: c.description,
    tier: c.tier,
    minRing: 1,
    kind: c.kind,
    baseXp: d.baseXp,
    baseCoins: d.baseCoins,
    tags: ['custom'],
  };
  if (c.kind === 'timer' && c.durationMin !== undefined) t.durationMin = c.durationMin;
  if (c.kind === 'count' && c.targetCount !== undefined) t.targetCount = c.targetCount;
  return t;
}

export function findCustom(save: Pick<SaveFile, 'customTemplates'>, id: string): CustomTemplate | undefined {
  return save.customTemplates.find((c) => c.id === id);
}

/** The template behind a board quest: shipped or custom (archived custom templates still resolve). */
export function resolveTemplate(save: Pick<SaveFile, 'customTemplates'>, id: string): QuestTemplate | undefined {
  if (isCustomId(id)) {
    const c = findCustom(save, id);
    return c ? customToTemplate(c) : undefined;
  }
  return getQuest(id);
}

/* ------------------------------ Effort ------------------------------ */

/**
 * Tier a piece of effort deserves. Timers follow the shipped quests' own
 * ladder (up to 15 min tier 1, up to 30 tier 2, longer tier 3); a check or a
 * counter starts at tier 1 (counters over 5 at tier 2).
 */
export function effortTier(kind: QuestKind, durationMin?: number, targetCount?: number): Tier {
  if (kind === 'timer') {
    const d = durationMin ?? 0;
    return d <= 15 ? 1 : d <= 30 ? 2 : 3;
  }
  if (kind === 'count') return (targetCount ?? 1) <= 5 ? 1 : 2;
  return 1;
}

/**
 * Highest tier a custom quest may claim. A timer is capped by its own
 * duration, so a custom quest never out-earns a built-in of the same
 * effort; a check or counter cannot prove its effort and stops at tier 2.
 */
export function maxTier(kind: QuestKind, durationMin?: number, targetCount?: number): Tier {
  return kind === 'timer' ? effortTier(kind, durationMin, targetCount) : 2;
}

/** The tier a draft ends up with: the manual choice (or the derived one), never above the cap. */
export function resolveTier(kind: QuestKind, manual: Tier | undefined, durationMin?: number, targetCount?: number): Tier {
  const cap = maxTier(kind, durationMin, targetCount);
  const wanted = manual ?? effortTier(kind, durationMin, targetCount);
  return Math.max(1, Math.min(cap, wanted)) as Tier;
}

/* ------------------------------ Weekdays ------------------------------ */

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Weekday of an absolute game-day index: 0 = Sunday .. 6 = Saturday (day 0 was a Thursday). */
export function weekdayOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

/* ------------------------------ Stats ------------------------------ */

/** Add `delta` to one counter of a custom template, on a draft. No-op for shipped templates. */
export function bumpCustomStatsDraft(draft: SaveFile, templateId: string, field: keyof CustomStats, delta: number): void {
  if (!isCustomId(templateId)) return;
  const c = findCustom(draft, templateId);
  if (c) c.stats[field] = Math.max(0, c.stats[field] + delta);
}

/* ------------------------------ Recurrence ------------------------------ */

/** Parse a stored or typed recurrence; `weekly:7` is `daily`. Null when it is not one. */
export function normalizeRecurrence(v: unknown): Recurrence | null {
  if (v === 'once' || v === 'daily' || v === 'weekdays') return v;
  if (typeof v !== 'string') return null;
  const m = /^weekly:(\d)$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  if (n === 7) return 'daily';
  return n >= 1 && n <= 6 ? (`weekly:${n}` as Recurrence) : null;
}

/** N of `weekly:N`, or null for the other recurrences. */
export function weeklyCount(r: Recurrence): number | null {
  const m = /^weekly:(\d)$/.exec(r);
  return m ? Number(m[1]) : null;
}

/** Player-facing recurrence text: "Every day", "Weekdays", "3 times a week", "Every Monday". */
export function recurrenceLabel(r: Recurrence, pinWeekday?: number): string {
  if (r === 'once') return 'Just once';
  if (r === 'daily') return 'Every day';
  if (r === 'weekdays') return 'Weekdays';
  const n = weeklyCount(r) ?? 1;
  if (n === 1) return pinWeekday !== undefined && WEEKDAY_NAMES[pinWeekday] ? `Every ${WEEKDAY_NAMES[pinWeekday]}` : 'Once a week';
  return n === 2 ? 'Twice a week' : `${n} times a week`;
}
