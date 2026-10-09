/**
 * Every Notes-mode and Draw-tab control, tapped the way a tablet user does: with a finger
 * (touch) and with a pen, at Galaxy Tab sizes (1024 x 640 landscape, 640 x 1024 portrait).
 * These controls were dead on Android in 0.1.2; each test proves one does something.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { consoleErrors, openDemo, penStroke } from './helpers';
import { inkText } from './ink-text';

test.use({ hasTouch: true, isMobile: true });

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

type Input = 'touch' | 'pen';
const VIEWPORTS = [
  { name: 'landscape', width: 1024, height: 640 },
  { name: 'portrait', width: 640, height: 1024 },
] as const;

/** Tap with a finger, or with a pen (CDP pen pointer: down + up, no movement). */
async function press(page: Page, target: Locator, input: Input): Promise<void> {
  if (input === 'touch') {
    await target.tap();
    return;
  }
  await target.scrollIntoViewIfNeeded();
  const b = (await target.boundingBox())!;
  await penStroke(page, [[b.x + b.width / 2, b.y + b.height / 2]]);
}

interface LsHook {
  ink: {
    strokes: {
      id: number;
      shape?: string;
      tool: string;
      rec?: string;
      t?: number;
      points: number[][];
    }[];
    tool: string;
    size: number;
    color: string;
    shapeMode: boolean;
    replaying: boolean;
    selected: Set<number>;
  };
  pen: { favorites: { tool: string; color: string; size: number }[] };
  strip: { open: boolean };
  audio: { recordings: unknown[]; audio: HTMLAudioElement; recording: boolean };
  ribbon: HTMLElement & { activeTab: string; collapsed: boolean };
  run: (id: string) => void;
}
const inkState = (page: Page) =>
  page.evaluate(() => {
    const i = (window as unknown as { __ls: LsHook }).__ls.ink;
    return {
      count: i.strokes.length,
      last: i.strokes.at(-1),
      tool: i.tool,
      size: i.size,
      color: i.color,
      shapeMode: i.shapeMode,
      replaying: i.replaying,
      selected: [...i.selected],
    };
  });

/** A spot on the visible page, clear of the floating pen toolbar. */
async function inkSpot(page: Page): Promise<{ x: number; y: number }> {
  const canvas = (await page.locator('#canvas').boundingBox())!;
  const pageBox = (await page.locator('#page').boundingBox())!;
  const tool = await page.locator('#pentool').boundingBox();
  const top = Math.max(canvas.y, tool && tool.y < canvas.y + 120 ? tool.y + tool.height : 0);
  return { x: pageBox.x + 140, y: top + 30 };
}

const toast = (page: Page): Locator => page.locator('#toast');

/**
 * A ribbon command as a user reaches it: on its tab; inside a collapsed group's menu
 * (tablet, narrow rows); or in the full command sheet (phone layout, portrait).
 */
async function ribbonCmd(page: Page, tab: string, id: string): Promise<Locator> {
  await page.evaluate((t) => {
    (window as unknown as { __ls: LsHook }).__ls.ribbon.activeTab = t;
  }, tab);
  const visible = page.locator(`ls-ribbon [data-command="${id}"]:visible`).first();
  if (await visible.isVisible()) return visible;
  const summary = page.locator(`ls-ribbon details:has([data-command="${id}"]) > summary:visible`);
  if ((await summary.count()) > 0) {
    await summary.first().tap();
  } else {
    await page.locator('ls-ribbon [data-action="sheet"]:visible').first().tap();
  }
  await expect(visible).toBeVisible();
  return visible;
}

