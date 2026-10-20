import { Link } from 'react-router-dom';
import { entryFee, formatLine, strings } from '../../game';
import { arenaIcons } from '../../assets';
import { useSave } from '../../state/gameStore';
import { Icon } from '../Icon';
import { SystemWindow } from '../SystemWindow';
import styles from './ArenaCard.module.css';

const a = strings.arena;

/** Haven-screen entry: sits below the recent log, opens `#/arena`. */
export function ArenaCard() {
  const save = useSave();
  const fee = entryFee(save.player.ring, save.settings.difficulty);
  return (
    <SystemWindow title={a.cardTitle} data-testid="arena-card">
      <div className={styles.card}>
        <Icon src={arenaIcons.card} size="1.75rem" className={styles.icon} label={a.cardTitle} />
        <div className={styles.body}>
          <p className={styles.blurb}>{a.cardBlurb}</p>
          <p className={styles.fee}>{formatLine(a.cardFee, { coins: fee })}</p>
        </div>
        <Link to="/arena" className={`btn btn--primary ${styles.go}`}>
          {a.cardGo}
        </Link>
      </div>
    </SystemWindow>
  );
}
