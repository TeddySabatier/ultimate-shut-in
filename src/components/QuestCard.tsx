import { useId, type CSSProperties } from 'react';
import { formatLine, getHabit, strings, timerElapsedMs, type BoardQuest, type QuestRewards, type QuestTemplate } from '../game';
import { habitIcons, uiIcons } from '../assets';
import { cx } from '../utils/cx';
import { mmss } from '../utils/format';
import { Icon } from './Icon';
import { RewardChips, TierPips } from './Chips';
import styles from './QuestCard.module.css';

export interface QuestCardActions {
  onComplete: (id: string) => void;
  onTried: (id: string) => void;
  onUndo: (id: string) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onIncrement: (id: string, delta: number) => void;
  onReroll: (id: string) => void;
}

interface QuestCardProps extends QuestCardActions {
  quest: BoardQuest;
  template: QuestTemplate;
  bonus: boolean;
  /** Rewards if settled now (null when unavailable). */
  preview: QuestRewards | null;
  /** Current time from `useNow`; drives the live timer display. */
  now: number;
  canUndo: boolean;
  rerollAvailable: boolean;
  rerollPrice: number;
}

/** One board entry with its kind-specific controls. Presentational: all rules come from props. */
export function QuestCard({
  quest,
  template,
  bonus,
  preview,
  now,
  canUndo,
  rerollAvailable,
  rerollPrice,
  onComplete,
  onTried,
  onUndo,
  onStart,
  onPause,
  onIncrement,
  onReroll,
}: QuestCardProps) {
  const id = useId();
  const habit = getHabit(quest.habit);
  const done = quest.status === 'done';
  const running = quest.timer !== null && quest.timer.startedAt !== null;
  const elapsed = timerElapsedMs(quest, now);
  const neededMs = (template.durationMin ?? 0) * 60_000;
  const timedReady = neededMs > 0 && elapsed >= neededMs;
  const target = template.targetCount ?? 1;
  const vars = { '--habit': habit.color } as CSSProperties;
  // The player's own quests are never swapped for a shipped one.
  const isCustom = template.tags.includes('custom');

  return (
    <article
      className={cx(styles.card, done && styles.done, bonus && styles.bonusCard)}
      style={vars}
      aria-labelledby={`${id}-title`}
      data-status={quest.status}
      data-kind={quest.kind}
    >
      <header className={styles.head}>
        <Icon src={habitIcons[quest.habit]} size={28} className={styles.habitIcon} label={habit.label} />
        <div className={styles.heading}>
          <h3 id={`${id}-title`} className={styles.title}>
            {template.title}
          </h3>
          <div className={styles.meta}>
            <span className={styles.vassal}>{habit.vassal.name}</span>
            <TierPips tier={template.tier} />
            {bonus ? <span className={styles.bonus}>Bonus x2</span> : null}
            {isCustom ? <span className={styles.tag}>Mine</span> : null}
            {quest.status === 'tried' ? <span className={styles.tag}>Attempted</span> : null}
            {done ? <span className={cx(styles.tag, styles.settled)}>Settled</span> : null}
          </div>
        </div>
      </header>

      <p className={styles.desc}>{template.description}</p>

      {done && quest.rewards ? (
        <RewardChips {...quest.rewards} timedBonus={quest.timedBonus} className={styles.rewards} />
      ) : preview ? (
        <RewardChips xp={preview.xp} coins={preview.coins} dp={preview.dp} className={styles.rewards} />
      ) : null}

      {!done && quest.kind === 'check' ? (
        <div className={styles.controls}>
          <button type="button" className="btn btn--primary" onClick={() => onComplete(quest.instanceId)}>
            <Icon src={uiIcons.check} size={16} /> {strings.ui.complete}
          </button>
        </div>
      ) : null}

      {!done && quest.kind === 'timer' ? (
        <div className={styles.timerBlock}>
          <div className={styles.controls}>
            <span className={cx('mono', styles.clock)} data-running={running ? 'true' : 'false'}>
              <Icon src={uiIcons.timer} size={16} />
              <span aria-label="Elapsed">{mmss(elapsed)}</span>
              <span className="muted"> / {mmss(neededMs)}</span>
            </span>
            <button type="button" className="btn" onClick={() => (running ? onPause(quest.instanceId) : onStart(quest.instanceId))}>
              {running ? strings.ui.stopTimer : elapsed > 0 ? 'Resume' : strings.ui.startTimer}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => onComplete(quest.instanceId)}>
              <Icon src={uiIcons.check} size={16} /> {strings.ui.complete}
            </button>
          </div>
          <p className={cx(styles.hint, timedReady && styles.hintReady)}>
            {timedReady ? 'Timed bonus earned: +10% XP.' : `Run the full ${template.durationMin ?? 0} min for +10% XP. Done works any time.`}
          </p>
        </div>
      ) : null}

      {!done && quest.kind === 'count' ? (
        <div className={styles.controls}>
          <div className={styles.stepper} role="group" aria-label="Count">
            <button type="button" className="btn" aria-label="Decrease count" onClick={() => onIncrement(quest.instanceId, -1)} disabled={quest.count <= 0}>
              -
            </button>
            <span className={cx('mono', styles.count)} aria-live="polite">
              {quest.count} / {target}
            </span>
            <button type="button" className="btn" aria-label="Increase count" onClick={() => onIncrement(quest.instanceId, 1)}>
              +
            </button>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => onComplete(quest.instanceId)}>
            <Icon src={uiIcons.check} size={16} /> {strings.ui.complete}
          </button>
        </div>
      ) : null}

      <footer className={styles.foot}>
        {done ? (
          canUndo ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onUndo(quest.instanceId)}>
              {strings.ui.undo}
            </button>
          ) : (
            <span className="muted">Settled for the day.</span>
          )
        ) : (
          <>
            {quest.status === 'open' ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onTried(quest.instanceId)}>
                I tried
              </button>
            ) : null}
            {rerollAvailable && quest.status === 'open' && !isCustom ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onReroll(quest.instanceId)}>
                {formatLine(strings.ui.reroll, { coins: rerollPrice })}
              </button>
            ) : null}
          </>
        )}
      </footer>
    </article>
  );
}
