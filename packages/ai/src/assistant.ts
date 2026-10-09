/**
 * The Assistant: one DOM-free controller the app's UI talks to. It owns the opt-in
 * setting, the chosen model, download/delete, lazy loading (and idle unloading, to keep
 * memory free for the editor), and turns task replies into suggestions.
 *
 * Privacy: the only network request it can cause is the model download the user starts.
 * There is no telemetry and no cloud fallback.
 */
import { diffWords, type DiffPart } from './diff.js';
import { buildIntent, keywordIntent, parseIntent, shortlist, type Intent } from './intent.js';
import { MODELS, findModel, type ModelEntry } from './models.js';
import type { AiRuntime, GenerateResult } from './runtime.js';
import type { DownloadProgress, ModelStore } from './store.js';
import {
  MAX_WORDS,
  TASK_LABELS,
  TONES,
  buildTask,
  finishTask,
  resultMode,
  wordCount,
  type TaskInput,
  type TaskKind,
} from './tasks.js';

export interface AssistantSettings {
  enabled: boolean;
  modelId: string | null;
}

export type AssistantState =
  | { s: 'off' }
  | { s: 'no-model' }
  | { s: 'downloading'; model: ModelEntry; progress: DownloadProgress }
  | { s: 'paused'; model: ModelEntry; bytes: number }
  | { s: 'ready'; model: ModelEntry }
  | { s: 'loading'; model: ModelEntry }
  | { s: 'loaded'; model: ModelEntry }
  | { s: 'busy'; model: ModelEntry; task: string }
  | { s: 'error'; message: string; model?: ModelEntry };

export interface Suggestion {
  id: string;
  kind: TaskKind;
  title: string;
  original: string;
  proposed: string;
  diff: DiffPart[];
  mode: 'replace' | 'insert-after';
  modelId: string;
  stats: Pick<GenerateResult, 'promptTokens' | 'completionTokens' | 'promptMs' | 'decodeMs'>;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SETTINGS_KEY = 'lucid-sentence:ai';

export class Assistant extends EventTarget {
  settings: AssistantSettings;
  state: AssistantState = { s: 'off' };
  #download: AbortController | null = null;
  #idle: ReturnType<typeof setTimeout> | null = null;
  #seq = 0;

  constructor(
    readonly runtime: AiRuntime,
    readonly store: ModelStore,
    readonly storage: KeyValueStorage,
    readonly opts: { idleUnloadMs?: number; models?: readonly ModelEntry[] } = {},
  ) {
    super();
    let saved: Partial<AssistantSettings>;
    try {
      saved = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AssistantSettings>;
    } catch {
      saved = {};
    }
    // Off by default (plan §9: AI is optional and off by default).
    this.settings = { enabled: saved.enabled === true, modelId: saved.modelId ?? null };
  }

  get models(): readonly ModelEntry[] {
    return this.opts.models ?? MODELS;
  }

  get model(): ModelEntry | undefined {
    return this.#find(this.settings.modelId);
  }

  #find(id: string | null | undefined): ModelEntry | undefined {
    return id ? (this.models.find((m) => m.id === id) ?? findModel(id)) : undefined;
  }

