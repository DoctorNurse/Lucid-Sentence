/**
 * Assistant UI for the demo: the model manager (opt-in, device check, download/pause/
 * resume/delete), suggestion cards with accept/reject, the Rewrite tone menu, and the
 * Tell Lucid box with a confirmation step. See docs/AI.md.
 */
import {
  ALLOWED_LICENSES,
  TASK_LABELS,
  TONES,
  changeCount,
  checkModel,
  decodeRate,
  formatBytes,
  suggestModel,
  type AssistantState,
  type DeviceFacts,
  type ModelEntry,
  type Suggestion,
  type TaskKind,
  type Tone,
} from '@lucid-sentence/ai';
import { findCommand } from '@lucid-sentence/commands';
import type { CommandEventDetail } from '@lucid-sentence/ribbon-ui';
import { MessageSquareText, ShieldCheck, Sparkles, X } from 'lucide';
import type { App } from '../editor/commands.js';
import { closePopover, el, icon, menu, openPopover, tap, toast } from '../editor/ui.js';
import { aiEnv, prefetchRuntime, type AiEnv } from './setup.js';
import {
  captureTarget,
  insertAfterTarget,
  replaceTarget,
  stillMatches,
  type Target,
} from './text.js';

export interface AssistantHost {
  app: App;
  run: (id: string) => void;
  isWired: (id: string) => boolean;
}

const EXAMPLES = ['Make the text bold', 'Turn on track changes', 'Insert a table'];

function where(id: string): string {
  const ref = findCommand(id);
  return ref ? `${ref.tab.label} › ${ref.group.label} › ${ref.command.label}` : id;
}

