import { expect, test } from '@playwright/test';
import { consoleErrors, openDemo, pageSpot, penStroke, scribble, strokeCount } from './helpers';

/** Fake microphone + MediaRecorder so recording works headless and offline. */
const mockMedia = (): void => {
  class FakeRecorder extends EventTarget {
    state = 'inactive';
    mimeType = 'audio/webm';
    constructor(readonly stream: MediaStream) {
      super();
    }
    start(): void {
      this.state = 'recording';
    }
    stop(): void {
      this.state = 'inactive';
      const ev = new Event('dataavailable') as Event & { data: Blob };
      Object.defineProperty(ev, 'data', {
        value: new Blob([new Uint8Array(64)], { type: 'audio/webm' }),
      });
      this.dispatchEvent(ev);
      this.dispatchEvent(new Event('stop'));
    }
  }
  Object.defineProperty(window, 'MediaRecorder', { value: FakeRecorder, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: () => Promise.resolve(new MediaStream()) },
    configurable: true,
  });
  // Record seeks instead of decoding the fake audio.
  const seeks: number[] = [];
  Object.defineProperty(window, '__seeks', { value: seeks });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement & { _t?: number }) {
      return this._t ?? 0;
    },
    set(this: HTMLMediaElement & { _t?: number }, v: number) {
      this._t = v;
      seeks.push(v);
    },
  });
  HTMLMediaElement.prototype.play = function () {
    return Promise.resolve();
  };
};

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mockMedia);
  await openDemo(page);
  await page.locator('#notes-toggle').click();
  await expect(page.locator('#notesbar')).toBeVisible();
});

test('paper backgrounds switch as a view layer', async ({ page }) => {
  const pageEl = page.locator('#page');
  await expect(pageEl).toHaveAttribute('data-paper', 'lined');
  for (const name of ['Grid', 'Dotted', 'Blank', 'Lined']) {
    await page.locator('#notesbar').getByRole('radio', { name }).click();
    await expect(pageEl).toHaveAttribute('data-paper', name.toLowerCase());
  }
  await page.getByRole('radio', { name: 'Cream paper' }).click();
  await expect(pageEl).toHaveCSS('background-color', 'rgb(251, 245, 233)');
  // The saved document never contains paper settings.
  expect(await page.locator('#doc').innerHTML()).not.toContain('paper');
  // Leaving Notes mode removes the paper.
  await page.getByRole('button', { name: 'Exit Notes mode' }).click();
  await expect(pageEl).toHaveAttribute('data-paper', '');
});

test('floating pen toolbar: tools, colors, widths, favorites, drag', async ({ page }) => {
  const bar = page.getByRole('toolbar', { name: 'Pen toolbar' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Highlighter' }).click();
  await expect(bar.getByRole('button', { name: 'Highlighter' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await bar.getByRole('button', { name: 'Color #c0392b' }).click();
  await bar.getByRole('button', { name: 'Width 7' }).click();
  await bar.getByRole('button', { name: 'Add current pen to favorites' }).click();
  await expect(bar.locator('.pentool__fav')).toHaveCount(1);
  const fav = await page.evaluate(() => localStorage.getItem('lucid-sentence:pen-favorites'));
  expect(JSON.parse(fav!)).toEqual([{ tool: 'highlighter', color: '#c0392b', size: 7 }]);
  // Drag by the grip.
  const before = (await bar.boundingBox())!;
  const grip = (await bar.locator('.pentool__grip').boundingBox())!;
  await page.mouse.move(grip.x + 4, grip.y + 10);
  await page.mouse.down();
  await page.mouse.move(grip.x + 4 - 200, grip.y + 10 + 150, { steps: 5 });
  await page.mouse.up();
  const after = (await bar.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBeLessThan(-150);
  expect(Math.round(after.y - before.y)).toBeGreaterThan(100);
});

test('audio recording timestamps ink and typing; tapping a stroke seeks', async ({ page }) => {
  const timeline = page.getByRole('region', { name: 'Audio notes' });
  await expect(timeline).toBeVisible();
  await timeline.getByRole('button', { name: 'Record audio' }).click();
  await expect(timeline.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.waitForTimeout(2200);
  const { x, y } = await pageSpot(page);
  await penStroke(page, scribble(x, y + 20));
  await expect.poll(() => strokeCount(page)).toBe(1);
  await page.waitForTimeout(300);
  // Typing in Type mode stamps the paragraph.
  await page.locator('#notesbar').getByRole('radio', { name: 'Type' }).click();
  await page.locator('#doc p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Noted.');
  await timeline.getByRole('button', { name: 'Stop recording' }).click();
  await expect(timeline.getByRole('button', { name: 'Record audio' })).toBeVisible();

  const stroke = await page.evaluate(
    () =>
      (window as unknown as { __ls: { ink: { strokes: { t?: number; rec?: string }[] } } }).__ls.ink
        .strokes[0]!,
  );
  expect(stroke.rec).toMatch(/^rec-/);
  expect(stroke.t).toBeGreaterThan(1500);
  await expect(page.locator('#doc [data-t]')).toHaveCount(1);
  await expect(timeline.locator('.timeline__mark--ink')).toHaveCount(1);
  await expect(timeline.locator('.timeline__mark--text')).toHaveCount(1);

  // Tap the stroke (not drawing): playback seeks to just before it was written.
  const path = page.locator('#ink path.ink-stroke').first();
  await path.scrollIntoViewIfNeeded();
  const pb = (await path.boundingBox())!;
  await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __seeks: number[] }).__seeks.at(-1)))
    .toBeCloseTo(Math.max(0, stroke.t! - 1500) / 1000, 1);
});
