/**
 * Decision Dungeon: a short practice of choosing a constructive response to
 * everyday friction. Rooms, option order and scoring are seeded. The engine
 * is pure: no React, no DOM, no clock, no Math.random.
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
import { SCENARIOS, STYLES, getScenario, type Scenario, type StyleTag } from './content';
import { strings, type DungeonStrings } from './strings';

export const STYLE_ORDER: readonly StyleTag[] = STYLES;
export const WIN_NUM = 3;
export const WIN_DEN = 5;
export const BASE_SCORE = 800;
export const VARIETY_BONUS = 40;
export const SOCIAL_POWER_FOR_TWO = 20;
export const PEEK_ONCE = 1;

export type Phase = 'choose' | 'reflect' | 'over';

export interface Room {
  scenarioId: string;
  /** Original option indices in display order. */
  optionOrder: number[];
}

export interface Choice {
  scenarioId: string;
  optionIndex: number;
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
  /** Display indices whose style tags are visible this room. */
  revealed: number[];
  /** Display index peeked this room, or -1. */
  peekedDisplay: number;
  sleepAvailable: boolean;
  sleepUsed: boolean;
  hintsLeft: number;
  revivesLeft: number;
  socialId: string;
  sleepId: string;
  studyId: string;
  socialReveals: number;
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

export function roomCount(difficulty: number): number {
  if (difficulty >= 5) return 7;
  if (difficulty >= 3) return 6;
  return 5;
}

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

export function goodStyle(style: StyleTag): boolean {
  return style === 'constructive' || style === 'boundary';
}

export function goodCount(choices: readonly Choice[]): number {
  return choices.filter((c) => goodStyle(c.style)).length;
}

export function distinctStyles(choices: readonly Choice[]): number {
  const seen: Partial<Record<StyleTag, true>> = {};
  let n = 0;
  for (const c of choices) {
    if (!seen[c.style]) {
      seen[c.style] = true;
      n += 1;
    }
  }
  return n;
}

export function computeScore(choices: readonly Choice[]): number {
  const n = choices.length;
  if (n === 0) return 0;
  return clampScore(Math.floor((BASE_SCORE * goodCount(choices)) / n) + VARIETY_BONUS * distinctStyles(choices));
}

/** Win at 60 percent or better of constructive + boundary choices, in integers. */
export function isWin(choices: readonly Choice[]): boolean {
  const n = choices.length;
  if (n === 0) return false;
  return goodCount(choices) * WIN_DEN >= n * WIN_NUM;
}

export function styleCounts(choices: readonly Choice[]): Record<StyleTag, number> {
  const counts: Record<StyleTag, number> = { reactive: 0, avoidant: 0, constructive: 0, boundary: 0, curious: 0 };
  for (const c of choices) counts[c.style] += 1;
  return counts;
}

export function strongestStyle(choices: readonly Choice[]): StyleTag {
  const counts = styleCounts(choices);
  let best: StyleTag = 'constructive';
  let n = -1;
  for (const style of STYLE_ORDER) {
    if (counts[style] > n) {
      n = counts[style];
      best = style;
    }
  }
  return best;
}

export function weakestStyle(choices: readonly Choice[]): StyleTag {
  const counts = styleCounts(choices);
  let worst: StyleTag = 'reactive';
  let n = Number.POSITIVE_INFINITY;
  for (const style of STYLE_ORDER) {
    if (counts[style] < n) {
      n = counts[style];
      worst = style;
    }
  }
  return worst;
}

export function isOver(state: DungeonState): boolean {
  return state.forfeited || state.phase === 'over';
}

export function currentRoom(state: DungeonState): Room | undefined {
  return state.rooms[state.roomIndex];
}

export function currentScenario(state: DungeonState): Scenario | undefined {
  const room = currentRoom(state);
  return room ? getScenario(state.locale, room.scenarioId) : undefined;
}

export function optionAt(state: DungeonState, displayIndex: number): { orig: number; style: StyleTag } | undefined {
  const room = currentRoom(state);
  const scenario = currentScenario(state);
  if (!room || !scenario) return undefined;
  const orig = room.optionOrder[displayIndex];
  if (orig === undefined) return undefined;
  const option = scenario.options[orig];
  if (!option) return undefined;
  return { orig, style: option.style };
}

function firstHabit(party: Party, habit: PartyMember['habit']): PartyMember | undefined {
  return party.members.find((m) => m.habit === habit);
}

function pickRooms(rng: Rng, catalog: readonly Scenario[], count: number, luck: number): Scenario[] {
  const shuffled = shuffle(catalog, rng);
  const pool = shuffled
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const easeA = luck > 0 && a.s.ease === 3 ? 4 : a.s.ease;
      const easeB = luck > 0 && b.s.ease === 3 ? 4 : b.s.ease;
      return easeA - easeB || a.i - b.i;
    })
    .map((x) => x.s);
  const picked: Scenario[] = [];
  const moods = new Set<string>();
  for (const s of pool) {
    if (picked.length >= count) break;
    if (!moods.has(s.mood)) {
      picked.push(s);
      moods.add(s.mood);
    }
  }
  for (const s of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked.slice(0, count);
}

