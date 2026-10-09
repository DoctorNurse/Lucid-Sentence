/** Find and Replace panel (Ctrl+F / Ctrl+H) for the stand-in surface. */
import { ChevronDown, ChevronUp, X } from 'lucide';
import type { EditorSurface } from './surface.js';
import { el, icon, tap } from './ui.js';

interface HighlightRegistry {
  set(name: string, h: unknown): void;
  delete(name: string): void;
}
declare const Highlight: new (...r: Range[]) => unknown;

function highlights(): HighlightRegistry | null {
  const c = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  return c?.highlights && typeof Highlight === 'function' ? c.highlights : null;
}

export function findRanges(root: HTMLElement, query: string, matchCase: boolean): Range[] {
  if (!query) return [];
  const out: Range[] = [];
  const q = matchCase ? query : query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = matchCase ? (n.nodeValue ?? '') : (n.nodeValue ?? '').toLowerCase();
    let i = text.indexOf(q);
    while (i >= 0) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + q.length);
      out.push(r);
      i = text.indexOf(q, i + q.length);
    }
  }
  return out;
}

export class FindPanel {
  #find: HTMLInputElement;
  #replace: HTMLInputElement;
  #count: HTMLElement;
  #case: HTMLInputElement;
  #replaceRow: HTMLElement;
  #matches: Range[] = [];
  #i = -1;

  constructor(
    readonly root: HTMLElement,
    readonly surface: EditorSurface,
  ) {
    this.#find = el('input', {
      type: 'search',
      class: 'find__input',
      placeholder: 'Find in document',
      'aria-label': 'Find',
    });
    this.#replace = el('input', {
      type: 'text',
      class: 'find__input',
      placeholder: 'Replace with',
      'aria-label': 'Replace with',
    });
    this.#count = el('span', { class: 'find__count', 'aria-live': 'polite' });
    this.#case = el('input', { type: 'checkbox', 'aria-label': 'Match case' });
    const iconBtn = (label: string, node: typeof X, run: () => void): HTMLButtonElement => {
      const b = el('button', {
        type: 'button',
        class: 'find__icon',
        'aria-label': label,
        title: label,
      });
      b.append(icon(node, 16));
      tap(b, run);
      return b;
    };
    const textBtn = (label: string, run: () => void): HTMLButtonElement => {
      const b = el('button', { type: 'button', class: 'btn btn--chip' }, label);
      tap(b, run);
      return b;
    };
    this.#replaceRow = el(
      'div',
      { class: 'find__row' },
      this.#replace,
      textBtn('Replace', () => {
        this.replaceOne();
      }),
      textBtn('Replace All', () => {
        this.replaceAll();
      }),
    );
    root.append(
      el(
        'div',
        { class: 'find__head' },
        el('h2', { class: 'find__title' }, 'Find'),
        iconBtn('Close (Esc)', X, () => {
          this.close();
        }),
      ),
      el(
        'div',
        { class: 'find__row' },
        this.#find,
        iconBtn('Previous match (Shift+Enter)', ChevronUp, () => {
          this.step(-1);
        }),
        iconBtn('Next match (Enter)', ChevronDown, () => {
          this.step(1);
        }),
      ),
      el(
        'div',
        { class: 'find__meta' },
        this.#count,
        el('label', { class: 'find__case' }, this.#case, 'Match case'),
      ),
      this.#replaceRow,
    );
    this.#find.addEventListener('input', () => {
      this.search();
    });
    this.#case.addEventListener('change', () => {
      this.search();
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter' && e.target === this.#find) {
        e.preventDefault();
        this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Enter' && e.target === this.#replace) {
        e.preventDefault();
        this.replaceOne();
      }
    });
    surface.root.addEventListener('input', () => {
      if (!root.hidden) this.search(false);
    });
  }

  open(replace: boolean): void {
    this.root.hidden = false;
    this.root.dataset['mode'] = replace ? 'replace' : 'find';
    this.#replaceRow.hidden = !replace;
    const sel = this.surface.range()?.toString().trim();
    if (sel && sel.length < 80 && !sel.includes('\n')) this.#find.value = sel;
    (replace && this.#find.value ? this.#replace : this.#find).focus();
    this.#find.select();
    this.search();
  }

  close(): void {
    this.root.hidden = true;
    highlights()?.delete('ls-find');
    highlights()?.delete('ls-find-current');
    this.surface.focus();
  }

  search(reset = true): void {
    this.#matches = findRanges(this.surface.root, this.#find.value, this.#case.checked);
    if (reset || this.#i >= this.#matches.length) this.#i = this.#matches.length > 0 ? 0 : -1;
    this.#paint();
  }

  step(dir: 1 | -1): void {
    if (this.#matches.length === 0) return;
    this.#i = (this.#i + dir + this.#matches.length) % this.#matches.length;
    this.#paint(true);
  }

  #paint(scroll = false): void {
    const n = this.#matches.length;
    this.#count.textContent = this.#find.value
      ? n === 0
        ? 'No results'
        : `${this.#i + 1} of ${n}`
      : '';
    const h = highlights();
    if (h) {
      h.set('ls-find', new Highlight(...this.#matches));
      const cur = this.#matches[this.#i];
      if (cur) h.set('ls-find-current', new Highlight(cur));
      else h.delete('ls-find-current');
    }
    const cur = this.#matches[this.#i];
    if (scroll && cur) {
      cur.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  get count(): number {
    return this.#matches.length;
  }

  replaceOne(): void {
    const cur = this.#matches[this.#i];
    if (!cur) return;
    const sel = document.getSelection();
    this.surface.root.focus({ preventScroll: true });
    sel?.removeAllRanges();
    sel?.addRange(cur);
    this.surface.insertText(this.#replace.value);
    this.search(false);
    this.#paint();
  }

  replaceAll(): void {
    const all = [...this.#matches].reverse();
    if (all.length === 0) return;
    const sel = document.getSelection();
    this.surface.root.focus({ preventScroll: true });
    for (const r of all) {
      sel?.removeAllRanges();
      sel?.addRange(r);
      this.surface.insertText(this.#replace.value);
    }
    this.#count.textContent = `Replaced ${all.length}`;
    this.#matches = [];
    this.#i = -1;
    highlights()?.delete('ls-find');
    highlights()?.delete('ls-find-current');
  }
}
