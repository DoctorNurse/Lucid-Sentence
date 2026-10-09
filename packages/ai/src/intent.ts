/**
 * "Tell Lucid": plain language → one registry command (plan §9.1 use case 4).
 *
 * 1. A keyword/synonym ranker shortlists candidate commands from the registry (this is
 *    also the Tier 0 fallback when no model is downloaded).
 * 2. The model picks one candidate, constrained by a GBNF grammar to valid JSON naming a
 *    shortlisted id (or "none"), so it can't invent commands.
 * 3. The app always asks the user to confirm before running it.
 */
import { allCommands, type CommandRef } from '@lucid-sentence/commands';
import { chatml } from './prompt.js';
import type { GenerateRequest } from './runtime.js';

export interface Intent {
  command: string | null;
  value: string;
  source: 'model' | 'keywords';
}

/** Everyday words → registry vocabulary. Values are added to the query's terms. */
const SYNONYMS: Record<string, string[]> = {
  bigger: ['increase', 'grow', 'size'],
  larger: ['increase', 'grow', 'size'],
  smaller: ['decrease', 'shrink', 'size'],
  enlarge: ['increase', 'grow'],
  redline: ['track', 'changes'],
  redlining: ['track', 'changes'],
  tracking: ['track', 'changes'],
  edits: ['changes'],
  revisions: ['changes', 'track'],
  bullet: ['bullets'],
  bulleted: ['bullets'],
  numbered: ['numbering'],
  centre: ['center'],
  middle: ['center'],
  heading: ['styles', 'heading'],
  title: ['styles'],
  words: ['word', 'count'],
  count: ['word', 'count'],
  spell: ['spelling'],
  spellcheck: ['spelling', 'grammar'],
  typo: ['spelling'],
  typos: ['spelling'],
  undo: ['undo'],
  photo: ['pictures', 'picture'],
  image: ['pictures', 'picture'],
  picture: ['pictures'],
  grid: ['table', 'gridlines'],
  note: ['comment'],
  annotate: ['comment'],
  remark: ['comment'],
  magnify: ['zoom'],
  zoom: ['zoom'],
  landscape: ['orientation'],
  portrait: ['orientation'],
  margin: ['margins'],
  columns: ['columns'],
  break: ['break', 'breaks'],
  newpage: ['page', 'break'],
  link: ['link'],
  hyperlink: ['link'],
  toc: ['table', 'contents'],
  contents: ['contents'],
  footnote: ['footnote'],
  highlight: ['highlight'],
  highlighter: ['highlight'],
  colour: ['color'],
  read: ['read', 'aloud'],
  speak: ['read', 'aloud'],
  aloud: ['read', 'aloud'],
  dark: ['dark', 'paper'],
  ruler: ['ruler'],
  find: ['find'],
  search: ['find'],
  replace: ['replace'],
  draw: ['draw', 'pen'],
  pen: ['pen'],
  ink: ['ink', 'draw'],
  print: ['print'],
  save: ['save'],
  export: ['export', 'save'],
  pdf: ['export', 'pdf'],
  symbol: ['symbol'],
  equation: ['equation'],
  watermark: ['watermark'],
  strike: ['strikethrough'],
  crossed: ['strikethrough'],
  caps: ['change', 'case'],
  uppercase: ['change', 'case'],
  lowercase: ['change', 'case'],
  indent: ['indent'],
  outdent: ['decrease', 'indent'],
  spacing: ['spacing'],
  justify: ['justify'],
  accessibility: ['accessibility'],
  accessible: ['accessibility'],
};

const STOPWORDS = new Set(
  'a an the to of for in on and or my me i please can you could would make it this that turn set put add show let do with all is be some'.split(
    ' ',
  ),
);

function stem(w: string): string {
  return w.length > 4 ? w.replace(/(ings|ing|ers|er|es|s)$/, '') : w;
}

export function queryTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w));
  const out = new Set<string>();
  for (const w of words) {
    out.add(w);
    for (const s of SYNONYMS[w] ?? []) out.add(s);
  }
  return [...out];
}

