/**
 * Convert to text and Search ink (Notes mode and the Draw tab), on top of the on-device
 * recognizer in ink/recognize.ts. Nothing here talks to a server.
 */
import type { InkLayer, Stroke } from './ink.js';
import {
  groupLines,
  matches,
  recognizeInk,
  writable,
  type Engine,
  type LineText,
} from './ink/recognize.js';
import type { EditorSurface } from './surface.js';
import { closePopover, el, openPopover, tap, toast } from './ui.js';

const FAILED =
  "Handwriting recognition couldn't start on this device, so ink can't be converted or searched here yet. Your ink is safe and unchanged.";
const UNREADABLE =
  "Couldn't read this handwriting. Try writing a little larger, one line at a time. Recognition is English only for now.";

export interface HandwritingDeps {
  ink: InkLayer;
  surface: EditorSurface;
  page: HTMLElement;
  scroller: HTMLElement;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class HandwritingTools {
  #index = new Map<string, LineText>();
  /** Last engine used (tests and the result note). */
  engine: Engine | null = null;

  constructor(readonly d: HandwritingDeps) {}

  #key(strokes: readonly Stroke[], ids: readonly number[]): string {
    const want = new Set(ids);
    let n = 0;
    for (const s of strokes) if (want.has(s.id)) n += s.points.length + Math.round(s.points[0]![0]);
    return `${ids.join(',')}:${n}`;
  }

  /** Recognize lines (cached, so a second search is instant). */
  async read(
    strokes: readonly Stroke[],
    onLine?: (done: number, total: number) => void,
  ): Promise<LineText[]> {
    const lines = groupLines(strokes);
    const missing = lines.filter((l) => !this.#index.has(this.#key(strokes, l.ids)));
    if (missing.length > 0) {
      const sub = new Set(missing.flatMap((l) => l.ids));
      const r = await recognizeInk(
        strokes.filter((s) => sub.has(s.id)),
        onLine,
      );
      this.engine = r.engine;
      for (const l of r.lines) this.#index.set(this.#key(strokes, l.ids), l);
    }
    return lines.map(
      (l) => this.#index.get(this.#key(strokes, l.ids)) ?? { ...l, text: '', confidence: 0 },
    );
  }

  #zoom(): number {
    return this.d.page.getBoundingClientRect().width / (this.d.page.offsetWidth || 1) || 1;
  }

  /** Scroll so a page-space box is in view. */
  reveal(box: readonly number[]): void {
    const pr = this.d.page.getBoundingClientRect();
    const sr = this.d.scroller.getBoundingClientRect();
    const z = this.#zoom();
    const top = pr.top + box[1]! * z;
    const bottom = top + box[3]! * z;
    if (top < sr.top + 40 || bottom > sr.bottom - 40) {
      this.d.scroller.scrollTop += top - sr.top - sr.height / 3;
    }
  }

  // -------------------------------------------------------------------------
  // Convert to text

  async convert(anchor?: HTMLElement): Promise<void> {
    const ink = this.d.ink;
    const chosen = ink.selected.size
      ? ink.strokes.filter((s) => ink.selected.has(s.id))
      : ink.strokes;
    const strokes = writable(chosen);
    if (strokes.length === 0) {
      toast(
        ink.selected.size
          ? 'The selection has no handwriting to convert (highlighter and shapes are skipped).'
          : 'Write something first, then Convert to text reads it on this device.',
      );
      return;
    }
    const status = el(
      'p',
      { class: 'hw__status', role: 'status' },
      'Reading your handwriting on this device…',
    );
    const body = el(
      'div',
      { class: 'hw' },
      el('div', { class: 'pop__heading' }, 'Convert to text'),
      status,
    );
    openPopover(anchor, body, { label: 'Convert to text', role: 'dialog', wide: true });
    let lines: LineText[];
    try {
      lines = await this.read(strokes, (n, total) => {
        if (total > 1) status.textContent = `Reading line ${n} of ${total}…`;
      });
    } catch {
      status.textContent = FAILED;
      return;
    }
    if (!body.isConnected) return;
    const text = lines
      .map((l) => l.text)
      .filter(Boolean)
      .join('\n');
    if (!text.trim()) {
      status.textContent = UNREADABLE;
      return;
    }
    status.textContent = `Read on this device by ${this.engine?.label ?? 'the recognizer'}. Check it, fix anything it misread, then:`;
    const area = el('textarea', {
      class: 'pop__input hw__text',
      rows: String(Math.min(8, Math.max(2, lines.length + 1))),
      'aria-label': 'Recognized text',
      spellcheck: 'true',
    });
    area.value = text;
    const ids = new Set(lines.flatMap((l) => l.ids));
    const top = Math.min(...lines.map((l) => l.box[1]));
    const insert = el('button', { type: 'button', class: 'btn btn--primary' }, 'Insert as text');
    const replace = el('button', { type: 'button', class: 'btn' }, 'Replace ink with text');
    const copy = el('button', { type: 'button', class: 'btn' }, 'Copy');
    tap(insert, () => {
      this.#insert(area.value, top);
      closePopover();
      toast('Text inserted. Your ink is still there.');
    });
    tap(replace, () => {
      this.#insert(area.value, top);
      ink.select([...ids]);
      ink.deleteSelection();
      closePopover();
      toast('Ink replaced with text. Undo brings the ink back.');
    });
    tap(copy, () => {
      void navigator.clipboard.writeText(area.value).then(
        () => {
          toast('Copied');
        },
        () => {
          area.select();
          toast('Select the text and copy it');
        },
      );
    });
    body.append(area, el('div', { class: 'hw__actions' }, insert, replace, copy));
  }

