/**
 * Desktop app only: the opt-in local MCP server (plan §9.7, docs/MCP.md). The listener
 * runs in the native shell on 127.0.0.1; this side shows the settings, executes tool
 * calls against the open document, and asks the user before any command runs.
 *
 * - Off by default; "Stop all AI access" revokes every key and closes the port.
 * - Keys are per document (256-bit secrets, shown once; only salted hashes are kept, in
 *   the OS keystore). The document carries only its id (custom property
 *   `LucidSentence.DocumentId` once .docx saving lands).
 * - Proposed edits arrive as suggestions to accept or reject, never as direct edits.
 */
import { diffWords, shortlist, type Suggestion } from '@lucid-sentence/ai';
import { findCommand } from '@lucid-sentence/commands';
import { isTauri } from '@tauri-apps/api/core';
import { el, tap, toast } from '../editor/ui.js';
import type { AssistantUI } from './panel.js';
import type { AiEnv } from './setup.js';
import { findText } from './text.js';

type Permission = 'read' | 'comment' | 'suggest' | 'edit';

interface KeyInfo {
  keyId: string;
  docId: string;
  permission: Permission;
  label: string;
  created: number;
  expires?: number | null;
}

interface McpStatus {
  running: boolean;
  port: number | null;
  endpoint: string | null;
  keys: KeyInfo[];
}

interface AuditEntry {
  time: number;
  keyLabel: string;
  tool: string;
  outcome: string;
}

interface Call {
  id: number;
  tool: string;
  args: Record<string, unknown>;
  key: { keyId: string; docId: string; label: string; permission: Permission };
}

const DOC_ID_KEY = 'lucid-sentence:doc-id';

/** This document's id (random, not derived from content or the file name). */
export function documentId(): string {
  let id = localStorage.getItem(DOC_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DOC_ID_KEY, id);
  }
  return id;
}

const PERMISSIONS: { id: Permission; label: string }[] = [
  { id: 'read', label: 'Read only' },
  { id: 'comment', label: 'Read and comment' },
  { id: 'suggest', label: 'Read, comment, and suggest edits' },
  { id: 'edit', label: 'All of that, plus run commands (you confirm each)' },
];

