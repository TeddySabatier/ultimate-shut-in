/**
 * Word Forge: a pure spaced-repetition vocabulary engine.
 *
 * A run draws 20 words. Wrong answers return after 2 cards, then 5; a first
 * right (or almost) returns once more after 8 (6 if Study is in the party)
 * for a final check. Score is accuracy, streak and speed. The bot never
 * reads a clock: the Screen sends `{ type: 'second' }`.
 */
import { fnv1a, mulberry32, rngInt, rngWeightedIndex, type Rng } from '../../game/rng';
import {
  buffAmount,
  clampScore,
  formatText,
  turnRng,
  type GameEngine,
  type Locale,
  type Outcome,
  type Party,
  type RunContext,
} from '../contract';
import { strings, type WordForgeStrings } from './strings';
import {
  MAX_SHOWS,
  WORDS,
  WORDS_PER_RUN,
  decksForDifficulty,
  getWord,
  wordsInDecks,
  type WordEntry,
} from './words';

export type Verdict = 'right' | 'almost' | 'wrong';
export type InputMode = 'choice' | 'typed';

export interface Mark {
  id: string;
  verdict: Verdict;
  credit: number;
}

export interface WordProgress {
  id: string;
  shows: number;
  wrongs: number;
  scheduledFinal: boolean;
}

export interface WordForgeState {
  seed: number;
  step: number;
  locale: Locale;
  learns: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  inputMode: InputMode;
  accentTolerance: boolean;
  hasStudy: boolean;
  hasSocial: boolean;
  hasEat: boolean;
  eatPower: number;
  socialHintLeft: number;
  hintsLeft: number;
  revivesLeft: number;
  parSeconds: number;
  seconds: number;
  wordIds: string[];
  queue: string[];
  currentId: string | null;
  options: string[];
  revealed: boolean;
  progress: WordProgress[];
  marks: Mark[];
  streak: number;
  maxStreak: number;
  forfeited: boolean;
  partyIds: string[];
}

export type WordForgeAction =
  | { type: 'choose'; index: number }
  | { type: 'type'; text: string }
  | { type: 'hint' }
  | { type: 'flip' }
  | { type: 'toggleAccents' }
  | { type: 'second' }
  | { type: 'forfeit' };

const BASE_SECONDS = 180;
const RIGHT_GAP = 8;
const STUDY_RIGHT_GAP = 6;
const FIRST_MISS_GAP = 2;
const LATER_MISS_GAP = 5;
const WIN_ACCURACY = 0.7;
const STUDY_BOT_BONUS = 0.03;
const BOT_HIT = [0, 0.8, 0.62, 0.5, 0.47, 0.41] as const;

