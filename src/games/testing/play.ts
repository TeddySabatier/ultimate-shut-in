/**
 * Headless play: run an engine with its own bot until the game ends.
 * Pure TypeScript, no vitest import: the Games Lab uses it for "Bot play".
 */
import { fnv1a, mulberry32 } from '../../game/rng';
import type { GameModule, Outcome, Party, RunContext } from '../contract';

export const DEFAULT_MAX_STEPS = 20_000;

export interface PlayResult<S, A> {
  /** The last state reached. */
  state: S;
  /** The outcome of the last state; `null` when the game did not end. */
  outcome: Outcome | null;
  /** Number of actions applied. */
  steps: number;
  /** Every action the bot chose, in order. */
  actions: A[];
  /** Why the play stopped without an outcome, if it did. */
  stopped?: 'maxSteps' | 'botReturnedNull';
}

export interface PlayOptions {
  /** Deep-freeze every state before handing it to `reduce` and `botPlay` (purity check). */
  freeze?: boolean;
  /** Called with every state reached, the initial one included (step 0). */
  inspect?: (state: unknown, step: number) => void;
}

/**
 * The bot's own PRNG. It does not depend on the game seed, so when two seeds
 * play differently it is the game that differs, not the bot's coin tosses.
 */
export function botRng(salt = 0): () => number {
  return mulberry32(fnv1a(`bot:${salt >>> 0}`));
}

/** Recursively `Object.freeze` plain objects and arrays; returns the same value. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/**
 * Play `module` with its bot from `initial(seed, party, run)` until the
 * outcome is non-null, the bot returns `null`, or `maxSteps` actions were
 * applied. Never throws on its own; engine exceptions propagate.
 */
export function playToEnd<S, A>(
  module: GameModule<S, A>,
  seed: number,
  party: Party,
  run: RunContext,
  maxSteps: number = DEFAULT_MAX_STEPS,
  options: PlayOptions = {},
): PlayResult<S, A> {
  const { engine } = module;
  const rng = botRng();
  const guard = options.freeze ? deepFreeze : <T>(v: T) => v;
  let state = guard(engine.initial(seed, guard(party), guard(run)));
  const actions: A[] = [];
  for (let steps = 0; ; steps++) {
    options.inspect?.(state, steps);
    const outcome = engine.outcome(state);
    if (outcome) return { state, outcome, steps, actions };
    if (steps >= maxSteps) return { state, outcome: null, steps, actions, stopped: 'maxSteps' };
    const action = engine.botPlay(state, rng);
    if (action === null) return { state, outcome: null, steps, actions, stopped: 'botReturnedNull' };
    actions.push(action);
    state = guard(engine.reduce(state, guard(action)));
  }
}
