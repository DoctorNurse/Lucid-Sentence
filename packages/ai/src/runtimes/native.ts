/**
 * Native runtime and model store for the Tauri shell (desktop and Android): llama.cpp
 * via the `lucid-ai` crate (packages/ai/native). The shell downloads, verifies, stores
 * (app data), and runs the model; this file is the thin WebView side.
 *
 * The bridge is injected so this package doesn't depend on @tauri-apps/api.
 */
import type { NativeDeviceInfo } from '../device.js';
import type { ModelEntry } from '../models.js';
import type { AiRuntime, GenerateRequest, GenerateResult, LoadProgress } from '../runtime.js';
import type { DownloadProgress, ModelStatus, ModelStore } from '../store.js';

/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- mirrors Tauri's typed invoke/listen */
export interface NativeBridge {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, cb: (payload: T) => void): Promise<() => void>;
}
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

interface NativeStats {
  promptTokens: number;
  completionTokens: number;
  promptMs: number;
  decodeMs: number;
  stoppedBy: string;
}

let nextId = 1;

export class NativeRuntime implements AiRuntime {
  readonly kind = 'native' as const;
  readonly label: string;
  #loaded: string | null = null;

  constructor(
    readonly bridge: NativeBridge,
    gpu = false,
  ) {
    this.label = gpu ? 'llama.cpp (native, GPU)' : 'llama.cpp (native, CPU)';
  }

  loaded(): string | null {
    return this.#loaded;
  }

  async load(model: ModelEntry, onProgress?: (p: LoadProgress) => void): Promise<void> {
    if (this.#loaded === model.id) return;
    onProgress?.({ phase: 'loading', fraction: 0 });
    await this.bridge.invoke('ai_load', { fileName: model.fileName, nCtx: model.contextTokens });
    this.#loaded = model.id;
    onProgress?.({ phase: 'loading', fraction: 1 });
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const id = nextId++;
    const unlisten = await this.bridge.listen<{ id: number; piece: string }>('ai-token', (p) => {
      if (p.id === id) req.onToken?.(p.piece);
    });
    const onAbort = (): void => {
      void this.bridge.invoke('ai_cancel', { id });
    };
    req.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const r = await this.bridge.invoke<{ text: string; stats: NativeStats }>('ai_generate', {
        id,
        request: {
          prompt: req.prompt,
          maxTokens: req.maxTokens,
          temperature: req.temperature ?? 0,
          grammar: req.grammar ?? null,
          stop: req.stop ?? [],
        },
      });
      const s = r.stats;
      return {
        text: r.text,
        promptTokens: s.promptTokens,
        completionTokens: s.completionTokens,
        promptMs: s.promptMs,
        decodeMs: s.decodeMs,
        stoppedBy:
          (['eos', 'stop', 'length', 'cancelled'] as const).find((x) => x === s.stoppedBy) ?? 'eos',
      };
    } finally {
      req.signal?.removeEventListener('abort', onAbort);
      unlisten();
    }
  }

  async unload(): Promise<void> {
    this.#loaded = null;
    await this.bridge.invoke('ai_unload');
  }
}

export class NativeModelStore implements ModelStore {
  readonly kind = 'native' as const;

  constructor(readonly bridge: NativeBridge) {}

  status(model: ModelEntry): Promise<ModelStatus> {
    return this.bridge.invoke<ModelStatus>('ai_model_status', {
      fileName: model.fileName,
      size: model.sizeBytes,
    });
  }

  async download(
    model: ModelEntry,
    opts: { signal?: AbortSignal; onProgress?: (p: DownloadProgress) => void } = {},
  ): Promise<'done' | 'paused'> {
    const unlisten = await this.bridge.listen<DownloadProgress & { fileName: string }>(
      'ai-download-progress',
      (p) => {
        if (p.fileName === model.fileName)
          opts.onProgress?.({ phase: p.phase, done: p.done, total: p.total });
      },
    );
    const onAbort = (): void => {
      void this.bridge.invoke('ai_download_cancel', { fileName: model.fileName });
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.bridge.invoke<'done' | 'paused'>('ai_download', {
        url: model.url,
        fileName: model.fileName,
        size: model.sizeBytes,
        sha256: model.sha256,
      });
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
      unlisten();
    }
  }

  remove(model: ModelEntry): Promise<void> {
    return this.bridge.invoke('ai_delete', { fileName: model.fileName });
  }
}

export function nativeDeviceInfo(bridge: NativeBridge): () => Promise<NativeDeviceInfo> {
  return () => bridge.invoke<NativeDeviceInfo>('ai_device_info');
}
