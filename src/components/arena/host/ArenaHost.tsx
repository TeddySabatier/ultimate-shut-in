/**
 * The Arena host (docs/design/ARENA.md 7): mounts the lazily loaded Screen of
 * the game the run chose, with the party the Armory built and the run's
 * buffs, collects its `Outcome`, validates it, applies it to the save through
 * the store, and shows a results panel under the final board.
 *
 * Rules it keeps (docs/design/games/CONTRACT.md 5):
 * - Props are read once at mount; the screen remounts it (a new React key) for the next game.
 * - An outcome is validated with `outcomeProblems` before the engine sees it; an invalid
 *   one is logged and counts as `fled` with score 0.
 * - `onExit` before any outcome records `fledOutcome()` one task later, so an `onFinish`
 *   that arrives in the same task keeps the game's own outcome. `onExit` after the end
 *   just means "continue".
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { buildParty, formatLine, getArenaBuff, runContext, strings, type ArenaGameRecord, type ArenaRunRecord } from '../../../game';
import { fitParty, fledOutcome, type GameModule, type GameScreenProps, type Outcome, type Party, type RunContext } from '../../../games/contract';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useGameStore } from '../../../state/gameStore';
import { SystemWindow } from '../../SystemWindow';
import { ResultPanel } from '../ResultPanel';
import { gameLocale, getGame, loadScreen } from './catalog';
import { resolveHostOutcome } from './outcome';
import styles from './ArenaHost.module.css';

const t = strings.arena.host;

interface Session {
  runId: string;
  game: GameModule | null;
  gameId: string;
  seed: number;
  party: Party;
  run: RunContext;
  difficulty: number;
  room: number;
  pendingCoins: number;
}

/** Everything the game needs, read once from the save at mount. */
function makeSession(): Session | null {
  const save = useGameStore.getState().save;
  const run = save?.arena.run;
  const ctx = run ? runContext(run) : null;
  if (!save || !run || !run.current || !ctx) return null;
  const game = getGame(run.current.gameId) ?? null;
  const party = game ? fitParty(buildParty(save), game.manifest) : { members: [] };
  return {
    runId: run.id,
    game,
    gameId: run.current.gameId,
    seed: run.current.seed,
    party,
    run: ctx,
    difficulty: run.current.difficulty,
    room: run.current.roomIndex + 1,
    pendingCoins: run.pending.coins,
  };
}

/** A crash in a game's Screen ends the game instead of taking the Arena down. */
class ScreenBoundary extends Component<{ children: ReactNode; onCrash: () => void }, { crashed: boolean }> {
  override state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  override componentDidCatch(error: Error) {
    console.error('[arena] a game crashed:', error);
    this.props.onCrash();
  }
  override render() {
    if (this.state.crashed) return <p role="alert">{t.crashed}</p>;
    return this.props.children;
  }
}

type Loaded = { status: 'loading' } | { status: 'ready'; Screen: ComponentType<GameScreenProps> } | { status: 'error' };

/** The game's Screen from its own lazy chunk; `attempt` retries a failed load. Loading is derived, so no effect sets it. */
function useScreen(gameId: string, enabled: boolean, attempt: number): Loaded {
  const key = `${gameId}:${attempt}`;
  const [state, setState] = useState<{ key: string; loaded: Loaded }>({ key: '', loaded: { status: 'loading' } });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadScreen(gameId).then(
      (Screen) => live && setState({ key, loaded: { status: 'ready', Screen } }),
      () => live && setState({ key, loaded: { status: 'error' } }),
    );
    return () => {
      live = false;
    };
  }, [gameId, enabled, key]);
  return state.key === key ? state.loaded : { status: 'loading' };
}

interface Result {
  outcome: Outcome;
  invalid: boolean;
  record: ArenaGameRecord | null;
  ended: ArenaRunRecord | null;
}

interface Props {
  /** Called just before the outcome is applied, so the screen keeps the host on show after the run's phase moves on. */
  onHold: () => void;
  /** The player is done with the results panel. */
  onDone: () => void;
}

