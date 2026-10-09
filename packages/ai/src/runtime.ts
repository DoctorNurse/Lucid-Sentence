/** One interface for every backend: native llama.cpp (Tauri), wllama (web), and the test mock. */
import type { ModelEntry } from './models.js';

export interface GenerateRequest {
  /** Fully formatted prompt (see prompt.ts). */
  prompt: string;
  maxTokens: number;
  temperature?: number;
  /** GBNF grammar with a `root` rule; constrains the output (Tell Lucid uses it). */
  grammar?: string;
  stop?: string[];
  signal?: AbortSignal;
  onToken?: (piece: string) => void;
}

export interface GenerateResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  /** Time to first token, ms. */
  promptMs: number;
  decodeMs: number;
  stoppedBy: 'eos' | 'stop' | 'length' | 'cancelled';
}

export type RuntimeKind = 'native' | 'wllama' | 'mock';

export interface LoadProgress {
  phase: 'reading' | 'loading';
  fraction: number;
}

export interface AiRuntime {
  readonly kind: RuntimeKind;
  /** Human-readable backend name for Settings, e.g. "llama.cpp (native, CPU)". */
  readonly label: string;
  loaded(): string | null;
  load(model: ModelEntry, onProgress?: (p: LoadProgress) => void): Promise<void>;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  unload(): Promise<void>;
}

export function decodeRate(r: Pick<GenerateResult, 'completionTokens' | 'decodeMs'>): number {
  return r.decodeMs > 0 ? (r.completionTokens * 1000) / r.decodeMs : 0;
}

/**
 * Deterministic stand-in model for tests, e2e, and screenshots. It answers from a
 * script when one matches, otherwise with simple, predictable transformations, and it
 * honors Tell Lucid grammars by returning the first command id the grammar allows.
 */
export class MockRuntime implements AiRuntime {
  readonly kind = 'mock' as const;
  readonly label = 'Mock model (tests)';
  #loaded: string | null = null;
  readonly calls: GenerateRequest[] = [];

  constructor(
    readonly script: (prompt: string, req: GenerateRequest) => string | undefined = () => undefined,
    readonly delayMs = 0,
  ) {}

  loaded(): string | null {
    return this.#loaded;
  }

  load(model: ModelEntry, onProgress?: (p: LoadProgress) => void): Promise<void> {
    onProgress?.({ phase: 'loading', fraction: 1 });
    this.#loaded = model.id;
    return Promise.resolve();
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!this.#loaded) throw new Error('No model loaded');
    this.calls.push(req);
    const text = this.script(req.prompt, req) ?? mockAnswer(req);
    const pieces = text.match(/\S+\s*/g) ?? [];
    let out = '';
    for (const p of pieces) {
      if (req.signal?.aborted) {
        return {
          text: out,
          promptTokens: 0,
          completionTokens: 0,
          promptMs: 0,
          decodeMs: 1,
          stoppedBy: 'cancelled',
        };
      }
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      out += p;
      req.onToken?.(p);
    }
    return {
      text,
      promptTokens: Math.ceil(req.prompt.length / 4),
      completionTokens: pieces.length,
      promptMs: 5,
      decodeMs: Math.max(1, pieces.length * 10),
      stoppedBy: 'eos',
    };
  }

  unload(): Promise<void> {
    this.#loaded = null;
    return Promise.resolve();
  }
}

/** The selection inside the last <<< >>> block of the prompt. */
function userText(prompt: string): string {
  const start = prompt.lastIndexOf('<<<');
  const end = prompt.lastIndexOf('>>>');
  return start >= 0 && end > start ? prompt.slice(start + 3, end).trim() : '';
}

function mockAnswer(req: GenerateRequest): string {
  if (req.grammar) {
    const id = /"((?:[a-z0-9-]+\.){2}[a-z0-9-]+)"/.exec(req.grammar)?.[1];
    return JSON.stringify({ command: id ?? 'none', value: '' });
  }
  const text = userText(req.prompt);
  const p = req.prompt;
  if (p.includes('TASK: grammar')) {
    return text
      .replace(/\bi\b/g, 'I')
      .replace(/\bteh\b/g, 'the')
      .replace(/\bthey was\b/g, 'they were')
      .replace(/^./, (c) => c.toUpperCase());
  }
  if (p.includes('TASK: summarize')) {
    const first = /[^.!?]+[.!?]/.exec(text)?.[0] ?? text;
    return `In short: ${first.trim()}`;
  }
  if (p.includes('TASK: shorten')) {
    const words = text.split(/\s+/);
    return words.slice(0, Math.max(3, Math.ceil(words.length * 0.6))).join(' ');
  }
  if (p.includes('TASK: expand')) return `${text} This adds helpful detail and context.`;
  if (p.includes('TONE: formal'))
    return text.replace(/\bcan't\b/g, 'cannot').replace(/\bgot\b/g, 'received');
  if (p.includes('TONE: friendly')) return `${text} Thanks so much!`;
  return text.replace(/\bvery\s+/g, '');
}
