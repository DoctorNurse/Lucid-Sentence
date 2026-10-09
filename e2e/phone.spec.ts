import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  consoleErrors,
  openDemo,
  pageSpot,
  penStroke,
  ribbonButton,
  scribble,
  strokeCount,
  touchDrag,
} from './helpers';

// A Galaxy S-class phone in portrait: 412 × 915 CSS px, touch only.
test.use({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  hasTouch: true,
  isMobile: true,
});

const SHOTS = process.env['LS_SHOTS'];

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

const ribbon = (page: Page): Locator => page.locator('ls-ribbon');
const sheet = (page: Page): Locator => ribbon(page).locator('.ls-sheet');

async function center(l: Locator): Promise<{ x: number; y: number }> {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function openDesignSheet(page: Page): Promise<void> {
  await ribbon(page).locator('.ls-picker-btn').tap();
  await ribbon(page).locator('[data-tab="design"]').tap();
  await expect(sheet(page)).toBeVisible();
}

test.describe('phone command sheet', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page);
    expect(await ribbon(page).evaluate((r) => (r as HTMLElement & { layout: string }).layout)).toBe(
      'phone',
    );
  });

  test('the chevron collapses and reopens the sheet', async ({ page }) => {
    await openDesignSheet(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-sheet-open.png` });
    const toggle = ribbon(page).locator('.ls-sheet-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const c = await center(toggle);
    await page.touchscreen.tap(c.x, c.y);
    await expect(sheet(page)).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-sheet-collapsed.png` });
    await page.touchscreen.tap(c.x, c.y);
    await expect(sheet(page)).toBeVisible();
  });

  test('tapping or swiping the handle down collapses the sheet', async ({ page }) => {
    await openDesignSheet(page);
    const handle = ribbon(page).locator('.ls-handle');
    const h = await center(handle);
    await touchDrag(page, [
      [h.x, h.y],
      [h.x, h.y + 30],
      [h.x, h.y + 80],
      [h.x, h.y + 160],
    ]);
    await expect(sheet(page)).toHaveCount(0);
    await openDesignSheet(page);
    const h2 = await center(ribbon(page).locator('.ls-handle'));
    await page.touchscreen.tap(h2.x, h2.y);
    await expect(sheet(page)).toHaveCount(0);
  });

  test('a short drag on the handle snaps back open', async ({ page }) => {
    await openDesignSheet(page);
    const h = await center(ribbon(page).locator('.ls-handle'));
    await touchDrag(page, [
      [h.x, h.y],
      [h.x, h.y + 20],
      [h.x, h.y + 30],
    ]);
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveCSS('transform', 'none');
  });

  test('tapping the page outside the sheet collapses it', async ({ page }) => {
    await openDesignSheet(page);
    await page.touchscreen.tap(200, 40);
    await expect(sheet(page)).toHaveCount(0);
  });

  test('the Back gesture collapses the sheet and stays in the app', async ({ page }) => {
    const url = page.url();
    await openDesignSheet(page);
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
    expect(page.url()).toBe(url);
    // Closing another way doesn't leave an extra Back step behind.
    await openDesignSheet(page);
    const c = await center(ribbon(page).locator('.ls-sheet-toggle'));
    await page.touchscreen.tap(c.x, c.y);
    await expect(sheet(page)).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => (history.state as { lsOverlay?: boolean } | null)?.lsOverlay ?? false),
      )
      .toBe(false);
  });
});

