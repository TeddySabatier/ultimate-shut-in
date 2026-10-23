/**
 * Reading Race: a paced reading game with comprehension questions.
 *
 * Time is a `{ type: 'tick' }` action worth FIXED_DT_MS (50 ms). Words advance
 * when an accumulator of `wpm` units reaches WORD_COST (1200), which is exact
 * integer timing: words per minute = words * 1200 / ticks. The engine never
 * reads a clock and never needs the passage text: it works from `meta.ts`
 * (word counts, sentence starts, the topic sentence and the right answers).
 *
 * Score = comprehension x a speed factor, capped so that racing ahead of
 * understanding cannot inflate the result. A win is 70 percent comprehension
 * or better; speed never decides the finish on its own.
 */
import { fnv1a, mulberry32, rngInt, rngPick, type Rng } from '../../game/rng';
import {
  buffAmount,
  clampScore,
  FIXED_DT_MS,
  formatText,
  turnRng,
  type GameEngine,
  type Locale,
  type Outcome,
  type Party,
  type RunContext,
} from '../contract';
import { META, type PassageMeta, type ReadingLevel } from './meta';
import { strings, type ReadingRaceStrings } from './strings';

export const PASSAGES_PER_GAME = 3;
export const QUESTIONS_PER_PASSAGE = 3;
export const OPTIONS_PER_QUESTION = 4;
export const QUESTIONS_TOTAL = PASSAGES_PER_GAME * QUESTIONS_PER_PASSAGE;
export const MIN_WPM = 180;
export const MAX_WPM = 480;
export const WPM_STEP = 20;
/** Accumulator units that equal one word at 1 wpm for one minute of ticks (1200). */
export const WORD_COST = 60_000 / FIXED_DT_MS;
/** Points a paid re-read costs. */
export const REREAD_COST = 5;
/** Comprehension (percent of the nine questions) that wins the race. */
export const WIN_COMP_PERCENT = 70;
/** Comprehension of one passage (percent) that makes its pace "comprehension-safe". */
export const SAFE_COMP_PERCENT = 80;
export const PHRASE_WORDS = 3;
/** A Social troop from this power on (about level 9) hides a second wrong option on the first question. */
export const SOCIAL_STRONG_POWER = 30;
/** Extra cost (accumulator units) of the first word of each sentence for a Sleep troop: base, then per power. */
export const SLEEP_LINGER_BASE = 240;
export const SLEEP_LINGER_PER_POWER = 6;
/** Extra cost of each word of the topic sentence for a Study troop: base, then per power. */
export const STUDY_LINGER_BASE = 120;
export const STUDY_LINGER_PER_POWER = 4;

export type Phase = 'ready' | 'reading' | 'questions' | 'interlude' | 'done';

export interface AnswerRecord {
  passageIndex: number;
  questionIndex: number;
  option: number;
  correct: boolean;
}

export interface ReadingRaceState {
  seed: number;
  step: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  phase: Phase;
  forfeited: boolean;
  memberIds: string[];
  hasStudy: boolean;
  hasSleep: boolean;
  hasSocial: boolean;
  studyPower: number;
  sleepPower: number;
  socialPower: number;
  /** Hints from the `hint` buff that are still unused. */
  hintsLeft: number;
  hintsUsed: number;
  /** Passages the `time` buff still lets the player re-read for free. */
  freePassagesLeft: number;
  /** The passage being read is one of those free passages. */
  passageFree: boolean;
  /** The `luck` buff swapped a harder passage for an easier one. */
  luckApplied: boolean;
  wpm: number;
  phraseMode: boolean;
  autoRamp: boolean;
  sentenceMode: boolean;
  plans: PassageMeta[];
  passageIndex: number;
  /** Start index of the words currently shown. */
  wordIndex: number;
  /** How far the race has revealed (exclusive). */
  wordsShown: number;
  paceAccum: number;
  readTicks: number;
  questionIndex: number;
  /** Per question of the current passage: the wrong options that are hidden. */
  hiddenByQuestion: number[][];
  answers: AnswerRecord[];
  paidRereads: number;
  /** Chosen (or, in sentence mode, measured) wpm for each finished passage. */
  passageWpms: number[];
  /** Wrong options hidden across the whole race (Social troop and hints). */
  hiddenTotal: number;
}

