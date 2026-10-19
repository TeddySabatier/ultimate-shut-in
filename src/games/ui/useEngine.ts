/**
 * Run a game engine inside a Screen: state, dispatch, the one call to
 * `onFinish`, and a safe `exit`. Every Screen should use it instead of
 * wiring its own reducer.
 *
 *   const { state, dispatch, outcome, exit } = useEngine(engine, props);
 *   <button onClick={() => dispatch({ type: 'forfeit' })}>Forfeit</button>  // ends with the game's own fled outcome
 *   <button onClick={exit}>Leave</button>                                   // leaves the Screen
 *
 * - The state is created once from `seed`, `party`, `run` and `locale` (the
 *   host remounts the Screen for a new game).
 * - Actions after the end are ignored.
 * - `onFinish` is called exactly once, when the outcome first becomes
 *   non-null, with `durationMs` set (wall time since mount, paused time
 *   included) and the outcome rewritten by `localize` when given.
 * - `exit()` calls `onExit` after any `onFinish` that the same event
 *   triggers, so "forfeit then leave" in one handler still reports the
 *   game's outcome first. Prefer a separate Leave press anyway.
 * - In development every state is deep-frozen (a mutation throws at once)
 *   and an invalid outcome is reported with `console.error`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameEngine, GameScreenProps, Outcome } from '../contract';
import { deepFreeze } from '../testing/play';
import { outcomeProblems } from '../testing/validate';

export interface EngineSession<S, A> {
  state: S;
  dispatch: (action: A) => void;
  /** `engine.outcome(state)`: null while the game runs. */
  outcome: Outcome | null;
  /** Leave the Screen: calls `onExit` once, after a pending `onFinish`. */
  exit: () => void;
}

export interface UseEngineOptions<S> {
  /** Rewrite the engine's outcome before `onFinish` (for example a log the engine wrote in English). */
  localize?: (outcome: Outcome, state: S) => Outcome;
}

const DEV = import.meta.env.DEV;
const guard: <T>(value: T) => T = DEV ? deepFreeze : (value) => value;

export function useEngine<S, A>(
  engine: GameEngine<S, A>,
  props: Pick<GameScreenProps, 'seed' | 'party' | 'run' | 'locale' | 'onFinish' | 'onExit'>,
  options: UseEngineOptions<S> = {},
): EngineSession<S, A> {
  const [state, setState] = useState<S>(() => guard(engine.initial(props.seed, props.party, props.run, props.locale)));
  const dispatch = useCallback(
    (action: A) => setState((s) => (engine.outcome(s) ? s : guard(engine.reduce(s, action)))),
    [engine],
  );
  const outcome = useMemo(() => engine.outcome(state), [engine, state]);
  const [exitRequested, setExitRequested] = useState(false);
  const exit = useCallback(() => setExitRequested(true), []);

  const startedAt = useRef<number | null>(null);
  const finished = useRef(false);
  const exited = useRef(false);
  const latest = useRef({ onFinish: props.onFinish, onExit: props.onExit, localize: options.localize, party: props.party });
  useEffect(() => {
    latest.current = { onFinish: props.onFinish, onExit: props.onExit, localize: options.localize, party: props.party };
  });
  useEffect(() => {
    startedAt.current ??= performance.now();
  }, []);
  // Declared before the exit effect: in one commit, onFinish runs first.
  useEffect(() => {
    if (!outcome || finished.current) return;
    finished.current = true;
    const { onFinish, localize, party } = latest.current;
    const final = localize ? localize(outcome, state) : outcome;
    const durationMs = Math.max(0, Math.round(performance.now() - (startedAt.current ?? performance.now())));
    if (DEV) {
      const problems = outcomeProblems(final, party.members.map((m) => m.id));
      if (problems.length > 0) console.error('[games] invalid outcome:', problems, final);
    }
    onFinish({ ...final, durationMs });
  }, [outcome, state]);
  useEffect(() => {
    if (!exitRequested || exited.current) return;
    exited.current = true;
    latest.current.onExit();
  }, [exitRequested]);

  return { state, dispatch, outcome, exit };
}
