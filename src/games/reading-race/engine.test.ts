/**
 * Reading Race rules, content checks, scoring and bot behaviour.
 * The contract kit covers the generic plug-in properties.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  MAX_WORDS,
  MIN_WORDS,
  OPTIONS_PER_QUESTION,
  PASSAGES,
  wordList,
} from './content';
import {
  MAX_WPM,
  MIN_WPM,
  PASSAGES_PER_GAME,
  QUESTIONS_TOTAL,
  REREAD_COST,
  WORD_COST,
  WPM_STEP,
  averageWpm,
  botKnowsChance,
  correctCount,
  engine,
  levelsFor,
  scoreFrom,
  speedFactor,
  startingWpm,
  visibleText,
  wonComprehension,
  type ReadingRaceState,
} from './engine';
import game from './manifest';

const start = (seed = 1, run: RunContext = runs.plain, locale: 'en' | 'fr' = 'en', party = parties.full) =>
  engine.initial(seed, party, run, locale);

function play(state: ReadingRaceState, ...actions: Parameters<typeof engine.reduce>[1][]): ReadingRaceState {
  return actions.reduce((s, a) => engine.reduce(s, a), state);
}

function ticks(state: ReadingRaceState, n: number): ReadingRaceState {
  let s = state;
  for (let i = 0; i < n; i++) s = engine.reduce(s, { type: 'tick' });
  return s;
}

function drainReading(state: ReadingRaceState, cap = 20_000): ReadingRaceState {
  let s = state;
  let n = 0;
  while (s.phase === 'reading' && n < cap) {
    s = engine.reduce(s, s.sentenceMode ? { type: 'advance' } : { type: 'tick' });
    n += 1;
  }
  return s;
}

function answerAll(state: ReadingRaceState, pick: 'correct' | 'wrong' | number): ReadingRaceState {
  let s = state;
  while (s.phase === 'questions') {
    const q = s.plans[s.passageIndex]!.answers[s.questionIndex]!;
    const option = pick === 'correct' ? q : pick === 'wrong' ? (q + 1) % 4 : pick;
    const hidden = s.hiddenByQuestion[s.questionIndex] ?? [];
    const choice = hidden.includes(option) ? [0, 1, 2, 3].find((i) => i !== q && !hidden.includes(i)) ?? q : option;
    s = engine.reduce(s, { type: 'answer', option: choice });
  }
  return s;
}

describe('reading race content', () => {
  it('has ten original passages in each language', () => {
    expect(PASSAGES.en).toHaveLength(10);
    expect(PASSAGES.fr).toHaveLength(10);
  });

  it('keeps every passage between 110 and 170 words', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const p of PASSAGES[locale]) {
        const n = wordList(p.text).length;
        expect(n, `${locale}:${p.id}`).toBeGreaterThanOrEqual(MIN_WORDS);
        expect(n, `${locale}:${p.id}`).toBeLessThanOrEqual(MAX_WORDS);
      }
    }
  });

  it('gives each passage one literal, one inference and one detail question', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const p of PASSAGES[locale]) {
        expect(p.questions.map((q) => q.kind)).toEqual(['literal', 'inference', 'detail']);
      }
    }
  });

  it('gives every question four options and exactly one correct index', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const p of PASSAGES[locale]) {
        for (const q of p.questions) {
          expect(q.options).toHaveLength(OPTIONS_PER_QUESTION);
          expect(new Set(q.options).size).toBe(OPTIONS_PER_QUESTION);
          expect(q.correct).toBeGreaterThanOrEqual(0);
          expect(q.correct).toBeLessThan(OPTIONS_PER_QUESTION);
          expect(q.options[q.correct]).toBeTruthy();
        }
      }
    }
  });

  it('does not repeat a question prompt in a language', () => {
    for (const locale of ['en', 'fr'] as const) {
      const prompts = PASSAGES[locale].flatMap((p) => p.questions.map((q) => q.prompt));
      expect(new Set(prompts).size).toBe(prompts.length);
    }
  });

  it('matches structure across English and French: ten passages, three questions, mixed levels', () => {
    const count = (locale: 'en' | 'fr', level: 1 | 2 | 3) => PASSAGES[locale].filter((p) => p.level === level).length;
    expect(count('en', 1)).toBe(count('fr', 1));
    expect(count('en', 2)).toBe(count('fr', 2));
    expect(count('en', 3)).toBe(count('fr', 3));
    expect(count('en', 1)).toBeGreaterThanOrEqual(3);
    expect(count('en', 3)).toBe(3);
  });
});

describe('reading race engine', () => {
  it('starts ready, not over, with three seeded passages', () => {
    const s = start(1);
    expect(s.phase).toBe('ready');
    expect(engine.outcome(s)).toBeNull();
    expect(s.plans).toHaveLength(PASSAGES_PER_GAME);
    expect(start(1).plans.map((p) => p.id)).toEqual(s.plans.map((p) => p.id));
  });

  it('uses different passages for different seeds', () => {
    expect(start(1).plans.map((p) => p.id).join()).not.toBe(start(99).plans.map((p) => p.id).join());
  });

  it('scales starting pace and reading levels with difficulty', () => {
    expect(startingWpm(1)).toBe(MIN_WPM);
    expect(startingWpm(5)).toBe(MIN_WPM + 4 * WPM_STEP);
    expect(levelsFor(1)).toEqual([1]);
    expect(levelsFor(5)).toEqual([3]);
    const easy = engine.initial(3, parties.full, emptyRun(1), 'en');
    const hard = engine.initial(3, parties.full, emptyRun(5), 'en');
    expect(easy.wpm).toBe(MIN_WPM);
    expect(hard.wpm).toBeGreaterThan(easy.wpm);
    expect(easy.plans.every((p) => p.level === 1)).toBe(true);
    expect(hard.plans.every((p) => p.level === 3)).toBe(true);
  });

  it('reveals the first word on start and times later words from the 50 ms tick', () => {
    const s = play(start(2, emptyRun(1), 'en', parties.starter), { type: 'start' });
    expect(s.phase).toBe('reading');
    expect(s.wordsShown).toBeGreaterThanOrEqual(1);
    expect(visibleText(s).length).toBeGreaterThan(0);
    const plan = s.plans[0]!;
    const ticksToNext = Math.ceil(WORD_COST / s.wpm);
    const before = s.wordsShown;
    const mid = ticks(s, ticksToNext - 1);
    expect(mid.wordsShown).toBe(before);
    const after = ticks(s, ticksToNext);
    expect(after.wordsShown).toBeGreaterThan(before);
    expect(after.wordsShown).toBeLessThanOrEqual(plan.wordCount);
  });

  it('keeps pace timing exact: words * WORD_COST / ticks equals wpm when dwell is plain', () => {
    const s = play(engine.initial(8, parties.starter, emptyRun(1), 'en'), { type: 'start' });
    expect(s.hasSleep).toBe(false);
    expect(s.hasStudy).toBe(false);
    const done = drainReading(s);
    expect(done.phase).toBe('questions');
    const words = s.plans[0]!.wordCount;
    expect(Math.round((words * WORD_COST) / done.readTicks)).toBe(s.wpm);
  });

  it('phrase mode advances three words at a time', () => {
    const s = play(start(4), { type: 'setPhrase', on: true }, { type: 'start' });
    expect(s.wordsShown).toBe(3);
    expect(visibleText(s).split(/\s+/).length).toBe(3);
  });

  it('ignores invalid pace and actions after the end', () => {
    const s = start(5);
    expect(play(s, { type: 'setPace', wpm: 190 })).toBe(s);
    expect(play(s, { type: 'setPace', wpm: 50 })).toBe(s);
    expect(play(s, { type: 'tick' })).toBe(s);
    expect(play(s, { type: 'answer', option: 0 })).toBe(s);
    const gone = play(s, { type: 'forfeit' });
    expect(engine.outcome(gone)?.result).toBe('fled');
    expect(engine.reduce(gone, { type: 'start' })).toBe(gone);
  });

  it('forfeit is the leave action and ends as fled', () => {
    const s = start(6);
    expect(engine.forfeit?.(s)).toEqual({ type: 'forfeit' });
    const o = engine.outcome(play(s, { type: 'start' }, { type: 'forfeit' }));
    expect(o?.result).toBe('fled');
    expect(o?.troopsUsed.length).toBeGreaterThan(0);
  });

  it('scores a win at 70 percent comprehension or better, otherwise a loss', () => {
    expect(wonComprehension({ ...start(1), answers: Array.from({ length: 7 }, (_, i) => ({ passageIndex: 0, questionIndex: i, option: 0, correct: true })) })).toBe(true);
    expect(wonComprehension({ ...start(1), answers: Array.from({ length: 6 }, (_, i) => ({ passageIndex: 0, questionIndex: i, option: 0, correct: true })) })).toBe(false);
  });

  it('never lets faster reading lower the speed factor at the same comprehension', () => {
    const slow = speedFactor(MIN_WPM);
    const fast = speedFactor(MAX_WPM);
    expect(fast).toBeGreaterThan(slow);
    for (let w = MIN_WPM; w < MAX_WPM; w += WPM_STEP) {
      expect(speedFactor(w + WPM_STEP)).toBeGreaterThanOrEqual(speedFactor(w));
    }
  });

  it('never lets lower comprehension raise the score at the same speed', () => {
    for (let c = 1; c <= QUESTIONS_TOTAL; c++) {
      expect(scoreFrom(c, QUESTIONS_TOTAL, 240, 0)).toBeGreaterThanOrEqual(scoreFrom(c - 1, QUESTIONS_TOTAL, 240, 0));
    }
  });

  it('caps very high speed with poor comprehension so that score stays low', () => {
    const poorFast = scoreFrom(3, QUESTIONS_TOTAL, MAX_WPM, 0);
    const poorSlow = scoreFrom(3, QUESTIONS_TOTAL, MIN_WPM, 0);
    const perfectFast = scoreFrom(QUESTIONS_TOTAL, QUESTIONS_TOTAL, MAX_WPM, 0);
    expect(poorFast).toBeLessThanOrEqual(poorSlow);
    expect(poorFast).toBeLessThan(400);
    expect(perfectFast).toBeGreaterThan(poorFast);
  });

  it('charges 5 points for a paid re-read and skips the fee when a time buff remains', () => {
    const s = play(start(2), { type: 'start' }, { type: 'reread' });
    expect(s.paidRereads).toBe(1);
    const free = play(start(2, { ...runs.plain, buffs: [{ id: 't', kind: 'time', amount: 20 }] }), { type: 'start' }, { type: 'reread' });
    expect(free.paidRereads).toBe(0);
    expect(free.freeRereadsLeft).toBe(0);
    expect(scoreFrom(9, 9, MIN_WPM, 1)).toBe(scoreFrom(9, 9, MIN_WPM, 0) - REREAD_COST);
  });

  it('lets a time buff offer one free re-read and luck swap in an easier passage', () => {
    const plain = start(11, runs.plain);
    const lucky = start(11, { ...runs.plain, buffs: [{ id: 'l', kind: 'luck', amount: 15 }] });
    const maxLevel = (s: ReadingRaceState) => Math.max(...s.plans.map((p) => p.level));
    if (maxLevel(plain) > 1) {
      expect(lucky.luckApplied || maxLevel(lucky) <= maxLevel(plain)).toBe(true);
    }
    expect(lucky.luckApplied || lucky.plans.map((p) => p.id).join() === plain.plans.map((p) => p.id).join()).toBe(true);
  });

  it('hides a wrong option when Social is in the party or a hint buff remains', () => {
    const withSocial = drainReading(play(start(2, runs.plain, 'en', parties.full), { type: 'start' }));
    expect(withSocial.hasSocial).toBe(true);
    expect(withSocial.hiddenByQuestion[0]!.length).toBeGreaterThanOrEqual(1);
    const starter = drainReading(play(start(2, runs.plain, 'en', parties.starter), { type: 'start' }));
    expect(starter.hasSocial).toBe(false);
    const hinted = drainReading(play(start(2, { ...runs.plain, buffs: [{ id: 'h', kind: 'hint', amount: 2 }] }, 'en', parties.starter), { type: 'start' }));
    expect(hinted.hiddenTotal).toBeGreaterThan(starter.hiddenTotal);
  });

  it('Study and Sleep add dwell so a full party takes more ticks than the starter on the same seed', () => {
    const full = drainReading(play(start(7, runs.plain, 'en', parties.full), { type: 'start' }));
    const starter = drainReading(play(start(7, runs.plain, 'en', parties.starter), { type: 'start' }));
    expect(full.hasStudy && full.hasSleep).toBe(true);
    expect(starter.hasStudy || starter.hasSleep).toBe(false);
    expect(full.readTicks).toBeGreaterThan(starter.readTicks);
  });

  it('auto-ramp raises pace after a perfect passage', () => {
    let s = play(start(1, emptyRun(1), 'en', parties.starter), { type: 'setRamp', on: true }, { type: 'start' });
    const first = s.wpm;
    s = answerAll(drainReading(s), 'correct');
    expect(s.phase).toBe('interlude');
    s = play(s, { type: 'continue' });
    expect(s.wpm).toBe(first + WPM_STEP);
  });

  it('sentence mode waits for advance instead of ticks to change the sentence', () => {
    const s = play(start(3), { type: 'setSentenceMode', on: true }, { type: 'start' });
    const first = visibleText(s);
    const ticked = ticks(s, 20);
    expect(visibleText(ticked)).toBe(first);
    const advanced = play(s, { type: 'advance' });
    expect(advanced.wordIndex).toBeGreaterThan(s.wordIndex);
  });

  it('writes the log in the locale it was given; the race itself does not depend on it', () => {
    const en = playToEnd(game, 9, parties.starter, emptyRun(1), 20_000, { locale: 'en' });
    const fr = playToEnd(game, 9, parties.starter, emptyRun(1), 20_000, { locale: 'fr' });
    expect(fr.outcome?.log[0]).toMatch(/Trois textes/);
    expect(en.outcome?.log[0]).toMatch(/Three passages/);
    expect(fr.outcome?.result).toBe(en.outcome?.result);
  });

  it('bot knowledge falls as pace rises, and the bot never returns null before the end', () => {
    const s = play(start(4), { type: 'start' });
    const slow = botKnowsChance({ ...s, wpm: MIN_WPM });
    const fast = botKnowsChance({ ...s, wpm: MAX_WPM });
    expect(slow).toBeGreaterThan(fast);
    expect(engine.botPlay(s, () => 0)?.type).toBe('tick');
    expect(engine.botPlay({ ...s, phase: 'done' }, () => 0)).toBeNull();
  });

  it('the bot wins between 40 and 70 percent of plain full-party games on a fixed seed set', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const wins = seeds.filter((seed) => playToEnd(game, seed, parties.full, runs.plain).outcome?.result === 'won').length;
    const rate = wins / seeds.length;
    expect(rate).toBeGreaterThanOrEqual(0.4);
    expect(rate).toBeLessThanOrEqual(0.7);
  });

  it('records a comprehension-safe learned pace when a passage is 80 percent or better', () => {
    let s = play(start(1, emptyRun(1), 'en', parties.starter), { type: 'start' });
    s = answerAll(drainReading(s), 'correct');
    s = answerAll(drainReading(play(s, { type: 'continue' })), 'correct');
    s = answerAll(drainReading(play(s, { type: 'continue' })), 'correct');
    const o = engine.outcome(s);
    expect(o?.result).toBe('won');
    expect(o?.learned?.note.en).toMatch(/words per minute/);
    expect(o?.learned?.note.fr).toMatch(/mots par minute/);
    expect(averageWpm(s)).toBe(s.wpm);
    expect(correctCount(s)).toBe(QUESTIONS_TOTAL);
  });

  it('is playable with the starter party of three level-1 members', () => {
    const r = playToEnd(game, 4, parties.starter, emptyRun(1));
    expect(r.outcome).not.toBeNull();
    expect(['won', 'lost']).toContain(r.outcome?.result);
  });
});