export type ReadingRaceAction =
  | { type: 'tick' }
  | { type: 'start' }
  | { type: 'continue' }
  | { type: 'setPace'; wpm: number }
  | { type: 'setPhrase'; on: boolean }
  | { type: 'setRamp'; on: boolean }
  | { type: 'setSentenceMode'; on: boolean }
  | { type: 'reread' }
  | { type: 'advance' }
  | { type: 'answer'; option: number }
  | { type: 'hint' }
  | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function isOver(state: ReadingRaceState): boolean {
  return state.forfeited || state.phase === 'done';
}

export function currentPlan(state: ReadingRaceState): PassageMeta | null {
  return state.plans[state.passageIndex] ?? null;
}

export function sentenceStartAt(starts: readonly number[], index: number): number {
  let start = 0;
  for (const s of starts) {
    if (s <= index) start = s;
    else break;
  }
  return start;
}

export function nextSentenceStart(starts: readonly number[], from: number, wordCount: number): number {
  for (const s of starts) {
    if (s > from) return s;
  }
  return wordCount;
}

/** The words on screen now, as a [start, end) range of word indices; null when nothing is being read. */
export function visibleRange(state: ReadingRaceState): [number, number] | null {
  if (state.phase !== 'reading') return null;
  const plan = currentPlan(state);
  if (!plan) return null;
  if (state.sentenceMode) {
    const start = sentenceStartAt(plan.sentenceStarts, state.wordIndex);
    return [start, nextSentenceStart(plan.sentenceStarts, start, plan.wordCount)];
  }
  const n = state.phraseMode ? PHRASE_WORDS : 1;
  return [state.wordIndex, Math.min(plan.wordCount, state.wordIndex + n)];
}

export function correctCount(state: ReadingRaceState): number {
  return state.answers.filter((a) => a.correct).length;
}

export function comprehensionPercent(state: ReadingRaceState): number {
  if (state.answers.length === 0) return 0;
  return Math.floor((correctCount(state) * 100) / state.answers.length);
}

/** The slowest pace a difficulty allows: 180 wpm at difficulty 1, 20 more per level. */
export function paceFloor(difficulty: number): number {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return MIN_WPM + (d - 1) * WPM_STEP;
}

export function isValidWpm(wpm: number, difficulty = 1): boolean {
  return Number.isInteger(wpm) && wpm >= paceFloor(difficulty) && wpm <= MAX_WPM && (wpm - MIN_WPM) % WPM_STEP === 0;
}

export function startingWpm(difficulty: number): number {
  return paceFloor(difficulty);
}

export function levelsFor(difficulty: number): ReadingLevel[] {
  if (difficulty <= 1) return [1];
  if (difficulty === 2) return [1, 2];
  if (difficulty === 3) return [1, 2, 3];
  if (difficulty === 4) return [2, 3];
  return [3];
}

/** Uncapped speed factor: 700 at 180 wpm, 1000 at 480 wpm. */
export function speedFactor(avgWpm: number): number {
  const w = Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(avgWpm)));
  return 700 + (w - MIN_WPM);
}

export function averageWpm(state: ReadingRaceState): number {
  if (state.passageWpms.length === 0) return state.wpm;
  const sum = state.passageWpms.reduce((a, b) => a + b, 0);
  return Math.round(sum / state.passageWpms.length);
}

/**
 * Score 0 to 1000. Each right answer is worth `effective / total`, where
 * `effective` is the speed factor held under a cap that rises only with
 * comprehension (400 with nothing right, 1000 with everything right). Reading
 * faster therefore never rescues poor comprehension, and never lowers a good
 * one. Every paid re-read costs REREAD_COST.
 */
