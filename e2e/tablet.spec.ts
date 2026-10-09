import { expect, test, type Page } from '@playwright/test';
import { consoleErrors, openDemo } from './helpers';

// A touch-only tablet: no mouse or trackpad, so `any-pointer: fine` doesn't match.
test.use({ hasTouch: true, isMobile: true });

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

const ribbonLayout = (page: Page): Promise<string> =>
  page.evaluate(
    () => (document.querySelector('ls-ribbon') as HTMLElement & { layout: string }).layout,
  );

test('a touch tablet in landscape (1366 px) keeps the touch ribbon with 44 px targets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  await openDemo(page);
  expect(await ribbonLayout(page)).toBe('tablet');
  const smallest = await page.evaluate(() => {
    const root = document.querySelector('ls-ribbon')!.shadowRoot!;
    const sizes = [...root.querySelectorAll<HTMLElement>('[data-command]')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.left < innerWidth)
      .map((r) => Math.min(r.width, r.height));
    return Math.min(...sizes);
  });
  expect(Math.round(smallest)).toBeGreaterThanOrEqual(44);
});

test('tablet portrait (834 px) keeps the title bar on one line', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await openDemo(page);
  expect(await ribbonLayout(page)).toBe('tablet');
  const row = page.locator('.titlebar__row');
  const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('#saved')).toBeInViewport({ ratio: 1 });
});