function orderOptions(seed: number, roomIndex: number, count: number, luck: number): number[] {
  const rng = turnRng(seed, 100 + roomIndex + (luck > 0 ? 17 : 0));
  return shuffle(
    Array.from({ length: count }, (_, i) => i),
    rng,
  );
}

function socialReveal(state: Pick<DungeonState, 'socialReveals'>, room: Room, scenario: Scenario): number[] {
  if (state.socialReveals <= 0) return [];
  const displays = room.optionOrder.map((orig, d) => ({ d, style: scenario.options[orig]?.style }));
  const cons = displays.filter((x) => x.style === 'constructive').map((x) => x.d);
  const others = displays.filter((x) => x.style !== 'constructive').map((x) => x.d);
  return [...cons, ...others].slice(0, state.socialReveals);
}

function enterRoom(state: DungeonState, roomIndex: number): Pick<DungeonState, 'roomIndex' | 'phase' | 'revealed' | 'peekedDisplay'> {
  const room = state.rooms[roomIndex]!;
  const scenario = getScenario(state.locale, room.scenarioId)!;
  return {
    roomIndex,
    phase: 'choose',
    revealed: socialReveal(state, room, scenario),
    peekedDisplay: -1,
  };
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): DungeonState {
  const rng = mulberry32(fnv1a(`decision-dungeon:${seed >>> 0}`));
  const catalog = SCENARIOS[locale];
  const luck = buffAmount(run, 'luck');
  const count = roomCount(run.difficulty);
  const picked = pickRooms(rng, catalog, count, luck);
  const rooms: Room[] = picked.map((s, i) => ({
    scenarioId: s.id,
    optionOrder: orderOptions(seed >>> 0, i, s.options.length, luck),
  }));
  const social = firstHabit(party, 'social');
  const sleep = firstHabit(party, 'sleep');
  const study = firstHabit(party, 'study');
  const base: DungeonState = {
    seed: seed >>> 0,
    locale,
    difficulty: run.difficulty,
    rooms,
    roomIndex: 0,
    phase: 'choose',
    choices: [],
    revealed: [],
    peekedDisplay: -1,
    sleepAvailable: Boolean(sleep),
    sleepUsed: false,
    hintsLeft: buffAmount(run, 'hint'),
    revivesLeft: buffAmount(run, 'revive'),
    socialId: social?.id ?? '',
    sleepId: sleep?.id ?? '',
    studyId: study?.id ?? '',
    socialReveals: social ? (social.power >= SOCIAL_POWER_FOR_TWO ? 2 : 1) : 0,
    showCues: run.difficulty <= 2,
    forfeited: false,
    step: 0,
  };
  return { ...base, ...enterRoom(base, 0) };
}

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
    const last = state.choices[state.choices.length - 1];
    if (!last || last.scenarioId !== currentRoom(state)?.scenarioId) return state;
    return bump({
      ...state,
      phase: 'choose',
      choices: state.choices.slice(0, -1),
      revivesLeft: state.revivesLeft - 1,
    });
  }

  if (state.phase !== 'choose') return state;

  if (action.type === 'hint') {
    const room = currentRoom(state);
    if (!room || state.hintsLeft <= 0) return state;
    const hidden = room.optionOrder.map((_, d) => d).filter((d) => !state.revealed.includes(d));
    if (hidden.length === 0) return state;
    const pick = hidden[rngInt(turnRng(state.seed, 800 + state.roomIndex * 10 + state.hintsLeft), hidden.length)]!;
    return bump({ ...state, hintsLeft: state.hintsLeft - 1, revealed: [...state.revealed, pick] });
  }

  if (action.type === 'peek') {
    if (!state.sleepAvailable || state.sleepUsed) return state;
    if (optionAt(state, action.index) === undefined) return state;
    return bump({ ...state, sleepUsed: true, peekedDisplay: action.index });
  }

  if (action.type === 'choose') {
    const found = optionAt(state, action.index);
    const room = currentRoom(state);
    if (!found || !room) return state;
    const choice: Choice = {
      scenarioId: room.scenarioId,
      optionIndex: found.orig,
      displayIndex: action.index,
      style: found.style,
    };
    return bump({ ...state, phase: 'reflect', choices: [...state.choices, choice] });
  }

  return state;
}

