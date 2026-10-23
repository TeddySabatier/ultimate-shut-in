/**
 * Memory Palace rules: word lists, picker, scoring, difficulty, party, buffs,
 * the bot's error model, and determinism. The contract kit covers the generic
 * properties; this file covers what only this game does.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  BOT_ERROR_PCT,
  HINT_BONUS,
  SCORE_BASE,
  TIME_TICKS_PER_SECOND,
  WIN_RATIO,
  currentItem,
  currentPlay,
  currentRound,
  displayTicksFor,
  distractorCount,
  engine,
  extraDisplayTicks,
  itemCounts,
  outcomeLog,
  remainingChoices,
  tally,
  trueRoomOf,
  type MemoryPalaceState,
  type RoomId,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import { CONFUSABLE_GROUPS, WORDS, areConfusable, pickWords, wordText } from './words';
import { mulberry32 } from '../../game/rng';

const start = (seed = 1, run: RunContext = runs.plain, party = parties.full, locale: 'en' | 'fr' = 'en') =>
  engine.initial(seed, party, run, locale);

function skipLook(s: MemoryPalaceState): MemoryPalaceState {
  let next = s;
  while (next.phase === 'intro' || next.phase === 'memorise') next = engine.reduce(next, { type: 'advance' });
  return next;
}

function placeCorrect(s: MemoryPalaceState): MemoryPalaceState {
  const round = currentRound(s);
  const play = currentPlay(s);
  if (!round || !play) return s;
  const used = new Set(play.placements.map((p) => p.wordId));
  const item = round.items.find((it) => !used.has(it.wordId));
  if (!item) return s;
  return engine.reduce(s, { type: 'place', wordId: item.wordId, roomId: item.roomId });
}

function placeWrong(s: MemoryPalaceState): MemoryPalaceState {
  const round = currentRound(s);
  const play = currentPlay(s);
  if (!round || !play) return s;
  const used = new Set(play.placements.map((p) => p.wordId));
  const item = round.items.find((it) => !used.has(it.wordId));
  if (!item) return s;
  const other = (['gate', 'hall', 'kitchen', 'library', 'garden', 'tower'] as const).find((id) => id !== item.roomId) as RoomId;
  return engine.reduce(s, { type: 'place', wordId: item.wordId, roomId: other });
}

function playPerfect(s: MemoryPalaceState): MemoryPalaceState {
  let next = s;
  let guard = 0;
  while (!engine.outcome(next) && guard < 80) {
    guard += 1;
    if (next.phase === 'intro' || next.phase === 'memorise') next = skipLook(next);
    else if (next.phase === 'recall') next = placeCorrect(next);
    else break;
  }
  return next;
}

function playAllWrong(s: MemoryPalaceState): MemoryPalaceState {
  let next = s;
  let guard = 0;
  while (!engine.outcome(next) && guard < 80) {
    guard += 1;
    if (next.phase === 'intro' || next.phase === 'memorise') next = skipLook(next);
    else if (next.phase === 'recall') next = placeWrong(next);
    else break;
  }
  return next;
}

describe('memory palace word lists', () => {
  it('has 150 words in each language, no duplicates, equal sizes', () => {
    expect(WORDS).toHaveLength(150);
    const en = WORDS.map((w) => w.en);
    const fr = WORDS.map((w) => w.fr);
    expect(new Set(en).size).toBe(150);
    expect(new Set(fr).size).toBe(150);
    expect(en.every((w) => w.length > 0)).toBe(true);
    expect(fr.every((w) => w.length > 0)).toBe(true);
  });

  it('names every confusable group member in the word list', () => {
    const names = new Set(WORDS.map((w) => w.en));
    for (const group of CONFUSABLE_GROUPS) {
      for (const name of group) expect(names.has(name), name).toBe(true);
    }
  });

  it('the seeded picker never repeats within a round', () => {
    const rng = mulberry32(7);
    const ids = pickWords(rng, 12);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });

  it('the seeded picker never mixes a confusable pair in one round', () => {
    for (const seed of [1, 7, 42, 99, 1337, 2026, 90210]) {
      const ids = pickWords(mulberry32(seed), 14);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          expect(areConfusable(ids[i]!, ids[j]!), `seed ${seed} ${ids[i]} ${ids[j]}`).toBe(false);
        }
      }
    }
  });

  it('the same seed picks the same words; a different seed differs', () => {
    const a = pickWords(mulberry32(11), 8);
    const b = pickWords(mulberry32(11), 8);
    const c = pickWords(mulberry32(12), 8);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('memory palace engine', () => {
  it('scales item counts, look time and distractors with difficulty', () => {
    expect(itemCounts(1)).toEqual([2, 4, 6]);
    expect(itemCounts(3)).toEqual([4, 6, 8]);
    expect(itemCounts(5)).toEqual([6, 8, 10]);
    expect(distractorCount(1, 0)).toBe(1);
    expect(distractorCount(5, 0)).toBe(5);
    expect(distractorCount(5, 15)).toBe(4);
    const easy = start(3, emptyRun(1));
    const hard = start(3, emptyRun(5));
    expect(easy.rounds.map((r) => r.items.length)).toEqual([2, 4, 6]);
    expect(hard.rounds.map((r) => r.items.length)).toEqual([6, 8, 10]);
    expect(easy.displayTicksByRound[0]!).toBeGreaterThan(hard.displayTicksByRound[0]!);
    expect(hard.rounds[0]!.distractors.length).toBeGreaterThan(easy.rounds[0]!.distractors.length);
  });

  it('does not repeat a word inside a round, items plus distractors', () => {
    const s = start(42, emptyRun(5));
    for (const round of s.rounds) {
      const ids = [...round.items.map((it) => it.wordId), ...round.distractors];
      expect(new Set(ids).size).toBe(ids.length);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) expect(areConfusable(ids[i]!, ids[j]!)).toBe(false);
      }
    }
  });

  it('look time grows with Sleep power and the time buff', () => {
    const plain = displayTicksFor(2, 0, 0);
    const slept = displayTicksFor(2, 44, 0);
    const timed = displayTicksFor(2, 0, 20);
    expect(slept).toBeGreaterThan(plain);
    expect(timed).toBeGreaterThan(plain);
    expect(extraDisplayTicks(44, 20)).toBe(Math.floor(44 / 2) + 20 * TIME_TICKS_PER_SECOND);
    const full = start(1, runs.plain, parties.full);
    const starter = start(1, runs.plain, parties.starter);
    expect(full.displayTicksByRound[0]!).toBeGreaterThan(starter.displayTicksByRound[0]!);
  });

  it('Study grants a letter hint; a hint buff adds more; high Study power reveals two letters', () => {
    const full = start(2);
    const starter = start(2, runs.plain, parties.starter);
    const single = start(2, runs.plain, parties.single);
    expect(full.hintsPerRound).toBeGreaterThan(starter.hintsPerRound);
    expect(full.hintLetters).toBe(2);
    expect(single.hintLetters).toBe(1);
    const buffed = start(2, runs.buffed);
    expect(buffed.hintsPerRound).toBe(full.hintsPerRound + 2);
  });

  it('ticks drain look time then open the next item, then recall', () => {
    let s = engine.reduce(start(4, emptyRun(1), parties.starter), { type: 'advance' });
    const first = currentItem(s);
    expect(first).toBeTruthy();
    const startTicks = s.ticksLeft;
    s = engine.reduce(s, { type: 'tick' });
    expect(s.ticksLeft).toBe(startTicks - 1);
    while (s.phase === 'memorise' && s.showIndex === 0) s = engine.reduce(s, { type: 'tick' });
    expect(s.showIndex === 1 || s.phase === 'recall').toBe(true);
  });

  it('advance skips the rest of the look and eventually opens recall', () => {
    const s = skipLook(start(5, emptyRun(1), parties.starter));
    expect(s.phase).toBe('recall');
    expect(currentRound(s)?.items.length).toBe(itemCounts(1)[0]);
  });

  it('a correct place scores; a wrong room or a distractor does not', () => {
    const s = skipLook(start(8, emptyRun(1), parties.starter));
    const round = currentRound(s)!;
    const item = round.items[0]!;
    const ok = engine.reduce(s, { type: 'place', wordId: item.wordId, roomId: item.roomId });
    expect(currentPlay(ok)?.placements[0]?.correct).toBe(true);
    const other = (['gate', 'hall', 'kitchen', 'library', 'garden', 'tower'] as const).find((id) => id !== item.roomId)!;
    const bad = engine.reduce(s, { type: 'place', wordId: item.wordId, roomId: other });
    expect(currentPlay(bad)?.placements[0]?.correct).toBe(false);
    if (round.distractors[0] !== undefined) {
      const distractor = engine.reduce(s, { type: 'place', wordId: round.distractors[0], roomId: item.roomId });
      expect(currentPlay(distractor)?.placements[0]?.correct).toBe(false);
    }
  });

  it('ignores an unknown word, a second place of the same word, and actions after the end', () => {
    const s = skipLook(start(9, emptyRun(1), parties.starter));
    expect(engine.reduce(s, { type: 'place', wordId: 9999, roomId: 'gate' })).toBe(s);
    const placed = placeCorrect(s);
    const wordId = currentPlay(placed)!.placements[0]!.wordId;
    expect(engine.reduce(placed, { type: 'place', wordId, roomId: 'hall' })).toBe(placed);
    const done = engine.reduce(placed, { type: 'forfeit' });
    expect(engine.reduce(done, { type: 'advance' })).toBe(done);
  });

  it('scores 1000 for a perfect no-hint walk, 850 with hints, and a partial score in between', () => {
    const perfect = playPerfect(start(6, emptyRun(1), parties.starter));
    const o = engine.outcome(perfect);
    expect(o?.result).toBe('won');
    expect(tally(perfect).correct).toBe(tally(perfect).total);
    expect(o?.score).toBe(SCORE_BASE + HINT_BONUS);
    let hinted = skipLook(start(6, emptyRun(1), parties.full));
    hinted = engine.reduce(hinted, { type: 'hint' });
    hinted = playPerfect(hinted);
    const ho = engine.outcome(hinted);
    expect(ho?.result).toBe('won');
    expect(ho?.score).toBe(SCORE_BASE);
  });

  it('scores 0 for an empty forfeit and a mid-range score for a partial recall', () => {
    const empty = engine.reduce(start(10), { type: 'forfeit' });
    const eo = engine.outcome(empty);
    expect(eo?.result).toBe('fled');
    expect(eo?.score).toBe(0);
    const { total } = tally(empty);
    expect(total).toBeGreaterThan(0);
    let partial = skipLook(start(12, emptyRun(1), parties.starter));
    partial = placeCorrect(partial);
    partial = engine.reduce(partial, { type: 'forfeit' });
    const po = engine.outcome(partial);
    expect(po?.result).toBe('fled');
    expect(po?.score).toBeGreaterThan(0);
    expect(po?.score).toBeLessThan(400);
  });

  it('wins at 70 percent correct and loses just below', () => {
    const lost = playAllWrong(start(13, emptyRun(1), parties.starter));
    expect(engine.outcome(lost)?.result).toBe('lost');
    expect(accuracyOf(lost)).toBe(0);
    expect(WIN_RATIO).toBe(70);
  });

  it('a letter hint names a forgotten item and its room, and spends one use', () => {
    let s = skipLook(start(14, emptyRun(2), parties.full));
    const before = s.hintsLeft;
    s = engine.reduce(s, { type: 'hint' });
    expect(s.hintsLeft).toBe(before - 1);
    const hint = currentPlay(s)?.hints[0];
    expect(hint).toBeTruthy();
    expect(trueRoomOf(currentRound(s)!, hint!.wordId)).toBe(hint!.roomId);
    expect(hint!.prefix.length).toBeGreaterThanOrEqual(1);
    expect(engine.reduce(s, { type: 'hint' }).hintsLeft).toBe(0);
  });

  it('luck removes a distractor; revive retries the weakest round', () => {
    const plain = start(15, emptyRun(4));
    const lucky = start(15, { ...emptyRun(4), buffs: [{ id: 'l', kind: 'luck', amount: 15 }] });
    expect(lucky.rounds[0]!.distractors.length).toBe(plain.rounds[0]!.distractors.length - 1);
    let s = start(16, { ...emptyRun(1), buffs: [{ id: 'r', kind: 'revive', amount: 1 }] }, parties.starter);
    s = skipLook(s);
    const n = currentRound(s)!.items.length;
    for (let i = 0; i < n; i++) s = placeWrong(s);
    expect(s.reviveUsed).toBe(false);
    s = skipLook(s);
    while (s.phase === 'recall' && s.roundIndex === 1) s = placeWrong(s);
    s = skipLook(s);
    while (s.phase === 'recall' && !s.reviveUsed) s = placeWrong(s);
    expect(s.reviveUsed).toBe(true);
    expect(s.phase).toBe('intro');
  });

  it('Social marks a visible room-count tip; starter parties do not', () => {
    expect(start(1, runs.plain, parties.full).hasSocial).toBe(true);
    expect(start(1, runs.plain, parties.starter).hasSocial).toBe(false);
    const log = outcomeLog(engine.reduce(start(1), { type: 'forfeit' }), strings.en);
    expect(log.some((line) => /friend counted/i.test(line))).toBe(true);
  });

  it('writes the log in the locale it was given; the walk itself does not depend on it', () => {
    const en = playToEnd(game, 9, parties.starter, emptyRun(1));
    const fr = playToEnd(game, 9, parties.starter, emptyRun(1), 20_000, { locale: 'fr' });
    expect(en.outcome?.log).toEqual(outcomeLog(en.state as MemoryPalaceState, strings.en));
    expect(fr.outcome?.log[0]).toMatch(/^Manche 1/);
    expect(fr.outcome?.log).toHaveLength(en.outcome?.log.length ?? 0);
    expect(fr.actions).toEqual(en.actions);
    expect({ ...fr.outcome, log: [], learned: undefined }).toEqual({ ...en.outcome, log: [], learned: undefined });
  });

  it('forfeit is the leave action the kit plays', () => {
    expect(engine.forfeit?.(start(6))).toEqual({ type: 'forfeit' });
  });

  it('the bot recalls perfectly on difficulty 1', () => {
    const r = playToEnd(game, 21, parties.full, emptyRun(1));
    const { correct, total } = tally(r.state as MemoryPalaceState);
    expect(correct).toBe(total);
    expect(r.outcome?.result).toBe('won');
    expect(BOT_ERROR_PCT[1]).toBe(0);
  });

  it('the bot recalls imperfectly on difficulty 5', () => {
    const r = playToEnd(game, 22, parties.full, emptyRun(5));
    const { correct, total } = tally(r.state as MemoryPalaceState);
    expect(correct).toBeLessThan(total);
    expect(BOT_ERROR_PCT[5]).toBeGreaterThan(0);
  });

  it('the bot wins some and loses some on difficulty 2', () => {
    const results = Array.from({ length: 60 }, (_, i) => playToEnd(game, i + 1, parties.full, runs.plain).outcome?.result);
    const wins = results.filter((r) => r === 'won').length;
    expect(results).toContain('won');
    expect(results).toContain('lost');
    expect(wins).toBeGreaterThanOrEqual(24);
    expect(wins).toBeLessThanOrEqual(46);
  });

  it('remaining choices drop after a place, and troopsUsed stays inside the party', () => {
    const s = skipLook(start(30, emptyRun(1), parties.mixed));
    const before = remainingChoices(s).length;
    const next = placeCorrect(s);
    expect(remainingChoices(next).length).toBe(before - 1);
    const o = engine.outcome(engine.reduce(start(30, runs.plain, parties.mixed), { type: 'forfeit' }));
    const ids = new Set(parties.mixed.members.map((m) => m.id));
    expect(o?.troopsUsed.every((id) => ids.has(id))).toBe(true);
    expect(o?.learned?.note.en).toMatch(/You can hold more when each thing has a place/);
  });

  it('the locale word list is used for prompts and prefixes', () => {
    const en = skipLook(start(40, emptyRun(1), parties.full, 'en'));
    const hinted = engine.reduce(en, { type: 'hint' });
    const prefix = currentPlay(hinted)!.hints[0]!.prefix;
    const wordId = currentPlay(hinted)!.hints[0]!.wordId;
    expect(wordText(wordId, 'en').startsWith(prefix)).toBe(true);
    const item = currentItem(engine.reduce(start(40, emptyRun(1), parties.full, 'fr'), { type: 'advance' }));
    expect(item).toBeTruthy();
    expect(wordText(item!.wordId, 'fr').length).toBeGreaterThan(0);
  });
});

function accuracyOf(state: MemoryPalaceState): number {
  const { correct, total } = tally(state);
  return total === 0 ? 0 : Math.round((correct * 100) / total);
}
