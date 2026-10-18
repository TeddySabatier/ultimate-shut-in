/**
 * Titles (GDD 11): condition evaluation after any state change, and the
 * capped effect sums applied by rewards, waves, utilities and combos.
 * Titles are permanent: nothing here ever removes an EarnedTitle.
 */
import { stackCaps, titles as titleDefs, type TitleCondition, type TitleDef, type TitleEffect } from './content';
import { clone, ok, pushLog } from './draft';
import { hasFacility, isHabitEnabled } from './economy';
import type { ActionResult, EarnedTitle, GameEvent, HabitId, SaveFile, UtilityId } from './types';
import { HABIT_IDS } from './types';

export const LIBRARY_XP_CAP = 0.25;

function earned(save: SaveFile, titleId: string): EarnedTitle | undefined {
  return save.titles.find((t) => t.titleId === titleId);
}

export function hasTitle(save: SaveFile, titleId: string): boolean {
  return earned(save, titleId) !== undefined;
}

/* --------------------------- Effect sums --------------------------- */

function earnedEffects(save: SaveFile): Array<{ def: TitleDef; earned: EarnedTitle }> {
  const out: Array<{ def: TitleDef; earned: EarnedTitle }> = [];
  for (const e of save.titles) {
    const def = titleDefs.find((t) => t.id === e.titleId);
    if (def) out.push({ def, earned: e });
  }
  return out;
}

/** Capped additive XP multiplier bonus for a habit (0..0.20, 0.25 with the Library). */
export function titleXpMult(save: SaveFile, habit: HabitId): number {
  let sum = 0;
  for (const { def, earned: e } of earnedEffects(save)) {
    const fx: TitleEffect = def.effect;
    if (fx.type !== 'xpMult') continue;
    if (fx.scope === 'all') sum += fx.value;
    else {
      const target = fx.habitFrom === 'conditionVassal' ? e.habit : fx.habit;
      if (target === habit) sum += fx.value;
    }
  }
  const cap = hasFacility(save.player.ring, 'library') ? LIBRARY_XP_CAP : stackCaps.xpMult;
  return Math.min(sum, cap);
}

export function titleCoinMult(save: SaveFile): number {
  let sum = 0;
  for (const { def } of earnedEffects(save)) if (def.effect.type === 'coinMult') sum += def.effect.value;
  return Math.min(sum, stackCaps.coinMult);
}

export function titleDpMult(save: SaveFile): number {
  let sum = 0;
  for (const { def } of earnedEffects(save)) if (def.effect.type === 'dpMult') sum += def.effect.value;
  return Math.min(sum, stackCaps.dpMult);
}

export function titleDefenseFlat(save: SaveFile): number {
  let sum = 0;
  for (const { def } of earnedEffects(save)) if (def.effect.type === 'defenseFlat') sum += def.effect.value;
  return Math.min(sum, stackCaps.defenseFlat);
}

/** Multiplicative decay factor for a utility (1 when no title applies). */
export function titleUtilityDecayMult(save: SaveFile, utility: UtilityId): number {
  let mult = 1;
  for (const { def } of earnedEffects(save)) {
    if (def.effect.type === 'utilityDecayMult' && def.effect.utility === utility) mult *= def.effect.value;
  }
  return mult;
}

export function titleComboPower(save: SaveFile): number {
  let sum = 0;
  for (const { def } of earnedEffects(save)) if (def.effect.type === 'comboPower') sum += def.effect.value;
  return sum;
}

export function titleLoyaltyFlat(save: SaveFile): number {
  let sum = 0;
  for (const { def } of earnedEffects(save)) if (def.effect.type === 'loyaltyGainFlat') sum += def.effect.value;
  return sum;
}

/* --------------------------- Conditions --------------------------- */

interface ConditionHit {
  met: boolean;
  habit?: HabitId;
}

function checkCondition(save: SaveFile, c: TitleCondition): ConditionHit {
  const s = save.stats;
  switch (c.type) {
    case 'questsTotal':
      return { met: s.questsTotal >= c.count };
    case 'questsOfHabit':
      return { met: (s.questsByHabit[c.habit] ?? 0) >= c.count };
    case 'questDaysTotal':
      return { met: s.questDaysTotal >= c.count };
    case 'questDayStreak':
      return { met: s.questDayStreak >= c.count };
    case 'anyVassalLoyaltyAtLeast': {
      for (const h of HABIT_IDS) {
        if (save.vassals[h].loyalty >= c.value) return { met: true, habit: h };
      }
      return { met: false };
    }
    case 'allVassalsLoyaltyAtLeast': {
      const enabled = HABIT_IDS.filter((h) => isHabitEnabled(save, h));
      return { met: enabled.length > 0 && enabled.every((h) => save.vassals[h].loyalty >= c.value) };
    }
    case 'utilityFullStreak':
      return { met: save.utilities[c.utility].fullStreakDays >= c.days };
    case 'waveWins':
      return { met: s.waveWins >= c.count };
    case 'decisiveWinStreak':
      return { met: s.decisiveStreak >= c.count };
    case 'ringReached':
      return { met: save.player.ring >= c.ring };
    case 'combosForged':
      return { met: s.combosForged >= c.count };
    case 'resurrectionUsed':
      return { met: s.resurrectionsUsed >= c.count };
    case 'vassalReRecruited':
      return { met: s.reRecruitments >= c.count };
  }
}

/** Evaluate every unearned title; append the newly earned ones. Mutates the draft. */
export function evaluateTitlesDraft(draft: SaveFile, now: number, day: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (const def of titleDefs) {
    if (hasTitle(draft, def.id)) continue;
    const hit = checkCondition(draft, def.condition);
    if (!hit.met) continue;
    const entry: EarnedTitle = hit.habit ? { titleId: def.id, earnedAt: now, habit: hit.habit } : { titleId: def.id, earnedAt: now };
    draft.titles.push(entry);
    events.push(hit.habit ? { type: 'titleEarned', titleId: def.id, habit: hit.habit } : { type: 'titleEarned', titleId: def.id });
    pushLog(draft, now, day, 'title', `Title earned: ${def.name}. ${def.flavor}`);
  }
  return events;
}

/** Public, immutable wrapper around `evaluateTitlesDraft`. */
export function evaluateTitles(save: SaveFile, now: number, day: number = save.lastOpenDay): ActionResult {
  const draft = clone(save);
  const events = evaluateTitlesDraft(draft, now, day);
  return ok(draft, events);
}
