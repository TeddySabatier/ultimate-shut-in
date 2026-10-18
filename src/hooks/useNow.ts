import { useEffect, useState } from 'react';

/**
 * A `Date.now()` that re-renders every `intervalMs` while `active`. Used for
 * live timer displays; the engine owns the timestamps, the UI only reads them.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
