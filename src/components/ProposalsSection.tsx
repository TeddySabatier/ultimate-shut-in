import type { CSSProperties } from 'react';
import { getHabit, openProposals, recurrenceLabel, resolveTemplate, strings, vassalName, type Proposal, type SaveFile } from '../game';
import { effortLabel } from '../utils/format';
import { SystemWindow } from './SystemWindow';
import styles from './ProposalsSection.module.css';

interface Props {
  save: SaveFile;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}

/** One line on what accepting would do: the new quest, or the change to an existing one. */
function summary(save: SaveFile, p: Proposal): string {
  if (p.action.type === 'create') {
    const d = p.action.draft;
    const parts = [effortLabel(d.kind, d.durationMin, d.targetCount)];
    if (d.recurrence !== 'once') parts.push(recurrenceLabel(d.recurrence, d.pinWeekday));
    return `${d.title} (${parts.join(', ')})`;
  }
  const t = resolveTemplate(save, p.action.templateId);
  const rec = p.action.patch.recurrence;
  return `${t?.title ?? 'Quest'}${rec ? ` (${recurrenceLabel(rec, p.action.patch.pinWeekday)})` : ''}`;
}

/**
 * "The Haven notices": up to three suggestions at the top of the Board, each
 * with its reason and two plain answers. Ignoring them is fine; they leave by
 * themselves after a week.
 */
export function ProposalsSection({ save, onAccept, onDismiss }: Props) {
  const open = openProposals(save);
  if (open.length === 0) return null;
  return (
    <SystemWindow title={strings.proposals.heading} tone="accent" aria-label={strings.proposals.heading}>
      <p className={styles.intro}>{strings.proposals.intro}</p>
      <ul className={styles.list}>
        {open.map((p) => (
          <li key={p.id} className={styles.card} style={{ '--habit': getHabit(p.habit).color } as CSSProperties} data-rule={p.rule}>
            <h3 className={styles.heading}>{p.title}</h3>
            <p className={styles.quest}>
              <span className={styles.meta}>{vassalName(p.habit)}: </span>
              {summary(save, p)}
            </p>
            <p className={styles.reason}>{p.reason}</p>
            {p.action.type === 'update' ? <p className={styles.meta}>{strings.proposals.updates}</p> : null}
            <div className={styles.actions}>
              <button type="button" className="btn" aria-label={`${strings.proposals.dismiss}: ${p.title}`} onClick={() => onDismiss(p.id)}>
                {strings.proposals.dismiss}
              </button>
              <button type="button" className="btn btn--primary" aria-label={`${strings.proposals.accept}: ${p.title}`} onClick={() => onAccept(p.id)}>
                {strings.proposals.accept}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </SystemWindow>
  );
}
