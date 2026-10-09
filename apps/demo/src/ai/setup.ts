/**
 * Chooses the AI runtime and model storage for this platform (plan §9.3):
 *
 * - Desktop and Android app (Tauri): llama.cpp in the native shell; models live in the
 *   app-data folder and never cross the WebView bridge.
 * - Web and iOS/Android home-screen app: wllama (llama.cpp built for WebAssembly, with
 *   WebGPU when available); models live in the browser's private file system (OPFS).
 * - `?ai=mock`: a deterministic stand-in model and simulated downloads, for tests and
 *   screenshots. It never touches the network.
 *
 * Nothing here runs until the user opens an Assistant command or AI settings.
 */
import {
  Assistant,
  MockModelStore,
  MockRuntime,
  NativeModelStore,
  NativeRuntime,
  OpfsBytes,
  WebModelStore,
  WllamaRuntime,
  detectDevice,
  nativeDeviceInfo,
  type AiRuntime,
  type DeviceFacts,
  type ModelStore,
  type NativeBridge,
} from '@lucid-sentence/ai';
import { invoke, isTauri } from '@tauri-apps/api/core';

export interface AiEnv {
  assistant: Assistant;
  device: () => Promise<DeviceFacts>;
  bridge: NativeBridge | null;
  /** Why on-device AI can't run here at all, if so. */
  unsupported: string | null;
  mock: boolean;
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => {
      m.clear();
    },
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => {
      m.delete(k);
    },
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}

function safeLocalStorage(): Storage {
  try {
    localStorage.setItem('lucid-sentence:probe', '1');
    localStorage.removeItem('lucid-sentence:probe');
    return localStorage;
  } catch {
    return memoryStorage();
  }
}

async function tauriBridge(): Promise<NativeBridge> {
  const { listen } = await import('@tauri-apps/api/event');
  return {
    invoke: (cmd, args) => invoke(cmd, args),
    listen: (event, cb) =>
      listen(event, (e) => {
        cb(e.payload as never);
      }),
  };
}

/** URL of a file emitted under ai/ by vite.config.ts (same origin, cached offline). */
function asset(name: string): string {
  return new URL(`ai/${name}`, document.baseURI).href;
}

let env: Promise<AiEnv> | null = null;

export function aiEnv(): Promise<AiEnv> {
  env ??= create();
  return env;
}

async function create(): Promise<AiEnv> {
  const params = new URLSearchParams(location.search);
  const mock = params.get('ai') === 'mock';
  const storage = mock ? memoryStorage() : safeLocalStorage();
  if (mock) {
    const runtime = new MockRuntime(undefined, 25);
    const store = new MockModelStore({ steps: 24, stepMs: 70 });
    const assistant = new Assistant(runtime, store, storage);
    const device = (): Promise<DeviceFacts> =>
      Promise.resolve({
        platform: 'web',
        ramGiB: 8,
        ramIsLowerBound: true,
        ramSource: 'browser',
        webgpu: true,
        webgpuAdapter: 'mock',
        storageFreeBytes: 40 * 1024 ** 3,
        cores: 8,
        wasmFast: true,
        threads: false,
        nativeRuntime: false,
      });
    return { assistant, device, bridge: null, unsupported: null, mock };
  }
  if (isTauri()) {
    const bridge = await tauriBridge();
    const info = nativeDeviceInfo(bridge);
    const facts = await detectDevice({ isApp: true, native: info }).catch(() => null);
    const runtime: AiRuntime = new NativeRuntime(bridge);
    const store: ModelStore = new NativeModelStore(bridge);
    const assistant = new Assistant(runtime, store, storage);
    const unsupported =
      facts && !facts.nativeRuntime
        ? 'On-device AI needs a 64-bit device. This device can still use every other feature.'
        : null;
    return {
      assistant,
      device: () => detectDevice({ isApp: true, native: info }),
      bridge,
      unsupported,
      mock,
    };
  }
  const opfs = OpfsBytes.supported();
  const bytes = new OpfsBytes();
  const store = new WebModelStore(bytes);
  const facts = await detectDevice().catch(() => null);
  const runtime = new WllamaRuntime({
    assets: {
      wasm: asset('wllama.wasm'),
      compatWorker: asset('wllama-compat.js'),
      compatWasm: asset('wllama-compat.wasm'),
    },
    readModel: (m) => bytes.file(m.fileName),
    webgpu: facts?.webgpu ?? false,
  });
  const assistant = new Assistant(runtime, store, storage);
  return {
    assistant,
    device: () => detectDevice(),
    bridge: null,
    unsupported: opfs
      ? null
      : 'This browser can’t store an on-device model (no private file storage). Try a current Chrome, Edge, Safari, or Firefox.',
    mock,
  };
}

/**
 * Fetches the web runtime once after a model download so the service worker caches it,
 * and later sessions work offline. Only the build this browser needs is fetched.
 */
export function prefetchRuntime(facts: DeviceFacts): void {
  const files = facts.wasmFast ? ['wllama.wasm'] : ['wllama-compat.js', 'wllama-compat.wasm'];
  for (const f of files) void fetch(asset(f)).catch(() => undefined);
}
