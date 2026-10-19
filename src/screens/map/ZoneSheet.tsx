import { useId, useState } from 'react';
import { strings } from '../../game';
import { outpostIcons, uiIcons } from '../../assets';
import { Icon } from '../../components/Icon';
import { Meter } from '../../components/Meter';
import { Typewriter } from '../../components/Typewriter';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { MapView, ZoneView } from '../../state/mapView';
import { cx } from '../../utils/cx';
import { fmtNum } from '../../utils/format';
import { MapSheet } from './MapSheet';
import styles from './sheets.module.css';

const z = strings.map.zone;
const o = strings.map.outposts;

interface ZoneSheetProps {
  view: MapView;
  zone: ZoneView | null;
  onClose: () => void;
  onOpenOutpost: (id: string) => void;
}

/** The zone sheet (CITY-MAP 2.3): status, creep meter, facilities, outposts here and the vignette. */
export function ZoneSheet({ view, zone, onClose, onOpenOutpost }: ZoneSheetProps) {
  const titleId = useId();
  const reduced = useReducedMotion();
  const [replaying, setReplaying] = useState(false);
  const claimed = zone !== null && zone.status !== 'next' && zone.status !== 'beyond';
  return (
    <MapSheet open={zone !== null} kick={z.kick.replace('{zone}', String(zone?.id ?? ''))} title={zone?.name ?? ''} titleId={titleId} onClose={onClose}>
      {zone ? (
        <>
          <div className={styles.statusLine}>
            {zone.status === 'claimed' ? (
              <>
                <span className={cx(styles.badge, styles.badgeClaimed)}>{o.claimed}</span>
                <span className="muted">{z.claimedAt.replace('{dp}', fmtNum(zone.threshold))}</span>
              </>
            ) : zone.status === 'current' ? (
              <>
                <span className={cx(styles.badge, styles.badgeScouted)}>{o.current}</span>
                <span className="muted">{z.wallsIn.replace('{bonus}', String(zone.wallBonus))}</span>
              </>
            ) : zone.status === 'next' ? (
              <>
                <span className={cx(styles.badge, styles.badgeBeyond)}>{o.next}</span>
                <span className="muted">{z.toGo.replace('{dp}', fmtNum(zone.dpToGo))}</span>
              </>
            ) : (
              <>
                <span className={cx(styles.badge, styles.badgeQuiet)}>{o.beyondTheWall}</span>
                <span className="muted">{z.registersAt.replace('{dp}', fmtNum(zone.threshold))}</span>
              </>
            )}
          </div>
          {zone.status === 'next' ? (
            <>
              <Meter value={view.pct} max={100} label="The wall's progress toward the next zone" tone="dp" text={`${view.pct}%`} />
              <p className={cx('muted', styles.note)}>{z.creep.replace('{name}', zone.name).replace('{dp}', fmtNum(zone.threshold))}</p>
            </>
          ) : null}

          <h3 className={styles.h4}>{z.facilities}</h3>
          <ul className={styles.facs}>
            {zone.facilities.map((f) => (
              <li key={f.id} className={cx(styles.fac, claimed ? styles.facOk : styles.facLock)}>
                <Icon src={claimed ? uiIcons.check : uiIcons.lock} size={16} className={styles.facIcon} />
                <span>
                  <b>{f.name}.</b> {claimed ? f.effect : z.opensWith.replace('{name}', zone.name)}
                </span>
              </li>
            ))}
          </ul>

          {zone.outposts.length > 0 ? (
            <>
              <h3 className={styles.h4}>{z.outpostsHere}</h3>
              <ul className={styles.facs}>
                {zone.outposts.map((op) => (
                  <li key={op.outpost.id}>
                    <button type="button" className={styles.linkRow} onClick={() => onOpenOutpost(op.outpost.id)}>
                      <Icon src={outpostIcons[op.outpost.type]} size={18} className={styles.linkIcon} />
                      <span>
                        <b>{op.outpost.name}</b> · {op.stateLabel}
                        {op.quiet ? ` · ${o.quiet}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h3 className={styles.h4}>{z.vignette}</h3>
          {claimed ? (
            <>
              <p className={styles.vig}>
                {replaying ? <Typewriter text={zone.vignette} speed={14} active={!reduced} onDone={() => undefined} /> : `${zone.vignette.split('. ')[0]}.`}
              </p>
              <div className={styles.actions}>
                <button type="button" className="btn btn--primary" disabled={replaying} onClick={() => setReplaying(true)}>
                  {z.replay}
                </button>
              </div>
            </>
          ) : (
            <p className={cx(styles.vig, 'muted')}>{z.placeholder}</p>
          )}
        </>
      ) : null}
    </MapSheet>
  );
}
