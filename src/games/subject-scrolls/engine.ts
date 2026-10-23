/**
 * Scroll Room: a pure spaced-repetition engine over subject decks
 * (src/games/shared/decks). A run draws 15 to 20 cards from the selected
 * decks, weighted toward tiers the difficulty asks for and toward cards the
 * player missed before. Multiple choice at difficulty 1 and 2; from 3, a
 * card with steps is answered in order and a short answer is typed. After
 * every answer the engine waits in `explaining` until `next`, so the Screen
 * can show the explanation and the source. Score: accuracy and the recall
 * of weak cards. Win at 70 percent accuracy.
 */
import { fnv1a, mulberry32, rngInt, rngWeightedIndex, type Rng } from '../../game/rng';
import { buffAmount, clampScore, formatText, turnRng, type GameEngine, type Locale, type Outcome, type Party, type RunContext } from '../contract';
// eslint-disable-next-line no-restricted-imports -- src/games/shared holds cross-game helpers (CONTRACT.md section 2); eslint.config.js does not list it yet, see docs/review/notes/game-subject-scrolls.md
import { DECKS, SUBJECT_IDS, cardsOf, getCard, type Card, type SubjectId } from '../shared/decks';
// eslint-disable-next-line no-restricted-imports -- same reason as above
import { DEFAULT_GAPS, progressOf, schedule, type CardProgress } from '../shared/scheduler';
// eslint-disable-next-line no-restricted-imports -- same reason as above
import { levenshtein, normalizeAnswer, type Verdict } from '../shared/typedAnswer';
import { strings, type ScrollStrings } from './strings';

export type { Verdict };
export type Mode = 'choice' | 'typed' | 'ordered';

export interface Mark {
  id: string;
  verdict: Verdict;
  credit: number;
  mode: Mode;
}

/** What the player remembers of a card across runs (the Screen keeps it in localStorage for v1). */
export interface CardHistory {
  id: string;
  seen: number;
  wrongs: number;
  lastRight: boolean;
}

export interface ScrollState {
  seed: number;
  step: number;
  locale: Locale;
  difficulty: 1 | 2 | 3 | 4 | 5;
  decks: SubjectId[];
  hasStudy: boolean;
  hasSocial: boolean;
  hintsLeft: number;
  revivesLeft: number;
  luckShare: number;
  cardIds: string[];
  /** Cards that came in weak (missed last time, or missed more than once before). */
  weakIds: string[];
  queue: string[];
  currentId: string | null;
  mode: Mode;
  /** Choice: the options shown, as indices into [answer, ...distractors] (0 is right). */
  options: number[];
  /** Ordered: the steps shown, as a permutation of the card's step indices. */
  order: number[];
  revealed: boolean;
  explaining: boolean;
  progress: CardProgress[];
  marks: Mark[];
  /** Cards whose miss a revive forgave (not counted as missed for the score). */
  forgiven: string[];
  streak: number;
  maxStreak: number;
  forfeited: boolean;
  partyIds: string[];
}

export type ScrollAction =
  | { type: 'setup'; decks: SubjectId[]; history: CardHistory[] }
  | { type: 'choose'; index: number }
  | { type: 'type'; text: string }
  | { type: 'order'; order: number[] }
  | { type: 'hint' }
  | { type: 'next' }
  | { type: 'forfeit' };

export const CARDS_PER_RUN = [0, 15, 16, 17, 18, 20] as const;
/** Longest answer the player is asked to type, by difficulty (0: multiple choice only). */
export const TYPED_MAX = [0, 0, 0, 24, 32, 48] as const;
/** Draw weights per tier (x10), by difficulty. */
const TIER_WEIGHTS: Readonly<Record<number, readonly [number, number, number]>> = {
  1: [30, 10, 2],
  2: [20, 20, 5],
  3: [10, 20, 10],
  4: [10, 20, 20],
  5: [5, 10, 30],
};
export const STUDY_RIGHT_GAP = 6;
export const WIN_ACCURACY = 0.7;
export const RECOVERED_FACTOR = 0.6;
const STUDY_BOT_BONUS = 0.03;
const HINT_BOT_BONUS = 0.1;
const BOT_HIT = [0, 0.82, 0.64, 0.52, 0.48, 0.42] as const;

export function currentCard(state: ScrollState): Card | undefined {
  return state.currentId ? getCard(state.currentId) : undefined;
}

/** The four texts of a card in option order: 0 the answer, then the distractors. */
export function optionTexts(card: Card): string[] {
  return [card.answer, ...card.distractors];
}

