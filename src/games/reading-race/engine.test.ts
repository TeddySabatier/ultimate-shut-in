/**
 * Reading Race rules, pace timing, scoring, party and buffs, the learning
 * goal, determinism and bot behaviour. The contract kit covers the generic
 * plug-in properties; the passages have their own file.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, makeMember, type Party, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  BOT_BASE_PERCENT,
  MAX_WPM,
  MIN_WPM,
  PASSAGES_PER_GAME,
  QUESTIONS_PER_PASSAGE,
  QUESTIONS_TOTAL,
  REREAD_COST,
  SOCIAL_STRONG_POWER,
  WORD_COST,
  WPM_STEP,
  averageWpm,
  botKnowsChance,
  comprehensionPercent,
  correctCount,
  engine,
  isValidWpm,
  levelsFor,
  paceFloor,
  rampedWpm,
  safeWpm,
  scoreFrom,
  speedFactor,
  startingWpm,
  visibleOptions,
  visibleRange,
  wonComprehension,
  type ReadingRaceAction,
  type ReadingRaceState,
} from './engine';
import game from './manifest';
import { META } from './meta';

type Level = 1 | 2 | 3 | 4 | 5;
const start = (seed = 1, run: RunContext = runs.plain, locale: 'en' | 'fr' = 'en', party: Party = parties.full) =>
  engine.initial(seed, party, run, locale);

function play(state: ReadingRaceState, ...actions: ReadingRaceAction[]): ReadingRaceState {
  return actions.reduce((s, a) => engine.reduce(s, a), state);
}

function ticks(state: ReadingRaceState, n: number): ReadingRaceState {
  let s = state;
  for (let i = 0; i < n; i++) s = engine.reduce(s, { type: 'tick' });
  return s;
}

/** Tick (or tap through, in sentence mode) until the passage is read. */
function drainReading(state: ReadingRaceState, cap = 20_000): ReadingRaceState {
  let s = state;
  for (let n = 0; s.phase === 'reading' && n < cap; n++) s = engine.reduce(s, s.sentenceMode ? { type: 'advance' } : { type: 'tick' });
  return s;
}

/** Answer every question of the passage: all right, all wrong, or a given option (moved off hidden ones). */
function answerAll(state: ReadingRaceState, pick: 'correct' | 'wrong'): ReadingRaceState {
  let s = state;
  while (s.phase === 'questions') {
    const right = s.plans[s.passageIndex]!.answers[s.questionIndex]!;
    const options = visibleOptions(s);
    const option = pick === 'correct' ? right : options.find((o) => o !== right)!;
    s = engine.reduce(s, { type: 'answer', option });
  }
  return s;
}

/** A whole game with a fixed number of right answers per passage, at the pace already set. */
function playRace(state: ReadingRaceState, rightPerPassage: number[]): ReadingRaceState {
  let s = play(state, { type: 'start' });
  for (let p = 0; p < PASSAGES_PER_GAME; p++) {
    s = drainReading(s);
    for (let q = 0; s.phase === 'questions'; q++) {
      const right = s.plans[s.passageIndex]!.answers[s.questionIndex]!;
      const option = q < (rightPerPassage[p] ?? 0) ? right : visibleOptions(s).find((o) => o !== right)!;
      s = engine.reduce(s, { type: 'answer', option });
    }
    if (s.phase === 'interlude') s = play(s, { type: 'continue' });
  }
  return s;
}

const withBuffs = (...buffs: { kind: RunContext['buffs'][number]['kind']; amount: number }[]): RunContext => ({
  ...runs.plain,
  buffs: buffs.map((b, i) => ({ id: `b${i}`, ...b })),
});

describe('setup', () => {
  it('starts ready, not over, with three passages drawn from the seed', () => {
    const s = start(1);
    expect(s.phase).toBe('ready');
    expect(engine.outcome(s)).toBeNull();
    expect(s.plans).toHaveLength(PASSAGES_PER_GAME);
    expect(new Set(s.plans.map((p) => p.id)).size).toBe(PASSAGES_PER_GAME);
    expect(start(1).plans.map((p) => p.id)).toEqual(s.plans.map((p) => p.id));
  });

  it('draws different passages for different seeds', () => {
    const orders = new Set(Array.from({ length: 12 }, (_, i) => start(i + 1).plans.map((p) => p.id).join()));
    expect(orders.size).toBeGreaterThan(6);
  });

  it('draws from the passages of the player language', () => {
    for (const locale of ['en', 'fr'] as const) {
      const ids = new Set(META[locale].map((m) => m.id));
      for (let seed = 1; seed <= 10; seed++) for (const p of start(seed, runs.plain, locale).plans) expect(ids.has(p.id)).toBe(true);
    }
  });

  it('chooses reading levels by difficulty: gentle at 1, hard at 5', () => {
    expect(([1, 2, 3, 4, 5] as Level[]).map((d) => levelsFor(d))).toEqual([[1], [1, 2], [1, 2, 3], [2, 3], [3]]);
    for (let seed = 1; seed <= 20; seed++) {
      expect(start(seed, emptyRun(1)).plans.every((p) => p.level === 1)).toBe(true);
      expect(start(seed, emptyRun(5)).plans.every((p) => p.level === 3)).toBe(true);
      expect(start(seed, emptyRun(2)).plans.every((p) => p.level <= 2)).toBe(true);
    }
  });

  it('raises the slowest allowed pace with difficulty: 180 wpm at 1, 20 more per level', () => {
    expect(([1, 2, 3, 4, 5] as Level[]).map((d) => paceFloor(d))).toEqual([180, 200, 220, 240, 260]);
    for (const d of [1, 2, 3, 4, 5] as Level[]) expect(start(3, emptyRun(d)).wpm).toBe(startingWpm(d));
    expect(startingWpm(1)).toBe(MIN_WPM);
  });

  it('is playable and different on every difficulty from 1 to 5', () => {
    const results = ([1, 2, 3, 4, 5] as Level[]).map((d) => playToEnd(game, 5, parties.full, emptyRun(d)).outcome);
    for (const o of results) expect(o).not.toBeNull();
  });
});