  /** Insert paragraphs into the document near page height `y` (where the ink is). */
  #insert(text: string, y: number): void {
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const root = this.d.surface.root;
    const pr = this.d.page.getBoundingClientRect();
    const z = this.#zoom();
    const blocks = [...root.children].filter((b): b is HTMLElement => b instanceof HTMLElement);
    let after: HTMLElement | null = null;
    for (const b of blocks) {
      if ((b.getBoundingClientRect().top - pr.top) / z <= y) after = b;
    }
    const r = document.createRange();
    if (after) {
      r.selectNodeContents(after);
      r.collapse(false);
    } else {
      r.setStart(root, 0);
      r.collapse(true);
    }
    root.focus({ preventScroll: true });
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    const html = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
    this.d.surface.insertHTML(html);
  }

  // -------------------------------------------------------------------------
  // Search ink

  search(anchor?: HTMLElement): void {
    const ink = this.d.ink;
    const input = el('input', {
      type: 'search',
      class: 'pop__input',
      placeholder: 'Find words in your handwriting',
      'aria-label': 'Search ink',
      enterkeyhint: 'search',
    });
    const go = el('button', { type: 'submit', class: 'btn btn--primary' }, 'Search');
    const status = el('p', { class: 'hw__status', role: 'status' });
    const results = el('div', { class: 'pop__menu hw__results' });
    const formEl = el('form', { class: 'hw__search' }, input, go);
    const body = el(
      'div',
      { class: 'hw' },
      el('div', { class: 'pop__heading' }, 'Search ink'),
      formEl,
      status,
      results,
    );
    const run = async (): Promise<void> => {
      const q = input.value.trim();
      results.replaceChildren();
      if (!q) return;
      const strokes = writable(ink.strokes);
      if (strokes.length === 0) {
        status.textContent = 'There is no handwriting on this page yet.';
        return;
      }
      status.textContent = 'Reading your handwriting on this device…';
      let lines: LineText[];
      try {
        lines = await this.read(strokes, (n, total) => {
          status.textContent = `Reading line ${n} of ${total}…`;
        });
      } catch {
        status.textContent = FAILED;
        return;
      }
      const hits = lines.filter((l) => matches(l.text, q));
      if (hits.length === 0) {
        status.textContent = lines.some((l) => l.text)
          ? `No handwriting matches “${q}”.`
          : UNREADABLE;
        return;
      }
      status.textContent = `${hits.length} line${hits.length === 1 ? '' : 's'} match “${q}”. Tap one to go there.`;
      ink.select(hits.flatMap((h) => h.ids));
      this.reveal(hits[0]!.box);
      for (const h of hits) {
        const b = el(
          'button',
          { type: 'button', class: 'pop__item', role: 'menuitem' },
          el('span', { class: 'pop__label' }, h.text),
        );
        tap(b, () => {
          ink.select(h.ids);
          this.reveal(h.box);
        });
        results.append(b);
      }
    };
    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      void run();
    });
    openPopover(anchor, body, { label: 'Search ink', role: 'dialog', wide: true, focus: true });
    input.focus();
  }
}
