import { useMemo } from 'react';
import { rerollPrice, strings } from '../game';
import { useGameStore, useSave } from '../state/gameStore';
import { anyTimerRunning, canUndoToday, msUntilReset, rewardPreview, seededLine, templateOf, todayIndex } from '../state/selectors';
import { useNow } from '../hooks/useNow';
import { hourLabel, roughDuration } from '../utils/format';
import { QuestCard, type QuestCardActions } from '../components/QuestCard';
import { SystemWindow } from '../components/SystemWindow';
import styles from './QuestsScreen.module.css';

export function QuestsScreen() {
  const save = useSave();
  const complete = useGameStore((s) => s.complete);
  const tryQuest = useGameStore((s) => s.tryQuest);
  const undo = useGameStore((s) => s.undo);
  const startTimer = useGameStore((s) => s.startTimer);
  const pauseTimer = useGameStore((s) => s.pauseTimer);
  const increment = useGameStore((s) => s.increment);
  const reroll = useGameStore((s) => s.reroll);
  const now = useNow(anyTimerRunning(save));

  const actions: QuestCardActions = useMemo(
    () => ({
      onComplete: complete,
      onTried: tryQuest,
      onUndo: undo,
      onStart: startTimer,
      onPause: pauseTimer,
      onIncrement: increment,
      onReroll: reroll,
    }),
    [complete, tryQuest, undo, startTimer, pauseTimer, increment, reroll],
  );

  const board = save.board;
  // A disabled habit's quests stay on the board but every action on them is refused; keep them off the screen.
  const quests = (board?.quests ?? []).filter((q) => save.settings.enabledHabits.includes(q.habit));
  const counts = { done: quests.filter((q) => q.status === 'done').length, total: quests.length };
  const allDone = quests.length > 0 && counts.done === quests.length;
  const canUndo = canUndoToday(save, now);
  const price = rerollPrice(save.player.ring);
  const rerollAvailable = board !== null && !board.rerolledToday && save.player.coins >= price;
  const ordered = [...quests].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));

  return (
    <>
      <h1>Today's board</h1>
      <p className={styles.boardMeta}>
        <span>
          {strings.difficulty[save.settings.difficulty].label} ·{' '}
          <span className="mono">
            {counts.done}/{counts.total}
          </span>{' '}
          done
        </span>
        <span className="muted">
          {strings.ui.resetHour} {hourLabel(save.settings.resetHour)} · resets in {roughDuration(msUntilReset(save, now))}
        </span>
      </p>

      {quests.length === 0 ? (
        <SystemWindow title="Board">
          <p>No quests are posted. The board fills at the next reset.</p>
        </SystemWindow>
      ) : null}

      {allDone ? (
        <SystemWindow title="All settled" tone="success">
          <p>{seededLine(strings.encouragement, `done:${todayIndex(save, now)}`)}</p>
          <p className="muted">Nothing more is asked today. The Haven keeps.</p>
        </SystemWindow>
      ) : null}

      <div className={styles.list}>
        {ordered.map((q) => {
          const t = templateOf(q);
          if (!t || !board) return null;
          return (
            <QuestCard
              key={q.instanceId}
              quest={q}
              template={t}
              bonus={board.bonusId === q.instanceId}
              preview={rewardPreview(save, q)}
              now={now}
              canUndo={canUndo}
              rerollAvailable={rerollAvailable}
              rerollPrice={price}
              {...actions}
            />
          );
        })}
      </div>

      {board && board.rerolledToday ? <p className={`muted ${styles.note}`}>One quest was swapped today. Tomorrow's board allows another.</p> : null}
    </>
  );
}
