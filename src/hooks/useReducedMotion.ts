import { useEffect, useState } from 'react';
import { useGameStore } from '../state/gameStore';

const QUERY = '(prefers-reduced-motion: reduce)';

function systemPrefersReduced(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

/** True when the player's setting or the OS asks for reduced motion. */
export function useReducedMotion(): boolean {
  const setting = useGameStore((s) => s.save?.settings.reducedMotion ?? false);
  const [system, setSystem] = useState(systemPrefersReduced);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setSystem(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  return setting || system;
}

/** Mirrors the reduced-motion state onto `<html data-reduced-motion>` for CSS. */
export function useReducedMotionAttribute(): void {
  const reduced = useReducedMotion();
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false';
  }, [reduced]);
}