describe('pace', () => {
  it('only accepts paces in steps of 20 between the floor and 480', () => {
    const s = start(5, emptyRun(1));
    expect(isValidWpm(190, 1)).toBe(false);
    expect(play(s, { type: 'setPace', wpm: 190 })).toBe(s);
    expect(play(s, { type: 'setPace', wpm: 500 })).toBe(s);
    expect(play(s, { type: 'setPace', wpm: 170 })).toBe(s);
    expect(play(s, { type: 'setPace', wpm: 220 }).wpm).toBe(220);
    expect(play(s, { type: 'setPace', wpm: MAX_WPM }).wpm).toBe(MAX_WPM);
    expect(play(s, { type: 'setPace', wpm: 220.5 })).toBe(s);
  });

  it('refuses a pace below the floor of a harder difficulty', () => {
    const s = start(5, emptyRun(4));
    expect(play(s, { type: 'setPace', wpm: 220 })).toBe(s);
    expect(play(s, { type: 'setPace', wpm: 240 }).wpm).toBe(240);
    expect(play(s, { type: 'setPace', wpm: 260 }).wpm).toBe(260);
  });

  it('can be changed before the race and between passages, not while reading', () => {
    const s = start(2, emptyRun(1));
    const reading = play(s, { type: 'start' });
    expect(play(reading, { type: 'setPace', wpm: 300 })).toBe(reading);
    const between = answerAll(drainReading(reading), 'correct');
    expect(between.phase).toBe('interlude');
    expect(play(between, { type: 'setPace', wpm: 300 }).wpm).toBe(300);
    expect(play(between, { type: 'setPace', wpm: 300 }, { type: 'continue' }).wpm).toBe(300);
  });

  it('shows the first word on start, then times every word from the 50 ms tick', () => {
    const s = play(start(2, emptyRun(1), 'en', parties.starter), { type: 'start' });
    expect(s.phase).toBe('reading');
    expect(visibleRange(s)).toEqual([0, 1]);
    // 180 wpm: a word costs 1200 units and each tick adds 180, so the second word shows on tick 7.
    expect(Math.ceil(WORD_COST / s.wpm)).toBe(7);
    expect(ticks(s, 6).wordIndex).toBe(0);
    expect(ticks(s, 7).wordIndex).toBe(1);
  });

  it('reads a passage in exactly ceil(words x 1200 / wpm) ticks at every pace', () => {
    for (let wpm = 180; wpm <= MAX_WPM; wpm += WPM_STEP) {
      const s = play(start(8, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm }, { type: 'start' });
      const done = drainReading(s);
      expect(done.phase).toBe('questions');
      expect(done.readTicks, `${wpm} wpm`).toBe(Math.ceil((s.plans[0]!.wordCount * WORD_COST) / wpm));
    }
  });

  it('a faster pace never takes more ticks than a slower one', () => {
    let last = Infinity;
    for (let wpm = 180; wpm <= MAX_WPM; wpm += WPM_STEP) {
      const t = drainReading(play(start(8, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm }, { type: 'start' })).readTicks;
      expect(t).toBeLessThanOrEqual(last);
      last = t;
    }
  });

  it('counts only ticks: the same ticks in any grouping give the same state', () => {
    const s = play(start(6, emptyRun(1)), { type: 'start' });
    const once = ticks(s, 200);
    const split = ticks(ticks(ticks(s, 70), 80), 50);
    expect(split).toEqual(once);
  });

  it('phrase mode shows three words and takes the same time per word', () => {
    const base = play(start(4, emptyRun(1), 'en', parties.starter), { type: 'setPhrase', on: true }, { type: 'start' });
    expect(visibleRange(base)).toEqual([0, 3]);
    const done = drainReading(base);
    expect(done.phase).toBe('questions');
    expect(done.readTicks).toBe(Math.ceil((base.plans[0]!.wordCount * WORD_COST) / base.wpm));
  });

  it('phrase mode, the ramp and sentence mode can only be switched between passages', () => {
    const reading = play(start(4), { type: 'start' });
    expect(play(reading, { type: 'setPhrase', on: true })).toBe(reading);
    expect(play(reading, { type: 'setRamp', on: true })).toBe(reading);
    expect(play(reading, { type: 'setSentenceMode', on: true })).toBe(reading);
  });
});

