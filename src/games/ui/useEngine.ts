/**
 * Run a game engine inside a Screen: state, dispatch, and the one call to
 * `onFinish`. Every Screen should use it instead of wiring its own reducer.
 *
 *   const { state, dispatch, outcome } = useEngine(engine, props, {
 *     localize: (o, s) => ({ ...o, log: outcomeLog(s, strings[props.locale]) }),
 *   });
 *
 * - The state is created once from `seed`, `party` and `run` (the host
 *   remounts the Screen for a new game).
 * - Actions after the end are ignored.
 * - `onFinish` is called exactly once, when the outcome first becomes
 *   non-null, with `durationMs` set and the log localized by `localize`.
 * - In development every state is deep-frozen, so a Screen or engine that
 *   mutates state throws at once.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameEngine, GameScreenProps, Outcome } from '../contract';
import { deepFreeze } from '../testing/play';

export interface EngineSession<S, A> {
  state: S;
  dispatch: (action: A) => void;
  /** `engine.outcome(state)`: null while the game runs. */
  outcome: Outcome | null;
}

export interface UseEngineOptions<S> {
  /** Rewrite the engine's (English) outcome for the player's language before `onFinish`. */
  localize?: (outcome: Outcome, state: S) => Outcome;
}

const guard: <T>(value: T) => T = import.meta.env.DEV ? deepFreeze : (value) => value;

export function useEngine<S, A>(
  engine: GameEngine<S, A>,
  props: Pick<GameScreenProps, 'seed' | 'party' | 'run' | 'onFinish'>,
  options: UseEngineOptions<S> = {},
): EngineSession<S, A> {
  const [state, setState] = useState<S>(() => guard(engine.initial(props.seed, props.party, props.run)));
  const dispatch = useCallback(
    (action: A) => setState((s) => (engine.outcome(s) ? s : guard(engine.reduce(s, action)))),
    [engine],
  );
  const outcome = useMemo(() => engine.outcome(state), [engine, state]);

  const startedAt = useRef<number | null>(null);
  const finished = useRef(false);
  const latest = useRef({ onFinish: props.onFinish, localize: options.localize });
  useEffect(() => {
    latest.current = { onFinish: props.onFinish, localize: options.localize };
  });
  useEffect(() => {
    startedAt.current ??= performance.now();
  }, []);
  useEffect(() => {
    if (!outcome || finished.current) return;
    finished.current = true;
    const { onFinish, localize } = latest.current;
    const final = localize ? localize(outcome, state) : outcome;
    const durationMs = Math.max(0, Math.round(performance.now() - (startedAt.current ?? performance.now())));
    onFinish({ ...final, durationMs });
  }, [outcome, state]);

  return { state, dispatch, outcome };
}
