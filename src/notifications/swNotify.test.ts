import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * `public/sw-notify.js` is a classic script imported into the generated service
 * worker. Run the real file against a fake worker scope and drive its handler.
 */
const SOURCE = readFileSync(join(process.cwd(), 'public', 'sw-notify.js'), 'utf8');
const SCOPE = 'https://example.test/ultimate-shut-in/';

interface FakeClient {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

function client(url: string): FakeClient {
  const self: FakeClient = { url, focus: vi.fn(), navigate: vi.fn(async () => undefined) };
  self.focus.mockImplementation(async () => self);
  return self;
}

function load(windows: FakeClient[]) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const openWindow = vi.fn(async () => undefined);
  const fakeSelf = {
    registration: { scope: SCOPE },
    clients: { matchAll: vi.fn(async () => windows), openWindow },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn;
    },
  };
  // The file declares plain functions and registers on `self`; expose both.
  const api = new Function('self', `${SOURCE}\nreturn { havenReminderUrl };`)(fakeSelf) as { havenReminderUrl: (scope: string, tag: string) => string };
  async function tap(tag: string): Promise<{ closed: boolean }> {
    let closed = false;
    let pending: Promise<unknown> = Promise.resolve();
    listeners.notificationclick?.({
      notification: { tag, close: () => (closed = true) },
      waitUntil: (p: Promise<unknown>) => (pending = p),
    });
    await pending;
    return { closed };
  }
  return { api, tap, openWindow, hasHandler: 'notificationclick' in listeners };
}

describe('reminder tap routing', () => {
  it('maps each reminder kind to its screen', () => {
    const { api } = load([]);
    expect(api.havenReminderUrl(SCOPE, 'haven-board')).toBe(`${SCOPE}#/quests`);
    expect(api.havenReminderUrl(SCOPE, 'haven-wave')).toBe(`${SCOPE}#/`);
    expect(api.havenReminderUrl(SCOPE, 'haven-timer:2026-01-05:move.walk15')).toBe(`${SCOPE}#/quests`);
    expect(api.havenReminderUrl(SCOPE, 'something-else')).toBe(`${SCOPE}#/`);
    expect(api.havenReminderUrl(SCOPE, undefined as unknown as string)).toBe(`${SCOPE}#/`);
  });

  it('registers a notificationclick handler', () => {
    expect(load([]).hasHandler).toBe(true);
  });

  it('closes the notification and opens the app when no window exists', async () => {
    const { tap, openWindow } = load([]);
    const { closed } = await tap('haven-board');
    expect(closed).toBe(true);
    expect(openWindow).toHaveBeenCalledWith(`${SCOPE}#/quests`);
  });

  it('focuses an open window of the app and moves it to the right screen', async () => {
    const mine = client(`${SCOPE}#/settings`);
    const other = client('https://example.test/elsewhere/');
    const { tap, openWindow } = load([other, mine]);
    await tap('haven-timer:abc');
    expect(mine.focus).toHaveBeenCalledTimes(1);
    expect(mine.navigate).toHaveBeenCalledWith(`${SCOPE}#/quests`);
    expect(other.focus).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('still focuses when the browser refuses to navigate the window', async () => {
    const mine = client(SCOPE);
    mine.navigate.mockRejectedValue(new Error('not controlled'));
    const { tap, openWindow } = load([mine]);
    await expect(tap('haven-wave')).resolves.toEqual({ closed: true });
    expect(mine.focus).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });
});