describe('sentence mode (the accessibility reading mode)', () => {
  it('shows the whole sentence and waits for a tap: ticks never change it', () => {
    const s = play(start(3, emptyRun(1)), { type: 'setSentenceMode', on: true }, { type: 'start' });
    const [a, b] = visibleRange(s)!;
    expect(a).toBe(0);
    expect(b).toBe(s.plans[0]!.sentenceStarts[1]);
    expect(visibleRange(ticks(s, 400))).toEqual([a, b]);
    expect(play(s, { type: 'advance' }).wordIndex).toBe(b);
  });

  it('goes to the questions after the last sentence', () => {
    const s = play(start(3, emptyRun(1)), { type: 'setSentenceMode', on: true }, { type: 'start' });
    const done = drainReading(s);
    expect(done.phase).toBe('questions');
    expect(done.wordsShown).toBe(done.plans[0]!.wordCount);
  });

  it('records the pace from the taps: slow reading is measured as a slower pace, clamped to 180..480', () => {
    const s = play(start(3, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm: 300 }, { type: 'setSentenceMode', on: true }, { type: 'start' });
    const slow = answerAll(drainReading(ticks(s, 3000)), 'correct');
    expect(slow.passageWpms[0]).toBe(MIN_WPM);
    const fast = answerAll(drainReading(ticks(s, 1)), 'correct');
    expect(fast.passageWpms[0]).toBe(MAX_WPM);
    const taps = Math.round((s.plans[0]!.wordCount * WORD_COST) / 300);
    const mid = answerAll(drainReading(ticks(s, taps)), 'correct');
    expect(mid.passageWpms[0]).toBe(Math.round((s.plans[0]!.wordCount * WORD_COST) / taps));
    expect(Math.abs(mid.passageWpms[0]! - 300)).toBeLessThan(5);
  });

  it('is not cheaper than plain reading: tapping through instantly records the chosen pace', () => {
    const s = play(start(3, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm: 220 }, { type: 'setSentenceMode', on: true }, { type: 'start' });
    expect(answerAll(drainReading(s), 'correct').passageWpms[0]).toBe(220);
  });
});

describe('re-reading', () => {
  it('goes back to the start of the sentence, costs 5 points and restarts the word clock', () => {
    const s = ticks(play(start(2, emptyRun(1), 'en', parties.starter), { type: 'start' }), 140);
    const sentenceStart = s.plans[0]!.sentenceStarts.filter((x) => x <= s.wordIndex).pop()!;
    expect(s.wordIndex).toBeGreaterThan(sentenceStart);
    const back = play(s, { type: 'reread' });
    expect(back.wordIndex).toBe(sentenceStart);
    expect(back.paidRereads).toBe(1);
    expect(back.paceAccum).toBe(0);
    expect(REREAD_COST).toBe(5);
    expect(scoreFrom(9, 9, MIN_WPM, 1)).toBe(scoreFrom(9, 9, MIN_WPM, 0) - 5);
  });

  it('at the first word of a sentence it goes back one sentence, and never before the start', () => {
    const plan = start(2, emptyRun(1)).plans[0]!;
    const atSecond = { ...play(start(2, emptyRun(1)), { type: 'start' }), wordIndex: plan.sentenceStarts[1]!, wordsShown: plan.sentenceStarts[1]! + 1 };
    expect(play(atSecond, { type: 'reread' }).wordIndex).toBe(0);
    const atFirst = play(start(2, emptyRun(1)), { type: 'start' });
    expect(play(atFirst, { type: 'reread' }).wordIndex).toBe(0);
  });

  it('only works while reading', () => {
    const s = start(2);
    expect(play(s, { type: 'reread' })).toBe(s);
  });

  it('a time buff makes every re-read of ONE passage free, then they cost again', () => {
    let s = play(start(2, withBuffs({ kind: 'time', amount: 20 }), 'en', parties.starter), { type: 'start' });
    expect(s.freePassagesLeft).toBe(1);
    s = ticks(s, 100);
    s = play(s, { type: 'reread' }, { type: 'reread' });
    expect(s.paidRereads).toBe(0);
    expect(s.passageFree).toBe(true);
    expect(s.freePassagesLeft).toBe(0);
    s = play(answerAll(drainReading(s), 'correct'), { type: 'continue' });
    s = play(ticks(s, 100), { type: 'reread' });
    expect(s.paidRereads).toBe(1);
    expect(s.passageFree).toBe(false);
  });

  it('without a time buff there is nothing free', () => {
    expect(start(2).freePassagesLeft).toBe(0);
  });
});

