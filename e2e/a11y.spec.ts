import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { freshApp, gotoTab, onboard, skipOpening, type Tab } from './helpers';

async function expectNoSeriousViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n');
  expect(bad, `${screen}: ${summary}`).toEqual([]);
}

async function expectButtonsNamed(page: Page) {
  const unnamed = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter((b) => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const name = b.getAttribute('aria-label') || b.textContent?.trim() || '';
        const labelled = b.getAttribute('aria-labelledby');
        return !(name.length > 0 || (labelled && document.getElementById(labelled)?.textContent?.trim()));
      })
      .map((b) => b.outerHTML.slice(0, 120)),
  );
  expect(unnamed).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('onboarding has no serious axe violations and named controls', async ({ page }) => {
  await expectNoSeriousViolations(page, 'onboarding step 1');
  await expectButtonsNamed(page);
  await skipOpening(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectNoSeriousViolations(page, 'onboarding step 2');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectNoSeriousViolations(page, 'onboarding step 3');
  // Habit checkboxes and pace radios carry their visible labels, not "on".
  for (const h of ['Move', 'Outside', 'Clean', 'Social', 'Study', 'Sleep', 'Eat', 'Hygiene']) {
    await expect(page.getByRole('checkbox', { name: h, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('radio', { name: 'Steady', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'on', exact: true })).toHaveCount(0);
});

for (const tab of ['Haven', 'Board', 'Map', 'Ledger', 'Settings'] as Tab[]) {
  test(`${tab} has no serious axe violations and every button is named`, async ({ page }) => {
    await onboard(page, { name: 'Tester' });
    await gotoTab(page, tab);
    if (tab === 'Ledger') await page.getByRole('button', { name: /Pell the Runner/ }).click();
    await expectNoSeriousViolations(page, tab);
    await expectButtonsNamed(page);
  });
}

test('Board tap targets are at least 44px tall', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Board');
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main button, main a, nav a, main summary, main input, main select'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 44)
      .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  expect(small).toEqual([]);
});

test('settings checkboxes expose their habit names', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Settings');
  await expect(page.getByRole('checkbox', { name: 'Move', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'on', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Hardcore', exact: true })).toBeVisible();
});
