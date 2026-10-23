/**
 * Scroll Room rules: drawing, modes, grading, scheduling, scoring, setup,
 * hints, buffs, party, bot balance.
 */
import { describe, expect, it } from 'vitest';
import { fnv1a, mulberry32 } from '../../game/rng';
import { emptyRun, type RunContext } from '../contract';
// eslint-disable-next-line no-restricted-imports -- src/games/shared holds cross-game helpers (CONTRACT.md section 2)
import { DECKS, SUBJECT_IDS, cardsOf, getCard, type Card } from '../shared/decks';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  CARDS_PER_RUN,
  WIN_ACCURACY,
  accuracyOf,
  compact,
  currentCard,
  engine,
  gradeOrder,
  gradeTech,
  hardestTwo,
  isWeak,
  modeFor,
  optionTexts,
  pickCards,
  recallOf,
  rightGap,
  scoreOf,
  weakSet,
  type CardHistory,
  type ScrollState,
} from './engine';
import game from './manifest';

const start = (seed = 1, run: RunContext = runs.plain, party = parties.full, locale: 'en' | 'fr' = 'en') => engine.initial(seed, party, run, locale);
const d = (n: 1 | 2 | 3 | 4 | 5) => emptyRun(n);

/** Answer the current card right, wrong or almost, then move past the explanation. */
function answer(state: ScrollState, kind: 'right' | 'wrong' | 'almost'): ScrollState {
  const card = currentCard(state);
  if (!card) return state;
  let s = state;
  if (state.mode === 'choice') {
    const right = state.options.indexOf(0);
    const wrong = state.options.findIndex((o) => o !== 0);
    s = engine.reduce(state, { type: 'choose', index: kind === 'right' ? right : wrong });
  } else if (state.mode === 'typed') {
    const text = kind === 'right' ? card.answer : kind === 'almost' ? `${card.answer}x` : 'zzzzzzzz';
    s = engine.reduce(state, { type: 'type', text });
  } else {
    const ids = (card.steps ?? []).map((_, i) => i);
    const order = kind === 'right' ? ids : kind === 'almost' ? [ids[1]!, ids[0]!, ...ids.slice(2)] : [...ids.slice(1), ids[0]!];
    s = engine.reduce(state, { type: 'order', order });
  }
  return engine.reduce(s, { type: 'next' });
}

function play(kinds: Array<'right' | 'wrong' | 'almost'>, seed = 1, run: RunContext = runs.plain, party = parties.full): { state: ScrollState; order: string[] } {
  let state = start(seed, run, party);
  const order: string[] = [];
  for (const kind of kinds) {
    if (!state.currentId) break;
    order.push(state.currentId);
    state = answer(state, kind);
  }
  return { state, order };
}

function playAll(kind: 'right' | 'wrong', seed = 1, run: RunContext = runs.plain, party = parties.full): ScrollState {
  let state = start(seed, run, party);
  for (let i = 0; i < 200 && state.currentId; i++) state = answer(state, kind);
  return state;
}

function winRate(difficulty: 1 | 2 | 3 | 4 | 5, party = parties.full, seeds = 60): number {
  let wins = 0;
  for (let seed = 1; seed <= seeds; seed++) if (playToEnd(game, seed, party, emptyRun(difficulty)).outcome?.result === 'won') wins += 1;
  return wins / seeds;
}

