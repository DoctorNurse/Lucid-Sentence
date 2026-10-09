/**
 * Pinned model manifest (plan §9.2). Default models are Apache-2.0 or MIT only.
 *
 * Every entry pins a Hugging Face commit, the exact file size, and its SHA-256 (the LFS
 * object id), so a download is verified before it is ever loaded. Licenses and sizes
 * were checked against the Hugging Face API on Oct 9, 2026 (see docs/AI.md).
 */

export type ModelLicense = 'Apache-2.0' | 'MIT';

export interface ModelEntry {
  id: string;
  name: string;
  /** Short description for the download card. */
  summary: string;
  family: string;
  parameters: string;
  quantization: string;
  license: ModelLicense;
  licenseUrl: string;
  /** Upstream model card (the original weights' publisher). */
  sourceUrl: string;
  /** Pinned GGUF file. */
  url: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  /** Minimum total device RAM in GiB for this tier (plan §9.4). */
  minRamGiB: number;
  /** Rough extra RAM while generating (weights + 4k KV cache), in GiB. */
  runtimeRamGiB: number;
  contextTokens: number;
  tier: 'lite' | 'baseline';
  recommended?: boolean;
}

const HF = 'https://huggingface.co';

export const MODELS: readonly ModelEntry[] = [
  {
    id: 'qwen3.5-2b-q4km',
    name: 'Qwen3.5 2B',
    summary: 'Recommended. Best quality for rewriting, grammar, summaries, and Tell Lucid.',
    family: 'Qwen3.5',
    parameters: '2.27B',
    quantization: 'Q4_K_M (GGUF)',
    license: 'Apache-2.0',
    licenseUrl: `${HF}/Qwen/Qwen3.5-2B/blob/main/LICENSE`,
    sourceUrl: `${HF}/Qwen/Qwen3.5-2B`,
    url: `${HF}/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf`,
    fileName: 'Qwen3.5-2B-Q4_K_M.gguf',
    sizeBytes: 1_280_835_840,
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    minRamGiB: 8,
    runtimeRamGiB: 1.9,
    contextTokens: 4096,
    tier: 'baseline',
    recommended: true,
  },
  {
    id: 'qwen3.5-0.8b-q4km',
    name: 'Qwen3.5 0.8B (lite)',
    summary: 'Smaller and faster for 6 GB phones and iPhone. Short rewrites and Tell Lucid.',
    family: 'Qwen3.5',
    parameters: '0.8B',
    quantization: 'Q4_K_M (GGUF)',
    license: 'Apache-2.0',
    licenseUrl: `${HF}/Qwen/Qwen3.5-0.8B/blob/main/LICENSE`,
    sourceUrl: `${HF}/Qwen/Qwen3.5-0.8B`,
    url: `${HF}/unsloth/Qwen3.5-0.8B-GGUF/resolve/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0/Qwen3.5-0.8B-Q4_K_M.gguf`,
    fileName: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    sizeBytes: 532_517_120,
    sha256: 'bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517',
    minRamGiB: 6,
    runtimeRamGiB: 0.9,
    contextTokens: 4096,
    tier: 'lite',
  },
];

export const ALLOWED_LICENSES: readonly ModelLicense[] = ['Apache-2.0', 'MIT'];

export function findModel(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id);
}

export function defaultModel(): ModelEntry {
  return MODELS.find((m) => m.recommended) ?? MODELS[0]!;
}

/** Human-readable size: 1.28 GB, 533 MB. Decimal units, like download dialogs. */
export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}
