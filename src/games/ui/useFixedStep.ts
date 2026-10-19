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
 * - `onFrame(alpha)` runs once per animation frame after the ticks, with
 *   `alpha` in [0, 1): how far real time is between the last tick and the
 *   next. Draw `previous + (current - previous) * alpha` for smooth motion
 *   at 60 fps from a 20 Hz game. It never changes the state.
 * - The tick is always `FIXED_DT_MS` (50 ms) for game time. Pass another
 *   `dtMs` only for a coarse clock, such as a once-per-second `second`
 *   action in a time-scored turn-based game.
 */
import { useEffect, useRef } from 'react';
import { FIXED_DT_MS } from '../contract';

export interface FixedStepOptions {
  running: boolean;
  dtMs?: number;
  maxTicksPerFrame?: number;
  /** Called every animation frame while running, after the ticks, with the interpolation factor. */
  onFrame?: (alpha: number) => void;
}

export function useFixedStep(onTick: () => void, { running, dtMs = FIXED_DT_MS, maxTicksPerFrame = 5, onFrame }: FixedStepOptions): void {
  const tick = useRef(onTick);
  const frameCb = useRef(onFrame);
  useEffect(() => {
    tick.current = onTick;
    frameCb.current = onFrame;
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
      frameCb.current?.(Math.min(0.999, acc / dtMs));
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
