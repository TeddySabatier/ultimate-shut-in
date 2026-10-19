/**
 * "The Haven notices": rule-based, on-device proposals (no network, no model).
 *
 * At the day boundary (`processBoundaries`, once the new board is issued) the
 * engine reads the last six weeks of settled days (`save.activity`) and may
 * suggest up to three small changes. Five rules (numbered as in the design
 * doc), evaluated in this priority order, at most one proposal per habit:
 *
 *   1. smaller       a habit was tried but never finished in the last 7 days
 *   3. makeRecurring a custom "once" quest was settled 3 or more times
 *   2. stepUp        a habit was done on 5 or more of the last 7 days
 *   5. pinWeekday    a habit was done on the same weekday 3 weeks running
 *   4. footInDoor    an enabled habit has had nothing done for 14 days
 *
 * Help for a struggling habit first, then what rewards a going one, and the
 * five-minute door-openers last so a long absence never opens with a pile of
 * them ahead of everything else.
 *
 * Proposals never nag: at most three are open, an open one that nobody
 * touches quietly leaves after a week, and a dismissed or accepted one keeps
 * its rule + habit silent for 7 days. Accepting goes through the same
 * functions as the Compose sheet (`custom.ts`).
 */
import { formatLine, getHabit, pickLine, strings } from './content';
import { addCustomQuestToBoard, addCustomTemplate, activeCustomTemplates, updateCustomTemplate, type CustomResult } from './custom';
import { clone, refuse } from './draft';
import { isHabitEnabled } from './economy';
import { fnv1a } from './rng';
import { ACTIVITY_DAYS, MAX_PROPOSAL_RECORDS } from './save';
import {
  TITLE_MAX,
  WEEKDAY_NAMES,
  effortTier,
  recurrenceLabel,
  resolveTemplate,
  resolveTier,
  weekdayOf,
} from './template';
import { gameDayIndex, type TimeOptions } from './time';
import { vassalName } from './vassals';
import type {
  ActivityDay,
  CustomDraft,
  GameEvent,
  HabitId,
  Proposal,
  ProposalAction,
  ProposalRule,
  QuestKind,
  SaveFile,
  Tier,
} from './types';
import { HABIT_IDS } from './types';

export const MAX_VISIBLE_PROPOSALS = 3;
export const SNOOZE_DAYS = 7;
/** An open proposal that nobody answers leaves after this many days. */
export const OPEN_PROPOSAL_DAYS = 7;

/** Rules in priority order. */
export const RULE_ORDER: readonly ProposalRule[] = ['smaller', 'makeRecurring', 'stepUp', 'pinWeekday', 'footInDoor'];

/** A proposal before the merge step gives it an id and a status. */
export interface ProposalCandidate {
  rule: ProposalRule;
  habit: HabitId;
  title: string;
  reason: string;
  action: ProposalAction;
}

/* ------------------------------ Activity ------------------------------ */

/**
 * Archive the board of the day that just ended (done and tried quests only).
 * Undo is same-day, so by the boundary the entries are final.
 */
export function recordActivityDraft(draft: SaveFile, dayEnded: number): void {
  const b = draft.board;
  if (!b || b.day !== dayEnded) return;
  const entries = b.quests
    .filter((q) => q.status === 'done' || q.status === 'tried')
    .map((q) => ({ templateId: q.templateId, habit: q.habit, status: q.status as 'done' | 'tried' }));
  draft.activity = draft.activity.filter((a) => a.day !== dayEnded);
  if (entries.length === 0) return;
  draft.activity.push({ day: dayEnded, entries });
  draft.activity.sort((a, b2) => a.day - b2.day);
  if (draft.activity.length > ACTIVITY_DAYS) draft.activity.splice(0, draft.activity.length - ACTIVITY_DAYS);
}

function daysIn(save: SaveFile, from: number, to: number): ActivityDay[] {
  return save.activity.filter((a) => a.day >= from && a.day <= to);
}

interface Counted {
  id: string;
  n: number;
}

function topTemplates(entries: { templateId: string }[]): Counted[] {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.templateId, (m.get(e.templateId) ?? 0) + 1);
  return [...m.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
}

/* ------------------------------ Drafts ------------------------------ */

