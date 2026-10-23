/**
 * Memory Palace: walk six rooms, picture a thing in each place, then put
 * every thing back. Three rounds; difficulty shifts the counts, the look
 * time and the distractors. A revive retries the weakest round.
 *
 * Pure, seeded, locale from `initial`. Time is `{ type: 'tick' }` at
 * FIXED_DT_MS. Invalid actions and any action after the end return the state
 * unchanged.
 */
import { fnv1a, mulberry32 } from '../../game/rng';
import {
  buffAmount,
  clampScore,
  FIXED_DT_MS,
  formatText,
  type GameEngine,
  type Locale,
  type Outcome,
  type Party,
  type PartyMember,
  type RunContext,
} from '../contract';
import { strings, type MemoryPalaceStrings } from './strings';
import { pickWords, shuffle, wordPrefix, wordText } from './words';

export const ROOM_IDS = ['gate', 'hall', 'kitchen', 'library', 'garden', 'tower'] as const;
export type RoomId = (typeof ROOM_IDS)[number];

export const ROUND_COUNT = 3;
export const BASE_COUNTS = [4, 6, 8] as const;
export const WIN_RATIO = 70;
export const HINT_BONUS = 150;
export const SCORE_BASE = 850;
export const FLED_SCORE_BASE = 400;
/** Bot error percent by difficulty (index 1..5). Difficulty 1 is perfect. */
export const BOT_ERROR_PCT = [0, 0, 37, 44, 52, 59] as const;
/** Look time never drops under two seconds, whatever the buffs. */
const MIN_DISPLAY_TICKS = 40;
const PROMPT_COUNT = 8;
export const TIP_COUNT = 6;
/** A time-buff second adds this many 50 ms ticks to every look, capped. */
export const TIME_TICKS_PER_SECOND = 4;
export const TIME_TICKS_CAP = 120;
/** The bot misses a little less for every this many extra ticks of look time. */
const BOT_TICKS_PER_PCT = 8;
/** Even with a letter hint the bot forgets this share of the things it was hinted about. */
export const BOT_HINTED_MISS_PCT = 35;
const BOT_TIME_RELIEF_CAP = 10;

export interface PalaceItem {
  wordId: number;
  roomId: RoomId;
  promptId: number;
}

export interface Placement {
  wordId: number;
  roomId: RoomId;
  correct: boolean;
}

export interface LetterHint {
  wordId: number;
  roomId: RoomId;
  prefix: string;
}

export interface RoundPlan {
  items: PalaceItem[];
  distractors: number[];
  choiceOrder: number[];
}

export interface RoundPlay {
  placements: Placement[];
  hintsUsed: number;
  hints: LetterHint[];
}

export type Phase = 'intro' | 'memorise' | 'recall' | 'done';

export interface MemoryPalaceState {
  seed: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  phase: Phase;
  roundIndex: number;
  rounds: RoundPlan[];
  plays: RoundPlay[];
  showIndex: number;
  ticksLeft: number;
  displayTicksByRound: number[];
  hintsLeft: number;
  hintsPerRound: number;
  hintLetters: number;
  revivesLeft: number;
  reviveUsed: boolean;
  revivedRound: number;
  forfeited: boolean;
  hasStudy: boolean;
  hasSleep: boolean;
  hasSocial: boolean;
  studyMemberId: string;
  sleepMemberId: string;
  socialMemberId: string;
  memberIds: string[];
}

export type MemoryPalaceAction =
  | { type: 'tick' }
  | { type: 'advance' }
  | { type: 'place'; wordId: number; roomId: RoomId }
  | { type: 'hint' }
  | { type: 'forfeit' };