describe('drawing cards', () => {
  it('draws 15 to 20 unique cards from every deck by default, by difficulty', () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      const s = start(1, d(n));
      expect(s.cardIds).toHaveLength(CARDS_PER_RUN[n]);
      expect(new Set(s.cardIds).size).toBe(s.cardIds.length);
      expect(s.decks).toEqual([...SUBJECT_IDS]);
      expect(s.cardIds.every((id) => getCard(id))).toBe(true);
    }
    expect(CARDS_PER_RUN.slice(1).every((n) => n >= 15 && n <= 20)).toBe(true);
  });

  it('leans toward recall at difficulty 1 and puzzles at difficulty 5', () => {
    const tierAvg = (n: 1 | 2 | 3 | 4 | 5) => {
      let sum = 0;
      let count = 0;
      for (let seed = 1; seed <= 30; seed++) for (const id of start(seed, d(n)).cardIds) {
        sum += getCard(id)!.tier;
        count += 1;
      }
      return sum / count;
    };
    expect(tierAvg(1)).toBeLessThan(tierAvg(3));
    expect(tierAvg(3)).toBeLessThan(tierAvg(5));
    expect(tierAvg(1)).toBeLessThan(1.6);
    expect(tierAvg(5)).toBeGreaterThan(2.2);
  });

  it('favours cards the player missed before and skips mastered ones', () => {
    const pool = cardsOf(['kubernetes']).slice(0, 40);
    const weak: CardHistory[] = pool.slice(0, 5).map((c) => ({ id: c.id, seen: 2, wrongs: 2, lastRight: false }));
    const mastered: CardHistory[] = pool.slice(5, 10).map((c) => ({ id: c.id, seen: 3, wrongs: 0, lastRight: true }));
    let weakPicked = 0;
    let masteredPicked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const ids = pickCards(mulberry32(fnv1a(`t:${seed}`)), pool, 10, 2, [...weak, ...mastered], 0);
      weakPicked += ids.filter((id) => weak.some((w) => w.id === id)).length;
      masteredPicked += ids.filter((id) => mastered.some((m) => m.id === id)).length;
    }
    expect(weakPicked).toBeGreaterThan(masteredPicked * 2);
    expect(isWeak({ id: 'x', seen: 1, wrongs: 1, lastRight: false })).toBe(true);
    expect(isWeak({ id: 'x', seen: 3, wrongs: 2, lastRight: true })).toBe(true);
    expect(isWeak({ id: 'x', seen: 1, wrongs: 0, lastRight: true })).toBe(false);
    expect(isWeak(undefined)).toBe(false);
  });

  it('luck swaps the hardest picks for easier cards', () => {
    const pool = cardsOf(['ebpf']);
    const rng = () => mulberry32(fnv1a('luck'));
    const plain = pickCards(rng(), pool, 16, 5, [], 0).map((id) => getCard(id)!.tier);
    const lucky = pickCards(rng(), pool, 16, 5, [], 25).map((id) => getCard(id)!.tier);
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    expect(sum(lucky)).toBeLessThan(sum(plain));
    expect(lucky.filter((t) => t === 1).length).toBeGreaterThanOrEqual(4);
  });

  it('never draws more cards than the selected decks hold', () => {
    const few = cardsOf(['kubernetes']).slice(0, 6);
    expect(pickCards(mulberry32(1), few, 15, 2, [], 0)).toHaveLength(6);
  });
});

describe('modes', () => {
  const { steps: _steps, ...base } = DECKS.kubernetes.cards[0]!;
  const short: Card = { ...base, id: 'x-1', answer: 'Pod' };
  const long: Card = { ...short, answer: 'A very long answer that nobody should have to type in full' };
  const stepped: Card = { ...short, steps: ['a', 'b', 'c'] };

  it('is multiple choice at difficulty 1 and 2, typed or ordered from 3', () => {
    expect(modeFor(short, 1)).toBe('choice');
    expect(modeFor(stepped, 2)).toBe('choice');
    expect(modeFor(short, 3)).toBe('typed');
    expect(modeFor(long, 3)).toBe('choice');
    expect(modeFor(long, 5)).toBe('choice');
    expect(modeFor(stepped, 3)).toBe('ordered');
    expect(modeFor({ ...short, answer: 'x'.repeat(30) }, 3)).toBe('choice');
    expect(modeFor({ ...short, answer: 'x'.repeat(30) }, 4)).toBe('typed');
  });

  it('shuffles four options with the answer at index 0 of the texts, and never shows steps already in order', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = start(seed, d(1));
      expect([...s.options].sort()).toEqual([0, 1, 2, 3]);
      const card = currentCard(s)!;
      expect(optionTexts(card)[0]).toBe(card.answer);
    }
    let ordered = 0;
    for (let seed = 1; seed <= 300 && ordered < 10; seed++) {
      let s = start(seed, d(4));
      for (let i = 0; i < 40 && s.currentId; i++) {
        if (s.mode === 'ordered') {
          ordered += 1;
          expect(s.order.some((v, i) => v !== i)).toBe(true);
          expect([...s.order].sort()).toEqual(currentCard(s)!.steps!.map((_, i) => i));
        }
        s = answer(s, 'right');
      }
    }
    expect(ordered).toBeGreaterThan(0);
  });
});

