/**
 * Tiny fake games for the kit's own tests (checks.test.ts): one good game and
 * one broken variant per failure mode. Not a template; copy src/games/sample.
 */
import { fnv1a, mulberry32, rngInt } from '../../game/rng';
import { buffAmount, clampScore, defineGame, turnRng, type GameEngine, type GameModule, type Outcome } from '../contract';

export interface RaceState {
  seed: number;
  turn: number;
  total: number;
  target: number;
  /** Sum of the party's power. */
  power: number;
  /** Added to every step (attack buff). */
  bonus: number;
  difficulty: number;
  locale: 'en' | 'fr';
  memberIds: string[];
  history: number[];
  quit: boolean;
}

export type RaceAction = { type: 'add'; n: number } | { type: 'quit' };

export const MAX_TURNS = 12;

const isOver = (s: RaceState) => s.quit || s.total >= s.target || s.turn >= MAX_TURNS;

/** "Race to N": add 1..5 plus a seeded roll each turn; reach the target within 12 turns. */
export const raceEngine: GameEngine<RaceState, RaceAction> = {
  initial(seed, party, run, locale) {
    const rng = mulberry32(fnv1a(`race:${seed}`));
    return {
      seed,
      turn: 0,
      total: 0,
      target: 20 + rngInt(rng, 20),
      power: party.members.reduce((sum, m) => sum + m.power, 0),
      bonus: Math.floor(buffAmount(run, 'attack') / 5),
      difficulty: run.difficulty,
      locale,
      memberIds: party.members.map((m) => m.id),
      history: [],
      quit: false,
    };
  },
  reduce(state, action) {
    if (isOver(state)) return state;
    if (action.type === 'quit') return { ...state, quit: true };
    const roll = rngInt(turnRng(state.seed, state.turn), 4);
    const step = Math.max(0, Math.min(5, action.n)) + roll + state.bonus;
    return { ...state, turn: state.turn + 1, total: state.total + step, history: [...state.history, step] };
  },
  outcome(state): Outcome | null {
    if (!isOver(state)) return null;
    const won = !state.quit && state.total >= state.target;
    const line = state.locale === 'fr' ? `${state.total} sur ${state.target} en ${state.turn} tours.` : `Reached ${state.total} of ${state.target} in ${state.turn} turns.`;
    return {
      result: state.quit ? 'fled' : won ? 'won' : 'lost',
      score: clampScore(won ? 1000 - state.turn * 50 : state.total * 10),
      log: [line],
      troopsUsed: state.memberIds,
    };
  },
  botPlay(state, rng) {
    if (isOver(state)) return null;
    // Stronger parties take bigger steps; the rng nudges ties.
    return { type: 'add', n: Math.min(5, 1 + Math.floor(state.power / 80) + (rng() < 0.2 ? 1 : 0)) };
  },
  forfeit: () => ({ type: 'quit' }),
};

const goodStrings = {
  en: { title: 'Race', turn: 'Turn {n}', lines: ['Go!', 'Faster!'] },
  fr: { title: 'Course', turn: 'Tour {n}', lines: ['Vas-y !', 'Plus vite !'] },
};

export const goodGame: GameModule<RaceState, RaceAction> = defineGame({
  manifest: {
    id: 'race',
    name: { en: 'Race', fr: 'Course' },
    tagline: { en: 'Reach the target first.', fr: 'Atteins la cible.' },
    category: 'arcade',
    minRing: 1,
    rosterSize: { min: 1, max: 8 },
    estMinutes: 1,
    supportsReducedMotion: true,
  },
  engine: raceEngine,
  strings: goodStrings,
});

/** A copy of the good game with some engine functions replaced. */
function variant(engine: Partial<GameEngine<RaceState, RaceAction>>, extra: Partial<GameModule<RaceState, RaceAction>> = {}): GameModule<RaceState, RaceAction> {
  return { ...goodGame, ...extra, engine: { ...raceEngine, ...engine } };
}

const add = (state: RaceState, action: RaceAction) => raceEngine.reduce(state, action);
let calls = 0;