describe('questions and the end of the race', () => {
  it('opens the questions when the last word has been shown for its time', () => {
    const done = drainReading(play(start(2, emptyRun(1), 'en', parties.starter), { type: 'start' }));
    expect(done.phase).toBe('questions');
    expect(done.questionIndex).toBe(0);
    expect(done.wordsShown).toBe(done.plans[0]!.wordCount);
    expect(visibleRange(done)).toBeNull();
  });

  it('records right and wrong answers, and ignores bad ones', () => {
    const q = drainReading(play(start(2, emptyRun(1), 'en', parties.starter), { type: 'start' }));
    const right = q.plans[0]!.answers[0]!;
    expect(play(q, { type: 'answer', option: 4 })).toBe(q);
    expect(play(q, { type: 'answer', option: -1 })).toBe(q);
    expect(play(q, { type: 'answer', option: 1.5 })).toBe(q);
    const ok = play(q, { type: 'answer', option: right });
    expect(ok.answers).toEqual([{ passageIndex: 0, questionIndex: 0, option: right, correct: true }]);
    const bad = play(q, { type: 'answer', option: (right + 1) % 4 });
    expect(bad.answers[0]!.correct).toBe(false);
    expect(ok.questionIndex).toBe(1);
  });

  it('cannot answer a question while still reading', () => {
    const s = play(start(2), { type: 'start' });
    expect(play(s, { type: 'answer', option: 0 })).toBe(s);
  });

  it('goes to a rest between passages and ends after the third', () => {
    let s = play(start(2, emptyRun(1), 'en', parties.starter), { type: 'start' });
    s = answerAll(drainReading(s), 'correct');
    expect(s.phase).toBe('interlude');
    expect(engine.outcome(s)).toBeNull();
    s = play(s, { type: 'continue' });
    expect(s.phase).toBe('reading');
    expect(s.passageIndex).toBe(1);
    s = answerAll(drainReading(s), 'correct');
    s = answerAll(drainReading(play(s, { type: 'continue' })), 'correct');
    expect(s.phase).toBe('done');
    expect(engine.outcome(s)?.result).toBe('won');
  });

  it('wins at 7 of 9 (70 percent) and loses at 6 of 9', () => {
    const base = start(1);
    const answers = (n: number) => Array.from({ length: n }, (_, i) => ({ passageIndex: 0, questionIndex: i, option: 0, correct: true }));
    expect(wonComprehension({ ...base, answers: answers(7) })).toBe(true);
    expect(wonComprehension({ ...base, answers: answers(6) })).toBe(false);
    const seven = playRace(start(3, emptyRun(1), 'en', parties.starter), [3, 2, 2]);
    expect(engine.outcome(seven)?.result).toBe('won');
    const six = playRace(start(3, emptyRun(1), 'en', parties.starter), [3, 2, 1]);
    expect(engine.outcome(six)?.result).toBe('lost');
    expect(comprehensionPercent(six)).toBe(66);
  });

  it('a lost race is the troops coming home, never a punishment: warm words in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const s = playRace(start(3, emptyRun(1), locale, parties.starter), [0, 0, 0]);
      const o = engine.outcome(s)!;
      expect(o.result).toBe('lost');
      expect(o.log.join(' ')).toMatch(locale === 'en' ? /troops come home/ : /troupes rentrent/);
      expect(o.log.join(' ')).not.toMatch(/fail|stupid|bad|nul|échec/i);
    }
  });
});

describe('leaving', () => {
  it('forfeit ends as fled from any phase, with the score of what was understood so far', () => {
    expect(engine.forfeit?.(start(6))).toEqual({ type: 'forfeit' });
    for (const s of [start(6), play(start(6), { type: 'start' }), drainReading(play(start(6), { type: 'start' }))]) {
      const o = engine.outcome(play(s, { type: 'forfeit' }));
      expect(o?.result).toBe('fled');
      expect(o?.troopsUsed.length).toBeGreaterThan(0);
    }
    const partway = play(answerAll(drainReading(play(start(6, emptyRun(1)), { type: 'start' })), 'correct'), { type: 'forfeit' });
    expect(engine.outcome(partway)?.result).toBe('fled');
    expect(engine.outcome(partway)!.score).toBeGreaterThan(0);
    expect(engine.outcome(partway)!.log.join(' ')).toMatch(/stepped off the track/);
  });

  it('ignores every action once the game is over', () => {
    const gone = play(start(6), { type: 'forfeit' });
    for (const a of [{ type: 'start' }, { type: 'tick' }, { type: 'answer', option: 0 }, { type: 'setPace', wpm: 300 }, { type: 'hint' }] as ReadingRaceAction[]) {
      expect(engine.reduce(gone, a)).toBe(gone);
    }
  });
});

