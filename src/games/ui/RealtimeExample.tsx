/**
 * The smallest real-time game: a dot crosses a canvas in 3 seconds of ticks.
 * It is the runnable version of CONTRACT.md "Real-time games" and is
 * exercised by realtime.test.tsx. Copy the pattern, not the file: in a real
 * game the engine (RealtimeExample.engine.ts) is `engine.ts` and this component is `Screen.tsx`.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { GameScreenProps } from '../contract';
import { dotEngine, type DotState } from './RealtimeExample.engine';
import { useCanvas, type CanvasSize } from './useCanvas';
import { useEngine } from './useEngine';
import { useFixedStep } from './useFixedStep';

/** A colour from the design tokens (src/styles/tokens.css), with a fallback when the token is missing. */
function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Draw the world at `x` (0..1). Pure drawing: no state changes here. */
function draw(canvas: HTMLCanvasElement | null, size: CanvasSize, x: number): void {
  const ctx = canvas?.getContext('2d');
  if (!ctx || size.width === 0) return;
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0); // draw in CSS pixels from here on
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = token('--color-accent-2', '#ffb84d');
  const r = Math.max(4, size.height / 6);
  ctx.fillRect(x * (size.width - 2 * r), size.height / 2 - r, 2 * r, 2 * r);
}

export function RealtimeExample(props: GameScreenProps) {
  const { state, dispatch, outcome, exit } = useEngine(dotEngine, props);
  const { ref, size } = useCanvas();
  // The last two states, for interpolation between ticks.
  const prev = useRef<DotState>(state);
  const cur = useRef<DotState>(state);
  useEffect(() => {
    prev.current = cur.current;
    cur.current = state;
  }, [state]);

  // 1. The clock: one tick per 50 ms while the game runs; paused on a hidden tab; stopped on unmount.
  // 2. onFrame(alpha): draw between the last two ticks. Reduced motion: no interpolation, draw the tick itself.
  const onFrame = useCallback(
    (alpha: number) => {
      const a = props.reducedMotion ? 1 : alpha;
      draw(ref.current, size, prev.current.x + (cur.current.x - prev.current.x) * a);
    },
    [ref, size, props.reducedMotion],
  );
  useFixedStep(() => dispatch({ type: 'tick' }), { running: outcome === null, onFrame });
  // 3. Also draw on every state or size change, so the final frame shows once the clock stops.
  useEffect(() => draw(ref.current, size, state.x), [ref, size, state]);

  return (
    <>
      <canvas ref={ref} style={{ display: 'block', width: '100%', aspectRatio: '4 / 1' }} role="img" aria-label={`Dot at ${Math.round(state.x * 100)}% of the way`} />
      <button type="button" className="btn" onClick={exit}>
        Leave
      </button>
    </>
  );
}
