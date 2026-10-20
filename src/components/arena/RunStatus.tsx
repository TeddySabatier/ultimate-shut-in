/** The run between games: spoils so far, what a loss would still carry home, and the buffs held. */
import { carriedHome, formatLine, strings, type ArenaRun } from '../../game';
import { Icon } from '../Icon';
import { buffAmount, buffDef, BUFF_ICON } from './format';
import styles from './arena.module.css';

const u = strings.arena.ui;

export function RunStatus({ run }: { run: ArenaRun }) {
  return (
    <div className={styles.stack} data-testid="arena-run-status">
      <p className={styles.line}>
        <strong>{formatLine(u.run.spoils, { coins: run.pending.coins, wins: run.pending.wins })}</strong>
      </p>
      <p className={styles.note}>{formatLine(u.run.atRisk, { coins: carriedHome(run.pending.coins) })}</p>
      <h3 className={styles.subhead}>{u.run.buffsHeading}</h3>
      {run.buffs.length === 0 ? (
        <p className={styles.note}>{u.run.noBuffs}</p>
      ) : (
        <ul className={styles.buffs} aria-label={u.run.buffsHeading}>
          {run.buffs.map((b) => {
            const def = buffDef(b);
            return (
              <li key={b.id} className={styles.buff}>
                <Icon src={BUFF_ICON[b.kind]} size="1.25rem" className={styles.buffIcon} />
                <span className={styles.text}>
                  {def?.name ?? b.kind} <span className="muted">{buffAmount(b.kind, b.amount)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
