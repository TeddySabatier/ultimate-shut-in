/**
 * Decision Dungeon: a short practice of choosing a constructive response to
 * everyday friction. Rooms, door order, reveals and the bot's slips are all
 * seeded; scoring is exact integer arithmetic. The engine is pure: no React,
 * no DOM, no clock, no Math.random.
 *
 * It reads only the shape of the scenarios (content.ts): ids, ease, mood and
 * the hidden style of each option. The words live in texts-*.ts (Screen only).
 */
import { fnv1a, mulberry32, rngInt, type Rng } from '../../game/rng';
import {
  buffAmount,
  clampScore,
  formatText,
  turnRng,
  type GameEngine,
  type Locale,
  type Outcome,
  type Party,
  type PartyMember,
  type RunContext,
} from '../contract';
import { SCENARIOS, getShape, isGoodStyle, type ScenarioShape, type StyleTag } from './content';
import { strings, type DungeonStrings } from './strings';

/** A run is won at 60 percent good choices or better: good * WIN_DEN >= rooms * WIN_NUM. */
export const WIN_NUM = 3;
export const WIN_DEN = 5;
/** Score: up to BASE_SCORE for the share of good choices, plus TOOL_BONUS per tool used. */
export const BASE_SCORE = 900;
export const TOOL_BONUS = 50;
/** The tools that earn the variety bonus: the scored styles plus the gentle "check first". */
export const TOOLS: readonly StyleTag[] = ['constructive', 'boundary', 'curious'];
/** At this power or more a Social troop reveals a tag in every room (below it, in every second room) and a Sleep troop can sleep on two doors. */
export const STRONG_POWER = 20;
/** Percent chance that the bot misses the good door, by difficulty 1..5. */
export const BOT_MISS: readonly number[] = [46, 58, 63, 68, 74];
/** Percent of the time the bot acts on a style the party or a hint revealed. */
export const BOT_TRUST = 70;

export type Phase = 'choose' | 'reflect' | 'over';

export interface Room {
  scenarioId: string;
  /** Display index to source option index (a seeded shuffle). */
  optionOrder: number[];
}

export interface Choice {
  scenarioId: string;
  /** Index in the source order of the scenario. */
  optionIndex: number;
  /** Index the player saw. */
  displayIndex: number;
  style: StyleTag;
}

export interface DungeonState {
  seed: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  rooms: Room[];
  roomIndex: number;
  phase: Phase;
  choices: Choice[];
  /** Display indices whose style is visible in this room (Social and the hint buff). */
  revealed: number[];
  /** Display index slept on in this room, or -1. */
  peekedDisplay: number;
  sleepsLeft: number;
  hintsLeft: number;
  revivesLeft: number;
  /** Ids of the troops that give their perk ('' when absent from the party). */
  socialId: string;
  sleepId: string;
  studyId: string;
  /** Social reveals one tag in every `socialEvery`-th room: 1 when strong, 2 when not, 0 without a Social troop. */
  socialEvery: number;
  sleepUsed: boolean;
  /** Easy difficulties (1 and 2) show a short plain cue on every door. */
  showCues: boolean;
  forfeited: boolean;
  step: number;
}

export type DungeonAction =
  | { type: 'choose'; index: number }
  | { type: 'peek'; index: number }
  | { type: 'hint' }
  | { type: 'undo' }
  | { type: 'continue' }
  | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Pure helpers (exported for the tests and the Screen)
// ---------------------------------------------------------------------------

/** 5 rooms at difficulty 1 and 2, 6 at 3 and 4, 7 at 5. */
export function roomCount(difficulty: number): number {
  if (difficulty >= 5) return 7;
  if (difficulty >= 3) return 6;
  return 5;
}

/** Seeded Fisher-Yates; never mutates its input. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

export function goodCount(choices: readonly Choice[]): number {
  return choices.filter((c) => isGoodStyle(c.style)).length;
}

/** How many of the three tools (constructive, boundary, curious) were used at least once. */
export function toolsUsed(choices: readonly Choice[]): number {
  return TOOLS.filter((t) => choices.some((c) => c.style === t)).length;
}

/** 0 to 1000: floor(900 * good / rooms) + 50 per tool used. Reactive and avoidant doors never add to it. */
export function computeScore(choices: readonly Choice[]): number {
  const n = choices.length;
  if (n === 0) return 0;
  return clampScore(Math.floor((BASE_SCORE * goodCount(choices)) / n) + TOOL_BONUS * toolsUsed(choices));
}

/** Win at 60 percent good choices or better, in integers (no floats). */
export function isWin(choices: readonly Choice[]): boolean {
  const n = choices.length;
  return n > 0 && goodCount(choices) * WIN_DEN >= n * WIN_NUM;
}

