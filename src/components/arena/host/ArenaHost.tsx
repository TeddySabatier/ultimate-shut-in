/**
 * Mounts one lazily loaded game Screen with the built Party and RunContext.
 * Outcomes are validated before the store sees them. Import the registry only
 * from this folder (the Arena screen is a lazy route).
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { buildParty, fnv1a, runContextFor, strings } from '../../../game';
import { useSave } from '../../../state/gameStore';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { fitParty, fledOutcome, type GameScreenProps, type Outcome, type RunBuff, type RunContext } from '../../../games/contract';
import { SystemWindow } from '../../SystemWindow';
import { getGame, loadScreen } from './catalog';
import { resolveHostOutcome, type HostOutcome } from './outcome';
import styles from './ArenaHost.module.css';

const a = strings.arena;

function asRunContext(raw: ReturnType<typeof runContextFor>): RunContext | null {
  if (!raw) return null;
  return {
    buffs: raw.buffs.map((b) => ({ id: b.id, kind: b.kind as RunBuff['kind'], amount: b.amount })),
    roomIndex: raw.roomIndex,
    difficulty: raw.difficulty,
  };
}

class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <SystemWindow title={a.troopsHome} tone="danger">
          <p className={styles.status}>{this.state.error.message}</p>
        </SystemWindow>
      );
    }
    return this.props.children;
  }
}

interface HostProps {
  gameId: string;
  onResolved: (resolved: HostOutcome) => void;
}

/** One game of a run. Remounted when `gameId` or the room index changes. */
export function ArenaHost({ gameId, onResolved }: HostProps) {
  const save = useSave();
  const reducedMotion = useReducedMotion();
  const game = getGame(gameId);
  const run = asRunContext(runContextFor(save));
  const party = useMemo(() => {
    const built = buildParty(save);
    return game ? fitParty({ members: built.members }, game.manifest) : { members: built.members };
  }, [save, game]);
  const seed = fnv1a(`${save.arena.activeRun?.seed ?? 0}:${save.arena.activeRun?.roomIndex ?? 0}:${gameId}`);
  const [loaded, setLoaded] = useState<{ id: string; seed: number; Screen: ComponentType<GameScreenProps> | null; error: string | null }>({
    id: gameId,
    seed,
    Screen: null,
    error: null,
  });
  const finished = useRef(false);

  useEffect(() => {
    let live = true;
    finished.current = false;
    loadScreen(gameId).then(
      (Comp) => live && setLoaded({ id: gameId, seed, Screen: Comp, error: null }),
      (e: unknown) => live && setLoaded({ id: gameId, seed, Screen: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [gameId, seed]);

  const Screen = loaded.id === gameId && loaded.seed === seed ? loaded.Screen : null;
  const loadError = loaded.id === gameId && loaded.seed === seed ? loaded.error : null;

  const finish = useCallback(
    (outcome: Outcome) => {
      if (finished.current) return;
      finished.current = true;
      const resolved = resolveHostOutcome(
        outcome,
        gameId,
        party.members.map((m) => m.id),
      );
      onResolved(resolved);
    },
    [gameId, onResolved, party.members],
  );

  const onExit = useCallback(() => {
    if (finished.current) return;
    finish(fledOutcome());
  }, [finish]);

  if (!game || !run) {
    return (
      <p className={styles.status} role="status">
        {a.noGames}
      </p>
    );
  }

  return (
    <div className={styles.host} data-testid="arena-host">
      <ScreenBoundary key={`${gameId}:${seed}:${run.roomIndex}`}>
        <div className={styles.stage} data-testid="arena-stage">
          {Screen ? (
            <Screen party={party} seed={seed} run={run} locale="en" reducedMotion={reducedMotion} onFinish={finish} onExit={onExit} />
          ) : (
            <p className="muted">{loadError ?? a.title}</p>
          )}
        </div>
      </ScreenBoundary>
    </div>
  );
}

/** Empty-list copy for the Arena screen; the host is only mounted with a picked id. */
export function NoGamesYet() {
  return (
    <p className={styles.status} role="status" data-testid="arena-no-games">
      {a.noGames}
    </p>
  );
}