export function scoreFrom(correct: number, total: number, avgWpm: number, paidRereads: number): number {
  if (total <= 0) return clampScore(0 - REREAD_COST * paidRereads);
  const speed = speedFactor(avgWpm);
  const cap = 400 + Math.floor((600 * correct) / total);
  const effective = Math.min(speed, cap);
  return clampScore(Math.floor((correct * effective) / total) - REREAD_COST * paidRereads);
}

export function scoreOf(state: ReadingRaceState): number {
  return scoreFrom(correctCount(state), QUESTIONS_TOTAL, averageWpm(state), state.paidRereads);
}

export function wonComprehension(state: ReadingRaceState): boolean {
  return correctCount(state) * 100 >= WIN_COMP_PERCENT * QUESTIONS_TOTAL;
}

/** Accumulator units one word costs: the base plus the Sleep and Study lingers. */
export function wordCost(state: ReadingRaceState, index: number, plan: PassageMeta): number {
  let cost = WORD_COST;
  if (state.hasSleep && plan.sentenceStarts.includes(index)) cost += SLEEP_LINGER_BASE + state.sleepPower * SLEEP_LINGER_PER_POWER;
  if (state.hasStudy && index < plan.topicEnd) cost += STUDY_LINGER_BASE + state.studyPower * STUDY_LINGER_PER_POWER;
  return cost;
}

export function groupCost(state: ReadingRaceState, start: number, count: number, plan: PassageMeta): number {
  let cost = 0;
  for (let i = 0; i < count; i++) cost += wordCost(state, start + i, plan);
  return cost;
}

export function lastPassageCorrect(state: ReadingRaceState): number {
  const p = state.passageIndex;
  return state.answers.filter((a) => a.passageIndex === p && a.correct).length;
}

/** Correct answers on one finished passage. */
export function passageCorrect(state: ReadingRaceState, passageIndex: number): number {
  return state.answers.filter((a) => a.passageIndex === passageIndex && a.correct).length;
}

/**
 * The best pace at which a passage was still understood (80 percent or better,
 * which with three questions means all three). When no passage reached it, the
 * slowest pace tried is offered as the next thing to try.
 */
export function safeWpm(state: ReadingRaceState): { wpm: number; reached: boolean } {
  let best = 0;
  let reached = false;
  for (let i = 0; i < state.passageWpms.length; i++) {
    if (passageCorrect(state, i) * 100 >= SAFE_COMP_PERCENT * QUESTIONS_PER_PASSAGE) {
      reached = true;
      const w = state.passageWpms[i] ?? MIN_WPM;
      if (w > best) best = w;
    }
  }
  if (reached) return { wpm: best, reached: true };
  const fallback = state.passageWpms.length > 0 ? Math.min(...state.passageWpms) : state.wpm;
  return { wpm: fallback, reached: false };
}

export function highlightTopic(state: ReadingRaceState): boolean {
  return state.hasStudy && state.phase === 'reading';
}

export function inTopicSentence(state: ReadingRaceState, index: number): boolean {
  const plan = currentPlan(state);
  return !!plan && index < plan.topicEnd;
}

export function hiddenCount(state: ReadingRaceState): number {
  return state.hiddenTotal;
}

/** Options still on screen for the current question. */
export function visibleOptions(state: ReadingRaceState): number[] {
  const hidden = state.hiddenByQuestion[state.questionIndex] ?? [];
  return [0, 1, 2, 3].filter((i) => !hidden.includes(i));
}

/** Percent the bot knows the current question outright (falls as the pace rises and the passage gets harder). */
export const BOT_BASE_PERCENT = [74, 54, 50, 46, 44] as const;

export function botKnowsChance(state: ReadingRaceState): number {
  const steps = (state.wpm - paceFloor(state.difficulty)) / WPM_STEP;
  const level = currentPlan(state)?.level ?? 1;
  let p = (BOT_BASE_PERCENT[state.difficulty - 1] ?? 60) - steps * 5 - (level - 1) * 6;
  if (state.hasStudy) p += 2;
  if (state.hasSleep) p += 1;
  if (p < 8) p = 8;
  if (p > 95) p = 95;
  return p / 100;
}

