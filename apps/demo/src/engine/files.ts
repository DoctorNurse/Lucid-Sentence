/**
 * Reading and writing the user's .docx files on every platform:
 *
 * - Desktop and Android app (Tauri): native open/save dialogs (on Android,
 *   the system document picker) through tauri-plugin-dialog, file bytes
 *   through tauri-plugin-fs (paths on desktop, content:// URIs on Android).
 * - Browsers with the File System Access API (Chromium): real file handles,
 *   so Save writes back to the file that was opened.
 * - Other browsers: <input type=file> to open, a download to save.
 */
import { isTauri } from '@tauri-apps/api/core';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Where a document lives, so Save can write back to it. */
export type FileTarget =
  | { kind: 'path'; path: string }
  | { kind: 'handle'; handle: FileSystemFileHandle }
  | { kind: 'none' };

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
  target: FileTarget;
}

// File System Access API (not yet in TypeScript's DOM lib).
interface FsaWindow {
  showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
}
interface Writable {
  write(data: BlobPart): Promise<void>;
  close(): Promise<void>;
}
type WritableHandle = FileSystemFileHandle & { createWritable(): Promise<Writable> };

const FSA_TYPES = [{ description: 'Word Document', accept: { [DOCX_MIME]: ['.docx'] } }];
const DIALOG_FILTERS = [{ name: 'Word Document', extensions: ['docx'] }];

const fsa = (): FsaWindow => window as unknown as FsaWindow;
export const hasFsa = (): boolean =>
  typeof fsa().showOpenFilePicker === 'function' && typeof fsa().showSaveFilePicker === 'function';

/** File name from a path or an Android content:// URI. */
export function nameFromPath(p: string): string {
  let s = p;
  try {
    if (/^[a-z]+:\/\//i.test(s)) s = decodeURIComponent(new URL(s).pathname);
  } catch {
    /* keep the raw string */
  }
  const last =
    s
      .split(/[\\/:]/)
      .filter(Boolean)
      .pop() ?? 'Document.docx';
  return /\.docx$/i.test(last) ? last : `${last}.docx`;
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

/** Read a file the OS or a dialog gave the app (Tauri only). */
export async function readPath(path: string): Promise<PickedFile> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  return { name: nameFromPath(path), bytes: await readFile(path), target: { kind: 'path', path } };
}

/** Ask for a .docx file. Null when the user cancels; `fallback` is the <input> route. */
export async function pickOpen(fallback: () => void): Promise<PickedFile | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, directory: false, filters: DIALOG_FILTERS });
    return typeof path === 'string' ? readPath(path) : null;
  }
  const w = fsa();
  if (hasFsa() && w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: FSA_TYPES, multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        target: { kind: 'handle', handle },
      };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  fallback();
  return null;
}

/** From the <input type=file> route. */
export async function fromFile(f: File): Promise<PickedFile> {
  return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), target: { kind: 'none' } };
}

/** Write to a known place. Returns false when there is none (use saveAs). */
export async function writeTo(target: FileTarget, bytes: Uint8Array): Promise<boolean> {
  if (target.kind === 'path') {
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(target.path, bytes);
    return true;
  }
  if (target.kind === 'handle') {
    const w = await (target.handle as WritableHandle).createWritable();
    await w.write(bytes as BlobPart);
    await w.close();
    return true;
  }
  return false;
}

/**
 * Ask where to save, then write. Returns the new target and name, or null when
 * the user cancels. Without a file picker the document downloads instead.
 */
export async function saveAs(
  suggested: string,
  bytes: Uint8Array,
): Promise<{ target: FileTarget; name: string } | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: suggested, filters: DIALOG_FILTERS });
    if (!path) return null;
    const target: FileTarget = { kind: 'path', path };
    await writeTo(target, bytes);
    return { target, name: nameFromPath(path) };
  }
  const w = fsa();
  if (hasFsa() && w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: suggested, types: FSA_TYPES });
      const target: FileTarget = { kind: 'handle', handle };
      await writeTo(target, bytes);
      return { target, name: handle.name };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  download(suggested, bytes);
  return { target: { kind: 'none' }, name: suggested };
}

export function download(name: string, bytes: Uint8Array, type = DOCX_MIME): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
  }, 1000);
}

const PICTURE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];

/** Ask for pictures to insert. Empty when the user cancels. */
export async function pickPictures(): Promise<{ name: string; bytes: Uint8Array }[]> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({
      multiple: true,
      directory: false,
      filters: [{ name: 'Pictures', extensions: PICTURE_EXTS }],
    });
    const paths = picked ?? [];
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return Promise.all(
      paths.map(async (p) => ({
        name: p.split(/[\\/]/).pop() ?? 'picture.png',
        bytes: await readFile(p),
      })),
    );
  }
  // <input type=file> works everywhere and allows several pictures at once.
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = PICTURE_EXTS.map((e) => `.${e}`).join(',');
  input.multiple = true;
  input.hidden = true;
  document.body.append(input);
  try {
    const list = await new Promise<File[]>((resolve) => {
      input.addEventListener('change', () => {
        resolve([...(input.files ?? [])]);
      });
      input.addEventListener('cancel', () => {
        resolve([]);
      });
      input.click();
    });
    return await Promise.all(
      list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
  } finally {
    input.remove();
  }
}

/** Save a PDF where the user chooses (or download it). False when they cancel. */
export async function savePdf(suggested: string, bytes: Uint8Array): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: suggested,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!path) return false;
    await writeTo({ kind: 'path', path }, bytes);
    return true;
  }
  const w = fsa();
  if (hasFsa() && w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: suggested,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      await writeTo({ kind: 'handle', handle }, bytes);
      return true;
    } catch (e) {
      if (isAbort(e)) return false;
      throw e;
    }
  }
  download(suggested, bytes, 'application/pdf');
  return true;
}

/**
 * Print a PDF through the browser's PDF viewer (a hidden frame). False where
 * there is none (some WebViews); the caller saves the PDF instead.
 */
export function printPdf(bytes: Uint8Array): boolean {
  if (isTauri() || !(navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled) {
    return false;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const frame = document.createElement('iframe');
  frame.className = 'print-frame';
  frame.title = 'Print preview';
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  frame.src = url;
  frame.addEventListener('load', () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      }
    }, 300);
  });
  document.body.append(frame);
  return true;
}