describe('grading', () => {
  const card = { answer: 'ReplicaSet', accept: ['replica set'] };

  it.each([
    ['ReplicaSet', 'right'],
    ['replicaset', 'right'],
    ['replica set', 'right'],
    ['Replica-Set', 'right'],
    ['replicasets', 'almost'],
    ['replicaset ', 'right'],
    ['ReplicaSte', 'almost'],
    ['', 'wrong'],
    ['Deployment', 'wrong'],
  ])('types %s: %s', (text, verdict) => {
    expect(gradeTech(text, card).verdict).toBe(verdict);
  });

  it('allows two edits only on long answers', () => {
    expect(gradeTech('kubectl rolout undo', { answer: 'kubectl rollout undo' }).verdict).toBe('almost');
    expect(gradeTech('kubectl rolut undo', { answer: 'kubectl rollout undo' }).verdict).toBe('almost');
    expect(gradeTech('kubectl rolt undo', { answer: 'kubectl rollout undo' }).verdict).toBe('wrong');
    expect(gradeTech('pdd', { answer: 'pod' }).verdict).toBe('wrong');
    expect(compact('Replica Set_x')).toBe('replicasetx');
  });

  it('grades an order: right, one swap is almost, else wrong, invalid is ignored', () => {
    expect(gradeOrder([0, 1, 2], 3)?.verdict).toBe('right');
    expect(gradeOrder([1, 0, 2], 3)?.verdict).toBe('almost');
    expect(gradeOrder([1, 2, 0], 3)?.verdict).toBe('wrong');
    expect(gradeOrder([0, 1], 3)).toBeNull();
    expect(gradeOrder([0, 0, 1], 3)).toBeNull();
    expect(gradeOrder([0, 1, 5], 3)).toBeNull();
  });

  it('ignores actions of the wrong mode, out-of-range options and answers while explaining', () => {
    const s = start(1, d(1));
    expect(engine.reduce(s, { type: 'type', text: 'x' })).toBe(s);
    expect(engine.reduce(s, { type: 'order', order: [0, 1] })).toBe(s);
    expect(engine.reduce(s, { type: 'choose', index: 9 })).toBe(s);
    expect(engine.reduce(s, { type: 'next' })).toBe(s);
    const explaining = engine.reduce(s, { type: 'choose', index: 0 });
    expect(explaining.explaining).toBe(true);
    expect(engine.reduce(explaining, { type: 'choose', index: 0 })).toBe(explaining);
    expect(engine.reduce(explaining, { type: 'next' }).explaining).toBe(false);
  });
});

describe('scheduling', () => {
  it('brings a missed card back after 2 cards, then 5, and a right one after 8 (6 with Study)', () => {
    const miss = play(['wrong', 'right', 'right'], 1, runs.plain, parties.starter);
    expect(miss.state.currentId).toBe(miss.order[0]);
    const twice = play(['wrong', 'right', 'right', 'wrong', 'right', 'right', 'right', 'right', 'right'], 1, runs.plain, parties.starter);
    expect(twice.state.currentId).toBe(twice.order[0]);
    const hit = play(Array<'right'>(8).fill('right'), 1, runs.plain, parties.starter);
    expect(hit.state.currentId).toBe(hit.order[0]);
    const study = play(Array<'right'>(6).fill('right'), 1, runs.plain, parties.full);
    expect(study.state.currentId).toBe(study.order[0]);
    expect(rightGap(start(1, runs.plain, parties.full))).toBe(6);
    expect(rightGap(start(1, runs.plain, parties.starter))).toBe(8);
  });

  it('ends after every card settled, and ignores actions afterwards', () => {
    const s = playAll('right');
    expect(s.currentId).toBeNull();
    expect(s.queue).toEqual([]);
    expect(engine.outcome(s)).not.toBeNull();
    expect(engine.reduce(s, { type: 'choose', index: 0 })).toBe(s);
    expect(s.marks).toHaveLength(s.cardIds.length * 2);
  });

  it('bounds a card to four shows even when always wrong', () => {
    const s = playAll('wrong');
    expect(engine.outcome(s)?.result).toBe('lost');
    expect(s.progress.every((p) => p.shows <= 4)).toBe(true);
    expect(s.marks.length).toBe(s.cardIds.length * 4);
  });
});

