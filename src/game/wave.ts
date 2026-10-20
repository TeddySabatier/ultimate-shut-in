/**
 * Weekly wave (GDD 9): attack and defense formulas, result classification,
 * Domain Point award, seeded battle log, trust reset and combo expiry.
 */
import { formatLine, getHabit, pickLine, strings } from './content';
import { clone, ok, pushLog } from './draft';
import { DIFFICULTY, WAVE_DP, WAVE_HISTORY_MAX, WAVE_WEEK_CAP, nextRing, recomputeRingDraft, ringForDomainPoints, ringName, wallBonus } from './economy';
import { countedCombos } from './combos';
import { fnv1a, mulberry32, rngPick } from './rng';
import { evaluateTitlesDraft, titleDefenseFlat, titleDpMult } from './titles';
import { wellKeptBonus } from './utilities';
import { activeVassals, resetTrustDraft, vassalName } from './vassals';
import { outpostDefense, strongholdOutposts } from './outposts';
import { appendSnapshotDraft } from './map';
import type { ActionResult, Difficulty, GameEvent, HabitId, SaveFile, WaveBreakdown, WaveRecord, WaveResult } from './types';

/* ------------------------------ Monsters ------------------------------ */

export interface Monster {
  id: string;
  name: string;
  boss?: boolean;
}

export const MONSTERS: readonly Monster[] = [
  { id: 'clutter-blob', name: 'a Clutter Blob' },
  { id: 'procrastination-moth', name: 'a Procrastination Moth' },
  { id: 'doomscroll-wyrm', name: 'the Doomscroll Wyrm' },
  { id: 'dust-bunny', name: 'a Dust Bunny swarm' },
  { id: 'snooze-golem', name: 'a Snooze Golem' },
  { id: 'couch-leech', name: 'a Couch Leech' },
  { id: 'fog-wraith', name: 'a Fog Wraith' },
  { id: 'junk-food-imp', name: 'a Junk-Food Imp' },
  { id: 'silence-specter', name: 'a Silence Specter' },
  { id: 'the-static', name: 'the Static', boss: true },
];

/** Boss week every tenth wave; otherwise a seeded regular monster. */
export function monsterForWave(week: number, seed: number): Monster {
  const boss = MONSTERS.find((m) => m.boss);
  if (boss && week % 10 === 0) return boss;
  const regular = MONSTERS.filter((m) => !m.boss);
  return rngPick(mulberry32(seed ^ 0x9e3779b9), regular);
}

const VASSAL_LINES: Record<HabitId, readonly string[]> = {
  move: ['Pell holds the stairwell. +{n}', 'Pell runs the perimeter twice and the wave loses count. +{n}', 'Pell takes the long way round the monsters. +{n}'],
  outside: ['Wren calls the weather from the roof. +{n}', 'Wren maps the wave before it arrives. +{n}', 'Wren opens a window and the fog thins. +{n}'],
  clean: ['Ondra sweeps the gate clear. +{n}', 'Ondra has a cue for every broom. +{n}', 'Ondra files the clutter under "later". +{n}'],
  social: ['Tobi broadcasts the alarm to the neighbours. +{n}', 'Tobi talks the specter into leaving. +{n}', 'Tobi reads the wave a two-line text. +{n}'],
  study: ['Imre reads the monsters a bibliography. +{n}', 'Imre has a chart that says the wave is late. +{n}', 'Imre shelves the moth under "pests, minor". +{n}'],
  sleep: ['Lunel turns the lights off on the golem. +{n}', 'Lunel keeps the watch and the wave yawns. +{n}', 'Lunel bars the door at a sensible hour. +{n}'],
  eat: ['Basil feeds the imp until it leaves. +{n}', 'Basil holds the kitchen with a ladle. +{n}', 'Basil counts the glasses; the wave is thirsty. +{n}'],
  hygiene: ['Marisol has a towel for this. +{n}', 'Marisol runs a bath and the wyrm declines. +{n}', 'Marisol hands the wave a clean shirt. +{n}'],
};

/* ------------------------------ Formulas ------------------------------ */

/** attack = round((16 + 2*min(w,52) + 14*(ring-1)) * attackMult), w = 1-based week. */
export function waveAttack(week: number, ring: number, difficulty: Difficulty): number {
  const w = Math.min(week, WAVE_WEEK_CAP);
  return Math.round((16 + 2 * w + 14 * (ring - 1)) * DIFFICULTY[difficulty].attackMult);
}