export function isOver(state: ScrollState): boolean {
  if (state.forfeited) return true;
  return state.currentId === null && state.queue.length === 0 && state.marks.length > 0 && !state.explaining;
}

export function rightGap(state: Pick<ScrollState, 'hasStudy'>): number {
  return state.hasStudy ? STUDY_RIGHT_GAP : DEFAULT_GAPS.right;
}

/** The mode a card is played in at a difficulty. */
export function modeFor(card: Card, difficulty: number): Mode {
  const max = TYPED_MAX[difficulty] ?? 0;
  if (max === 0) return 'choice';
  if (card.steps && card.steps.length >= 2) return 'ordered';
  if (card.answer.length <= max) return 'typed';
  return 'choice';
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

/** Lower case, no accents, and no spaces, dashes or underscores: `Replica Set` equals `replicaset`. */
export function compact(text: string): string {
  return normalizeAnswer(text, true).replace(/[\s_-]+/g, '');
}

/**
 * Grade a typed technical answer: right when it matches the answer or an
 * accepted form (ignoring case, accents, spacing and dashes); almost (half
 * credit) when one edit away from the answer (two edits for long answers);
 * wrong otherwise, and when empty.
 */
export function gradeTech(text: string, card: Pick<Card, 'answer' | 'accept'>): { verdict: Verdict; credit: number } {
  const got = normalizeAnswer(text, true);
  if (got.length === 0) return { verdict: 'wrong', credit: 0 };
  const wants = [card.answer, ...(card.accept ?? [])];
  for (const w of wants) {
    if (got === normalizeAnswer(w, true) || compact(text) === compact(w)) return { verdict: 'right', credit: 1 };
  }
  for (const w of wants) {
    const want = normalizeAnswer(w, true);
    const d = levenshtein(got, want);
    if ((want.length >= 4 && d <= 1) || (want.length >= 12 && d <= 2)) return { verdict: 'almost', credit: 0.5 };
  }
  return { verdict: 'wrong', credit: 0 };
}

/** Grade an ordered answer: right in order, almost when exactly two steps are swapped, wrong otherwise. */
export function gradeOrder(order: readonly number[], steps: number): { verdict: Verdict; credit: number } | null {
  if (order.length !== steps) return null;
  const seen = new Set<number>();
  for (const i of order) {
    if (!Number.isInteger(i) || i < 0 || i >= steps || seen.has(i)) return null;
    seen.add(i);
  }
  let off = 0;
  for (let i = 0; i < steps; i++) if (order[i] !== i) off += 1;
  if (off === 0) return { verdict: 'right', credit: 1 };
  if (off === 2) return { verdict: 'almost', credit: 0.5 };
  return { verdict: 'wrong', credit: 0 };
}

function historyWeight(h: CardHistory | undefined): number {
  if (!h || h.seen === 0) return 15;
  if (!h.lastRight) return 30;
  if (h.wrongs > 0) return 12;
  if (h.seen >= 2) return 4;
  return 10;
}

export function isWeak(h: CardHistory | undefined): boolean {
  return Boolean(h && h.seen > 0 && (!h.lastRight || h.wrongs >= 2));
}

/** Draw `n` cards: tier weights by difficulty, times a weight from the player's history; `luckShare` percent of the hardest picks swapped for easy ones. */
export function pickCards(rng: Rng, pool: readonly Card[], n: number, difficulty: number, history: readonly CardHistory[], luckShare: number): string[] {
  const byId = new Map(history.map((h) => [h.id, h]));
  const tiers = TIER_WEIGHTS[difficulty] ?? TIER_WEIGHTS[2]!;
  const remaining = [...pool];
  const chosen: Card[] = [];
  while (chosen.length < n && remaining.length > 0) {
    const weights = remaining.map((c) => Math.max(1, (tiers[c.tier - 1] ?? 10) * historyWeight(byId.get(c.id))));
    const i = rngWeightedIndex(rng, weights);
    chosen.push(remaining[i]!);
    remaining.splice(i, 1);
  }
  const swaps = Math.min(Math.round((n * luckShare) / 100), chosen.length, remaining.length);
  if (swaps > 0) {
    const hard = [...chosen].sort((a, b) => b.tier - a.tier || (a.id < b.id ? -1 : 1));
    const easy = [...remaining].sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1));
    for (let k = 0; k < swaps; k++) {
      const h = hard[k];
      const e = easy[k];
      if (!h || !e || e.tier >= h.tier) break;
      const idx = chosen.findIndex((c) => c.id === h.id);
      if (idx >= 0) chosen[idx] = e;
    }
  }
  return chosen.map((c) => c.id);
}