test.describe('phone pen toolbar and ink', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page);
    await page.evaluate(() => {
      (
        window as unknown as { __ls: { app: { setDraw: (on: boolean, t?: string) => void } } }
      ).__ls.app.setDraw(true, 'pen');
    });
    await expect(page.locator('#ink')).toHaveClass(/ink--active/);
  });

  test('the pen toolbar is a compact strip above the bottom bar, never over the page', async ({
    page,
  }) => {
    const bar = page.getByRole('toolbar', { name: 'Pen toolbar' });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveClass(/pentool--docked/);
    const b = (await bar.boundingBox())!;
    const canvas = (await page.locator('#canvas').boundingBox())!;
    const dock = (await ribbon(page).locator('.ls-phonebar').boundingBox())!;
    expect(b.height).toBeLessThanOrEqual(60);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(412);
    // Between the page area and the bottom bar, overlapping neither.
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(b.y + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(dock.y + 1);
    // All tools and colors are reachable by scrolling the strip sideways.
    const scroll = await bar.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
      return { sw: el.scrollWidth, cw: el.clientWidth, left: el.scrollLeft };
    });
    expect(scroll.sw).toBeGreaterThan(scroll.cw);
    expect(scroll.left).toBeGreaterThan(0);
    await bar.evaluate((el) => {
      el.scrollLeft = 0;
    });
    expect(await bar.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-x');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-draw-toolbar.png` });
  });

  test('a pen draws at phone size, even when it reports zero pressure', async ({ page }) => {
    const { x, y } = await pageSpot(page);
    await penStroke(page, scribble(x, y, 120, 20, 10));
    await expect.poll(() => strokeCount(page)).toBe(1);
    await penStroke(page, scribble(x, y + 60, 120, 20, 10), { pressure: 0 });
    await expect.poll(() => strokeCount(page)).toBe(2);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __ls: { ink: { lastPointerType: string } } }).__ls.ink
            .lastPointerType,
      ),
    ).toBe('pen');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-pen-strokes.png` });
  });

  test('pen hover (no contact) shows a preview but never draws', async ({ page }) => {
    const { x, y } = await pageSpot(page);
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 8; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: x + i * 10,
        y,
        pointerType: 'pen',
        button: 'none',
        buttons: 0,
      });
    }
    await cdp.detach();
    await expect(page.locator('#ink')).toHaveClass(/ink--hover/);
    expect(await strokeCount(page)).toBe(0);
  });

  test('the pen side button erases', async ({ page }) => {
    const { x, y } = await pageSpot(page);
    await penStroke(page, scribble(x, y, 120, 20, 10));
    await expect.poll(() => strokeCount(page)).toBe(1);
    await penStroke(
      page,
      [
        [x + 60, y - 10],
        [x + 60, y + 30],
      ],
      { buttons: 2 },
    );
    await expect.poll(() => strokeCount(page)).toBe(0);
  });

  test('fingers draw only with Draw with Touch on; a mouse always draws', async ({ page }) => {
    const { x, y } = await pageSpot(page);
    await touchDrag(page, scribble(x, y, 100, 20, 8));
    expect(await strokeCount(page)).toBe(0);
    await page.evaluate(() => {
      const ls = (window as unknown as { __ls: { ink: { drawWithTouch: boolean } } }).__ls;
      ls.ink.drawWithTouch = true;
    });
    await touchDrag(page, scribble(x, y, 100, 20, 8));
    await expect.poll(() => strokeCount(page)).toBe(1);
    await penStroke(page, scribble(x, y + 60, 100, 20, 8), { pointerType: 'mouse' });
    await expect.poll(() => strokeCount(page)).toBe(2);
  });
});

test('phone: a pen on the page starts drawing from idle (auto-switch)', async ({ page }) => {
  await openDemo(page);
  await expect(page.locator('#ink')).not.toHaveClass(/ink--active/);
  const { x, y } = await pageSpot(page);
  await penStroke(page, scribble(x, y, 120, 20, 10));
  await expect(page.locator('#ink')).toHaveClass(/ink--active/);
  await expect.poll(() => strokeCount(page)).toBe(1);
  await expect(page.locator('#pentool')).toHaveClass(/pentool--docked/);
});

test('phone: the Draw tab pen button turns drawing on', async ({ page }) => {
  await openDemo(page, 'tab=draw');
  await ribbonButton(page, 'draw.drawing-tools.pens').tap();
  const option = page.getByRole('option', { name: 'Ink pen' });
  if (await option.count()) await option.first().tap();
  await expect(page.locator('#ink')).toHaveClass(/ink--active/);
});
