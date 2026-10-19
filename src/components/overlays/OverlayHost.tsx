import { useCallback } from 'react';
import { useGameStore } from '../../state/gameStore';
import { monsterForRecord } from '../../state/selectors';
import { RewardChips } from '../Chips';
import { WhereWereYou } from './WhereWereYou';
import { eventKey, toastCopy } from './eventText';
import { LevelUpWindow } from './LevelUpWindow';
import { RingUnlockWindow } from './RingUnlockWindow';
import { Toast } from './Toast';
import { VassalWindow } from './VassalWindow';
import { WaveResultWindow } from './WaveResultWindow';

/**
 * Presents `pendingEvents` one at a time (plus any refusal notice). Small
 * events become toasts; level-ups, ring unlocks, waves and vassal moves get
 * a full system window. Everything dismisses by tap, Enter or Escape.
 */
export function OverlayHost() {
  const event = useGameStore((s) => s.pendingEvents[0]);
  const notice = useGameStore((s) => s.notice);
  const save = useGameStore((s) => s.save);
  const dismissEvent = useGameStore((s) => s.dismissEvent);
  const clearNotice = useGameStore((s) => s.clearNotice);
  const reRecruit = useGameStore((s) => s.reRecruit);
  const dismiss = useCallback(() => dismissEvent(), [dismissEvent]);

  if (notice !== null) {
    return <Toast key={`notice:${notice}`} title="Protocol" line={notice} tone="danger" onDismiss={clearNotice} />;
  }
  if (!event || !save) return null;
  const key = eventKey(event);

  switch (event.type) {
    case 'levelUp':
      return <LevelUpWindow key={key} level={event.level} onDismiss={dismiss} />;
    case 'ringUnlocked':
      return <RingUnlockWindow key={key} ring={event.ring} onDismiss={dismiss} />;
    case 'waveSettled':
      return <WaveResultWindow key={key} record={event.record} monster={monsterForRecord(save, event.record.index)} onDismiss={dismiss} />;
    case 'vassalLeft':
      return <VassalWindow key={key} habit={event.habit} kind="left" onDismiss={dismiss} onReRecruit={reRecruit} />;
    case 'vassalReturned':
      return <VassalWindow key={key} habit={event.habit} kind="returned" onDismiss={dismiss} />;
    default: {
      const copy = toastCopy(save, event);
      if (!copy) {
        // Not presentable: drop it without blocking the queue.
        dismiss();
        return null;
      }
      const where = event.type === 'questDone' ? <WhereWereYou save={save} instanceId={event.instanceId} habit={event.habit} onDone={dismiss} /> : null;
      return (
        <Toast key={key} title={copy.title} line={copy.line} tone={copy.tone} onDismiss={dismiss} autoMs={where ? 9000 : undefined}>
          {event.type === 'questDone' ? (
            <RewardChips
              xp={event.rewards.xp}
              coins={event.rewards.coins}
              dp={event.rewards.dp}
              loyalty={event.rewards.loyalty}
              timedBonus={event.timedBonus}
              animate
            />
          ) : null}
          {where}
        </Toast>
      );
    }
  }
}