export function styleCounts(choices: readonly Choice[]): Record<StyleTag, number> {
  const counts: Record<StyleTag, number> = { reactive: 0, avoidant: 0, constructive: 0, boundary: 0, curious: 0 };
  for (const c of choices) counts[c.style] += 1;
  return counts;
}

/** Tie order for the most used style: the good ones first. */
const STRONGEST_ORDER: readonly StyleTag[] = ['constructive', 'boundary', 'curious', 'avoidant', 'reactive'];
/** Tie order for the least practised tool. */
const WEAKEST_ORDER: readonly StyleTag[] = ['boundary', 'curious', 'constructive'];

/** The style chosen most often this run (ties go to the good styles). */
export function strongestStyle(choices: readonly Choice[]): StyleTag {
  const counts = styleCounts(choices);
  let best: StyleTag = 'constructive';
  let n = -1;
  for (const style of STRONGEST_ORDER) {
    if (counts[style] > n) {
      n = counts[style];
      best = style;
    }
  }
  return best;
}

/** The tool (constructive, boundary or curious) used least this run. */
export function weakestTool(choices: readonly Choice[]): StyleTag {
  const counts = styleCounts(choices);
  let worst: StyleTag = 'boundary';
  let n = Number.POSITIVE_INFINITY;
  for (const style of WEAKEST_ORDER) {
    if (counts[style] < n) {
      n = counts[style];
      worst = style;
    }
  }
  return worst;
}

/** The tip's subject: the habit that showed up most when it was reactive or avoidant, else the least practised tool. */
export function tipStyle(choices: readonly Choice[]): StyleTag {
  const strong = strongestStyle(choices);
  return strong === 'reactive' || strong === 'avoidant' ? strong : weakestTool(choices);
}

export function isOver(state: DungeonState): boolean {
  return state.forfeited || state.phase === 'over';
}

export function currentRoom(state: DungeonState): Room | undefined {
  return state.rooms[state.roomIndex];
}

export function currentShape(state: DungeonState): ScenarioShape | undefined {
  const room = currentRoom(state);
  return room ? getShape(room.scenarioId) : undefined;
}

/** The style behind a display index in the current room. */
export function styleAt(state: DungeonState, displayIndex: number): StyleTag | undefined {
  const room = currentRoom(state);
  const shape = currentShape(state);
  if (!room || !shape) return undefined;
  const source = room.optionOrder[displayIndex];
  return source === undefined ? undefined : shape.styles[source];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Draw the rooms from the seed: from the gentler scenes only at difficulty 1 and 2,
 * with a few of the subtlest ones at 4 and 5, a different mood where possible, then
 * walked easier first. Luck swaps the hardest rooms for gentler unused ones.
 */
export function pickRooms(seed: number, difficulty: number, luck: number): ScenarioShape[] {
  const rng = mulberry32(fnv1a(`decision-dungeon:${seed >>> 0}`));
  const count = roomCount(difficulty);
  const cap = difficulty <= 2 ? 2 : 3;
  const shuffled = shuffle(SCENARIOS, rng);
  const pool = shuffled.filter((s) => s.ease <= cap);
  const picked: ScenarioShape[] = [];
  const moods = new Set<string>();
  const take = (s: ScenarioShape): void => {
    picked.push(s);
    moods.add(s.mood);
  };

  // The hard end of the dungeon: 2 subtle rooms at difficulty 3 and 4, 3 at difficulty 5.
  const subtle = difficulty >= 5 ? 3 : difficulty >= 3 ? 2 : 0;
  for (const s of pool.filter((x) => x.ease === 3)) {
    if (picked.length >= subtle) break;
    if (!moods.has(s.mood)) take(s);
  }
  // Then a different mood each time while there is one, then anything left.
  for (const s of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(s) && !moods.has(s.mood)) take(s);
  }
  for (const s of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(s)) take(s);
  }

  // Luck: swap the hardest room for the gentlest unused scene (twice from 30 percent).
  const swaps = luck <= 0 ? 0 : luck >= 30 ? 2 : 1;
  for (let k = 0; k < swaps; k++) {
    const hardest = picked.reduce((a, b) => (b.ease > a.ease ? b : a), picked[0]!);
    const gentler = shuffled.filter((s) => !picked.includes(s) && s.ease < hardest.ease).sort((a, b) => a.ease - b.ease)[0];
    if (!gentler) break;
    picked[picked.indexOf(hardest)] = gentler;
  }

  // Easier first; among equals, avoid two rooms of the same mood in a row.
  const rest = picked.slice().sort((a, b) => a.ease - b.ease);
  const ordered: ScenarioShape[] = [];
  while (rest.length > 0) {
    const easiest = rest[0]!.ease;
    const tier = rest.filter((s) => s.ease === easiest);
    const prev = ordered[ordered.length - 1]?.mood;
    const next = tier.find((s) => s.mood !== prev) ?? tier[0]!;
    ordered.push(next);
    rest.splice(rest.indexOf(next), 1);
  }
  return ordered;
}

