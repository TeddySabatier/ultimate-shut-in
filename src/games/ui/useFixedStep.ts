/**
 * The clock of a real-time game: calls `onTick` once per `dtMs` of real time
 * (default `FIXED_DT_MS`, 50 ms) while `running`, driven by
 * requestAnimationFrame. The engine never reads a clock: the Screen
 * dispatches `{ type: 'tick' }` from here, so a game is the same sequence of
 * ticks however fast the device is.
 *
 *   useFixedStep(() => dispatch({ type: 'tick' }), { running: outcome === null });
 *
 * - A hidden tab pauses the game; coming back resumes it without a catch-up burst.
 * - A slow frame catches up at most `maxTicksPerFrame` ticks (default 5).
 * - Unmounting, or `running` turning false, cancels the frame loop.
 * - Reduced motion changes what is drawn, never the speed of the game.
 */
import { useEffect, useRef } from 'react';
import { FIXED_DT_MS } from '../contract';

export interface FixedStepOptions {
  running: boolean;
  dtMs?: number;
  maxTicksPerFrame?: number;
}

export function useFixedStep(onTick: () => void, { running, dtMs = FIXED_DT_MS, maxTicksPerFrame = 5 }: FixedStepOptions): void {
  const tick = useRef(onTick);
  useEffect(() => {
    tick.current = onTick;
  });

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last: number | null = null;
    let acc = 0;
    const frame = (t: number) => {
      if (last === null || document.hidden) {
        last = document.hidden ? null : t;
      } else {
        acc += Math.min(t - last, dtMs * maxTicksPerFrame);
        last = t;
        while (acc >= dtMs) {
          acc -= dtMs;
          tick.current();
        }
      }
      raf = requestAnimationFrame(frame);
    };
    // Hidden tab: forget the last frame time, so the time spent away is not replayed.
    const onVisibility = () => {
      last = null;
      acc = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, dtMs, maxTicksPerFrame]);
}
