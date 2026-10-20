import { useCallback, useState } from 'react';
import { strings } from '../../game';
import { useGameStore } from '../../state/gameStore';

/**
 * The line an Arena panel shows (in an `aria-live` region) after one of its
 * actions: the success line it chose, or the store's warm refusal notice,
 * taken over from the global toast so it is said once, next to the button.
 */
export function useArenaFeedback(): { message: string | null; report: (accepted: boolean, success: string | null) => void } {
  const clearNotice = useGameStore((s) => s.clearNotice);
  const [message, setMessage] = useState<string | null>(null);
  const report = useCallback(
    (accepted: boolean, success: string | null) => {
      if (accepted) {
        setMessage(success);
        return;
      }
      const notice = useGameStore.getState().notice;
      clearNotice();
      setMessage(notice ?? strings.arena.ui.failed);
    },
    [clearNotice],
  );
  return { message, report };
}