/** Cut at a word boundary so that `suffix` still fits in a title. */
function fitTitle(title: string, suffix: string): string {
  const room = TITLE_MAX - suffix.length;
  if (title.length <= room) return `${title}${suffix}`;
  const cut = title.slice(0, room);
  const space = cut.lastIndexOf(' ');
  return `${(space > 8 ? cut.slice(0, space) : cut).trim()}${suffix}`;
}

interface BaseLike {
  habit: HabitId;
  kind: QuestKind;
  title: string;
  description: string;
  tier: Tier;
  durationMin?: number | undefined;
  targetCount?: number | undefined;
}

function roundTo5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

/** Smaller version: tier down, timer halved (min 5), counter halved. Null when nothing can shrink. */
export function smallerDraft(base: BaseLike): CustomDraft | null {
  if (base.title.endsWith(' (Mini)')) return null;
  let durationMin: number | undefined;
  let targetCount: number | undefined;
  if (base.kind === 'timer') durationMin = Math.max(5, Math.round((base.durationMin ?? 10) / 2));
  if (base.kind === 'count') targetCount = Math.max(1, Math.ceil((base.targetCount ?? 2) / 2));
  const tier = resolveTier(base.kind, Math.max(1, base.tier - 1) as Tier, durationMin, targetCount);
  const smaller =
    tier < base.tier ||
    (durationMin !== undefined && durationMin < (base.durationMin ?? 0)) ||
    (targetCount !== undefined && targetCount < (base.targetCount ?? 0));
  if (!smaller) return null;
  // A counter halved down to one is just a check.
  const kind: QuestKind = base.kind === 'count' && targetCount === 1 ? 'check' : base.kind;
  if (kind === 'check') targetCount = undefined;
  return {
    habit: base.habit,
    kind,
    durationMin,
    targetCount,
    title: fitTitle(base.title, ' (Mini)'),
    description: base.description,
    tier,
    recurrence: 'once',
    timeSlot: 'any',
    source: 'proposal',
  };
}

/** Step up: a timer x1.5 (to 5 min, up to 120), a counter x1.5, a check one tier (custom checks stop at 2). */
export function stepUpDraft(base: BaseLike): CustomDraft | null {
  if (base.title.endsWith(' (Plus)')) return null;
  let durationMin: number | undefined;
  let targetCount: number | undefined;
  let wanted: Tier = base.tier;
  if (base.kind === 'timer') {
    durationMin = Math.min(120, roundTo5((base.durationMin ?? 10) * 1.5));
    if (durationMin <= (base.durationMin ?? 0)) return null;
    wanted = Math.max(base.tier, effortTier('timer', durationMin)) as Tier;
  } else if (base.kind === 'count') {
    targetCount = Math.min(99, Math.ceil((base.targetCount ?? 1) * 1.5));
    if (targetCount <= (base.targetCount ?? 0)) return null;
  } else {
    wanted = Math.min(3, base.tier + 1) as Tier;
  }
  const tier = resolveTier(base.kind, wanted, durationMin, targetCount);
  if (base.kind === 'check' && tier <= base.tier) return null;
  return {
    habit: base.habit,
    kind: base.kind,
    durationMin,
    targetCount,
    title: fitTitle(base.title, ' (Plus)'),
    description: base.description,
    tier,
    recurrence: 'once',
    timeSlot: 'any',
    source: 'proposal',
  };
}

function titleTaken(save: SaveFile, habit: HabitId, title: string): boolean {
  return activeCustomTemplates(save).some((c) => c.habit === habit && c.title.toLowerCase() === title.toLowerCase());
}

/* ------------------------------ Copy ------------------------------ */

function pick(pool: readonly string[], key: string, vars: Record<string, string | number>): string {
  return formatLine(pickLine(pool, fnv1a(key)), vars);
}

/* ------------------------------ Rules ------------------------------ */

interface Ctx {
  save: SaveFile;
  today: number;
  habits: HabitId[];
}

function eligibleHabits(save: SaveFile): HabitId[] {
  return HABIT_IDS.filter((h) => isHabitEnabled(save, h) && !save.vassals[h].away);
}

