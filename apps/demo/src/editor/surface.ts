/* eslint-disable @typescript-eslint/no-deprecated --
 * The stand-in editor deliberately uses document.execCommand: it is the only
 * API that edits contenteditable with the browser's native undo stack. The
 * engine (M1) replaces this surface entirely.
 */
/**
 * Stand-in document surface: a contenteditable page driven by the browser's
 * editing commands (which also give native undo/redo). Everything that touches
 * document content goes through this class, so the ONLYOFFICE engine can
 * replace it in M1 behind the same `DocumentSurface` interface.
 */

export type StyleName =
  'Normal' | 'Title' | 'Subtitle' | 'Heading 1' | 'Heading 2' | 'Heading 3' | 'Quote';

export const STYLES: { name: StyleName; tag: string; cls?: string }[] = [
  { name: 'Normal', tag: 'p' },
  { name: 'Title', tag: 'h1' },
  { name: 'Subtitle', tag: 'p', cls: 'd-subtitle' },
  { name: 'Heading 1', tag: 'h2' },
  { name: 'Heading 2', tag: 'h3' },
  { name: 'Heading 3', tag: 'h4' },
  { name: 'Quote', tag: 'blockquote' },
];

export type Align = 'left' | 'center' | 'right' | 'justify';

export interface SelectionState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sub: boolean;
  sup: boolean;
  align: Align;
  list: 'ul' | 'ol' | null;
  style: StyleName;
  font: string;
  size: string;
  inTable: boolean;
  image: HTMLImageElement | null;
  collapsed: boolean;
}

/** What the rest of the app may ask of a document surface (engine-swappable). */
export interface DocumentSurface {
  readonly root: HTMLElement;
  focus(): void;
  state(): SelectionState;
  exec(command: string, value?: string): void;
  insertHTML(html: string): void;
  insertText(text: string): void;
  text(): string;
}

const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,div.d-page-break';

export class EditorSurface implements DocumentSurface {
  #range: Range | null = null;
  selectedImage: HTMLImageElement | null = null;

