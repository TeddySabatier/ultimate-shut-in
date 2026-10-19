/**
 * Accessibility audit: axe runs once per screen on the mobile project only
 * (playwright.config.ts skips this spec on desktop; the markup is the same and
 * the responsive spec already covers the desktop layout). One test walks the
 * onboarding and then the five tabs on a single save, so the app is set up once
 * instead of once per screen. Thresholds are unchanged: no serious or critical
 * axe violation (wcag2a, wcag2aa, wcag21aa, best-practice) and every visible
 * button has an accessible name; expect.soft collects every failing screen in
 * one run.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { freshApp, gotoTab, settleOverlays, skipOpening, type Tab } from './helpers';

async function expectNoSeriousViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n');
  expect.soft(bad, `${screen}: ${summary}`).toEqual([]);
}

async function expectButtonsNamed(page: Page, screen: string) {
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
  expect.soft(unnamed, `${screen}: unnamed buttons`).toEqual([]);
}

async function audit(page: Page, screen: string) {
  await expectNoSeriousViolations(page, screen);
  await expectButtonsNamed(page, screen);
}

test('every screen: no serious axe violations, named controls, 44px tap targets', async ({ page }) => {
  test.setTimeout(120_000);
  await freshApp(page);

  await test.step('onboarding', async () => {
    await audit(page, 'onboarding step 1');
    await skipOpening(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expectNoSeriousViolations(page, 'onboarding step 2');
    await page.getByLabel('Name').fill('Tester');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Assign the vassals' })).toBeVisible();
    await expectNoSeriousViolations(page, 'onboarding step 3');
    // Habit checkboxes and pace radios carry their visible labels, not "on".
    for (const h of ['Move', 'Outside', 'Clean', 'Social', 'Study', 'Sleep', 'Eat', 'Hygiene']) {
      await expect(page.getByRole('checkbox', { name: h, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('radio', { name: 'Steady', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'on', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open the Haven' }).click();
    await expect(page.getByTestId('ring-header')).toBeVisible();
    await settleOverlays(page);
  });

  for (const tab of ['Haven', 'Board', 'Map', 'Ledger', 'Settings'] as Tab[]) {
    await test.step(tab, async () => {
      await gotoTab(page, tab);
      if (tab === 'Ledger') await page.getByRole('button', { name: /Pell the Runner/ }).click();
      await audit(page, tab);

      if (tab === 'Board') {
        const small = await page.evaluate(() =>
          Array.from(document.querySelectorAll('main button, main a, nav a, main summary, main input, main select'))
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 44)
            .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
        );
        expect.soft(small, 'Board tap targets under 44px').toEqual([]);
      }

      if (tab === 'Settings') {
        await expect(page.getByRole('checkbox', { name: 'Move', exact: true })).toBeVisible();
        await expect(page.getByRole('checkbox', { name: 'on', exact: true })).toHaveCount(0);
        await expect(page.getByRole('radio', { name: 'Hardcore', exact: true })).toBeVisible();
      }
    });
  }
});
