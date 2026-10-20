/**
 * The way into a run (docs/design/ARENA.md 5.1, 5.5): the fee, the button,
 * and why it is disabled when it is. The daily suggestion is a soft line,
 * never a block.
 */
import { useId } from 'react';
import {
  arenaDefense,
  eligibleGames,
  entryFee,
  formatLine,
  overDailySuggestion,
  rosterFor,
  runsToday,
  strings,
  type GameCandidate,
  type SaveFile,
} from '../../game';
import { useGameStore } from '../../state/gameStore';
import { todayIndex } from '../../state/selectors';
import { SystemWindow } from '../SystemWindow';
import { errorLine } from './format';
import { useArenaFeedback } from './useArenaFeedback';
import styles from './arena.module.css';

const u = strings.arena.ui;

interface Props {
  save: SaveFile;
  now: number;
  /** The games the host lists, reduced for the engine (`gameCandidates()`). */
  candidates: readonly GameCandidate[];
}

export function EntryPanel({ save, now, candidates }: Props) {
  const arenaEnter = useGameStore((s) => s.arenaEnter);
  const { message, report } = useArenaFeedback();
  const ids = useId();
  const fee = entryFee(save.player.ring, save.settings.difficulty);
  const coins = save.player.coins;
  const troops = rosterFor(save).length;
  const day = todayIndex(save, now);
  const defense = arenaDefense(save);

  const reason =
    candidates.length === 0
      ? u.entry.noGames
      : troops === 0
        ? errorLine('no troops')
        : eligibleGames(candidates, save.player.ring, troops).length === 0
          ? u.entry.locked
          : coins < fee
            ? formatLine(u.entry.short, { missing: fee - coins })
            : null;

  return (
    <SystemWindow title={u.entry.heading} tone="accent">
      <div className={styles.stack}>
        <p className={styles.line}>{u.entry.explain}</p>
        <p className={styles.line}>
          <strong>{formatLine(u.entry.fee, { fee })}</strong>
        </p>
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={reason !== null}
          aria-describedby={reason !== null ? `${ids}-why` : undefined}
          onClick={() => report(arenaEnter(candidates), null)}
        >
          {u.entry.enter}
        </button>
        {reason !== null ? (
          <p id={`${ids}-why`} className={styles.reason} data-testid="arena-entry-reason">
            {reason}
          </p>
        ) : null}
        {defense > 0 ? <p className={styles.line}>{formatLine(u.entry.defense, { amount: defense })}</p> : null}
        {overDailySuggestion(save, day) ? <p className={styles.note}>{formatLine(u.entry.daily, { runs: runsToday(save, day) })}</p> : null}
        <p className={styles.live} role="status" aria-live="polite">
          {message}
        </p>
      </div>
    </SystemWindow>
  );
}
