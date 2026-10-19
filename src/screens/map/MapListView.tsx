import { strings } from '../../game';
import { outpostIcons } from '../../assets';
import { Icon } from '../../components/Icon';
import type { MapView } from '../../state/mapView';
import { cx } from '../../utils/cx';
import { fmtNum } from '../../utils/format';
import styles from './MapListView.module.css';

const l = strings.map.list;
const z = strings.map.zone;

interface MapListViewProps {
  view: MapView;
  onZone: (zone: number) => void;
  onOutpost: (id: string) => void;
}

/** The list alternative to the map (CITY-MAP 5.3): seven zone rows, each followed by its outposts. */
export function MapListView({ view, onZone, onOutpost }: MapListViewProps) {
  return (
    <ul className={styles.zones} aria-label={l.label}>
      {view.zones.map((zone) => (
        <li key={zone.id}>
          <button type="button" className={cx(styles.zrow, zone.status === 'claimed' && styles.claimed, zone.status === 'current' && styles.current)} onClick={() => onZone(zone.id)}>
            <span className={styles.no} aria-hidden="true">
              {zone.id}
            </span>
            <span className={styles.name}>
              {zone.name}
              <span className={styles.sub}>{zone.id === 1 ? z.haven : z.registersAt.replace('{dp}', fmtNum(zone.threshold))}</span>
            </span>
            <span className={styles.status}>
              {zone.status === 'claimed' ? l.claimed : zone.status === 'current' ? l.current : zone.status === 'next' ? l.toGo.replace('{dp}', fmtNum(zone.dpToGo)) : l.beyond}
            </span>
          </button>
          {zone.outposts.length > 0 ? (
            <ul className={styles.ops}>
              {zone.outposts.map((op) => (
                <li key={op.outpost.id}>
                  <button type="button" className={styles.op} onClick={() => onOutpost(op.outpost.id)}>
                    <Icon src={outpostIcons[op.outpost.type]} size={18} className={styles.opIcon} />
                    <span className={styles.opText}>
                      {op.outpost.name}{' '}
                      <span className="muted">
                        · {op.stateLabel}
                        {op.quiet ? ` · ${strings.map.outposts.quiet}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
