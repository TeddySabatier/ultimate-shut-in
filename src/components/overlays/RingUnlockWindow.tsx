import { useCallback, useId, useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { activeOutposts, getRing, strings, zoneOfCell, type RingId } from '../../game';
import { useGameStore } from '../../state/gameStore';
import { havenSceneForRing } from '../../assets';
import { seededLine } from '../../state/selectors';
import { SystemWindow } from '../SystemWindow';
import { Typewriter } from '../Typewriter';
import { useDismissKeys } from '../../hooks/useDismissKeys';
import { ModalFrame } from './ModalFrame';
import styles from './overlays.module.css';

interface RingUnlockWindowProps {
  ring: RingId;
  onDismiss: () => void;
}

/** Full-screen "Domain expanded" window with the new scene and the ring's vignette. */
export function RingUnlockWindow({ ring, onDismiss }: RingUnlockWindowProps) {
  const id = useId();
  const def = getRing(ring);
  const inRouter = useInRouterContext();
  const save = useGameStore((s) => s.save);
  const reached = save ? activeOutposts(save).filter((o) => zoneOfCell(o.cell) === ring) : [];
  const [typing, setTyping] = useState(true);
  const skip = useCallback(() => setTyping(false), []);
  const onDone = useCallback(() => setTyping(false), []);
  const tap = useCallback(() => {
    if (typing) skip();
    else onDismiss();
  }, [typing, skip, onDismiss]);
  useDismissKeys(tap);

  return (
    <ModalFrame labelledBy={id} onTap={tap} fullscreen>
      <div className={styles.ringScene} style={{ backgroundImage: `url("${havenSceneForRing(ring - 1)}")` }} role="img" aria-label={def.name} />
      <SystemWindow
        as="div"
        tone="accent"
        title={<span id={id}>Domain expanded</span>}
        className={styles.window}
        bodyClassName={styles.scrollBody}
        actions={
          // Buttons dismiss once: the frame's own tap handler must not also fire.
          <div className={styles.dismissRow} onClick={(e) => e.stopPropagation()}>
            {typing ? (
              <button type="button" className="btn" onClick={skip}>
                Skip
              </button>
            ) : null}
            {inRouter ? (
              <Link to="/map" className="btn" onClick={onDismiss}>
                {strings.map.seeOnMap}
              </Link>
            ) : null}
            <button type="button" className="btn btn--primary" onClick={onDismiss}>
              Continue
            </button>
          </div>
        }
      >
        <h3 className={styles.ringName}>{def.name}</h3>
        <p className={styles.headline}>{seededLine(strings.ringUnlock, `ring:${ring}`, { ring: def.name })}</p>
        <p className={styles.vignette}>
          <Typewriter text={def.vignette} speed={14} active={typing} onDone={onDone} />
        </p>
        <p className={styles.facilities}>
          <span className="muted">Unlocked: </span>
          {def.facilities.map((f) => f.name).join(', ')}
        </p>
        {reached.length > 0 ? <p className={styles.facilities}>{reached.map((o) => strings.map.toasts.withinWalls.replace('{name}', o.name)).join(' ')}</p> : null}
      </SystemWindow>
    </ModalFrame>
  );
}
