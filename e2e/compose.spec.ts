import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advanceToDay, cardByTitle, freshApp, getSave, gotoTab, onboard, openCards, settleOverlays } from './helpers';

interface CustomLike {
  id: string;
  title: string;
  habit: string;
  kind: string;
  durationMin?: number;
  recurrence: string;
  timeSlot: string;
  source: string;
  stats: { issued: number; done: number; tried: number };
}
interface ProposalLike {
  id: string;
  rule: string;
  habit: string;
  status: string;
  snoozeUntil: number | null;
  reason: string;
  title: string;
}

async function saveWithCustom(page: Page): Promise<{ customTemplates: CustomLike[]; proposals: ProposalLike[]; board: { quests: { templateId: string; status: string }[] } }> {
  return (await getSave(page)) as unknown as { customTemplates: CustomLike[]; proposals: ProposalLike[]; board: { quests: { templateId: string; status: string }[] } };
}

const ADD = /Add my own quest/;

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('text path: type a sentence, see it parsed, add it to the board, complete it, undo it', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Board');
  const coinsBefore = (await getSave(page)).player.coins;

  await page.getByRole('button', { name: ADD }).click();
  const dialog = page.getByRole('dialog', { name: 'Your own quest' });
  await expect(dialog).toBeVisible();
  // The textarea has the focus, so typing starts at once.
  await expect(dialog.getByLabel('Your quest, in your own words')).toBeFocused();
  await dialog.getByLabel('Your quest, in your own words').fill('walk 30 minutes in the park every morning');

  // The parser's reading, as editable fields.
  await expect(dialog.getByRole('radio', { name: /Pell/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Timer' })).toBeChecked();
  await expect(dialog.getByLabel('Minutes')).toHaveValue('30');
  await expect(dialog.getByLabel('Name')).toHaveValue('Walk in the Park');
  await expect(dialog.getByLabel('How often')).toHaveValue('daily');
  await expect(dialog.getByLabel('Time of day')).toHaveValue('morning');
  await expect(dialog.getByRole('radio', { name: /2 Steady/ })).toBeChecked();
  await expect(dialog.getByRole('list', { name: 'Rewards' })).toBeVisible();
  // Walking and the park pull two ways: the sheet asks which vassal.
  await expect(dialog.getByText('Which vassal should take this one?')).toBeVisible();

  // Nothing is saved yet.
  expect((await saveWithCustom(page)).customTemplates).toHaveLength(0);

  // Fix the vassal by hand, then add.
  await dialog.getByRole('radio', { name: /Wren/ }).check();
  await dialog.getByLabel('How often').selectOption('once');
  await dialog.getByRole('button', { name: 'Add to board today' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').getByRole('heading', { name: 'On the board' })).toBeVisible();
  await settleOverlays(page);

  const card = cardByTitle(page, 'Walk in the Park');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-status', 'open');
  await expect(card).toHaveAttribute('data-kind', 'timer');
  await expect(card.getByText('Mine', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: /^Swap quest/ })).toHaveCount(0);

  let save = await saveWithCustom(page);
  expect(save.customTemplates).toHaveLength(1);
  expect(save.customTemplates[0]).toMatchObject({ title: 'Walk in the Park', habit: 'outside', kind: 'timer', durationMin: 30, recurrence: 'once', timeSlot: 'morning', source: 'text' });
  expect(save.customTemplates[0]?.stats).toEqual({ issued: 1, done: 0, tried: 0 });
  expect(save.board.quests.some((q) => q.templateId === save.customTemplates[0]?.id)).toBe(true);

  // Settle it like any quest.
  await card.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('status').getByRole('heading', { name: 'Settlement' })).toBeVisible();
  await expect(card).toHaveAttribute('data-status', 'done');
  await settleOverlays(page);
  save = await saveWithCustom(page);
  expect(save.customTemplates[0]?.stats.done).toBe(1);
  expect((await getSave(page)).player.coins).toBeGreaterThan(coinsBefore);
  expect((await getSave(page)).stats.questsTotal).toBe(1);

  // And take it back.
  await card.getByRole('button', { name: 'Undo' }).click();
  await settleOverlays(page);
  await expect(card).toHaveAttribute('data-status', 'open');
  save = await saveWithCustom(page);
  expect(save.customTemplates[0]?.stats).toEqual({ issued: 1, done: 0, tried: 0 });
  expect((await getSave(page)).player.coins).toBe(coinsBefore);
  expect((await getSave(page)).stats.questsTotal).toBe(0);

  // It lives in the Ledger's "My quests" until archived.
  await gotoTab(page, 'Ledger');
  const mine = page.getByRole('heading', { name: 'My quests' });
  await expect(mine).toBeVisible();
  const item = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3, name: 'Walk in the Park' }) });
  await expect(item).toBeVisible();
  await expect(item.getByText('Issued 1, settled 0, attempted 0')).toBeVisible();
  await item.getByRole('button', { name: /^Archive/ }).click();
  await page.getByRole('dialog', { name: 'Archive this quest?' }).getByRole('button', { name: 'Archive', exact: true }).click();
  await settleOverlays(page);
  await expect(item).toHaveCount(0);
  save = await saveWithCustom(page);
  expect(save.customTemplates[0]).toMatchObject({ title: 'Walk in the Park' });
  // The untouched copy left today's board too.
  await gotoTab(page, 'Board');
  await expect(cardByTitle(page, 'Walk in the Park')).toHaveCount(0);
});