  constructor(readonly root: HTMLElement) {
    document.addEventListener('selectionchange', () => {
      const sel = document.getSelection();
      if (sel && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        this.#range = sel.getRangeAt(0).cloneRange();
      }
    });
    root.addEventListener('click', (e) => {
      const img = (e.target as Element).closest('img');
      this.selectImage(img && root.contains(img) ? img : null);
    });
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* not supported: harmless */
    }
  }

  selectImage(img: HTMLImageElement | null): void {
    this.selectedImage?.classList.remove('is-selected');
    this.selectedImage = img;
    img?.classList.add('is-selected');
    this.root.dispatchEvent(new Event('ls-selection', { bubbles: true }));
  }

  /** Focus the document and restore the last selection inside it. */
  focus(): void {
    if (document.activeElement !== this.root) this.root.focus({ preventScroll: true });
    const sel = document.getSelection();
    if (this.#range && sel) {
      const inside =
        sel.rangeCount > 0 && this.root.contains(sel.getRangeAt(0).commonAncestorContainer);
      if (!inside) {
        sel.removeAllRanges();
        sel.addRange(this.#range);
      }
    }
  }

  range(): Range | null {
    const sel = document.getSelection();
    if (
      sel &&
      sel.rangeCount > 0 &&
      this.root.contains(sel.getRangeAt(0).commonAncestorContainer)
    ) {
      return sel.getRangeAt(0);
    }
    return this.#range;
  }

  exec(command: string, value?: string): void {
    this.focus();
    document.execCommand('styleWithCSS', false, 'true');
    if (document.execCommand(command, false, value)) this.#recorded();
    this.changed();
  }

  insertHTML(html: string): void {
    this.focus();
    if (document.execCommand('insertHTML', false, html)) this.#recorded();
    this.changed();
  }

  insertText(text: string): void {
    this.focus();
    if (document.execCommand('insertText', false, text)) this.#recorded();
    this.changed();
  }

  /** One native undo step was recorded (the shared timeline listens for this). */
  #recorded(): void {
    this.root.dispatchEvent(new Event('ls-exec'));
  }

  text(): string {
    return this.root.innerText;
  }

  changed(): void {
    this.root.dispatchEvent(new Event('ls-change', { bubbles: true }));
  }

  /** Element at the caret (or selection start). */
  anchorElement(): HTMLElement | null {
    const r = this.range();
    if (!r) return null;
    const n = r.startContainer;
    const e = n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;
    return e instanceof HTMLElement && this.root.contains(e) ? e : null;
  }

  /** Block elements that intersect the selection. */
  selectedBlocks(): HTMLElement[] {
    const r = this.range();
    if (!r) return [];
    const all = [...this.root.querySelectorAll<HTMLElement>(BLOCKS)].filter(
      (b) => r.intersectsNode(b) && !b.querySelector(BLOCKS.replace(',div.d-page-break', '')),
    );
    if (all.length > 0) return all;
    const a = this.anchorElement()?.closest<HTMLElement>(BLOCKS);
    return a ? [a] : [];
  }

  /** Apply a paragraph style (Normal, Title, Heading 1–3, Quote…). */
  applyStyle(name: StyleName): void {
    const s = STYLES.find((x) => x.name === name);
    if (!s) return;
    this.exec('formatBlock', s.tag);
    for (const b of this.selectedBlocks()) {
      if (b.tagName.toLowerCase() === s.tag) {
        b.className = s.cls ?? '';
        if (!b.className) b.removeAttribute('class');
      }
    }
    this.changed();
  }

  setFont(family: string): void {
    this.exec('fontName', family);
  }

  /** Font size in points; browser sizes are mapped to exact pt spans. */
  setFontSize(pt: number): void {
    this.exec('fontSize', '7');
    for (const span of this.root.querySelectorAll<HTMLElement>(
      '[style*="xxx-large"], font[size="7"]',
    )) {
      if (span.tagName === 'FONT') {
        const s = document.createElement('span');
        s.style.fontSize = `${pt}pt`;
        s.append(...span.childNodes);
        span.replaceWith(s);
      } else {
        span.style.fontSize = `${pt}pt`;
      }
    }
    this.changed();
  }

  /** Step through Word's size list (Ctrl+] / Ctrl+[). */
  stepFontSize(dir: 1 | -1): void {
    const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
    const cur = Number.parseFloat(this.state().size) || 11;
    const next =
      dir > 0
        ? (sizes.find((s) => s > cur) ?? cur + 10)
        : ([...sizes].reverse().find((s) => s < cur) ?? Math.max(1, cur - 1));
    this.setFontSize(next);
  }

  setBlockStyle(
    prop:
      | 'lineHeight'
      | 'marginTop'
      | 'marginBottom'
      | 'marginLeft'
      | 'marginRight'
      | 'textAlign'
      | 'backgroundColor'
      | 'borderBottom'
      | 'borderTop'
      | 'border'
      | 'padding',
    value: string,
  ): void {
    for (const b of this.selectedBlocks()) b.style[prop] = value;
    this.changed();
  }

  /** Indent: nest list items; elsewhere change the paragraph's left indent by 0.5". */
  indent(dir: 1 | -1): void {
    const a = this.anchorElement();
    if (a?.closest('li')) {
      this.exec(dir > 0 ? 'indent' : 'outdent');
      return;
    }
    for (const b of this.selectedBlocks()) {
      const cur = Number.parseFloat(b.style.marginLeft) || 0;
      b.style.marginLeft = `${Math.max(0, cur + dir * 0.5)}in`;
      if (b.style.marginLeft === '0in') b.style.removeProperty('margin-left');
    }
    this.changed();
  }

  clearFormatting(): void {
    this.exec('removeFormat');
    this.exec('unlink');
    this.applyStyle('Normal');
    for (const b of this.selectedBlocks()) b.removeAttribute('style');
  }

  changeCase(mode: 'upper' | 'lower' | 'sentence' | 'title' | 'toggle'): void {
    const r = this.range();
    const t = r?.toString() ?? '';
    if (!t) return;
    const out =
      mode === 'upper'
        ? t.toUpperCase()
        : mode === 'lower'
          ? t.toLowerCase()
          : mode === 'title'
            ? t.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
            : mode === 'sentence'
              ? t
                  .toLowerCase()
                  .replace(
                    /(^\s*|[.!?]\s+)(\p{L})/gu,
                    (_m, p: string, c: string) => p + c.toUpperCase(),
                  )
              : Array.from(t)
                  .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
                  .join('');
    this.insertText(out);
    // Reselect the replaced text.
    const sel = document.getSelection();
    const end = sel?.focusNode;
    if (sel && end) {
      const nr = document.createRange();
      nr.setStart(end, Math.max(0, sel.focusOffset - out.length));
      nr.setEnd(end, sel.focusOffset);
      sel.removeAllRanges();
      sel.addRange(nr);
    }
  }

  insertTable(rows: number, cols: number): void {
    const cell = '<td><br></td>';
    const head = `<thead><tr>${'<th><br></th>'.repeat(cols)}</tr></thead>`;
    const body = `<tbody>${`<tr>${cell.repeat(cols)}</tr>`.repeat(Math.max(1, rows - 1))}</tbody>`;
    this.insertHTML(`<table class="d-table" data-new="1">${head}${body}</table><p><br></p>`);
    // Put the caret in the first cell, as Word does.
    const t = this.root.querySelector<HTMLTableElement>('table[data-new]');
    if (!t) return;
    t.removeAttribute('data-new');
    const first = t.querySelector('th,td');
    if (first) {
      const r = document.createRange();
      r.setStart(first, 0);
      r.collapse(true);
      const s = document.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
    this.root.dispatchEvent(new Event('ls-selection'));
  }

  /** Current table cell, if the caret is in a table. */
  cell(): HTMLTableCellElement | null {
    return this.anchorElement()?.closest('td,th') ?? null;
  }

  tableOp(
    op: 'row-above' | 'row-below' | 'col-left' | 'col-right' | 'del-row' | 'del-col' | 'del-table',
  ): void {
    const cell = this.cell();
    const table = cell?.closest('table');
    const row = cell?.parentElement as HTMLTableRowElement | null;
    if (!cell || !table || !row) return;
    const idx = cell.cellIndex;
    if (op === 'row-above' || op === 'row-below') {
      const nr = document.createElement('tr');
      for (let i = 0; i < row.cells.length; i++)
        nr.append(Object.assign(document.createElement('td'), { innerHTML: '<br>' }));
      if (row.parentElement?.tagName === 'THEAD' && op === 'row-below') {
        table.tBodies[0]?.prepend(nr);
      } else row[op === 'row-above' ? 'before' : 'after'](nr);
    } else if (op === 'col-left' || op === 'col-right') {
      for (const r of table.rows) {
        const ref = r.cells[idx];
        const c = document.createElement(r.parentElement?.tagName === 'THEAD' ? 'th' : 'td');
        c.innerHTML = '<br>';
        ref?.[op === 'col-left' ? 'before' : 'after'](c);
      }
    } else if (op === 'del-row') {
      if (table.rows.length <= 1) table.remove();
      else row.remove();
    } else if (op === 'del-col') {
      if (row.cells.length <= 1) table.remove();
      else for (const r of [...table.rows]) r.cells[idx]?.remove();
    } else {
      table.remove();
    }
    this.changed();
  }

  state(): SelectionState {
    const q = (c: string): boolean => {
      try {
        return document.queryCommandState(c);
      } catch {
        return false;
      }
    };
    const a = this.anchorElement() ?? this.root;
    const cs = getComputedStyle(a);
    const block = a.closest<HTMLElement>('p,h1,h2,h3,h4,blockquote,li,td,th') ?? a;
    const tag = block.tagName.toLowerCase();
    const style =
      STYLES.find(
        (s) =>
          s.tag === tag &&
          (s.cls ? block.classList.contains(s.cls) : !block.classList.contains('d-subtitle')),
      )?.name ?? 'Normal';
    const bcs = getComputedStyle(block);
    const ta = bcs.textAlign;
    const align: Align =
      ta === 'center'
        ? 'center'
        : ta === 'right' || ta === 'end'
          ? 'right'
          : ta === 'justify'
            ? 'justify'
            : 'left';
    const list = a.closest('ol') ? 'ol' : a.closest('ul') ? 'ul' : null;
    const fam = (cs.fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim();
    const pt = Math.round(Number.parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    const r = this.range();
    return {
      bold: q('bold'),
      italic: q('italic'),
      underline: q('underline'),
      strike: q('strikeThrough'),
      sub: q('subscript'),
      sup: q('superscript'),
      align,
      list,
      style,
      font: fam,
      size: String(pt),
      inTable: Boolean(a.closest('table')),
      image: this.selectedImage,
      collapsed: r?.collapsed ?? true,
    };
  }
}
