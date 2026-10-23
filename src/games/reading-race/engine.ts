/**
 * Reading Race: a paced reading game with comprehension questions.
 *
 * Time is a `{ type: 'tick' }` worth FIXED_DT_MS (50 ms). Words advance when
 * an accumulator of `wpm` units reaches WORD_COST (1200), which is exact
 * integer timing: words per minute = words * 1200 / ticks.
 *
 * Score = comprehension × a speed factor capped so that racing ahead of
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
import {
  OPTIONS_PER_QUESTION,
  PASSAGES,
  QUESTIONS_PER_PASSAGE,
  sentenceStartsOf,
  topicEndOf,
  wordList,
  type Passage,
  type ReadingLevel,
} from './content';

export { QUESTIONS_PER_PASSAGE };
import { strings, type ReadingRaceStrings } from './strings';

export const PASSAGES_PER_GAME = 3;
export const MIN_WPM = 180;
export const MAX_WPM = 480;
export const WPM_STEP = 20;
/** Accumulator units that equal one word at 1 wpm for one minute of ticks. */
export const WORD_COST = 60_000 / FIXED_DT_MS;
export const REREAD_COST = 5;
export const WIN_COMP_PERCENT = 70;
export const SAFE_COMP_PERCENT = 80;
export const PHRASE_WORDS = 3;
export const QUESTIONS_TOTAL = PASSAGES_PER_GAME * QUESTIONS_PER_PASSAGE;

export type Phase = 'ready' | 'reading' | 'questions' | 'interlude' | 'done';

export interface PassagePlan {
  id: string;
  topic: string;
  level: ReadingLevel;
  wordCount: number;
  sentenceStarts: number[];
  topicEnd: number;
  answers: [number, number, number];
}

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
  hintsLeft: number;
  freeRereadsLeft: number;
  luckApplied: boolean;
  wpm: number;
  phraseMode: boolean;
  autoRamp: boolean;
  sentenceMode: boolean;
  plans: PassagePlan[];
  passageIndex: number;
  /** Start index of the words currently shown. */
  wordIndex: number;
  /** How far the race has revealed (exclusive). */
  wordsShown: number;
  paceAccum: number;
  readTicks: number;
  questionIndex: number;
  hiddenByQuestion: number[][];
  answers: AnswerRecord[];
  paidRereads: number;
  /** Chosen (or measured) wpm for each finished passage. */
  passageWpms: number[];
  /** Wrong options hidden across the whole race (social + hints). */
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
  | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function isOver(state: ReadingRaceState): boolean {
  return state.forfeited || state.phase === 'done';
}

export function currentPlan(state: ReadingRaceState): PassagePlan | null {
  return state.plans[state.passageIndex] ?? null;
}

export function passageById(locale: Locale, id: string): Passage | undefined {
  return PASSAGES[locale].find((p) => p.id === id);
}

export function currentPassage(state: ReadingRaceState): Passage | undefined {
  const plan = currentPlan(state);
  return plan ? passageById(state.locale, plan.id) : undefined;
}

export function currentWords(state: ReadingRaceState): string[] {
  const p = currentPassage(state);
  return p ? wordList(p.text) : [];
}

