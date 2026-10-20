/** After the Lottery (docs/design/ARENA.md 5.1): go on to the next room, or bank. */
import { arenaContent, strings, type ArenaRunRecord, type GameCandidate, type SaveFile } from '../../game';
import { useGameStore } from '../../state/gameStore';
import { SystemWindow } from '../SystemWindow';
import { BankPanel } from './BankPanel';
import { RunStatus } from './RunStatus';
import { useArenaFeedback } from './useArenaFeedback';
import styles from './arena.module.css';

const u = strings.arena.ui;

interface Props {
  save: SaveFile;
  candidates: readonly GameCandidate[];
  onBanked: (record: ArenaRunRecord) => void;
}

export function DecidePanel({ save, candidates, onBanked }: Props) {
  const arenaContinue = useGameStore((s) => s.arenaContinue);
  const { message, report } = useArenaFeedback();
  const run = save.arena.run;
  if (!run) return null;
  const last = run.room >= arenaContent.run.maxRooms;
  return (
    <>
      <SystemWindow title={u.run.decideHeading} tone="accent" data-testid="arena-decide">
        <div className={styles.stack}>
          <p className={styles.line}>{u.run.decideIntro}</p>
          <RunStatus run={run} />
          {last ? (
            <p className={styles.reason}>{u.run.lastRoom}</p>
          ) : (
            <>
              <button type="button" className="btn btn--primary btn--block" onClick={() => report(arenaContinue(candidates), null)}>
                {u.run.next}
              </button>
              <p className={styles.note}>{u.run.nextNote}</p>
            </>
          )}
          <p className={styles.live} role="status" aria-live="polite">
            {message}
          </p>
        </div>
      </SystemWindow>
      <BankPanel save={save} onBanked={onBanked} />
    </>
  );
}