export function outcomeLog(state: ReadingRaceState, s: ReadingRaceStrings): string[] {
  const lines: string[] = [formatText(s.log.start, { wpm: startingWpm(state.difficulty) })];
  for (let i = 0; i < state.plans.length; i++) {
    const plan = state.plans[i]!;
    if (state.answers.some((a) => a.passageIndex === i) || state.passageWpms[i] !== undefined) {
      lines.push(
        formatText(s.log.passage, {
          n: i + 1,
          topic: plan.topic,
          level: plan.level,
          wpm: state.passageWpms[i] ?? state.wpm,
          correct: passageCorrect(state, i),
          total: QUESTIONS_PER_PASSAGE,
        }),
      );
    }
  }
  if (state.hiddenTotal > 0) lines.push(formatText(s.log.hidden, { n: state.hiddenTotal }));
  if (state.paidRereads > 0) lines.push(formatText(s.log.reread, { n: state.paidRereads }));
  const percent = Math.floor((correctCount(state) * 100) / QUESTIONS_TOTAL);
  const end = state.forfeited ? s.log.endFled : wonComprehension(state) ? s.log.endWon : s.log.endLost;
  lines.push(formatText(end, { percent }));
  return lines;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

function pickPlans(locale: Locale, difficulty: number, luck: number, rng: Rng): { plans: PassageMeta[]; luckApplied: boolean } {
  const all = META[locale];
  const allowed = new Set(levelsFor(difficulty));
  let pool = all.filter((p) => allowed.has(p.level));
  if (pool.length < PASSAGES_PER_GAME) pool = all.slice();
  const picked = shuffled(pool, rng).slice(0, PASSAGES_PER_GAME);
  let luckApplied = false;
  if (luck > 0 && picked.length > 0) {
    // Luck: the hardest passage of the draw is swapped for an easier one.
    let hardest = 0;
    for (let i = 1; i < picked.length; i++) if ((picked[i]?.level ?? 0) > (picked[hardest]?.level ?? 0)) hardest = i;
    const used = new Set(picked.map((p) => p.id));
    const easier = all.filter((p) => p.level < (picked[hardest]?.level ?? 1) && !used.has(p.id));
    if (easier.length > 0) {
      picked[hardest] = rngPick(rng, easier);
      luckApplied = true;
    }
  }
  return { plans: picked, luckApplied };
}

function firstMember(party: Party, habit: string): { power: number } | null {
  const m = party.members.find((x) => x.habit === habit);
  return m ? { power: m.power } : null;
}

function revealCount(phraseMode: boolean, remaining: number): number {
  if (remaining <= 0) return 0;
  return phraseMode ? Math.min(PHRASE_WORDS, remaining) : 1;
}

function beginReading(state: ReadingRaceState, passageIndex: number): ReadingRaceState {
  const plan = state.plans[passageIndex];
  if (!plan) return { ...state, phase: 'done' };
  const n = revealCount(state.phraseMode, plan.wordCount);
  return {
    ...state,
    phase: 'reading',
    passageIndex,
    wordIndex: 0,
    wordsShown: n,
    paceAccum: 0,
    readTicks: 0,
    questionIndex: 0,
    passageFree: false,
    hiddenByQuestion: [[], [], []],
  };
}

/** Pick one still-visible wrong option of a question to hide, from a fresh seeded draw. */
function hideOneWrong(state: ReadingRaceState, hidden: number[], correct: number): { hidden: number[]; step: number } | null {
  const wrongs = [0, 1, 2, 3].filter((i) => i !== correct && !hidden.includes(i));
  if (wrongs.length === 0) return null;
  const rng = turnRng(state.seed, state.step);
  const pick = wrongs[rngInt(rng, wrongs.length)] ?? wrongs[0]!;
  return { hidden: [...hidden, pick], step: state.step + 1 };
}

function enterQuestions(state: ReadingRaceState): ReadingRaceState {
  const plan = currentPlan(state);
  if (!plan) return { ...state, phase: 'done' };
  let work: ReadingRaceState = state;
  const hiddenByQuestion: number[][] = [];
  for (let q = 0; q < QUESTIONS_PER_PASSAGE; q++) {
    const correct = plan.answers[q] ?? 0;
    let hidden: number[] = [];
    if (work.hasSocial) {
      const wanted = work.socialPower >= SOCIAL_STRONG_POWER && q === 0 ? 2 : 1;
      for (let k = 0; k < wanted; k++) {
        const next = hideOneWrong(work, hidden, correct);
        if (!next) break;
        hidden = next.hidden;
        work = { ...work, step: next.step };
      }
    }
    hiddenByQuestion.push(hidden);
  }
  const added = hiddenByQuestion.reduce((n, row) => n + row.length, 0);
  return {
    ...work,
    phase: 'questions',
    hiddenByQuestion,
    hiddenTotal: work.hiddenTotal + added,
    questionIndex: 0,
    wordsShown: plan.wordCount,
  };
}

function measuredWpm(state: ReadingRaceState, plan: PassageMeta): number {
  if (state.sentenceMode && state.readTicks > 0) {
    const raw = Math.round((plan.wordCount * WORD_COST) / state.readTicks);
    return Math.max(MIN_WPM, Math.min(MAX_WPM, raw));
  }
  return state.wpm;
}

function finishPassage(state: ReadingRaceState): ReadingRaceState {
  const plan = currentPlan(state);
  const wpm = plan ? measuredWpm(state, plan) : state.wpm;
  const passageWpms = [...state.passageWpms, wpm];
  if (state.passageIndex >= PASSAGES_PER_GAME - 1) {
    return { ...state, phase: 'done', passageWpms };
  }
  return { ...state, phase: 'interlude', passageWpms };
}

/** What the auto-ramp does after a passage: faster after a clean one, a step back after a poor one. */
export function rampedWpm(state: ReadingRaceState): number {
  const right = lastPassageCorrect(state);
  if (right >= QUESTIONS_PER_PASSAGE) return Math.min(MAX_WPM, state.wpm + WPM_STEP);
  if (right <= 1) return Math.max(paceFloor(state.difficulty), state.wpm - WPM_STEP);
  return state.wpm;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function initial(seed: number, party: Party, run: RunContext, locale: Locale): ReadingRaceState {
  const rng = mulberry32(fnv1a(`reading-race:${seed >>> 0}`));
  const luck = buffAmount(run, 'luck');
  const { plans, luckApplied } = pickPlans(locale, run.difficulty, luck, rng);
  const study = firstMember(party, 'study');
  const sleep = firstMember(party, 'sleep');
  const social = firstMember(party, 'social');
  return {
    seed: seed >>> 0,
    step: 0,
    locale,
    difficulty: run.difficulty,
    phase: 'ready',
    forfeited: false,
    memberIds: party.members.map((m) => m.id),
    hasStudy: study !== null,
    hasSleep: sleep !== null,
    hasSocial: social !== null,
    studyPower: study?.power ?? 0,
    sleepPower: sleep?.power ?? 0,
    socialPower: social?.power ?? 0,
    hintsLeft: Math.max(0, Math.floor(buffAmount(run, 'hint'))),
    hintsUsed: 0,
    freePassagesLeft: buffAmount(run, 'time') > 0 ? 1 : 0,
    passageFree: false,
    luckApplied,
    wpm: startingWpm(run.difficulty),
    phraseMode: false,
    autoRamp: false,
    sentenceMode: false,
    plans,
    passageIndex: 0,
    wordIndex: 0,
    wordsShown: 0,
    paceAccum: 0,
    readTicks: 0,
    questionIndex: 0,
    hiddenByQuestion: [[], [], []],
    answers: [],
    paidRereads: 0,
    passageWpms: [],
    hiddenTotal: 0,
  };
}

const canTune = (state: ReadingRaceState): boolean => state.phase === 'ready' || state.phase === 'interlude';

function reduce(state: ReadingRaceState, action: ReadingRaceAction): ReadingRaceState {
  if (isOver(state)) return state;

  switch (action.type) {
    case 'forfeit':
      return { ...state, forfeited: true, phase: 'done' };

    case 'setPace':
      if (!canTune(state) || !isValidWpm(action.wpm, state.difficulty)) return state;
      return { ...state, wpm: action.wpm };

    case 'setPhrase':
      return canTune(state) ? { ...state, phraseMode: action.on === true } : state;

    case 'setRamp':
      return canTune(state) ? { ...state, autoRamp: action.on === true } : state;

    case 'setSentenceMode':
      return canTune(state) ? { ...state, sentenceMode: action.on === true } : state;

    case 'start':
      return state.phase === 'ready' ? beginReading(state, 0) : state;

    case 'continue':
      if (state.phase !== 'interlude') return state;
      return beginReading({ ...state, wpm: state.autoRamp ? rampedWpm(state) : state.wpm }, state.passageIndex + 1);

    case 'reread': {
      if (state.phase !== 'reading') return state;
      const plan = currentPlan(state);
      if (!plan) return state;
      const currentStart = sentenceStartAt(plan.sentenceStarts, state.wordIndex);
      const start =
        currentStart === state.wordIndex && state.wordIndex > 0 ? sentenceStartAt(plan.sentenceStarts, state.wordIndex - 1) : currentStart;
      const n = state.sentenceMode
        ? nextSentenceStart(plan.sentenceStarts, start, plan.wordCount) - start
        : revealCount(state.phraseMode, plan.wordCount - start);
      // The time buff frees every re-read of one passage: the first re-read of a passage claims it.
      const claims = !state.passageFree && state.freePassagesLeft > 0;
      const free = state.passageFree || claims;
      return {
        ...state,
        wordIndex: start,
        wordsShown: start + n,
        paceAccum: 0,
        passageFree: free,
        freePassagesLeft: claims ? state.freePassagesLeft - 1 : state.freePassagesLeft,
        paidRereads: free ? state.paidRereads : state.paidRereads + 1,
      };
    }

    case 'advance': {
      if (state.phase !== 'reading' || !state.sentenceMode) return state;
      const plan = currentPlan(state);
      if (!plan) return state;
      const start = sentenceStartAt(plan.sentenceStarts, state.wordIndex);
      const next = nextSentenceStart(plan.sentenceStarts, start, plan.wordCount);
      if (next >= plan.wordCount) return enterQuestions(state);
      return { ...state, wordIndex: next, wordsShown: nextSentenceStart(plan.sentenceStarts, next, plan.wordCount) };
    }

    case 'tick': {
      if (state.phase !== 'reading') return state;
      const plan = currentPlan(state);
      if (!plan) return state;
      const ticked = { ...state, readTicks: state.readTicks + 1 };
      if (ticked.sentenceMode) return ticked;

      let accum = ticked.paceAccum + ticked.wpm;
      let wordIndex = ticked.wordIndex;
      let wordsShown = ticked.wordsShown;
      for (;;) {
        const shown = Math.max(0, wordsShown - wordIndex);
        if (shown <= 0) break;
        const cost = groupCost(ticked, wordIndex, shown, plan);
        if (accum < cost) break;
        accum -= cost;
        if (wordsShown >= plan.wordCount) {
          return enterQuestions({ ...ticked, paceAccum: accum, wordIndex, wordsShown });
        }
        const take = revealCount(ticked.phraseMode, plan.wordCount - wordsShown);
        if (take <= 0) return enterQuestions({ ...ticked, paceAccum: accum, wordIndex, wordsShown });
        wordIndex = wordsShown;
        wordsShown += take;
      }
      return { ...ticked, paceAccum: accum, wordIndex, wordsShown };
    }

    case 'hint': {
      // A hint never leaves fewer than two options: the right one and one wrong one.
      if (state.phase !== 'questions' || state.hintsLeft <= 0 || visibleOptions(state).length <= 2) return state;
      const plan = currentPlan(state);
      if (!plan) return state;
      const hidden = state.hiddenByQuestion[state.questionIndex] ?? [];
      const next = hideOneWrong(state, hidden, plan.answers[state.questionIndex] ?? 0);
      if (!next) return state;
      return {
        ...state,
        step: next.step,
        hintsLeft: state.hintsLeft - 1,
        hintsUsed: state.hintsUsed + 1,
        hiddenTotal: state.hiddenTotal + 1,
        hiddenByQuestion: state.hiddenByQuestion.map((row, i) => (i === state.questionIndex ? next.hidden : row)),
      };
    }

    case 'answer': {
      if (state.phase !== 'questions') return state;
      const plan = currentPlan(state);
      if (!plan) return state;
      if (!Number.isInteger(action.option) || action.option < 0 || action.option >= OPTIONS_PER_QUESTION) return state;
      const hidden = state.hiddenByQuestion[state.questionIndex] ?? [];
      if (hidden.includes(action.option)) return state;
      const record: AnswerRecord = {
        passageIndex: state.passageIndex,
        questionIndex: state.questionIndex,
        option: action.option,
        correct: action.option === plan.answers[state.questionIndex],
      };
      const next = { ...state, answers: [...state.answers, record] };
      if (state.questionIndex < QUESTIONS_PER_PASSAGE - 1) return { ...next, questionIndex: state.questionIndex + 1 };
      return finishPassage(next);
    }

    default:
      return state;
  }
}

function outcome(state: ReadingRaceState): Outcome | null {
  if (!isOver(state)) return null;
  const s = strings[state.locale];
  const result = state.forfeited ? 'fled' : wonComprehension(state) ? 'won' : 'lost';
  const learned = safeWpm(state);
  const noteKey = learned.reached ? 'noteSafe' : 'noteTry';
  return {
    result,
    score: scoreOf(state),
    log: outcomeLog(state, s),
    troopsUsed: [...state.memberIds],
    learned: {
      topic: { en: strings.en.learned.topic, fr: strings.fr.learned.topic },
      note: {
        en: formatText(strings.en.learned[noteKey], { wpm: learned.wpm }),
        fr: formatText(strings.fr.learned[noteKey], { wpm: learned.wpm }),
      },
    },
    stats: {
      comprehension: comprehensionPercent(state),
      correct: correctCount(state),
      questions: QUESTIONS_TOTAL,
      wpm: averageWpm(state),
      safeWpm: learned.wpm,
      safePaceReached: learned.reached ? 1 : 0,
      paidRereads: state.paidRereads,
      hintsUsed: state.hintsUsed,
      hiddenOptions: state.hiddenTotal,
    },
  };
}

function botPlay(state: ReadingRaceState, rng: () => number): ReadingRaceAction | null {
  if (isOver(state)) return null;
  if (state.phase === 'ready') {
    if (!state.autoRamp) return { type: 'setRamp', on: true };
    return { type: 'start' };
  }
  if (state.phase === 'interlude') return { type: 'continue' };
  if (state.phase === 'reading') return state.sentenceMode ? { type: 'advance' } : { type: 'tick' };
  if (state.phase === 'questions') {
    const plan = currentPlan(state);
    if (!plan) return { type: 'forfeit' };
    // The bot spends a hint as soon as it has one, then answers from what is still on screen.
    if (state.hintsLeft > 0 && visibleOptions(state).length > 2) return { type: 'hint' };
    const options = visibleOptions(state);
    const correct = plan.answers[state.questionIndex] ?? 0;
    if (rng() < botKnowsChance(state)) return { type: 'answer', option: correct };
    return { type: 'answer', option: options.length > 0 ? rngPick(rng, options) : correct };
  }
  return null;
}

function forfeit(): ReadingRaceAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<ReadingRaceState, ReadingRaceAction> = { initial, reduce, outcome, botPlay, forfeit };
