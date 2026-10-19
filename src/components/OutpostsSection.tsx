import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getOutpostState, getOutpostType, strings, type Outpost, type SaveFile } from '../game';
import { outpostIcons } from '../assets';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { SystemWindow } from './SystemWindow';
import styles from './OutpostsSection.module.css';

interface Props {
  save: SaveFile;
  now: number;
  onRestore: (id: string) => void;
  onForget: (id: string) => void;
}

const m = strings.map.outposts;

/**
 * The Ledger's "Outposts": every place on the map with its visits, and the
 * retired ones with *Restore* and the two-step *Forget* (CITY-MAP 3.5).
 * Forget exists for privacy and is never suggested.
 */
export function OutpostsSection({ save, onRestore, onForget }: Props) {
  const [forgetting, setForgetting] = useState<Outpost | null>(null);
  const active = save.map.outposts.filter((o) => !o.retired);
  const retired = save.map.outposts.filter((o) => o.retired);
  return (
    <>
      <SystemWindow title={m.ledgerTitle}>
        {active.length === 0 ? (
          <p className="muted">
            {m.ledgerEmpty}{' '}
            <Link to="/map" className={styles.mapLink}>
              {m.ledgerLink}
            </Link>
          </p>
        ) : (
          <ul className={styles.list}>
            {active.map((o) => (
              <li key={o.id} className={styles.item}>
                <Icon src={outpostIcons[o.type]} size={20} className={styles.icon} />
                <span className={styles.text}>
                  <span className={styles.name}>{o.name}</span>
                  <span className={`muted ${styles.meta}`}>
                    {getOutpostType(o.type).label} · {getOutpostState(o.peak).label} · {m.visitsAll.replace('{visits}', String(o.visits))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <h3 className={styles.subhead}>{m.retiredSection}</h3>
        {retired.length === 0 ? (
          <p className="muted">{m.retiredEmpty}</p>
        ) : (
          <ul className={styles.list}>
            {retired.map((o) => (
              <li key={o.id} className={styles.item}>
                <Icon src={outpostIcons[o.type]} size={20} className={styles.icon} />
                <span className={styles.text}>
                  <span className={styles.name}>{o.name}</span>
                  <span className={`muted ${styles.meta}`}>
                    {getOutpostType(o.type).label} · {getOutpostState(o.peak).label} · {m.visitsAll.replace('{visits}', String(o.visits))}
                  </span>
                </span>
                <span className={styles.actions}>
                  <button type="button" className="btn btn--sm" aria-label={`${m.restore}: ${o.name}`} onClick={() => onRestore(o.id)}>
                    {m.restore}
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" aria-label={`${m.forget}: ${o.name}`} onClick={() => setForgetting(o)}>
                    {m.forget}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SystemWindow>
      <ConfirmDialog
        open={forgetting !== null}
        title={m.forgetTitle.replace('{name}', forgetting?.name ?? '')}
        confirmLabel={m.forget}
        confirmText={m.forget.toUpperCase()}
        danger
        onCancel={() => setForgetting(null)}
        onConfirm={() => {
          if (forgetting) onForget(forgetting.id);
          setForgetting(null);
        }}
      >
        <p>{m.forgetBody}</p>
      </ConfirmDialog>
    </>
  );
}