function ruleSmaller(ctx: Ctx, out: ProposalCandidate[]): void {
  const { save, today } = ctx;
  const window = daysIn(save, today - 7, today - 1);
  for (const habit of ctx.habits) {
    const entries = window.flatMap((d) => d.entries).filter((e) => e.habit === habit);
    const tried = entries.filter((e) => e.status === 'tried');
    if (tried.length === 0 || entries.some((e) => e.status === 'done')) continue;
    for (const { id } of topTemplates(tried)) {
      const base = resolveTemplate(save, id);
      const draft = base ? smallerDraft(base) : null;
      if (!draft || titleTaken(save, habit, draft.title)) continue;
      out.push({
        rule: 'smaller',
        habit,
        title: strings.proposals.titles.smaller,
        reason: pick(strings.proposals.reasons.smaller, `smaller:${habit}:${today}`, {
          vassal: vassalName(habit),
          habit: getHabit(habit).label,
          n: tried.length,
          quest: draft.title,
        }),
        action: { type: 'create', draft, addToBoard: true },
      });
      break;
    }
  }
}

function ruleFootInDoor(ctx: Ctx, out: ProposalCandidate[]): void {
  const { save, today } = ctx;
  if (today - save.firstPlayDay < 14) return;
  const window = daysIn(save, today - 14, today - 1);
  for (const habit of ctx.habits) {
    if (window.some((d) => d.entries.some((e) => e.habit === habit && e.status === 'done'))) continue;
    const title = strings.proposals.footInDoor.titles[habit];
    if (titleTaken(save, habit, title)) continue;
    const draft: CustomDraft = {
      habit,
      kind: 'check',
      title,
      description: strings.proposals.footInDoor.description,
      tier: 1,
      recurrence: 'once',
      timeSlot: 'any',
      source: 'proposal',
    };
    out.push({
      rule: 'footInDoor',
      habit,
      title: strings.proposals.titles.footInDoor,
      reason: pick(strings.proposals.reasons.footInDoor, `foot:${habit}:${today}`, { vassal: vassalName(habit), habit: getHabit(habit).label, quest: title }),
      action: { type: 'create', draft, addToBoard: true },
    });
  }
}

function ruleMakeRecurring(ctx: Ctx, out: ProposalCandidate[]): void {
  const { save, today } = ctx;
  const window = daysIn(save, today - 14, today - 1);
  for (const c of activeCustomTemplates(save)) {
    if (c.recurrence !== 'once' || c.stats.done < 3 || !ctx.habits.includes(c.habit)) continue;
    const doneDays = window.filter((d) => d.entries.some((e) => e.templateId === c.id && e.status === 'done')).length;
    const recurrence = doneDays >= 8 ? 'daily' : (`weekly:${Math.min(4, Math.max(2, Math.round(doneDays / 2)))}` as const);
    out.push({
      rule: 'makeRecurring',
      habit: c.habit,
      title: strings.proposals.titles.makeRecurring,
      reason: pick(strings.proposals.reasons.makeRecurring, `rec:${c.id}:${today}`, {
        vassal: vassalName(c.habit),
        habit: getHabit(c.habit).label,
        quest: c.title,
        n: c.stats.done,
        recurrence: recurrenceLabel(recurrence).toLowerCase(),
      }),
      action: { type: 'update', templateId: c.id, patch: { recurrence } },
    });
  }
}

function ruleStepUp(ctx: Ctx, out: ProposalCandidate[]): void {
  const { save, today } = ctx;
  if (today - save.firstPlayDay < 7) return;
  const window = daysIn(save, today - 7, today - 1);
  for (const habit of ctx.habits) {
    const doneDays = window.filter((d) => d.entries.some((e) => e.habit === habit && e.status === 'done')).length;
    if (doneDays < 5) continue;
    const done = window.flatMap((d) => d.entries).filter((e) => e.habit === habit && e.status === 'done');
    for (const { id } of topTemplates(done)) {
      const base = resolveTemplate(save, id);
      const draft = base ? stepUpDraft(base) : null;
      if (!draft || titleTaken(save, habit, draft.title)) continue;
      out.push({
        rule: 'stepUp',
        habit,
        title: strings.proposals.titles.stepUp,
        reason: pick(strings.proposals.reasons.stepUp, `up:${habit}:${today}`, { vassal: vassalName(habit), habit: getHabit(habit).label, n: doneDays, quest: draft.title }),
        action: { type: 'create', draft, addToBoard: true },
      });
      break;
    }
  }
}