function strongestMember(party: Party, habit: PartyMember['habit']): PartyMember | undefined {
  let best: PartyMember | undefined;
  for (const m of party.members) if (m.habit === habit && (!best || m.power > best.power)) best = m;
  return best;
}

function roomDoors(seed: number, roomIndex: number, count: number): number[] {
  return shuffle(
    Array.from({ length: count }, (_, i) => i),
    turnRng(seed, 100 + roomIndex),
  );
}

/** The one door whose style Social reveals in this room, or none (every `every`-th room, from the first). */
function socialRevealFor(seed: number, roomIndex: number, doors: number, every: number): number[] {
  if (every <= 0 || roomIndex % every !== 0) return [];
  return [rngInt(turnRng(seed, 300 + roomIndex), doors)];
}

function enterRoom(state: DungeonState, roomIndex: number): Pick<DungeonState, 'roomIndex' | 'phase' | 'revealed' | 'peekedDisplay'> {
  const room = state.rooms[roomIndex]!;
  return {
    roomIndex,
    phase: 'choose',
    revealed: socialRevealFor(state.seed, roomIndex, room.optionOrder.length, state.socialEvery),
    peekedDisplay: -1,
  };
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): DungeonState {
  const s = seed >>> 0;
  const rooms: Room[] = pickRooms(s, run.difficulty, buffAmount(run, 'luck')).map((shape, i) => ({
    scenarioId: shape.id,
    optionOrder: roomDoors(s, i, shape.styles.length),
  }));
  const social = strongestMember(party, 'social');
  const sleep = strongestMember(party, 'sleep');
  const study = strongestMember(party, 'study');
  const base: DungeonState = {
    seed: s,
    locale,
    difficulty: run.difficulty,
    rooms,
    roomIndex: 0,
    phase: 'choose',
    choices: [],
    revealed: [],
    peekedDisplay: -1,
    sleepsLeft: sleep ? (sleep.power >= STRONG_POWER ? 2 : 1) : 0,
    hintsLeft: buffAmount(run, 'hint'),
    revivesLeft: buffAmount(run, 'revive'),
    socialId: social?.id ?? '',
    sleepId: sleep?.id ?? '',
    studyId: study?.id ?? '',
    socialEvery: social ? (social.power >= STRONG_POWER ? 1 : 2) : 0,
    sleepUsed: false,
    showCues: run.difficulty <= 2,
    forfeited: false,
    step: 0,
  };
  return { ...base, ...enterRoom(base, 0) };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function reduce(state: DungeonState, action: DungeonAction): DungeonState {
  if (isOver(state)) return state;
  const bump = (next: DungeonState): DungeonState => ({ ...next, step: state.step + 1 });

  if (action.type === 'forfeit') return bump({ ...state, forfeited: true, phase: 'over' });

  if (action.type === 'continue') {
    if (state.phase !== 'reflect') return state;
    const nextIndex = state.roomIndex + 1;
    if (nextIndex >= state.rooms.length) return bump({ ...state, phase: 'over' });
    return bump({ ...state, ...enterRoom(state, nextIndex) });
  }

  if (action.type === 'undo') {
    if (state.phase !== 'reflect' || state.revivesLeft <= 0 || state.choices.length === 0) return state;
    return bump({ ...state, phase: 'choose', choices: state.choices.slice(0, -1), revivesLeft: state.revivesLeft - 1 });
  }

  if (state.phase !== 'choose') return state;
  const room = currentRoom(state);
  if (!room) return state;

  if (action.type === 'hint') {
    if (state.hintsLeft <= 0) return state;
    const hidden = room.optionOrder.map((_, d) => d).filter((d) => !state.revealed.includes(d));
    if (hidden.length === 0) return state;
    const pick = hidden[rngInt(turnRng(state.seed, 800 + state.roomIndex * 10 + state.hintsLeft), hidden.length)]!;
    return bump({ ...state, hintsLeft: state.hintsLeft - 1, revealed: [...state.revealed, pick].sort((a, b) => a - b) });
  }

  if (action.type === 'peek') {
    if (state.sleepsLeft <= 0 || state.peekedDisplay >= 0) return state;
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= room.optionOrder.length) return state;
    return bump({ ...state, sleepsLeft: state.sleepsLeft - 1, sleepUsed: true, peekedDisplay: action.index });
  }

  if (action.type === 'choose') {
    const style = Number.isInteger(action.index) ? styleAt(state, action.index) : undefined;
    const source = Number.isInteger(action.index) ? room.optionOrder[action.index] : undefined;
    if (style === undefined || source === undefined) return state;
    const choice: Choice = { scenarioId: room.scenarioId, optionIndex: source, displayIndex: action.index, style };
    return bump({ ...state, phase: 'reflect', choices: [...state.choices, choice] });
  }

  return state;
}

