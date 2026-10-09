import { expect, test, type Page } from '@playwright/test';
import { consoleErrors, openDemo, ribbonButton, ribbonTab, selectText } from './helpers';

// On-device AI with the deterministic mock model (?ai=mock): no network, no real model.
const SHOTS = process.env['LS_SHOTS'];
const shot = async (page: Page, name: string): Promise<void> => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ai-${name}.png` });
};

const TEXT = 'i think teh plan is very good and they was right about it.';

async function addParagraph(page: Page): Promise<void> {
  await page.evaluate((text) => {
    const doc = document.querySelector('#doc')!;
    const p = document.createElement('p');
    p.id = 'ai-test';
    p.textContent = text;
    doc.prepend(p);
  }, TEXT);
}

const docText = (page: Page): Promise<string> =>
  page.locator('#doc').evaluate((d) => (d as HTMLElement).innerText);

async function enableAndDownload(page: Page): Promise<void> {
  const dialog = page.locator('dialog.ai-models');
  await expect(dialog).toBeVisible();
  await page.getByTestId('ai-enabled').check();
  const download = page.getByTestId('ai-download-baseline');
  await expect(download).toBeVisible();
  await download.click();
  await expect(page.getByTestId('ai-progress-text')).toBeVisible();
  await shot(page, 'download-progress');
  await expect(page.getByTestId('ai-ready')).toBeVisible({ timeout: 10_000 });
}

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

test.describe('Assistant (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('is off until the user opts in, then suggests edits to accept or reject', async ({
    page,
  }) => {
    await openDemo(page, 'ai=mock');
    await addParagraph(page);
    await ribbonTab(page, 'review').click();
    await expect(ribbonButton(page, 'review.assistant.fix-grammar')).toBeVisible();
    await shot(page, 'ribbon-desktop');

    // First use opens the model manager instead of doing anything.
    await selectText(page, TEXT);
    await ribbonButton(page, 'review.assistant.fix-grammar').click();
    await expect(page.locator('.ai-reason')).toContainText(/fix grammar/i);
    await shot(page, 'models-off');
    await enableAndDownload(page);
    await expect(page.getByTestId('ai-device')).toContainText('RAM');
    await shot(page, 'models-ready');
    await page.locator('.ai-models__close').click();

    // Fix grammar: a suggestion card with a word diff, nothing changed yet.
    await selectText(page, TEXT);
    await ribbonButton(page, 'review.assistant.fix-grammar').click();
    const card = page.getByTestId('ai-suggestion');
    await expect(card.getByTestId('ai-diff')).toBeVisible();
    await expect(card.locator('ins').first()).toBeVisible();
    await expect(card.locator('del').first()).toBeVisible();
    await shot(page, 'suggestion-desktop');
    expect(await docText(page)).toContain(TEXT);

    // Reject leaves the text alone.
    await card.getByTestId('ai-reject').click();
    await expect(card).toHaveCount(0);
    expect(await docText(page)).toContain(TEXT);

    // Accept replaces it as one edit.
    await selectText(page, TEXT);
    await ribbonButton(page, 'review.assistant.fix-grammar').click();
    await page.getByTestId('ai-accept').click();
    await expect(page.getByTestId('ai-suggestion')).toHaveCount(0);
    expect(await docText(page)).toContain('I think the plan is very good and they were right');
  });

  test('Rewrite offers tones, Summarize adds after the selection', async ({ page }) => {
    await openDemo(page, 'ai=mock');
    await addParagraph(page);
    await ribbonTab(page, 'review').click();
    await ribbonButton(page, 'review.assistant.ai-models').click();
    await enableAndDownload(page);
    await page.locator('.ai-models__close').click();

    await selectText(page, TEXT);
    await ribbonButton(page, 'review.assistant.rewrite').click();
    await page.getByRole('menuitem', { name: /Clearer/ }).click();
    await expect(page.getByTestId('ai-diff').locator('del')).toContainText('very');
    await page.getByTestId('ai-reject').click();

    await selectText(page, TEXT);
    await ribbonButton(page, 'review.assistant.summarize').click();
    await expect(page.getByTestId('ai-diff')).toContainText('In short:');
    await page.getByTestId('ai-accept').click();
    const text = await docText(page);
    expect(text).toContain(TEXT);
    expect(text).toContain('In short:');
  });

  test('Tell Lucid maps a request to a command and asks before running it', async ({ page }) => {
    await openDemo(page, 'ai=mock');
    await ribbonTab(page, 'review').click();
    await ribbonButton(page, 'review.assistant.ai-models').click();
    await enableAndDownload(page);
    await page.locator('.ai-models__close').click();

    await ribbonButton(page, 'review.assistant.tell-lucid').click();
    await page.getByTestId('tell-lucid-input').fill('turn on track changes');
    await page.getByTestId('tell-lucid-input').press('Enter');
    const answer = page.getByTestId('tell-lucid-answer');
    await expect(answer).toBeVisible();
    await expect(answer).toHaveAttribute('data-command', 'review.tracking.track-changes');
    await shot(page, 'tell-lucid');
    await page.getByTestId('tell-lucid-confirm').click();
    await expect(answer).toHaveCount(0);
  });

  test('Tell Lucid works from the command search, and with AI off by keywords', async ({
    page,
  }) => {
    await openDemo(page, 'ai=mock');
    await page.keyboard.press('Alt+q');
    await page.locator('.palette__input').fill('make the text bold');
    await page.getByTestId('palette-ask').click();
    const answer = page.getByTestId('tell-lucid-answer');
    await expect(answer).toHaveAttribute('data-command', 'home.font.bold');
    await expect(page.locator('.ai-tell')).toContainText('Matched by keywords');
  });
});

test.describe('Assistant (phone)', () => {
  test.use({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    hasTouch: true,
    isMobile: true,
  });

  test('the Review sheet has the Assistant, and suggestions open as a bottom sheet', async ({
    page,
  }) => {
    await openDemo(page, 'ai=mock');
    await addParagraph(page);
    const ribbon = page.locator('ls-ribbon');
    await ribbon.locator('.ls-picker-btn').tap();
    await ribbon.locator('[data-tab="review"]').tap();
    const sheet = ribbon.locator('.ls-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-command="review.assistant.rewrite"]')).toBeVisible();
    await shot(page, 'ribbon-phone');
    await sheet.locator('[data-command="review.assistant.ai-models"]').tap();
    await enableAndDownload(page);
    await shot(page, 'models-phone');
    await page.locator('.ai-models__close').tap();
    await selectText(page, TEXT);
    if (!(await sheet.isVisible())) {
      await ribbon.locator('.ls-picker-btn').tap();
      await ribbon.locator('[data-tab="review"]').tap();
    }
    await sheet.locator('[data-command="review.assistant.fix-grammar"]').tap();
    const card = page.getByTestId('ai-suggestion');
    await expect(card.getByTestId('ai-diff')).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(Math.round(box.width)).toBe(412);
    await shot(page, 'suggestion-phone');
  });
});

test.describe('Assistant (tablet)', () => {
  test.use({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });

  test('the Review tab shows the Assistant group on a touch tablet', async ({ page }) => {
    await openDemo(page, 'ai=mock');
    await addParagraph(page);
    await ribbonTab(page, 'review').tap();
    // Narrower touch layouts fold groups into a menu: Assistant is two taps away.
    const group = page.locator('ls-ribbon [data-group="review.assistant"]');
    const toggle = group.locator('summary');
    const open = async (): Promise<void> => {
      if (await toggle.isVisible()) await toggle.tap();
    };
    await open();
    await expect(group.locator('[data-command="review.assistant.rewrite"]')).toBeVisible();
    await shot(page, 'ribbon-tablet');
    await group.locator('[data-command="review.assistant.ai-models"]').tap();
    await enableAndDownload(page);
    await page.locator('.ai-models__close').tap();
    await selectText(page, TEXT);
    await open();
    await group.locator('[data-command="review.assistant.fix-grammar"]').tap();
    await expect(page.getByTestId('ai-diff')).toBeVisible();
    await shot(page, 'suggestion-tablet');
  });
});