describe('score and outcome', () => {
  it('scores a perfect run 1000 and wins at 70 percent accuracy', () => {
    const s = playAll('right');
    expect(accuracyOf(s)).toBe(1);
    expect(recallOf(s)).toBe(1);
    expect(scoreOf(s)).toBe(1000);
    expect(engine.outcome(s)?.result).toBe('won');
    expect(WIN_ACCURACY).toBe(0.7);
  });

  it('counts a recovered card at 0.6 and its recall at full', () => {
    const { state } = play(['wrong', 'right', 'right', 'right']);
    const first = state.marks[0]!.id;
    expect(state.marks.find((m, i) => i > 0 && m.id === first)?.credit).toBe(1);
    const done = (() => {
      let s = state;
      for (let i = 0; i < 200 && s.currentId; i++) s = answer(s, 'right');
      return s;
    })();
    const n = done.cardIds.length;
    expect(accuracyOf(done)).toBeCloseTo((n - 1 + 0.6) / n, 5);
    expect(weakSet(done)).toEqual([first]);
    expect(recallOf(done)).toBe(1);
    expect(scoreOf(done)).toBe(Math.round(700 * ((n - 1 + 0.6) / n) + 300));
  });

  it('recall drops when a weak card is still wrong at the end', () => {
    const s = playAll('wrong');
    expect(recallOf(s)).toBe(0);
    expect(scoreOf(s)).toBe(0);
    expect(weakSet(s)).toHaveLength(s.cardIds.length);
  });

  it('a revive forgives the first miss for the score, not the schedule', () => {
    const run: RunContext = { buffs: [{ id: 'r', kind: 'revive', amount: 1 }], roomIndex: 0, difficulty: 2 };
    const { state, order } = play(['wrong', 'right'], 1, run, parties.starter);
    expect(state.forgiven).toEqual([order[0]]);
    expect(state.revivesLeft).toBe(0);
    expect(state.streak).toBe(1);
    expect(state.queue.indexOf(order[0]!)).toBe(0);
    let s = state;
    for (let i = 0; i < 200 && s.currentId; i++) s = answer(s, 'right');
    expect(accuracyOf(s)).toBe(1);
  });

  it('names the two most-missed cards in learned and lists the decks as the topic', () => {
    const { state } = play(['wrong', 'wrong', 'right', 'right', 'wrong', 'right']);
    let s = state;
    for (let i = 0; i < 200 && s.currentId; i++) s = answer(s, 'right');
    const hard = hardestTwo(s);
    expect(hard).toHaveLength(2);
    expect(hard[0]!.id).toBe(state.marks[0]!.id);
    const o = engine.outcome(s)!;
    expect(o.learned?.topic.en).toBe('Kubernetes + eBPF');
    expect(o.learned?.note.en).toContain(hard[0]!.answer.slice(0, 20));
    expect(o.learned?.note.en.length).toBeLessThanOrEqual(400);
    expect(o.learned?.note.fr).toMatch(/^À relire/);
    expect(o.stats?.recall).toBeDefined();
  });

  it('writes the log in the player\'s language and forfeits as fled with a partial score', () => {
    const fr = engine.initial(3, parties.full, d(1), 'fr');
    const left = engine.reduce(engine.reduce(fr, { type: 'choose', index: fr.options.indexOf(0) }), { type: 'forfeit' });
    const o = engine.outcome(left)!;
    expect(o.result).toBe('fled');
    expect(o.log.at(-1)).toMatch(/fermé la salle/);
    expect(o.log[0]).toMatch(/\(acquis\)/);
    expect(o.score).toBeGreaterThan(0);
    const en = engine.outcome(engine.reduce(start(3, d(1)), { type: 'forfeit' }))!;
    expect(en.log.at(-1)).toMatch(/closed the room after 0 answers/);
  });
});