function deal(state: ScrollState, rng: Rng): ScrollState {
  const currentId = state.queue[0];
  if (!currentId) return { ...state, currentId: null, mode: 'choice', options: [], order: [], revealed: false, explaining: false };
  const card = getCard(currentId);
  const queue = state.queue.slice(1);
  const mode = card ? modeFor(card, state.difficulty) : 'choice';
  const options = mode === 'choice' ? shuffle(rng, [0, 1, 2, 3]) : [];
  let order: number[] = [];
  if (mode === 'ordered' && card?.steps) {
    const ids = card.steps.map((_, i) => i);
    order = shuffle(rng, ids);
    // Never show the steps already in the right order (the puzzle would answer itself).
    if (order.every((v, i) => v === i)) order = [...order.slice(1), order[0]!];
  }
  return { ...state, queue, currentId, mode, options, order, revealed: false, explaining: false };
}

function draw(state: ScrollState, decks: SubjectId[], history: CardHistory[]): ScrollState {
  const rng = mulberry32(fnv1a(`subject-scrolls:${state.seed}:${decks.join('+')}`));
  const pool = cardsOf(decks);
  const n = Math.min(CARDS_PER_RUN[state.difficulty] ?? 15, pool.length);
  const cardIds = pickCards(rng, pool, n, state.difficulty, history, state.luckShare);
  const byId = new Map(history.map((h) => [h.id, h]));
  const weakIds = cardIds.filter((id) => isWeak(byId.get(id)));
  const next: ScrollState = { ...state, decks, cardIds, weakIds, queue: cardIds, progress: [], marks: [], forgiven: [], streak: 0, maxStreak: 0 };
  return deal(next, turnRng(next.seed, 0));
}

function applyAnswer(state: ScrollState, verdict: Verdict, credit: number): ScrollState {
  const id = state.currentId;
  if (!id) return state;
  let streak = state.streak;
  let revivesLeft = state.revivesLeft;
  let forgiven = state.forgiven;
  if (verdict === 'wrong') {
    if (revivesLeft > 0) {
      revivesLeft -= 1;
      if (!forgiven.includes(id)) forgiven = [...forgiven, id];
    } else {
      streak = 0;
    }
  } else {
    streak += 1;
  }
  const booked = schedule(state.queue, state.progress, id, credit, { ...DEFAULT_GAPS, right: rightGap(state) });
  return {
    ...state,
    queue: booked.queue,
    progress: booked.progress,
    marks: [...state.marks, { id, verdict, credit, mode: state.mode }],
    forgiven,
    streak,
    maxStreak: Math.max(state.maxStreak, streak),
    revivesLeft,
    explaining: true,
    step: state.step + 1,
  };
}

/** Sum of the final credit of every card; a card missed (and not forgiven) is worth 0.6 of it. */
export function creditSum(state: ScrollState): number {
  const last = new Map<string, number>();
  for (const m of state.marks) last.set(m.id, m.credit);
  let sum = 0;
  for (const id of state.cardIds) {
    const missed = progressOf(state.progress, id).wrongs > 0 && !state.forgiven.includes(id);
    sum += (last.get(id) ?? 0) * (missed ? RECOVERED_FACTOR : 1);
  }
  return sum;
}

export function accuracyOf(state: ScrollState): number {
  return state.cardIds.length === 0 ? 0 : creditSum(state) / state.cardIds.length;
}

/** Cards that were weak coming in or were missed in this run. */
export function weakSet(state: ScrollState): string[] {
  const out = new Set<string>(state.weakIds);
  for (const p of state.progress) if (p.wrongs > 0) out.add(p.id);
  return state.cardIds.filter((id) => out.has(id));
}

/** Share of the weak cards whose last answer was right (1 when there is no weak card). */
export function recallOf(state: ScrollState): number {
  const weak = weakSet(state);
  if (weak.length === 0) return 1;
  const last = new Map<string, number>();
  for (const m of state.marks) last.set(m.id, m.credit);
  let right = 0;
  for (const id of weak) if ((last.get(id) ?? 0) >= 1) right += 1;
  return right / weak.length;
}

export function scoreOf(state: ScrollState): number {
  return clampScore(700 * accuracyOf(state) + 300 * recallOf(state));
}

