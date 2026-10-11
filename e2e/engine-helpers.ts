import { inflateRawSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';

export const CORPUS = new URL('../engine/fidelity/corpus/', import.meta.url);

/** The bridge and sdkjs API of the open document, for page.evaluate callbacks. */
export interface LsWindow {
  __ls: {
    engine: {
      active: boolean;
      state: Record<string, unknown> & { track: boolean; reviewMode: number };
      paragraphs(): { text: string; style: string }[];
      focus(): void;
      peek<T>(fn: (b: Record<string, (...a: unknown[]) => unknown>, api: unknown) => T): T;
    };
    app: { openBackstage(id: string): void };
  };
}

export const isActive = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as LsWindow).__ls.engine.active);

/** Calls a bridge function on the open document. */
export const bridge = <T>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(
    ({ fn, args }) =>
      (window as unknown as LsWindow).__ls.engine.peek((b, api) => b[fn]!(api, ...args)) as T,
    { fn, args },
  );

async function openFrom(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as LsWindow).__ls.app.openBackstage('file.rail.open');
  });
  await page.locator('#open-file').setInputFiles(file);
  // The previous document stays active until this one has loaded: wait for its name.
  const name = typeof file === 'string' ? file.split('/').pop()! : file.name;
  await expect(page.locator('#doc-name')).toHaveText(name, { timeout: 30_000 });
  await expect(page.locator('.engine-frame')).toHaveCount(1);
  await expect.poll(() => isActive(page), { timeout: 20_000 }).toBe(true);
}

export const openDocx = (page: Page, name: string): Promise<void> =>
  openFrom(page, new URL(name, CORPUS).pathname);

/** Opens bytes as a .docx (a file saved earlier in the test). */
export const openBytes = (page: Page, name: string, buffer: Buffer): Promise<void> =>
  openFrom(page, {
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer,
  });

/** A new blank document in the engine. */
export async function blankDocx(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as LsWindow).__ls.app.openBackstage('file.rail.new');
  });
  await page
    .getByRole('button', { name: /Blank document/i })
    .first()
    .click();
  await expect.poll(() => isActive(page), { timeout: 20_000 }).toBe(true);
}

/** Caret at the start of the document (and the keyboard in the engine). */
export async function caretAtStart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = (document.querySelector('.engine-frame') as HTMLIFrameElement)
      .contentWindow as unknown as {
      LucidApi: { WordControl: { m_oLogicDocument: { MoveCursorToStartPos(): void } } };
    };
    w.LucidApi.WordControl.m_oLogicDocument.MoveCursorToStartPos();
    (window as unknown as LsWindow).__ls.engine.focus();
  });
}

/** Caret at the end of the document. */
export async function caretAtEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = (document.querySelector('.engine-frame') as HTMLIFrameElement)
      .contentWindow as unknown as {
      LucidApi: {
        WordControl: {
          m_oLogicDocument: {
            MoveCursorToEndPos(): void;
            SetDocPosType(t: number): void;
            RemoveSelection(): void;
          };
        };
      };
    };
    const d = w.LucidApi.WordControl.m_oLogicDocument;
    // Back to the body (from a footnote or a header), then to its end.
    d.RemoveSelection();
    d.SetDocPosType(0);
    d.MoveCursorToEndPos();
    (window as unknown as LsWindow).__ls.engine.focus();
  });
}

/** Saves through the Quick Access Save button (the download route) and returns the bytes. */
export async function saveBytes(page: Page): Promise<Buffer> {
  const { readFileSync } = await import('node:fs');
  const download = page.waitForEvent('download');
  await page.locator('[data-qat="qat.save"]').click();
  const file = await download;
  const bytes = readFileSync((await file.path())!);
  const dump = process.env['LS_DUMP'];
  if (dump) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${dump}/${Date.now()}-${file.suggestedFilename()}`, bytes);
  }
  return bytes;
}

/** One file out of a .zip (.docx), read through the central directory. */
export function zipEntry(zip: Buffer, name: string): Buffer | null {
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

export const xml = (zip: Buffer, name: string): string =>
  zipEntry(zip, name)?.toString('utf8') ?? '';