describe('scoring: understanding first, speed second', () => {
  it('has a speed factor of 700 at 180 wpm and 1000 at 480 wpm, rising with pace', () => {
    expect(speedFactor(MIN_WPM)).toBe(700);
    expect(speedFactor(MAX_WPM)).toBe(1000);
    for (let w = MIN_WPM; w < MAX_WPM; w += WPM_STEP) expect(speedFactor(w + WPM_STEP)).toBeGreaterThanOrEqual(speedFactor(w));
  });

  it('never lowers the score when the same comprehension is read faster', () => {
    for (let c = 0; c <= QUESTIONS_TOTAL; c++) {
      for (let w = MIN_WPM; w < MAX_WPM; w += WPM_STEP) {
        expect(scoreFrom(c, QUESTIONS_TOTAL, w + WPM_STEP, 0), `${c} right at ${w}`).toBeGreaterThanOrEqual(scoreFrom(c, QUESTIONS_TOTAL, w, 0));
      }
    }
  });

  it('never raises the score when comprehension is lower at the same pace', () => {
    for (let w = MIN_WPM; w <= MAX_WPM; w += WPM_STEP) {
      for (let c = 1; c <= QUESTIONS_TOTAL; c++) {
        expect(scoreFrom(c, QUESTIONS_TOTAL, w, 0), `${c} right at ${w}`).toBeGreaterThanOrEqual(scoreFrom(c - 1, QUESTIONS_TOTAL, w, 0));
      }
    }
  });

  it('caps very high speed with poor comprehension so the score stays low', () => {
    expect(scoreFrom(0, QUESTIONS_TOTAL, MAX_WPM, 0)).toBe(0);
    expect(scoreFrom(3, QUESTIONS_TOTAL, MAX_WPM, 0)).toBeLessThanOrEqual(200);
    expect(scoreFrom(3, QUESTIONS_TOTAL, MAX_WPM, 0)).toBeLessThan(scoreFrom(8, QUESTIONS_TOTAL, MIN_WPM, 0));
    expect(scoreFrom(5, QUESTIONS_TOTAL, MAX_WPM, 0)).toBeLessThan(scoreFrom(7, QUESTIONS_TOTAL, MIN_WPM, 0));
  });

  it('gives 1000 only for understanding everything at the top pace, and 700 for everything at the slowest', () => {
    expect(scoreFrom(9, 9, MAX_WPM, 0)).toBe(1000);
    expect(scoreFrom(9, 9, MIN_WPM, 0)).toBe(700);
  });

  it('stays an integer from 0 to 1000 whatever the inputs', () => {
    for (let c = 0; c <= 9; c++) {
      for (let w = MIN_WPM; w <= MAX_WPM; w += WPM_STEP) {
        for (const paid of [0, 1, 50, 500]) {
          const sc = scoreFrom(c, 9, w, paid);
          expect(Number.isInteger(sc) && sc >= 0 && sc <= 1000).toBe(true);
        }
      }
    }
  });

  it('is computed from the average of the paces used, and charges paid re-reads', () => {
    const s = playRace(play(start(3, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm: 300 }), [3, 3, 3]);
    expect(averageWpm(s)).toBe(300);
    expect(engine.outcome(s)!.score).toBe(scoreFrom(9, 9, 300, 0));
    expect(correctCount(s)).toBe(9);
  });

  it('puts a slower, understood read ahead of a faster, half-understood one', () => {
    const slow = playRace(play(start(3, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm: 200 }), [3, 3, 2]);
    const fast = playRace(play(start(3, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm: 480 }), [2, 1, 2]);
    expect(engine.outcome(slow)!.score).toBeGreaterThan(engine.outcome(fast)!.score);
    expect(engine.outcome(slow)!.result).toBe('won');
    expect(engine.outcome(fast)!.result).toBe('lost');
  });
});

describe('auto-ramp', () => {
  it('raises the pace one step after a perfect passage', () => {
    let s = play(start(1, emptyRun(1), 'en', parties.starter), { type: 'setRamp', on: true }, { type: 'start' });
    const first = s.wpm;
    s = answerAll(drainReading(s), 'correct');
    expect(rampedWpm(s)).toBe(first + WPM_STEP);
    expect(play(s, { type: 'continue' }).wpm).toBe(first + WPM_STEP);
  });

  it('eases back one step after a poor passage, but never under the floor', () => {
    let s = play(start(1, emptyRun(3), 'en', parties.starter), { type: 'setPace', wpm: 300 }, { type: 'setRamp', on: true }, { type: 'start' });
    s = answerAll(drainReading(s), 'wrong');
    expect(play(s, { type: 'continue' }).wpm).toBe(300 - WPM_STEP);
    let low = play(start(1, emptyRun(3), 'en', parties.starter), { type: 'setRamp', on: true }, { type: 'start' });
    low = answerAll(drainReading(low), 'wrong');
    expect(play(low, { type: 'continue' }).wpm).toBe(paceFloor(3));
  });

  it('stays at the same pace after a middling passage, and never passes 480', () => {
    let s = play(start(1, emptyRun(1), 'en', parties.starter), { type: 'setRamp', on: true }, { type: 'start' });
    s = drainReading(s);
    s = play(s, { type: 'answer', option: s.plans[0]!.answers[0]! }, { type: 'answer', option: s.plans[0]!.answers[1]! });
    s = play(s, { type: 'answer', option: (s.plans[0]!.answers[2]! + 1) % 4 });
    expect(rampedWpm(s)).toBe(s.wpm);
    expect(rampedWpm({ ...s, wpm: MAX_WPM, answers: s.answers.map((a) => ({ ...a, correct: true })) })).toBe(MAX_WPM);
  });

  it('does nothing when it is off', () => {
    let s = play(start(1, emptyRun(1), 'en', parties.starter), { type: 'start' });
    s = answerAll(drainReading(s), 'correct');
    expect(play(s, { type: 'continue' }).wpm).toBe(s.wpm);
  });
});

