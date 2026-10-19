/**
 * Coin Duel: the reference engine every game copies.
 *
 * Rules. The Rival fields three duelists of known power, one per round. Each
 * round you send one ally; the coin is weighted by the gap in power:
 * `chance = 50 + yourPower - rivalPower + edge`, clamped to 10..90 percent.
 * An ally sent again is tired (-10 power per earlier round). First to two
 * flips wins. A revive buff re-flips one lost round; attack and luck buffs
 * add to the edge. You may forfeit at any time (result `fled`).
 *
 * The engine rules every game follows:
 * - Pure: no React, no DOM, no clock, no Math.random, no storage. ESLint
 *   enforces it for `engine.ts`, `manifest.ts` and `strings.ts`.
 * - The state is plain JSON data. It keeps the seed and a step counter, and
 *   `turnRng(seed, step)` gives a fresh generator inside each `reduce`.
 * - Never mutate: return new objects (spread), share the untouched parts.
 * - Invalid actions, and any action after the end, return the state as is.
 */
import { fnv1a, mulberry32, rngInt, rngPick } from '../../game/rng';
import { buffAmount, clampScore, formatText, turnRng, type GameEngine, type Outcome, type Party, type RunContext } from '../contract';
import { strings, type CoinDuelStrings } from './strings';

export const ROUNDS = 3;
export const WINS_NEEDED = 2;
/** Power lost per earlier round an ally already played. */
export const FATIGUE = 10;
export const MIN_CHANCE = 10;
export const MAX_CHANCE = 90;

export interface Duelist {
  id: string;
  name: string;
  power: number;
  /** Rounds already played. */
  uses: number;
}

export interface Flip {
  round: number;
  memberId: string;
  name: string;
  /** Power after fatigue. */
  power: number;
  rival: number;
  /** Percent, 10 to 90. */
  chance: number;
  /** 0 to 99; the flip is won when `roll < chance`. */
  roll: number;
  won: boolean;
  /** A revive buff re-flipped this round. */
  revived: boolean;
}

export interface CoinDuelState {
  seed: number;
  duelists: Duelist[];
  /** The Rival's power for each round, known from the start. */
  rivals: number[];
  flips: Flip[];
  /** Percentage points added to every chance (attack plus luck buffs). */
  edge: number;
  revivesLeft: number;
  forfeited: boolean;
}

export type CoinDuelAction = { type: 'send'; memberId: string } | { type: 'forfeit' };

// ---------------------------------------------------------------------------
// Selectors, shared with the Screen so the rules live in one place
// ---------------------------------------------------------------------------

export function effectivePower(d: Duelist): number {
  return Math.max(1, d.power - FATIGUE * d.uses);
}

export function tally(state: CoinDuelState): { wins: number; losses: number } {
  const wins = state.flips.filter((f) => f.won).length;
  return { wins, losses: state.flips.length - wins };
}

/** The Rival's power this round, or `null` once every round was played. */
export function currentRival(state: CoinDuelState): number | null {
  return state.rivals[state.flips.length] ?? null;
}

/** Percent chance that `d` wins the current round. */
export function chanceFor(state: CoinDuelState, d: Duelist): number {
  const rival = currentRival(state) ?? 0;
  return Math.max(MIN_CHANCE, Math.min(MAX_CHANCE, 50 + effectivePower(d) - rival + state.edge));
}

export function isOver(state: CoinDuelState): boolean {
  const { wins, losses } = tally(state);
  return state.forfeited || wins >= WINS_NEEDED || losses >= WINS_NEEDED || state.flips.length >= ROUNDS;
}

