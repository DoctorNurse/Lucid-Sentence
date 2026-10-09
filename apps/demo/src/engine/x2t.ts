/**
 * Client for the x2t worker (engine/x2t/worker.js): converts .docx to the
 * editor's binary format and back, off the main thread.
 */
export type Format = 'docx' | 'bin';

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
}

export class X2t {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<
    number,
    { resolve: (c: Converted) => void; reject: (e: Error) => void }
  >();

  constructor(private readonly url: string) {}

  private start(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(this.url);
    w.onmessage = (e: MessageEvent<Reply>) => {
      const r = e.data;
      const p = this.pending.get(r.id);
      if (!p) return;
      this.pending.delete(r.id);
      if (r.ok && r.data) p.resolve({ data: r.data, media: r.media ?? {} });
      else p.reject(new Error(r.error ?? 'conversion failed'));
    };
    w.onerror = (e) => {
      const err = new Error(`converter failed to load: ${e.message}`);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.worker = null;
    };
    this.worker = w;
    return w;
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
  ): Promise<Converted> {
    const w = this.start();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // Copies, so the caller keeps its buffers (we keep the original media for saving).
      w.postMessage({ id, data: data.slice(), from, to, media });
    });
  }
}
