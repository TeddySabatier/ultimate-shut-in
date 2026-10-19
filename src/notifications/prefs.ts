import { useSyncExternalStore } from 'react';

/**
 * Reminder preferences. They live in their own localStorage key, not in the
 * SaveFile: they describe this device (notification permission is per
 * browser), and the save schema is owned elsewhere. Times are minutes since
 * local midnight.
 */
export const REMINDERS_KEY = 'haven.reminders';

export interface TimedReminderPref {
  on: boolean;
  minutes: number;
}

export interface ReminderPrefs {
  /** Master switch; only ever turned on from a tap that got permission. */
  enabled: boolean;
  board: TimedReminderPref;
  wave: TimedReminderPref;
  timer: { on: boolean };
}

export const DEFAULT_PREFS: ReminderPrefs = {
  enabled: false,
  board: { on: true, minutes: 8 * 60 + 30 },
  wave: { on: true, minutes: 19 * 60 },
  timer: { on: true },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function minutesOf(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1439, Math.max(0, Math.round(v))) : fallback;
}

function flag(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Anything that came out of storage becomes a valid `ReminderPrefs`. */
export function sanitizePrefs(raw: unknown): ReminderPrefs {
  const d = isRecord(raw) ? raw : {};
  const board = isRecord(d.board) ? d.board : {};
  const wave = isRecord(d.wave) ? d.wave : {};
  const timer = isRecord(d.timer) ? d.timer : {};
  return {
    enabled: flag(d.enabled, DEFAULT_PREFS.enabled),
    board: { on: flag(board.on, DEFAULT_PREFS.board.on), minutes: minutesOf(board.minutes, DEFAULT_PREFS.board.minutes) },
    wave: { on: flag(wave.on, DEFAULT_PREFS.wave.on), minutes: minutesOf(wave.minutes, DEFAULT_PREFS.wave.minutes) },
    timer: { on: flag(timer.on, DEFAULT_PREFS.timer.on) },
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return storage()?.getItem(REMINDERS_KEY) ?? null;
  } catch {
    return null;
  }
}

let cachedRaw: string | null | undefined;
let cachedPrefs: ReminderPrefs = DEFAULT_PREFS;

/** Current prefs; the same object is returned while the stored text is unchanged. */
export function loadPrefs(): ReminderPrefs {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedPrefs;
  cachedRaw = raw;
  try {
    cachedPrefs = raw === null ? DEFAULT_PREFS : sanitizePrefs(JSON.parse(raw));
  } catch {
    cachedPrefs = DEFAULT_PREFS;
  }
  return cachedPrefs;
}

const listeners = new Set<() => void>();

/** Stores the prefs and tells listeners. Returns false when the browser would not keep them. */
export function savePrefs(next: ReminderPrefs): boolean {
  let stored = false;
  try {
    const ls = storage();
    if (ls) {
      ls.setItem(REMINDERS_KEY, JSON.stringify(sanitizePrefs(next)));
      stored = true;
    }
  } catch {
    /* private mode or quota: reported to the caller, which keeps the switch off */
  }
  for (const l of [...listeners]) l();
  return stored;
}

/** Listener runs on local changes and, through the `storage` event, on changes made in another tab. */
export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === REMINDERS_KEY) listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

export function useReminderPrefs(): readonly [ReminderPrefs, (next: ReminderPrefs) => boolean] {
  const prefs = useSyncExternalStore(subscribePrefs, loadPrefs, () => DEFAULT_PREFS);
  return [prefs, savePrefs] as const;
}