/** The outcome log in one language. The engine writes English; the Screen re-writes it in the player's language. */
export function outcomeLog(state: CoinDuelState, s: CoinDuelStrings): string[] {
  const lines: string[] = [];
  for (const f of state.flips) {
    if (f.revived) lines.push(formatText(s.log.revived, { n: f.round + 1, name: f.name }));
    lines.push(
      formatText(s.log.round, {
        n: f.round + 1,
        name: f.name,
        power: f.power,
        rival: f.rival,
        chance: f.chance,
        result: f.won ? s.log.won : s.log.lost,
      }),
    );
  }
  const { wins, losses } = tally(state);
  const end = state.forfeited ? s.log.endFled : wins >= WINS_NEEDED ? s.log.endWon : s.log.endLost;
  lines.push(formatText(end, { wins, losses }));
  return lines;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

function initial(seed: number, party: Party, run: RunContext): CoinDuelState {
  // Setup randomness: one generator for the whole setup, derived from the seed.
  const rng = mulberry32(fnv1a(`coin-duel:${seed >>> 0}`));
  const base = 16 + run.difficulty * 6;
  const rivals = Array.from({ length: ROUNDS }, (_, i) => base + i * 4 + rngInt(rng, 16));
  return {
    seed: seed >>> 0,
    duelists: party.members.map((m) => ({ id: m.id, name: m.name, power: m.power, uses: 0 })),
    rivals,
    flips: [],
    edge: buffAmount(run, 'attack') + buffAmount(run, 'luck'),
    revivesLeft: buffAmount(run, 'revive'),
    forfeited: false,
  };
}

function reduce(state: CoinDuelState, action: CoinDuelAction): CoinDuelState {
  if (isOver(state)) return state;
  if (action.type === 'forfeit') return { ...state, forfeited: true };

  const duelist = state.duelists.find((d) => d.id === action.memberId);
  const rival = currentRival(state);
  if (!duelist || rival === null) return state;

  // Turn randomness: a fresh generator for this round, from the seed and the round number.
  const round = state.flips.length;
  const rng = turnRng(state.seed, round);
  const chance = chanceFor(state, duelist);
  let roll = rngInt(rng, 100);
  let revived = false;
  let revivesLeft = state.revivesLeft;
  if (roll >= chance && revivesLeft > 0) {
    roll = rngInt(rng, 100);
    revived = true;
    revivesLeft -= 1;
  }
  const flip: Flip = { round, memberId: duelist.id, name: duelist.name, power: effectivePower(duelist), rival, chance, roll, won: roll < chance, revived };
  return {
    ...state,
    duelists: state.duelists.map((d) => (d.id === duelist.id ? { ...d, uses: d.uses + 1 } : d)),
    flips: [...state.flips, flip],
    revivesLeft,
  };
}

function outcome(state: CoinDuelState): Outcome | null {
  if (!isOver(state)) return null;
  const { wins, losses } = tally(state);
  const result = state.forfeited ? 'fled' : wins >= WINS_NEEDED ? 'won' : 'lost';
  const score = result === 'won' ? 1000 - 250 * losses : result === 'lost' ? 200 * wins : 100 * wins;
  return {
    result,
    score: clampScore(score),
    log: outcomeLog(state, strings.en),
    troopsUsed: [...new Set(state.flips.map((f) => f.memberId))],
    learned: {
      topic: { en: strings.en.learned.topic, fr: strings.fr.learned.topic },
      note: { en: strings.en.learned.note, fr: strings.fr.learned.note },
    },
    stats: { wins, losses, revivesUsed: state.flips.filter((f) => f.revived).length },
  };
}

/** A simple competent bot: send the ally with the best odds, breaking near-ties at random. */
function botPlay(state: CoinDuelState, rng: () => number): CoinDuelAction | null {
  if (isOver(state)) return null;
  const odds = state.duelists.map((d) => ({ id: d.id, chance: chanceFor(state, d) }));
  const best = Math.max(...odds.map((o) => o.chance));
  const pick = rngPick(rng, odds.filter((o) => o.chance >= best - 2));
  return { type: 'send', memberId: pick.id };
}

export const engine: GameEngine<CoinDuelState, CoinDuelAction> = { initial, reduce, outcome, botPlay };