export function ArenaHost({ onHold, onDone }: Props) {
  const [session] = useState(makeSession);
  const reducedMotion = useReducedMotion();
  const arenaResolve = useGameStore((s) => s.arenaResolve);
  const arenaAbandon = useGameStore((s) => s.arenaAbandon);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const settled = useRef(false);
  const [locale] = useState(gameLocale);
  const screen = useScreen(session?.gameId ?? '', session?.game != null, attempt);
  const partyIds = useMemo(() => session?.party.members.map((m) => m.id) ?? [], [session]);

  const finish = useCallback(
    (raw: unknown, abandon = false) => {
      if (settled.current) return;
      settled.current = true;
      const { outcome, problems } = resolveHostOutcome(raw, partyIds, t.left);
      onHold();
      const r = abandon ? arenaAbandon() : arenaResolve({ result: outcome.result, score: outcome.score, ...(outcome.learned ? { learned: outcome.learned } : {}) });
      const save = useGameStore.getState().save;
      const record = r.ended?.games[r.ended.games.length - 1] ?? save?.arena.run?.games[save.arena.run.games.length - 1] ?? null;
      setResult({ outcome, invalid: problems.length > 0, record, ended: r.ended });
    },
    [arenaAbandon, arenaResolve, onHold, partyIds],
  );

  const onFinish = useCallback((outcome: Outcome) => finish(outcome), [finish]);
  const onExit = useCallback(() => {
    if (settled.current) {
      onDone();
      return;
    }
    // One task later: a game that finishes right after asking to leave keeps its own outcome.
    window.setTimeout(() => finish(fledOutcome([t.left])), 0);
  }, [finish, onDone]);
  const leave = useCallback(() => finish(fledOutcome([t.left]), true), [finish]);

  // Without a game to mount (the listing changed since the run began) the run is closed, never stuck.
  if (!session || !session.game) {
    return (
      <SystemWindow title={t.missing} tone="danger" headingLevel={2}>
        <button type="button" className="btn btn--primary" onClick={() => (result ? onDone() : leave())}>
          {result ? t.continue : t.leave}
        </button>
      </SystemWindow>
    );
  }
  const { manifest } = session.game;

  return (
    <div className={styles.host} data-testid="arena-host">
      <header className={styles.status}>
        <p className={styles.line} data-testid="arena-room">
          {formatLine(t.roomLine, { room: session.room, difficulty: session.difficulty })}
        </p>
        <p className={styles.line}>{formatLine(t.spoilsLine, { coins: session.pendingCoins })}</p>
        <p className={styles.buffs}>
          <span className={styles.buffsLabel}>{t.buffsHeading}: </span>
          {session.run.buffs.length === 0
            ? t.noBuffs
            : session.run.buffs.map((b) => getArenaBuff(b.id.split('@')[0] ?? '')?.name ?? b.kind).join(', ')}
        </p>
      </header>

      <div className={styles.stage} lang={locale} aria-label={manifest.name[locale]} role="region">
        {screen.status === 'loading' ? (
          <p className="muted" role="status">
            {t.loading}
          </p>
        ) : screen.status === 'error' ? (
          <SystemWindow title={t.loadFailed} tone="danger" headingLevel={2}>
            <div className={styles.row}>
              <button type="button" className="btn btn--primary" onClick={() => setAttempt((n) => n + 1)}>
                {t.retry}
              </button>
              <button type="button" className="btn" onClick={leave}>
                {t.leave}
              </button>
            </div>
          </SystemWindow>
        ) : (
          <ScreenBoundary onCrash={leave}>
            <screen.Screen
              party={session.party}
              seed={session.seed}
              run={session.run}
              locale={locale}
              reducedMotion={reducedMotion}
              onFinish={onFinish}
              onExit={onExit}
            />
          </ScreenBoundary>
        )}
      </div>

      {result ? <ResultPanel outcome={result.outcome} record={result.record} ended={result.ended} invalid={result.invalid} locale={locale} onContinue={onDone} /> : <p className={styles.note}>{t.leaveNote}</p>}
    </div>
  );
}
