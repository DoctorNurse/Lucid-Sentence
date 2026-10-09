import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
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

/** One file out of a .zip (.docx), read through the central directory. */
function zipEntry(zip: Buffer, name: string): Buffer | null {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let at = zip.readUInt32LE(eocd + 16);
  const count = zip.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const entry = zip.toString('utf8', at + 46, at + 46 + nameLen);
    if (entry === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    }
    at += 46 + nameLen + extra + comment;
  }
  return null;
}
const zipNames = (zip: Buffer): string[] => {
  const names: string[] = [];
  for (
    let i = zip.indexOf('PK\x01\x02', 0, 'latin1');
    i >= 0;
    i = zip.indexOf('PK\x01\x02', i + 4, 'latin1')
  )
    names.push(zip.toString('utf8', i + 46, i + 46 + zip.readUInt16LE(i + 28)));
  return names;
};

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

test('pictures in an opened .docx load from the file', async ({ page }) => {
  await openDocx(page, '05-images.docx');
  // Every picture must point at the bytes from the file (a blob: URL), not at a
  // server path the offline editor can't reach.
  const urls = await page.evaluate(() => {
    const w = (document.querySelector('.engine-frame') as HTMLIFrameElement)
      .contentWindow as unknown as {
      AscCommon: { g_oDocumentUrls: { urls: Record<string, string> } };
    };
    return Object.entries(w.AscCommon.g_oDocumentUrls.urls).filter(([k]) => k.startsWith('media/'));
  });
  expect(urls.length).toBeGreaterThan(0);
  for (const [, url] of urls) expect(url).toMatch(/^blob:/);
  const loaded = await page.evaluate(
    (list) => Promise.all(list.map(([, u]) => fetch(u).then((r) => r.ok))),
    urls,
  );
  expect(loaded.every(Boolean)).toBe(true);
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
  await ribbonButton(page, 'insert.illustrations.chart').click();
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

const engineFlags = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as {
        __ls: { engine: { state: { inTable: boolean; image: boolean; inHeader: boolean } } };
      }
    ).__ls.engine.state;
    return { inTable: s.inTable, image: s.image, inHeader: s.inHeader };
  });

test('Insert Table and Pictures from the ribbon; Save keeps both', async ({ page }) => {
  await openDocx(page, '01-basic.docx');
  await caretAtEndOf(page, 1);
  await page.keyboard.press('Enter');
  await page.locator('ls-ribbon [data-tab="insert"]').first().click();
  await ribbonButton(page, 'insert.tables.table').click();
  await page.getByRole('button', { name: '3 by 2 table' }).click();
  await expect.poll(async () => (await engineFlags(page)).inTable).toBe(true);
  // Table Design and Table Layout appear while the caret is in a table.
  await expect(page.locator('ls-ribbon [data-tab="table-layout"]').first()).toBeVisible();
  await page.locator('ls-ribbon [data-tab="table-layout"]').first().click();
  await ribbonButton(page, 'table-layout.rows-columns.insert-below').click();

  await caretAtEndOf(page, 0);
  await page.locator('ls-ribbon [data-tab="insert"]').first().click();
  await ribbonButton(page, 'insert.illustrations.pictures').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /This Device/ }).click();
  await (
    await chooser
  ).setFiles(new URL('../apps/demo/public/icon-192.png', import.meta.url).pathname);
  await expect.poll(async () => (await engineFlags(page)).image).toBe(true);
  await expect(page.locator('ls-ribbon [data-tab="picture-format"]').first()).toBeVisible();

  const download = page.waitForEvent('download');
  await page.locator('[data-qat="qat.save"]').click();
  const zip = readFileSync(await (await download).path());
  expect(zipNames(zip).some((n) => /^word\/media\/.+\.png$/.test(n))).toBe(true);
  const xml = zipEntry(zip, 'word/document.xml')!.toString('utf8');
  expect(xml).toMatch(/<w:tbl>/);
  expect(xml).toMatch(/r:embed="/);
  // The original 2x2 table plus the new one, which has 3 rows after Insert Below.
  expect((xml.match(/<w:tbl>/g) ?? []).length).toBe(2);
});

test('File > Export > PDF lays the document out with its fonts', async ({ page }) => {
  await openDocx(page, '03-lists.docx');
  await page.evaluate(() => {
    const w = window as unknown as { __ls: { app: { openBackstage(id: string): void } } };
    w.__ls.app.openBackstage('file.rail.export');
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^PDF/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('03-lists.pdf');
  const pdf = readFileSync(await file.path());
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  // Fonts are embedded (subset), so the PDF reads the same everywhere.
  expect(pdf.toString('latin1')).toMatch(/FontFile2/);
});

test('Header & Footer: edit the header, then close it', async ({ page }) => {
  await openDocx(page, '01-basic.docx');
  await page.locator('ls-ribbon [data-tab="insert"]').first().click();
  await ribbonButton(page, 'insert.header-footer.header').click();
  await expect.poll(async () => (await engineFlags(page)).inHeader).toBe(true);
  await expect(page.locator('ls-ribbon [data-tab="header-footer"]').first()).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.type('Running head');
  await ribbonButton(page, 'header-footer.close.close').click();
  await expect.poll(async () => (await engineFlags(page)).inHeader).toBe(false);

  const download = page.waitForEvent('download');
  await page.locator('[data-qat="qat.save"]').click();
  const zip = readFileSync(await (await download).path());
  const header = zipNames(zip).find((n) => /^word\/header\d*\.xml$/.test(n));
  expect(header).toBeTruthy();
  expect(zipEntry(zip, header!)!.toString('utf8')).toContain('Running head');
});

test('Spelling finds misspelled words and replaces them with a suggestion', async ({ page }) => {
  await openDocx(page, '01-basic.docx');
  await caretAtEndOf(page, 1);
  await page.keyboard.type(' Thsi sentnce');
  // sdkjs leaves the word being typed alone until the caret moves off it.
  await page.keyboard.press('Home');
  const count = () =>
    page.evaluate(() =>
      (
        window as unknown as { __ls: { engine: { misspellingCount(): number } } }
      ).__ls.engine.misspellingCount(),
    );
  await expect.poll(count, { timeout: 15_000 }).toBe(2);
  await page.locator('ls-ribbon [data-tab="review"]').first().click();
  await ribbonButton(page, 'review.proofing.spelling-grammar').click();
  await page.getByRole('menuitem', { name: 'This', exact: true }).click();
  await expect.poll(count).toBe(1);
  expect((await paragraphs(page))[1]?.text).toContain('This sentnce');
});

test('opens a document saved by Microsoft Word, with its pages and fonts', async ({ page }) => {
  // Apache POI test document (Word 2007): page 1 in Calibri, page 2 in blue Arial Black.
  await openDocx(page, 'word-poi-SampleDoc.docx');
  const ps = await paragraphs(page);
  expect(ps.map((p) => p.text)).toContain('I am a test document');
  await expect(page.locator('#pageinfo')).toHaveText(/of 2/);
});
