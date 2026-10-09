/**
 * Device check for the download card (plan §9.4): RAM, WebGPU, free storage, and which
 * runtime will run. Browsers report RAM coarsely (`navigator.deviceMemory` is capped at
 * 8 and missing on Safari), so the native shell's exact figure wins when present.
 */
import type { ModelEntry } from './models.js';

export interface NativeDeviceInfo {
  totalRamBytes: number;
  availableRamBytes: number;
  cpuThreads: number;
  os: string;
  arch: string;
  nativeRuntime: boolean;
}

export type Platform = 'desktop-app' | 'android-app' | 'ios-web' | 'android-web' | 'web';

export interface DeviceFacts {
  platform: Platform;
  /** Total RAM in GiB, or null when the browser won't say. */
  ramGiB: number | null;
  /** True when `ramGiB` is a lower bound (deviceMemory reports at most 8). */
  ramIsLowerBound: boolean;
  ramSource: 'native' | 'browser' | 'unknown';
  webgpu: boolean;
  webgpuAdapter: string | null;
  storageFreeBytes: number | null;
  cores: number;
  /** WebAssembly JSPI + Memory64: fast wllama build; otherwise the slower compat build. */
  wasmFast: boolean;
  /** SharedArrayBuffer available (COOP/COEP), so wllama can use threads. */
  threads: boolean;
  nativeRuntime: boolean;
}

export interface ModelCheck {
  level: 'ok' | 'warn' | 'block';
  reasons: string[];
}

const GiB = 1024 ** 3;

function memory64(): boolean {
  try {
    // A module whose only content is a memory64 memory section.
    const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 4, 1]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

export function detectPlatform(ua: string, isApp: boolean): Platform {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua));
  const android = /Android/.test(ua);
  if (isApp) return android ? 'android-app' : 'desktop-app';
  if (ios) return 'ios-web';
  if (android) return 'android-web';
  return 'web';
}

export async function detectDevice(
  opts: { isApp?: boolean; native?: () => Promise<NativeDeviceInfo> } = {},
): Promise<DeviceFacts> {
  const nav = navigator as Omit<Navigator, 'gpu' | 'storage'> & {
    deviceMemory?: number;
    storage?: Partial<StorageManager>;
    gpu?: {
      requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string } } | null>;
    };
  };
  let native: NativeDeviceInfo | null = null;
  if (opts.native) native = await opts.native().catch(() => null);
  let webgpu = false;
  let webgpuAdapter: string | null = null;
  if (nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      webgpu = !!adapter;
      const info = adapter?.info;
      if (info) webgpuAdapter = [info.vendor, info.architecture].filter(Boolean).join(' ') || null;
    } catch {
      webgpu = false;
    }
  }
  let storageFreeBytes: number | null = null;
  try {
    const est = await nav.storage?.estimate?.();
    if (est?.quota !== undefined) storageFreeBytes = est.quota - (est.usage ?? 0);
  } catch {
    storageFreeBytes = null;
  }
  const ramGiB = native?.totalRamBytes
    ? native.totalRamBytes / GiB
    : typeof nav.deviceMemory === 'number'
      ? nav.deviceMemory
      : null;
  return {
    platform: detectPlatform(navigator.userAgent, !!opts.isApp),
    ramGiB,
    ramIsLowerBound: !native?.totalRamBytes && nav.deviceMemory === 8,
    ramSource: native?.totalRamBytes ? 'native' : ramGiB !== null ? 'browser' : 'unknown',
    webgpu,
    webgpuAdapter,
    storageFreeBytes,
    cores: native?.cpuThreads ?? (navigator.hardwareConcurrency || 1),
    wasmFast: !!(WebAssembly as unknown as { Suspending?: unknown }).Suspending && memory64(),
    threads: typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated,
    nativeRuntime: native?.nativeRuntime ?? false,
  };
}

/**
 * Whether a model fits this device. Phones report a little under their marketing RAM
 * (an 8 GB S24 shows about 7.3 GiB), so the gate allows 10% slack.
 */
export function checkModel(model: ModelEntry, d: DeviceFacts): ModelCheck {
  const reasons: string[] = [];
  let level: ModelCheck['level'] = 'ok';
  const worse = (l: ModelCheck['level']): void => {
    if (l === 'block' || (l === 'warn' && level === 'ok')) level = l;
  };
  if (d.ramGiB === null) {
    worse('warn');
    reasons.push(
      `This browser doesn't report memory. The model needs about ${model.minRamGiB} GB of device RAM.`,
    );
  } else if (d.ramGiB < model.minRamGiB * 0.9 && !d.ramIsLowerBound) {
    worse('block');
    reasons.push(
      `Needs ${model.minRamGiB} GB of RAM; this device has about ${d.ramGiB.toFixed(1)} GB.`,
    );
  } else {
    const shown = d.ramIsLowerBound ? '8 GB or more' : `${d.ramGiB.toFixed(1)} GB`;
    reasons.push(`RAM: ${shown} (needs ${model.minRamGiB} GB).`);
  }
  if (d.storageFreeBytes !== null && d.storageFreeBytes < model.sizeBytes * 1.1) {
    worse('block');
    reasons.push('Not enough free storage for the download.');
  }
  if (d.platform === 'desktop-app' || d.platform === 'android-app') {
    if (d.nativeRuntime) reasons.push('Runs natively with llama.cpp.');
    else {
      worse('warn');
      reasons.push('The native runtime is unavailable here; the slower web runtime is used.');
    }
  } else {
    reasons.push(
      d.webgpu ? 'WebGPU available: runs on the GPU.' : 'No WebGPU: runs on the CPU (slower).',
    );
    if (!d.wasmFast) {
      worse('warn');
      reasons.push('This browser uses the compatibility build, which is noticeably slower.');
    }
    if (d.platform === 'ios-web' && model.tier !== 'lite') {
      worse('warn');
      reasons.push('On iPhone and iPad, Safari limits web-app memory; the lite model is safer.');
    }
  }
  return { level, reasons };
}

/** The model to suggest first on this device. */
export function suggestModel(
  models: readonly ModelEntry[],
  d: DeviceFacts,
): ModelEntry | undefined {
  const fits = models.filter((m) => checkModel(m, d).level !== 'block');
  if (d.platform === 'ios-web') return fits.find((m) => m.tier === 'lite') ?? fits[0];
  return fits.find((m) => m.recommended) ?? fits[0];
}