function rulePinWeekday(ctx: Ctx, out: ProposalCandidate[]): void {
  const { save, today } = ctx;
  if (today - save.firstPlayDay < 21) return;
  const week = daysIn(save, today - 7, today - 1);
  const lastSeen = (w: number): number => today - 1 - ((weekdayOf(today - 1) - w + 7) % 7);
  for (const habit of ctx.habits) {
    const doneOn = (day: number): boolean => save.activity.some((a) => a.day === day && a.entries.some((e) => e.habit === habit && e.status === 'done'));
    if (week.filter((d) => d.entries.some((e) => e.habit === habit && e.status === 'done')).length >= 5) continue;
    let best: { w: number; score: number } | null = null;
    for (let w = 0; w < 7; w++) {
      const d1 = lastSeen(w);
      if (!(doneOn(d1) && doneOn(d1 - 7) && doneOn(d1 - 14))) continue;
      const score = save.activity.filter((a) => weekdayOf(a.day) === w && doneOn(a.day)).length;
      if (!best || score > best.score) best = { w, score };
    }
    if (!best) continue;
    const w = best.w;
    const d1 = lastSeen(w);
    const onThose = [d1, d1 - 7, d1 - 14].flatMap((day) => save.activity.find((a) => a.day === day)?.entries ?? []).filter((e) => e.habit === habit && e.status === 'done');
    const baseId = topTemplates(onThose)[0]?.id;
    const base = baseId ? resolveTemplate(save, baseId) : undefined;
    if (!baseId || !base) continue;
    const day = WEEKDAY_NAMES[w] ?? 'that day';
    const vars = { vassal: vassalName(habit), habit: getHabit(habit).label, weekday: day, quest: base.title };
    const reason = pick(strings.proposals.reasons.pinWeekday, `pin:${habit}:${today}`, vars);
    const heading = strings.proposals.titles.pinWeekday;
    const custom = save.customTemplates.find((c) => c.id === baseId && c.archivedAt === undefined);
    if (custom) {
      if (custom.recurrence !== 'once') continue;
      out.push({ rule: 'pinWeekday', habit, title: heading, reason, action: { type: 'update', templateId: custom.id, patch: { recurrence: 'weekly:1', pinWeekday: w } } });
    } else {
      if (titleTaken(save, habit, base.title)) continue;
      const draft: CustomDraft = {
        habit,
        kind: base.kind,
        durationMin: base.durationMin,
        targetCount: base.targetCount,
        title: base.title,
        description: base.description,
        tier: base.tier,
        recurrence: 'weekly:1',
        pinWeekday: w,
        timeSlot: 'any',
        source: 'proposal',
      };
      out.push({ rule: 'pinWeekday', habit, title: heading, reason, action: { type: 'create', draft, addToBoard: false } });
    }
  }
}

/**
 * Every proposal the rules would make today, in priority order, one per
 * habit. Pure: no snoozes, no limits (see `computeProposalsDraft`).
 */
export function evaluateProposals(save: SaveFile, today: number): ProposalCandidate[] {
  const ctx: Ctx = { save, today, habits: eligibleHabits(save) };
  const perRule: Record<ProposalRule, ProposalCandidate[]> = { smaller: [], footInDoor: [], makeRecurring: [], stepUp: [], pinWeekday: [] };
  ruleSmaller(ctx, perRule.smaller);
  ruleFootInDoor(ctx, perRule.footInDoor);
  ruleMakeRecurring(ctx, perRule.makeRecurring);
  ruleStepUp(ctx, perRule.stepUp);
  rulePinWeekday(ctx, perRule.pinWeekday);
  const used = new Set<HabitId>();
  const out: ProposalCandidate[] = [];
  for (const rule of RULE_ORDER) {
    for (const c of perRule[rule]) {
      if (used.has(c.habit)) continue;
      used.add(c.habit);
      out.push(c);
    }
  }
  return out;
}

/* ------------------------------ Merge ------------------------------ */

const keyOf = (p: { rule: ProposalRule; habit: HabitId }): string => `${p.rule}:${p.habit}`;

