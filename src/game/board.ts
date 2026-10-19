/**
 * Board generation (GDD 6.3) and quest actions (GDD 6.5-6.7).
 *
 * All actions take a SaveFile and return a new one plus events. Quest
 * bookkeeping is attributed to the board's own day; undo additionally
 * requires that day to still be the current game day.
 */
import { getQuest, quests as questDefs, type QuestTemplate } from './content';
import { clone, ok, pushLog, refuse } from './draft';
import {
  DIFFICULTY,
  MAX_COMBO_SLOTS,
  addPlayerXpDraft,
  addVassalXpDraft,
  isHabitEnabled,
  questRewards,
  recomputeRingDraft,
  removePlayerXpDraft,
  removeVassalXpDraft,
  rerollPrice,
} from './economy';
import { fnv1a, mulberry32, rngInt, rngWeightedIndex, type Rng } from './rng';
import { forgeCombosDraft, unforgeBrokenCombosDraft } from './combos';
import { evaluateTitlesDraft, titleCoinMult, titleLoyaltyFlat, titleXpMult } from './titles';
import { bumpCustomStatsDraft, isCustomId, resolveTemplate } from './template';
import { gameDayIndex, type TimeOptions } from './time';
import { restoreUtilityDraft, revertUtilityDraft } from './utilities';
import { gainLoyaltyDraft, markActiveDraft, revertLoyaltyDraft } from './vassals';
import type { ActionResult, Board, BoardQuest, GameEvent, HabitId, SaveFile, Tier } from './types';
import { HABIT_IDS } from './types';

/* ------------------------------ Generation ------------------------------ */

export function boardSeed(firstPlayDay: number, day: number, name: string): number {
  return fnv1a(`${firstPlayDay}:${day}:${name}`);
}

export function instanceId(day: number, templateId: string): string {
  return `${day}-${templateId}`;
}

export function makeBoardQuest(day: number, t: QuestTemplate): BoardQuest {
  return {
    instanceId: instanceId(day, t.id),
    templateId: t.id,
    habit: t.habit,
    kind: t.kind,
    status: 'open',
    count: 0,
    timer: t.kind === 'timer' ? { startedAt: null, accumulatedMs: 0 } : null,
    timedBonus: false,
    rewards: null,
  };
}

/** Templates eligible for the player today, grouped by habit (GDD 6.3 step 2). */
export function eligiblePool(save: SaveFile, day: number): Map<HabitId, QuestTemplate[]> {
  const yesterday = save.board && save.board.day === day - 1 ? new Set(save.board.quests.map((q) => q.templateId)) : new Set<string>();
  const pool = new Map<HabitId, QuestTemplate[]>();
  for (const h of HABIT_IDS) {
    if (!isHabitEnabled(save, h) || save.vassals[h].away) continue;
    const all = questDefs.filter((q) => q.habit === h && q.minRing <= save.player.ring);
    if (all.length === 0) continue;
    const fresh = all.filter((q) => !yesterday.has(q.id));
    pool.set(h, fresh.length > 0 ? fresh : all);
  }
  return pool;
}

function drawTier(rng: Rng, weights: readonly [number, number, number]): Tier {
  return (rngWeightedIndex(rng, weights) + 1) as Tier;
}

/** Nearest available tier: exact, then lower tiers, then higher. */
export function fallbackTier(wanted: Tier, available: ReadonlySet<Tier>): Tier | null {
  if (available.has(wanted)) return wanted;
  for (let t = wanted - 1; t >= 1; t--) if (available.has(t as Tier)) return t as Tier;
  for (let t = wanted + 1; t <= 3; t++) if (available.has(t as Tier)) return t as Tier;
  return null;
}

function pickTemplate(rng: Rng, habitPool: QuestTemplate[], wanted: Tier, taken: ReadonlySet<string>): QuestTemplate | null {
  const open = habitPool.filter((q) => !taken.has(q.id));
  const tiers = new Set<Tier>(open.map((q) => q.tier));
  const tier = fallbackTier(wanted, tiers);
  if (tier === null) return null;
  const candidates = open.filter((q) => q.tier === tier);
  return candidates[rngInt(rng, candidates.length)] ?? null;
}

/**
 * Bonus contract: highest tier, then highest baseXp, then first drawn.
 * Custom quests never take it: `getQuest` only knows the shipped templates,
 * so a `c-` quest is skipped here on purpose (docs/design/CUSTOM-QUESTS.md).
 */
