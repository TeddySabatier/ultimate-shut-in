/**
 * The smallest real-time game: a dot crosses a canvas in 3 seconds of ticks.
 * It is the runnable version of CONTRACT.md "Real-time games" and is
 * exercised by realtime.test.tsx. Copy the pattern, not the file: in a real
 * game the engine (RealtimeExample.engine.ts) is `engine.ts` and this component is `Screen.tsx`.
 */
import { useEffect } from 'react';
import type { GameScreenProps } from '../contract';
import { dotEngine } from './RealtimeExample.engine';
import { useCanvas } from './useCanvas';
import { useEngine } from './useEngine';
import { useFixedStep } from './useFixedStep';

export function RealtimeExample(props: GameScreenProps) {
  const { state, dispatch, outcome } = useEngine(dotEngine, props);
  // 1. The clock: one tick per 50 ms while the game runs; paused on a hidden tab; stopped on unmount.
  useFixedStep(() => dispatch({ type: 'tick' }), { running: outcome === null });
  // 2. The canvas: backing store follows CSS size times the device pixel ratio.
  const { ref, size } = useCanvas();
  // 3. Draw whenever the state or the size changes (no animation of its own: reduced motion just snaps).
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || size.width === 0) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#ffb84d';
    const r = Math.max(4, size.height / 6);
    ctx.fillRect(state.x * (size.width - 2 * r), size.height / 2 - r, 2 * r, 2 * r);
  }, [ref, state, size]);

  return (
    <canvas
      ref={ref}
      style={{ display: 'block', width: '100%', aspectRatio: '4 / 1' }}
      role="img"
      aria-label={`Dot at ${Math.round(state.x * 100)}% of the way`}
      data-reduced-motion={props.reducedMotion}
    />
  );
}
