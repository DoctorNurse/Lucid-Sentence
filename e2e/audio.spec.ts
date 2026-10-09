/**
 * Audio notes with a real MediaRecorder: Chromium's fake microphone (a tone) stands in
 * for the tablet's. Record while writing, stop, play, scrub, and the honest error when
 * the microphone permission is off. Galaxy Tab landscape size, finger and pen taps.
 */
import { expect, test, type Page } from '@playwright/test';
import { consoleErrors, openDemo, penStroke } from './helpers';

const executablePath = process.env['PW_CHROMIUM'];
test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 1024, height: 640 },
  permissions: ['microphone'],
  launchOptions: {
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

interface Hook {
  ink: { strokes: { rec?: string; t?: number }[] };
  audio: {
    recordings: { id: string; duration: number; mime: string; blob: Blob }[];
    audio: HTMLAudioElement;
    position: number;
  };
}
const state = (page: Page) =>
  page.evaluate(() => {
    const ls = (window as unknown as { __ls: Hook }).__ls;
    return {
      recs: ls.audio.recordings.map((r) => ({
        duration: r.duration,
        mime: r.mime,
        size: r.blob.size,
      })),
      paused: ls.audio.audio.paused,
      position: ls.audio.position,
      stamped: ls.ink.strokes.filter((s) => s.rec && s.t !== undefined).length,
    };
  });

async function penTap(page: Page, selector: string): Promise<void> {
  const b = (await page.locator(selector).boundingBox())!;
  await penStroke(page, [[b.x + b.width / 2, b.y + b.height / 2]]);
}

test('record while writing, stop, play, and scrub', async ({ page }) => {
  test.setTimeout(60_000);
  await openDemo(page);
  await page.locator('#notes-toggle').tap();
  const rec = page.locator('.timeline__rec');
  await rec.tap();
  await expect(rec).toHaveAttribute('aria-pressed', 'true');
  await expect(rec).toHaveAttribute('aria-label', 'Stop recording');
  // The clock runs while recording (the bar updates in place).
  await expect(page.locator('.timeline__time')).not.toHaveText(/^0:00 \//, { timeout: 5000 });
  // Write while recording: the stroke gets the recording's timestamp.
  const canvas = (await page.locator('#canvas').boundingBox())!;
  const tool = (await page.locator('#pentool').boundingBox())!;
  const y = Math.max(canvas.y, tool.y + tool.height) + 40;
  await penStroke(page, [
    [canvas.x + 200, y],
    [canvas.x + 260, y + 20],
    [canvas.x + 320, y],
  ]);
  await page.waitForTimeout(1200);
  // Stop with the pen this time.
  await penTap(page, '.timeline__rec');
  await expect(rec).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await state(page)).recs.length).toBe(1);
  const s = await state(page);
  expect(s.recs[0]!.size).toBeGreaterThan(0);
  expect(s.recs[0]!.mime).toMatch(/^audio\/(webm|mp4|ogg)/);
  expect(s.stamped).toBe(1);
  await expect(page.locator('.timeline__mark--ink')).toHaveCount(1);
  await expect(page.locator('.timeline__pick option')).toHaveCount(1);
  await expect(page.locator('.timeline__pick')).toContainText('Recording 1');
  // Play.
  const play = page.locator('.timeline__play');
  await expect(play).toBeEnabled();
  await play.tap();
  await expect(play).toHaveAttribute('aria-label', 'Pause', { timeout: 5000 });
  await penTap(page, '.timeline__play');
  await expect(play).toHaveAttribute('aria-label', 'Play');
  // Scrub: drag along the track with a finger; playback continues from there.
  const track = (await page.locator('.timeline__track').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const yMid = track.y + track.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: track.x + 4, y: yMid }],
  });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: track.x + 4 + (track.width * 0.6 * i) / 6, y: yMid }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const dur = s.recs[0]!.duration;
  await expect
    .poll(async () => (await state(page)).position, { timeout: 5000 })
    .toBeGreaterThan(dur * 0.4);
});

test('the microphone permission being off is explained, not silent', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
      },
    });
  });
  await openDemo(page);
  await page.locator('#notes-toggle').tap();
  await page.locator('.timeline__rec').tap();
  await expect(page.locator('#toast')).toContainText('Microphone permission is off');
  await expect(page.locator('#toast')).toContainText('Settings');
  await expect(page.locator('.timeline__rec')).toHaveAttribute('aria-pressed', 'false');
});
