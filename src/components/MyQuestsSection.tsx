import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  MAX_ACTIVE_CUSTOM,
  activeCustomTemplates,
  customSlotsLeft,
  customTitleTaken,
  findOutpost,
  formatLine,
  getHabit,
  recurrenceLabel,
  strings,
  vassalName,
  type CustomTemplate,
  type SaveFile,
} from '../game';
import { habitIcons } from '../assets';
import { ComposeQuestSheet } from '../screens/ComposeQuestSheet';
import { useGameStore } from '../state/gameStore';
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

/** The facts of one template, shared by an active and an archived row. */
function Facts({ save, t }: { save: SaveFile; t: CustomTemplate }) {
  const habit = getHabit(t.habit);
  const outpost = t.outpostId ? findOutpost(save, t.outpostId) : undefined;
  return (
    <>
      <div className={styles.head}>
        <Icon src={habitIcons[t.habit]} size={24} className={styles.icon} label={habit.label} />
        <div className={styles.name}>
          <h3 className={styles.title}>{t.title}</h3>
          <p className={styles.meta}>
            {vassalName(t.habit)} · {effortLabel(t.kind, t.durationMin, t.targetCount)} · {recurrenceLabel(t.recurrence, t.pinWeekday)} · Tier {t.tier}
            {outpost ? ` · ${formatLine(c.whereAt, { name: outpost.name })}` : ''}
          </p>
        </div>
        <span className={styles.source}>{c.myQuests.sources[t.source]}</span>
      </div>
      <p className={styles.stats}>{formatLine(c.myQuests.stats, { issued: t.stats.issued, done: t.stats.done, tried: t.stats.tried })}</p>
    </>
  );
}

/**
 * The Ledger's "My quests": every active custom template with its stats and
 * the ways to add it to today, edit it (the Compose sheet, prefilled) or
 * archive it; archived ones wait under a collapsed group with Restore.
 */
export function MyQuestsSection({ save, onAddToday, onArchive }: Props) {
  const restoreCustom = useGameStore((s) => s.restoreCustom);
  const [pending, setPending] = useState<CustomTemplate | null>(null);
  const [editing, setEditing] = useState<CustomTemplate | null>(null);
  // The restored row leaves the Archived group, so the keyboard follows it to its Edit button.
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (restored.current === null) return;
    document.getElementById(`my-edit-${restored.current}`)?.focus();
    restored.current = null;
  });
  const templates = activeCustomTemplates(save);
  const archived = save.customTemplates.filter((t) => t.archivedAt !== undefined).sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
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
              const onBoard = onBoardIds.has(t.id);
              const canAdd = !onBoard && slots > 0 && save.board !== null && save.settings.enabledHabits.includes(t.habit) && !save.vassals[t.habit].away;
              return (
                <li key={t.id} className={styles.item} style={{ '--habit': getHabit(t.habit).color } as CSSProperties}>
                  <Facts save={save} t={t} />
                  <div className={styles.actions}>
                    {onBoard ? <span className={styles.onBoard}>{c.myQuests.onBoard}</span> : null}
                    {!onBoard ? (
                      <button type="button" className="btn btn--sm" disabled={!canAdd} aria-label={`${c.myQuests.addToday}: ${t.title}`} onClick={() => onAddToday(t.id)}>
                        {c.myQuests.addToday}
                      </button>
                    ) : null}
                    <button type="button" id={`my-edit-${t.id}`} className="btn btn--sm" aria-label={`${c.myQuests.edit}: ${t.title}`} onClick={() => setEditing(t)}>
                      {c.myQuests.edit}
                    </button>
                    <button type="button" className="btn btn--sm" aria-label={`${c.myQuests.archive}: ${t.title}`} onClick={() => setPending(t)}>
                      {c.myQuests.archive}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {archived.length > 0 ? (
          <details className={styles.archived}>
            <summary className={styles.summary}>
              {c.myQuests.archivedGroup} ({archived.length})
            </summary>
            <p className={styles.hint}>{c.myQuests.archivedHint}</p>
            <ul className={styles.list} aria-label={c.myQuests.archivedGroup}>
              {archived.map((t) => {
                const nameTaken = customTitleTaken(save, t.habit, t.title);
                const full = templates.length >= MAX_ACTIVE_CUSTOM;
                const why = nameTaken ? formatLine(c.myQuests.restoreNameTaken, { title: t.title }) : full ? c.myQuests.restoreFull : null;
                return (
                  <li key={t.id} className={`${styles.item} ${styles.past}`} style={{ '--habit': getHabit(t.habit).color } as CSSProperties}>
                    <Facts save={save} t={t} />
                    {why ? (
                      <p id={`why-${t.id}`} className={styles.stats}>
                        {why}
                      </p>
                    ) : null}
                    <div className={styles.actions}>
                      <button type="button" className="btn btn--sm" disabled={why !== null} aria-describedby={why ? `why-${t.id}` : undefined} aria-label={`${c.myQuests.restore}: ${t.title}`} onClick={() => { restoreCustom(t.id); restored.current = t.id; }}>
                        {c.myQuests.restore}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </SystemWindow>

      <ComposeQuestSheet open={editing !== null} template={editing} onClose={() => setEditing(null)} />

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