function percent(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

export class AssistantUI {
  #env: AiEnv | null = null;
  #facts: DeviceFacts | null = null;
  #dialog: HTMLDialogElement | null = null;
  #dialogBody: HTMLElement | null = null;
  #reason = '';
  #openedAt = 0;
  #card: HTMLElement | null = null;
  #abort: AbortController | null = null;
  #status: HTMLElement | null = null;
  extraSettings: ((env: AiEnv) => HTMLElement | null) | null = null;
  onSuggestion: ((s: Suggestion) => void) | null = null;

  constructor(readonly host: AssistantHost) {}

  async env(): Promise<AiEnv> {
    if (this.#env) return this.#env;
    const env = await aiEnv();
    this.#env = env;
    env.assistant.addEventListener('change', () => {
      this.#renderDialog();
      this.#renderStatus();
    });
    await env.assistant.refresh();
    return env;
  }

  async facts(): Promise<DeviceFacts | null> {
    if (this.#facts) return this.#facts;
    const env = await this.env();
    this.#facts = await env.device().catch(() => null);
    return this.#facts;
  }

  // ── Status bar chip (visible while a model is loaded or working)

  #renderStatus(): void {
    const st = this.#env?.assistant.state;
    const show = st && ['loading', 'loaded', 'busy', 'downloading'].includes(st.s);
    if (!this.#status) {
      const spacer = document.querySelector('.status .spacer');
      if (!spacer) return;
      this.#status = el('button', {
        type: 'button',
        class: 'status__item ai-status',
        id: 'ai-status',
        'aria-live': 'polite',
      });
      tap(this.#status, () => {
        void this.openModels();
      });
      spacer.before(this.#status);
    }
    this.#status.hidden = !show;
    if (!st || !show) return;
    this.#status.textContent =
      st.s === 'downloading'
        ? `AI model ${percent(st.progress.done, st.progress.total)}%`
        : st.s === 'busy'
          ? `AI: ${st.task}…`
          : st.s === 'loading'
            ? 'AI: loading…'
            : 'AI ready · on-device';
  }

  // ── Model manager

  async openModels(reason = ''): Promise<void> {
    this.#reason = reason;
    if (!this.#dialog) {
      const body = el('div', { class: 'ai-models__body' });
      const close = el(
        'button',
        { type: 'button', class: 'ai-models__close', 'aria-label': 'Close' },
        icon(X, 18),
      );
      const dialog = el(
        'dialog',
        { class: 'ai-models', 'aria-labelledby': 'ai-models-title' },
        el(
          'header',
          { class: 'ai-models__head' },
          icon(Sparkles, 22),
          el('h2', { id: 'ai-models-title' }, 'On-device AI'),
          close,
        ),
        body,
      );
      tap(close, () => {
        dialog.close();
      });
      // Backdrop click closes; ignore the click that follows the tap which opened it.
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog && performance.now() - this.#openedAt > 500) dialog.close();
      });
      document.body.append(dialog);
      this.#dialog = dialog;
      this.#dialogBody = body;
    }
    this.#dialogBody!.replaceChildren(el('p', { class: 'ai-muted' }, 'Checking this device…'));
    if (!this.#dialog.open) {
      this.#openedAt = performance.now();
      this.#dialog.showModal();
    }
    await this.env();
    await this.facts();
    this.#renderDialog();
  }

  #renderDialog(): void {
    const body = this.#dialogBody;
    const env = this.#env;
    if (!body || !env || !this.#dialog?.open) return;
    const a = env.assistant;
    const st = a.state;
    const parts: HTMLElement[] = [];
    if (this.#reason) parts.push(el('p', { class: 'ai-reason' }, this.#reason));
    parts.push(
      el(
        'p',
        { class: 'ai-privacy' },
        icon(ShieldCheck, 18),
        el(
          'span',
          {},
          'Optional and off by default. The model runs on this device: nothing you write is sent anywhere, and nothing is logged. After the one-time download it works offline.',
        ),
      ),
    );
    if (env.unsupported) {
      parts.push(el('p', { class: 'ai-warn' }, env.unsupported));
      body.replaceChildren(...parts);
      return;
    }
    const toggle = el('input', {
      type: 'checkbox',
      role: 'switch',
      id: 'ai-enabled',
      'data-testid': 'ai-enabled',
    });
    toggle.checked = a.settings.enabled;
    toggle.addEventListener('change', () => {
      void (async () => {
        await a.setEnabled(toggle.checked);
        if (toggle.checked && !a.settings.modelId) {
          const pick = this.#facts ? suggestModel(a.models, this.#facts) : a.models[0];
          if (pick) await a.selectModel(pick.id);
        }
      })();
    });
    parts.push(
      el(
        'label',
        { class: 'ai-switch', for: 'ai-enabled' },
        toggle,
        el('span', {}, 'Use on-device AI (Assistant group on the Review tab)'),
      ),
    );
    parts.push(this.#deviceLine(env));
    if (a.settings.enabled) {
      const list = el('div', { class: 'ai-cards', role: 'list' });
      for (const m of a.models) list.append(this.#modelCard(env, m, st));
      parts.push(list);
      if (st.s === 'error') parts.push(el('p', { class: 'ai-warn', role: 'alert' }, st.message));
    }
    const extra = this.extraSettings?.(env);
    if (extra) parts.push(extra);
    parts.push(
      el(
        'p',
        { class: 'ai-foot' },
        `Models: Qwen3.5 by the Qwen team (Alibaba Cloud), ${ALLOWED_LICENSES[0]}, GGUF from Hugging Face, checked with SHA-256 after download. Runtime: ${env.assistant.runtime.label}, MIT. Edits arrive as suggestions you accept or reject.`,
      ),
    );
    body.replaceChildren(...parts);
  }

  #deviceLine(env: AiEnv): HTMLElement {
    const f = this.#facts;
    if (!f) return el('p', { class: 'ai-muted' }, 'Device details unavailable.');
    const ram =
      f.ramGiB === null
        ? 'RAM unknown'
        : `${f.ramIsLowerBound ? '≥ ' : ''}${f.ramGiB.toFixed(f.ramGiB % 1 ? 1 : 0)} GB RAM`;
    const bits = [
      ram,
      env.bridge ? `${f.cores} CPU threads` : `WebGPU ${f.webgpu ? 'available' : 'not available'}`,
      f.storageFreeBytes === null ? null : `${formatBytes(f.storageFreeBytes)} free`,
    ].filter(Boolean);
    return el(
      'p',
      { class: 'ai-device', 'data-testid': 'ai-device' },
      `This device: ${bits.join(' · ')}`,
    );
  }

  #modelCard(env: AiEnv, m: ModelEntry, st: AssistantState): HTMLElement {
    const a = env.assistant;
    const selected = a.settings.modelId === m.id;
    const check = this.#facts
      ? checkModel(m, this.#facts)
      : { level: 'warn' as const, reasons: [] };
    const card = el('div', {
      class: `ai-card-model${selected ? ' is-selected' : ''}`,
      role: 'listitem',
      'data-model': m.id,
    });
    const badge =
      check.level === 'ok'
        ? el('span', { class: 'ai-badge ai-badge--ok' }, 'Fits this device')
        : check.level === 'warn'
          ? el('span', { class: 'ai-badge ai-badge--warn' }, 'Check')
          : el('span', { class: 'ai-badge ai-badge--block' }, 'Too large for this device');
    const lic = el(
      'a',
      { href: m.licenseUrl, target: '_blank', rel: 'noopener noreferrer' },
      m.license,
    );
    card.append(
      el(
        'div',
        { class: 'ai-card-model__head' },
        el('strong', {}, m.name),
        m.recommended ? el('span', { class: 'ai-badge' }, 'Recommended') : null,
        badge,
      ),
      el('p', { class: 'ai-card-model__summary' }, m.summary),
      el(
        'p',
        { class: 'ai-card-model__meta' },
        `${formatBytes(m.sizeBytes)} download · ${m.parameters} parameters · ${m.quantization} · needs ${m.minRamGiB} GB RAM · `,
        lic,
      ),
    );
    for (const r of check.reasons) card.append(el('p', { class: 'ai-card-model__reason' }, r));
    const actions = el('div', { class: 'ai-card-model__actions' });
    const btn = (label: string, primary: boolean, fn: () => void, testid?: string): void => {
      const b = el(
        'button',
        {
          type: 'button',
          class: `btn ${primary ? 'btn--primary' : 'btn--chip'}`,
          'data-testid': testid,
        },
        label,
      );
      tap(b, fn);
      actions.append(b);
    };
    const stModel: ModelEntry | undefined = 'model' in st ? st.model : undefined;
    const mine = selected && stModel?.id === m.id;
    if (mine && st.s === 'downloading') {
      const pct = percent(st.progress.done, st.progress.total);
      card.append(
        el(
          'div',
          {
            class: 'ai-progress',
            role: 'progressbar',
            'aria-valuenow': String(pct),
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-label': `Downloading ${m.name}`,
          },
          el('span', { style: `width:${pct}%` }),
        ),
        el(
          'p',
          { class: 'ai-muted', 'data-testid': 'ai-progress-text' },
          st.progress.phase === 'verifying'
            ? 'Checking the file (SHA-256)…'
            : `${formatBytes(st.progress.done)} of ${formatBytes(st.progress.total)} · ${pct}%`,
        ),
      );
      btn(
        'Pause',
        false,
        () => {
          a.pauseDownload();
        },
        'ai-pause',
      );
    } else if (mine && st.s === 'paused') {
      card.append(
        el(
          'p',
          { class: 'ai-muted' },
          `Paused at ${formatBytes(st.bytes)} of ${formatBytes(m.sizeBytes)}.`,
        ),
      );
      btn(
        'Resume',
        true,
        () => {
          void this.#download(env, m);
        },
        'ai-resume',
      );
      btn('Delete', false, () => {
        void a.remove(m.id);
      });
    } else if (mine && ['ready', 'loaded', 'loading', 'busy'].includes(st.s)) {
      card.append(
        el(
          'p',
          { class: 'ai-ready', 'data-testid': 'ai-ready' },
          st.s === 'loaded' || st.s === 'busy'
            ? 'Downloaded · loaded and ready'
            : st.s === 'loading'
              ? 'Downloaded · loading…'
              : 'Downloaded · ready (loads when you use it)',
        ),
      );
      btn(
        'Delete model',
        false,
        () => {
          if (confirm(`Delete ${m.name} from this device? You can download it again later.`))
            void a.remove(m.id);
        },
        'ai-delete',
      );
    } else {
      btn(
        `Download ${formatBytes(m.sizeBytes)}`,
        selected,
        () => {
          void this.#download(env, m);
        },
        `ai-download-${m.tier}`,
      );
      if (check.level === 'block') actions.lastElementChild?.setAttribute('disabled', '');
    }
    card.append(actions);
    return card;
  }

  async #download(env: AiEnv, m: ModelEntry): Promise<void> {
    // Ask the browser to keep the model when storage runs low (best effort).
    if (!env.bridge && !env.mock) void navigator.storage.persist().catch(() => false);
    const r = await env.assistant.download(m.id);
    if (r === 'done') {
      toast(`${m.name} is ready. Select text and try Review › Assistant.`);
      if (!env.bridge && !env.mock && this.#facts) prefetchRuntime(this.#facts);
    }
  }

  /** Opens the manager when AI is off or not downloaded; true when tasks can run. */
  async #ready(what: string): Promise<boolean> {
    const env = await this.env();
    if (env.unsupported) {
      toast(env.unsupported, 5000);
      return false;
    }
    if (env.assistant.usable) return true;
    const st = env.assistant.state;
    await this.openModels(
      st.s === 'downloading'
        ? `${what} will be available when the download finishes.`
        : `${what} uses an on-device model. Turn it on and download the model once; after that it works offline.`,
    );
    return false;
  }

  // ── Writing tasks

  rewriteMenu(d: CommandEventDetail): void {
    openPopover(
      d.anchor,
      menu([
        { heading: 'Rewrite' },
        ...TONES.map((t) => ({
          label: t.label,
          detail: t.detail,
          run: () => {
            void this.task('rewrite', t.id);
          },
        })),
      ]),
      { label: 'Rewrite', focus: !d.anchor, role: 'menu' },
    );
  }

  async task(kind: TaskKind, tone?: Tone, target?: Target): Promise<void> {
    const label = kind === 'rewrite' ? 'Rewrite' : TASK_LABELS[kind];
    const t = target ?? captureTarget(this.host.app.surface);
    if (!t) {
      toast(`Select some text, then choose ${label}.`);
      return;
    }
    if (!(await this.#ready(label))) return;
    const env = this.#env!;
    this.#abort?.abort();
    const ac = new AbortController();
    this.#abort = ac;
    const card = this.#openCard(
      kind === 'rewrite'
        ? `Rewrite: ${TONES.find((x) => x.id === (tone ?? 'clearer'))?.label ?? ''}`
        : label,
    );
    const live = el('p', { class: 'ai-live', 'aria-live': 'polite' }, 'Preparing the model…');
    const stop = el(
      'button',
      { type: 'button', class: 'btn btn--chip', 'data-testid': 'ai-stop' },
      'Stop',
    );
    tap(stop, () => {
      ac.abort();
    });
    card.body.replaceChildren(live);
    card.actions.replaceChildren(stop);
    try {
      const s = await env.assistant.runTask(
        { kind, text: t.text, ...(tone ? { tone } : {}) },
        {
          signal: ac.signal,
          onToken: (_p, soFar) => {
            live.textContent = soFar;
          },
        },
      );
      if (this.#abort !== ac) return;
      this.#showSuggestion(card, s, t, tone);
    } catch (e) {
      if (this.#abort !== ac) return;
      if ((e as Error).name === 'AbortError') {
        this.closeCard();
        return;
      }
      card.body.replaceChildren(el('p', { class: 'ai-warn', role: 'alert' }, (e as Error).message));
      const settings = el('button', { type: 'button', class: 'btn btn--chip' }, 'AI settings');
      tap(settings, () => {
        void this.openModels();
      });
      card.actions.replaceChildren(settings);
    }
  }

  /** A suggestion that came from outside (an MCP client), shown the same way. */
  showExternal(s: Suggestion, t: Target, source: string): void {
    const card = this.#openCard(s.title);
    card.badge.textContent = `Suggested by ${source}`;
    this.#showSuggestion(card, s, t);
  }

  #openCard(title: string): {
    root: HTMLElement;
    body: HTMLElement;
    actions: HTMLElement;
    badge: HTMLElement;
  } {
    this.closeCard(false);
    // Phones: fold the command sheet away so the text and the card are both visible.
    const ribbon = document.querySelector<
      HTMLElement & { sheetOpen?: boolean; closeSheet?: () => void }
    >('ls-ribbon');
    if (ribbon?.sheetOpen) ribbon.closeSheet?.();
    const body = el('div', { class: 'ai-sugg__body' });
    const actions = el('div', { class: 'ai-sugg__actions' });
    const badge = el('span', { class: 'ai-badge' }, 'AI draft · on-device');
    const close = el(
      'button',
      { type: 'button', class: 'ai-sugg__close', 'aria-label': 'Close' },
      icon(X, 16),
    );
    const root = el(
      'section',
      {
        class: 'ai-sugg',
        role: 'dialog',
        'aria-label': `Assistant: ${title}`,
        'data-testid': 'ai-suggestion',
      },
      el(
        'header',
        { class: 'ai-sugg__head' },
        icon(Sparkles, 18),
        el('strong', {}, title),
        badge,
        close,
      ),
      body,
      actions,
    );
    tap(close, () => {
      this.closeCard();
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeCard();
    });
    document.body.append(root);
    this.#card = root;
    return { root, body, actions, badge };
  }

  closeCard(abort = true): void {
    if (abort) {
      this.#abort?.abort();
      this.#abort = null;
    }
    this.#card?.remove();
    this.#card = null;
  }

  #showSuggestion(
    card: { body: HTMLElement; actions: HTMLElement },
    s: Suggestion,
    t: Target,
    tone?: Tone,
  ): void {
    const diff = el('div', { class: 'ai-diff', 'data-testid': 'ai-diff' });
    if (s.mode === 'insert-after') {
      diff.append(
        el('p', { class: 'ai-muted' }, 'Adds after the selection:'),
        el('ins', {}, s.proposed),
      );
    } else {
      for (const part of s.diff) {
        diff.append(
          part.op === 'equal' ? part.text : el(part.op === 'insert' ? 'ins' : 'del', {}, part.text),
        );
      }
    }
    const changes = s.mode === 'replace' ? changeCount(s.diff) : 1;
    const rate = decodeRate({
      completionTokens: s.stats.completionTokens,
      decodeMs: s.stats.decodeMs,
    });
    const model = this.#env?.assistant.models.find((m) => m.id === s.modelId);
    const meta = el(
      'p',
      { class: 'ai-sugg__meta' },
      [
        changes === 0 ? 'No changes suggested' : `${changes} change${changes === 1 ? '' : 's'}`,
        model?.name,
        rate > 0 ? `${rate.toFixed(rate < 10 ? 1 : 0)} tokens/s` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
    card.body.replaceChildren(diff, meta);
    const accept = el(
      'button',
      { type: 'button', class: 'btn btn--primary', 'data-testid': 'ai-accept' },
      'Accept',
    );
    const reject = el(
      'button',
      { type: 'button', class: 'btn btn--chip', 'data-testid': 'ai-reject' },
      'Reject',
    );
    const retry = el(
      'button',
      { type: 'button', class: 'btn btn--chip', 'data-testid': 'ai-retry' },
      'Retry',
    );
    if (changes === 0) accept.disabled = true;
    tap(accept, () => {
      if (!stillMatches(t)) {
        toast('The text changed since this suggestion. Select it and try again.');
        return;
      }
      if (s.mode === 'insert-after') insertAfterTarget(this.host.app.surface, t, s.proposed);
      else replaceTarget(this.host.app.surface, t, s.proposed);
      this.closeCard();
      this.host.app.refresh();
      toast('Suggestion accepted. Undo (Ctrl+Z) reverts it.');
    });
    tap(reject, () => {
      this.closeCard();
    });
    tap(retry, () => {
      void this.task(s.kind, tone, t);
    });
    const buttons: HTMLElement[] = [accept, reject];
    if (s.modelId !== 'external') buttons.push(retry);
    card.actions.replaceChildren(...buttons);
    accept.focus({ preventScroll: true });
    this.onSuggestion?.(s);
  }

  // ── Tell Lucid

  async tellLucid(d?: CommandEventDetail, initial = ''): Promise<void> {
    const env = await this.env();
    const input = el('input', {
      type: 'text',
      class: 'pop__input',
      placeholder: 'Tell Lucid what to do',
      'aria-label': 'Tell Lucid what to do',
      'data-testid': 'tell-lucid-input',
      maxlength: '200',
    });
    input.value = initial;
    const out = el('div', { class: 'ai-tell__out', 'aria-live': 'polite' });
    const f = el(
      'form',
      { class: 'ai-tell' },
      el(
        'div',
        { class: 'ai-tell__head' },
        icon(MessageSquareText, 18),
        el('strong', {}, 'Tell Lucid'),
      ),
      el(
        'div',
        { class: 'ai-tell__row' },
        input,
        el('button', { type: 'submit', class: 'btn btn--primary' }, 'Go'),
      ),
      out,
    );
    const examples = el('div', { class: 'ai-tell__examples' });
    for (const ex of EXAMPLES) {
      const b = el('button', { type: 'button', class: 'btn btn--chip' }, ex);
      tap(b, () => {
        input.value = ex;
        f.requestSubmit();
      });
      examples.append(b);
    }
    out.append(
      examples,
      el(
        'p',
        { class: 'ai-muted' },
        env.assistant.usable
          ? 'The on-device model picks a command; you confirm before anything runs.'
          : 'AI is off, so Lucid matches keywords. Turn on on-device AI for plain-language requests.',
      ),
    );
    let ac: AbortController | null = null;
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      ac?.abort();
      const mine = new AbortController();
      ac = mine;
      out.replaceChildren(el('p', { class: 'ai-muted' }, 'Thinking…'));
      env.assistant
        .tellLucid(q, { isWired: this.host.isWired, signal: mine.signal })
        .then((intent) => {
          if (ac !== mine) return;
          this.#renderIntent(out, intent);
        })
        .catch((err: unknown) => {
          if (ac !== mine) return;
          out.replaceChildren(el('p', { class: 'ai-warn' }, (err as Error).message));
        });
    });
    openPopover(d?.anchor, f, {
      label: 'Tell Lucid',
      focus: true,
      wide: true,
      onClose: () => {
        ac?.abort();
      },
    });
    input.focus();
    if (initial) f.requestSubmit();
  }

  #renderIntent(
    out: HTMLElement,
    intent: { command: string | null; value: string; source: string; alternatives: string[] },
  ): void {
    const run = (id: string, value: string): void => {
      closePopover();
      this.#runIntent(id, value);
    };
    const nodes: HTMLElement[] = [];
    if (intent.command) {
      const confirmBtn = el(
        'button',
        { type: 'button', class: 'btn btn--primary', 'data-testid': 'tell-lucid-confirm' },
        'Run it',
      );
      const cancel = el('button', { type: 'button', class: 'btn btn--chip' }, 'Cancel');
      const cmd = intent.command;
      tap(confirmBtn, () => {
        run(cmd, intent.value);
      });
      tap(cancel, () => {
        closePopover();
      });
      nodes.push(
        el(
          'p',
          { class: 'ai-tell__answer', 'data-testid': 'tell-lucid-answer', 'data-command': cmd },
          'Run ',
          el('strong', {}, where(cmd)),
          intent.value ? ` with “${intent.value}”` : '',
          '?',
        ),
        el('div', { class: 'ai-sugg__actions' }, confirmBtn, cancel),
        el(
          'p',
          { class: 'ai-muted' },
          intent.source === 'model' ? 'Matched by the on-device model.' : 'Matched by keywords.',
        ),
      );
      setTimeout(() => {
        confirmBtn.focus();
      }, 0);
    } else {
      nodes.push(
        el('p', {}, 'Lucid couldn’t match that to a command. Try other words, or one of these:'),
      );
    }
    const alts = intent.alternatives.filter((x) => x !== intent.command).slice(0, 3);
    if (alts.length > 0) {
      const list = el('div', { class: 'ai-tell__alts' });
      for (const id of alts) {
        const b = el(
          'button',
          { type: 'button', class: 'pop__item', role: 'menuitem' },
          el('span', { class: 'pop__label' }, where(id)),
        );
        tap(b, () => {
          run(id, '');
        });
        list.append(b);
      }
      nodes.push(el('p', { class: 'ai-muted' }, intent.command ? 'Or:' : ''), list);
    }
    out.replaceChildren(...nodes);
  }

  #runIntent(id: string, value: string): void {
    const s = this.host.app.surface;
    if (value && id === 'home.font.font') {
      s.setFont(value);
    } else if (value && id === 'home.font.size' && Number.isFinite(parseFloat(value))) {
      s.setFontSize(Math.max(1, Math.min(400, parseFloat(value))));
    } else {
      this.host.run(id);
      return;
    }
    this.host.app.refresh();
  }
}
