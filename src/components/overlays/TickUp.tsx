import { useEffect, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { fmtNum } from '../../utils/format';

interface TickUpProps {
  value: number;
  /** Animation length in ms. */
  duration?: number;
  prefix?: string;
}

/** Counts a number up from 0 on mount; shows the final value at once under reduced motion. */
export function TickUp({ value, duration = 550, prefix = '' }: TickUpProps) {
  const reduced = useReducedMotion();
  const canAnimate = !reduced && typeof requestAnimationFrame === 'function';
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!canAnimate) return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, canAnimate]);

  const shown = canAnimate ? Math.round(value * progress) : value;
  return (
    <span className="mono" aria-label={`${prefix}${fmtNum(value)}`}>
      {prefix}
      {fmtNum(shown)}
    </span>
  );
}
