import { expect, test, type Page } from '@playwright/test';
import {
  blankDocx,
  bridge,
  caretAtEnd,
  caretAtStart,
  CORPUS,
  openBytes,
  openDocx,
  saveBytes,
  xml,
  type LsWindow,
} from './engine-helpers';
import { consoleErrors, openDemo, ribbonButton, ribbonTab } from './helpers';

/** Selects a ribbon tab (clicking the selected tab again would collapse the ribbon). */
async function showTab(page: Page, id: string): Promise<void> {
  const tab = ribbonTab(page, id);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

// References and Review on the ONLYOFFICE engine, with round trips: what the
// ribbon makes must be in the saved .docx as Word's own XML, and must come back
// when that file is opened again.

const SHOTS = process.env['LS_SHOTS'];
const shot = async (page: Page, name: string): Promise<void> => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/rr-${name}.png` });
};

const texts = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as unknown as LsWindow).__ls.engine
      .paragraphs()
      .map((p) => p.text.replace(/\r?\n$/, '')),
  );
const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as LsWindow).__ls.engine.state;
    return { track: s.track, reviewMode: s.reviewMode };
  });

// Round trips open the engine twice per test.
test.setTimeout(90_000);

test.afterEach(({ page }) => {
  expect(consoleErrors(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { showOpenFilePicker: undefined, showSaveFilePicker: undefined });
  });
});

test('table of contents: insert with a style, update, save, reopen, remove', async ({ page }) => {
  await openDemo(page);
  await openDocx(page, 'word-poi-heading123.docx');
  await caretAtStart(page);
  await showTab(page, 'references');
  await ribbonButton(page, 'references.toc.table-of-contents').click();
  await expect(page.getByRole('option', { name: 'Automatic Table 1' })).toBeVisible();
  await shot(page, 'toc-gallery');
  await page.getByRole('option', { name: 'Automatic Table 1' }).click();
  await expect.poll(() => bridge<boolean>(page, 'hasToc')).toBe(true);
  await ribbonButton(page, 'references.toc.update-table').click();
  await expect(page.locator('#toast')).toContainText('Table of contents updated');
  await shot(page, 'toc');

  const saved = await saveBytes(page);
  const doc = xml(saved, 'word/document.xml');
  expect(doc).toContain('Table of Contents');
  expect(doc).toMatch(/TOC \\o &quot;1-3&quot;/);

  await openBytes(page, 'toc.docx', saved);
  await expect.poll(() => bridge<boolean>(page, 'hasToc')).toBe(true);
  await showTab(page, 'references');
  await ribbonButton(page, 'references.toc.table-of-contents').click();
  await page.getByRole('menuitem', { name: 'Remove Table of Contents' }).click();
  await expect.poll(() => bridge<boolean>(page, 'hasToc')).toBe(false);
});

test('footnotes and endnotes: insert, navigate, save, reopen', async ({ page }) => {
  await openDemo(page);
  await blankDocx(page);
  await page.keyboard.type('Body text with notes');
  await showTab(page, 'references');
  await ribbonButton(page, 'references.footnotes.insert-footnote').click();
  await page.keyboard.type('Footnote one');
  await caretAtEnd(page);
  await ribbonButton(page, 'references.footnotes.insert-endnote').click();
  await page.keyboard.type('Endnote one');
  await shot(page, 'footnotes');
  await caretAtStart(page);
  await ribbonButton(page, 'references.footnotes.show-notes').click();
  await expect(page.locator('#toast')).toContainText('1 footnote, 1 endnote');

  const saved = await saveBytes(page);
  expect(xml(saved, 'word/document.xml')).toContain('w:footnoteReference');
  expect(xml(saved, 'word/document.xml')).toContain('w:endnoteReference');
  expect(xml(saved, 'word/footnotes.xml')).toContain('Footnote one');
  expect(xml(saved, 'word/endnotes.xml')).toContain('Endnote one');

  await openBytes(page, 'notes.docx', saved);
  expect(await bridge(page, 'noteCounts')).toEqual({ footnotes: 1, endnotes: 1 });
});

test('comments: author name, new, reply, resolve; they survive a round trip', async ({ page }) => {
  await openDemo(page);
  await page.evaluate(() => {
    (window as unknown as LsWindow).__ls.app.openBackstage('file.settings.options');
  });
  const name = page.getByTestId('author-name');
  await name.fill('Ada Lovelace');
  await name.press('Tab');
  await blankDocx(page);
  await page.keyboard.type('Please check this sentence.');
  for (let i = 0; i < 9; i++) await page.keyboard.press('Shift+ArrowLeft');
  await showTab(page, 'review');
  await ribbonButton(page, 'review.comments.new-comment').click();
  await page.getByTestId('comment-form').locator('input').fill('Is this right?');
  await page.getByTestId('comment-form').locator('input').press('Enter');
  await expect.poll(async () => (await bridge<unknown[]>(page, 'commentList')).length).toBe(1);

  await ribbonButton(page, 'review.comments.show-comments').click();
  const pane = page.getByTestId('comments-pane');
  await expect(pane).toContainText('Ada Lovelace');
  await expect(pane).toContainText('Is this right?');
  await pane.getByRole('textbox', { name: 'Reply' }).fill('Yes, it is.');
  await pane.getByRole('textbox', { name: 'Reply' }).press('Enter');
  await expect(pane).toContainText('Yes, it is.');
  await pane.getByTestId('comment-resolve').click();
  await expect(pane).toContainText('Resolved');
  await shot(page, 'comments');
  await page.keyboard.press('Escape');

  const saved = await saveBytes(page);
  const comments = xml(saved, 'word/comments.xml');
  expect(comments).toContain('Is this right?');
  expect(comments).toContain('Yes, it is.');
  expect(comments).toContain('w:author="Ada Lovelace"');
  expect(xml(saved, 'word/document.xml')).toContain('w:commentRangeStart');
  expect(xml(saved, 'word/commentsExtended.xml')).toContain('w15:done="1"');

  await openBytes(page, 'comments.docx', saved);
  const list = await bridge<{ text: string; solved: boolean; replies: { text: string }[] }[]>(
    page,
    'commentList',
  );
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ text: 'Is this right?', solved: true });
  expect(list[0]!.replies.map((r) => r.text)).toEqual(['Yes, it is.']);

  await showTab(page, 'review');
  await ribbonButton(page, 'review.comments.next').click();
  await ribbonButton(page, 'review.comments.delete').click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect.poll(async () => (await bridge<unknown[]>(page, 'commentList')).length).toBe(0);
});

test('Track Changes: marked edits, display modes, round trip, accept and reject', async ({
  page,
}) => {
  await openDemo(page);
  await blankDocx(page);
  await page.keyboard.type('Original text.');
  await showTab(page, 'review');
  await ribbonButton(page, 'review.tracking.track-changes').click();
  await expect(ribbonButton(page, 'review.tracking.track-changes')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.type(' Added');
  await caretAtStart(page);
  for (let i = 0; i < 9; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Delete');
  await expect.poll(() => bridge<number>(page, 'revisionCount')).toBeGreaterThan(0);
  await shot(page, 'track-changes');

  await ribbonButton(page, 'review.tracking.display-for-review').click();
  await shot(page, 'display-modes');
  await page.getByRole('menuitemradio', { name: /Original/ }).click();
  await expect.poll(async () => (await state(page)).reviewMode).toBe(2);
  await ribbonButton(page, 'review.tracking.display-for-review').click();
  await page.getByRole('menuitemradio', { name: /No Markup/ }).click();
  await expect.poll(async () => (await state(page)).reviewMode).toBe(1);
  await ribbonButton(page, 'review.tracking.display-for-review').click();
  await page.getByRole('menuitemradio', { name: /Simple Markup/ }).click();
  await expect.poll(async () => (await state(page)).reviewMode).toBe(3);
  await ribbonButton(page, 'review.tracking.display-for-review').click();
  await page.getByRole('menuitemradio', { name: /All Markup/ }).click();
  await expect.poll(async () => (await state(page)).reviewMode).toBe(0);

  const saved = await saveBytes(page);
  const doc = xml(saved, 'word/document.xml');
  expect(doc).toMatch(/<w:ins [^>]*w:author="Me"/);
  expect(doc).toMatch(/<w:del [^>]*w:author="Me"/);
  expect(doc).toContain('<w:delText');
  const settingsXml = xml(saved, 'word/settings.xml');
  expect(settingsXml).toContain('w:trackRevisions');
  expect(settingsXml).not.toContain('w:trackRevisions w:val="false"');

  await openBytes(page, 'tracked.docx', saved);
  await expect.poll(() => bridge<number>(page, 'revisionCount')).toBeGreaterThan(0);
  expect((await state(page)).track).toBe(true);

  // Reject everything: back to the original text.
  await showTab(page, 'review');
  await ribbonButton(page, 'review.changes.reject').click();
  await page.getByRole('menuitem', { name: /Reject All Changes/ }).click();
  await expect.poll(() => bridge<number>(page, 'revisionCount')).toBe(0);
  await expect.poll(async () => (await texts(page))[0]).toBe('Original text.');
  await page.locator('[data-qat="qat.undo"]').click();
  await expect.poll(() => bridge<number>(page, 'revisionCount')).toBeGreaterThan(0);

  // Accept everything: the edited text.
  await ribbonButton(page, 'review.changes.accept').click();
  await page.getByRole('menuitem', { name: /Accept All Changes/ }).click();
  await expect.poll(() => bridge<number>(page, 'revisionCount')).toBe(0);
  await expect.poll(async () => (await texts(page))[0]).toBe('text. Added');
});

test('captions and cross-references round trip as fields', async ({ page }) => {
  await openDemo(page);
  await blankDocx(page);
  await page.keyboard.type('Intro');
  await page.keyboard.press('Enter');
  await showTab(page, 'references');
  await ribbonButton(page, 'references.captions.insert-caption').click();
  await page.getByTestId('caption-form').getByRole('button', { name: 'Insert' }).click();
  await expect
    .poll(async () => (await texts(page)).some((t) => t.startsWith('Figure 1')))
    .toBe(true);
  await caretAtEnd(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('See ');
  await ribbonButton(page, 'references.captions.cross-reference').click();
  const f = page.getByTestId('xref-form');
  await f.getByLabel('Reference type').selectOption('Figure');
  await expect(f.getByLabel('For which')).toContainText('Figure 1');
  await shot(page, 'cross-reference');
  await f.getByRole('button', { name: 'Insert' }).click();
  await expect.poll(async () => (await texts(page)).at(-1)).toBe('See Figure 1');

  const saved = await saveBytes(page);
  const doc = xml(saved, 'word/document.xml');
  expect(doc).toMatch(/SEQ Figure/);
  expect(doc).toMatch(/REF _Ref\d+/);
  await openBytes(page, 'captions.docx', saved);
  expect(await bridge<string[]>(page, 'crossRefTargets', 'Figure')).toHaveLength(1);
});

test('Compare marks the differences with another .docx as tracked changes', async ({ page }) => {
  await openDemo(page);
  await openDocx(page, '01-basic.docx');
  await showTab(page, 'review');
  const chooser = page.waitForEvent('filechooser');
  await ribbonButton(page, 'review.compare.compare').click();
  await (await chooser).setFiles(new URL('02-styles.docx', CORPUS).pathname);
  await expect
    .poll(() => bridge<number>(page, 'revisionCount'), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await expect(page.locator('#toast')).toContainText('Compared with 02-styles.docx');
  await shot(page, 'compare');
});

test('Layout: columns and section breaks round trip; word count; language', async ({ page }) => {
  await openDemo(page);
  await blankDocx(page);
  await page.keyboard.type('One two three four');
  await showTab(page, 'layout');
  await ribbonButton(page, 'layout.page-setup.columns').click();
  await page.getByRole('menuitemradio', { name: 'Two' }).click();
  await expect.poll(() => bridge<number>(page, 'columnCount')).toBe(2);
  await ribbonButton(page, 'layout.page-setup.breaks').click();
  await page.getByRole('menuitem', { name: /Next Page/ }).click();
  await expect.poll(() => bridge<number>(page, 'sectionCount')).toBe(2);
  await shot(page, 'columns');

  await caretAtStart(page);
  await showTab(page, 'review');
  await ribbonButton(page, 'review.proofing.word-count').click();
  await expect(page.getByTestId('word-count')).toContainText('Words4');
  await page.keyboard.press('Escape');

  await caretAtStart(page);
  await page.keyboard.press('Shift+End');
  await ribbonButton(page, 'review.language.language').click();
  await page.getByRole('menuitem', { name: 'French (France)' }).first().click();

  const saved = await saveBytes(page);
  const doc = xml(saved, 'word/document.xml');
  expect(doc).toMatch(/<w:cols [^>]*w:num="2"/);
  expect(doc.match(/<w:sectPr/g)?.length).toBe(2);
  expect(doc).toContain('w:val="fr-FR"');
});

test('Citations, index and table of authorities say plainly they are not available', async ({
  page,
}) => {
  await openDemo(page);
  await blankDocx(page);
  await showTab(page, 'references');
  await ribbonButton(page, 'references.citations.insert-citation').click();
  await expect(page.locator('#toast')).toContainText(
    "Citations and bibliographies aren't available yet",
  );
  await ribbonButton(page, 'references.index.insert-index').click();
  await expect(page.locator('#toast')).toContainText(
    "Index entries and indexes aren't available yet",
  );
});

test('Assistant suggestions in an engine document land as tracked changes', async ({ page }) => {
  await openDemo(page, 'ai=mock');
  await blankDocx(page);
  await page.keyboard.type('i think teh plan is very good and they was right about it.');
  await showTab(page, 'review');
  await ribbonButton(page, 'review.assistant.ai-models').click();
  await page.getByTestId('ai-enabled').check();
  await page.getByTestId('ai-download-baseline').click();
  await expect(page.getByTestId('ai-ready')).toBeVisible({ timeout: 10_000 });
  await page.locator('.ai-models__close').click();

  await caretAtStart(page);
  await ribbonButton(page, 'review.assistant.fix-grammar').click();
  await expect(page.getByTestId('ai-diff')).toBeVisible();
  await shot(page, 'ai-suggestion');
  await page.getByTestId('ai-accept').click();
  await expect(page.locator('#toast')).toContainText('Added as a tracked change');
  await expect.poll(() => bridge<number>(page, 'revisionCount')).toBeGreaterThan(0);
  // Track Changes goes back to how it was (off).
  expect((await state(page)).track).toBe(false);
  await shot(page, 'ai-tracked');

  const saved = await saveBytes(page);
  const doc = xml(saved, 'word/document.xml');
  expect(doc).toContain('<w:ins ');
  expect(doc).toContain('<w:del ');

  await ribbonButton(page, 'review.changes.accept').click();
  await page.getByRole('menuitem', { name: /Accept All Changes/ }).click();
  await expect
    .poll(async () => (await texts(page))[0])
    .toContain('I think the plan is very good and they were right');
});

test.describe('Galaxy Tab landscape (1024×640, touch)', () => {
  test.use({ viewport: { width: 1024, height: 640 }, hasTouch: true, isMobile: true });

  /** Taps a ribbon command, opening its collapsed group first. */
  async function tapCommand(page: Page, id: string): Promise<void> {
    const ribbon = page.locator('ls-ribbon');
    const cmd = ribbon.locator(`[data-command="${id}"]`).first();
    if (!(await cmd.isVisible())) {
      const group = id.split('.').slice(0, 2).join('.');
      await ribbon.locator(`[data-group="${group}"]`).first().tap();
    }
    await ribbon.locator(`[data-command="${id}"]:visible`).first().tap();
  }

  test('Review and References commands work by touch', async ({ page }) => {
    await openDemo(page);
    await openDocx(page, '01-basic.docx');
    const ribbon = page.locator('ls-ribbon');
    await ribbon.locator('[data-tab="review"]').first().tap();
    await tapCommand(page, 'review.tracking.track-changes');
    await expect.poll(async () => (await state(page)).track).toBe(true);
    await caretAtEnd(page);
    await page.keyboard.type(' Tablet edit.');
    await expect.poll(() => bridge<number>(page, 'revisionCount')).toBeGreaterThan(0);
    await tapCommand(page, 'review.tracking.display-for-review');
    await expect(page.getByRole('menuitemradio', { name: /Simple Markup/ })).toBeVisible();
    await shot(page, 'tablet-review');
    await page.getByRole('menuitemradio', { name: /Simple Markup/ }).tap();
    await expect.poll(async () => (await state(page)).reviewMode).toBe(3);

    await ribbon.locator('[data-tab="references"]').first().tap();
    await tapCommand(page, 'references.footnotes.insert-footnote');
    await page.keyboard.type('A tablet footnote');
    await expect
      .poll(async () => (await bridge<{ footnotes: number }>(page, 'noteCounts')).footnotes)
      .toBe(1);
    await shot(page, 'tablet-references');
  });
});

test.describe('Phone (412×915, touch)', () => {
  test.use({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    hasTouch: true,
    isMobile: true,
  });

  /** The phone command sheet for a tab, opened unless it already shows `command`. */
  async function sheet(page: Page, tab: string, command: string) {
    const ribbon = page.locator('ls-ribbon');
    const s = ribbon.locator('.ls-sheet');
    if (await s.locator(`[data-command="${command}"]`).isVisible()) return s;
    if (await s.isVisible()) await s.getByRole('button', { name: 'Collapse commands' }).tap();
    await ribbon.locator('.ls-picker-btn').tap();
    await ribbon.locator(`[data-tab="${tab}"]`).tap();
    await expect(s.locator(`[data-command="${command}"]`)).toBeVisible();
    return s;
  }

  test('Review and References from the phone sheets; popovers are bottom sheets', async ({
    page,
  }) => {
    await openDemo(page);
    await openDocx(page, '01-basic.docx');
    await caretAtEnd(page);
    let s = await sheet(page, 'review', 'review.comments.new-comment');
    await s.locator('[data-command="review.comments.new-comment"]').tap();
    const f = page.getByTestId('comment-form');
    await f.locator('input').fill('From my phone');
    await shot(page, 'phone-comment');
    await f.locator('input').press('Enter');
    await expect.poll(async () => (await bridge<unknown[]>(page, 'commentList')).length).toBe(1);

    s = await sheet(page, 'review', 'review.comments.show-comments');
    await s.locator('[data-command="review.comments.show-comments"]').tap();
    const pane = page.getByTestId('comments-pane');
    await expect(pane).toContainText('From my phone');
    const box = (await pane.boundingBox())!;
    expect(box.width).toBeGreaterThan(300);
    await shot(page, 'phone-comments');
    await page.keyboard.press('Escape');

    s = await sheet(page, 'review', 'review.tracking.track-changes');
    await s.locator('[data-command="review.tracking.track-changes"]').tap();
    await expect.poll(async () => (await state(page)).track).toBe(true);

    s = await sheet(page, 'references', 'references.toc.table-of-contents');
    await s.locator('[data-command="references.toc.table-of-contents"]').tap();
    await expect(page.getByRole('option', { name: 'Automatic Table 1' })).toBeVisible();
    await shot(page, 'phone-toc');
    await page.getByRole('option', { name: 'Automatic Table 1' }).tap();
    await expect.poll(() => bridge<boolean>(page, 'hasToc')).toBe(true);
  });
});
