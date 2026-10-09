/**
 * Model storage and resumable downloads.
 *
 * - Web / iOS PWA: the Origin Private File System (OPFS), via {@link OpfsBytes}.
 * - Desktop / Android app: the shell downloads into app data natively (see
 *   runtimes/native.ts), so the large file never crosses the WebView bridge.
 *
 * Downloads resume with HTTP Range requests from the bytes already stored, and the
 * finished file is SHA-256-verified against the pinned manifest before it is marked
 * ready. A mismatch deletes it.
 */
import type { ModelEntry } from './models.js';
import { sha256Blob } from './sha256.js';

export interface DownloadProgress {
  phase: 'downloading' | 'verifying';
  done: number;
  total: number;
}

export interface ModelStatus {
  state: 'none' | 'partial' | 'ready';
  bytes: number;
}

export interface ModelStore {
  readonly kind: 'opfs' | 'native' | 'memory';
  status(model: ModelEntry): Promise<ModelStatus>;
  /** Resolves 'paused' when `signal` aborts; call again to resume. */
  download(
    model: ModelEntry,
    opts: { signal?: AbortSignal; onProgress?: (p: DownloadProgress) => void },
  ): Promise<'done' | 'paused'>;
  remove(model: ModelEntry): Promise<void>;
  /** The verified model file (web runtimes read it from here). */
  open?(model: ModelEntry): Promise<Blob>;
}

/** Minimal byte storage the web downloader writes into. */
export interface ByteStore {
  size(name: string): Promise<number>;
  /** Opens for writing at `offset`, truncating anything after it. */
  writer(
    name: string,
    offset: number,
  ): Promise<{ write(chunk: Uint8Array): Promise<void>; close(): Promise<void> }>;
  file(name: string): Promise<Blob>;
  remove(name: string): Promise<void>;
  readText(name: string): Promise<string | null>;
  writeText(name: string, text: string): Promise<void>;
}

export class MemoryBytes implements ByteStore {
  readonly files = new Map<string, Uint8Array>();
  size(name: string): Promise<number> {
    return Promise.resolve(this.files.get(name)?.length ?? 0);
  }
  writer(
    name: string,
    offset: number,
  ): Promise<{ write(c: Uint8Array): Promise<void>; close(): Promise<void> }> {
    let data = (this.files.get(name) ?? new Uint8Array()).slice(0, offset);
    const flush = (): void => {
      this.files.set(name, data);
    };
    flush();
    return Promise.resolve({
      write: (c: Uint8Array) => {
        const next = new Uint8Array(data.length + c.length);
        next.set(data);
        next.set(c, data.length);
        data = next;
        flush();
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    });
  }
  file(name: string): Promise<Blob> {
    const d = this.files.get(name);
    if (!d) return Promise.reject(new Error(`No such file: ${name}`));
    return Promise.resolve(new Blob([d.slice()]));
  }
  remove(name: string): Promise<void> {
    this.files.delete(name);
    return Promise.resolve();
  }
  readText(name: string): Promise<string | null> {
    const d = this.files.get(name);
    return Promise.resolve(d ? new TextDecoder().decode(d) : null);
  }
  writeText(name: string, text: string): Promise<void> {
    this.files.set(name, new TextEncoder().encode(text));
    return Promise.resolve();
  }
}

type OpfsDir = FileSystemDirectoryHandle;

/** OPFS-backed storage in a `lucid-ai` directory. */
export class OpfsBytes implements ByteStore {
  #dir: Promise<OpfsDir> | null = null;

  static supported(): boolean {
    const nav = globalThis.navigator as { storage?: Partial<StorageManager> } | undefined;
    return typeof nav?.storage?.getDirectory === 'function';
  }

  #root(): Promise<OpfsDir> {
    this.#dir ??= navigator.storage
      .getDirectory()
      .then((root) => root.getDirectoryHandle('lucid-ai', { create: true }));
    return this.#dir;
  }

