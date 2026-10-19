/**
 * Reminder runtime: arms the scheduler's fire times with `setTimeout` while the
 * app is open, and re-arms whenever the save, the prefs (here or in another
 * tab), the page visibility or the focus change. When the app is closed
 * nothing fires; that is stated in Settings.
 *
 * Timers are short hops, not one long wait: each hop checks the wall clock, so
 * a laptop that slept (timers stop on some platforms) fires within a hop of
 * waking instead of hours late.
 */
import { useGameStore } from '../state/gameStore';
import { now as clockNow } from '../state/clock';
import { reminderMessage } from './messages';
import { loadPrefs, subscribePrefs } from './prefs';
import { nextReminders, type PlannedReminder } from './scheduler';

/** `setTimeout` cannot wait longer than a signed 32-bit number of ms. */
const MAX_DELAY_MS = 2_147_483_647;
/** Longest single wait; the wall clock is re-read after each hop. */
export const HOP_MS = 5 * 60_000;
/** A reminder this late (suspended tab, sleeping phone) is stale and skipped. */
export const STALE_AFTER_MS = 30 * 60_000;
/** How long to wait for the service worker to become active before using the page API. */
const SW_WAIT_MS = 3_000;
const TAG_PREFIX = 'haven-';

type PermissionState = NotificationPermission | 'unsupported';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): PermissionState {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Must be called from a tap handler. Handles the legacy callback-only form. */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    const result = await new Promise<NotificationPermission>((resolve, reject) => {
      const maybe = Notification.requestPermission(resolve) as Promise<NotificationPermission> | undefined;
      if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
    });
    return result;
  } catch {
    return Notification.permission;
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimers(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

function iconUrl(): string | undefined {
  try {
    return new URL('icons/icon-192.png', document.baseURI).href;
  } catch {
    return undefined;
  }
}

function optionsFor(r: PlannedReminder): NotificationOptions {
  const { body } = reminderMessage(r);
  const icon = iconUrl();
  return { body, tag: `${TAG_PREFIX}${r.id}`, lang: 'en', ...(icon ? { icon } : {}) };
}

/** The active service worker registration, or undefined when there is none (or it is not ready soon). */
async function activeRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const wait = new Promise<undefined>((resolve) => {
      timeout = setTimeout(() => resolve(undefined), SW_WAIT_MS);
    });
    try {
      return await Promise.race([navigator.serviceWorker.ready, wait]);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return undefined;
  }
}

/** Shows one notification: through the active service worker when there is one (Android needs it), else directly. */
async function show(r: PlannedReminder): Promise<void> {
  const { title } = reminderMessage(r);
  const options = optionsFor(r);
  try {
    const reg = await activeRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* fall through to the page constructor */
  }
  try {
    new Notification(title, options);
  } catch {
    /* nothing more to try */
  }
}

function fire(r: PlannedReminder): void {
  timers.delete(r.id);
  const prefs = loadPrefs();
  if (prefs.enabled && clockNow() - r.at <= STALE_AFTER_MS && notificationPermission() === 'granted') void show(r);
  rearm(Math.max(clockNow(), r.at + 1));
}

/** Waits one hop (or less) and checks the clock again before firing. */
function arm(r: PlannedReminder): void {
  const delay = r.at - clockNow();
  if (delay > MAX_DELAY_MS) return;
  timers.set(
    r.id,
    setTimeout(() => (clockNow() >= r.at ? fire(r) : arm(r)), Math.max(0, Math.min(delay, HOP_MS))),
  );
}

/** Recomputes the plan and replaces every armed timer. Safe to call at any time. */
export function rearm(nowMs: number = clockNow()): void {
  clearTimers();
  const { save, onboarded } = useGameStore.getState();
  const prefs = loadPrefs();
  if (!save || !onboarded || !prefs.enabled || notificationPermission() !== 'granted') return;
  for (const r of nextReminders(save, prefs, nowMs)) arm(r);
}

let stop: (() => void) | null = null;

/** Starts the runtime once; returns a function that stops it. */
export function startReminderRuntime(): () => void {
  if (stop) return stop;
  if (typeof window === 'undefined') return () => undefined;
  let lastSave = useGameStore.getState().save;
  const unsubStore = useGameStore.subscribe((state) => {
    if (state.save === lastSave) return;
    lastSave = state.save;
    rearm();
  });
  const unsubPrefs = subscribePrefs(() => rearm());
  const onWake = () => {
    if (document.visibilityState === 'visible') rearm();
  };
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('pageshow', onWake);
  window.addEventListener('focus', onWake);
  rearm();
  stop = () => {
    unsubStore();
    unsubPrefs();
    document.removeEventListener('visibilitychange', onWake);
    window.removeEventListener('pageshow', onWake);
    window.removeEventListener('focus', onWake);
    clearTimers();
    stop = null;
  };
  return stop;
}

/**
 * Starts the runtime once the service worker is active (or right away without
 * one), so a reminder never races the worker's first install. Never throws: a
 * failure here must not take offline support down with it.
 */
export function startReminderRuntimeWhenReady(): void {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      startReminderRuntime();
      return;
    }
    // `ready` never settles when registration fails, so do not wait for it forever.
    void activeRegistration().then(
      () => startSafely(),
      () => startSafely(),
    );
  } catch (error) {
    console.error('[reminders] could not start', error);
  }
}

function startSafely(): void {
  try {
    startReminderRuntime();
  } catch (error) {
    console.error('[reminders] could not start', error);
  }
}