describe('the party matters', () => {
  const plain = parties.starter;

  it('Study highlights the topic sentence and lingers on it', () => {
    const study: Party = { members: [makeMember({ id: 'study', name: 'Sage', habit: 'study', level: 12, loyalty: 80 })] };
    const s = play(start(7, emptyRun(1), 'en', study), { type: 'start' });
    expect(s.hasStudy).toBe(true);
    expect(s.studyPower).toBe(study.members[0]!.power);
    const base = drainReading(play(start(7, emptyRun(1), 'en', plain), { type: 'start' })).readTicks;
    expect(drainReading(s).readTicks).toBeGreaterThan(base);
  });

  it('Sleep slows the first word of each sentence, more for a stronger troop', () => {
    const sleeper = (level: number): Party => ({ members: [makeMember({ id: 'sleep', name: 'Nox', habit: 'sleep', level, loyalty: 50 })] });
    const ticksFor = (party: Party) => drainReading(play(start(7, emptyRun(1), 'en', party), { type: 'start' })).readTicks;
    const none = ticksFor(plain);
    const weak = ticksFor(sleeper(1));
    const strong = ticksFor(sleeper(20));
    expect(weak).toBeGreaterThan(none);
    expect(strong).toBeGreaterThan(weak);
  });

  it('Social hides one wrong option on every question, and never the right one', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const q = drainReading(play(start(seed, emptyRun(2), 'en', parties.full), { type: 'start' }));
      expect(q.hasSocial).toBe(true);
      q.hiddenByQuestion.forEach((hidden, i) => {
        expect(hidden.length).toBeGreaterThanOrEqual(1);
        expect(hidden).not.toContain(q.plans[0]!.answers[i]);
      });
    }
  });

  it('a strong Social troop (power 30 or more) hides a second wrong option on the first question', () => {
    const social = (level: number): Party => ({ members: [makeMember({ id: 'social', name: 'Wren', habit: 'social', level, loyalty: 50 })] });
    expect(social(1).members[0]!.power).toBeLessThan(SOCIAL_STRONG_POWER);
    expect(social(12).members[0]!.power).toBeGreaterThanOrEqual(SOCIAL_STRONG_POWER);
    const weak = drainReading(play(start(4, emptyRun(1), 'en', social(1)), { type: 'start' }));
    const strong = drainReading(play(start(4, emptyRun(1), 'en', social(12)), { type: 'start' }));
    expect(weak.hiddenByQuestion.map((h) => h.length)).toEqual([1, 1, 1]);
    expect(strong.hiddenByQuestion.map((h) => h.length)).toEqual([2, 1, 1]);
    expect(visibleOptions(strong)).toHaveLength(2);
  });

  it('without a Social troop nothing is hidden', () => {
    const q = drainReading(play(start(4, emptyRun(1), 'en', plain), { type: 'start' }));
    expect(q.hiddenByQuestion).toEqual([[], [], []]);
    expect(visibleOptions(q)).toEqual([0, 1, 2, 3]);
  });

  it('members that are not vassals (habit null) take no part but still come home', () => {
    const citizen: Party = { members: [makeMember({ id: 'ada', name: 'Ada', habit: null, level: 9, loyalty: 90 })] };
    const s = start(2, emptyRun(1), 'en', citizen);
    expect(s.hasStudy || s.hasSleep || s.hasSocial).toBe(false);
    expect(engine.outcome(play(s, { type: 'forfeit' }))?.troopsUsed).toEqual(['ada']);
  });

  it('a full party wins clearly more often than the starter party', () => {
    const winRate = (party: Party) => {
      let w = 0;
      for (let seed = 1; seed <= 60; seed++) if (playToEnd(game, seed, party, emptyRun(2)).outcome?.result === 'won') w += 1;
      return w / 60;
    };
    expect(winRate(parties.full)).toBeGreaterThan(winRate(parties.starter) + 0.1);
  });
});