export interface ShortlistOptions {
  limit?: number;
  isWired?: (id: string) => boolean;
  refs?: readonly CommandRef[];
}

/** Keyword ranking with synonyms; stubs are excluded, runnable commands rank first. */
export function shortlist(query: string, opts: ShortlistOptions = {}): CommandRef[] {
  const refs = opts.refs ?? allCommands();
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const scored: { r: CommandRef; s: number }[] = [];
  for (const r of refs) {
    if (r.command.stub) continue;
    const label = r.command.label.toLowerCase();
    const labelWords = label
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(stem);
    const ctxWords = `${r.group.label} ${r.tab.label} ${r.command.id}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(stem);
    let s = 0;
    let covered = 0;
    const stems = terms.map(stem);
    for (const w of labelWords) if (stems.includes(w)) covered++;
    for (const t of stems) {
      if (labelWords.includes(t)) s += 10;
      else if (labelWords.some((w) => w.startsWith(t) && t.length >= 3)) s += 6;
      else if (ctxWords.includes(t)) s += 3;
    }
    if (s === 0) continue;
    // Prefer commands whose whole label the request covers ("bold" → Bold, not "Keep Text Only").
    if (labelWords.length) s += Math.round((8 * covered) / labelWords.length);
    if (label === query.trim().toLowerCase()) s += 20;
    if (opts.isWired && !opts.isWired(r.command.id)) s -= 4;
    if (r.tab.kind === 'contextual') s -= 2;
    scored.push({ r, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, opts.limit ?? 24).map((x) => x.r);
}

export function keywordIntent(query: string, opts: ShortlistOptions = {}): Intent {
  const top = shortlist(query, { ...opts, limit: 1 })[0];
  return { command: top?.command.id ?? null, value: '', source: 'keywords' };
}

/** GBNF that only admits `{"command":"<candidate|none>","value":"<short text>"}`. */
export function intentGrammar(candidates: readonly CommandRef[]): string {
  const ids = [...candidates.map((c) => c.command.id), 'none']
    .filter((id) => /^[a-z0-9.-]+$/.test(id))
    .map((id) => `"${id}"`)
    .join(' | ');
  return [
    'root ::= "{\\"command\\":\\"" id "\\",\\"value\\":\\"" value "\\"}"',
    `id ::= ${ids}`,
    'value ::= [^"\\\\\\n]{0,40}',
  ].join('\n');
}

export function buildIntent(
  query: string,
  candidates: readonly CommandRef[],
): Omit<GenerateRequest, 'signal' | 'onToken'> {
  const list = candidates
    .map((c) => `- ${c.command.id}: ${c.command.label} (${c.tab.label} › ${c.group.label})`)
    .join('\n');
  const system = `You map a word-processor user's request to exactly one command from the list. Reply with JSON {"command": "<id>", "value": "<argument or empty>"}. "value" is only for an argument the user stated, such as a font size, color, zoom percent, or style name. If no command fits, use "none".\n\nCommands:\n${list}`;
  return {
    prompt: chatml([
      { role: 'system', content: system },
      { role: 'user', content: query.slice(0, 300) },
    ]),
    maxTokens: 48,
    temperature: 0,
    grammar: intentGrammar(candidates),
    stop: [],
  };
}

/** Parses and validates the model's JSON; anything outside the shortlist becomes null. */
export function parseIntent(text: string, candidates: readonly CommandRef[]): Intent {
  try {
    const m = /\{[\s\S]*\}/.exec(text);
    const v = JSON.parse(m?.[0] ?? text) as { command?: unknown; value?: unknown };
    const id = typeof v.command === 'string' ? v.command : '';
    const ok = candidates.some((c) => c.command.id === id);
    return {
      command: ok ? id : null,
      value: typeof v.value === 'string' ? v.value.slice(0, 40) : '',
      source: 'model',
    };
  } catch {
    return { command: null, value: '', source: 'model' };
  }
}
