/**
 * On-device AI in the demo: ribbon handlers for Review › Assistant, the palette's
 * "Ask Lucid" entry, and (desktop app only) the opt-in local MCP bridge.
 */
import type { CommandEventDetail } from '@lucid-sentence/ribbon-ui';
import type { App } from '../editor/commands.js';
import { AssistantUI, type AssistantHost } from './panel.js';

let ui: AssistantUI | null = null;
let host: Omit<AssistantHost, 'app'> | null = null;

/** Called once from main.ts with the command runner (Tell Lucid needs it). */
export function initAssistant(h: AssistantHost): AssistantUI {
  host = h;
  ui = new AssistantUI(h);
  void import('./mcp.js').then((m) => {
    m.initMcp(ui!);
  });
  return ui;
}

function get(app: App): AssistantUI {
  ui ??= new AssistantUI({
    app,
    run: host?.run ?? (() => undefined),
    isWired: host?.isWired ?? (() => true),
  });
  return ui;
}

type Handler = (app: App, d: CommandEventDetail) => void;

export const assistantHandlers: Record<string, Handler> = {
  'review.assistant.rewrite': (a, d) => {
    get(a).rewriteMenu(d);
  },
  'review.assistant.fix-grammar': (a) => {
    void get(a).task('grammar');
  },
  'review.assistant.summarize': (a) => {
    void get(a).task('summarize');
  },
  'review.assistant.shorten': (a) => {
    void get(a).task('shorten');
  },
  'review.assistant.expand': (a) => {
    void get(a).task('expand');
  },
  'review.assistant.tell-lucid': (a, d) => {
    void get(a).tellLucid(d);
  },
  'review.assistant.ai-models': (a) => {
    void get(a).openModels();
  },
};
