import { useId, useState } from 'react';
import { getHabit, outpostStates, strings, vassalName } from '../../game';
import { uiIcons } from '../../assets';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { Meter } from '../../components/Meter';
import type { OutpostView } from '../../state/mapView';
import { cx } from '../../utils/cx';
import { MapSheet } from './MapSheet';
import { habitsText } from './text';
import styles from './sheets.module.css';

const o = strings.map.outposts;

interface OutpostSheetProps {
  view: OutpostView | null;
  onClose: () => void;
  onVisit: (id: string) => void;
  onUndoVisit: (id: string) => void;
  onEdit: (id: string) => void;
  onRetire: (id: string) => void;
}

function aOrAn(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}


/** The outpost sheet (CITY-MAP 3): state ladder, progress, perks, related vassals and the check-in. */
export function OutpostSheet({ view, onClose, onVisit, onUndoVisit, onEdit, onRetire }: OutpostSheetProps) {
  const titleId = useId();
  const [confirmRetire, setConfirmRetire] = useState(false);
  const op = view?.outpost ?? null;
  const reaching = view !== null && (view.state === 'corridor' || view.state === 'stronghold');
  const habits = op?.habits ?? [];
  const first = getHabit((habits[0] ?? 'move') as never).label;
  // Rungs and perks follow `view.state` (the peak, which never drops), the field the engine reads, not today's visit count.
  const peakAt = view ? outpostStates.findIndex((st) => st.id === view.state) : -1;
  return (
    <>
      <MapSheet open={view !== null} kick={`${o.kick} · ${view?.type.label ?? ''}`} title={op?.name ?? ''} titleId={titleId} onClose={onClose}>
        {view && op ? (
          <>
            <div className={styles.statusLine}>
              <span className={cx(styles.badge, styles[`badge-${view.state}`])}>{view.stateLabel}</span>
              {view.quiet ? <span className={cx(styles.badge, styles.badgeQuiet)}>{o.quiet}</span> : null}
              {view.beyond ? <span className={cx(styles.badge, styles.badgeBeyond)}>{o.beyondTheWall}</span> : null}
              <span className="muted">
                Zone {view.zone} · {view.zoneName}
              </span>
            </div>
            {op.note ? <p className={styles.noteQuote}>"{op.note}"</p> : null}
            <ol className={styles.ladder} aria-label="States">
              {outpostStates.map((st, i) => (
                <li key={st.id} className={cx(styles.rung, i <= peakAt && styles.rungOn, st.id === view.state && styles.rungCur)}>
                  <b className="mono">{st.minVisits}</b>
                  {st.label}
                </li>
              ))}
            </ol>
            {view.next ? (
              <>
                <Meter value={op.visits} max={view.next.minVisits} label="Visits toward the next state" tone="xp" text={`${op.visits} / ${view.next.minVisits}`} />
                <p className={cx('muted', styles.note)}>
                  {o.toNext
                    .replace('{n}', String(view.next.minVisits - op.visits))
                    .replace('{s}', view.next.minVisits - op.visits === 1 ? '' : 's')
                    .replace('{state}', view.next.label)}{' '}
                  {view.lastVisitText}.
                </p>
              </>
            ) : (
              <p className={cx('muted', styles.note)}>
                {o.strongholdLine.replace('{visits}', String(op.visits))} {view.lastVisitText}.
              </p>
            )}
            {view.quiet ? <p>{o.quietLine.replace('{name}', op.name)}</p> : view.outsideWall ? <p>{reaching ? o.beyondCorridor : o.beyondLine}</p> : null}

            <h3 className={styles.h4}>{o.gives}</h3>
            <ul className={styles.facs}>
              <Perk on={peakAt >= 1} name="Scouted" text={o.perkScouted.replace('{aHabits}', `${aOrAn(first)} ${habitsText(habits, ' or ')}`).replace('{discount}', '5')} />
              <Perk on={peakAt >= 2} name="Corridor" text={o.perkCorridor.replace('{habits}', habitsText(habits))} />
              <Perk on={peakAt >= 3} name="Stronghold" text={o.perkStronghold} />
            </ul>
            <p className={cx('muted', styles.note)}>{o.related.replace('{who}', habits.map((h) => `${vassalName(h as never)} (${getHabit(h as never).label})`).join(', '))}</p>

            <div className={styles.actions}>
              <button type="button" className="btn btn--primary" disabled={view.loggedToday} onClick={() => onVisit(op.id)}>
                <Icon src={uiIcons.check} size={16} /> {view.loggedToday ? o.loggedToday : o.visitToday}
              </button>
              {view.canUndoToday ? (
                <button type="button" className="btn" onClick={() => onUndoVisit(op.id)}>
                  {o.undoVisit}
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={() => onEdit(op.id)}>
                {o.edit}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmRetire(true)}>
                {o.retire}
              </button>
            </div>
          </>
        ) : null}
      </MapSheet>
      <ConfirmDialog
        open={confirmRetire && op !== null}
        title={o.retireTitle.replace('{name}', op?.name ?? '')}
        confirmLabel={o.retire}
        onCancel={() => setConfirmRetire(false)}
        onConfirm={() => {
          setConfirmRetire(false);
          if (op) onRetire(op.id);
        }}
      >
        <p>{o.retireBody}</p>
      </ConfirmDialog>
    </>
  );
}

function Perk({ on, name, text }: { on: boolean; name: string; text: string }) {
  return (
    <li className={cx(styles.fac, on ? styles.facOk : styles.facLock)}>
      <Icon src={on ? uiIcons.check : uiIcons.lock} size={16} className={styles.facIcon} />
      <span>
        <b>{name}.</b> {text}
      </span>
    </li>
  );
}