export function chooseBonus(questsOnBoard: readonly BoardQuest[]): string {
  let best: BoardQuest | null = null;
  let bestT: QuestTemplate | null = null;
  for (const q of questsOnBoard) {
    const t = getQuest(q.templateId);
    if (!t) continue;
    if (!best || !bestT || t.tier > bestT.tier || (t.tier === bestT.tier && t.baseXp > bestT.baseXp)) {
      best = q;
      bestT = t;
    }
  }
  return best?.instanceId ?? '';
}

/**
 * Generate the board for `day` deterministically from the save (GDD 6.3).
 * `seed` defaults to the GDD seed for the current name; pass a stored
 * `board.seed` to replay a day issued under an earlier name.
 */
export function generateBoard(save: SaveFile, day: number, seed: number = boardSeed(save.firstPlayDay, day, save.player.name)): Board {
  const rng = mulberry32(seed);
  const table = DIFFICULTY[save.settings.difficulty];
  const pool = eligiblePool(save, day);
  const habitsEligible = [...pool.keys()];

  // Step 3: habit weights, without replacement first, then with replacement capped at 2.
  const slotsWanted = Math.min(table.questsPerDay, habitsEligible.length * MAX_COMBO_SLOTS);
  const slotHabits: HabitId[] = [];
  const counts = new Map<HabitId, number>();
  const weightOf = (h: HabitId): number => 100 - save.vassals[h].loyalty + 20;
  let remaining = [...habitsEligible];
  while (slotHabits.length < slotsWanted) {
    const candidates = remaining.length > 0 ? remaining : habitsEligible.filter((h) => (counts.get(h) ?? 0) < MAX_COMBO_SLOTS);
    if (candidates.length === 0) break;
    const idx = rngWeightedIndex(
      rng,
      candidates.map((h) => weightOf(h)),
    );
    const h = candidates[idx];
    if (h === undefined) break;
    slotHabits.push(h);
    counts.set(h, (counts.get(h) ?? 0) + 1);
    remaining = remaining.filter((x) => x !== h);
  }

  // Steps 4-5: tier and template per slot.
  const questsOnBoard: BoardQuest[] = [];
  const taken = new Set<string>();
  for (const h of slotHabits) {
    const wanted = drawTier(rng, table.tierWeights);
    const habitPool = pool.get(h) ?? [];
    const t = pickTemplate(rng, habitPool, wanted, taken);
    if (!t) continue;
    taken.add(t.id);
    questsOnBoard.push(makeBoardQuest(day, t));
  }

  return { day, seed, quests: questsOnBoard, bonusId: chooseBonus(questsOnBoard), rerolledToday: false };
}

/**
 * Re-issue the board for `day` on the draft when it is empty (every eligible
 * vassal was away) and a vassal has just returned (errata 14). Uses the
 * stored seed so the board is the one the day would have had.
 */
export function refillEmptyBoardDraft(draft: SaveFile, day: number, now: number): GameEvent[] {
  const b = draft.board;
  if (!b || b.day !== day || b.quests.length > 0) return [];
  const board = generateBoard(draft, day, b.seed);
  if (board.quests.length === 0) return [];
  // The player's own quests on the empty board come along; nothing they added is lost.
  board.quests.push(...b.quests.filter((q) => isCustomId(q.templateId)));
  draft.board = board;
  pushLog(draft, now, day, 'boardIssued', `Board issued: ${board.quests.length} quests.`);
  return [{ type: 'boardIssued', day }];
}

/* ------------------------------ Helpers ------------------------------ */

function findQuest(save: SaveFile, id: string): BoardQuest | undefined {
  return save.board?.quests.find((q) => q.instanceId === id);
}

function stopRunningTimers(draft: SaveFile, now: number, except?: string): void {
  if (!draft.board) return;
  for (const q of draft.board.quests) {
    if (q.instanceId === except || !q.timer || q.timer.startedAt === null) continue;
    q.timer.accumulatedMs += Math.max(0, now - q.timer.startedAt);
    q.timer.startedAt = null;
  }
}

export function timerElapsedMs(q: BoardQuest, now: number): number {
  if (!q.timer) return 0;
  return q.timer.accumulatedMs + (q.timer.startedAt === null ? 0 : Math.max(0, now - q.timer.startedAt));
}

function currentDay(save: SaveFile, now: number, opts?: TimeOptions): number {
  return gameDayIndex(now, save.settings.resetHour, opts?.tz);
}

/**
 * Common refusals for quest actions: the quest must be on the board and its
 * habit enabled. A disabled habit's vassal and utility are frozen (GDD 15.4),
 * so its quests cannot be acted on (errata 11).
 */
