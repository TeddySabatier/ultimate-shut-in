/**
 * Memory Palace: pacing, the route as technique, hints, tips, the bot's error
 * model, exact scores and replay. Companion to engine.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  BOT_ERROR_PCT,
  BOT_HINTED_MISS_PCT,
  ROOM_IDS,
  TIME_TICKS_CAP,
  TIME_TICKS_PER_SECOND,
  TIP_COUNT,
  WIN_RATIO,
  botErrorPct,
  currentPlay,
  currentRound,
  displayTicksFor,
  engine,
  promptText,
  tally,
  tipIndex,
  type MemoryPalaceState,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import { WORDS, wordText } from './words';

const start = (seed = 1, run: RunContext = runs.plain, party = parties.full, locale: 'en' | 'fr' = 'en') => engine.initial(seed, party, run, locale);

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
  return item ? engine.reduce(s, { type: 'place', wordId: item.wordId, roomId: item.roomId }) : s;
}

function placeWrong(s: MemoryPalaceState): MemoryPalaceState {
  const round = currentRound(s);
  const play = currentPlay(s);
  if (!round || !play) return s;
  const used = new Set(play.placements.map((p) => p.wordId));
  const item = round.items.find((it) => !used.has(it.wordId));
  if (!item) return s;
  const other = ROOM_IDS.find((id) => id !== item.roomId)!;
  return engine.reduce(s, { type: 'place', wordId: item.wordId, roomId: other });
}

/** Play every round: `right` things correct (in order), the rest wrong. */
function playWith(s0: MemoryPalaceState, right: number): MemoryPalaceState {
  let s = s0;
  let left = right;
  let guard = 0;
  while (!engine.outcome(s) && guard++ < 300) {
    if (s.phase !== 'recall') s = skipLook(s);
    else if (left > 0) {
      s = placeCorrect(s);
      left -= 1;
    } else s = placeWrong(s);
  }
  return s;
}

describe('memory palace: pacing and the route', () => {
  it('starts on a ready card: ticks, places and hints do nothing until the player begins', () => {
    const s = start(3, emptyRun(1), parties.starter);
    expect(s.phase).toBe('intro');
    expect(engine.reduce(s, { type: 'tick' })).toBe(s);
    expect(engine.reduce(s, { type: 'place', wordId: 0, roomId: 'gate' })).toBe(s);
    expect(engine.reduce(s, { type: 'hint' })).toBe(s);
    const walking = engine.reduce(s, { type: 'advance' });
    expect(walking.phase).toBe('memorise');
    expect(walking.ticksLeft).toBe(s.displayTicksByRound[0]);
  });

  it('every round opens on its own ready card, with the palace empty again', () => {
    let s = skipLook(start(3, emptyRun(1), parties.starter));
    s = placeCorrect(placeCorrect(s));
    expect(s.roundIndex).toBe(1);
    expect(s.phase).toBe('intro');
    expect(currentPlay(s)?.placements).toEqual([]);
  });

  it('shows the things in walking order, gate first and tower last, so the route is the technique', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const difficulty of [1, 3, 5] as const) {
        for (const round of start(seed, emptyRun(difficulty)).rounds) {
          const order = round.items.map((it) => ROOM_IDS.indexOf(it.roomId));
          expect(order).toEqual([...order].sort((a, b) => a - b));
        }
      }
    }
  });

  it('puts one thing in each room up to six things; more than six reuse rooms', () => {
    for (const round of start(7, emptyRun(1)).rounds) {
      const rooms = round.items.map((it) => it.roomId);
      expect(new Set(rooms).size).toBe(rooms.length);
    }
    const hard = start(7, emptyRun(5));
    expect(hard.rounds[2]!.items).toHaveLength(10);
    expect(new Set(hard.rounds[2]!.items.map((it) => it.roomId)).size).toBe(6);
  });

  it('gives a human a real look: about 8 s at difficulty 1 down to 3 s at difficulty 5, never under 2 s', () => {
    const seconds = (d: 1 | 2 | 3 | 4 | 5) => (start(1, emptyRun(d), { members: [] }).displayTicksByRound[0]! * 50) / 1000;
    expect(seconds(1)).toBeCloseTo(8, 1);
    expect(seconds(5)).toBeCloseTo(3, 1);
    expect(seconds(1)).toBeGreaterThan(seconds(2));
    expect(seconds(4)).toBeGreaterThan(seconds(5));
    expect(displayTicksFor(5, 0, 0) * 50).toBeGreaterThanOrEqual(2000);
  });

  it('the time buff lengthens every look, with a cap', () => {
    const plain = start(1, emptyRun(3), parties.starter).displayTicksByRound[0]!;
    const buffed = start(1, { ...emptyRun(3), buffs: [{ id: 't', kind: 'time', amount: 10 }] }, parties.starter).displayTicksByRound[0]!;
    expect(buffed - plain).toBe(10 * TIME_TICKS_PER_SECOND);
    const huge = start(1, { ...emptyRun(3), buffs: [{ id: 't', kind: 'time', amount: 999 }] }, parties.starter).displayTicksByRound[0]!;
    expect(huge - plain).toBe(TIME_TICKS_CAP);
  });

  it('Sleep adds half its power, in ticks, to each look', () => {
    const slept = start(1, emptyRun(3), parties.full);
    const sleepPower = parties.full.members.find((m) => m.habit === 'sleep')!.power;
    const bare = start(1, emptyRun(3), { members: parties.full.members.filter((m) => m.habit !== 'sleep') });
    expect(slept.displayTicksByRound[0]! - bare.displayTicksByRound[0]!).toBe(Math.floor(sleepPower / 2));
  });
});

