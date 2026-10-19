/**
 * Custom quests: templates the player authors (by voice or text, see
 * `compose/parse.ts`), put on today's board by hand or by recurrence.
 *
 * They are ordinary quests once on the board: they count for vassal trust,
 * loyalty and utilities, and pay the shipped formula for their tier. What
 * keeps them from out-earning built-ins is `template.maxTier` (a timer is
 * capped by its duration, a check or counter by tier 2), a hard limit of two
 * on any board in addition to the generated ones, and no Bonus contract.
 * Same contract as the rest of the engine: pure, input never mutated,
 * `{ save, events, error? }` out.
 */
import { boardIsCurrent, instanceId, makeBoardQuest } from './board';
import { clone, ok, pushLog, refuse } from './draft';
import { isHabitEnabled, questRewards, type QuestRewards } from './economy';
import { getHabit } from './content';
import { fnv1a } from './rng';
import {
  DESCRIPTION_MAX,
  MAX_DURATION_MIN,
  MAX_TARGET_COUNT,
  MIN_DURATION_MIN,
  TITLE_MAX,
  customToTemplate,
  findCustom,
  isCustomId,
  normalizeRecurrence,
  resolveTier,
  weeklyCount,
  weekdayOf,
} from './template';
import { titleCoinMult, titleLoyaltyFlat, titleXpMult } from './titles';
import { gameDayIndex, type TimeOptions } from './time';
import type { ActionResult, CustomDraft, CustomTemplate, GameEvent, HabitId, QuestKind, Recurrence, SaveFile, Tier, TimeSlot } from './types';
import { HABIT_IDS } from './types';

/** Custom quests allowed on one board, in addition to the generated ones. */
export const MAX_CUSTOM_ON_BOARD = 2;
/** Active (not archived) custom templates a save may hold. */
export const MAX_ACTIVE_CUSTOM = 30;

const TIME_SLOTS: readonly TimeSlot[] = ['any', 'morning', 'afternoon', 'evening'];
const KINDS: readonly QuestKind[] = ['check', 'timer', 'count'];

export interface CustomResult extends ActionResult {
  templateId?: string;
  instanceId?: string;
}

/** A draft after validation: every field present and in range. */
export interface CleanDraft {
  habit: HabitId;
  kind: QuestKind;
  durationMin?: number;
  targetCount?: number;
  title: string;
  description: string;
  tier: Tier;
  recurrence: CustomTemplate['recurrence'];
  pinWeekday?: number;
  timeSlot: TimeSlot;
  source: CustomTemplate['source'];
  /** Outpost that completions tag; undefined when none. */
  outpostId?: string;
}

/* ------------------------------ Validation ------------------------------ */

/** Zero-width characters that whitespace matching misses: invisible in a name, so never part of one. */
const INVISIBLE = new RegExp('[\u200B-\u200D\u2060\uFEFF]', 'g');