export function clampInt(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Item counts per round: base 4/6/8, shifted by difficulty (1 is gentler). */
export function itemCounts(difficulty: number): number[] {
  const shift = difficulty - 3;
  return BASE_COUNTS.map((n) => clampInt(n + shift, 2, 10));
}

export function distractorCount(difficulty: number, luckAmount: number): number {
  const cut = luckAmount > 0 ? 1 : 0;
  return Math.max(0, difficulty - cut);
}

/** Look time per thing in 50 ms ticks: 8, 6.5, 5, 4 and 3 seconds. */
export function baseDisplayTicks(difficulty: number): number {
  return [0, 160, 130, 100, 80, 60][clampInt(difficulty, 1, 5)] ?? 100;
}

/** Extra ticks from Sleep (half its power) plus the time buff (4 ticks per second of buff, capped). */
export function extraDisplayTicks(sleepPower: number, timeSeconds: number): number {
  const sleep = Math.floor(Math.max(0, sleepPower) / 2);
  const time = Math.min(TIME_TICKS_CAP, Math.max(0, timeSeconds) * TIME_TICKS_PER_SECOND);
  return sleep + time;
}

export function displayTicksFor(difficulty: number, sleepPower: number, timeSeconds: number): number {
  return Math.max(MIN_DISPLAY_TICKS, baseDisplayTicks(difficulty) + extraDisplayTicks(sleepPower, timeSeconds));
}

export function isOver(state: MemoryPalaceState): boolean {
  return state.forfeited || state.phase === 'done';
}

export function currentRound(state: MemoryPalaceState): RoundPlan | null {
  return state.rounds[state.roundIndex] ?? null;
}

export function currentPlay(state: MemoryPalaceState): RoundPlay | null {
  return state.plays[state.roundIndex] ?? null;
}

export function currentItem(state: MemoryPalaceState): PalaceItem | null {
  if (state.phase !== 'memorise') return null;
  const round = currentRound(state);
  return round?.items[state.showIndex] ?? null;
}

export function placedIds(play: RoundPlay): number[] {
  return play.placements.map((p) => p.wordId);
}

export function remainingChoices(state: MemoryPalaceState): number[] {
  const round = currentRound(state);
  const play = currentPlay(state);
  if (!round || !play) return [];
  const used = new Set(placedIds(play));
  return round.choiceOrder.filter((id) => !used.has(id));
}

export function roomCounts(round: RoundPlan): { roomId: RoomId; count: number }[] {
  return ROOM_IDS.map((roomId) => ({
    roomId,
    count: round.items.filter((it) => it.roomId === roomId).length,
  })).filter((row) => row.count > 0);
}

export function tally(state: MemoryPalaceState): { correct: number; total: number; hintsUsed: number } {
  let correct = 0;
  let total = 0;
  let hintsUsed = 0;
  for (let i = 0; i < state.rounds.length; i++) {
    const round = state.rounds[i]!;
    const play = state.plays[i]!;
    total += round.items.length;
    correct += play.placements.filter((p) => p.correct).length;
    hintsUsed += play.hintsUsed;
  }
  return { correct, total, hintsUsed };
}

export function accuracyPct(state: MemoryPalaceState): number {
  const { correct, total } = tally(state);
  if (total <= 0) return 0;
  return Math.round((correct * 100) / total);
}

export function trueRoomOf(round: RoundPlan, wordId: number): RoomId | null {
  return round.items.find((it) => it.wordId === wordId)?.roomId ?? null;
}

function memberByHabit(party: Party, habit: string): PartyMember | undefined {
  return party.members.find((m) => m.habit === habit);
}

/** Rooms for `count` things: every room before any repeats, listed in walking order (gate to tower). */
function assignRooms(rng: () => number, count: number): RoomId[] {
  const order = shuffle(rng, ROOM_IDS);
  const assigned = Array.from({ length: count }, (_, i) => order[i % order.length]!);
  return assigned.sort((a, b) => ROOM_IDS.indexOf(a) - ROOM_IDS.indexOf(b));
}

function makeRound(rng: () => number, count: number, distractors: number, used: number[]): RoundPlan {
  const wordIds = pickWords(rng, count + distractors, used);
  const itemIds = wordIds.slice(0, count);
  const distractorIds = wordIds.slice(count);
  const rooms = assignRooms(rng, count);
  const items: PalaceItem[] = itemIds.map((wordId, i) => ({
    wordId,
    roomId: rooms[i]!,
    promptId: rngIntSafe(rng, PROMPT_COUNT),
  }));
  const choiceOrder = shuffle(rng, [...itemIds, ...distractorIds]);
  return { items, distractors: distractorIds, choiceOrder };
}

function rngIntSafe(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

function emptyPlay(): RoundPlay {
  return { placements: [], hintsUsed: 0, hints: [] };
}

function beginRound(state: MemoryPalaceState, index: number, resetPlay: boolean): MemoryPalaceState {
  const plays = resetPlay
    ? state.plays.map((p, i) => (i === index ? emptyPlay() : p))
    : state.plays;
  return {
    ...state,
    phase: 'intro',
    roundIndex: index,
    showIndex: 0,
    ticksLeft: state.displayTicksByRound[index] ?? MIN_DISPLAY_TICKS,
    hintsLeft: state.hintsPerRound,
    plays,
  };
}

function worstRoundIndex(state: MemoryPalaceState): number {
  let worst = 0;
  let worstPct = 101;
  for (let i = 0; i < state.rounds.length; i++) {
    const total = state.rounds[i]!.items.length;
    const correct = state.plays[i]!.placements.filter((p) => p.correct).length;
    const pct = total === 0 ? 100 : (correct * 100) / total;
    if (pct < worstPct || (pct === worstPct && i > worst)) {
      worstPct = pct;
      worst = i;
    }
  }
  return worst;
}

function finishRound(state: MemoryPalaceState): MemoryPalaceState {
  const next = state.roundIndex + 1;
  if (next < state.rounds.length && !state.reviveUsed) return beginRound(state, next, false);
  // After a revive we may still have later unfinished rounds (revive of an earlier one
  // happens only once every round has been filled once).
  const unfinished = state.plays.findIndex((p, i) => p.placements.length < state.rounds[i]!.items.length);
  if (unfinished >= 0 && unfinished !== state.roundIndex) return beginRound(state, unfinished, false);
  if (state.revivesLeft > 0 && !state.reviveUsed) {
    const worst = worstRoundIndex(state);
    const total = state.rounds[worst]!.items.length;
    const correct = state.plays[worst]!.placements.filter((p) => p.correct).length;
    if (correct < total) {
      return beginRound({ ...state, revivesLeft: state.revivesLeft - 1, reviveUsed: true, revivedRound: worst }, worst, true);
    }
  }
  return { ...state, phase: 'done' };
}

function revealNext(state: MemoryPalaceState): MemoryPalaceState {
  const round = currentRound(state);
  if (!round) return { ...state, phase: 'recall', ticksLeft: 0 };
  if (state.showIndex + 1 < round.items.length) {
    return {
      ...state,
      showIndex: state.showIndex + 1,
      ticksLeft: state.displayTicksByRound[state.roundIndex] ?? MIN_DISPLAY_TICKS,
    };
  }
  return { ...state, phase: 'recall', ticksLeft: 0 };
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The vivid caption of an item (what to picture), without the room or the word. */
export function captionText(item: PalaceItem, s: MemoryPalaceStrings): string {
  return s.prompts[item.promptId] ?? s.prompts[0] ?? '';
}

/** Where an item is shown: "In the hall". */
export function roomAtText(roomId: RoomId, s: MemoryPalaceStrings): string {
  return capitalise(s.roomAt[roomId]);
}

/** The full prompt, for the live region: "In the hall: lantern. Make the picture huge." */
export function promptText(state: MemoryPalaceState, item: PalaceItem, s: MemoryPalaceStrings): string {
  const colon = state.locale === 'fr' ? ' :' : ':';
  return `${roomAtText(item.roomId, s)}${colon} ${wordText(item.wordId, state.locale)}. ${captionText(item, s)}`;
}

export function outcomeLog(state: MemoryPalaceState, s: MemoryPalaceStrings): string[] {
  const lines: string[] = [];
  const { correct, total } = tally(state);
  for (let i = 0; i < state.rounds.length; i++) {
    const play = state.plays[i]!;
    const placedCorrect = play.placements.filter((p) => p.correct).length;
    lines.push(formatText(s.log.round, { n: i + 1, correct: placedCorrect, total: state.rounds[i]!.items.length }));
    if (play.hintsUsed > 0) lines.push(formatText(s.log.hint, { n: i + 1 }));
  }
  if (state.hasSocial) lines.push(s.log.social);
  if (state.reviveUsed) lines.push(formatText(s.log.revived, { n: state.revivedRound + 1 }));
  const end = state.forfeited ? s.log.endFled : accuracyPct(state) >= WIN_RATIO ? s.log.endWon : s.log.endLost;
  lines.push(formatText(end, { correct, total }));
  return lines;
}

/** Which technique tip a round carries (0..TIP_COUNT-1): the seed picks the start, each round moves on. */
export function tipIndex(seed: number, roundIndex: number): number {
  return ((seed >>> 0) + roundIndex) % TIP_COUNT;
}

function learnedNote(state: MemoryPalaceState): { topic: { en: string; fr: string }; note: { en: string; fr: string } } {
  const tip = tipIndex(state.seed, Math.max(0, state.rounds.length - 1));
  return {
    topic: { en: strings.en.learned.topic, fr: strings.fr.learned.topic },
    note: {
      en: formatText(strings.en.learned.note, { tip: strings.en.tips[tip] ?? '' }),
      fr: formatText(strings.fr.learned.note, { tip: strings.fr.tips[tip] ?? '' }),
    },
  };
}

function troopsUsed(state: MemoryPalaceState): string[] {
  const ids: string[] = [];
  if (state.studyMemberId) ids.push(state.studyMemberId);
  if (state.sleepMemberId) ids.push(state.sleepMemberId);
  if (state.socialMemberId) ids.push(state.socialMemberId);
  if (ids.length === 0 && state.memberIds[0]) ids.push(state.memberIds[0]);
  return ids;
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): MemoryPalaceState {
  const rng = mulberry32(fnv1a(`memory-palace:${seed >>> 0}`));
  const difficulty = run.difficulty;
  const study = memberByHabit(party, 'study');
  const sleep = memberByHabit(party, 'sleep');
  const social = memberByHabit(party, 'social');
  const sleepPower = sleep?.power ?? 0;
  const timeSeconds = buffAmount(run, 'time');
  const ticks = displayTicksFor(difficulty, sleepPower, timeSeconds);
  const counts = itemCounts(difficulty);
  const dCount = distractorCount(difficulty, buffAmount(run, 'luck'));
  const used: number[] = [];
  const rounds: RoundPlan[] = counts.map((count) => {
    const round = makeRound(rng, count, dCount, used);
    for (const it of round.items) used.push(it.wordId);
    for (const id of round.distractors) used.push(id);
    return round;
  });
  const hintsPerRound = (study ? 1 : 0) + buffAmount(run, 'hint');
  const hintLetters = study && study.power >= 40 ? 2 : 1;
  return {
    seed: seed >>> 0,
    locale,
    difficulty,
    phase: 'intro',
    roundIndex: 0,
    rounds,
    plays: rounds.map(() => emptyPlay()),
    showIndex: 0,
    ticksLeft: ticks,
    displayTicksByRound: rounds.map(() => ticks),
    hintsLeft: hintsPerRound,
    hintsPerRound,
    hintLetters,
    revivesLeft: buffAmount(run, 'revive'),
    reviveUsed: false,
    revivedRound: 0,
    forfeited: false,
    hasStudy: Boolean(study),
    hasSleep: Boolean(sleep),
    hasSocial: Boolean(social),
    studyMemberId: study?.id ?? '',
    sleepMemberId: sleep?.id ?? '',
    socialMemberId: social?.id ?? '',
    memberIds: party.members.map((m) => m.id),
  };
}

function reduce(state: MemoryPalaceState, action: MemoryPalaceAction): MemoryPalaceState {
  if (isOver(state)) return state;

  if (action.type === 'forfeit') return { ...state, forfeited: true, phase: 'done' };

  if (action.type === 'tick') {
    if (state.phase !== 'memorise') return state;
    if (state.ticksLeft > 1) return { ...state, ticksLeft: state.ticksLeft - 1 };
    return revealNext(state);
  }

  if (action.type === 'advance') {
    if (state.phase === 'intro') return { ...state, phase: 'memorise' };
    if (state.phase !== 'memorise') return state;
    return revealNext(state);
  }

  if (action.type === 'hint') {
    if (state.phase !== 'recall' || state.hintsLeft <= 0) return state;
    const round = currentRound(state);
    const play = currentPlay(state);
    if (!round || !play) return state;
    const used = new Set(placedIds(play));
    const hinted = new Set(play.hints.map((h) => h.wordId));
    const target = round.items.find((it) => !used.has(it.wordId) && !hinted.has(it.wordId));
    if (!target) return state;
    const hint: LetterHint = {
      wordId: target.wordId,
      roomId: target.roomId,
      prefix: wordPrefix(target.wordId, state.locale, state.hintLetters),
    };
    return {
      ...state,
      hintsLeft: state.hintsLeft - 1,
      plays: state.plays.map((p, i) =>
        i === state.roundIndex
          ? { ...p, hintsUsed: p.hintsUsed + 1, hints: [...p.hints, hint] }
          : p,
      ),
    };
  }

  if (action.type === 'place') {
    if (state.phase !== 'recall') return state;
    const round = currentRound(state);
    const play = currentPlay(state);
    if (!round || !play) return state;
    if (!ROOM_IDS.includes(action.roomId)) return state;
    const remaining = remainingChoices(state);
    if (!remaining.includes(action.wordId)) return state;
    const trueRoom = trueRoomOf(round, action.wordId);
    const placement: Placement = {
      wordId: action.wordId,
      roomId: action.roomId,
      correct: trueRoom === action.roomId,
    };
    const nextPlay: RoundPlay = { ...play, placements: [...play.placements, placement] };
    const next: MemoryPalaceState = {
      ...state,
      plays: state.plays.map((p, i) => (i === state.roundIndex ? nextPlay : p)),
    };
    if (nextPlay.placements.length >= round.items.length) return finishRound(next);
    return next;
  }

  return state;
}

function outcome(state: MemoryPalaceState): Outcome | null {
  if (!isOver(state)) return null;
  const { correct, total, hintsUsed } = tally(state);
  const pct = accuracyPct(state);
  const result = state.forfeited ? 'fled' : pct >= WIN_RATIO ? 'won' : 'lost';
  // 850 for every thing in place, 150 more when no letter was asked for; a left game counts for less.
  const ceiling = result === 'fled' ? FLED_SCORE_BASE : SCORE_BASE + (hintsUsed === 0 ? HINT_BONUS : 0);
  const raw = (ceiling * correct) / Math.max(1, total);
  return {
    result,
    score: clampScore(raw),
    log: outcomeLog(state, strings[state.locale]),
    troopsUsed: troopsUsed(state),
    learned: learnedNote(state),
    stats: {
      correct,
      total,
      hintsUsed,
      hintsPerRound: state.hintsPerRound,
      distractors: state.rounds[0]?.distractors.length ?? 0,
      displayTicks: state.displayTicksByRound[0] ?? 0,
      revived: state.reviveUsed ? 1 : 0,
      socialTips: state.hasSocial ? 1 : 0,
    },
  };
}

/** Percent chance (0..100) that the bot forgets a thing: by difficulty, less with a longer look. */
export function botErrorPct(state: MemoryPalaceState): number {
  const base = BOT_ERROR_PCT[state.difficulty] ?? 0;
  if (base === 0) return 0;
  const extra = (state.displayTicksByRound[0] ?? 0) - baseDisplayTicks(state.difficulty);
  const relief = Math.min(BOT_TIME_RELIEF_CAP, Math.max(0, Math.floor(extra / BOT_TICKS_PER_PCT)));
  return Math.max(0, base - relief);
}

/**
 * The bot walks the palace, then places every thing in order. It forgets some
 * things (more on hard runs). When it has a letter hint it spends it on a thing
 * it forgot, like a player would; without one it guesses a wrong room.
 * The kit's bot rng does not depend on the game seed, so the roll is mixed
 * with a hash of the seed, the round and the word: different palaces forget
 * different things, and the same palace always forgets the same ones.
 */
function botPlay(state: MemoryPalaceState, rng: () => number): MemoryPalaceAction | null {
  if (isOver(state)) return null;
  if (state.phase === 'intro') return { type: 'advance' };
  if (state.phase === 'memorise') return { type: 'tick' };
  if (state.phase !== 'recall') return null;
  const round = currentRound(state);
  const play = currentPlay(state);
  if (!round || !play) return null;
  const used = new Set(placedIds(play));
  const next = round.items.find((it) => !used.has(it.wordId));
  if (!next) return null;
  // A second walk through the same round (a revive) is a fresh draw and a better one: the player has seen it twice.
  const again = state.reviveUsed && state.roundIndex === state.revivedRound;
  const mix = fnv1a(`bot:${state.seed}:${state.roundIndex}:${next.wordId}:${again ? 'again' : 'first'}`) % 100;
  const roll = (Math.floor(rng() * 100) + mix) % 100;
  const hinted = play.hints.some((h) => h.wordId === next.wordId);
  if (hinted) {
    // A hint turns most forgotten things into remembered ones, not all of them.
    if (roll >= BOT_HINTED_MISS_PCT) return { type: 'place', wordId: next.wordId, roomId: next.roomId };
  } else if (roll >= (again ? Math.floor(botErrorPct(state) / 2) : botErrorPct(state))) {
    return { type: 'place', wordId: next.wordId, roomId: next.roomId };
  } else if (state.hintsLeft > 0) {
    return { type: 'hint' };
  }
  const others = ROOM_IDS.filter((id) => id !== next.roomId);
  const roomId = others[rngIntSafe(rng, others.length)] ?? next.roomId;
  return { type: 'place', wordId: next.wordId, roomId };
}

function forfeit(): MemoryPalaceAction {
  return { type: 'forfeit' };
}

export function secondsLeft(ticks: number): number {
  if (ticks <= 0) return 0;
  return Math.ceil((ticks * FIXED_DT_MS) / 1000);
}

export const engine: GameEngine<MemoryPalaceState, MemoryPalaceAction> = { initial, reduce, outcome, botPlay, forfeit };