export interface DefenseDetail {
  total: number;
  breakdown: WaveBreakdown;
  vassals: Array<{ habit: HabitId; level: number; trust: number; contribution: number }>;
  combos: Array<{ name: string; power: number }>;
}

/** defense = sum(level + 2*trust) + walls + combos + titles + wellKept + outposts (GDD 9.3, CITY-MAP 3.3). */
export function waveDefense(save: SaveFile): DefenseDetail {
  const vassals = activeVassals(save).map((v) => ({ habit: v.habit, level: v.level, trust: v.trust, contribution: v.level + 2 * v.trust }));
  const levelSum = vassals.reduce((s, v) => s + v.level, 0);
  const trustSum = vassals.reduce((s, v) => s + 2 * v.trust, 0);
  const walls = wallBonus(save.player.ring);
  const combos = countedCombos(save).map((c) => ({ name: c.name, power: c.power }));
  const comboSum = combos.reduce((s, c) => s + c.power, 0);
  const titles = titleDefenseFlat(save);
  const wellKept = wellKeptBonus(save);
  const outposts = outpostDefense(save);
  const arena =
    save.arena.waveBoost.forWeekIndex !== null && save.arena.waveBoost.forWeekIndex === save.week.index
      ? save.arena.waveBoost.bonus
      : 0;
  const breakdown: WaveBreakdown = { vassals: levelSum, trust: trustSum, walls, combos: comboSum, titles, wellKept, outposts, arena };
  return { total: levelSum + trustSum + walls + comboSum + titles + wellKept + outposts + arena, breakdown, vassals, combos };
}

export function classifyWave(attack: number, defense: number): Exclude<WaveResult, 'quiet'> {
  if (defense >= 1.5 * attack) return 'decisive';
  if (defense >= attack) return 'win';
  return 'loss';
}

export function waveDpAward(result: WaveResult, dpMult: number): number {
  return Math.round(WAVE_DP[result] * (1 + dpMult));
}

/* ------------------------------ Battle log ------------------------------ */

/**
 * Ring-progress clause of the reward line. `save.player.ring` is still the
 * ring the wave was fought at while `domainPoints` already includes the
 * award, so a wave that crosses the threshold reads "{ring} is registered"
 * rather than "132/120 toward" (errata 16).
 */
function ringProgress(save: SaveFile): string {
  const next = nextRing(save.player.ring);
  if (!next) return 'The City is registered; the Ledger keeps counting.';
  const dp = save.player.domainPoints;
  if (dp >= next.domainPointsRequired) return `${ringName(ringForDomainPoints(dp))} is registered.`;
  return `${dp}/${next.domainPointsRequired} toward ${next.name}`;
}

function buildLog(save: SaveFile, week: number, attack: number, detail: DefenseDetail, result: Exclude<WaveResult, 'quiet'>, dp: number, seed: number): string[] {
  const rng = mulberry32(seed);
  const name = ringName(save.player.ring);
  const monster = monsterForWave(week, seed);
  const lines: string[] = [`Wave ${week} reaches ${name}: ${monster.name} at the gate. Attack ${attack}.`];

  const contributing = [...detail.vassals].sort((a, b) => b.contribution - a.contribution);
  const regulars = contributing.filter((v) => v.trust === 0 && v.level >= 3);
  for (const v of contributing.filter((x) => x.trust >= 1)) {
    lines.push(formatLine(rngPick(rng, VASSAL_LINES[v.habit]), { n: v.contribution, name: vassalName(v.habit) }));
  }
  if (regulars.length > 0) lines.push(`The regulars hold the line. +${regulars.reduce((s, v) => s + v.contribution, 0)}`);

  detail.combos.slice(0, 3).forEach((c) => lines.push(`${c.name} is deployed. +${c.power}`));
  const rest = detail.combos.slice(3);
  if (rest.length > 0) lines.push(`and ${rest.length} other odd things. +${rest.reduce((s, c) => s + c.power, 0)}`);

  lines.push(`The walls of ${name} hold. +${detail.breakdown.walls}`);
  if (detail.breakdown.titles > 0) lines.push(`Old honours count for something. +${detail.breakdown.titles}`);
  if (detail.breakdown.wellKept > 0) lines.push(`Lights, water and gas all steady. +${detail.breakdown.wellKept}`);
  if (detail.breakdown.outposts > 0) {
    const holds = strongholdOutposts(save);
    const first = holds[0];
    lines.push(
      holds.length === 1 && first
        ? `The ${first.name} stronghold holds. +${detail.breakdown.outposts}`
        : `${holds.length >= 3 ? 'Three' : 'Two'} strongholds hold the outer line. +${detail.breakdown.outposts}`,
    );
  }
  if ((detail.breakdown.arena ?? 0) > 0) lines.push(`The Arena's last outing still counts. +${detail.breakdown.arena}`);

  const pool = result === 'decisive' ? strings.waveDecisive : result === 'win' ? strings.waveWin : strings.waveLoss;
  lines.push(formatLine(pickLine(pool, seed), { defense: detail.total, attack }));
  lines.push(`Domain Points +${dp}. ${ringProgress(save)}`);
  return lines;
}