function tidy(text: string, max: number): string {
  return text.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/** The form a name is compared in: one Unicode form, no accents, no case, no invisible characters. */
function titleKey(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/** Validate and normalise a draft; the error text is player-facing and lower-case like the other refusals. */
export function cleanDraft(d: CustomDraft): { draft: CleanDraft } | { error: string } {
  if (!(HABIT_IDS as readonly string[]).includes(d.habit)) return { error: 'pick a habit for it' };
  if (!KINDS.includes(d.kind)) return { error: 'pick check, timer or count' };
  const title = tidy(d.title, TITLE_MAX);
  if (title === '') return { error: `give it a name, up to ${TITLE_MAX} characters` };
  if (!TIME_SLOTS.includes(d.timeSlot)) return { error: 'pick a time of day' };
  const recurrence = normalizeRecurrence(d.recurrence);
  if (!recurrence) return { error: 'pick how often it comes back' };

  let durationMin: number | undefined;
  let targetCount: number | undefined;
  if (d.kind === 'timer') {
    const n = Math.round(d.durationMin ?? Number.NaN);
    if (!Number.isFinite(n) || n < MIN_DURATION_MIN || n > MAX_DURATION_MIN) return { error: `a timer runs ${MIN_DURATION_MIN} to ${MAX_DURATION_MIN} minutes` };
    durationMin = n;
  } else if (d.kind === 'count') {
    const n = Math.round(d.targetCount ?? Number.NaN);
    if (!Number.isFinite(n) || n < 1 || n > MAX_TARGET_COUNT) return { error: `a counter goes from 1 to ${MAX_TARGET_COUNT}` };
    targetCount = n;
  }
  const clean: CleanDraft = {
    habit: d.habit,
    kind: d.kind,
    title,
    description: tidy(d.description, DESCRIPTION_MAX),
    tier: resolveTier(d.kind, d.tier, durationMin, targetCount),
    recurrence,
    timeSlot: d.timeSlot,
    source: d.source,
  };
  if (durationMin !== undefined) clean.durationMin = durationMin;
  if (targetCount !== undefined) clean.targetCount = targetCount;
  if (typeof d.outpostId === 'string' && d.outpostId !== '') clean.outpostId = d.outpostId;
  if (recurrence === 'weekly:1' && d.pinWeekday !== undefined && Number.isInteger(d.pinWeekday) && d.pinWeekday >= 0 && d.pinWeekday <= 6) {
    clean.pinWeekday = d.pinWeekday;
  }
  return { draft: clean };
}

/** The editable fields of a stored template, as a draft. */
export function draftOf(c: CustomTemplate): CustomDraft {
  return {
    habit: c.habit,
    kind: c.kind,
    durationMin: c.durationMin,
    targetCount: c.targetCount,
    title: c.title,
    description: c.description,
    tier: c.tier,
    recurrence: c.recurrence,
    pinWeekday: c.pinWeekday,
    timeSlot: c.timeSlot,
    source: c.source,
    outpostId: c.outpostId,
  };
}

/** An outpost a template may default to: on the map and not retired. */
function outpostUsable(save: Pick<SaveFile, 'map'>, id: string | undefined): boolean {
  if (id === undefined) return true;
  const o = save.map.outposts.find((x) => x.id === id);
  return o !== undefined && !o.retired;
}

/* ------------------------------ Queries ------------------------------ */

export function activeCustomTemplates(save: Pick<SaveFile, 'customTemplates'>): CustomTemplate[] {
  return save.customTemplates.filter((c) => c.archivedAt === undefined);
}

/** Custom quests on the current board, whatever their status. */
export function customOnBoardCount(save: Pick<SaveFile, 'board'>): number {
  return save.board?.quests.filter((q) => isCustomId(q.templateId)).length ?? 0;
}

export function customSlotsLeft(save: Pick<SaveFile, 'board'>): number {
  return Math.max(0, MAX_CUSTOM_ON_BOARD - customOnBoardCount(save));
}

/** What a draft would pay if settled now (timed bonus excluded), or null for an invalid draft. */
export function previewCustomRewards(save: SaveFile, draft: CustomDraft): QuestRewards | null {
  const r = cleanDraft(draft);
  if ('error' in r) return null;
  const d = r.draft;
  const t = customToTemplate({
    id: 'c-preview',
    habit: d.habit,
    kind: d.kind,
    title: d.title,
    description: d.description,
    tier: d.tier,
    recurrence: d.recurrence,
    timeSlot: d.timeSlot,
    createdAt: 0,
    source: d.source,
    stats: { issued: 0, done: 0, tried: 0 },
  });
  return questRewards(t, {
    difficulty: save.settings.difficulty,
    bonus: false,
    timedBonus: false,
    titleXpMult: titleXpMult(save, d.habit),
    titleCoinMult: titleCoinMult(save),
    titleLoyaltyFlat: titleLoyaltyFlat(save),
  });
}

/* ------------------------------ Recurrence ------------------------------ */

/**
 * Whether an active template belongs on the board of game day `day`.
 * `weekly:N` spreads N days over the week from a per-template offset
 * (derived from its id, so it needs no history); `weekly:1` with a pinned
 * weekday lands only on that weekday.
 */
export function recurrenceDue(t: { id: string; recurrence: Recurrence; pinWeekday?: number | undefined }, day: number): boolean {
  const wd = weekdayOf(day);
  if (t.recurrence === 'once') return false;
  if (t.recurrence === 'daily') return true;
  if (t.recurrence === 'weekdays') return wd >= 1 && wd <= 5;
  const n = weeklyCount(t.recurrence);
  if (n === null) return false;
  if (n === 1 && t.pinWeekday !== undefined) return wd === t.pinWeekday;
  const offset = fnv1a(t.id) % 7;
  const pos = (wd - offset + 7) % 7;
  for (let i = 0; i < n; i++) if (Math.floor((i * 7) / n) === pos) return true;
  return false;
}

/**
 * Place the recurring templates due on `day` onto the freshly issued board,
 * up to the two-per-board limit. Fairest first: the template issued least so
 * far, then the oldest. Quiet on purpose: the board's own `boardIssued`
 * event is the only signal.
 */
export function placeRecurringDraft(draft: SaveFile, day: number, now: number): void {
  const board = draft.board;
  if (!board || board.day !== day) return;
  let slots = customSlotsLeft(draft);
  if (slots === 0) return;
  const onBoard = new Set(board.quests.map((q) => q.templateId));
  const due = activeCustomTemplates(draft)
    .filter((t) => recurrenceDue(t, day) && !onBoard.has(t.id) && isHabitEnabled(draft, t.habit) && !draft.vassals[t.habit].away)
    .sort((a, b) => a.stats.issued - b.stats.issued || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  for (const t of due) {
    if (slots === 0) break;
    board.quests.push(makeBoardQuest(day, customToTemplate(t)));
    t.stats.issued += 1;
    pushLog(draft, now, day, 'customBoarded', `${t.title} is on the board (your own).`);
    slots -= 1;
  }
}

/* ------------------------------ Actions ------------------------------ */

function uniqueId(save: SaveFile, now: number, d: CleanDraft): string {
  const seed = `${now}:${d.habit}:${d.title}`;
  let id = `c-${fnv1a(seed).toString(16).padStart(8, '0')}`;
  for (let n = 1; findCustom(save, id); n++) id = `c-${fnv1a(`${seed}:${n}`).toString(16).padStart(8, '0')}`;
  return id;
}

function sameTitle(a: string, b: string): boolean {
  return titleKey(a) === titleKey(b);
}

/**
 * Whether an active template of the same habit already carries this title
 * (case, accents, spacing and the way an accent is typed ignored), ignoring `exceptId`: the guard behind "add", "edit" and
 * "restore", and the Compose sheet's live warning. The title is tidied the
 * way `cleanDraft` tidies it.
 */
export function customTitleTaken(save: Pick<SaveFile, 'customTemplates'>, habit: HabitId, title: string, exceptId?: string): boolean {
  const t = tidy(title, TITLE_MAX);
  if (t === '') return false;
  return activeCustomTemplates(save).some((c) => c.id !== exceptId && c.habit === habit && sameTitle(c.title, t));
}

const taken = (title: string): string => `you already have "${title}" in My quests`;

/** Save a new custom template (not yet on the board). */
export function addCustomTemplate(save: SaveFile, now: number, input: CustomDraft): CustomResult {
  const r = cleanDraft(input);
  if ('error' in r) return refuse(save, r.error);
  const d = r.draft;
  if (activeCustomTemplates(save).length >= MAX_ACTIVE_CUSTOM) {
    return refuse(save, `you already keep ${MAX_ACTIVE_CUSTOM} quests of your own; archive one in the Ledger first`);
  }
  if (customTitleTaken(save, d.habit, d.title)) return refuse(save, taken(d.title));
  if (!outpostUsable(save, d.outpostId)) return refuse(save, 'unknown outpost');
  const draft = clone(save);
  const id = uniqueId(draft, now, d);
  const t: CustomTemplate = {
    id,
    habit: d.habit,
    kind: d.kind,
    title: d.title,
    description: d.description,
    tier: d.tier,
    recurrence: d.recurrence,
    timeSlot: d.timeSlot,
    createdAt: now,
    source: d.source,
    stats: { issued: 0, done: 0, tried: 0 },
  };
  if (d.durationMin !== undefined) t.durationMin = d.durationMin;
  if (d.targetCount !== undefined) t.targetCount = d.targetCount;
  if (d.pinWeekday !== undefined) t.pinWeekday = d.pinWeekday;
  if (d.outpostId !== undefined) t.outpostId = d.outpostId;
  draft.customTemplates.push(t);
  pushLog(draft, now, draft.lastOpenDay, 'customSaved', `${t.title} saved in My quests.`);
  return { ...ok(draft, [{ type: 'customSaved', templateId: id }]), templateId: id };
}

/**
 * Today's copy of a template that the player has started on: a timer that runs
 * or holds time, a counter above zero, or a quest marked tried. Its shape is
 * held until it is settled (or the board turns over); an untouched copy and a
 * settled one are not in progress.
 */
export function customCopyInProgress(save: Pick<SaveFile, 'board'>, templateId: string): boolean {
  const q = save.board?.quests.find((x) => x.templateId === templateId);
  if (!q) return false;
  if (q.status === 'tried') return true;
  if (q.status !== 'open') return false;
  return q.count > 0 || (q.timer !== null && (q.timer.startedAt !== null || q.timer.accumulatedMs > 0));
}

/**
 * Edit a custom template: title, description, habit, kind, duration or count,
 * tier, recurrence, pinned weekday, time slot and outpost. The tier follows
 * the effort (and is re-capped by the same rules as a new quest) unless the
 * patch sets it.
 *
 * Edits are for future boards: recurrence, placement and every new copy read
 * the template as it is now. A copy on today's board that is settled keeps
 * its reward snapshot (undo reverts that snapshot), so a change to habit,
 * kind, duration, count or tier goes through; an untouched open copy takes the
 * new shape in place (nothing was paid or started on it); a copy in progress
 * (see `customCopyInProgress`) holds its shape until it is settled, and the
 * change is refused meanwhile. Name, description, time slot, recurrence and
 * outpost never change a payout and always go through. A patch that sets a
 * recurrence without a pinned weekday clears any pin.
 */
export function updateCustomTemplate(
  save: SaveFile,
  now: number,
  templateId: string,
  patch: Partial<Omit<CustomDraft, 'source'>>,
  opts?: TimeOptions,
): CustomResult {
  const current = findCustom(save, templateId);
  if (!current || current.archivedAt !== undefined) return refuse(save, 'that quest is not in My quests');
  const merged: CustomDraft = { ...draftOf(current) };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) (merged as unknown as Record<string, unknown>)[k] = v;
  }
  if (patch.outpostId === null) merged.outpostId = undefined;
  if (patch.tier === undefined && (patch.kind !== undefined || patch.durationMin !== undefined || patch.targetCount !== undefined)) merged.tier = undefined;
  if (merged.kind !== 'timer') merged.durationMin = undefined;
  if (merged.kind !== 'count') merged.targetCount = undefined;
  if (merged.recurrence !== 'weekly:1') merged.pinWeekday = undefined;
  else if (patch.recurrence !== undefined && patch.pinWeekday === undefined) merged.pinWeekday = undefined;
  const r = cleanDraft(merged);
  if ('error' in r) return refuse(save, r.error);
  const d = r.draft;
  if (customTitleTaken(save, d.habit, d.title, templateId)) return refuse(save, taken(d.title));
  if (!outpostUsable(save, d.outpostId)) {
    // An outpost retired since the quest was saved is let go; a newly picked unknown one is refused.
    if (d.outpostId !== current.outpostId) return refuse(save, 'unknown outpost');
    delete d.outpostId;
  }
  const reshaped =
    d.habit !== current.habit || d.kind !== current.kind || d.durationMin !== current.durationMin || d.targetCount !== current.targetCount || d.tier !== current.tier;
  if (reshaped && customCopyInProgress(save, templateId)) {
    return refuse(save, "it is in progress on today's board; change its habit, kind, length or effort once it is settled");
  }
  const copy = save.board?.quests.find((q) => q.templateId === templateId && q.status === 'open');
  if (reshaped && copy && d.habit !== current.habit) {
    if (!isHabitEnabled(save, d.habit)) return refuse(save, 'that habit is switched off in Settings');
    if (save.vassals[d.habit].away) return refuse(save, `${getHabit(d.habit).vassal.name} is away; welcome them back first`);
  }
  const draft = clone(save);
  const t = findCustom(draft, templateId);
  if (!t) return refuse(save, 'that quest is not in My quests');
  // An untouched copy on the board takes the new shape in place; a settled one keeps the shape it was settled with.
  const dq = draft.board?.quests.find((q) => q.templateId === templateId && q.status === 'open');
  if (dq && reshaped) {
    dq.habit = d.habit;
    dq.kind = d.kind;
    dq.count = 0;
    dq.timer = d.kind === 'timer' ? { startedAt: null, accumulatedMs: 0 } : null;
  }
  t.habit = d.habit;
  t.kind = d.kind;
  t.title = d.title;
  t.description = d.description;
  t.tier = d.tier;
  t.recurrence = d.recurrence;
  t.timeSlot = d.timeSlot;
  if (d.durationMin !== undefined) t.durationMin = d.durationMin;
  else delete t.durationMin;
  if (d.targetCount !== undefined) t.targetCount = d.targetCount;
  else delete t.targetCount;
  if (d.pinWeekday !== undefined) t.pinWeekday = d.pinWeekday;
  else delete t.pinWeekday;
  if (d.outpostId !== undefined) t.outpostId = d.outpostId;
  else delete t.outpostId;
  pushLog(draft, now, gameDayIndex(now, draft.settings.resetHour, opts?.tz), 'customUpdated', `${t.title} updated.`);
  return { ...ok(draft, [{ type: 'customUpdated', templateId }]), templateId };
}

/**
 * Stop a custom template from coming back. Its history stays, and a copy
 * that was already worked on today stays on the board; an untouched one is
 * taken off.
 */
export function archiveCustomTemplate(save: SaveFile, now: number, templateId: string, opts?: TimeOptions): CustomResult {
  const current = findCustom(save, templateId);
  if (!current || current.archivedAt !== undefined) return refuse(save, 'that quest is not in My quests');
  const draft = clone(save);
  const t = findCustom(draft, templateId);
  if (!t) return refuse(save, 'that quest is not in My quests');
  t.archivedAt = now;
  const board = draft.board;
  if (board) {
    board.quests = board.quests.filter((q) => !(q.templateId === templateId && q.status === 'open' && (q.timer === null || (q.timer.startedAt === null && q.timer.accumulatedMs === 0))));
  }
  pushLog(draft, now, gameDayIndex(now, draft.settings.resetHour, opts?.tz), 'customArchived', `${t.title} archived.`);
  return { ...ok(draft, [{ type: 'customArchived', templateId }]), templateId };
}

/**
 * Bring an archived template back into My quests: `archivedAt` is cleared and
 * nothing else changes (history, stats and settings stay). It is not put on
 * today's board; a recurring one is placed by the next issue, still under the
 * two-per-board limit, and "Add to today" works as for any template. Refused
 * when it is not archived, when an active quest of the same habit now has its
 * name, or at 30 active quests. An outpost that has since been retired is
 * dropped from it quietly. Events: `customUpdated` (the event union has no
 * separate restore event).
 */
export function restoreCustomTemplate(save: SaveFile, now: number, templateId: string, opts?: TimeOptions): CustomResult {
  const current = findCustom(save, templateId);
  if (!current || current.archivedAt === undefined) return refuse(save, 'that quest is not archived');
  if (activeCustomTemplates(save).length >= MAX_ACTIVE_CUSTOM) {
    return refuse(save, `you already keep ${MAX_ACTIVE_CUSTOM} quests of your own; archive one in the Ledger first`);
  }
  if (customTitleTaken(save, current.habit, current.title)) return refuse(save, taken(current.title));
  const draft = clone(save);
  const t = findCustom(draft, templateId);
  if (!t) return refuse(save, 'that quest is not archived');
  delete t.archivedAt;
  if (!outpostUsable(draft, t.outpostId)) delete t.outpostId;
  pushLog(draft, now, gameDayIndex(now, draft.settings.resetHour, opts?.tz), 'customRestored', `${t.title} restored.`);
  return { ...ok(draft, [{ type: 'customUpdated', templateId }]), templateId };
}

/** Put a saved template on today's board (max two of the player's own per board, never the Bonus). */
export function addCustomQuestToBoard(save: SaveFile, now: number, templateId: string, opts?: TimeOptions): CustomResult {
  const c = findCustom(save, templateId);
  if (!c || c.archivedAt !== undefined) return refuse(save, 'that quest is not in My quests');
  const board = save.board;
  if (!board || !boardIsCurrent(save, now, opts)) return refuse(save, 'there is no board for today yet');
  if (!isHabitEnabled(save, c.habit)) return refuse(save, 'that habit is switched off in Settings');
  if (save.vassals[c.habit].away) return refuse(save, `${getHabit(c.habit).vassal.name} is away; welcome them back first`);
  const id = instanceId(board.day, templateId);
  if (board.quests.some((q) => q.instanceId === id)) return refuse(save, 'it is already on today\'s board');
  if (customOnBoardCount(save) >= MAX_CUSTOM_ON_BOARD) {
    return refuse(save, `two of your own quests are already on today's board; this one can start tomorrow`);
  }
  const draft = clone(save);
  const dt = findCustom(draft, templateId);
  if (!dt || !draft.board) return refuse(save, 'that quest is not in My quests');
  draft.board.quests.push(makeBoardQuest(draft.board.day, customToTemplate(dt)));
  dt.stats.issued += 1;
  pushLog(draft, now, draft.board.day, 'customBoarded', `${dt.title} added to today's board.`);
  const events: GameEvent[] = [{ type: 'customBoarded', instanceId: id }];
  return { ...ok(draft, events), templateId, instanceId: id };
}
