/** Test helper (not a test file): a controllable stand-in for the browser Notification API. */
import { vi } from 'vitest';

export interface ShownNotification {
  title: string;
  options: NotificationOptions | undefined;
}

export interface NotificationMock {
  shown: ShownNotification[];
  requestPermission: ReturnType<typeof vi.fn>;
  setPermission: (p: NotificationPermission) => void;
  restore: () => void;
}

/**
 * Installs `window.Notification`. `permission` is the current state; a tap's
 * `requestPermission()` resolves to `answer` and updates the state with it.
 */
export function mockNotification(permission: NotificationPermission, answer: NotificationPermission = 'granted'): NotificationMock {
  const shown: ShownNotification[] = [];
  let current = permission;
  const requestPermission = vi.fn(async () => {
    current = answer;
    return answer;
  });
  class FakeNotification {
    static get permission(): NotificationPermission {
      return current;
    }
    static requestPermission = requestPermission;
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, options });
    }
  }
  const original = Object.getOwnPropertyDescriptor(window, 'Notification');
  Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
  return {
    shown,
    requestPermission,
    setPermission: (p) => {
      current = p;
    },
    restore: () => {
      if (original) Object.defineProperty(window, 'Notification', original);
      else Reflect.deleteProperty(window, 'Notification');
    },
  };
}

/** Removes `window.Notification` entirely (an unsupported browser). */
export function removeNotification(): () => void {
  const original = Object.getOwnPropertyDescriptor(window, 'Notification');
  Reflect.deleteProperty(window, 'Notification');
  return () => {
    if (original) Object.defineProperty(window, 'Notification', original);
  };
}