export function currentQuestion(state: ReadingRaceState) {
  const p = currentPassage(state);
  return p?.questions[state.questionIndex];
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

export function visibleText(state: ReadingRaceState): string {
  if (state.phase !== 'reading') return '';
  const words = currentWords(state);
  const plan = currentPlan(state);
  if (!plan) return '';
  if (state.sentenceMode) {
    const start = sentenceStartAt(plan.sentenceStarts, state.wordIndex);
    const end = nextSentenceStart(plan.sentenceStarts, start, plan.wordCount);
    return words.slice(start, end).join(' ');
  }
  const n = state.phraseMode ? PHRASE_WORDS : 1;
  return words.slice(state.wordIndex, state.wordIndex + n).join(' ');
}

export function correctCount(state: ReadingRaceState): number {
  return state.answers.filter((a) => a.correct).length;
}

export function comprehensionPercent(state: ReadingRaceState): number {
  if (state.answers.length === 0) return 0;
  return Math.floor((correctCount(state) * 100) / state.answers.length);
}

export function isValidWpm(wpm: number): boolean {
  return Number.isInteger(wpm) && wpm >= MIN_WPM && wpm <= MAX_WPM && (wpm - MIN_WPM) % WPM_STEP === 0;
}

export function startingWpm(difficulty: number): number {
  return Math.min(MAX_WPM, MIN_WPM + (difficulty - 1) * WPM_STEP);
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

export function wordCost(state: ReadingRaceState, index: number, plan: PassagePlan): number {
  let cost = WORD_COST;
  if (state.hasSleep && plan.sentenceStarts.includes(index)) cost += 240 + state.sleepPower * 6;
  if (state.hasStudy && index < plan.topicEnd) cost += 120 + state.studyPower * 4;
  return cost;
}

export function groupCost(state: ReadingRaceState, start: number, count: number, plan: PassagePlan): number {
  let cost = 0;
  for (let i = 0; i < count; i++) cost += wordCost(state, start + i, plan);
  return cost;
}

export function hiddenCount(state: ReadingRaceState): number {
  return state.hiddenTotal;
}

export function lastPassageCorrect(state: ReadingRaceState): number {
  const p = state.passageIndex;
  return state.answers.filter((a) => a.passageIndex === p && a.correct).length;
}

export function safeWpm(state: ReadingRaceState): { wpm: number; reached: boolean } {
  let best = 0;
  let reached = false;
  for (let i = 0; i < state.passageWpms.length; i++) {
    const right = state.answers.filter((a) => a.passageIndex === i && a.correct).length;
    if (right * 100 >= SAFE_COMP_PERCENT * QUESTIONS_PER_PASSAGE) {
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

/** Probability the bot knows the current question (falls as pace rises). */
export function botKnowsChance(state: ReadingRaceState): number {
  const step = (state.wpm - MIN_WPM) / WPM_STEP;
  const bases = [86, 70, 60, 50, 40];
  const level = currentPlan(state)?.level ?? 1;
  let p = (bases[state.difficulty - 1] ?? 60) - step * 4 - (level - 1) * 10;
  if (state.hasSocial) p += 4;
  if (state.hasStudy) p += 2;
  if (state.hasSleep) p += 1;
  if (p < 10) p = 10;
  if (p > 92) p = 92;
  return p / 100;
}

export function outcomeLog(state: ReadingRaceState, s: ReadingRaceStrings): string[] {
  const lines: string[] = [formatText(s.log.start, { wpm: startingWpm(state.difficulty) })];
  for (let i = 0; i < state.plans.length; i++) {
    const plan = state.plans[i]!;
    const right = state.answers.filter((a) => a.passageIndex === i && a.correct).length;
    const wpm = state.passageWpms[i] ?? state.wpm;
    if (state.answers.some((a) => a.passageIndex === i) || state.passageWpms[i] !== undefined) {
      lines.push(formatText(s.log.passage, { n: i + 1, topic: plan.topic, level: plan.level, wpm, correct: right, total: QUESTIONS_PER_PASSAGE }));
    }
  }
  const hidden = hiddenCount(state);
  if (hidden > 0) lines.push(formatText(s.log.hidden, { n: hidden }));
  if (state.paidRereads > 0) lines.push(formatText(s.log.reread, { n: state.paidRereads }));
  const percent = Math.floor((correctCount(state) * 100) / QUESTIONS_TOTAL);
  const end = state.forfeited ? s.log.endFled : wonComprehension(state) ? s.log.endWon : s.log.endLost;
  lines.push(formatText(end, { percent }));
  return lines;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function toPlan(p: Passage): PassagePlan {
  const words = wordList(p.text);
  return {
    id: p.id,
    topic: p.topic,
    level: p.level,
    wordCount: words.length,
    sentenceStarts: sentenceStartsOf(words),
    topicEnd: topicEndOf(words),
    answers: [p.questions[0].correct, p.questions[1].correct, p.questions[2].correct],
  };
}

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

function pickPlans(locale: Locale, difficulty: number, luck: number, rng: Rng): { plans: PassagePlan[]; luckApplied: boolean } {
  const all = PASSAGES[locale];
  const allowed = new Set(levelsFor(difficulty));
  let pool = all.filter((p) => allowed.has(p.level));
  if (pool.length < PASSAGES_PER_GAME) pool = all.slice();
  const picked = shuffled(pool, rng).slice(0, PASSAGES_PER_GAME);
  let luckApplied = false;
  if (luck > 0 && picked.length > 0) {
    let maxI = 0;
    for (let i = 1; i < picked.length; i++) if ((picked[i]?.level ?? 0) > (picked[maxI]?.level ?? 0)) maxI = i;
    const used = new Set(picked.map((p) => p.id));
    const easier = all.filter((p) => p.level < (picked[maxI]?.level ?? 1) && !used.has(p.id));
    if (easier.length > 0) {
      picked[maxI] = rngPick(rng, easier);
      luckApplied = true;
    }
  }
  return { plans: picked.map(toPlan), luckApplied };
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
    hiddenByQuestion: [[], [], []],
  };
}

function enterQuestions(state: ReadingRaceState): ReadingRaceState {
  const plan = currentPlan(state);
  if (!plan) return { ...state, phase: 'done' };
  let step = state.step;
  let hintsLeft = state.hintsLeft;
  const hiddenByQuestion: number[][] = [];
  for (let q = 0; q < QUESTIONS_PER_PASSAGE; q++) {
    const correct = plan.answers[q] ?? 0;
    const hidden: number[] = [];
    let wrongs = [0, 1, 2, 3].filter((i) => i !== correct);
    if (state.hasSocial && wrongs.length > 0) {
      const rng = turnRng(state.seed, step);
      step += 1;
      const pick = wrongs[rngInt(rng, wrongs.length)] ?? wrongs[0]!;
      hidden.push(pick);
      wrongs = wrongs.filter((i) => i !== pick);
    }
    if (hintsLeft > 0 && wrongs.length > 0) {
      const rng = turnRng(state.seed, step);
      step += 1;
      const pick = wrongs[rngInt(rng, wrongs.length)] ?? wrongs[0]!;
      hidden.push(pick);
      wrongs = wrongs.filter((i) => i !== pick);
      hintsLeft -= 1;
    }
    hiddenByQuestion.push(hidden);
  }
  const added = hiddenByQuestion.reduce((n, row) => n + row.length, 0);
  return {
    ...state,
    phase: 'questions',
    step,
    hintsLeft,
    hiddenByQuestion,
    hiddenTotal: state.hiddenTotal + added,
    questionIndex: 0,
    wordsShown: plan.wordCount,
  };
}

function measuredWpm(state: ReadingRaceState, plan: PassagePlan): number {
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
    hintsLeft: Math.max(0, Math.floor(buffAmount(run, 'hint'))),
    freeRereadsLeft: buffAmount(run, 'time') > 0 ? 1 : 0,
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

function reduce(state: ReadingRaceState, action: ReadingRaceAction): ReadingRaceState {
  if (isOver(state)) return state;

  if (action.type === 'forfeit') return { ...state, forfeited: true, phase: 'done' };

  if (action.type === 'setPace') {
    if ((state.phase !== 'ready' && state.phase !== 'interlude') || !isValidWpm(action.wpm)) return state;
    return { ...state, wpm: action.wpm };
  }
  if (action.type === 'setPhrase') {
    if (state.phase !== 'ready' && state.phase !== 'interlude') return state;
    return { ...state, phraseMode: action.on };
  }
  if (action.type === 'setRamp') {
    if (state.phase !== 'ready' && state.phase !== 'interlude') return state;
    return { ...state, autoRamp: action.on };
  }
  if (action.type === 'setSentenceMode') {
    if (state.phase !== 'ready' && state.phase !== 'interlude') return state;
    return { ...state, sentenceMode: action.on };
  }

  if (action.type === 'start') {
    if (state.phase !== 'ready') return state;
    return beginReading(state, 0);
  }

  if (action.type === 'continue') {
    if (state.phase !== 'interlude') return state;
    let wpm = state.wpm;
    if (state.autoRamp && lastPassageCorrect(state) >= QUESTIONS_PER_PASSAGE) {
      wpm = Math.min(MAX_WPM, wpm + WPM_STEP);
    }
    return beginReading({ ...state, wpm }, state.passageIndex + 1);
  }

  if (action.type === 'reread') {
    if (state.phase !== 'reading') return state;
    const plan = currentPlan(state);
    if (!plan) return state;
    const currentStart = sentenceStartAt(plan.sentenceStarts, state.wordIndex);
    const start = currentStart === state.wordIndex && state.wordIndex > 0
      ? sentenceStartAt(plan.sentenceStarts, state.wordIndex - 1)
      : currentStart;
    const n = state.sentenceMode
      ? nextSentenceStart(plan.sentenceStarts, start, plan.wordCount) - start
      : revealCount(state.phraseMode, plan.wordCount - start);
    const free = state.freeRereadsLeft > 0;
    return {
      ...state,
      wordIndex: start,
      wordsShown: start + n,
      paceAccum: 0,
      freeRereadsLeft: free ? state.freeRereadsLeft - 1 : state.freeRereadsLeft,
      paidRereads: free ? state.paidRereads : state.paidRereads + 1,
    };
  }

  if (action.type === 'advance') {
    if (state.phase !== 'reading' || !state.sentenceMode) return state;
    const plan = currentPlan(state);
    if (!plan) return state;
    const start = sentenceStartAt(plan.sentenceStarts, state.wordIndex);
    const next = nextSentenceStart(plan.sentenceStarts, start, plan.wordCount);
    if (next >= plan.wordCount) return enterQuestions(state);
    return { ...state, wordIndex: next, wordsShown: nextSentenceStart(plan.sentenceStarts, next, plan.wordCount) };
  }

  if (action.type === 'tick') {
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

  if (action.type === 'answer') {
    if (state.phase !== 'questions') return state;
    const plan = currentPlan(state);
    const question = currentQuestion(state);
    if (!plan || !question) return state;
    if (!Number.isInteger(action.option) || action.option < 0 || action.option >= OPTIONS_PER_QUESTION) return state;
    const hidden = state.hiddenByQuestion[state.questionIndex] ?? [];
    if (hidden.includes(action.option)) return state;
    const record: AnswerRecord = {
      passageIndex: state.passageIndex,
      questionIndex: state.questionIndex,
      option: action.option,
      correct: action.option === question.correct,
    };
    const answers = [...state.answers, record];
    const next = { ...state, answers };
    if (state.questionIndex < QUESTIONS_PER_PASSAGE - 1) {
      return { ...next, questionIndex: state.questionIndex + 1 };
    }
    return finishPassage(next);
  }

  return state;
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
      paidRereads: state.paidRereads,
    },
  };
}

function botPlay(state: ReadingRaceState, rng: () => number): ReadingRaceAction | null {
  if (isOver(state)) return null;
  if (state.phase === 'ready') {
    const target = startingWpm(state.difficulty);
    if (state.wpm !== target) return { type: 'setPace', wpm: target };
    if (!state.autoRamp) return { type: 'setRamp', on: true };
    return { type: 'start' };
  }
  if (state.phase === 'interlude') return { type: 'continue' };
  if (state.phase === 'reading') return state.sentenceMode ? { type: 'advance' } : { type: 'tick' };
  if (state.phase === 'questions') {
    const question = currentQuestion(state);
    const hidden = state.hiddenByQuestion[state.questionIndex] ?? [];
    if (!question) return { type: 'forfeit' };
    if (rng() < botKnowsChance(state)) return { type: 'answer', option: question.correct };
    const wrongs = [0, 1, 2, 3].filter((i) => i !== question.correct && !hidden.includes(i));
    const pick = wrongs.length > 0 ? rngPick(rng, wrongs) : question.correct;
    return { type: 'answer', option: pick };
  }
  return null;
}

function forfeit(): ReadingRaceAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<ReadingRaceState, ReadingRaceAction> = { initial, reduce, outcome, botPlay, forfeit };
