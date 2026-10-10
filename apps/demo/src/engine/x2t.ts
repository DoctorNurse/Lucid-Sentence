/**
 * Client for the x2t worker (engine/x2t/worker.js): converts .docx to the
 * editor's binary format and back, and renders PDFs, off the main thread.
 */
export type Format = 'docx' | 'bin' | 'pdf';

export interface Converted {
  data: Uint8Array;
  /** Pictures from the package, keyed by file name (only for docx → bin). */
  media: Record<string, Uint8Array>;
}

interface Reply {
  id: number;
  ok: boolean;
  data?: Uint8Array;
  media?: Record<string, Uint8Array>;
  error?: string;
  /** The worker itself failed (id 0): every pending conversion fails. */
  fatal?: boolean;
}

/** How long one conversion may take before we give up (the first one also loads ~39 MB). */
export const CONVERT_TIMEOUT_MS = 120_000;

export class X2t {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<
    number,
    { resolve: (c: Converted) => void; reject: (e: Error) => void }
  >();

  constructor(
    private readonly url: string,
    private readonly timeoutMs = CONVERT_TIMEOUT_MS,
  ) {}

  private start(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(this.url);
    w.onmessage = (e: MessageEvent<Reply>) => {
      const r = e.data;
      if (r.fatal) {
        this.fail(new Error(r.error ?? 'converter failed to load'));
        return;
      }
      const p = this.pending.get(r.id);
      if (!p) return;
      this.pending.delete(r.id);
      if (r.ok && r.data) p.resolve({ data: r.data, media: r.media ?? {} });
      else p.reject(new Error(r.error ?? 'conversion failed'));
    };
    w.onerror = (e) => {
      this.fail(new Error(`converter failed to load: ${e.message}`));
    };
    this.worker = w;
    return w;
  }

  /** Reject everything pending and drop the worker, so the next call starts a fresh one. */
  private fail(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  /** Load the converter ahead of the first open (it is ~39 MB of WebAssembly). */
  warm(): void {
    this.start();
  }

  convert(
    data: Uint8Array,
    from: Format,
    to: Format,
    media: Record<string, Uint8Array> = {},
    /** For bin → pdf: sdkjs's page renderer output (bridge.pdfData). */
    pdf?: Uint8Array,
  ): Promise<Converted> {
    const w = this.start();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) this.fail(new Error('the converter took too long'));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (c) => {
          clearTimeout(timer);
          resolve(c);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      // Copies, so the caller keeps its buffers (we keep the original media for saving).
      w.postMessage({ id, data: data.slice(), from, to, media, pdf });
    });
  }
}