/** The two cards missed most (then lowest credit, then id). */
export function hardestTwo(state: ScrollState): Card[] {
  const credit = new Map<string, number>();
  for (const m of state.marks) credit.set(m.id, m.credit);
  const ids = [...state.cardIds].sort((a, b) => {
    const dw = progressOf(state.progress, b).wrongs - progressOf(state.progress, a).wrongs;
    if (dw !== 0) return dw;
    const dc = (credit.get(a) ?? 1) - (credit.get(b) ?? 1);
    if (dc !== 0) return dc;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out: Card[] = [];
  for (const id of ids) {
    const c = getCard(id);
    if (c) out.push(c);
    if (out.length >= 2) break;
  }
  return out;
}

function topicName(card: Card, locale: Locale): string {
  const t = DECKS[card.subject]?.topics.find((x) => x.id === card.topic);
  return t ? t.name[locale] : card.topic;
}

function shorten(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function outcomeLog(state: ScrollState, s: ScrollStrings): string[] {
  const lines: string[] = [];
  for (const m of state.marks.slice(-8)) {
    const c = getCard(m.id);
    if (!c) continue;
    const result = m.verdict === 'right' ? s.log.right : m.verdict === 'almost' ? s.log.almost : s.log.wrong;
    lines.push(formatText(s.log.card, { topic: topicName(c, state.locale), prompt: shorten(c.prompt, 60), result }));
  }
  const acc = Math.round(accuracyOf(state) * 100);
  const recall = Math.round(recallOf(state) * 100);
  const end = state.forfeited ? s.log.endFled : accuracyOf(state) >= WIN_ACCURACY ? s.log.endWon : s.log.endLost;
  lines.push(formatText(end, { n: state.marks.length, acc, recall, streak: state.maxStreak }));
  return lines;
}

function deckNames(decks: readonly SubjectId[], locale: Locale): string {
  return decks.map((d) => DECKS[d]?.name[locale] ?? d).join(' + ');
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): ScrollState {
  const habits = new Set(party.members.map((m) => m.habit));
  const avgPower = party.members.length === 0 ? 0 : Math.round(party.members.reduce((n, m) => n + m.power, 0) / party.members.length);
  const hasSocial = habits.has('social');
  const base: ScrollState = {
    seed: seed >>> 0,
    step: 0,
    locale,
    difficulty: run.difficulty,
    decks: [...SUBJECT_IDS],
    hasStudy: habits.has('study'),
    hasSocial,
    hintsLeft: buffAmount(run, 'hint') + Math.floor(avgPower / 25) + (hasSocial ? 1 : 0),
    revivesLeft: buffAmount(run, 'revive'),
    luckShare: Math.max(0, buffAmount(run, 'luck')),
    cardIds: [],
    weakIds: [],
    queue: [],
    currentId: null,
    mode: 'choice',
    options: [],
    order: [],
    revealed: false,
    explaining: false,
    progress: [],
    marks: [],
    forgiven: [],
    streak: 0,
    maxStreak: 0,
    forfeited: false,
    partyIds: party.members.map((m) => m.id),
  };
  return draw(base, [...SUBJECT_IDS], []);
}

function validDecks(decks: readonly SubjectId[]): SubjectId[] {
  const out: SubjectId[] = [];
  for (const d of SUBJECT_IDS) if (decks.includes(d) && !out.includes(d)) out.push(d);
  return out;
}

function reduce(state: ScrollState, action: ScrollAction): ScrollState {
  if (isOver(state)) return state;
  switch (action.type) {
    case 'forfeit':
      return { ...state, forfeited: true };
    case 'setup': {
      if (state.marks.length > 0) return state;
      const decks = validDecks(action.decks ?? []);
      if (decks.length === 0) return state;
      const history = (action.history ?? []).filter((h) => typeof h.id === 'string' && Number.isFinite(h.seen) && Number.isFinite(h.wrongs));
      return draw({ ...state, step: state.step + 1 }, decks, history);
    }
    case 'next': {
      if (!state.explaining) return state;
      return deal(state, turnRng(state.seed, state.marks.length));
    }
    case 'hint': {
      if (state.hintsLeft <= 0 || state.revealed || !state.currentId || state.explaining) return state;
      let options = state.options;
      if (state.mode === 'choice' && options.length > 2) {
        const rng = turnRng(state.seed, 5000 + state.marks.length);
        const wrong = options.map((o, i) => (o === 0 ? -1 : i)).filter((i) => i >= 0);
        const drop = wrong[rngInt(rng, wrong.length)] ?? -1;
        options = options.filter((_, i) => i !== drop);
      }
      return { ...state, hintsLeft: state.hintsLeft - 1, revealed: true, options, step: state.step + 1 };
    }
    case 'choose': {
      if (state.mode !== 'choice' || !state.currentId || state.explaining) return state;
      const picked = state.options[action.index];
      if (picked === undefined) return state;
      return picked === 0 ? applyAnswer(state, 'right', 1) : applyAnswer(state, 'wrong', 0);
    }
    case 'type': {
      const card = currentCard(state);
      if (state.mode !== 'typed' || !card || state.explaining || typeof action.text !== 'string') return state;
      const { verdict, credit } = gradeTech(action.text, card);
      return applyAnswer(state, verdict, credit);
    }
    case 'order': {
      const card = currentCard(state);
      if (state.mode !== 'ordered' || !card?.steps || state.explaining || !Array.isArray(action.order)) return state;
      const graded = gradeOrder(action.order, card.steps.length);
      if (!graded) return state;
      return applyAnswer(state, graded.verdict, graded.credit);
    }
    default:
      return state;
  }
}

function outcome(state: ScrollState): Outcome | null {
  if (!isOver(state)) return null;
  const acc = accuracyOf(state);
  const result = state.forfeited ? 'fled' : acc >= WIN_ACCURACY ? 'won' : 'lost';
  const s = strings[state.locale];
  const hard = hardestTwo(state);
  const note = (locale: Locale) => {
    const t = strings[locale];
    const list = hard.map((c) => formatText(t.learned.item, { prompt: shorten(c.prompt, 90), answer: shorten(c.answer, 60) })).join(' ');
    return formatText(t.learned.note, { list }).slice(0, 400);
  };
  return {
    result,
    score: scoreOf(state),
    log: outcomeLog(state, s),
    troopsUsed: state.partyIds,
    learned: {
      topic: { en: deckNames(state.decks, 'en'), fr: deckNames(state.decks, 'fr') },
      note: { en: note('en'), fr: note('fr') },
    },
    stats: {
      cards: state.cardIds.length,
      answers: state.marks.length,
      accuracy: Math.round(acc * 100),
      recall: Math.round(recallOf(state) * 100),
      streak: state.maxStreak,
      decks: state.decks.join(', '),
    },
  };
}

function mutate(expected: string, rng: Rng): string {
  if (expected.length <= 2) return `${expected}zz`;
  const cut = Math.max(1, expected.length - 2 - rngInt(rng, Math.min(3, expected.length - 2)));
  return `${expected.slice(0, cut)}q`;
}

function botPlay(state: ScrollState, given: () => number): ScrollAction | null {
  if (isOver(state)) return null;
  if (state.explaining) return { type: 'next' };
  const card = currentCard(state);
  if (!card) return { type: 'next' };
  // The kit's bot stream does not depend on the seed: mix in a per-card stream from the game seed, so
  // different games miss different cards and a replay misses the same ones.
  const own = turnRng(state.seed, 7000 + state.marks.length);
  const rng = () => (given() + own()) % 1;
  if (state.hintsLeft > 0 && !state.revealed && rng() < 0.6) return { type: 'hint' };
  const hit = (BOT_HIT[state.difficulty] ?? 0.6) + (state.hasStudy ? STUDY_BOT_BONUS : 0) + (state.revealed ? HINT_BOT_BONUS : 0);
  const success = rng() < hit;
  if (state.mode === 'choice') {
    if (state.options.length === 0) return { type: 'choose', index: 0 };
    const right = state.options.indexOf(0);
    if (success) return { type: 'choose', index: right < 0 ? 0 : right };
    const others = state.options.map((_, i) => i).filter((i) => i !== right);
    return { type: 'choose', index: others[rngInt(rng, others.length)] ?? 0 };
  }
  if (state.mode === 'ordered' && card.steps) {
    const ids = card.steps.map((_, i) => i);
    if (success) return { type: 'order', order: ids };
    const a = rngInt(rng, ids.length);
    const b = (a + 1 + rngInt(rng, ids.length - 1)) % ids.length;
    const swapped = [...ids];
    swapped[a] = ids[b]!;
    swapped[b] = ids[a]!;
    // One swap is "almost"; a rotation is wrong.
    return { type: 'order', order: rng() < 0.4 ? swapped : [...ids.slice(1), ids[0]!] };
  }
  if (success) return { type: 'type', text: card.answer };
  if (rng() < 0.3 && card.answer.length >= 4) return { type: 'type', text: `${card.answer.slice(0, -1)}x` };
  return { type: 'type', text: mutate(card.answer, rng) };
}

function forfeit(): ScrollAction {
  return { type: 'forfeit' };
}

export const engine: GameEngine<ScrollState, ScrollAction> = { initial, reduce, outcome, botPlay, forfeit };
