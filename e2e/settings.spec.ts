import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { ALL_HABITS, freshApp, getSave, gotoTab, onboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Settings');
});

test('at least one habit always stays enabled', async ({ page }) => {
  for (const h of ALL_HABITS.slice(0, 7)) {
    const box = page.getByRole('checkbox', { name: h, exact: true });
    await box.click();
    await expect(box).not.toBeChecked();
  }
  const last = page.getByRole('checkbox', { name: 'Hygiene', exact: true });
  await expect(last).toBeChecked();
  await expect(last).toBeDisabled();
  await expect(page.getByText('At least one habit stays on.')).toBeVisible();
  expect((await getSave(page)).settings.enabledHabits).toEqual(['hygiene']);
});

test("changing the reset hour keeps today's board", async ({ page }) => {
  await gotoTab(page, 'Board');
  const before = await page.locator('article h3').allInnerTexts();
  expect(before.length).toBeGreaterThan(0);
  const saveBefore = await getSave(page);

  await gotoTab(page, 'Settings');
  const select = page.getByLabel('Day starts at');
  await expect(select).toHaveValue('4');
  await select.selectOption('9');
  await expect(select).toHaveValue('9');
  await expect(page.getByText('resets in')).toHaveCount(0);

  await gotoTab(page, 'Board');
  await expect(page.getByText('Day starts at 09:00')).toBeVisible();
  const after = await page.locator('article h3').allInnerTexts();
  expect(after).toEqual(before);
  const saveAfter = await getSave(page);
  expect(saveAfter.settings.resetHour).toBe(9);
  expect(saveAfter.board?.quests.map((q) => q.templateId)).toEqual(saveBefore.board?.quests.map((q) => q.templateId));
  await page.reload();
  await gotoTab(page, 'Board');
  expect(await page.locator('article h3').allInnerTexts()).toEqual(before);
});

test('export downloads a version-3 JSON save and import restores the name', async ({ page }) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export save' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^haven-save-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const text = await readFile(path, 'utf8');
  const parsed = JSON.parse(text) as { version: number; player: { name: string } };
  expect(parsed.version).toBe(5);
  expect(parsed.player.name).toBe('Tester');

  // Change the name, then import the file: the exported name comes back.
  await gotoTab(page, 'Ledger');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Name').fill('Someone Else');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Someone Else', { exact: true })).toBeVisible();

  await gotoTab(page, 'Settings');
  await page.locator('input[type="file"]').setInputFiles({ name: 'haven-save.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  const dialog = page.getByRole('dialog', { name: 'Import this save?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await getSave(page)).player.name).toBe('Tester');
  await gotoTab(page, 'Haven');
  await expect(page.getByTestId('ring-header').getByText('Tester', { exact: true })).toBeVisible();
});

test('import refuses a file that is not a save', async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({ name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await expect(page.getByText('That file could not be read as a save.')).toBeVisible();
});

test('reset needs the typed confirmation and returns to onboarding', async ({ page }) => {
  await page.getByRole('button', { name: 'Reset everything' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset everything?' });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Reset', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type RESET to confirm/).fill('reset');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type RESET to confirm/).fill('RESET');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('heading', { name: 'Protocol online' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Protocol online' })).toBeVisible();
});

test('benevolence options explain what Strict does', async ({ page }) => {
  await expect(page.getByRole('radio', { name: 'Benevolent', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Strict', exact: true })).not.toBeChecked();
  await expect(page.getByText(/In Strict mode a vassal who reaches 0 loyalty takes leave/)).toBeVisible();
  await page.getByRole('radio', { name: 'Strict', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Strict', exact: true })).toBeChecked();
  expect((await getSave(page)).settings.benevolence).toBe('strict');
});

/**
 * A Notification stand-in whose permission survives reloads (a real browser keeps
 * the grant), so the tests do not depend on the headless browser's prompt policy.
 */
async function stubNotifications(page: Page, initial: 'default' | 'granted' | 'denied', answer: 'granted' | 'denied'): Promise<void> {
  await page.addInitScript(
    ([start, reply]) => {
      const key = 'e2e.notification-permission';
      if (localStorage.getItem(key) === null) localStorage.setItem(key, start);
      class FakeNotification {
        static get permission(): string {
          return localStorage.getItem(key) ?? 'default';
        }
        static async requestPermission(): Promise<string> {
          const next = localStorage.getItem(key) === 'default' ? reply : (localStorage.getItem(key) ?? 'default');
          localStorage.setItem(key, next);
          return next;
        }
      }
      Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
    },
    [initial, answer] as const,
  );
  await page.reload();
  await gotoTab(page, 'Settings');
}

test('reminders: the toggles and times persist across a reload', async ({ page }) => {
  await stubNotifications(page, 'default', 'granted');
  const master = page.getByRole('checkbox', { name: 'Send me reminders' });
  await expect(master).not.toBeChecked();
  await expect(page.getByText(/When the app is closed nothing fires/)).toBeVisible();
  await master.check();
  await expect(page.getByRole('checkbox', { name: 'Board issued' })).toBeChecked();
  await expect(page.getByLabel('Board issued time')).toHaveValue('08:30');
  await expect(page.getByLabel('Wave tomorrow time')).toHaveValue('19:00');

  await page.getByLabel('Board issued time').fill('09:15');
  await page.getByRole('checkbox', { name: 'Wave tomorrow' }).uncheck();
  await page.getByRole('checkbox', { name: 'Timer finished' }).uncheck();

  await page.reload();
  await gotoTab(page, 'Settings');
  await expect(page.getByRole('checkbox', { name: 'Send me reminders' })).toBeChecked();
  await expect(page.getByLabel('Board issued time')).toHaveValue('09:15');
  await expect(page.getByRole('checkbox', { name: 'Board issued' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Wave tomorrow' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Timer finished' })).not.toBeChecked();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('haven.reminders') ?? 'null'));
  expect(stored).toMatchObject({ enabled: true, board: { on: true, minutes: 555 }, wave: { on: false }, timer: { on: false } });
  // Reminders are device preferences: the save itself is untouched.
  expect(Object.keys((await getSave(page)).settings)).not.toContain('reminders');
});

test('reminders: a denied permission shows the explanation and stays off', async ({ page }) => {
  await stubNotifications(page, 'default', 'denied');
  const master = page.getByRole('checkbox', { name: 'Send me reminders' });
  await master.click();
  await expect(page.getByText(/Notifications are blocked for this site/)).toBeVisible();
  await expect(master).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Board issued' })).toHaveCount(0);
  await page.reload();
  await gotoTab(page, 'Settings');
  await expect(page.getByText(/Notifications are blocked for this site/)).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Send me reminders' })).not.toBeChecked();
  const stored = await page.evaluate(() => localStorage.getItem('haven.reminders'));
  expect(stored === null || JSON.parse(stored).enabled === false).toBe(true);
});