describe('memory palace: hints, tips and the bot', () => {
  it('a letter hint stays on the page for the round and the allowance resets in the next round', () => {
    let s = skipLook(start(5, emptyRun(2), parties.full));
    const perRound = s.hintsPerRound;
    expect(perRound).toBeGreaterThanOrEqual(1);
    s = engine.reduce(s, { type: 'hint' });
    expect(currentPlay(s)!.hints).toHaveLength(1);
    const count = currentRound(s)!.items.length;
    for (let i = 0; i < count; i++) s = placeCorrect(s);
    s = skipLook(s);
    expect(s.roundIndex).toBe(1);
    expect(s.hintsLeft).toBe(perRound);
    expect(currentPlay(s)!.hints).toEqual([]);
  });

  it('the bot misses less with a longer look, and never when the error is zero', () => {
    const base = start(2, emptyRun(3), parties.starter);
    const rested = start(2, { ...emptyRun(3), buffs: [{ id: 't', kind: 'time', amount: 20 }] }, parties.starter);
    expect(botErrorPct(rested)).toBeLessThan(botErrorPct(base));
    expect(botErrorPct(base)).toBe(BOT_ERROR_PCT[3]);
    expect(botErrorPct(start(2, emptyRun(1)))).toBe(0);
    for (let d = 2; d < 5; d++) expect(BOT_ERROR_PCT[d]!).toBeLessThan(BOT_ERROR_PCT[d + 1]!);
  });

  it('a party with Study wins more often than the same party without it', () => {
    const bare = { members: parties.full.members.filter((m) => m.habit !== 'study') };
    const wins = (party: typeof parties.full) => Array.from({ length: 80 }, (_, i) => playToEnd(game, i + 1, party, runs.plain)).filter((r) => r.outcome?.result === 'won').length;
    expect(wins(parties.full)).toBeGreaterThan(wins(bare));
    expect(BOT_HINTED_MISS_PCT).toBeLessThan(BOT_ERROR_PCT[2]!);
  });

  it('the bot never asks for more letters than it was given', () => {
    for (let i = 1; i <= 30; i++) {
      const st = playToEnd(game, i, parties.full, { ...emptyRun(4), buffs: [{ id: 'h', kind: 'hint', amount: 2 }] }).state as MemoryPalaceState;
      for (const play of st.plays) expect(play.hintsUsed).toBeLessThanOrEqual(st.hintsPerRound);
    }
  });

  it('a hint buff and a revive buff help the bot win', () => {
    const wins = (run: RunContext) => Array.from({ length: 80 }, (_, i) => playToEnd(game, i + 1, parties.starter, run)).filter((r) => r.outcome?.result === 'won').length;
    const plain = wins(emptyRun(3));
    expect(wins({ ...emptyRun(3), buffs: [{ id: 'h', kind: 'hint', amount: 2 }] })).toBeGreaterThan(plain);
    expect(wins({ ...emptyRun(3), buffs: [{ id: 'r', kind: 'revive', amount: 1 }] })).toBeGreaterThan(plain);
  });

  it('prompts name the room, the thing and a caption, and read as a label in French', () => {
    const en = start(8, emptyRun(1), parties.starter, 'en');
    const fr = start(8, emptyRun(1), parties.starter, 'fr');
    const itEn = en.rounds[0]!.items[0]!;
    const itFr = fr.rounds[0]!.items[0]!;
    const textEn = promptText(en, itEn, strings.en);
    const textFr = promptText(fr, itFr, strings.fr);
    expect(textEn).toContain(wordText(itEn.wordId, 'en'));
    expect(textEn).toContain(strings.en.prompts[itEn.promptId]!);
    expect(textFr).toContain(wordText(itFr.wordId, 'fr'));
    expect(textFr).toMatch(/^(Au|Dans) .+ : /);
    expect(strings.en.prompts).toHaveLength(strings.fr.prompts.length);
    expect(strings.en.tips).toHaveLength(TIP_COUNT);
    expect(strings.fr.tips).toHaveLength(TIP_COUNT);
  });

  it('the learned note carries the technique and one tip of the walk, in both languages', () => {
    const o = engine.outcome(engine.reduce(start(8), { type: 'forfeit' }))!;
    const tip = tipIndex(8, 2);
    expect(o.learned?.note.en).toBe(`You can hold more when each thing has a place. ${strings.en.tips[tip]}`);
    expect(o.learned?.note.fr).toBe(`Tu retiens plus quand chaque chose a sa place. ${strings.fr.tips[tip]}`);
    expect(new Set(Array.from({ length: TIP_COUNT }, (_, r) => tipIndex(3, r))).size).toBe(TIP_COUNT);
  });

  it('keeps room names out of the word list, so a thing is never mistaken for a room', () => {
    const rooms = new Set(['gate', 'hall', 'kitchen', 'library', 'garden', 'tower', 'portail', 'cuisine', 'bibliothèque', 'jardin', 'tour']);
    for (const w of WORDS) {
      expect(rooms.has(w.en), w.en).toBe(false);
      expect(rooms.has(w.fr), w.fr).toBe(false);
    }
  });
});

