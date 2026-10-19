/**
 * Debug hook for end-to-end tests and manual time travel. Installed only in
 * dev builds or when `localStorage['haven.debug'] === '1'`; production users
 * never see it unless they opt in. Exposes `window.__haven`.
 */
import { useGameStore } from './gameStore';
import { getNowOffsetMs, now, setNowOffsetMs } from './clock';
import type { SaveFile } from '../game';
import { listGames, validateRegistry } from '../games/registry';

export interface HavenDebug {
  getSave: () => SaveFile | null;
  getNow: () => number;
  getNowOffsetMs: () => number;
  /** Shift the app clock, then run a tick so boundaries are processed. */
  setNowOffsetMs: (ms: number) => void;
  tick: () => void;
  /** Wipe the save and return to onboarding. */
  reset: () => void;
  /** Drop queued overlays (level-ups, toasts) without presenting them. */
  clearEvents: () => void;
  /** Registered mini games (dev-only ones included) and registry problems (src/games/registry.ts). */
  games: () => { ids: string[]; problems: string[] };
}

declare global {
  interface Window {
    __haven?: HavenDebug;
  }
}

function debugFlagSet(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('haven.debug') === '1';
  } catch {
    return false;
  }
}

export function debugEnabled(): boolean {
  return import.meta.env.DEV || debugFlagSet();
}

export function createDebugApi(): HavenDebug {
  return {
    getSave: () => useGameStore.getState().save,
    getNow: now,
    getNowOffsetMs,
    setNowOffsetMs: (ms) => {
      setNowOffsetMs(ms);
      useGameStore.getState().tick();
    },
    tick: () => useGameStore.getState().tick(),
    reset: () => {
      setNowOffsetMs(0);
      useGameStore.getState().resetSave();
    },
    clearEvents: () => useGameStore.setState({ pendingEvents: [], notice: null }),
    games: () => ({ ids: listGames({ includeDev: true }).map((g) => g.manifest.id), problems: validateRegistry() }),
  };
}

/** Attach `window.__haven` when allowed. Safe to call more than once. */
export function installDebugHook(): void {
  if (typeof window === 'undefined' || !debugEnabled()) return;
  window.__haven = createDebugApi();
}