function troopsUsed(state: DungeonState): string[] {
  const ids: string[] = [];
  if (state.socialId && state.socialReveals > 0) ids.push(state.socialId);
  if (state.sleepId && state.sleepUsed) ids.push(state.sleepId);
  if (state.studyId) ids.push(state.studyId);
  return ids;
}

export function outcomeLog(state: DungeonState, s: DungeonStrings): string[] {
  const lines: string[] = [];
  for (let i = 0; i < state.choices.length; i++) {
    const c = state.choices[i]!;
    lines.push(
      formatText(s.log.room, {
        n: i + 1,
        style: s.styles[c.style],
        kind: goodStyle(c.style) ? s.log.kindGood : s.log.kindOther,
      }),
    );
  }
  if (state.forfeited) {
    lines.push(formatText(s.log.endFled, { n: state.choices.length, total: state.rooms.length }));
  } else if (isWin(state.choices)) {
    lines.push(formatText(s.log.endWon, { n: goodCount(state.choices), total: state.choices.length }));
  } else {
    lines.push(formatText(s.log.endLost, { n: goodCount(state.choices), total: state.choices.length }));
  }
  return lines;
}

function outcome(state: DungeonState): Outcome | null {
  if (!isOver(state)) return null;
  const result = state.forfeited ? 'fled' : isWin(state.choices) ? 'won' : 'lost';
  const strong = strongestStyle(state.choices);
  const weak = weakestStyle(state.choices);
  return {
    result,
    score: computeScore(state.choices),
    log: outcomeLog(state, strings[state.locale]),
    troopsUsed: troopsUsed(state),
    learned: {
      topic: { en: strings.en.styles[strong], fr: strings.fr.styles[strong] },
      note: { en: strings.en.tips[weak], fr: strings.fr.tips[weak] },
    },
    stats: {
      rooms: state.choices.length,
      good: goodCount(state.choices),
      variety: distinctStyles(state.choices),
      strongest: strong,
      weakest: weak,
    },
  };
}

function botPlay(state: DungeonState, rng: () => number): DungeonAction | null {
  if (isOver(state)) return null;
  if (state.phase === 'reflect') {
    const last = state.choices[state.choices.length - 1];
    if (last && !goodStyle(last.style) && state.revivesLeft > 0 && rng() < 0.85) return { type: 'undo' };
    return { type: 'continue' };
  }
  const room = currentRoom(state);
  const scenario = currentScenario(state);
  if (!room || !scenario) return { type: 'forfeit' };
  const n = room.optionOrder.length;
  if (state.hintsLeft > 0 && state.revealed.length < n) return { type: 'hint' };
  if (state.sleepAvailable && !state.sleepUsed) return { type: 'peek', index: rngInt(rng, n) };
  const constructive = room.optionOrder
    .map((orig, display) => ({ display, style: scenario.options[orig]?.style }))
    .filter((o) => o.style === 'constructive')
    .map((o) => o.display);
  // Mix the bot rng with the game seed so different dungeons are not locked to one
  // unlucky stream (playToEnd always starts the bot rng from the same salt).
  const success = 70 - state.difficulty * 6;
  const roll = (rngInt(rng, 100) + (state.seed % 97) + state.roomIndex * 17) % 100;
  if (roll < success && constructive.length > 0) {
    return { type: 'choose', index: constructive[rngInt(rng, constructive.length)]! };
  }
  const rest = Array.from({ length: n }, (_, d) => d).filter((d) => !constructive.includes(d));
  const pool = rest.length > 0 ? rest : constructive;
  return { type: 'choose', index: pool[rngInt(rng, pool.length)]! };
}

function forfeit(): DungeonAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<DungeonState, DungeonAction> = { initial, reduce, outcome, botPlay, forfeit };
