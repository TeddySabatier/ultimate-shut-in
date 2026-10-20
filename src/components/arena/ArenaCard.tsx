/**
 * The Arena's card on the Haven screen (docs/design/ARENA.md 10): it opens
 * `#/arena`. It sits in the main bundle, so it reads only the save and the
 * engine's selectors, never the games registry or anything under `host/`.
 */
import { Link } from 'react-router-dom';
import { arenaIcons } from '../../assets';
import { entryFee, formatLine, runsToday, strings, type SaveFile } from '../../game';
import { todayIndex } from '../../state/selectors';
import { Icon } from '../Icon';
import { SystemWindow } from '../SystemWindow';
import { Purse } from './Purse';
import styles from './arena.module.css';

const u = strings.arena.ui;

export function ArenaCard({ save, now }: { save: SaveFile; now: number }) {
  const fee = entryFee(save.player.ring, save.settings.difficulty);
  return (
    <SystemWindow title={u.card.title} data-testid="arena-card">
      <div className={styles.cardHead}>
        <Icon src={arenaIcons.card} size="2rem" className={styles.cardIcon} />
        <div className={styles.stack}>
          <p className={styles.line}>{u.card.line}</p>
          <p className={styles.row}>
            <span className={styles.text}>{formatLine(u.card.fee, { fee })}</span>
            <Purse coins={save.player.coins} />
          </p>
          <p className={`${styles.line} ${styles.note}`}>
            {formatLine(u.card.stats, { best: save.arena.stats.bestChain, runs: runsToday(save, todayIndex(save, now)) })}
          </p>
          {save.arena.run ? <p className={styles.line}>{u.card.waiting}</p> : null}
        </div>
      </div>
      <Link to="/arena" className={`btn btn--primary btn--block ${styles.cardLink}`}>
        {u.card.open}
      </Link>
    </SystemWindow>
  );
}