const APOSTROPHES = /['\u2018\u2019\u02BC\u0060]/g;
const HYPHENS = /[\u2010-\u2014\u2212]/g;
const MARKS = /\p{M}/gu;

export function promptOf(word: WordEntry, learns: Locale): string {
  return learns === 'fr' ? word.en : word.fr;
}

export function targetOf(word: WordEntry, learns: Locale): string {
  return learns === 'fr' ? word.fr : word.en;
}

export function currentWord(state: WordForgeState): WordEntry | undefined {
  return state.currentId ? getWord(state.currentId) : undefined;
}

export function currentPrompt(state: WordForgeState): string {
  const w = currentWord(state);
  return w ? promptOf(w, state.learns) : '';
}

export function currentTarget(state: WordForgeState): string {
  const w = currentWord(state);
  return w ? targetOf(w, state.learns) : '';
}

export function heat(state: WordForgeState): number {
  return Math.max(0, Math.min(100, state.streak * 12));
}

export function isOver(state: WordForgeState): boolean {
  if (state.forfeited) return true;
  return state.currentId === null && state.queue.length === 0 && state.marks.length > 0;
}

/** A word is worth 1 when it was never missed, 0.6 of its final credit when it needed the forge again. */
export const RECOVERED_FACTOR = 0.6;

export function creditSum(state: WordForgeState): number {
  const last = new Map<string, number>();
  for (const m of state.marks) last.set(m.id, m.credit);
  const missed = new Set(state.progress.filter((p) => p.wrongs > 0).map((p) => p.id));
  let sum = 0;
  for (const id of state.wordIds) sum += (last.get(id) ?? 0) * (missed.has(id) ? RECOVERED_FACTOR : 1);
  return sum;
}

export function accuracyOf(state: WordForgeState): number {
  return creditSum(state) / WORDS_PER_RUN;
}

export function rightGap(state: Pick<WordForgeState, 'hasStudy'>): number {
  return state.hasStudy ? STUDY_RIGHT_GAP : RIGHT_GAP;
}

/** NFC, trim, collapse spaces, lower case, fold apostrophes, dashes and the ligatures oe/ae. Optionally strip accents. */
export function normalizeAnswer(raw: string, stripAccents: boolean): string {
  let s = raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  // Ligatures are not accents and are hard to type: oe/ae always count.
  s = s.replace(APOSTROPHES, "'").replace(HYPHENS, '-').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  if (stripAccents) {
    s = s.normalize('NFD').replace(MARKS, '').normalize('NFC');
  }
  return s;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev: number[] = [];
  for (let j = 0; j <= n; j++) prev.push(j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (cur[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      cur.push(Math.min(del, ins, sub));
    }
    prev = cur;
  }
  return prev[n] ?? n;
}

export function gradeTyped(answer: string, expected: string, stripAccents: boolean): { verdict: Verdict; credit: number } {
  const got = normalizeAnswer(answer, stripAccents);
  const want = normalizeAnswer(expected, stripAccents);
  if (got.length === 0) return { verdict: 'wrong', credit: 0 };
  if (got === want) return { verdict: 'right', credit: 1 };
  // Strict mode: the right letters with accents missing or wrong are "almost", however many accents.
  if (!stripAccents && normalizeAnswer(answer, true) === normalizeAnswer(expected, true)) return { verdict: 'almost', credit: 0.5 };
  if (want.length >= 3 && levenshtein(got, want) <= 1) return { verdict: 'almost', credit: 0.5 };
  return { verdict: 'wrong', credit: 0 };
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function insertAfter(queue: readonly string[], delay: number, id: string): string[] {
  const i = Math.min(Math.max(0, delay), queue.length);
  return [...queue.slice(0, i), id, ...queue.slice(i)];
}

function progressOf(state: WordForgeState, id: string): WordProgress {
  return state.progress.find((p) => p.id === id) ?? { id, shows: 0, wrongs: 0, scheduledFinal: false };
}

function optionsFor(rng: Rng, word: WordEntry, pool: readonly WordEntry[]): string[] {
  const samePos = pool.filter((w) => w.id !== word.id && w.pos === word.pos);
  const rest = pool.filter((w) => w.id !== word.id && w.pos !== word.pos);
  const picks = [word.id];
  for (const w of shuffle(rng, [...samePos, ...rest])) {
    if (picks.length >= 4) break;
    if (w.en === word.en || w.fr === word.fr) continue;
    picks.push(w.id);
  }
  if (picks.length < 4) {
    for (const w of shuffle(rng, WORDS)) {
      if (picks.length >= 4) break;
      if (picks.includes(w.id) || w.en === word.en || w.fr === word.fr) continue;
      picks.push(w.id);
    }
  }
  return shuffle(rng, picks);
}

function pickWords(rng: Rng, decks: readonly WordEntry['deck'][], hasEat: boolean, longer: boolean, luckSwaps: number, learns: Locale): string[] {
  let pool = wordsInDecks(decks);
  if (longer) {
    const long = pool.filter((w) => targetOf(w, learns).length >= 6);
    if (long.length >= WORDS_PER_RUN) pool = long;
  }
  const remaining = [...pool];
  const chosen: WordEntry[] = [];
  while (chosen.length < WORDS_PER_RUN && remaining.length > 0) {
    const weights = remaining.map((w) => (hasEat && w.deck === 'food' ? 3 : 1));
    const i = rngWeightedIndex(rng, weights);
    chosen.push(remaining[i]!);
    remaining.splice(i, 1);
  }
  if (luckSwaps > 0 && remaining.length > 0) {
    const n = Math.min(luckSwaps, chosen.length, remaining.length);
    const byLen = [...chosen].sort((a, b) => targetOf(b, learns).length - targetOf(a, learns).length);
    const easier = [...remaining].sort((a, b) => targetOf(a, learns).length - targetOf(b, learns).length);
    for (let k = 0; k < n; k++) {
      const hard = byLen[k];
      const easy = easier[k];
      if (!hard || !easy) break;
      const idx = chosen.findIndex((w) => w.id === hard.id);
      if (idx >= 0) chosen[idx] = easy;
    }
  }
  return chosen.map((w) => w.id);
}

function deal(state: WordForgeState, rng: Rng): WordForgeState {
  const currentId = state.queue[0];
  if (!currentId) return { ...state, currentId: null, options: [], revealed: false };
  const word = getWord(currentId);
  const queue = state.queue.slice(1);
  let revealed = false;
  let socialHintLeft = state.socialHintLeft;
  if (state.inputMode === 'typed' && socialHintLeft > 0) {
    revealed = true;
    socialHintLeft -= 1;
  }
  const decks = decksForDifficulty(state.difficulty);
  const options = state.inputMode === 'choice' && word ? optionsFor(rng, word, wordsInDecks(decks)) : [];
  return { ...state, queue, currentId, options, revealed, socialHintLeft };
}

function applyAnswer(state: WordForgeState, verdict: Verdict, credit: number): WordForgeState {
  const id = state.currentId;
  if (!id) return state;
  const prev = progressOf(state, id);
  const shows = prev.shows + 1;
  const wrongs = verdict === 'wrong' ? prev.wrongs + 1 : prev.wrongs;
  let streak = state.streak;
  let revivesLeft = state.revivesLeft;
  if (verdict === 'wrong') {
    if (revivesLeft > 0) {
      revivesLeft -= 1;
    } else {
      streak = 0;
    }
  } else {
    streak += 1;
  }
  const scheduledFinal = prev.scheduledFinal || credit >= 0.5;
  let queue = state.queue;
  if (shows < MAX_SHOWS) {
    if (credit < 0.5) {
      queue = insertAfter(queue, wrongs <= 1 ? FIRST_MISS_GAP : LATER_MISS_GAP, id);
    } else if (!prev.scheduledFinal) {
      queue = insertAfter(queue, rightGap(state), id);
    }
  }
  const next: WordForgeState = {
    ...state,
    queue,
    progress: [...state.progress.filter((p) => p.id !== id), { id, shows, wrongs, scheduledFinal }],
    marks: [...state.marks, { id, verdict, credit }],
    streak,
    maxStreak: Math.max(state.maxStreak, streak),
    revivesLeft,
    step: state.step + 1,
  };
  return deal(next, turnRng(next.seed, next.marks.length));
}

export function outcomeLog(state: WordForgeState, s: WordForgeStrings): string[] {
  const lines: string[] = [];
  const tail = state.marks.slice(-8);
  for (const m of tail) {
    const w = getWord(m.id);
    if (!w) continue;
    const known = state.learns === 'fr' ? w.en : w.fr;
    const forged = state.learns === 'fr' ? w.fr : w.en;
    const result = m.verdict === 'right' ? s.log.right : m.verdict === 'almost' ? s.log.almost : s.log.wrong;
    lines.push(formatText(s.log.card, { known, forged, result }));
  }
  const acc = Math.round(accuracyOf(state) * 100);
  const end = state.forfeited ? s.log.endFled : accuracyOf(state) >= WIN_ACCURACY ? s.log.endWon : s.log.endLost;
  lines.push(formatText(end, { n: state.marks.length, acc, streak: state.maxStreak }));
  return lines;
}

function hardestThree(state: WordForgeState): WordEntry[] {
  const wrongs = new Map<string, number>();
  const credit = new Map<string, number>();
  for (const p of state.progress) wrongs.set(p.id, p.wrongs);
  for (const m of state.marks) credit.set(m.id, m.credit);
  const ids = state.wordIds.slice();
  ids.sort((a, b) => {
    const dw = (wrongs.get(b) ?? 0) - (wrongs.get(a) ?? 0);
    if (dw !== 0) return dw;
    const dc = (credit.get(a) ?? 1) - (credit.get(b) ?? 1);
    if (dc !== 0) return dc;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out: WordEntry[] = [];
  for (const id of ids) {
    const w = getWord(id);
    if (w) out.push(w);
    if (out.length >= 3) break;
  }
  return out;
}

function eatCorrect(state: WordForgeState): number {
  let n = 0;
  const last = new Map<string, Mark>();
  for (const m of state.marks) last.set(m.id, m);
  for (const id of state.wordIds) {
    const m = last.get(id);
    const w = getWord(id);
    if (m && w?.deck === 'food' && m.credit >= 1) n += 1;
  }
  return n;
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): WordForgeState {
  const rng = mulberry32(fnv1a(`word-forge:${seed >>> 0}`));
  const difficulty = run.difficulty;
  const inputMode: InputMode = difficulty <= 2 ? 'choice' : 'typed';
  const habits = new Set(party.members.map((m) => m.habit));
  const hasStudy = habits.has('study');
  const hasSocial = habits.has('social');
  const eatMember = party.members.find((m) => m.habit === 'eat');
  const hasEat = Boolean(eatMember);
  const eatPower = eatMember?.power ?? 0;
  const avgPower = party.members.length === 0 ? 0 : Math.round(party.members.reduce((n, m) => n + m.power, 0) / party.members.length);
  const luckSwaps = Math.max(0, Math.round((WORDS_PER_RUN * buffAmount(run, 'luck')) / 100));
  const learns: Locale = locale === 'en' ? 'fr' : 'en';
  const wordIds = pickWords(rng, decksForDifficulty(difficulty), hasEat, difficulty >= 5, luckSwaps, learns);
  const parSeconds = BASE_SECONDS + buffAmount(run, 'time') + Math.floor(avgPower / 11);
  const base: WordForgeState = {
    seed: seed >>> 0,
    step: 0,
    locale,
    learns,
    difficulty,
    inputMode,
    accentTolerance: difficulty <= 3,
    hasStudy,
    hasSocial,
    hasEat,
    eatPower,
    socialHintLeft: hasSocial && inputMode === 'typed' ? 1 : 0,
    hintsLeft: buffAmount(run, 'hint'),
    revivesLeft: buffAmount(run, 'revive'),
    parSeconds,
    seconds: 0,
    wordIds,
    queue: wordIds,
    currentId: null,
    options: [],
    revealed: false,
    progress: [],
    marks: [],
    streak: 0,
    maxStreak: 0,
    forfeited: false,
    partyIds: party.members.map((m) => m.id),
  };
  return deal(base, turnRng(base.seed, 0));
}

function reduce(state: WordForgeState, action: WordForgeAction): WordForgeState {
  if (isOver(state)) return state;
  if (action.type === 'forfeit') return { ...state, forfeited: true };
  if (action.type === 'second') {
    return { ...state, seconds: state.seconds + 1 };
  }
  if (action.type === 'flip') {
    const learns: Locale = state.learns === 'en' ? 'fr' : 'en';
    return { ...state, learns, step: state.step + 1 };
  }
  if (action.type === 'toggleAccents') {
    if (state.inputMode !== 'typed') return state;
    return { ...state, accentTolerance: !state.accentTolerance, step: state.step + 1 };
  }
  if (action.type === 'hint') {
    if (state.hintsLeft <= 0 || state.revealed || !state.currentId) return state;
    return { ...state, hintsLeft: state.hintsLeft - 1, revealed: true, step: state.step + 1 };
  }
  if (action.type === 'choose') {
    if (state.inputMode !== 'choice' || !state.currentId) return state;
    const picked = state.options[action.index];
    if (!picked) return state;
    const verdict: Verdict = picked === state.currentId ? 'right' : 'wrong';
    return applyAnswer(state, verdict, verdict === 'right' ? 1 : 0);
  }
  if (action.type === 'type') {
    if (state.inputMode !== 'typed' || !state.currentId) return state;
    const expected = currentTarget(state);
    const { verdict, credit } = gradeTyped(action.text, expected, state.accentTolerance);
    return applyAnswer(state, verdict, credit);
  }
  return state;
}

function outcome(state: WordForgeState): Outcome | null {
  if (!isOver(state)) return null;
  const acc = accuracyOf(state);
  const result = state.forfeited ? 'fled' : acc >= WIN_ACCURACY ? 'won' : 'lost';
  const remaining = Math.max(0, state.parSeconds - state.seconds);
  const speed = state.parSeconds > 0 ? (150 * remaining) / state.parSeconds : 0;
  const streakScore = 150 * Math.min(1, state.maxStreak / 10);
  const eatBonus = state.hasEat ? eatCorrect(state) * (5 + Math.floor(state.eatPower / 10)) : 0;
  const score = clampScore(700 * acc + streakScore + speed + eatBonus);
  const hard = hardestThree(state);
  const list = hard.map((w) => `${w.en} / ${w.fr}`).join(' · ');
  const s = strings[state.locale];
  return {
    result,
    score,
    log: outcomeLog(state, s),
    troopsUsed: state.partyIds,
    learned: {
      topic: { en: strings.en.learned.topic, fr: strings.fr.learned.topic },
      note: {
        en: formatText(strings.en.learned.note, { list }),
        fr: formatText(strings.fr.learned.note, { list }),
      },
    },
    stats: {
      cards: state.marks.length,
      accuracy: Math.round(acc * 100),
      streak: state.maxStreak,
      seconds: state.seconds,
    },
  };
}

function mutateWrong(expected: string, rng: Rng): string {
  if (expected.length <= 1) return `${expected}x`;
  const cut = Math.max(1, expected.length - 1 - rngInt(rng, Math.min(2, expected.length - 1)));
  return expected.slice(0, cut);
}

function botPlay(state: WordForgeState, given: () => number): WordForgeAction | null {
  if (isOver(state)) return null;
  if (state.seconds < state.parSeconds && state.seconds < Math.floor(state.marks.length / 2)) return { type: 'second' };
  // The kit's bot stream does not depend on the seed, so mix in a per-card stream derived from the game's
  // seed: the bot misses different cards in different games, and the same ones when replayed.
  const own = turnRng(state.seed, 7000 + state.marks.length);
  const rng = () => (given() + own()) % 1;
  // Study puts the example sentence on the card: that is worth a few points of accuracy to a player, and to the bot.
  const hit = (BOT_HIT[state.difficulty] ?? 0.7) + (state.hasStudy ? STUDY_BOT_BONUS : 0);
  const success = rng() < hit;
  if (state.inputMode === 'choice') {
    if (!state.currentId || state.options.length === 0) return { type: 'choose', index: 0 };
    if (success) {
      const index = state.options.indexOf(state.currentId);
      return { type: 'choose', index: index < 0 ? 0 : index };
    }
    const others = state.options.map((_, i) => i).filter((i) => state.options[i] !== state.currentId);
    return { type: 'choose', index: others[rngInt(rng, others.length)] ?? 0 };
  }
  const expected = currentTarget(state);
  if (success) return { type: 'type', text: expected };
  if (rng() < 0.35 && expected.length >= 3) {
    const almost = expected.slice(0, expected.length - 1) + (expected.endsWith('e') ? 'a' : 'e');
    return { type: 'type', text: almost };
  }
  return { type: 'type', text: mutateWrong(expected, rng) };
}

function forfeit(): WordForgeAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<WordForgeState, WordForgeAction> = { initial, reduce, outcome, botPlay, forfeit };
