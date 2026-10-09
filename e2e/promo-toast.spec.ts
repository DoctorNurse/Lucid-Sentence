import { expect, test } from '@playwright/test';

test('a toast never covers the promo card resting in the corner', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?load=0&draft=off');
  await page.waitForFunction(() => '__ls' in window);
  const card = page.locator('ls-splash').locator('.promo');
  test.skip((await card.count()) === 0, 'this build has no promo card');
  await expect(card).toBeVisible();
  await page.waitForTimeout(400); // the card settles into the corner
  await page.evaluate(() => {
    (window as unknown as { __ls: { toast: (m: string, ms?: number) => void } }).__ls.toast(
      '“Sample Report.docx” can’t be opened in this preview yet. Opening and saving .docx files arrive with the document engine.',
      9000,
    );
  });
  const t = (await page.locator('#toast').boundingBox())!;
  const c = (await card.boundingBox())!;
  const overlap =
    t.x < c.x + c.width && t.x + t.width > c.x && t.y < c.y + c.height && t.y + t.height > c.y;
  expect(overlap).toBe(false);
  await page.screenshot({
    path: process.env['LS_SHOTS']
      ? `${process.env['LS_SHOTS']}/desktop-toast-promo.png`
      : 'test-results/desktop-toast-promo.png',
  });
});