/* ------------------------------ Settlement ------------------------------ */

/**
 * Settle the wave for `periodIndex` on the draft. A period with zero trust
 * across the active (enabled, present) vassals resolves as `quiet` (no
 * attack, no DP); trust frozen on a disabled vassal counts for nothing
 * (errata 11). Trust resets and combo items expire either way.
 */
export function settleWaveDraft(draft: SaveFile, periodIndex: number, now: number, day: number): GameEvent[] {
  const events: GameEvent[] = [];
  const week = periodIndex + 1;
  const seed = fnv1a(`${draft.firstPlayDay}:${periodIndex}`);
  const totalTrust = activeVassals(draft).reduce((s, v) => s + v.trust, 0);
  const ringAtSettlement = draft.player.ring;
  let record: WaveRecord;

  if (totalTrust === 0) {
    record = {
      index: periodIndex,
      ring: ringAtSettlement,
      attack: 0,
      defense: 0,
      breakdown: { vassals: 0, trust: 0, walls: 0, combos: 0, titles: 0, wellKept: 0, outposts: 0, arena: 0 },
      result: 'quiet',
      dpAwarded: 0,
      log: [pickLine(strings.waveQuiet, seed)],
      settledAt: now,
    };
  } else {
    const attack = waveAttack(week, ringAtSettlement, draft.settings.difficulty);
    const detail = waveDefense(draft);
    const result = classifyWave(attack, detail.total);
    const dp = waveDpAward(result, titleDpMult(draft));
    draft.player.domainPoints += dp;
    if (result === 'loss') {
      draft.stats.waveLosses += 1;
      draft.stats.decisiveStreak = 0;
    } else {
      draft.stats.waveWins += 1;
      draft.stats.decisiveStreak = result === 'decisive' ? draft.stats.decisiveStreak + 1 : 0;
    }
    record = {
      index: periodIndex,
      ring: ringAtSettlement,
      attack,
      defense: detail.total,
      breakdown: detail.breakdown,
      result,
      dpAwarded: dp,
      log: buildLog(draft, week, attack, detail, result, dp, seed),
      settledAt: now,
    };
  }

  draft.week.history.push(record);
  if (draft.week.history.length > WAVE_HISTORY_MAX) draft.week.history.splice(0, draft.week.history.length - WAVE_HISTORY_MAX);
  draft.week.index = periodIndex + 1;
  if (draft.arena.waveBoost.forWeekIndex !== null && draft.arena.waveBoost.forWeekIndex <= periodIndex) {
    draft.arena.waveBoost = { bonus: 0, forWeekIndex: null };
  }
  draft.arena.trainingPeriodIndex = draft.week.index;
  draft.arena.trainingCoinsThisPeriod = 0;
  resetTrustDraft(draft);
  draft.combos = [];
  events.push({ type: 'waveSettled', record });
  pushLog(draft, now, day, 'wave', record.log[record.log.length - 1] ?? `Wave ${week} settled.`);
  events.push(...recomputeRingDraft(draft));
  // The map remembers where the wall stood when the period settled (CITY-MAP 4.1), quiet weeks included.
  appendSnapshotDraft(draft, periodIndex, day, record.result);
  events.push(...evaluateTitlesDraft(draft, now, day));
  return events;
}

/** Public immutable settlement. `day` is the game day the record is logged on. */
export function settleWave(save: SaveFile, periodIndex: number, now: number, day: number = save.lastOpenDay): ActionResult {
  const draft = clone(save);
  const events = settleWaveDraft(draft, periodIndex, now, day);
  return ok(draft, events);
}

/** Vassal display label helper for the Ledger ("Pell the Runner"). */
export function vassalTitle(habit: HabitId): string {
  const h = getHabit(habit);
  return `${h.vassal.name} ${h.vassal.epithet}`;
}
