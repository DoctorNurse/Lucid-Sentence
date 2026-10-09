import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
// @ts-expect-error: plain ESM helper shared with the fidelity eval
import { model } from '../engine/fidelity/docx-model.mjs';
import { consoleErrors, openDemo, ribbonButton } from './helpers';

/** Paragraph view of a .docx, from engine/fidelity/docx-model.mjs. */
interface DocxModel {
  paragraphs: { text: string; style: string; list: boolean; runs: string[] }[];
}
const readModel = model as (b: Buffer) => DocxModel;

const CORPUS = new URL('../engine/fidelity/corpus/', import.meta.url);

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  // Use the <input> and download routes (headless Chromium's file pickers can't be driven).
  await page.addInitScript(() => {
    Object.assign(window, { showOpenFilePicker: undefined, showSaveFilePicker: undefined });
  });
  await openDemo(page);
});

interface EngineView {
  active: boolean;
  bold: boolean;
  list: 'bullet' | 'number' | null;
  style: string;
}
const engineState = (page: Page): Promise<EngineView> =>
  page.evaluate(() => {
    const e = (
      window as unknown as {
        __ls: { engine: { active: boolean; state: Omit<EngineView, 'active'> } };
      }
    ).__ls.engine;
    return { active: e.active, ...e.state };
  });
const paragraphs = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __ls: { engine: { paragraphs(): { text: string; style: string }[] } } }
    ).__ls.engine
      .paragraphs()
      .map((p) => ({ text: p.text.replace(/\r?\n$/, ''), style: p.style })),
  );

async function openDocx(page: Page, file: string): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { __ls: { app: { openBackstage(id: string): void } } }
    ).__ls.app.openBackstage('file.rail.open');
  });
  await page.locator('#open-file').setInputFiles(new URL(file, CORPUS).pathname);
  await expect.poll(async () => (await engineState(page)).active, { timeout: 20_000 }).toBe(true);
  await expect(page.locator('body')).toHaveClass(/\bengine\b/);
  await expect(page.locator('.engine-frame')).toBeVisible();
}

/** Put the caret at the end of paragraph `n` (0-based) and give the editor the keyboard. */
async function caretAtEndOf(page: Page, n: number): Promise<void> {
  await page.evaluate(() => {
    const w = (document.querySelector('.engine-frame') as HTMLIFrameElement)
      .contentWindow as unknown as {
      LucidApi: { WordControl: { m_oLogicDocument: { MoveCursorToStartPos(): void } } };
    };
    w.LucidApi.WordControl.m_oLogicDocument.MoveCursorToStartPos();
    (window as unknown as { __ls: { engine: { focus(): void } } }).__ls.engine.focus();
  });
  for (let i = 0; i < n; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
}

test('opens a .docx in the engine and shows its content', async ({ page }) => {
  await openDocx(page, '01-basic.docx');
  const ps = await paragraphs(page);
  expect(ps[0]).toEqual({ text: 'Spike heading', style: 'Heading 1' });
  expect(ps.map((p) => p.text)).toContain('Hello bold and italic and underlined text.');
  await expect(page.locator('#doc-name')).toHaveText('01-basic.docx');
  await expect(page.locator('#pageinfo')).toHaveText(/Page 1 of 1/);
  await page.screenshot({ path: test.info().outputPath('engine-open.png') });
});

test('the ribbon drives bold, styles, lists, and undo; Save writes a .docx', async ({ page }) => {
  await openDocx(page, '01-basic.docx');
  // Second paragraph ("Hello bold and italic…", Normal style).
  await caretAtEndOf(page, 1);
  await page.keyboard.type(' typed');
  // Select the word just typed and bold it from the ribbon.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
  await ribbonButton(page, 'home.font.bold').click();
  await expect.poll(async () => (await engineState(page)).bold).toBe(true);
  await expect(ribbonButton(page, 'home.font.bold')).toHaveAttribute('aria-pressed', 'true');

  // Same paragraph, caret only (with text selected, Word applies a linked style
  // like Heading 2 to the selection alone): apply Heading 2 from the Styles gallery.
  await page.keyboard.press('End');
  await ribbonButton(page, 'home.styles.gallery').click();
  await page.getByRole('option', { name: 'Heading 2' }).click();
  await expect.poll(async () => (await paragraphs(page))[1]?.style).toBe('Heading 2');

  // Bullets on, then Undo takes it back off.
  await ribbonButton(page, 'home.paragraph.bullets').click();
  await expect.poll(async () => (await engineState(page)).list).toBe('bullet');
  await page.locator('[data-qat="qat.undo"]').click();
  await expect.poll(async () => (await engineState(page)).list).toBe(null);
  await expect(page.locator('#saved')).toHaveText('Edited');

  const download = page.waitForEvent('download');
  await page.locator('[data-qat="qat.save"]').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('01-basic.docx');
  const saved = readModel(readFileSync(await file.path()));
  expect(saved.paragraphs[0]!.text).toBe('Spike heading');
  expect(saved.paragraphs[1]!.text).toBe('Hello bold and italic and underlined text. typed');
  expect(saved.paragraphs[1]!.runs).toContain('b: typed');
  expect(saved.paragraphs[1]!.style).toBe('heading 2');
  expect(saved.paragraphs[1]!.list).toBe(false);
  await expect(page.locator('#saved')).toHaveText('Saved');
});

test('commands the engine does not run yet say so', async ({ page }) => {
  await openDocx(page, '01-basic.docx');
  await page.locator('ls-ribbon [data-tab="insert"]').first().click();
  await ribbonButton(page, 'insert.tables.table').click();
  await expect(page.locator('#toast')).toContainText("isn't connected to the document engine yet");
});

test('ink and Notes mode still work on a notes page after a .docx', async ({ page }) => {
  await openDocx(page, '01-basic.docx');
  await page.evaluate(() => {
    const w = window as unknown as { __ls: { app: { openBackstage(id: string): void } } };
    w.__ls.app.openBackstage('file.rail.new');
  });
  await page.getByRole('button', { name: /Blank notes page/ }).click();
  await expect(page.locator('body')).not.toHaveClass(/\bengine\b/);
  await expect(page.locator('#doc')).toBeVisible();
  await page.locator('#notes-toggle').click();
  await expect(page.locator('body')).toHaveClass(/\bnotes\b/);
  await expect(page.locator('#notesbar')).toBeVisible();
});

test('a blank document starts in the engine', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as { __ls: { app: { openBackstage(id: string): void } } };
    w.__ls.app.openBackstage('file.rail.new');
  });
  await page.getByRole('button', { name: /^Blank document/ }).click();
  await expect.poll(async () => (await engineState(page)).active, { timeout: 20_000 }).toBe(true);
  await expect(page.locator('#doc-name')).toHaveText('Document1.docx');
});
