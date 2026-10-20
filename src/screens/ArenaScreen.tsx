/**
 * The Arena (docs/design/ARENA.md 10): one screen, loaded lazily at `#/arena`.
 * It shows one view at a time, chosen from the save:
 * - hosting: a game is mounted, or its results are still on show;
 * - the Lottery after a win, then bank-or-continue;
 * - the hub: entry, games, Armory, requests and the recent runs.
 *
 * This is the only screen that reads the games catalog (host/catalog.ts), so
 * the registry stays out of the main bundle.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { strings, type ArenaRunRecord } from '../game';
import { ArenaHost } from '../components/arena/host/ArenaHost';
import { gameCandidates, gameLocale, getGame, listedGames } from '../components/arena/host/catalog';
import { Armory } from '../components/arena/Armory';
import { DecidePanel } from '../components/arena/DecidePanel';
import { EntryPanel } from '../components/arena/EntryPanel';
import { GameList } from '../components/arena/GameList';
import { LotteryPick } from '../components/arena/LotteryPick';
import { Purse } from '../components/arena/Purse';
import { RequestForm } from '../components/arena/RequestForm';
import { RunLog } from '../components/arena/RunLog';
import { RunSummary } from '../components/arena/RunSummary';
import { useNow } from '../hooks/useNow';
import { useGameStore, useSave } from '../state/gameStore';
import styles from './ArenaScreen.module.css';

const u = strings.arena.ui;

/**
 * The key of the game whose results are on show. It lives in a tiny external
 * store (not React state) so that holding it and the store's own update land in
 * the same render even when a game finishes from a timer: otherwise the run's
 * phase could move on one render before the hold and unmount the host early.
 */
function createHold() {
  let value: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: string | null) => {
      value = next;
      for (const l of listeners) l();
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export default function ArenaScreen() {
  const save = useSave();
  const now = useNow(true, 60_000);
  const [games] = useState(listedGames);
  const [candidates] = useState(() => gameCandidates(games));
  const [locale] = useState(gameLocale);
  const [hold] = useState(createHold);
  const held = useSyncExternalStore(hold.subscribe, hold.get);
  const [summary, setSummary] = useState<ArenaRunRecord | null>(null);

  const run = save.arena.run;
  const playingKey = run?.phase === 'playing' && run.current ? `${run.id}:${run.current.roomIndex}` : null;
  const hostKey = playingKey ?? held;
  // The summary belongs to the newest run on record; once another run is logged it is stale.
  const lastRun = save.arena.log[save.arena.log.length - 1];
  const shownSummary = summary !== null && lastRun?.id === summary.id ? summary : null;

  const onHold = useCallback(() => hold.set(playingKey), [hold, playingKey]);
  const onDone = useCallback(() => {
    const runId = hold.get()?.split(':')[0] ?? null;
    hold.set(null);
    // A game that ended the run: the hub opens on what came home.
    const after = useGameStore.getState().save;
    const last = after?.arena.log[after.arena.log.length - 1];
    if (after && !after.arena.run && last && last.id === runId) setSummary(last);
  }, [hold]);
  const onBanked = useCallback((record: ArenaRunRecord) => setSummary(record), []);
  const gameName = useCallback((id: string) => getGame(id)?.manifest.name[locale] ?? id, [locale]);

  // Keyboard and screen-reader focus follows the view: a new view (entry, lottery, next game, results) takes it.
  const viewKey = hostKey !== null ? `host:${hostKey}` : (run?.phase ?? 'hub');
  const viewRef = useRef<HTMLDivElement>(null);
  const lastView = useRef(viewKey);
  useEffect(() => {
    if (lastView.current === viewKey) return;
    lastView.current = viewKey;
    viewRef.current?.focus();
  }, [viewKey]);

  let view;
  if (hostKey !== null) {
    view = <ArenaHost key={hostKey} onHold={onHold} onDone={onDone} />;
  } else if (run?.phase === 'lottery') {
    view = <LotteryPick save={save} onBanked={onBanked} />;
  } else if (run?.phase === 'decide') {
    view = <DecidePanel save={save} candidates={candidates} onBanked={onBanked} />;
  } else {
    view = (
      <div className={styles.hub}>
        <div className={styles.col}>
          {shownSummary ? <RunSummary record={shownSummary} onDismiss={() => setSummary(null)} /> : null}
          <EntryPanel save={save} now={now} candidates={candidates} />
          <GameList games={games} locale={locale} ring={save.player.ring} />
          <RunLog log={save.arena.log} locale={locale} gameName={gameName} />
        </div>
        <div className={styles.col}>
          <Armory save={save} />
          <RequestForm save={save} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen} data-testid="arena-screen">
      <header className={styles.top}>
        <Link to="/" className={styles.back}>
          <span aria-hidden="true">{'<'}</span> {u.back}
        </Link>
        <div className={styles.titleRow}>
          <h1 className={styles.h1}>{u.title}</h1>
          <Purse coins={save.player.coins} className={styles.purse} />
        </div>
      </header>
      <div ref={viewRef} tabIndex={-1} className={styles.view} data-testid="arena-view">
        {view}
      </div>
    </div>
  );
}
