import { useCallback, useEffect, useId, useState } from 'react';
import { ringName, type Monster, type WaveRecord } from '../../game';
import { bossSprite, monsterSprites, uiIcons } from '../../assets';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cx } from '../../utils/cx';
import { Icon, Sprite } from '../Icon';
import { Meter } from '../Meter';
import { SystemWindow } from '../SystemWindow';
import { useDismissKeys } from '../../hooks/useDismissKeys';
import { ModalFrame } from './ModalFrame';
import styles from './overlays.module.css';

interface WaveResultWindowProps {
  record: WaveRecord;
  monster: Monster;
  onDismiss: () => void;
}

const RESULT_LABEL: Record<WaveRecord['result'], string> = {
  decisive: 'Decisive',
  win: 'Wave repelled',
  loss: 'Held',
  quiet: 'Quiet week',
};

function monsterSpriteFor(monster: Monster): string {
  if (monster.boss) return bossSprite;
  return (monsterSprites as Record<string, string | undefined>)[monster.id] ?? bossSprite;
}

/** Attack vs defense bars, the breakdown and the battle log revealed line by line. */
export function WaveResultWindow({ record, monster, onDismiss }: WaveResultWindowProps) {
  const id = useId();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? record.log.length : 0);
  const revealing = shown < record.log.length;

  useEffect(() => {
    if (reduced || shown >= record.log.length) return;
    const t = window.setTimeout(() => setShown((n) => n + 1), 450);
    return () => window.clearTimeout(t);
  }, [reduced, shown, record.log.length]);

  const tap = useCallback(() => {
    if (shown < record.log.length) setShown(record.log.length);
    else onDismiss();
  }, [shown, record.log.length, onDismiss]);
  useDismissKeys(tap);

  const max = Math.max(1, record.attack, record.defense);
  const b = record.breakdown;
  const tone = record.result === 'loss' || record.result === 'quiet' ? 'default' : 'success';

  return (
    <ModalFrame labelledBy={id} onTap={tap}>
      <SystemWindow
        as="div"
        tone={tone}
        title={
          <span id={id}>
            Wave {record.index + 1} · {ringName(record.ring)}
          </span>
        }
        className={styles.window}
        bodyClassName={styles.scrollBody}
        actions={
          // Buttons dismiss once: the frame's own tap handler must not also fire.
          <div className={styles.dismissRow} onClick={(e) => e.stopPropagation()}>
            {revealing ? (
              <button type="button" className="btn" onClick={() => setShown(record.log.length)}>
                Skip
              </button>
            ) : null}
            <button type="button" className="btn btn--primary" onClick={onDismiss}>
              Continue
            </button>
          </div>
        }
      >
        <div className={styles.waveHead}>
          <Sprite src={monsterSpriteFor(monster)} alt={monster.name} size={64} className={styles.monster} />
          <div className={styles.waveBars}>
            <div className={styles.waveBar}>
              <span className={styles.waveLabel}>Attack</span>
              <Meter value={record.attack} max={max} label="Attack" tone="attack" text={record.attack} />
            </div>
            <div className={styles.waveBar}>
              <span className={styles.waveLabel}>
                <Icon src={uiIcons.waveShield} size={14} /> Defense
              </span>
              <Meter value={record.defense} max={max} label="Defense" tone="defense" text={record.defense} />
            </div>
          </div>
        </div>
        <p className={cx(styles.resultLine, record.result === 'decisive' && styles.resultDecisive)}>{RESULT_LABEL[record.result]}</p>
        {record.result !== 'quiet' ? (
          <ul className={styles.breakdown} aria-label="Defense breakdown">
            <li>Vassals +{b.vassals}</li>
            <li>Trust +{b.trust}</li>
            <li>Walls +{b.walls}</li>
            {b.combos > 0 ? <li>Items +{b.combos}</li> : null}
            {b.titles > 0 ? <li>Titles +{b.titles}</li> : null}
            {b.wellKept > 0 ? <li>Well-kept +{b.wellKept}</li> : null}
            {b.outposts > 0 ? <li>Outposts +{b.outposts}</li> : null}
          </ul>
        ) : null}
        <ol className={cx('mono', styles.log)} aria-label="Battle log" aria-live="polite">
          {record.log.slice(0, shown).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
        {record.dpAwarded > 0 ? (
          <p className={styles.dpLine}>
            <Icon src={uiIcons.domainPoint} size={16} /> +{record.dpAwarded} Domain Points
          </p>
        ) : null}
      </SystemWindow>
    </ModalFrame>
  );
}
