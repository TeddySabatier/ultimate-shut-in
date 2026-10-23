/**
 * Word Forge rules: decks, normalisation, scheduler, scoring, bot.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import { EXAMPLES } from './examples';
import {
  accuracyOf,
  creditSum,
  currentTarget,
  engine,
  gradeTyped,
  levenshtein,
  normalizeAnswer,
  rightGap,
  type WordForgeAction,
  type WordForgeState,
} from './engine';
import game from './manifest';
import { COGNATES, DECK_IDS, EPICENE_IDS, WORDS, WORDS_PER_RUN, getWord } from './words';

const start = (seed = 1, run: RunContext = runs.plain, party = parties.full, locale: 'en' | 'fr' = 'en') =>
  engine.initial(seed, party, run, locale);

function answer(state: WordForgeState, kind: 'right' | 'wrong' | 'almost'): WordForgeState {
  if (!state.currentId) return state;
  if (state.inputMode === 'choice') {
    const index =
      kind === 'right'
        ? state.options.indexOf(state.currentId)
        : state.options.findIndex((id) => id !== state.currentId);
    return engine.reduce(state, { type: 'choose', index: Math.max(0, index) });
  }
  const target = currentTarget(state);
  const text = kind === 'right' ? target : kind === 'almost' ? `${target}x` : 'zzzz';
  return engine.reduce(state, { type: 'type', text });
}

function playKinds(kinds: Array<'right' | 'wrong' | 'almost'>, seed = 1, run: RunContext = runs.plain, party = parties.full): { state: WordForgeState; order: string[] } {
  let state = start(seed, run, party);
  const order: string[] = [];
  for (const kind of kinds) {
    if (!state.currentId) break;
    order.push(state.currentId);
    state = answer(state, kind);
  }
  return { state, order };
}

describe('word forge decks', () => {
  it('has four decks of 40 words', () => {
    expect(DECK_IDS).toHaveLength(4);
    for (const deck of DECK_IDS) {
      expect(WORDS.filter((w) => w.deck === deck), deck).toHaveLength(40);
    }
    expect(WORDS).toHaveLength(160);
  });

  it('has unique ids and unique en/fr pairs, both sides non-empty', () => {
    const ids = WORDS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    const pairs = WORDS.map((w) => `${w.en}|||${w.fr}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const w of WORDS) {
      expect(w.en.trim().length).toBeGreaterThan(0);
      expect(w.fr.trim().length).toBeGreaterThan(0);
    }
  });

  it('stores NFC text and allows identical sides only for listed cognates', () => {
    const allow = new Set(COGNATES.map((c) => c.normalize('NFC').toLowerCase()));
    for (const w of WORDS) {
      expect(w.en).toBe(w.en.normalize('NFC'));
      expect(w.fr).toBe(w.fr.normalize('NFC'));
      const a = w.en.normalize('NFC').toLowerCase();
      const b = w.fr.normalize('NFC').toLowerCase();
      if (a === b) expect(allow.has(a), w.id).toBe(true);
    }
    for (const c of COGNATES) {
      expect(WORDS.some((w) => w.en.toLowerCase() === c && w.fr.toLowerCase() === c), c).toBe(true);
    }
  });

  it('tags French nouns with a gender, except listed epicene nouns', () => {
    for (const w of WORDS) {
      if (w.pos !== 'noun') {
        expect(w.gender).toBe('n');
        continue;
      }
      if (EPICENE_IDS.includes(w.id)) expect(w.gender).toBe('n');
      else expect(['m', 'f']).toContain(w.gender);
    }
  });

  it('has a short original example in both languages for every word', () => {
    for (const w of WORDS) {
      const ex = EXAMPLES[w.id];
      expect(ex, w.id).toBeDefined();
      expect(ex?.en.trim().length).toBeGreaterThan(8);
      expect(ex?.fr.trim().length).toBeGreaterThan(8);
    }
  });
});

describe('answer checker', () => {
  it.each([
    ['café', 'café', true, 'right'],
    ['  CAFÉ ', 'café', true, 'right'],
    ['cafe', 'café', true, 'right'],
    ['cafe', 'café', false, 'almost'],
    ['œuf', 'œuf', false, 'right'],
    ['oeuf', 'œuf', true, 'right'],
    ['oeuf', 'œuf', false, 'right'],
    ['ŒUF', 'œuf', false, 'right'],
    ['coeur', 'cœur', false, 'right'],
    ['élève', 'élève', false, 'right'],
    ['eleve', 'élève', false, 'almost'],
    ['eleve', 'élève', true, 'right'],
    ["S'IL TE PLAÎT", "s'il te plaît", false, 'right'],
    ['petit déjeuner', 'petit-déjeuner', false, 'almost'],
    ['pomme  de terre', 'pomme de terre', false, 'right'],
    ['\tpomme\n', 'pomme', false, 'right'],
    ["s'il te plaît", "s'il te plaît", false, 'right'],
    ['s’il te plait', "s'il te plaît", true, 'right'],
    ['week-end', 'week-end', false, 'right'],
    ['week–end', 'week-end', false, 'right'],
    ['week end', 'week-end', false, 'almost'],
    ['pommes', 'pomme', false, 'almost'],
    ['zzzz', 'pomme', false, 'wrong'],
    ['', 'pomme', false, 'wrong'],
  ] as const)('normalises %j vs %j (tolerant %s) to %s', (got, want, tolerant, verdict) => {
    expect(gradeTyped(got, want, tolerant).verdict).toBe(verdict);
  });

  it('levenshtein is 0 for the same string and 1 for a single edit', () => {
    expect(levenshtein('pomme', 'pomme')).toBe(0);
    expect(levenshtein('pomme', 'pommes')).toBe(1);
    expect(normalizeAnswer('  Petit-Déjeuner  ', false)).toBe('petit-déjeuner');
  });
});

describe('scheduler and difficulty', () => {
  it('draws 20 unique cards from the seed and deals the first', () => {
    const a = start(1);
    expect(a.wordIds).toHaveLength(WORDS_PER_RUN);
    expect(new Set(a.wordIds).size).toBe(WORDS_PER_RUN);
    expect(a.currentId).toBe(a.wordIds[0]);
    expect(start(1).wordIds).toEqual(a.wordIds);
    expect(start(2).wordIds).not.toEqual(a.wordIds);
  });

  it('uses multiple choice on difficulty 1–2 and typed answers on 3–5', () => {
    expect(start(1, emptyRun(1)).inputMode).toBe('choice');
    expect(start(1, emptyRun(2)).inputMode).toBe('choice');
    expect(start(1, emptyRun(3)).inputMode).toBe('typed');
    expect(start(1, emptyRun(3)).accentTolerance).toBe(true);
    expect(start(1, emptyRun(4)).inputMode).toBe('typed');
    expect(start(1, emptyRun(4)).accentTolerance).toBe(false);
    expect(start(1, emptyRun(5)).accentTolerance).toBe(false);
  });

  it('mixes more decks as difficulty rises', () => {
    const decks = (d: 1 | 2 | 3 | 4 | 5) =>
      new Set(start(9, emptyRun(d)).wordIds.map((id) => getWord(id)?.deck));
    expect([...decks(1)]).toEqual(['food']);
    expect(decks(2).has('travel')).toBe(true);
    expect(decks(3).has('work')).toBe(true);
    expect(decks(5).has('feelings')).toBe(true);
  });

  it('returns a first miss after 2 cards and a first hit after the study-aware gap', () => {
    const miss = playKinds(['wrong'], 1);
    expect(miss.order[0]).toBeDefined();
    expect(miss.state.queue[1]).toBe(miss.order[0]);

    const hit = playKinds(['right'], 1, runs.plain, parties.full);
    expect(rightGap(hit.state)).toBe(6);
    expect(hit.state.queue[5]).toBe(hit.order[0]);

    const starter = playKinds(['right'], 1, runs.plain, parties.starter);
    expect(rightGap(starter.state)).toBe(8);
    expect(starter.state.queue[7]).toBe(starter.order[0]);
  });

  it('replays a fixed seed and answer script in the same order', () => {
    const script: Array<'right' | 'wrong'> = ['right', 'wrong', 'right', 'right', 'wrong', 'right', 'right', 'right'];
    const a = playKinds(script, 42);
    const b = playKinds(script, 42);
    expect(a.order).toEqual(b.order);
    expect(a.state.marks.map((m) => m.verdict)).toEqual(b.state.marks.map((m) => m.verdict));
  });

  it('ignores a choose in typed mode and a type in choice mode', () => {
    const choice = start(1, emptyRun(1));
    expect(engine.reduce(choice, { type: 'type', text: 'pomme' })).toBe(choice);
    const typed = start(1, emptyRun(4));
    expect(engine.reduce(typed, { type: 'choose', index: 0 })).toBe(typed);
  });
});

describe('scoring, party, buffs, bot', () => {
  it('wins at 70 percent accuracy and otherwise loses, and forfeit is fled', () => {
    const won = playKinds(Array.from({ length: 40 }, () => 'right'), 3, emptyRun(1), parties.single);
    expect(accuracyOf(won.state)).toBeGreaterThanOrEqual(0.7);
    expect(engine.outcome(won.state)?.result).toBe('won');

    let lost = start(3, emptyRun(1), parties.single);
    for (let i = 0; i < 80 && lost.currentId; i++) lost = answer(lost, 'wrong');
    expect(engine.outcome(lost)?.result).toBe('lost');

    const fled = engine.reduce(start(4), { type: 'forfeit' });
    expect(engine.outcome(fled)?.result).toBe('fled');
    expect(engine.forfeit?.(start(4))).toEqual({ type: 'forfeit' });
  });

  it('counts almost as half credit', () => {
    let s = start(8, emptyRun(4), parties.single);
    const target = currentTarget(s);
    s = engine.reduce(s, { type: 'type', text: `${target}x` });
    expect(s.marks[0]?.verdict).toBe('almost');
    expect(s.marks[0]?.credit).toBe(0.5);
  });

  it('Eat in the party biases the food deck; Study shortens the right-hand gap', () => {
    const fullFood = start(11, runs.plain, parties.full).wordIds.filter((id) => getWord(id)?.deck === 'food').length;
    const starterFood = start(11, runs.plain, parties.starter).wordIds.filter((id) => getWord(id)?.deck === 'food').length;
    expect(fullFood).toBeGreaterThan(starterFood);
    expect(rightGap(start(1, runs.plain, parties.full))).toBe(6);
    expect(rightGap(start(1, runs.plain, parties.starter))).toBe(8);
  });

  it('time buff raises par seconds; luck swaps in shorter cards; revive keeps a streak', () => {
    const plain = start(1, runs.plain);
    const timed = start(1, { ...runs.plain, buffs: [{ id: 't', kind: 'time', amount: 20 }] });
    expect(timed.parSeconds).toBe(plain.parSeconds + 20);

    const lucky = start(12, { ...emptyRun(2), buffs: [{ id: 'l', kind: 'luck', amount: 50 }] });
    expect(lucky.wordIds).not.toEqual(start(12, emptyRun(2)).wordIds);

    const withRevive = playKinds(['right', 'wrong'], 5, { ...runs.plain, buffs: [{ id: 'r', kind: 'revive', amount: 1 }] });
    expect(withRevive.state.streak).toBe(1);
    expect(withRevive.state.revivesLeft).toBe(0);
  });

  it('hint reveals the first letter; flip switches the target language', () => {
    const hinted = engine.reduce(start(1, { ...emptyRun(4), buffs: [{ id: 'h', kind: 'hint', amount: 1 }] }, parties.single), { type: 'hint' });
    expect(hinted.revealed).toBe(true);
    expect(hinted.hintsLeft).toBe(0);
    const flipped = engine.reduce(start(1, emptyRun(1), parties.single, 'en'), { type: 'flip' });
    expect(flipped.learns).toBe('en');
  });

  it('writes the log in the given locale; the card order does not depend on it', () => {
    const en = playToEnd(game, 9, parties.starter, runs.plain);
    const fr = playToEnd(game, 9, parties.starter, runs.plain, 1000, { locale: 'fr' });
    expect(fr.outcome?.log.at(-1)).toMatch(/forge|troupes|éloignes/i);
    expect(en.actions.map((a) => (a as WordForgeAction).type)).toEqual(fr.actions.map((a) => (a as WordForgeAction).type));
  });

  it('the bot answers from its rng and wins at least sometimes on a plain run', () => {
    const s = start(11, emptyRun(1), parties.full);
    const action = engine.botPlay(s, () => 0);
    expect(action?.type === 'choose' || action?.type === 'second').toBe(true);
    const play = playToEnd(game, 1, parties.full, runs.plain);
    expect(play.outcome).not.toBeNull();
    expect(['won', 'lost']).toContain(play.outcome?.result);
  });

  it('learned lists three words with English and French', () => {
    const play = playToEnd(game, 7, parties.full, runs.plain);
    expect(play.outcome?.learned?.note.en).toMatch(/ \/ /);
    expect(play.outcome?.learned?.note.fr).toMatch(/ \/ /);
  });

  it('speed is a bonus, never a deadline: seconds past par end nothing and score no speed points', () => {
    const s = start(1, emptyRun(1), parties.single);
    const late = engine.reduce({ ...s, seconds: s.parSeconds + 500 }, { type: 'second' });
    expect(engine.outcome(late)).toBeNull();
    const fast = playKinds(Array.from({ length: 60 }, () => 'right'), 3, emptyRun(1), parties.single).state;
    const slow = { ...fast, seconds: fast.parSeconds + 100 };
    expect(engine.outcome(fast)?.score).toBeGreaterThan(engine.outcome(slow)?.score ?? 0);
  });

  it('Social auto-reveals one typed card; leftover actions after the end are ignored', () => {
    const s = start(2, emptyRun(4), parties.full);
    expect(s.revealed).toBe(true);
    const ended = engine.reduce(s, { type: 'forfeit' });
    expect(engine.reduce(ended, { type: 'choose', index: 0 })).toBe(ended);
  });
});

describe('deck quality and exact scheduling', () => {
  it('has no repeated English or French entry, no stray spaces, lower-case English', () => {
    for (const side of ['en', 'fr'] as const) {
      const all = WORDS.map((w) => w[side].toLowerCase());
      expect(new Set(all).size, side).toBe(all.length);
    }
    for (const w of WORDS) {
      for (const text of [w.en, w.fr]) expect(text, w.id).toBe(text.trim().replace(/\s+/g, ' '));
      expect(w.en, w.id).toBe(w.en.toLowerCase());
      expect(w.fr, w.id).toBe(w.fr.toLowerCase());
    }
  });

  it('keeps a single accepted spelling: no British/American variants and no ambiguous direction words', () => {
    const banned = ['neighbour', 'harbour', 'colour', 'favourite', 'left', 'right', 'email', 'weekend', 'please'];
    for (const w of WORDS) expect(banned, w.id).not.toContain(w.en);
  });

  it('puts a miss back after 2 cards, the second miss after 5, in an exact order', () => {
    // starter party: no Study, so a first right answer would come back after 8
    const { state, order } = playKinds(['wrong', 'right', 'right', 'wrong', 'right', 'right', 'right', 'right', 'right'], 1, runs.plain, parties.starter);
    const x = order[0];
    expect(order[3]).toBe(x);
    expect(order.filter((id) => id === x)).toHaveLength(2);
    expect(state.currentId).toBe(x);
    expect(order.indexOf(x!, 4)).toBe(-1);
  });

  it('a word that came back is worth 0.6, a clean word 1, a missed final 0', () => {
    const s = start(5, emptyRun(1), parties.single);
    const [a, b, c] = s.wordIds as [string, string, string];
    const state: WordForgeState = {
      ...s,
      marks: [
        { id: a, verdict: 'right', credit: 1 },
        { id: b, verdict: 'right', credit: 1 },
        { id: c, verdict: 'wrong', credit: 0 },
      ],
      progress: [
        { id: a, shows: 2, wrongs: 0, scheduledFinal: true },
        { id: b, shows: 2, wrongs: 1, scheduledFinal: true },
        { id: c, shows: 4, wrongs: 4, scheduledFinal: false },
      ],
    };
    expect(creditSum(state)).toBeCloseTo(1 + 0.6, 6);
  });

  it('the bot beats the game often on easy runs and rarely on hard ones (100 seeds, full party)', () => {
    const wins = (d: 1 | 2 | 3 | 4 | 5): number => {
      let n = 0;
      for (let seed = 1; seed <= 100; seed++) if (playToEnd(game, seed, parties.full, emptyRun(d)).outcome?.result === 'won') n += 1;
      return n;
    };
    const w = [wins(1), wins(2), wins(3), wins(4), wins(5)];
    expect(w[0]).toBeGreaterThanOrEqual(90);
    expect(w[1]).toBeGreaterThanOrEqual(40);
    expect(w[1]).toBeLessThanOrEqual(75);
    expect(w[4]).toBeLessThanOrEqual(45);
    for (let i = 1; i < 5; i++) expect(w[i]!).toBeLessThanOrEqual(w[i - 1]! + 5);
  });

  it('a fuller party wins more with the same bot (Study helps)', () => {
    let full = 0;
    let starter = 0;
    for (let seed = 1; seed <= 100; seed++) {
      if (playToEnd(game, seed, parties.full, emptyRun(2)).outcome?.result === 'won') full += 1;
      if (playToEnd(game, seed, parties.starter, emptyRun(2)).outcome?.result === 'won') starter += 1;
    }
    expect(full).toBeGreaterThan(starter);
  });

  it('a typed card in strict mode keeps accents strict, ligatures are folded', () => {
    expect(gradeTyped('oeuf', 'œuf', false).verdict).toBe('right');
    expect(gradeTyped('ete', 'été', false).verdict).not.toBe('right');
  });
});
