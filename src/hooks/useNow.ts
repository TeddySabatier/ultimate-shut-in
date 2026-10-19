import { useEffect, useState } from 'react';
import { now as clockNow } from '../state/clock';

/**
 * A `now()` (the app clock) that re-renders every `intervalMs` while `active`. Used for
 * live timer displays; the engine owns the timestamps, the UI only reads them.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => clockNow());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(clockNow()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
