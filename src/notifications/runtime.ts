/**
 * Reminder runtime: arms the scheduler's fire times with `setTimeout` while the
 * app is open, and re-arms whenever the save, the prefs or the page visibility
 * change. When the app is closed nothing fires; that is stated in Settings.
 * Where the Notification Triggers API exists the same times are also handed to
 * the browser, with the same tag so a double delivery replaces itself.
 */
import { useGameStore } from '../state/gameStore';
import { now as clockNow } from '../state/clock';
import { reminderMessage } from './messages';
import { loadPrefs, subscribePrefs } from './prefs';
import { nextReminders, type PlannedReminder } from './scheduler';

/** `setTimeout` cannot wait longer than a signed 32-bit number of ms. */
const MAX_DELAY_MS = 2_147_483_647;
/** A timer that fires this late (suspended tab, sleeping phone) is stale and skipped. */
export const STALE_AFTER_MS = 30 * 60_000;
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

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    return await navigator.serviceWorker.getRegistration();
  } catch {
    return undefined;
  }
}

/** Shows one notification: through the service worker when there is one (Android needs it), else directly. */
async function show(r: PlannedReminder): Promise<void> {
  const { title } = reminderMessage(r);
  const options = optionsFor(r);
  try {
    const reg = await registration();
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

type TriggerCtor = new (timestamp: number) => unknown;

/** Hands the times to the browser when it supports scheduled notifications (rare, and optional). */
async function scheduleTriggers(planned: PlannedReminder[]): Promise<void> {
  const Trigger = (globalThis as { TimestampTrigger?: TriggerCtor }).TimestampTrigger;
  if (!Trigger || !notificationsSupported() || !('showTrigger' in Notification.prototype)) return;
  try {
    const reg = await registration();
    if (!reg) return;
    const pending = await reg.getNotifications({ includeTriggered: false } as GetNotificationOptions);
    for (const n of pending) if (n.tag.startsWith(TAG_PREFIX)) n.close();
    for (const r of planned) {
      const { title } = reminderMessage(r);
      await reg.showNotification(title, { ...optionsFor(r), showTrigger: new Trigger(r.at) } as NotificationOptions);
    }
  } catch {
    /* the in-page timers still run */
  }
}

function fire(r: PlannedReminder): void {
  timers.delete(r.id);
  if (clockNow() - r.at <= STALE_AFTER_MS && notificationPermission() === 'granted') void show(r);
  rearm(Math.max(clockNow(), r.at + 1));
}

/** Recomputes the plan and replaces every armed timer. Safe to call at any time. */
export function rearm(nowMs: number = clockNow()): void {
  clearTimers();
  const { save, onboarded } = useGameStore.getState();
  const prefs = loadPrefs();
  if (!save || !onboarded || !prefs.enabled || notificationPermission() !== 'granted') return;
  const planned = nextReminders(save, prefs, nowMs);
  for (const r of planned) {
    const delay = r.at - nowMs;
    if (delay > MAX_DELAY_MS) continue;
    timers.set(r.id, setTimeout(() => fire(r), Math.max(0, delay)));
  }
  void scheduleTriggers(planned);
}

let stop: (() => void) | null = null;

/** Starts the runtime once; returns a function that stops it. Called from `registerSW`. */
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
  const onVisible = () => {
    if (document.visibilityState === 'visible') rearm();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  rearm();
  stop = () => {
    unsubStore();
    unsubPrefs();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onVisible);
    clearTimers();
    stop = null;
  };
  return stop;
}
