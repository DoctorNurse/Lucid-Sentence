import { expect, test } from '@playwright/test';
import { consoleErrors, openDemo, ribbonButton, ribbonTab, selectText } from './helpers';

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openDemo(page);
});

test('Ctrl+B bolds the selection and the Bold button reflects it', async ({ page }) => {
  const bold = ribbonButton(page, 'home.font.bold');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await selectText(page, 'Pages stay white');
  await page.keyboard.press('Control+b');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  const weight = await page.evaluate(() => {
    const n = document.getSelection()!.anchorNode!;
    return getComputedStyle(n instanceof Element ? n : n.parentElement!).fontWeight;
  });
  expect(Number(weight)).toBeGreaterThanOrEqual(600);
  // Clicking the button toggles it back off.
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  expect(consoleErrors(page)).toEqual([]);
});

test('the Styles gallery applies Heading 1', async ({ page }) => {
  await selectText(page, 'Try it:', true);
  await ribbonButton(page, 'home.styles.gallery').click();
  const tile = page.getByRole('option', { name: 'Heading 1' });
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page.locator('#doc h2', { hasText: 'Try it:' })).toHaveCount(1);
  // The navigation pane lists it.
  await ribbonTab(page, 'view').click();
  await ribbonButton(page, 'view.show.navigation-pane').click();
  await expect(page.locator('#navlist')).toContainText('Try it:');
});

test('inserting a table shows the Table Design and Layout tabs', async ({ page }) => {
  await expect(ribbonTab(page, 'table-design')).toHaveCount(0);
  await selectText(page, 'Try it:', true);
  await ribbonTab(page, 'insert').click();
  await ribbonButton(page, 'insert.tables.table').click();
  await page.getByRole('button', { name: '3 by 2 table' }).click();
  await expect(page.locator('#doc table')).toHaveCount(2);
  await expect(ribbonTab(page, 'table-design')).toBeVisible();
  await expect(ribbonTab(page, 'table-layout')).toBeVisible();
  // Leaving the table hides them again.
  await selectText(page, 'Quarterly Notes', true);
  await expect(ribbonTab(page, 'table-design')).toHaveCount(0);
});

test('find and replace', async ({ page }) => {
  await selectText(page, 'Summary', true);
  await page.keyboard.press('Control+h');
  const panel = page.locator('#findpanel');
  await expect(panel).toBeVisible();
  await panel.getByLabel('Find', { exact: true }).fill('ribbon');
  await expect(panel.locator('.find__count')).toHaveText(/1 of [2-9]/);
  await panel.getByLabel('Replace with').fill('toolbar');
  await panel.getByRole('button', { name: 'Replace All' }).click();
  await expect(page.locator('#doc')).not.toContainText(/\bribbon\b/i);
  await expect(page.locator('#doc')).toContainText('toolbar');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('the command palette finds and runs a command', async ({ page }) => {
  await selectText(page, 'Try it:', true);
  await page.keyboard.press('Alt+q');
  const palette = page.getByRole('dialog', { name: 'Search commands' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('page break');
  await expect(palette.getByRole('option').first()).toContainText('Page Break');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.locator('#doc .d-page-break')).toHaveCount(1);
  await expect(page.locator('#pageinfo')).toContainText('of 2');
});

test('unwired commands show "Coming with the engine" instead of running', async ({ page }) => {
  await ribbonTab(page, 'mailings').click();
  const btn = page.locator('ls-ribbon [data-pending]').first();
  await btn.click();
  await expect(page.locator('ls-ribbon .ls-tip')).toContainText(/with the engine/i);
});

test('File backstage shows document info', async ({ page }) => {
  await ribbonTab(page, 'file').click();
  await expect(page.locator('#backstage .bs__stats').first()).toContainText('Words');
  await ribbonButton(page, 'file.settings.account').click();
  await expect(page.locator('#backstage')).toContainText('Attributions');
  await page.keyboard.press('Escape');
  await expect(page.locator('#doc')).toBeVisible();
});

test('Ctrl+F1 collapses and restores the ribbon', async ({ page }) => {
  await page.keyboard.press('Control+F1');
  await expect(page.locator('ls-ribbon')).toHaveAttribute('collapsed', '');
  await page.keyboard.press('Control+F1');
  await expect(page.locator('ls-ribbon')).not.toHaveAttribute('collapsed', '');
});
