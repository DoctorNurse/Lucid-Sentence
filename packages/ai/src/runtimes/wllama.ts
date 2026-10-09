/**
 * Web runtime (browser, iOS/Android home-screen app): wllama, the llama.cpp WebAssembly
 * build (MIT), with WebGPU when the browser has it and multi-threaded SIMD CPU otherwise.
 * It reads the same pinned GGUF file as the native runtime, from OPFS.
 *
 * The WebAssembly files are served from our own origin (never a CDN) and cached for
 * offline use when the user downloads a model, so nothing loads from the network later.
 */
import type { ModelEntry } from '../models.js';
import type { AiRuntime, GenerateRequest, GenerateResult, LoadProgress } from '../runtime.js';

export interface WllamaAssets {
  /** Fast build (needs WebAssembly JSPI + Memory64: Chromium). */
  wasm: string;
  /** Compatibility build for Safari and other browsers without JSPI. */
  compatWorker: string;
  compatWasm: string;
}

interface WllamaLike {
  setCompat(c: { worker: string; wasm: string } | null, mode?: 'safari' | 'firefox_safari'): void;
  loadModel(blobs: Blob[], params: Record<string, unknown>): Promise<void>;
  createCompletion(opts: Record<string, unknown>): Promise<unknown>;
  exit(): Promise<void>;
  isModelLoaded(): boolean;
  usingWebGPU?: () => boolean;
}

interface Chunk {
  choices?: { text?: string; finish_reason?: string | null }[];
  timings?: { prompt_n?: number; prompt_ms?: number; predicted_n?: number; predicted_ms?: number };
}

export class WllamaRuntime implements AiRuntime {
  readonly kind = 'wllama' as const;
  label = 'llama.cpp (WebAssembly)';
  #w: WllamaLike | null = null;
  #loaded: string | null = null;

  constructor(
    readonly opts: {
      assets: WllamaAssets;
      readModel: (m: ModelEntry) => Promise<Blob>;
      webgpu: boolean;
      nCtx?: number;
    },
  ) {}

  loaded(): string | null {
    return this.#loaded;
  }

  async load(model: ModelEntry, onProgress?: (p: LoadProgress) => void): Promise<void> {
    if (this.#loaded === model.id) return;
    await this.unload();
    onProgress?.({ phase: 'reading', fraction: 0 });
    const blob = await this.opts.readModel(model);
    const mod = (await import('@wllama/wllama/esm/index.js')) as unknown as {
      Wllama: new (paths: { default: string }, config: Record<string, unknown>) => WllamaLike;
    };
    const w = new mod.Wllama(
      { default: this.opts.assets.wasm },
      { suppressNativeLog: true, allowOffline: true },
    );
    w.setCompat(
      { worker: this.opts.assets.compatWorker, wasm: this.opts.assets.compatWasm },
      'safari',
    );
    onProgress?.({ phase: 'loading', fraction: 0.5 });
    const file = new File([blob], model.fileName);
    await w.loadModel([file], {
      n_ctx: this.opts.nCtx ?? model.contextTokens,
      n_gpu_layers: this.opts.webgpu ? 999 : 0,
      n_parallel: 1,
    });
    this.#w = w;
    this.#loaded = model.id;
    this.label = this.opts.webgpu
      ? 'llama.cpp (WebAssembly + WebGPU)'
      : 'llama.cpp (WebAssembly, CPU)';
    onProgress?.({ phase: 'loading', fraction: 1 });
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const w = this.#w;
    if (!w) throw new Error('No model loaded');
    let text = '';
    const st: { finish: string | null; timings: Chunk['timings'] } = {
      finish: null,
      timings: undefined,
    };
    const started = performance.now();
    let first = 0;
    const params: Record<string, unknown> = {
      prompt: req.prompt,
      max_tokens: req.maxTokens,
      temperature: req.temperature ?? 0,
      temp: req.temperature ?? 0,
      stop: req.stop ?? [],
      stream: true,
      onData: (c: Chunk) => {
        const piece = c.choices?.[0]?.text ?? '';
        if (piece) {
          if (!first) first = performance.now();
          text += piece;
          req.onToken?.(piece);
        }
        if (c.choices?.[0]?.finish_reason) st.finish = c.choices[0].finish_reason;
        if (c.timings) st.timings = c.timings;
      },
    };
    if (req.grammar) params['grammar'] = req.grammar;
    if (req.signal) params['abortSignal'] = req.signal;
    try {
      await w.createCompletion(params);
    } catch (e) {
      if (!req.signal?.aborted) throw e;
    }
    const end = performance.now();
    const t = st.timings;
    return {
      text,
      promptTokens: t?.prompt_n ?? 0,
      completionTokens: t?.predicted_n ?? Math.ceil(text.length / 4),
      promptMs: t?.prompt_ms ?? (first ? first - started : end - started),
      decodeMs: t?.predicted_ms ?? (first ? end - first : 0),
      stoppedBy: req.signal?.aborted
        ? 'cancelled'
        : st.finish === 'length'
          ? 'length'
          : st.finish === 'stop'
            ? 'stop'
            : 'eos',
    };
  }

  async unload(): Promise<void> {
    const w = this.#w;
    this.#w = null;
    this.#loaded = null;
    if (w) await w.exit().catch(() => undefined);
  }
}