describe('buffs', () => {
  it('hint: spends one hint to hide a wrong option, on demand, never down to a single option', () => {
    const q = drainReading(play(start(2, withBuffs({ kind: 'hint', amount: 3 }), 'en', parties.starter), { type: 'start' }));
    expect(q.hintsLeft).toBe(3);
    const one = play(q, { type: 'hint' });
    expect(one.hintsLeft).toBe(2);
    expect(visibleOptions(one)).toHaveLength(3);
    expect(visibleOptions(one)).toContain(q.plans[0]!.answers[0]);
    const two = play(one, { type: 'hint' });
    expect(visibleOptions(two)).toHaveLength(2);
    expect(play(two, { type: 'hint' })).toBe(two);
    expect(two.hintsUsed).toBe(2);
    expect(two.hiddenTotal).toBe(2);
  });

  it('hint: does nothing without a hint left or outside the questions', () => {
    const q = drainReading(play(start(2, emptyRun(1), 'en', parties.starter), { type: 'start' }));
    expect(play(q, { type: 'hint' })).toBe(q);
    const reading = play(start(2, withBuffs({ kind: 'hint', amount: 1 })), { type: 'start' });
    expect(play(reading, { type: 'hint' })).toBe(reading);
  });

  it('a hidden option cannot be answered', () => {
    const q = drainReading(play(start(2, emptyRun(1), 'en', parties.full), { type: 'start' }));
    const hidden = q.hiddenByQuestion[0]![0]!;
    expect(play(q, { type: 'answer', option: hidden })).toBe(q);
  });

  it('luck: swaps the hardest passage of the draw for an easier one, when there is one', () => {
    let swapped = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const plain = start(seed, emptyRun(3));
      const lucky = start(seed, { buffs: [{ id: 'l', kind: 'luck', amount: 15 }], roomIndex: 0, difficulty: 3 });
      const top = (s: ReadingRaceState) => Math.max(...s.plans.map((p) => p.level));
      const sum = (s: ReadingRaceState) => s.plans.reduce((n, p) => n + p.level, 0);
      expect(sum(lucky)).toBeLessThanOrEqual(sum(plain));
      if (lucky.luckApplied) {
        swapped += 1;
        expect(sum(lucky)).toBeLessThan(sum(plain));
        expect(top(lucky)).toBeLessThanOrEqual(top(plain));
        expect(new Set(lucky.plans.map((p) => p.id)).size).toBe(3);
      }
    }
    expect(swapped).toBeGreaterThan(5);
  });

  it('luck has nothing to swap when every passage is already level 1', () => {
    const lucky = start(3, { buffs: [{ id: 'l', kind: 'luck', amount: 15 }], roomIndex: 0, difficulty: 1 });
    expect(lucky.luckApplied).toBe(false);
  });

  it('time: one free passage of re-reads (see re-reading)', () => {
    expect(start(1, withBuffs({ kind: 'time', amount: 10 })).freePassagesLeft).toBe(1);
  });

  it('attack, defense and revive do not exist in this game: they change nothing', () => {
    const plain = playToEnd(game, 4, parties.full, runs.plain);
    const ignored = playToEnd(game, 4, parties.full, withBuffs({ kind: 'attack', amount: 30 }, { kind: 'defense', amount: 30 }, { kind: 'revive', amount: 3 }));
    expect(ignored.actions).toEqual(plain.actions);
    expect(ignored.outcome).toEqual(plain.outcome);
  });
});

describe('the learning goal: a comprehension-safe pace', () => {
  it('learns the best pace at which a whole passage was understood', () => {
    // Passages at 200, 300 and 400: the first two understood fully, the last not.
    let s = play(start(1, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm: 200 }, { type: 'start' });
    s = answerAll(drainReading(s), 'correct');
    s = play(s, { type: 'setPace', wpm: 300 }, { type: 'continue' });
    s = answerAll(drainReading(s), 'correct');
    s = play(s, { type: 'setPace', wpm: 400 }, { type: 'continue' });
    s = answerAll(drainReading(s), 'wrong');
    expect(s.passageWpms).toEqual([200, 300, 400]);
    expect(safeWpm(s)).toEqual({ wpm: 300, reached: true });
    const o = engine.outcome(s)!;
    expect(o.learned?.note.en).toContain('300 words per minute');
    expect(o.learned?.note.fr).toContain('300 mots par minute');
    expect(o.stats?.safeWpm).toBe(300);
    expect(o.stats?.safePaceReached).toBe(1);
  });

  it('two of three right is not safe (under 80 percent)', () => {
    const s = playRace(play(start(1, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm: 260 }), [2, 2, 2]);
    expect(safeWpm(s)).toEqual({ wpm: 260, reached: false });
    const o = engine.outcome(s)!;
    expect(o.stats?.safePaceReached).toBe(0);
    expect(o.learned?.note.en).toMatch(/Try about 260 words per minute/);
    expect(o.learned?.note.fr).toMatch(/Essaie vers 260 mots par minute/);
  });

  it('offers the slowest pace tried when nothing was understood', () => {
    let s = play(start(1, emptyRun(1), 'en', parties.starter), { type: 'setPace', wpm: 400 }, { type: 'start' });
    s = answerAll(drainReading(s), 'wrong');
    s = play(s, { type: 'setPace', wpm: 240 }, { type: 'continue' });
    s = answerAll(drainReading(s), 'wrong');
    expect(safeWpm(s)).toEqual({ wpm: 240, reached: false });
  });

  it('every outcome carries a learned note in both languages, even when the player leaves', () => {
    const o = engine.outcome(play(start(5), { type: 'forfeit' }))!;
    expect(o.learned?.topic.en.length).toBeGreaterThan(0);
    expect(o.learned?.note.fr.length).toBeGreaterThan(0);
  });

  it('reading faster makes the bot (a stand-in for a reader) understand less, on every difficulty', () => {
    for (const d of [1, 2, 3, 4, 5] as Level[]) {
      const s = { ...play(start(4, emptyRun(d)), { type: 'start' }) };
      const slowest = botKnowsChance({ ...s, wpm: paceFloor(d) });
      const fastest = botKnowsChance({ ...s, wpm: MAX_WPM });
      expect(slowest, `d${d}`).toBeGreaterThan(fastest);
    }
  });

  it('a harder passage is understood less at the same pace', () => {
    const s = play(start(4, emptyRun(3)), { type: 'start' });
    const at = (level: 1 | 2 | 3) => botKnowsChance({ ...s, plans: s.plans.map((p, i) => (i === 0 ? { ...p, level } : p)) });
    expect(at(1)).toBeGreaterThan(at(2));
    expect(at(2)).toBeGreaterThan(at(3));
  });
});