  async #handle(name: string, create: boolean): Promise<FileSystemFileHandle | null> {
    try {
      return await (await this.#root()).getFileHandle(name, { create });
    } catch {
      return null;
    }
  }

  async size(name: string): Promise<number> {
    const h = await this.#handle(name, false);
    return h ? (await h.getFile()).size : 0;
  }

  async writer(
    name: string,
    offset: number,
  ): Promise<{ write(c: Uint8Array): Promise<void>; close(): Promise<void> }> {
    const h = await this.#handle(name, true);
    if (!h) throw new Error('Storage is unavailable');
    const w = await h.createWritable({ keepExistingData: true });
    await w.truncate(offset);
    await w.seek(offset);
    return {
      write: (c) => w.write(c as Uint8Array<ArrayBuffer>),
      close: () => w.close(),
    };
  }

  async file(name: string): Promise<Blob> {
    const h = await this.#handle(name, false);
    if (!h) throw new Error(`No such file: ${name}`);
    return h.getFile();
  }

  async remove(name: string): Promise<void> {
    try {
      await (await this.#root()).removeEntry(name);
    } catch {
      /* already gone */
    }
  }

  async readText(name: string): Promise<string | null> {
    const h = await this.#handle(name, false);
    return h ? (await h.getFile()).text() : null;
  }

  async writeText(name: string, text: string): Promise<void> {
    const w = await this.writer(name, 0);
    await w.write(new TextEncoder().encode(text));
    await w.close();
  }
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

const marker = (m: ModelEntry): string => `${m.fileName}.verified.json`;

/** Downloads into any {@link ByteStore}. Used with OPFS on the web and memory in tests. */
export class WebModelStore implements ModelStore {
  readonly kind: 'opfs' | 'memory';

  constructor(
    readonly bytes: ByteStore,
    readonly fetchFn: FetchLike = (u, i) => fetch(u, i),
    readonly flushBytes = 4 * 1024 * 1024,
  ) {
    this.kind = bytes instanceof MemoryBytes ? 'memory' : 'opfs';
  }

  async status(model: ModelEntry): Promise<ModelStatus> {
    const ok = await this.bytes.readText(marker(model));
    const bytes = await this.bytes.size(model.fileName);
    if (ok) {
      try {
        const v = JSON.parse(ok) as { sha256?: string };
        if (v.sha256 === model.sha256 && bytes === model.sizeBytes)
          return { state: 'ready', bytes };
      } catch {
        /* treat as unverified */
      }
    }
    return { state: bytes > 0 ? 'partial' : 'none', bytes };
  }

  async download(
    model: ModelEntry,
    opts: { signal?: AbortSignal; onProgress?: (p: DownloadProgress) => void } = {},
  ): Promise<'done' | 'paused'> {
    const { signal, onProgress } = opts;
    let offset = await this.bytes.size(model.fileName);
    if ((await this.status(model)).state === 'ready') return 'done';
    if (offset > model.sizeBytes) offset = 0;
    if (offset < model.sizeBytes) {
      const headers: Record<string, string> = offset > 0 ? { Range: `bytes=${offset}-` } : {};
      let res: Response;
      try {
        res = await this.fetchFn(model.url, signal ? { headers, signal } : { headers });
      } catch (e) {
        if (signal?.aborted) return 'paused';
        throw new Error(`Download failed: ${(e as Error).message || 'network error'}`, {
          cause: e,
        });
      }
      if (offset > 0 && res.status === 200)
        offset = 0; // Range ignored: restart.
      else if (res.status !== 200 && res.status !== 206)
        throw new Error(`Download failed: HTTP ${res.status}`);
      if (!res.body) throw new Error('Download failed: empty response');
      const w = await this.bytes.writer(model.fileName, offset);
      const reader = res.body.getReader();
      let done = offset;
      let pending: Uint8Array[] = [];
      let pendingBytes = 0;
      const flush = async (): Promise<void> => {
        if (!pendingBytes) return;
        const buf = new Uint8Array(pendingBytes);
        let o = 0;
        for (const p of pending) {
          buf.set(p, o);
          o += p.length;
        }
        pending = [];
        pendingBytes = 0;
        await w.write(buf);
      };
      try {
        for (;;) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch (e) {
            // Keep what arrived so the next attempt resumes from there.
            await flush();
            if (signal?.aborted) return 'paused';
            throw e;
          }
          if (chunk.done) break;
          pending.push(chunk.value);
          pendingBytes += chunk.value.length;
          done += chunk.value.length;
          if (done > model.sizeBytes)
            throw new Error('Download failed: file is larger than expected');
          if (pendingBytes >= this.flushBytes) await flush();
          onProgress?.({ phase: 'downloading', done, total: model.sizeBytes });
          if (signal?.aborted) {
            await reader.cancel().catch(() => undefined);
            await flush();
            return 'paused';
          }
        }
        await flush();
      } finally {
        await w.close();
      }
    }
    const blob = await this.bytes.file(model.fileName);
    if (blob.size !== model.sizeBytes)
      throw new Error(`Download incomplete: ${blob.size} of ${model.sizeBytes} bytes`);
    const digest = await sha256Blob(
      blob,
      (d, t) => {
        onProgress?.({ phase: 'verifying', done: d, total: t });
      },
      signal,
    ).catch((e: unknown) => {
      if (signal?.aborted) return null;
      throw e;
    });
    if (digest === null) return 'paused';
    if (digest !== model.sha256) {
      await this.bytes.remove(model.fileName);
      throw new Error('Checksum mismatch: the download was discarded. Please try again.');
    }
    await this.bytes.writeText(marker(model), JSON.stringify({ sha256: digest, size: blob.size }));
    return 'done';
  }

  async remove(model: ModelEntry): Promise<void> {
    await this.bytes.remove(marker(model));
    await this.bytes.remove(model.fileName);
  }

  async open(model: ModelEntry): Promise<Blob> {
    if ((await this.status(model)).state !== 'ready')
      throw new Error('The model is not downloaded');
    return this.bytes.file(model.fileName);
  }
}

/**
 * Simulated model storage for e2e tests, screenshots, and demos (`?ai=mock`). Downloads
 * advance in steps without any network request and can be paused and resumed.
 */
export class MockModelStore implements ModelStore {
  readonly kind = 'memory' as const;
  readonly #bytes = new Map<string, number>();

