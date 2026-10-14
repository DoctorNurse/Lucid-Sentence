import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// 0.1.7-preview launched straight into the sample, and on a tablet the way to a new
// document was buried; ink, Notes and recordings only worked on the sample's canvas, and
// Notes on a new .docx was a dead end. Launch must offer New / Open / Recent (the sample is
// only the Tour), and new documents must take typing, ink and recordings. Runs at Galaxy Tab
// size, with touch, under the app's CSP (tauri.conf.json), like the Android app.
const conf = JSON.parse(
  readFileSync(new URL('../apps/shell/src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { app: { security: { csp: Record<string, string> } } };
const CSP = Object.entries(conf.app.security.csp)
  .map(([k, v]) => `${k} ${v}`)
  .join('; ');
const SHOTS = process.env['LS_SHOTS'];

test.use({ viewport: { width: 1024, height: 640 }, hasTouch: true, isMobile: true });

interface Hooks {
  __ls: {
    engine: { active: boolean };
    ink: { strokes: unknown[] };
    audio: { doc: string; recordings: { doc?: string }[]; docRecordings: unknown[] };
  };
}

async function launch(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    await route.fulfill({
      response: res,
      headers: { ...res.headers(), 'content-security-policy': CSP },
    });
  });
  await page.goto('/?promos=off&load=0&draft=off&start=on');
  await expect.poll(() => page.evaluate(() => '__ls' in window)).toBe(true);
}
const name = (page: Page): Promise<string | null> => page.locator('#doc-name').textContent();
const engineActive = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as Hooks).__ls.engine.active);

async function fileNew(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'File' }).first().tap();
  await page.getByText('New', { exact: true }).first().tap();
}

test('launch shows a start screen, not the sample', async ({ page }) => {
  await launch(page);
  const start = page.locator('.bs[data-page="file.rail.home"]');
  await expect(start).toBeVisible();
  for (const label of ['Blank document', 'New note', 'Open…', 'Tour: Quarterly Notes'])
    await expect(start.getByText(label, { exact: true })).toBeVisible();
  await expect(start.locator('[data-recent]')).toBeVisible();
  expect(await name(page)).not.toBe('Quarterly-Notes.docx');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/new-start.png` });
  // Back (the Recent row) never lands on the sample.
  await start.locator('[data-recent]').tap();
  await expect(page.locator('#doc')).not.toContainText('Quarterly Notes');
});

test('New blank document is a typable .docx, numbered Document1, Document2', async ({ page }) => {
  await launch(page);
  await page.getByText('Blank document', { exact: true }).tap();
  await expect.poll(() => engineActive(page), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => name(page)).toBe('Document1.docx');
  await expect(page.locator('.engine-status')).toBeHidden({ timeout: 30_000 });
  await page.locator('.engine-frame').tap({ position: { x: 300, y: 200 } });
  await page.keyboard.type('Hello tablet');
  await expect(page.locator('#words')).toHaveText('2 words');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/new-typed.png` });
  // A second new document (discarding the first) is Document2.
  page.once('dialog', (d) => void d.accept());
  await fileNew(page);
  await page.getByText('Blank document', { exact: true }).tap();
  await expect.poll(() => name(page), { timeout: 30_000 }).toBe('Document2.docx');
});

test('New note takes ink; Notes on a .docx starts a new note; recordings stay per document', async ({
  page,
}) => {
  await launch(page);
  await page.locator('.bs').getByText('New note', { exact: true }).tap();
  await expect.poll(() => name(page)).toMatch(/^Notes\d+\.docx$/);
  const first = await name(page);
  await page.locator('#notes-toggle').tap();
  await expect(page.locator('body')).toHaveClass(/notes/);
  const box = (await page.locator('#page').boundingBox())!;
  await page.mouse.move(box.x + 120, box.y + 140);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 170, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Hooks).__ls.ink.strokes.length))
    .toBeGreaterThan(0);
  const noteDoc = await page.evaluate(() => (window as unknown as Hooks).__ls.audio.doc);
  // A recording made now belongs to this note.
  await page.evaluate(() => {
    const a = (window as unknown as Hooks).__ls.audio;
    a.recordings.push({ id: 'rec-test', doc: a.doc } as never);
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/new-note-ink.png` });

  // A new .docx: none of the note's recordings.
  await page.locator('#notes-toggle').tap();
  await fileNew(page);
  await page.getByText('Blank document', { exact: true }).tap();
  await expect.poll(() => engineActive(page), { timeout: 30_000 }).toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as Hooks).__ls.audio.docRecordings.length),
  ).toBe(0);
  await expect(page.locator('.engine-status')).toBeHidden({ timeout: 30_000 });

  // Notes on the .docx starts a new notes document (it used to only show a toast).
  await page.locator('#notes-toggle').tap();
  await expect.poll(() => engineActive(page)).toBe(false);
  await expect(page.locator('body')).toHaveClass(/notes/);
  await expect.poll(() => name(page)).not.toBe(first);
  expect(await page.evaluate(() => (window as unknown as Hooks).__ls.ink.strokes.length)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as Hooks).__ls.audio.doc)).not.toBe(noteDoc);
  // The Notes bar has New note too.
  const before = await name(page);
  await page.locator('#notesbar [data-notes="new"]').tap();
  await expect.poll(() => name(page)).not.toBe(before);
});
