import { useId } from 'react';
import { strings } from '../../game';
import { seededLine } from '../../state/selectors';
import { SystemWindow } from '../SystemWindow';
import { useDismissKeys } from '../../hooks/useDismissKeys';
import { ModalFrame } from './ModalFrame';
import styles from './overlays.module.css';

interface LevelUpWindowProps {
  level: number;
  onDismiss: () => void;
}

export function LevelUpWindow({ level, onDismiss }: LevelUpWindowProps) {
  const id = useId();
  useDismissKeys(onDismiss);
  return (
    <ModalFrame labelledBy={id} onTap={onDismiss}>
      <SystemWindow
        as="div"
        tone="accent"
        title={<span id={id}>Level up</span>}
        className={styles.window}
        bodyClassName={styles.scrollBody}
        actions={
          // The frame also dismisses on tap: stop the bubble or the next queued window is dropped.
          <div className={styles.dismissRow} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn--primary" onClick={onDismiss}>
              Continue
            </button>
          </div>
        }
      >
        <p className={styles.bigNumber}>Lv {level}</p>
        <p>{seededLine(strings.levelUp, `levelUp:${level}`, { level })}</p>
      </SystemWindow>
    </ModalFrame>
  );
}
