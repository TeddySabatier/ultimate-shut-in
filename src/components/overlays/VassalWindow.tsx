import { useId } from 'react';
import { getHabit, strings, type HabitId } from '../../game';
import { vassalPortraits } from '../../assets';
import { seededLine } from '../../state/selectors';
import { Sprite } from '../Icon';
import { SystemWindow } from '../SystemWindow';
import { useDismissKeys } from '../../hooks/useDismissKeys';
import { ModalFrame } from './ModalFrame';
import styles from './overlays.module.css';

interface VassalWindowProps {
  habit: HabitId;
  kind: 'left' | 'returned';
  onDismiss: () => void;
  /** Offered on "left" so the fix is one tap away. */
  onReRecruit?: ((habit: HabitId) => void) | undefined;
}

export function VassalWindow({ habit, kind, onDismiss, onReRecruit }: VassalWindowProps) {
  const id = useId();
  const h = getHabit(habit);
  useDismissKeys(onDismiss);
  const pool = kind === 'left' ? strings.vassalLeaving : strings.vassalReturning;
  const line = seededLine(pool, `${kind}:${habit}`, { name: h.vassal.name, habit: h.label });
  return (
    <ModalFrame labelledBy={id} onTap={onDismiss}>
      <SystemWindow
        as="div"
        tone={kind === 'left' ? 'default' : 'success'}
        title={<span id={id}>{kind === 'left' ? `${h.vassal.name} is away` : `${h.vassal.name} is back`}</span>}
        className={styles.window}
        actions={
          <>
            {kind === 'left' && onReRecruit ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onReRecruit(habit);
                  onDismiss();
                }}
              >
                {strings.ui.recruit}
              </button>
            ) : null}
            <button type="button" className={kind === 'left' ? 'btn' : 'btn btn--primary'} onClick={onDismiss}>
              Continue
            </button>
          </>
        }
      >
        <div className={styles.vassalRow}>
          <Sprite src={kind === 'left' ? vassalPortraits.silhouette : vassalPortraits[habit]} alt="" size={72} />
          <p>{line}</p>
        </div>
      </SystemWindow>
    </ModalFrame>
  );
}
