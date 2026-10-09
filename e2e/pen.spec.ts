import { expect, test, type Page } from '@playwright/test';
import {
  consoleErrors,
  openDemo,
  pageSpot,
  penStroke,
  ribbonButton,
  ribbonTab,
  scribble,
  strokeCount,
  touchDrag,
} from './helpers';

test.use({ hasTouch: true });

async function startPen(page: Page): Promise<void> {
  await ribbonTab(page, 'draw').click();
  await ribbonButton(page, 'draw.drawing-tools.pens').click();
  await page.getByRole('option', { name: 'Ink pen' }).click();
  await expect(page.locator('#ink')).toHaveClass(/ink--active/);
}

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openDemo(page);
});

test('a pen draws a pressure-sensitive stroke, and Ctrl+Z undoes it', async ({ page }) => {
  await startPen(page);
  const { x, y } = await pageSpot(page);
  await penStroke(page, scribble(x, y));
  await expect.poll(() => strokeCount(page)).toBe(1);
  const info = await page.evaluate(() => {
    const ls = (
      window as unknown as {
        __ls: { ink: { strokes: { points: number[][] }[]; lastPointerType: string } };
      }
    ).__ls;
    return { type: ls.ink.lastPointerType, pressures: ls.ink.strokes[0]!.points.map((p) => p[2]) };
  });
  expect(info.type).toBe('pen');
  expect(info.pressures.some((p) => p !== undefined && p > 0 && p !== 0.5)).toBe(true);
  await expect(page.locator('#ink path.ink-stroke')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => strokeCount(page)).toBe(0);
  await page.keyboard.press('Control+y');
  await expect.poll(() => strokeCount(page)).toBe(1);
});

test('the eraser removes a stroke, and the pen barrel button erases too', async ({ page }) => {
  await startPen(page);
  const { x, y } = await pageSpot(page);
  await penStroke(page, scribble(x, y));
  await penStroke(page, scribble(x, y + 100));
  await expect.poll(() => strokeCount(page)).toBe(2);
  // Eraser tool from the floating pen toolbar.
  await page
    .getByRole('toolbar', { name: 'Pen toolbar' })
    .getByRole('button', { name: 'Eraser' })
    .click();
  await penStroke(page, [
    [x + 80, y - 10],
    [x + 80, y + 40],
  ]);
  await expect.poll(() => strokeCount(page)).toBe(1);
  // Back to the pen; the barrel (side) button erases without switching tools.
  await page
    .getByRole('toolbar', { name: 'Pen toolbar' })
    .getByRole('button', { name: 'Pen', exact: true })
    .click();
  await penStroke(
    page,
    [
      [x + 80, y + 90],
      [x + 80, y + 140],
    ],
    { buttons: 2 },
  );
  await expect.poll(() => strokeCount(page)).toBe(0);
});

test('palm rejection: touch does not draw unless Draw with Touch is on', async ({ page }) => {
  await startPen(page);
  const { x, y } = await pageSpot(page);
  await touchDrag(page, scribble(x, y, 120, 20, 8));
  await expect.poll(() => strokeCount(page)).toBe(0);
  const rejected = await page.evaluate(
    () => (window as unknown as { __ls: { ink: { rejected: number } } }).__ls.ink.rejected,
  );
  expect(rejected).toBeGreaterThan(0);
  // A pen still draws while the palm rests.
  await penStroke(page, scribble(x, y + 70));
  await expect.poll(() => strokeCount(page)).toBe(1);
  // Turn on Draw with Touch: fingers draw (after the pen-recency window).
  await ribbonButton(page, 'draw.drawing-tools.draw-with-touch').click();
  await expect(ribbonButton(page, 'draw.drawing-tools.draw-with-touch')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForTimeout(800);
  await touchDrag(page, scribble(x, y + 140, 120, 20, 8));
  await expect.poll(() => strokeCount(page)).toBe(2);
});

test('a pen touching the page switches to drawing automatically', async ({ page }) => {
  await expect(page.locator('#ink')).not.toHaveClass(/ink--active/);
  const { x, y } = await pageSpot(page);
  await penStroke(page, scribble(x, y));
  await expect(page.locator('#ink')).toHaveClass(/ink--active/);
  await expect.poll(() => strokeCount(page)).toBe(1);
});