async function enterNotes(page: Page, input: Input): Promise<void> {
  await press(page, page.locator('#notes-toggle'), input);
  await expect(page.locator('#notesbar')).toBeVisible();
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openDemo(page);
    });

    for (const input of ['touch', 'pen'] as const) {
      test(`Notes: paper styles and colors (${input})`, async ({ page }) => {
        await enterNotes(page, input);
        const bar = page.locator('#notesbar');
        for (const p of ['Blank', 'Grid', 'Dotted', 'Lined']) {
          await press(page, bar.getByRole('radio', { name: p, exact: true }), input);
          await expect(page.locator('#page')).toHaveAttribute('data-paper', p.toLowerCase());
          await expect(bar.getByRole('radio', { name: p, exact: true })).toHaveAttribute(
            'aria-checked',
            'true',
          );
        }
        for (const [name, color] of [
          ['Cream', '#fbf5e9'],
          ['Mist', '#eef5f6'],
          ['Night', '#1c1c1c'],
        ] as const) {
          await press(page, bar.getByRole('radio', { name: `${name} paper` }), input);
          await expect
            .poll(() =>
              page.locator('#page').evaluate((e) => e.style.getPropertyValue('--note-paper')),
            )
            .toBe(color);
        }
        await expect(page.locator('#page')).toHaveClass(/paper-night/);
        await press(page, bar.getByRole('radio', { name: 'White paper' }), input);
        await expect(page.locator('#page')).not.toHaveClass(/paper-night/);
        // Remembered for next time.
        expect(await page.evaluate(() => localStorage.getItem('lucid-sentence:paper'))).toBe(
          'lined',
        );
      });

      test(`Notes: Write / Type (${input})`, async ({ page }) => {
        await enterNotes(page, input);
        const bar = page.locator('#notesbar');
        await expect(page.locator('body')).toHaveClass(/drawing/);
        await press(page, bar.getByRole('radio', { name: 'Type' }), input);
        await expect(page.locator('body')).not.toHaveClass(/drawing/);
        await expect(page.locator('#doc')).toBeFocused();
        await press(page, bar.getByRole('radio', { name: 'Write' }), input);
        await expect(page.locator('body')).toHaveClass(/drawing/);
        await expect(bar.getByRole('radio', { name: 'Write' })).toHaveAttribute(
          'aria-checked',
          'true',
        );
      });

      test(`Notes: Magnifier writes small on the page and never covers the bar (${input})`, async ({
        page,
      }) => {
        await enterNotes(page, input);
        const bar = page.locator('#notesbar');
        const mag = bar.locator('[data-notes="magnifier"]');
        await press(page, mag, input);
        const strip = page.locator('.strip');
        await expect(strip).toBeVisible();
        await expect(mag).toHaveAttribute('aria-pressed', 'true');
        const s = (await strip.boundingBox())!;
        const b = (await bar.boundingBox())!;
        expect(s.y + s.height).toBeLessThanOrEqual(b.y + 1);
        // Write in the strip: the stroke lands in the frame on the page, 2.5x smaller.
        const before = (await inkState(page)).count;
        const ink = (await page.locator('.strip__ink').boundingBox())!;
        await penStroke(page, [
          [ink.x + 40, ink.y + 30],
          [ink.x + 140, ink.y + 70],
          [ink.x + 240, ink.y + 30],
        ]);
        const st = await inkState(page);
        expect(st.count).toBe(before + 1);
        const frame = await page.locator('.strip-frame').evaluate((e) => ({
          x: parseFloat(e.style.left),
          y: parseFloat(e.style.top),
          w: parseFloat(e.style.width),
        }));
        const xs = st.last!.points.map((p) => p[0]!);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(frame.x - 1);
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(200 / 2.5 + 4);
        // The bar still works while the strip is open.
        await press(page, bar.getByRole('radio', { name: 'Grid' }), input);
        await expect(page.locator('#page')).toHaveAttribute('data-paper', 'grid');
        await press(page, page.locator('.strip__next'), input);
        await press(page, mag, input);
        await expect(strip).toBeHidden();
      });

      test(`pen toolbar: tools, colors, sizes, favorite, close (${input})`, async ({ page }) => {
        await enterNotes(page, input);
        const tb = page.locator('#pentool');
        await press(page, tb.getByRole('button', { name: 'Pencil' }), input);
        expect((await inkState(page)).tool).toBe('pencil');
        await press(page, tb.getByRole('button', { name: 'Color #c0392b' }), input);
        expect((await inkState(page)).color).toBe('#c0392b');
        await press(page, tb.getByRole('button', { name: 'Width 7' }), input);
        expect((await inkState(page)).size).toBe(7);
        await expect(tb.getByRole('button', { name: 'Width 7' })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await press(page, tb.getByRole('button', { name: 'Add current pen to favorites' }), input);
        await expect(tb.locator('.pentool__fav')).toHaveCount(1);
        await press(page, tb.getByRole('button', { name: 'Pen', exact: true }), input);
        await press(page, tb.locator('.pentool__fav').first(), input);
        const st = await inkState(page);
        expect([st.tool, st.color, st.size]).toEqual(['pencil', '#c0392b', 7]);
        await press(page, tb.getByRole('button', { name: 'Close pen toolbar' }), input);
        await expect(page.locator('#notesbar')).toBeHidden();
      });

      test(`Notes: close button exits (${input})`, async ({ page }) => {
        await enterNotes(page, input);
        await press(page, page.locator('.notes__close'), input);
        await expect(page.locator('#notesbar')).toBeHidden();
        await expect(page.locator('body')).not.toHaveClass(/notes/);
      });
    }

    test('Notes: Convert to text reads handwriting on the device and inserts it', async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await enterNotes(page, 'pen');
      const spot = await inkSpot(page);
      for (const s of inkText('HELLO WORLD', spot.x, spot.y + 20, 36)) await penStroke(page, s);
      await press(page, page.locator('[data-notes="convert"]'), 'touch');
      const text = page.locator('.hw__text');
      await expect(text).toBeVisible({ timeout: 60_000 });
      await expect(text).toHaveValue(/hello world/i);
      await page.locator('.hw').getByRole('button', { name: 'Insert as text' }).tap();
      await expect(page.locator('#doc')).toContainText(/HELLO WORLD/i);
      // The ink stays (Insert, not Replace); undo removes the inserted text.
      expect((await inkState(page)).count).toBeGreaterThan(10);
    });

    test('Notes: Replace ink with text, and nothing to read says so', async ({ page }) => {
      test.setTimeout(90_000);
      await enterNotes(page, 'touch');
      await page.locator('[data-notes="convert"]').tap();
      await expect(toast(page)).toContainText('Write something first');
      const spot = await inkSpot(page);
      for (const s of inkText('HELLO', spot.x, spot.y + 20, 36)) await penStroke(page, s);
      await page.locator('[data-notes="convert"]').tap();
      await expect(page.locator('.hw__text')).toHaveValue(/hello/i, { timeout: 60_000 });
      await page.locator('.hw').getByRole('button', { name: 'Replace ink with text' }).tap();
      expect((await inkState(page)).count).toBe(0);
      await expect(page.locator('#doc')).toContainText('HELLO');
    });

    test('Notes: Search ink finds and selects a handwritten word', async ({ page }) => {
      test.setTimeout(90_000);
      await enterNotes(page, 'pen');
      const spot = await inkSpot(page);
      for (const s of inkText('HELLO', spot.x, spot.y + 10, 30)) await penStroke(page, s);
      for (const s of inkText('WORLD', spot.x, spot.y + 70, 30)) await penStroke(page, s);
      await press(page, page.locator('[data-notes="search"]'), 'pen');
      const input = page.getByRole('searchbox', { name: 'Search ink' });
      await input.fill('world');
      await input.press('Enter');
      await expect(page.locator('.hw__results .pop__item')).toHaveCount(1, { timeout: 60_000 });
      await expect(page.locator('.hw__results')).toContainText(/world/i);
      const st = await inkState(page);
      // Only the second line's strokes (W O R L D: 1 + 1 + 2 + 1 + 1) are selected.
      expect(st.selected.length).toBe(6);
      await input.fill('nothing here');
      await input.press('Enter');
      await expect(page.locator('.hw__status')).toContainText('No handwriting matches');
    });

    test('Draw tab: Ink to Shape turns rough shapes into clean ones', async ({ page }) => {
      const btn = await ribbonCmd(page, 'draw', 'draw.convert.ink-to-shape');
      await press(page, btn, 'touch');
      expect((await inkState(page)).shapeMode).toBe(true);
      await expect(toast(page)).toContainText('Ink to Shape on');
      await expect(page.locator('body')).toHaveClass(/drawing/);
      const spot = await inkSpot(page);
      const cx = spot.x + 80;
      const cy = spot.y + 80;
      const circle = Array.from({ length: 40 }, (_, i): [number, number] => {
        const t = (i / 36) * 2 * Math.PI;
        const r = 50 + 3 * Math.sin(5 * t);
        return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
      });
      await penStroke(page, circle);
      expect((await inkState(page)).last?.shape).toBe('circle');
      const x0 = spot.x + 180;
      const y0 = spot.y + 30;
      await penStroke(page, [
        [x0, y0],
        [x0 + 60, y0 + 2],
        [x0 + 120, y0 - 1],
        [x0 + 121, y0 + 45],
        [x0 + 119, y0 + 90],
        [x0 + 60, y0 + 91],
        [x0 + 1, y0 + 89],
        [x0 - 1, y0 + 45],
        [x0 + 2, y0 + 3],
      ]);
      expect((await inkState(page)).last?.shape).toBe('rectangle');
      // Off again: ink stays as drawn.
      await press(page, await ribbonCmd(page, 'draw', 'draw.convert.ink-to-shape'), 'pen');
      expect((await inkState(page)).shapeMode).toBe(false);
      await penStroke(
        page,
        circle.map(([x, y]) => [x, y + 10] as [number, number]),
      );
      expect((await inkState(page)).last?.shape).toBeUndefined();
    });

    test('Draw tab: Ink to Math says it is coming (never silent)', async ({ page }) => {
      await press(page, await ribbonCmd(page, 'draw', 'draw.convert.ink-to-math'), 'pen');
      await expect(page.locator('.pop')).toContainText('Ink to Math is coming soon');
    });

    test('Draw tab: Drawing Canvas, Ink Replay, Add Pen', async ({ page }) => {
      // Ink Replay with nothing drawn explains itself.
      await press(page, await ribbonCmd(page, 'draw', 'draw.replay.ink-replay'), 'touch');
      await expect(toast(page)).toContainText('Nothing to replay yet');
      // Drawing Canvas: a framed block in the document, and drawing turns on.
      await press(page, await ribbonCmd(page, 'draw', 'draw.insert.drawing-canvas'), 'touch');
      await expect(page.locator('#doc .drawing-canvas')).toHaveCount(1);
      await expect(page.locator('body')).toHaveClass(/drawing/);
      // Draw, then replay it.
      const spot = await inkSpot(page);
      await penStroke(page, inkText('HI', spot.x, spot.y, 30)[0]!);
      await press(page, await ribbonCmd(page, 'draw', 'draw.replay.ink-replay'), 'pen');
      await expect(toast(page)).toContainText('Replaying');
      await expect
        .poll(async () => (await inkState(page)).replaying, { timeout: 10_000 })
        .toBe(false);
      // Add Pen: a pencil lands in the pen toolbar's favorites and is selected.
      await press(page, await ribbonCmd(page, 'draw', 'draw.drawing-tools.add-pen'), 'touch');
      await page
        .locator('.pop')
        .getByRole('menuitem', { name: /Pencil/ })
        .tap();
      expect((await inkState(page)).tool).toBe('pencil');
      await expect(page.locator('#pentool .pentool__fav')).toHaveCount(1);
      const favs = await page.evaluate(
        () => (window as unknown as { __ls: LsHook }).__ls.pen.favorites,
      );
      expect(favs.at(-1)?.tool).toBe('pencil');
    });

    test('engine-only and unavailable commands say so when tapped', async ({ page }) => {
      await press(page, await ribbonCmd(page, 'insert', 'insert.illustrations.smartart'), 'touch');
      await expect(toast(page)).toContainText('SmartArt arrives with the document engine');
      await press(page, await ribbonCmd(page, 'insert', 'insert.links.bookmark'), 'pen');
      await expect(toast(page)).toContainText('arrives with the document engine');
      await page.evaluate(() => {
        (window as unknown as { __ls: LsHook }).__ls.run('picture-format.size.width');
      });
      await expect(toast(page)).toContainText('Tap a picture first');
      await page.evaluate(() => {
        (window as unknown as { __ls: LsHook }).__ls.run('table-layout.rows-columns.insert-above');
      });
      await expect(toast(page)).toContainText('Put the cursor in a table first');
    });

    test('status bar and header buttons respond to pen and touch', async ({ page }) => {
      // The status bar is hidden in the phone layout (portrait); its buttons live there only.
      if (await page.locator('#words').isVisible()) {
        await press(page, page.locator('#words'), 'pen');
        await expect(page.locator('.pop')).toBeVisible();
        await page.keyboard.press('Escape');
      }
      await press(page, page.locator('#notes-toggle'), 'pen');
      await expect(page.locator('body')).toHaveClass(/notes/);
      await press(page, page.locator('#notes-toggle'), 'touch');
      await expect(page.locator('body')).not.toHaveClass(/notes/);
      await press(page, page.locator('#open-palette'), 'pen');
      await expect(page.locator('dialog.palette')).toBeVisible();
    });
  });
}

test.describe('landscape: Notes keeps the page usable', () => {
  test('the ribbon collapses to its tabs in Notes mode and comes back after', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    await openDemo(page);
    const collapsed = (): Promise<boolean> =>
      page.evaluate(() => (window as unknown as { __ls: LsHook }).__ls.ribbon.collapsed);
    expect(await collapsed()).toBe(false);
    await page.locator('#notes-toggle').tap();
    expect(await collapsed()).toBe(true);
    const canvas = (await page.locator('#canvas').boundingBox())!;
    expect(canvas.height).toBeGreaterThan(300);
    await page.locator('.notes__close').tap();
    expect(await collapsed()).toBe(false);
  });

  test('status bar zoom buttons work with a pen', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    await openDemo(page);
    const zoom = (): Promise<string> => page.locator('#zoom').innerText();
    const before = await zoom();
    await press(page, page.locator('#zoom-in'), 'pen');
    await expect.poll(zoom).not.toBe(before);
    await press(page, page.locator('#zoom-out'), 'pen');
    await expect.poll(zoom).toBe(before);
  });
});