/**
 * Refresh `draft.proposals` for game day `today`: keep the open ones that
 * still hold, retire the ones that waited a week, drop the ones whose
 * condition is gone, and add new ones up to three open in total, never for a
 * rule + habit that is still snoozed.
 */
export function computeProposalsDraft(draft: SaveFile, today: number): GameEvent[] {
  const candidates = evaluateProposals(draft, today);
  const byKey = new Map(candidates.map((c) => [keyOf(c), c] as const));
  const kept: Proposal[] = draft.proposals.filter((p) => p.status !== 'open' && p.snoozeUntil !== null && p.snoozeUntil > today);
  const open: Proposal[] = [];
  for (const p of draft.proposals) {
    if (p.status !== 'open') continue;
    if (today - p.createdDay >= OPEN_PROPOSAL_DAYS) {
      kept.push({ ...p, status: 'dismissed', snoozeUntil: today + SNOOZE_DAYS });
      continue;
    }
    if (byKey.has(keyOf(p))) open.push(p);
  }
  const quiet = new Set(kept.map(keyOf));
  let added = 0;
  for (const c of candidates) {
    if (open.length >= MAX_VISIBLE_PROPOSALS) break;
    const k = keyOf(c);
    if (quiet.has(k) || open.some((p) => keyOf(p) === k)) continue;
    open.push({
      id: `p-${fnv1a(`${k}:${today}`).toString(16).padStart(8, '0')}`,
      rule: c.rule,
      habit: c.habit,
      status: 'open',
      createdDay: today,
      snoozeUntil: null,
      title: c.title,
      reason: c.reason,
      action: c.action,
    });
    added += 1;
  }
  draft.proposals = [...kept, ...open].slice(-MAX_PROPOSAL_RECORDS);
  return added > 0 ? [{ type: 'proposalsIssued', count: added }] : [];
}

/* ------------------------------ Answers ------------------------------ */

export function openProposals(save: Pick<SaveFile, 'proposals'>): Proposal[] {
  return save.proposals.filter((p) => p.status === 'open');
}

function gameToday(save: SaveFile, now: number, opts?: TimeOptions): number {
  return gameDayIndex(now, save.settings.resetHour, opts?.tz);
}

/** "Not now": the rule + habit stays quiet for 7 days. */
export function dismissProposal(save: SaveFile, now: number, id: string, opts?: TimeOptions): CustomResult {
  const p = save.proposals.find((x) => x.id === id && x.status === 'open');
  if (!p) return refuse(save, 'that suggestion is no longer open');
  const draft = clone(save);
  const dp = draft.proposals.find((x) => x.id === id);
  if (dp) {
    dp.status = 'dismissed';
    dp.snoozeUntil = gameToday(save, now, opts) + SNOOZE_DAYS;
  }
  return { save: draft, events: [{ type: 'proposalResolved', id, accepted: false }] };
}

/**
 * Accept: create (and usually board) or update a custom template through the
 * same functions as the Compose sheet. If the board is full or the habit is
 * off, a created template is still saved and starts tomorrow.
 */
export function acceptProposal(save: SaveFile, now: number, id: string, opts?: TimeOptions): CustomResult {
  const p = save.proposals.find((x) => x.id === id && x.status === 'open');
  if (!p) return refuse(save, 'that suggestion is no longer open');
  let result: CustomResult;
  if (p.action.type === 'create') {
    const created = addCustomTemplate(save, now, p.action.draft);
    if (created.error !== undefined || created.templateId === undefined) return created;
    result = created;
    if (p.action.addToBoard) {
      const boarded = addCustomQuestToBoard(created.save, now, created.templateId, opts);
      if (boarded.error === undefined) result = { ...boarded, events: [...created.events, ...boarded.events], templateId: created.templateId };
    }
  } else {
    result = updateCustomTemplate(save, now, p.action.templateId, p.action.patch, opts);
    if (result.error !== undefined) return result;
  }
  const out = clone(result.save);
  const op = out.proposals.find((x) => x.id === id);
  if (op) {
    op.status = 'accepted';
    op.snoozeUntil = gameToday(save, now, opts) + SNOOZE_DAYS;
  }
  return { ...result, save: out, events: [...result.events, { type: 'proposalResolved', id, accepted: true }] };
}