test('a recurring quest comes back on the next day\'s board by itself', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Board');
  await page.getByRole('button', { name: ADD }).click();
  const dialog = page.getByRole('dialog', { name: 'Your own quest' });
  await dialog.getByLabel('Your quest, in your own words').fill('stretch for 10 minutes every day');
  await expect(dialog.getByLabel('How often')).toHaveValue('daily');
  await dialog.getByRole('button', { name: 'Save as recurring' }).click();
  await expect(dialog).toBeHidden();
  await settleOverlays(page);
  // Saved, not on today's board.
  await expect(cardByTitle(page, 'Stretch')).toHaveCount(0);
  expect((await saveWithCustom(page)).customTemplates[0]).toMatchObject({ title: 'Stretch', recurrence: 'daily', durationMin: 10 });

  await advanceToDay(page, 1);
  await settleOverlays(page);
  await gotoTab(page, 'Board');
  await expect(cardByTitle(page, 'Stretch')).toBeVisible();
  await advanceToDay(page, 2);
  await settleOverlays(page);
  await gotoTab(page, 'Board');
  await expect(cardByTitle(page, 'Stretch')).toBeVisible();
  expect((await saveWithCustom(page)).customTemplates[0]?.stats.issued).toBe(2);
});

test('voice path with a fake recogniser: live words, final transcript, review, then save', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        (window as unknown as { __rec: FakeRecognition }).__rec = this;
      }
      start() {}
      stop() {
        this.onend?.();
      }
      abort() {}
      say(transcript: string, isFinal: boolean) {
        this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal, length: 1, 0: { transcript } } } });
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  });
  await freshApp(page);
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Board');
  await page.getByRole('button', { name: ADD }).click();
  const dialog = page.getByRole('dialog', { name: 'Your own quest' });
  // The privacy copy sits next to the microphone.
  await expect(dialog.getByText(/Nothing else leaves your device/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Speak it' }).click();
  await expect(dialog.getByRole('status')).toContainText('Listening');
  await page.evaluate(() => (window as unknown as { __rec: { say(t: string, f: boolean): void } }).__rec.say('read ten pages', false));
  await expect(dialog.getByText('read ten pages')).toBeVisible();
  await expect(dialog.getByLabel('Your quest, in your own words')).toHaveValue('');
  await page.evaluate(() => (window as unknown as { __rec: { say(t: string, f: boolean): void } }).__rec.say('read ten pages before bed', true));
  await expect(dialog.getByLabel('Your quest, in your own words')).toHaveValue('read ten pages before bed');
  await expect(dialog.getByText('Heard. Check it below, fix anything, then save.')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Counter' })).toBeChecked();
  await expect(dialog.getByLabel('How many')).toHaveValue('10');
  await expect(dialog.getByLabel('Time of day')).toHaveValue('evening');
  await dialog.getByRole('button', { name: 'Stop' }).click();
  expect((await saveWithCustom(page)).customTemplates).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Add to board today' }).click();
  await expect(dialog).toBeHidden();
  await settleOverlays(page);
  await expect(cardByTitle(page, 'Read 10 Pages')).toBeVisible();
  expect((await saveWithCustom(page)).customTemplates[0]).toMatchObject({ source: 'voice', kind: 'count' });
});

test('without a Speech API the sheet offers the text box and says why', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
  });
  await freshApp(page);
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Board');
  await page.getByRole('button', { name: ADD }).click();
  const dialog = page.getByRole('dialog', { name: 'Your own quest' });
  await expect(dialog.getByRole('button', { name: 'Speak it' })).toHaveCount(0);
  await expect(dialog.getByText('This browser cannot listen.')).toBeVisible();
  await dialog.getByLabel('Your quest, in your own words').fill('tidy the kitchen');
  await expect(dialog.getByLabel('Name')).toHaveValue('Tidy the Kitchen');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('the sheet closes with Escape and a refused microphone points to the text box', async ({ page }) => {
  await page.addInitScript(() => {
    class Denied {
      lang = '';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onerror?.({ error: 'not-allowed' });
          this.onend?.();
        }, 0);
      }
      stop() {}
      abort() {}
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Denied;
  });
  await freshApp(page);
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Board');
  await page.getByRole('button', { name: ADD }).click();
  const dialog = page.getByRole('dialog', { name: 'Your own quest' });
  await dialog.getByRole('button', { name: 'Speak it' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The microphone is blocked');
  await expect(dialog.getByLabel('Your quest, in your own words')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('a proposal appears after a week-style attempt pattern, and Accept puts a smaller quest on the board', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Board');
  // Rule 1: tried but not done. Mark every open quest as attempted today.
  const cards = openCards(page);
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await page.locator('article[data-status="open"]').first().getByRole('button', { name: 'I tried' }).click();
  await settleOverlays(page);
  await expect(page.locator('article[data-status="tried"]')).toHaveCount(n);
  // No proposal on the day itself.
  await expect(page.getByRole('region', { name: 'The Haven notices' })).toHaveCount(0);

  await advanceToDay(page, 1);
  await settleOverlays(page);
  await gotoTab(page, 'Board');
  const region = page.getByRole('region', { name: 'The Haven notices' });
  await expect(region).toBeVisible();
  const items = region.getByRole('listitem');
  expect(await items.count()).toBeGreaterThan(0);
  expect(await items.count()).toBeLessThanOrEqual(3);
  const first = items.first();
  await expect(first.getByRole('heading', { name: 'A smaller step' })).toBeVisible();
  await expect(first).toContainText('(Mini)');
  await expect(first).toContainText(/tried|attempts/);

  let save = await saveWithCustom(page);
  const open = save.proposals.filter((p) => p.status === 'open');
  expect(open.length).toBe(await items.count());
  expect(open.every((p) => p.rule === 'smaller')).toBe(true);

  // Dismiss the first: it goes, the others stay, and it is snoozed.
  const dismissed = open[0];
  await first.getByRole('button', { name: /^Not now/ }).click();
  await settleOverlays(page);
  save = await saveWithCustom(page);
  const after = save.proposals.find((p) => p.id === dismissed?.id);
  expect(after?.status).toBe('dismissed');
  expect(after?.snoozeUntil).not.toBeNull();

  if (open.length > 1) {
    // Accept the next one.
    const second = region.getByRole('listitem').first();
    await second.getByRole('button', { name: /^Accept/ }).click();
    await settleOverlays(page);
    save = await saveWithCustom(page);
    expect(save.customTemplates).toHaveLength(1);
    expect(save.customTemplates[0]).toMatchObject({ source: 'proposal', recurrence: 'once' });
    expect(save.customTemplates[0]?.title).toMatch(/\(Mini\)$/);
    await expect(cardByTitle(page, save.customTemplates[0]?.title ?? '')).toBeVisible();
    await expect(page.locator('article', { hasText: 'Mine' })).toHaveCount(1);
  }

  // The snooze holds: the next day does not bring the dismissed one back.
  await advanceToDay(page, 2);
  await settleOverlays(page);
  save = await saveWithCustom(page);
  const key = `${dismissed?.rule}:${dismissed?.habit}`;
  expect(save.proposals.filter((p) => p.status === 'open').map((p) => `${p.rule}:${p.habit}`)).not.toContain(key);
});

test('the Compose sheet, the Board button and My quests have no serious axe violations', async ({ page }) => {
  async function axe(where: string): Promise<void> {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`).join('; ');
    expect(bad, `${where}: ${summary}`).toEqual([]);
  }
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Board');
  await axe('board with the Compose button');
  await page.getByRole('button', { name: ADD }).click();
  const dialog = page.getByRole('dialog', { name: 'Your own quest' });
  await axe('empty sheet');
  await dialog.getByLabel('Your quest, in your own words').fill('walk 30 minutes in the park every morning');
  await expect(dialog.getByLabel('Name')).toHaveValue('Walk in the Park');
  await axe('parsed sheet');
  await dialog.getByRole('button', { name: 'Add to board today' }).click();
  await settleOverlays(page);
  await gotoTab(page, 'Ledger');
  await expect(page.getByRole('heading', { name: 'My quests' })).toBeVisible();
  await axe('Ledger with My quests');
});