function actionable(save: SaveFile, id: string): { q?: BoardQuest; error?: string } {
  const q = findQuest(save, id);
  if (!q) return { error: 'quest not on board' };
  if (!isHabitEnabled(save, q.habit)) return { q, error: 'habit is disabled' };
  return { q };
}

/**
 * The board is "today's" when it was issued for the current game day. When
 * the day index moved backwards (clock set back, westward travel) the board
 * for `lastOpenDay` still counts as today's rather than being settled.
 */
export function boardIsCurrent(save: SaveFile, now: number, opts?: TimeOptions): boolean {
  if (!save.board) return false;
  const today = currentDay(save, now, opts);
  return save.board.day === today || (today < save.board.day && save.board.day === save.lastOpenDay);
}

/* ------------------------------ Timer ------------------------------ */

/** Start (or resume) a quest timer; any other running timer is paused. */
export function startTimer(save: SaveFile, id: string, now: number): ActionResult {
  const { q, error } = actionable(save, id);
  if (!q || error) return refuse(save, error ?? 'quest not on board');
  if (q.kind !== 'timer' || !q.timer) return refuse(save, 'quest has no timer');
  if (q.status === 'done') return refuse(save, 'quest already done');
  if (q.timer.startedAt !== null) return ok(save, []);
  const draft = clone(save);
  stopRunningTimers(draft, now);
  const dq = findQuest(draft, id);
  if (dq?.timer) dq.timer.startedAt = now;
  return ok(draft, []);
}

/** Pause a running timer, banking the elapsed segment. */
export function pauseTimer(save: SaveFile, id: string, now: number): ActionResult {
  const q = findQuest(save, id);
  if (!q) return refuse(save, 'quest not on board');
  if (q.kind !== 'timer' || !q.timer) return refuse(save, 'quest has no timer');
  if (q.timer.startedAt === null) return ok(save, []);
  const draft = clone(save);
  const dq = findQuest(draft, id);
  if (dq?.timer && dq.timer.startedAt !== null) {
    dq.timer.accumulatedMs += Math.max(0, now - dq.timer.startedAt);
    dq.timer.startedAt = null;
  }
  return ok(draft, []);
}

/* ------------------------------ Count ------------------------------ */

/**
 * Adjust a count quest by `delta`. Reaching the target auto-completes;
 * stepping below the target after completion undoes it (GDD 6.6).
 */
export function incrementCount(save: SaveFile, id: string, delta: number, now: number, opts?: TimeOptions): ActionResult {
  const { q, error } = actionable(save, id);
  if (!q || error) return refuse(save, error ?? 'quest not on board');
  if (q.kind !== 'count') return refuse(save, 'quest is not a counter');
  const t = resolveTemplate(save, q.templateId);
  const target = t?.targetCount ?? 1;
  const nextCount = Math.max(0, q.count + delta);
  if (q.status === 'done') {
    // Same-day rule as undo (GDD 6.7): a settled day's counter is read-only.
    if (!boardIsCurrent(save, now, opts)) return refuse(save, 'the day is settled; undo is same-day only');
    if (nextCount >= target) {
      const draft = clone(save);
      const dq = findQuest(draft, id);
      if (dq) dq.count = nextCount;
      return ok(draft, []);
    }
    const undone = undoQuest(save, id, now, opts);
    if (undone.error) return undone;
    const dq = findQuest(undone.save, id);
    if (dq) dq.count = nextCount;
    return undone;
  }
  const draft = clone(save);
  const dq = findQuest(draft, id);
  if (dq) dq.count = nextCount;
  if (nextCount >= target) return completeQuestOn(draft, id, now);
  return ok(draft, []);
}

/* ------------------------------ Complete ------------------------------ */

/** Mark a quest done: rewards, snapshot, vassal, utility, stats, combos, titles. */
export function completeQuest(save: SaveFile, id: string, now: number): ActionResult {
  const { q, error } = actionable(save, id);
  if (!q || error) return refuse(save, error ?? 'quest not on board');
  if (q.status === 'done') return refuse(save, 'quest already done');
  return completeQuestOn(clone(save), id, now);
}