describe('memory palace: scores and outcomes', () => {
  it('scores are exact: all right 1000, all wrong 0, two of twelve is two twelfths of 1000', () => {
    const perfect = playWith(start(6, emptyRun(1), parties.starter), 99);
    expect(engine.outcome(perfect)?.score).toBe(1000);
    const none = playWith(start(6, emptyRun(1), parties.starter), 0);
    expect(engine.outcome(none)?.score).toBe(0);
    expect(engine.outcome(none)?.result).toBe('lost');
    const two = playWith(start(6, emptyRun(1), parties.starter), 2);
    expect(tally(two).correct).toBe(2);
    expect(engine.outcome(two)?.score).toBe(Math.round((1000 * 2) / 12));
  });

  it('asking for letters costs the 150-point bonus, not the win', () => {
    let s = skipLook(start(6, emptyRun(1), parties.full));
    s = engine.reduce(s, { type: 'hint' });
    const o = engine.outcome(playWith(s, 99))!;
    expect(o.result).toBe('won');
    expect(o.score).toBe(850);
    expect(o.stats?.hintsUsed).toBe(1);
  });

  it('a game left half way keeps a partial score and the board', () => {
    let s = skipLook(start(6, emptyRun(1), parties.starter));
    s = engine.reduce(placeCorrect(s), { type: 'forfeit' });
    const o = engine.outcome(s)!;
    expect(o.result).toBe('fled');
    expect(o.score).toBe(Math.round((400 * 1) / 12));
    expect(engine.reduce(s, { type: 'place', wordId: 0, roomId: 'gate' })).toBe(s);
  });

  it('wins at 70 percent and loses just below', () => {
    expect(WIN_RATIO).toBe(70);
    // Difficulty 2 has 3 + 5 + 7 = 15 things: 11 is 73 percent, 10 is 67 percent.
    expect(engine.outcome(playWith(start(6, emptyRun(2), parties.starter), 11))?.result).toBe('won');
    expect(engine.outcome(playWith(start(6, emptyRun(2), parties.starter), 10))?.result).toBe('lost');
    // Difficulty 1 has 12 things: 9 is 75 percent, 8 is 67 percent.
    expect(engine.outcome(playWith(start(6, emptyRun(1), parties.starter), 9))?.result).toBe('won');
    expect(engine.outcome(playWith(start(6, emptyRun(1), parties.starter), 8))?.result).toBe('lost');
  });

  it('difficulty 1 is gentle: few things, a long look, one distractor, and the bot wins', () => {
    const s = start(77, emptyRun(1), parties.starter);
    expect(s.rounds.map((x) => x.items.length)).toEqual([2, 4, 6]);
    expect(s.rounds.every((x) => x.distractors.length === 1)).toBe(true);
    expect(playToEnd(game, 77, parties.starter, emptyRun(1)).outcome?.result).toBe('won');
  });

  it('replaying the same seed, party and run gives the same walk and outcome; another seed differs', () => {
    const a = playToEnd(game, 31, parties.full, runs.plain);
    const b = playToEnd(game, 31, parties.full, runs.plain);
    expect(b.actions).toEqual(a.actions);
    expect(b.outcome).toEqual(a.outcome);
    expect(playToEnd(game, 32, parties.full, runs.plain).actions).not.toEqual(a.actions);
  });
});
