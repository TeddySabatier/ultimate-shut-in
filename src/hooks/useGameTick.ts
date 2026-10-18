import { useEffect } from 'react';
import { useGameStore } from '../state/gameStore';

const INTERVAL_MS = 60_000;

/**
 * Runs the engine's boundary processing on mount, whenever the tab becomes
 * visible again, and once a minute while visible.
 */
export function useGameTick(): void {
  const tick = useGameStore((s) => s.tick);

  useEffect(() => {
    tick();
    let id: number | null = null;
    const start = () => {
      if (id === null) id = window.setInterval(tick, INTERVAL_MS);
    };
    const stop = () => {
      if (id !== null) {
        window.clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tick]);
}