describe('setup, hints, party and buffs', () => {
  it('setup picks the selected decks with the history, only before the first answer', () => {
    const s = start(1);
    const k8s = engine.reduce(s, { type: 'setup', decks: ['kubernetes'], history: [] });
    expect(k8s.decks).toEqual(['kubernetes']);
    expect(k8s.cardIds.every((id) => id.startsWith('kubernetes-'))).toBe(true);
    expect(k8s.marks).toEqual([]);
    const weakId = k8s.cardIds[0]!;
    const withHistory = engine.reduce(s, { type: 'setup', decks: ['kubernetes'], history: [{ id: weakId, seen: 2, wrongs: 2, lastRight: false }] });
    expect(withHistory.weakIds).toEqual([weakId]);
    expect(engine.reduce(s, { type: 'setup', decks: [], history: [] })).toBe(s);
    expect(engine.reduce(s, { type: 'setup', decks: ['nope' as 'ebpf'], history: [] })).toBe(s);
    const answered = engine.reduce(s, { type: 'choose', index: 0 });
    expect(engine.reduce(answered, { type: 'setup', decks: ['ebpf'], history: [] })).toBe(answered);
    expect(engine.reduce(s, { type: 'setup', decks: ['ebpf', 'kubernetes', 'ebpf'], history: [] }).decks).toEqual(['kubernetes', 'ebpf']);
  });

  it('a hint removes one wrong option, or reveals, once per card', () => {
    const run: RunContext = { buffs: [{ id: 'h', kind: 'hint', amount: 2 }], roomIndex: 0, difficulty: 1 };
    const s = start(1, run, parties.starter);
    expect(s.hintsLeft).toBe(2);
    const h = engine.reduce(s, { type: 'hint' });
    expect(h.options).toHaveLength(3);
    expect(h.options).toContain(0);
    expect(h.revealed).toBe(true);
    expect(engine.reduce(h, { type: 'hint' })).toBe(h);
    const typed = engine.reduce(engine.initial(1, parties.starter, { ...run, difficulty: 4 }, 'en'), { type: 'hint' });
    expect(typed.revealed).toBe(true);
    expect(engine.reduce(start(1, d(1), parties.starter), { type: 'hint' }).revealed).toBe(false);
  });

  it('the party gives hints from power and Social, and Study shortens the final check', () => {
    expect(start(1, runs.plain, parties.full).hintsLeft).toBe(2);
    expect(start(1, runs.plain, parties.starter).hintsLeft).toBe(0);
    expect(start(1, runs.plain, parties.single).hasStudy).toBe(true);
    expect(start(1, runs.plain, parties.mixed).hasSocial).toBe(true);
  });

  it('ignores attack, defense and time', () => {
    const base = playToEnd(game, 4, parties.full, runs.plain);
    for (const kind of ['attack', 'defense', 'time'] as const) {
      const r = playToEnd(game, 4, parties.full, { buffs: [{ id: kind, kind, amount: 30 }], roomIndex: 0, difficulty: 2 });
      expect(r.outcome).toEqual(base.outcome);
    }
  });

  it('plays identically for the same seed, differently for another seed', () => {
    const a = playToEnd(game, 11, parties.full, runs.plain);
    const b = playToEnd(game, 11, parties.full, runs.plain);
    const c = playToEnd(game, 12, parties.full, runs.plain);
    expect(a.actions).toEqual(b.actions);
    expect(a.state.cardIds).not.toEqual(c.state.cardIds);
  });
});

describe('bot balance', () => {
  it('wins between 40 and 70 percent on the plain run with the full party, less with the starter party', () => {
    const full = winRate(2);
    expect(full).toBeGreaterThanOrEqual(0.4);
    expect(full).toBeLessThanOrEqual(0.7);
    expect(winRate(2, parties.starter)).toBeLessThanOrEqual(full + 0.05);
  });

  it('wins almost always at difficulty 1 and rarely at 5', () => {
    expect(winRate(1)).toBeGreaterThanOrEqual(0.85);
    expect(winRate(5)).toBeLessThan(winRate(1));
  });

  it('answers typed and ordered cards at difficulty 4 and finishes within the step budget', () => {
    const r = playToEnd(game, 2, parties.full, emptyRun(4));
    expect(r.outcome).not.toBeNull();
    expect(r.steps).toBeLessThan(400);
    const modes = new Set(r.state.marks.map((m) => m.mode));
    expect(modes.has('typed')).toBe(true);
  });
});