function troopsUsed(state: DungeonState): string[] {
  const ids: string[] = [];
  if (state.socialId && state.socialEvery > 0) ids.push(state.socialId);
  if (state.sleepId && state.sleepUsed) ids.push(state.sleepId);
  if (state.studyId) ids.push(state.studyId);
  return ids;
}

export function outcomeLog(state: DungeonState, s: DungeonStrings): string[] {
  const lines: string[] = [];
  state.choices.forEach((c, i) => {
    lines.push(formatText(s.log.room, { n: i + 1, style: s.styles[c.style], kind: isGoodStyle(c.style) ? s.log.kindGood : s.log.kindOther }));
  });
  const good = goodCount(state.choices);
  const answered = state.choices.length;
  if (state.forfeited) {
    const total = state.rooms.length;
    lines.push(answered === 0 ? s.log.endFledNone : formatText(answered === 1 ? s.log.endFledOne : s.log.endFled, { n: answered, total }));
  } else if (isWin(state.choices)) lines.push(formatText(s.log.endWon, { n: good, total: answered }));
  else lines.push(formatText(good === 0 ? s.log.endLostNone : good === 1 ? s.log.endLostOne : s.log.endLost, { n: good, total: answered }));
  return lines;
}

function outcome(state: DungeonState): Outcome | null {
  if (!isOver(state)) return null;
  const result = state.forfeited ? 'fled' : isWin(state.choices) ? 'won' : 'lost';
  const strong = strongestStyle(state.choices);
  const base: Outcome = {
    result,
    score: computeScore(state.choices),
    log: outcomeLog(state, strings[state.locale]),
    troopsUsed: troopsUsed(state),
    stats: {
      rooms: state.choices.length,
      good: goodCount(state.choices),
      tools: toolsUsed(state.choices),
      strongest: strong,
    },
  };
  if (state.choices.length === 0) return base;
  const tip = tipStyle(state.choices);
  return {
    ...base,
    learned: {
      topic: {
        en: formatText(strings.en.learnedTopic, { style: strings.en.styles[strong] }),
        fr: formatText(strings.fr.learnedTopic, { style: strings.fr.styles[strong] }),
      },
      note: { en: strings.en.tips[tip], fr: strings.fr.tips[tip] },
    },
  };
}

/**
 * A competent but human bot: in each room it finds a good door, except for a
 * seeded slip (BOT_MISS percent, more on harder runs). A style the party or a
 * hint has revealed helps it: it takes a revealed good door, and avoids a
 * revealed reactive or avoidant one when it slips. It uses a revive on a slip.
 */
function botPlay(state: DungeonState, rng: () => number): DungeonAction | null {
  if (isOver(state)) return null;
  if (state.phase === 'reflect') {
    const last = state.choices[state.choices.length - 1];
    if (last && !isGoodStyle(last.style) && state.revivesLeft > 0) return { type: 'undo' };
    return { type: 'continue' };
  }
  const room = currentRoom(state);
  if (!room) return { type: 'forfeit' };
  const doors = room.optionOrder.map((_, d) => d);
  if (state.hintsLeft > 0 && state.revealed.length < doors.length) return { type: 'hint' };

  const good = doors.filter((d) => {
    const style = styleAt(state, d);
    return style !== undefined && isGoodStyle(style);
  });
  const bad = doors.filter((d) => !good.includes(d));
  const knownGood = good.filter((d) => state.revealed.includes(d));
  const dice = turnRng(state.seed, 900 + state.roomIndex * 10 + state.revivesLeft);
  const slip = rngInt(dice, 100) < (BOT_MISS[state.difficulty - 1] ?? 50);
  const trustsTag = rngInt(dice, 100) < BOT_TRUST;
  if (knownGood.length > 0 && trustsTag) return { type: 'choose', index: knownGood[rngInt(rng, knownGood.length)]! };
  if (!slip && good.length > 0) return { type: 'choose', index: good[rngInt(rng, good.length)]! };
  const unseen = bad.filter((d) => !state.revealed.includes(d));
  const pool = unseen.length > 0 ? unseen : bad.length > 0 ? bad : good;
  return { type: 'choose', index: pool[rngInt(rng, pool.length)]! };
}

function forfeit(): DungeonAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<DungeonState, DungeonAction> = { initial, reduce, outcome, botPlay, forfeit };
