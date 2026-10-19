/**
 * A crisp, responsive `<canvas>` for real-time games. The canvas takes its
 * CSS size from the layout (give it `width: 100%` and an `aspect-ratio`);
 * this hook keeps its backing store at CSS size times the device pixel ratio
 * and re-measures on resize.
 *
 *   const { ref, size } = useCanvas();
 *   useEffect(() => {
 *     const ctx = ref.current?.getContext('2d');
 *     if (!ctx || size.width === 0) return;
 *     ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0); // draw in CSS pixels
 *     ...
 *   }, [state, size]);
 *   return <canvas ref={ref} className={styles.canvas} role="img" aria-label={...} />;
 */
import { useEffect, useRef, useState, type RefObject } from 'react';

export interface CanvasSize {
  /** CSS pixels. */
  width: number;
  height: number;
  /** Device pixel ratio the backing store uses (capped at 3). */
  dpr: number;
}

export function useCanvas(): { ref: RefObject<HTMLCanvasElement>; size: CanvasSize } {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      // Resizing the backing store clears it; only do it when something changed.
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      setSize((s) => (s.width === width && s.height === height && s.dpr === dpr ? s : { width, height, dpr }));
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(canvas);
      // A zoom changes the pixel ratio without resizing the element.
      window.addEventListener('resize', measure);
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', measure);
      };
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return { ref, size };
}