  constructor(readonly opts: { steps?: number; stepMs?: number; ready?: readonly string[] } = {}) {
    for (const id of opts.ready ?? []) this.#bytes.set(id, Number.POSITIVE_INFINITY);
  }

  status(model: ModelEntry): Promise<ModelStatus> {
    const b = this.#bytes.get(model.id) ?? 0;
    if (b >= model.sizeBytes) return Promise.resolve({ state: 'ready', bytes: model.sizeBytes });
    return Promise.resolve({ state: b > 0 ? 'partial' : 'none', bytes: b });
  }

  async download(
    model: ModelEntry,
    opts: { signal?: AbortSignal; onProgress?: (p: DownloadProgress) => void } = {},
  ): Promise<'done' | 'paused'> {
    const steps = this.opts.steps ?? 20;
    const step = Math.ceil(model.sizeBytes / steps);
    let done = Math.min(this.#bytes.get(model.id) ?? 0, model.sizeBytes);
    while (done < model.sizeBytes) {
      if (opts.signal?.aborted) return 'paused';
      await new Promise((r) => setTimeout(r, this.opts.stepMs ?? 60));
      done = Math.min(model.sizeBytes, done + step);
      this.#bytes.set(model.id, done);
      opts.onProgress?.({ phase: 'downloading', done, total: model.sizeBytes });
    }
    opts.onProgress?.({ phase: 'verifying', done, total: model.sizeBytes });
    return 'done';
  }

  remove(model: ModelEntry): Promise<void> {
    this.#bytes.delete(model.id);
    return Promise.resolve();
  }
}
