import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { entryFee, formatLine, pickNextGame, strings } from '../game';
import { useGameStore, useSave } from '../state/gameStore';
import { useNow } from '../hooks/useNow';
import { SystemWindow } from '../components/SystemWindow';
import { Armory } from '../components/arena/Armory';
import { BankPanel } from '../components/arena/BankPanel';
import { GameList } from '../components/arena/GameList';
import { LotteryPick } from '../components/arena/LotteryPick';
import { RequestForm } from '../components/arena/RequestForm';
import { ArenaHost, NoGamesYet } from '../components/arena/host/ArenaHost';
import { eligibleGameIds } from '../components/arena/host/catalog';
import type { HostOutcome } from '../components/arena/host/outcome';
import styles from './ArenaScreen.module.css';

const a = strings.arena;

function ArenaScreen() {
  const save = useSave();
  const start = useGameStore((s) => s.startArenaRun);
  const apply = useGameStore((s) => s.applyArenaOutcome);
  const now = useNow(true, 60_000);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [homecoming, setHomecoming] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [sessionStart] = useState(() => now);
  const run = save.arena.activeRun;
  const fee = entryFee(save.player.ring, save.settings.difficulty);
  const eligible = eligibleGameIds(save.player.ring);
  const minutes = Math.max(0, Math.floor((now - sessionStart) / 60_000));

  const beginRoom = useCallback((lastGameId: string | null, seed: number, roomIndex: number) => {
    const id = pickNextGame(lastGameId, eligibleGameIds(useGameStore.getState().save?.player.ring ?? 1), seed, roomIndex, useGameStore.getState().save?.player.ring ?? 1);
    setPlayingId(id);
    setHomecoming(false);
    setInvalid(false);
  }, []);

  const enter = () => {
    if (eligible.length === 0) return;
    if (!start()) return;
    const after = useGameStore.getState().save;
    const active = after?.arena.activeRun;
    if (!active) return;
    beginRoom(null, active.seed, active.roomIndex);
  };

  const onResolved = useCallback(
    (resolved: HostOutcome) => {
      apply(resolved.input);
      setInvalid(resolved.invalid);
      setPlayingId(null);
      const after = useGameStore.getState().save;
      if (!after?.arena.activeRun) setHomecoming(true);
    },
    [apply],
  );

  const lastScore = run?.log[run.log.length - 1]?.score ?? 0;

  return (
    <div className={styles.page} data-testid="arena-screen">
      <header className={styles.header}>
        <Link to="/" className={`btn ${styles.back}`}>
          {a.back}
        </Link>
        <div>
          <h1 className={styles.title}>{a.title}</h1>
          <p className={styles.subtitle}>{formatLine(a.subtitle, { coins: save.player.coins, ring: save.player.ring })}</p>
          {minutes >= 20 ? <p className={styles.hint}>{formatLine(a.timeHint, { n: minutes })}</p> : null}
        </div>
      </header>

      {homecoming || invalid ? (
        <SystemWindow className={styles.span} title={a.troopsHome} tone="default" data-testid="arena-homecoming">
          <div className={styles.homecoming}>
            <p>{invalid ? a.invalidOutcome : a.troopsHomeBody}</p>
            <button type="button" className="btn btn--primary" onClick={() => { setHomecoming(false); setInvalid(false); }}>
              {a.homecomingBack}
            </button>
          </div>
        </SystemWindow>
      ) : null}

      {run?.lotteryChoice ? <LotteryPick ids={run.lotteryChoice} score={lastScore} /> : null}

      {run && !run.lotteryChoice && playingId ? <ArenaHost gameId={playingId} onResolved={onResolved} /> : null}

      {run && !run.lotteryChoice && !playingId && run.pendingScore > 0 ? (
        <BankPanel pendingScore={run.pendingScore} onContinue={() => beginRoom(run.lastGameId, run.seed, run.roomIndex)} />
      ) : null}

      {run && !run.lotteryChoice && !playingId && run.pendingScore <= 0 && eligible.length === 0 ? <NoGamesYet /> : null}

      {!run ? (
        <SystemWindow className={styles.span} title={a.runTitle} data-testid="arena-run">
          <p>{a.runIntro}</p>
          <p className={styles.subtitle}>{formatLine(a.entryFee, { coins: fee })}</p>
          {eligible.length === 0 ? (
            <NoGamesYet />
          ) : (
            <button type="button" className="btn btn--primary" disabled={save.player.coins < fee} onClick={enter} data-testid="arena-enter">
              {a.enter}
            </button>
          )}
        </SystemWindow>
      ) : null}

      {!run && !playingId ? (
        <>
          <Armory />
          <GameList ring={save.player.ring} />
          <RequestForm />
        </>
      ) : null}
    </div>
  );
}

export default ArenaScreen;
