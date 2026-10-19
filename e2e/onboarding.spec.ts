import { expect, test } from '@playwright/test';
import { freshApp, getSave, gotoTab, onboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('first launch walks the opening, names the Absolute and opens the Haven', async ({ page }) => {
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protocol online' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  // Skipping the typewriter shows the whole opening at once.
  await expect(page.getByText(/There is a door, and it opens from the inside\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toBeHidden();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  const name = page.getByLabel('Name');
  // The field starts empty with the default as a placeholder, so typing never appends to "Absolute".
  await expect(name).toHaveValue('');
  await expect(name).toHaveAttribute('placeholder', 'Absolute');
  await name.click();
  await name.pressSequentially('Tester');
  await expect(name).toHaveValue('Tester');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await page.getByRole('radio', { name: 'Steady', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Steady', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Open the Haven' }).click();

  const header = page.getByTestId('ring-header');
  await expect(header).toBeVisible();
  await expect(header.getByText('Tester', { exact: true })).toBeVisible();
  await expect(header.getByRole('heading', { name: 'The Room' })).toBeVisible();
  await expect(header.getByText('Lv 1')).toBeVisible();

  const save = await getSave(page);
  expect(save.player.name).toBe('Tester');
  expect(save.settings.difficulty).toBe('steady');

  await gotoTab(page, 'Board');
  const cards = page.locator('article[data-kind]');
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(3);
  expect(n).toBeLessThanOrEqual(5);
  await expect(page.getByText(`0/${n} done`)).toBeVisible();
});

test('empty name falls back to Absolute', async ({ page }) => {
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Open the Haven' }).click();
  await expect(page.getByTestId('ring-header').getByText('Absolute', { exact: true })).toBeVisible();
});

test('reload keeps the save and skips onboarding', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await page.reload();
  await expect(page.getByTestId('ring-header')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protocol online' })).toBeHidden();
  await expect(page.getByTestId('ring-header').getByText('Tester', { exact: true })).toBeVisible();
  const raw = await page.evaluate(() => localStorage.getItem('haven.save'));
  expect(raw).not.toBeNull();
  expect(JSON.parse(raw as string).version).toBe(3);
});