function str(v: unknown, max = 8000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export function initMcp(ui: AssistantUI): void {
  if (!isTauri() || /Android|iPhone|iPad/i.test(navigator.userAgent)) return;
  let env: AiEnv | null = null;
  let status: McpStatus | null = null;
  let audit: AuditEntry[] = [];
  let newKey: string | null = null;
  const section = el('section', { class: 'ai-mcp', 'aria-labelledby': 'ai-mcp-title' });
  let chip: HTMLElement | null = null;

  const invoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
    env!.bridge!.invoke<T>(cmd, args);

  const renderChip = (): void => {
    if (!chip) {
      const spacer = document.querySelector('.status .spacer');
      if (!spacer) return;
      chip = el(
        'button',
        { type: 'button', class: 'status__item ai-status ai-status--mcp' },
        'AI access on',
      );
      tap(chip, () => {
        void ui.openModels();
      });
      spacer.before(chip);
    }
    chip.hidden = !status?.running;
  };

  const refresh = async (): Promise<void> => {
    if (!env?.bridge) return;
    status = await invoke<McpStatus>('mcp_status').catch(() => null);
    audit = await invoke<AuditEntry[]>('mcp_audit').catch(() => []);
    render();
    renderChip();
  };

  const render = (): void => {
    const s = status;
    const toggle = el('input', { type: 'checkbox', role: 'switch', id: 'ai-mcp-on' });
    toggle.checked = !!s?.running;
    toggle.addEventListener('change', () => {
      newKey = null;
      void invoke<McpStatus>('mcp_set_enabled', { on: toggle.checked })
        .then((st) => {
          status = st;
          render();
          renderChip();
        })
        .catch((e: unknown) => {
          toast(`Couldn’t change AI access: ${String(e)}`);
        });
    });
    const parts: (HTMLElement | string)[] = [
      el('h3', { id: 'ai-mcp-title' }, 'Connect AI apps on this computer (MCP)'),
      el(
        'p',
        { class: 'ai-muted' },
        'Lets an AI app you run (for example a desktop chat app or a code editor) read this document and propose suggestions you review. Off by default. Reachable only from this computer, and each key works for one document.',
      ),
      el(
        'label',
        { class: 'ai-switch', for: 'ai-mcp-on' },
        toggle,
        el('span', {}, 'Allow AI apps to connect'),
      ),
    ];
    if (s?.running && s.endpoint) {
      const perm = el('select', { class: 'pop__input', 'aria-label': 'Access level' });
      for (const p of PERMISSIONS) perm.append(el('option', { value: p.id }, p.label));
      perm.value = 'suggest';
      const label = el('input', {
        class: 'pop__input',
        value: 'AI app',
        'aria-label': 'Key name',
        maxlength: '40',
      });
      const create = el(
        'button',
        { type: 'button', class: 'btn btn--primary' },
        'Create key for this document',
      );
      tap(create, () => {
        void invoke<{ key: string; info: KeyInfo }>('mcp_create_key', {
          docId: documentId(),
          permission: perm.value,
          label: label.value.trim() || 'AI app',
          ttlSecs: null,
        }).then((r) => {
          newKey = r.key;
          void refresh();
        });
      });
      parts.push(
        el('p', {}, 'Server: ', el('code', {}, s.endpoint)),
        el('div', { class: 'ai-mcp__new' }, label, perm, create),
      );
      if (newKey) {
        const config = JSON.stringify(
          {
            mcpServers: {
              'lucid-sentence': { url: s.endpoint, headers: { Authorization: `Bearer ${newKey}` } },
            },
          },
          null,
          2,
        );
        const copy = el('button', { type: 'button', class: 'btn btn--chip' }, 'Copy settings');
        tap(copy, () => {
          void navigator.clipboard.writeText(config).then(() => {
            toast('Copied. Paste it into the AI app’s MCP settings.');
          });
        });
        parts.push(
          el(
            'p',
            { class: 'ai-warn' },
            'Copy this now: the key is shown only once. Anyone with it can use this document while access is on.',
          ),
          el('pre', { class: 'ai-mcp__key' }, config),
          copy,
        );
      }
      const mine = s.keys;
      if (mine.length > 0) {
        const list = el('ul', { class: 'ai-mcp__keys' });
        for (const k of mine) {
          const revoke = el('button', { type: 'button', class: 'btn btn--chip' }, 'Revoke');
          tap(revoke, () => {
            void invoke('mcp_revoke', { keyId: k.keyId }).then(refresh);
          });
          list.append(
            el(
              'li',
              {},
              el(
                'span',
                {},
                `${k.label} · ${k.permission}${k.docId === documentId() ? ' · this document' : ''}`,
              ),
              revoke,
            ),
          );
        }
        parts.push(list);
      }
      if (audit.length > 0) {
        parts.push(
          el('h4', {}, 'Recent activity'),
          el(
            'ul',
            { class: 'ai-mcp__audit' },
            ...audit
              .slice(-6)
              .reverse()
              .map((a) =>
                el(
                  'li',
                  {},
                  `${new Date(a.time * 1000).toLocaleTimeString()} · ${a.keyLabel} · ${a.tool} · ${a.outcome}`,
                ),
              ),
          ),
        );
      }
      const stop = el(
        'button',
        { type: 'button', class: 'btn btn--chip ai-danger' },
        'Stop all AI access',
      );
      tap(stop, () => {
        newKey = null;
        void invoke('mcp_revoke_all')
          .then(() => invoke<McpStatus>('mcp_set_enabled', { on: false }))
          .then((st) => {
            status = st;
            render();
            renderChip();
            toast('AI access stopped and every key revoked.');
          });
      });
      parts.push(stop);
    }
    section.replaceChildren(...parts);
  };

  ui.extraSettings = (e) => {
    if (!e.bridge) return null;
    env = e;
    if (!status) void refresh();
    return section;
  };

  // ── Tool calls from the native server

  const confirmRun = (who: string, id: string): Promise<boolean> =>
    new Promise((resolve) => {
      document.querySelector('.ai-confirm')?.remove();
      const allow = el('button', { type: 'button', class: 'btn btn--primary' }, 'Allow');
      const deny = el('button', { type: 'button', class: 'btn btn--chip' }, 'Deny');
      const ref = findCommand(id);
      const bar = el(
        'div',
        { class: 'update-bar ai-confirm', role: 'alertdialog', 'aria-live': 'assertive' },
        el(
          'span',
          { class: 'update-bar__text' },
          `${who} wants to run ${ref ? `${ref.tab.label} › ${ref.command.label}` : id}.`,
        ),
        el('span', { class: 'update-bar__actions' }, deny, allow),
      );
      const done = (ok: boolean): void => {
        clearTimeout(timer);
        bar.remove();
        resolve(ok);
      };
      const timer = setTimeout(() => {
        done(false);
      }, 100_000);
      tap(allow, () => {
        done(true);
      });
      tap(deny, () => {
        done(false);
      });
      document.body.append(bar);
    });

  const handle = async (c: Call): Promise<unknown> => {
    const app = ui.host.app;
    if (c.key.docId !== documentId())
      throw new Error('That document is not open in Lucid Sentence.');
    const a = c.args;
    switch (c.tool) {
      case 'document_read':
        return { text: app.surface.text() };
      case 'document_outline':
        return {
          headings: [...app.surface.root.querySelectorAll('h1,h2,h3,h4')].map((h) => ({
            level: Number(h.tagName.slice(1)),
            text: (h as HTMLElement).innerText.trim(),
          })),
        };
      case 'selection_get':
        return { text: app.surface.range()?.toString() ?? '' };
      case 'comment_add': {
        const r = findText(app.surface.root, str(a['anchor'], 2000));
        if (!r) throw new Error('Anchor text not found.');
        const sel = document.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
        app.comments.add(`AI · ${c.key.label}`);
        const last = app.comments.list.at(-1);
        if (last) last.text = str(a['text'], 4000);
        app.comments.render();
        return { ok: true };
      }
      case 'suggest_replace': {
        const find = str(a['find']);
        const range = findText(app.surface.root, find);
        if (!range) throw new Error('Text to replace not found.');
        const proposed = str(a['replace']);
        const s: Suggestion = {
          id: `mcp${c.id}`,
          kind: 'rewrite',
          title: str(a['reason'], 120) || 'Suggested edit',
          original: find,
          proposed,
          diff: diffWords(find, proposed),
          mode: 'replace',
          modelId: 'external',
          stats: { promptTokens: 0, completionTokens: 0, promptMs: 0, decodeMs: 0 },
        };
        ui.showExternal(s, { range, blocks: [], text: find }, c.key.label);
        return { status: 'Shown to the user as a suggestion to accept or reject.' };
      }
      case 'commands_search':
        return {
          commands: shortlist(str(a['query'], 200), { limit: 10, isWired: ui.host.isWired }).map(
            (r) => ({
              id: r.command.id,
              label: r.command.label,
              where: `${r.tab.label} › ${r.group.label}`,
              available: ui.host.isWired(r.command.id),
            }),
          ),
        };
      case 'commands_run': {
        const id = str(a['id'], 120);
        if (!findCommand(id) || !ui.host.isWired(id))
          throw new Error('Unknown or unavailable command.');
        if (!(await confirmRun(c.key.label, id))) throw new Error('The user declined.');
        ui.host.run(id);
        return { ran: id };
      }
      default:
        throw new Error('Unknown tool.');
    }
  };

  void import('./setup.js')
    .then((m) => m.aiEnv())
    .then(async (e) => {
      if (!e.bridge) return;
      env = e;
      await e.bridge.listen<Call>('ls-mcp-call', (c) => {
        handle(c)
          .then((value) => invoke('mcp_reply', { id: c.id, ok: true, value }))
          .catch((err: unknown) =>
            invoke('mcp_reply', { id: c.id, ok: false, value: (err as Error).message }),
          );
      });
      await e.bridge.listen('ls-mcp-activity', () => {
        void refresh();
      });
      await refresh();
    })
    .catch(() => undefined);
}
