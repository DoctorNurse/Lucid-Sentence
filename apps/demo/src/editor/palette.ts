/** "Tell me" command palette (Alt+Q, Ctrl+K outside the document) over the registry. */
import { allCommands, type CommandRef } from '@lucid-sentence/commands';
import { displayShortcut, iconFor, svgIcon } from '@lucid-sentence/ribbon-ui';
import { el } from './ui.js';

export interface PaletteOptions {
  isWired: (id: string) => boolean;
  run: (id: string) => void;
}

/** Rank registry commands for a query (label first, then group/tab words). */
export function rank(query: string, refs: readonly CommandRef[]): CommandRef[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored: { r: CommandRef; s: number }[] = [];
  for (const r of refs) {
    const label = r.command.label.toLowerCase();
    const hay = `${label} ${r.group.label} ${r.tab.label} ${r.command.id}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    let s = 0;
    if (label === query.toLowerCase()) s += 100;
    if (label.startsWith(terms[0]!)) s += 40;
    if (terms.every((t) => label.includes(t))) s += 20;
    if (r.command.stub) s -= 30;
    if (r.tab.kind === 'contextual') s -= 5;
    scored.push({ r, s });
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.r);
}

export class Palette {
  readonly root: HTMLDialogElement;
  #input: HTMLInputElement;
  #list: HTMLElement;
  #results: CommandRef[] = [];
  #i = 0;
  readonly refs = allCommands();

  constructor(readonly opts: PaletteOptions) {
    this.root = el('dialog', { class: 'palette', 'aria-label': 'Search commands' });
    this.#input = el('input', {
      type: 'search',
      class: 'palette__input',
      placeholder: 'Tell me what you want to do',
      'aria-label': 'Search commands',
      role: 'combobox',
      'aria-expanded': 'true',
      'aria-controls': 'palette-list',
      'aria-autocomplete': 'list',
    });
    this.#list = el('div', {
      class: 'palette__list',
      id: 'palette-list',
      role: 'listbox',
      'aria-label': 'Commands',
    });
    const hint = el(
      'div',
      { class: 'palette__hint' },
      `${this.refs.length} commands · ↑↓ to move · Enter to run · Esc to close`,
    );
    this.root.append(this.#input, this.#list, hint);
    document.body.append(this.root);
    this.#input.addEventListener('input', () => {
      this.#update();
    });
    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = this.#results.length;
        if (n) this.#i = (this.#i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        this.#paint();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = this.#results[this.#i];
        if (r) this.#run(r.command.id);
      }
    });
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  open(): void {
    if (this.root.open) {
      this.#input.select();
      return;
    }
    this.#input.value = '';
    this.root.showModal();
    this.#update();
    this.#input.focus();
  }

  close(): void {
    this.root.close();
  }

  #run(id: string): void {
    this.close();
    this.opts.run(id);
  }

  #update(): void {
    const q = this.#input.value.trim();
    this.#results = q
      ? rank(q, this.refs).slice(0, 12)
      : this.refs
          .filter((r) => this.opts.isWired(r.command.id) && r.tab.kind === 'standard')
          .slice(0, 8);
    this.#i = 0;
    this.#paint();
  }

  #paint(): void {
    this.#list.replaceChildren();
    if (this.#results.length === 0) {
      this.#list.append(el('div', { class: 'palette__empty' }, 'No matching commands'));
      return;
    }
    this.#results.forEach((r, i) => {
      const node = iconFor(r.command.id);
      const wired = this.opts.isWired(r.command.id);
      const item = el(
        'div',
        {
          class: 'palette__item',
          role: 'option',
          id: `pal-${i}`,
          'aria-selected': String(i === this.#i),
          'data-command': r.command.id,
        },
        node
          ? svgIcon(document, node, 18, 'palette__icon')
          : el('span', { class: 'palette__icon' }),
        el('span', { class: 'palette__label' }, r.command.label),
        el('span', { class: 'palette__where' }, `${r.tab.label} › ${r.group.label}`),
        r.command.stub
          ? el('span', { class: 'palette__badge' }, 'Not in Lucid')
          : !wired
            ? el('span', { class: 'palette__badge' }, 'With the engine')
            : null,
        r.command.shortcut
          ? el('kbd', { class: 'palette__kbd' }, displayShortcut(r.command.shortcut))
          : null,
      );
      item.addEventListener('pointerdown', (e) => {
        e.preventDefault();
      });
      item.addEventListener('click', () => {
        this.#run(r.command.id);
      });
      this.#list.append(item);
    });
    this.#input.setAttribute('aria-activedescendant', `pal-${this.#i}`);
    this.#list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
}
