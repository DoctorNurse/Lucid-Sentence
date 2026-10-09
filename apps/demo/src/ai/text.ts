/**
 * Selection capture and replacement for Assistant suggestions in the stand-in editor.
 * When the engine lands (M1), accepting becomes a tracked change instead (plan §9.5).
 */
import type { EditorSurface } from '../editor/surface.js';

export interface Target {
  range: Range;
  /** Whole blocks covered (multi-paragraph selections are widened to full paragraphs). */
  blocks: HTMLElement[];
  text: string;
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

function textOf(t: { range: Range; blocks: HTMLElement[] }): string {
  return t.blocks.length > 1
    ? t.blocks.map((b) => b.innerText.trim()).join('\n\n')
    : t.range.toString();
}

/** The selection, or the paragraph at the caret when nothing is selected. */
export function captureTarget(surface: EditorSurface): Target | null {
  const r = surface.range();
  if (!r) return null;
  const blocks = surface.selectedBlocks();
  let range = r.cloneRange();
  if (blocks.length > 1) {
    range = document.createRange();
    range.setStart(blocks[0]!, 0);
    const last = blocks.at(-1)!;
    range.setEnd(last, last.childNodes.length);
  } else if (range.collapsed) {
    const block = blocks[0];
    if (!block) return null;
    range = document.createRange();
    range.selectNodeContents(block);
  }
  const t = { range, blocks: blocks.length > 1 ? blocks : blocks.slice(0, 1) };
  const text = textOf(t);
  return text.trim() ? { ...t, text } : null;
}

/** True when the target still holds the text the suggestion was made from. */
export function stillMatches(t: Target): boolean {
  return t.range.startContainer.isConnected && norm(textOf(t)) === norm(t.text);
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function paragraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function select(range: Range): void {
  const sel = document.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Replaces the target with `text` as one undoable edit. */
export function replaceTarget(surface: EditorSurface, t: Target, text: string): void {
  surface.focus();
  select(t.range);
  if (t.blocks.length > 1 || /\n\s*\n/.test(text)) surface.insertHTML(paragraphsHtml(text));
  else surface.insertText(text.replace(/\s*\n\s*/g, ' '));
}

/** Inserts `text` as new paragraphs after the target's last block (Summarize). */
export function insertAfterTarget(surface: EditorSurface, t: Target, text: string): void {
  surface.focus();
  const last = t.blocks.at(-1);
  const r = document.createRange();
  if (last?.isConnected) {
    r.selectNodeContents(last);
    r.collapse(false);
  } else {
    r.setStart(t.range.endContainer, t.range.endOffset);
    r.collapse(true);
  }
  select(r);
  surface.insertHTML(paragraphsHtml(text));
}

/** Finds the first occurrence of `needle` in the document's text (for MCP tools). */
export function findText(root: HTMLElement, needle: string): Range | null {
  if (!needle) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let all = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    all += (n as Text).data;
  }
  const at = all.indexOf(needle);
  if (at < 0) return null;
  const end = at + needle.length;
  const r = document.createRange();
  let pos = 0;
  let started = false;
  for (const n of nodes) {
    const len = n.data.length;
    if (!started && at <= pos + len) {
      r.setStart(n, at - pos);
      started = true;
    }
    if (started && end <= pos + len) {
      r.setEnd(n, end - pos);
      return r;
    }
    pos += len;
  }
  return null;
}