  #save(): void {
    this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  #set(state: AssistantState): void {
    this.state = state;
    this.dispatchEvent(new CustomEvent('change', { detail: state }));
  }

  /** Recomputes state from settings and storage (call on start-up). */
  async refresh(): Promise<AssistantState> {
    if (!this.settings.enabled) {
      this.#set({ s: 'off' });
      return this.state;
    }
    const model = this.model;
    if (!model) {
      this.#set({ s: 'no-model' });
      return this.state;
    }
    if (this.#download && this.state.s === 'downloading' && this.state.model.id === model.id)
      return this.state;
    const st = await this.store.status(model).catch(() => ({ state: 'none' as const, bytes: 0 }));
    if (st.state === 'ready') {
      this.#set(
        this.runtime.loaded() === model.id ? { s: 'loaded', model } : { s: 'ready', model },
      );
    } else if (st.state === 'partial') {
      this.#set({ s: 'paused', model, bytes: st.bytes });
    } else {
      this.#set({ s: 'no-model' });
    }
    return this.state;
  }

  async setEnabled(on: boolean): Promise<void> {
    this.settings.enabled = on;
    this.#save();
    if (!on) {
      this.pauseDownload();
      await this.runtime.unload().catch(() => undefined);
    }
    await this.refresh();
  }

  async selectModel(id: string): Promise<void> {
    if (this.settings.modelId !== id) await this.runtime.unload().catch(() => undefined);
    this.settings.modelId = id;
    this.#save();
    await this.refresh();
  }

  /** Starts or resumes the download of the selected model. */
  async download(id = this.settings.modelId): Promise<'done' | 'paused' | 'error'> {
    const model = this.#find(id);
    if (!model) return 'error';
    if (this.settings.modelId !== model.id) await this.selectModel(model.id);
    this.#download?.abort();
    const ac = new AbortController();
    this.#download = ac;
    this.#set({
      s: 'downloading',
      model,
      progress: { phase: 'downloading', done: 0, total: model.sizeBytes },
    });
    try {
      const r = await this.store.download(model, {
        signal: ac.signal,
        onProgress: (progress) => {
          if (this.#download === ac) this.#set({ s: 'downloading', model, progress });
        },
      });
      if (this.#download === ac) this.#download = null;
      await this.refresh();
      return r;
    } catch (e) {
      if (this.#download === ac) this.#download = null;
      this.#set({ s: 'error', message: (e as Error).message, model });
      return 'error';
    }
  }

  pauseDownload(): void {
    this.#download?.abort();
    this.#download = null;
  }

  async remove(id = this.settings.modelId): Promise<void> {
    const model = this.#find(id);
    if (!model) return;
    this.pauseDownload();
    if (this.runtime.loaded() === model.id) await this.runtime.unload();
    await this.store.remove(model);
    await this.refresh();
  }

  /** True when a task can run now or after loading (model downloaded). */
  get usable(): boolean {
    return ['ready', 'loaded', 'loading', 'busy'].includes(this.state.s);
  }

  async ensureLoaded(): Promise<ModelEntry> {
    const model = this.model;
    if (!this.settings.enabled) throw new Error('Turn on on-device AI first.');
    if (!model) throw new Error('Choose a model first.');
    if (this.runtime.loaded() !== model.id) {
      const st = await this.store.status(model);
      if (st.state !== 'ready') throw new Error('Download the on-device model to use this.');
      this.#set({ s: 'loading', model });
      try {
        await this.runtime.load(model);
      } catch (e) {
        this.#set({
          s: 'error',
          message: `Couldn't load the model: ${(e as Error).message}`,
          model,
        });
        throw e;
      }
    }
    this.#set({ s: 'loaded', model });
    return model;
  }

  #touch(): void {
    if (this.#idle) clearTimeout(this.#idle);
    const ms = this.opts.idleUnloadMs ?? 5 * 60_000;
    if (ms <= 0) return;
    this.#idle = setTimeout(() => {
      void this.runtime.unload().then(() => this.refresh());
    }, ms);
  }

  /** Runs a writing task and returns a suggestion (never edits the document itself). */
  async runTask(
    input: TaskInput,
    opts: { signal?: AbortSignal; onToken?: (piece: string, soFar: string) => void } = {},
  ): Promise<Suggestion> {
    const text = input.text;
    if (!text.trim()) throw new Error('Select some text first.');
    if (wordCount(text) > MAX_WORDS)
      throw new Error(`Select at most ${MAX_WORDS.toLocaleString()} words.`);
    const model = await this.ensureLoaded();
    const title =
      input.kind === 'rewrite'
        ? `Rewrite: ${TONES.find((t) => t.id === (input.tone ?? 'clearer'))?.label ?? 'Clearer'}`
        : TASK_LABELS[input.kind];
    this.#set({ s: 'busy', model, task: title });
    let soFar = '';
    try {
      const req = buildTask(input);
      const r = await this.runtime.generate({
        ...req,
        ...(opts.signal ? { signal: opts.signal } : {}),
        onToken: (p) => {
          soFar += p;
          opts.onToken?.(p, soFar);
        },
      });
      if (r.stoppedBy === 'cancelled') throw new DOMException('Cancelled', 'AbortError');
      const proposed = finishTask(input, r.text);
      if (!proposed.trim()) throw new Error('The model returned nothing. Try again.');
      const mode = resultMode(input.kind);
      return {
        id: `s${++this.#seq}`,
        kind: input.kind,
        title,
        original: text,
        proposed,
        diff: mode === 'replace' ? diffWords(text, proposed) : [{ op: 'insert', text: proposed }],
        mode,
        modelId: model.id,
        stats: {
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
          promptMs: r.promptMs,
          decodeMs: r.decodeMs,
        },
      };
    } finally {
      this.#set({ s: 'loaded', model });
      this.#touch();
    }
  }

  /** Maps plain language to a registry command. Falls back to keywords without a model. */
  async tellLucid(
    query: string,
    opts: { isWired?: (id: string) => boolean; signal?: AbortSignal } = {},
  ): Promise<Intent & { alternatives: string[] }> {
    const candidates = shortlist(query, {
      limit: 20,
      ...(opts.isWired ? { isWired: opts.isWired } : {}),
    });
    const alternatives = candidates.slice(0, 5).map((c) => c.command.id);
    if (!this.usable || candidates.length === 0) {
      return {
        ...keywordIntent(query, opts.isWired ? { isWired: opts.isWired } : {}),
        alternatives,
      };
    }
    const model = await this.ensureLoaded();
    this.#set({ s: 'busy', model, task: 'Tell Lucid' });
    try {
      const r = await this.runtime.generate({
        ...buildIntent(query, candidates),
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      const intent = parseIntent(r.text, candidates);
      return { ...intent, alternatives: alternatives.filter((a) => a !== intent.command) };
    } finally {
      this.#set({ s: 'loaded', model });
      this.#touch();
    }
  }
}