export const fakes = {
  /** Reads hidden module state: two plays from the same seed differ. */
  nonDeterministic: variant({
    initial: (seed, party, run, locale) => ({ ...raceEngine.initial(seed, party, run, locale), target: 20 + (calls++ % 7) }),
  }),
  /** Pushes into the state's history array instead of copying it. */
  mutating: variant({
    reduce: (state, action) => {
      if (isOver(state) || action.type !== 'add') return add(state, action);
      state.history.push(action.n);
      return { ...state, turn: state.turn + 1, total: state.total + action.n + 1 };
    },
  }),
  /** Sorts the state's history in place, only on buffed runs (bonus > 0). */
  mutatesOnBuffedOnly: variant({
    reduce: (state, action) => {
      if (state.bonus > 0 && state.history.length > 1) state.history.sort((a, b) => a - b);
      return add(state, action);
    },
  }),
  /** Keeps a Map in its state. */
  classInState: variant({
    initial: (seed, party, run, locale) => ({ ...raceEngine.initial(seed, party, run, locale), cache: new Map<string, number>() }) as RaceState,
  }),
  /** A Map only on the hard run. */
  mapOnHardOnly: variant({
    initial: (seed, party, run, locale) => {
      const s = raceEngine.initial(seed, party, run, locale);
      return (run.difficulty === 5 ? { ...s, cache: new Map<string, number>() } : s) as RaceState;
    },
  }),
  /** A Map in the state at turns 3 to 5 only (between the old sampling points). */
  mapMidGame: variant({
    reduce: (state, action) => {
      const next = add(state, action) as RaceState & { cache?: unknown };
      const { cache: _drop, ...rest } = next;
      return (next.turn >= 3 && next.turn <= 5 ? { ...rest, cache: new Map() } : rest) as RaceState;
    },
  }),
  /** A sparse array in the state. */
  sparseArray: variant({
    initial: (seed, party, run, locale) => {
      const holes: number[] = [];
      holes[2] = 1;
      return { ...raceEngine.initial(seed, party, run, locale), history: holes };
    },
  }),
  /** Never ends in French. */
  frenchNeverEnds: variant({
    reduce: (state, action) => (state.locale === 'fr' ? state : add(state, action)),
  }),
  /** The bot asks for zero steps and the engine never ends the race. */
  nonTerminating: variant({
    reduce: (state) => state,
    botPlay: () => ({ type: 'add', n: 0 }),
  }),
  /** The bot gives up (null) while the game is still running. */
  botStuck: variant({ botPlay: () => null }),
  /** Already over before the first action. */
  overAtStart: variant({ outcome: () => ({ result: 'won', score: 1, log: ['Done.'], troopsUsed: [] }) }),
  /** Outcome with an out-of-range score, a stranger in troopsUsed and an empty log line. */
  badOutcome: variant({
    outcome: (state) => {
      const o = raceEngine.outcome(state);
      return o && { ...o, score: 1500.5, troopsUsed: ['ghost'], log: [''] };
    },
  }),
  /** A forfeit (which the bot never plays) scores 1500 with an empty log. */
  badForfeit: variant({
    outcome: (state) => {
      const o = raceEngine.outcome(state);
      return o && state.quit ? { ...o, score: 1500, log: [] } : o;
    },
  }),
  /** A forfeit that does not end the game. */
  forfeitDoesNothing: variant({ forfeit: () => ({ type: 'add', n: 0 }) }),
  /** troopsUsed hard-coded to the first vassal of the usual parties. */
  hardCodedTroops: variant({
    outcome: (state) => {
      const o = raceEngine.outcome(state);
      return o && { ...o, troopsUsed: ['move'] };
    },
  }),
  /** The seed is stored but changes nothing. */
  ignoresSeed: variant({
    initial: (seed, party, run, locale) => ({ ...raceEngine.initial(0, party, run, locale), seed }),
    reduce: (state, action) => (isOver(state) || action.type !== 'add' ? state : { ...state, turn: state.turn + 1, total: state.total + action.n + state.bonus }),
  }),
  /** Run buffs are read nowhere. */
  ignoresBuffs: variant({ initial: (seed, party, run, locale) => ({ ...raceEngine.initial(seed, party, run, locale), bonus: 0 }) }),
  /** Who is in the party changes nothing. */
  ignoresParty: variant({
    initial: (seed, party, run, locale) => ({ ...raceEngine.initial(seed, party, run, locale), power: 100, memberIds: party.members.slice(0, 1).map((m) => m.id) }),
  }),
  /** The bot always loses. */
  neverWins: variant({
    botPlay: (state) => (isOver(state) ? null : { type: 'add', n: 0 }),
    reduce: (state) => (isOver(state) ? state : { ...state, turn: state.turn + 1 }),
  }),
  /** An action after the end restarts the counter. */
  reopensAfterEnd: variant({
    reduce: (state, action) => (isOver(state) ? { ...state, total: 0, turn: 0 } : add(state, action)),
  }),
  /** Invalid manifest: id, estMinutes, empty French name, reduced motion, unknown field, roster. */
  badManifest: variant(
    {},
    {
      manifest: {
        ...goodGame.manifest,
        id: 'Bad_Id',
        name: { en: 'Race', fr: ' ' },
        estMinutes: 9,
        supportsReducedMotion: false,
        rosterSize: { min: 4, max: 2 },
        colour: 'red',
      } as unknown as GameModule['manifest'],
    },
  ),
  /** French tree missing a key, an empty string, a placeholder mismatch, a number leaf, a shorter array. */
  mismatchedStrings: variant(
    {},
    {
      strings: {
        en: { title: 'Race', turn: 'Turn {n}', extra: 'Only in English', count: 3, tips: ['One', 'Two', 'Three'] },
        fr: { title: '', turn: 'Tour {m}', count: 3, bonus: 'Seulement en français', tips: ['Un', 'Deux'] },
      },
    },
  ),
};