function completeQuestOn(draft: SaveFile, id: string, now: number): ActionResult {
  const board = draft.board;
  const q = findQuest(draft, id);
  const t = q ? resolveTemplate(draft, q.templateId) : undefined;
  if (!board || !q || !t) return refuse(draft, 'quest not on board');
  const wasTried = q.status === 'tried';
  const day = board.day;
  const events: GameEvent[] = [];

  // Timer: stop it and decide the timed bonus.
  if (q.timer) {
    if (q.timer.startedAt !== null) {
      q.timer.accumulatedMs += Math.max(0, now - q.timer.startedAt);
      q.timer.startedAt = null;
    }
    const needed = (t.durationMin ?? 0) * 60_000;
    q.timedBonus = needed > 0 && q.timer.accumulatedMs >= needed;
  }
  if (q.kind === 'count' && t.targetCount !== undefined && q.count < t.targetCount) q.count = t.targetCount;

  // Rewards (GDD 6.4).
  const rewards = questRewards(t, {
    difficulty: draft.settings.difficulty,
    bonus: board.bonusId === q.instanceId,
    timedBonus: q.timedBonus,
    titleXpMult: titleXpMult(draft, q.habit),
    titleCoinMult: titleCoinMult(draft),
    titleLoyaltyFlat: titleLoyaltyFlat(draft),
  });
  const vassal = draft.vassals[q.habit];
  const loyaltyApplied = gainLoyaltyDraft(vassal, rewards.loyalty);
  const utility = restoreUtilityDraft(draft, q.habit, t.tier);
  q.rewards = { xp: rewards.xp, coins: rewards.coins, dp: rewards.dp, loyalty: loyaltyApplied, utility: utility.applied };
  q.status = 'done';
  bumpCustomStatsDraft(draft, q.templateId, 'done', 1);
  if (wasTried) bumpCustomStatsDraft(draft, q.templateId, 'tried', -1);

  events.push(...addPlayerXpDraft(draft, rewards.xp));
  draft.player.coins += rewards.coins;
  draft.player.domainPoints += rewards.dp;
  events.push(...recomputeRingDraft(draft));
  events.push(...addVassalXpDraft(vassal, rewards.xp));
  vassal.lifetimeQuests += 1;
  markActiveDraft(vassal, day);
  events.push(...utility.events);

  // Stats and quest-day streak.
  const s = draft.stats;
  s.questsTotal += 1;
  s.questsByHabit[q.habit] = (s.questsByHabit[q.habit] ?? 0) + 1;
  if (s.lastQuestDay !== day) {
    s.questDayStreak = s.lastQuestDay === day - 1 ? s.questDayStreak + 1 : 1;
    s.bestQuestDayStreak = Math.max(s.bestQuestDayStreak, s.questDayStreak);
    s.questDaysTotal += 1;
    s.lastQuestDay = day;
  }

  events.unshift({ type: 'questDone', instanceId: q.instanceId, habit: q.habit, rewards: q.rewards, timedBonus: q.timedBonus });
  pushLog(draft, now, day, 'questDone', `${t.title}: +${rewards.xp} XP, +${rewards.coins} settlement, +${rewards.dp} DP.`);
  events.push(...forgeCombosDraft(draft, day, now));
  events.push(...evaluateTitlesDraft(draft, now, day));
  return ok(draft, events);
}

/* ------------------------------ Tried ------------------------------ */

/** Mark an open quest as attempted: counts for trust and holds loyalty, nothing else. */
export function markTried(save: SaveFile, id: string, now: number): ActionResult {
  const { q, error } = actionable(save, id);
  if (!q || error || !save.board) return refuse(save, error ?? 'quest not on board');
  if (q.status !== 'open') return refuse(save, 'quest is not open');
  const draft = clone(save);
  const dq = findQuest(draft, id);
  if (!dq) return refuse(save, 'quest not on board');
  dq.status = 'tried';
  bumpCustomStatsDraft(draft, dq.templateId, 'tried', 1);
  markActiveDraft(draft.vassals[dq.habit], save.board.day);
  pushLog(draft, now, save.board.day, 'questTried', `${resolveTemplate(draft, dq.templateId)?.title ?? dq.templateId}: attempted.`);
  return ok(draft, [{ type: 'questTried', instanceId: id, habit: dq.habit }]);
}

/* ------------------------------ Undo ------------------------------ */

