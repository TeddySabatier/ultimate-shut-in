import { strings, type SaveFile } from '../game';
import { absoluteAvatar, havenSceneForRing, uiIcons } from '../assets';
import { playerXpProgress, ringProgress } from '../state/selectors';
import { fmtNum } from '../utils/format';
import { Icon, Sprite } from './Icon';
import { Meter } from './Meter';
import styles from './RingHeader.module.css';

interface RingHeaderProps {
  save: SaveFile;
}

/** Haven header: the ring scene, ring name, DP progress, the Absolute, level/XP and settlement. */
export function RingHeader({ save }: RingHeaderProps) {
  const rp = ringProgress(save);
  const xp = playerXpProgress(save);
  const scene = havenSceneForRing(save.player.ring - 1);
  return (
    <header className={styles.header} data-testid="ring-header">
      <div className={styles.scene} style={{ backgroundImage: `url("${scene}")` }} role="img" aria-label={`The Haven: ${rp.ring.name}`} />
      <div className={styles.overlay}>
        <div className={styles.top}>
          <Sprite src={absoluteAvatar} alt="The Absolute" size={56} className={styles.avatar} />
          <div className={styles.player}>
            <div className={styles.nameRow}>
              <span className={styles.name}>{save.player.name}</span>
              <span className={styles.level}>Lv {save.player.level}</span>
            </div>
            <Meter value={xp.value} max={xp.max} label="XP to next level" tone="xp" size="sm" caps />
          </div>
          <div className={styles.coins} aria-label={`${fmtNum(save.player.coins)} settlement`}>
            <Icon src={uiIcons.coin} size={18} />
            <span className="mono">{fmtNum(save.player.coins)}</span>
          </div>
        </div>
        <div className={styles.ring}>
          <h1 className={styles.ringName}>{rp.ring.name}</h1>
          <p className={styles.ringSub}>
            {rp.next ? (
              <>
                <span className="mono">
                  {fmtNum(save.player.domainPoints)} / {fmtNum(rp.next.domainPointsRequired)}
                </span>{' '}
                {strings.ui.domainPoints} to {rp.next.name}
              </>
            ) : (
              <>The City is registered. The Ledger keeps counting.</>
            )}
          </p>
          <Meter value={rp.value} max={rp.max} label={`${strings.ui.domainPoints} to next ring`} tone="dp" hideText />
        </div>
      </div>
    </header>
  );
}