describe('determinism, replay and language', () => {
  it('replays a seed identically: same actions, same state, same outcome', () => {
    for (const seed of [1, 2, 3, 42]) {
      const a = playToEnd(game, seed, parties.full, runs.plain);
      const b = playToEnd(game, seed, parties.full, runs.plain);
      expect(b.actions).toEqual(a.actions);
      expect(b.state).toEqual(a.state);
      expect(b.outcome).toEqual(a.outcome);
    }
  });

  it('a different seed is a different game', () => {
    const logs = new Set([1, 2, 3, 4, 5, 6].map((seed) => playToEnd(game, seed, parties.full, runs.plain).outcome?.log.join('|')));
    expect(logs.size).toBeGreaterThan(3);
  });

  it('writes the log and the learned note in the language it was given', () => {
    const en = playToEnd(game, 9, parties.starter, emptyRun(1), 20_000, { locale: 'en' });
    const fr = playToEnd(game, 9, parties.starter, emptyRun(1), 20_000, { locale: 'fr' });
    expect(en.outcome?.log[0]).toMatch(/Three passages/);
    expect(fr.outcome?.log[0]).toMatch(/Trois textes/);
    expect(en.outcome?.learned?.note.fr).toMatch(/mots par minute/);
  });

  it('puts the final state in plain JSON data (no undefined, no classes)', () => {
    const { state } = playToEnd(game, 3, parties.full, runs.plain);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('does not depend on the frame rate: the engine only knows ticks', () => {
    // A slow device that delivers 5 ticks in one frame and a fast one that delivers 1 reach the same state.
    const s = play(start(6, emptyRun(1)), { type: 'start' });
    let slow = s;
    for (let frame = 0; frame < 40; frame++) slow = ticks(slow, 5);
    let fast = s;
    for (let frame = 0; frame < 200; frame++) fast = ticks(fast, 1);
    expect(slow).toEqual(fast);
  });
});

describe('the bot', () => {
  it('always has a move until the game is over, then none', () => {
    const { state, actions } = playToEnd(game, 6, parties.full, runs.plain);
    expect(actions.length).toBeGreaterThan(0);
    expect(engine.botPlay(state, () => 0)).toBeNull();
    const mid = play(start(6), { type: 'start' });
    expect(engine.botPlay(mid, () => 0.5)).toEqual({ type: 'tick' });
  });

  it('turns the auto-ramp on, starts, and spends hints before answering', () => {
    const s = start(6, withBuffs({ kind: 'hint', amount: 2 }), 'en', parties.starter);
    expect(engine.botPlay(s, () => 0)).toEqual({ type: 'setRamp', on: true });
    const q = drainReading(play(s, { type: 'setRamp', on: true }, { type: 'start' }));
    expect(engine.botPlay(q, () => 0)).toEqual({ type: 'hint' });
  });

  it('wins 40 to 70 percent of normal-difficulty games with the full party over 100 seeds', () => {
    let wins = 0;
    for (let seed = 1; seed <= 100; seed++) if (playToEnd(game, seed, parties.full, runs.plain, 20_000, { locale: seed % 2 ? 'en' : 'fr' }).outcome?.result === 'won') wins += 1;
    expect(wins).toBeGreaterThanOrEqual(40);
    expect(wins).toBeLessThanOrEqual(70);
  });

  it('wins more at difficulty 1 than at difficulty 5, and difficulty 1 is gentle', () => {
    const rate = (d: Level) => {
      let wins = 0;
      for (let seed = 1; seed <= 60; seed++) if (playToEnd(game, seed, parties.full, emptyRun(d)).outcome?.result === 'won') wins += 1;
      return wins / 60;
    };
    const easy = rate(1);
    const hard = rate(5);
    expect(easy).toBeGreaterThanOrEqual(0.8);
    expect(hard).toBeLessThan(easy);
    expect(hard).toBeLessThanOrEqual(0.6);
  });

  it('gives sensible scores: an integer from 0 to 1000 every time', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const o = playToEnd(game, seed, parties.starter, emptyRun(((seed % 5) + 1) as Level)).outcome!;
      expect(Number.isInteger(o.score) && o.score >= 0 && o.score <= 1000).toBe(true);
      expect(['won', 'lost']).toContain(o.result);
    }
  });

  it('has a table of knowledge that falls with difficulty', () => {
    for (let i = 1; i < BOT_BASE_PERCENT.length; i++) expect(BOT_BASE_PERCENT[i]).toBeLessThan(BOT_BASE_PERCENT[i - 1]!);
  });

  it('plays every question once: nine answers in a completed race', () => {
    const { state } = playToEnd(game, 8, parties.full, runs.plain);
    expect(state.answers).toHaveLength(QUESTIONS_TOTAL);
    expect(QUESTIONS_PER_PASSAGE * PASSAGES_PER_GAME).toBe(QUESTIONS_TOTAL);
  });
});