/** Revert a completion exactly, same game day only (GDD 6.7). Titles stay. */
export function undoQuest(save: SaveFile, id: string, now: number, opts?: TimeOptions): ActionResult {
  const q = findQuest(save, id);
  if (!q || !save.board) return refuse(save, 'quest not on board');
  if (q.status !== 'done' || !q.rewards) return refuse(save, 'quest is not done');
  if (!boardIsCurrent(save, now, opts)) return refuse(save, 'the day is settled; undo is same-day only');
  const draft = clone(save);
  const dq = findQuest(draft, id);
  if (!dq || !dq.rewards) return refuse(save, 'quest is not done');
  const day = draft.board?.day ?? save.board.day;
  const r = dq.rewards;
  const vassal = draft.vassals[dq.habit];

  removePlayerXpDraft(draft, r.xp);
  draft.player.coins = Math.max(0, draft.player.coins - r.coins);
  draft.player.domainPoints = Math.max(0, draft.player.domainPoints - r.dp);
  recomputeRingDraft(draft); // DP is reverted; the ring is sticky and no overlay is re-shown (errata 15)
  removeVassalXpDraft(vassal, r.xp);
  vassal.lifetimeQuests = Math.max(0, vassal.lifetimeQuests - 1);
  revertLoyaltyDraft(vassal, r.loyalty);
  revertUtilityDraft(draft, dq.habit, r.utility);

  const s = draft.stats;
  s.questsTotal = Math.max(0, s.questsTotal - 1);
  s.questsByHabit[dq.habit] = Math.max(0, (s.questsByHabit[dq.habit] ?? 0) - 1);

  dq.status = 'open';
  dq.rewards = null;
  dq.timedBonus = false;
  bumpCustomStatsDraft(draft, dq.templateId, 'done', -1);
  const t = resolveTemplate(draft, dq.templateId);
  if (dq.kind === 'count' && t?.targetCount !== undefined) dq.count = Math.min(dq.count, t.targetCount - 1);

  const stillDoneToday = draft.board?.quests.some((x) => x.status === 'done') ?? false;
  if (!stillDoneToday && s.lastQuestDay === day) {
    s.questDaysTotal = Math.max(0, s.questDaysTotal - 1);
    s.questDayStreak = Math.max(0, s.questDayStreak - 1);
    s.lastQuestDay = s.questDayStreak > 0 ? day - 1 : null;
  }

  const events: GameEvent[] = [{ type: 'questUndone', instanceId: id, habit: dq.habit }];
  events.push(...unforgeBrokenCombosDraft(draft, day));
  pushLog(draft, now, day, 'questUndone', `${t?.title ?? dq.templateId}: entry reverted.`);
  return ok(draft, events);
}

/* ------------------------------ Reroll ------------------------------ */

/** Swap one open quest for another of the same habit and tier, once per day, for settlement. */
export function rerollQuest(save: SaveFile, id: string, now: number): ActionResult {
  const board = save.board;
  const { q, error } = actionable(save, id);
  if (!board || !q || error) return refuse(save, error ?? 'quest not on board');
  if (board.rerolledToday) return refuse(save, 'already swapped a quest today');
  if (q.status !== 'open') return refuse(save, 'only open quests can be swapped');
  const price = rerollPrice(save.player.ring);
  if (save.player.coins < price) return refuse(save, 'not enough settlement');
  if (isCustomId(q.templateId)) return refuse(save, 'your own quests are not swapped; archive it in the Ledger instead');
  const t = getQuest(q.templateId);
  if (!t) return refuse(save, 'unknown template');
  const taken = new Set(board.quests.map((x) => x.templateId));
  const habitPool = questDefs.filter((x) => x.habit === q.habit && x.minRing <= save.player.ring && !taken.has(x.id));
  if (habitPool.length === 0) return refuse(save, 'no replacement available');
  const sameTier = habitPool.filter((x) => x.tier === t.tier);
  const candidates = sameTier.length > 0 ? sameTier : habitPool;
  const rng = mulberry32(fnv1a(`${board.seed}:reroll:${id}`));
  const replacement = candidates[rngInt(rng, candidates.length)];
  if (!replacement) return refuse(save, 'no replacement available');

  const draft = clone(save);
  const db = draft.board;
  if (!db) return refuse(save, 'quest not on board');
  const idx = db.quests.findIndex((x) => x.instanceId === id);
  const fresh = makeBoardQuest(db.day, replacement);
  db.quests.splice(idx, 1, fresh);
  db.rerolledToday = true;
  draft.player.coins -= price;
  // The bonus flag only moves when the bonus itself was swapped, and only onto
  // an open quest (the replacement is always one), never onto a done quest
  // whose rewards were already paid at x1 (errata 9).
  if (db.bonusId === id) {
    const recomputed = chooseBonus(db.quests.filter((x) => x.status === 'open'));
    if (recomputed !== '') db.bonusId = recomputed;
  }
  pushLog(draft, now, db.day, 'questRerolled', `${t.title} swapped for ${replacement.title} (-${price} settlement).`);
  return ok(draft, [{ type: 'questRerolled', oldInstanceId: id, newInstanceId: fresh.instanceId, cost: price }]);
}
