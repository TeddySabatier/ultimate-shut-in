import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  activeCustomTemplates,
  customSlotsLeft,
  formatLine,
  getHabit,
  recurrenceLabel,
  strings,
  vassalName,
  type CustomTemplate,
  type SaveFile,
} from '../game';
import { habitIcons } from '../assets';
import { effortLabel } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { SystemWindow } from './SystemWindow';
import styles from './MyQuestsSection.module.css';

interface Props {
  save: SaveFile;
  onAddToday: (templateId: string) => void;
  onArchive: (templateId: string) => void;
}

const c = strings.compose;

/** The Ledger's "My quests": every active custom template with its stats, and the way to archive it. */
export function MyQuestsSection({ save, onAddToday, onArchive }: Props) {
  const [pending, setPending] = useState<CustomTemplate | null>(null);
  const templates = activeCustomTemplates(save);
  const slots = customSlotsLeft(save);
  const onBoardIds = new Set(save.board?.quests.map((q) => q.templateId) ?? []);

  return (
    <>
      <SystemWindow title={c.myQuests.title}>
        {templates.length === 0 ? (
          <p className="muted">
            {c.myQuests.empty} <Link to="/quests">Open the Board</Link>
          </p>
        ) : (
          <ul className={styles.list}>
            {templates.map((t) => {
              const habit = getHabit(t.habit);
              const onBoard = onBoardIds.has(t.id);
              const canAdd = !onBoard && slots > 0 && save.board !== null && save.settings.enabledHabits.includes(t.habit) && !save.vassals[t.habit].away;
              return (
                <li key={t.id} className={styles.item} style={{ '--habit': habit.color } as CSSProperties}>
                  <div className={styles.head}>
                    <Icon src={habitIcons[t.habit]} size={24} className={styles.icon} label={habit.label} />
                    <div className={styles.name}>
                      <h3 className={styles.title}>{t.title}</h3>
                      <p className={styles.meta}>
                        {vassalName(t.habit)} · {effortLabel(t.kind, t.durationMin, t.targetCount)} · {recurrenceLabel(t.recurrence, t.pinWeekday)} · Tier {t.tier}
                      </p>
                    </div>
                    <span className={styles.source}>{c.myQuests.sources[t.source]}</span>
                  </div>
                  <p className={styles.stats}>{formatLine(c.myQuests.stats, { issued: t.stats.issued, done: t.stats.done, tried: t.stats.tried })}</p>
                  <div className={styles.actions}>
                    {onBoard ? <span className={styles.onBoard}>{c.myQuests.onBoard}</span> : null}
                    {!onBoard ? (
                      <button type="button" className="btn btn--sm" disabled={!canAdd} aria-label={`${c.myQuests.addToday}: ${t.title}`} onClick={() => onAddToday(t.id)}>
                        {c.myQuests.addToday}
                      </button>
                    ) : null}
                    <button type="button" className="btn btn--sm" aria-label={`${c.myQuests.archive}: ${t.title}`} onClick={() => setPending(t)}>
                      {c.myQuests.archive}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SystemWindow>

      <ConfirmDialog
        open={pending !== null}
        title={c.myQuests.archiveTitle}
        confirmLabel={c.myQuests.archive}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) onArchive(pending.id);
          setPending(null);
        }}
      >
        <p>
          {pending ? `${pending.title}. ` : ''}
          {c.myQuests.archiveBody}
        </p>
      </ConfirmDialog>
    </>
  );
}
