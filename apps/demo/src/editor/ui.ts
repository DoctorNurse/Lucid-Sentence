/**
 * Small token-styled UI kit for the demo: popovers, menus, galleries, color
 * pickers, the table grid picker, and toasts. Styles live in demo.css (.pop*).
 */
import { svgIcon, type AnchorRect, type IconNode } from '@lucid-sentence/ribbon-ui';

export function icon(node: IconNode, px = 18, cls = 'i'): SVGSVGElement {
  return svgIcon(document, node, px, cls);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | undefined> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== undefined) e.append(c);
  return e;
}

interface OpenPopover {
  root: HTMLElement;
  close: () => void;
}

let current: OpenPopover | null = null;

export function closePopover(): void {
  current?.close();
}

export function popoverOpen(): boolean {
  return current !== null;
}

export interface PopoverOptions {
  label: string;
  /** Focus the first focusable element (keyboard invocation, or forms). */
  focus?: boolean;
  onClose?: () => void;
  role?: 'dialog' | 'menu';
  wide?: boolean;
}

function rectOf(anchor: AnchorRect | HTMLElement | undefined): AnchorRect {
  if (!anchor) {
    return { x: window.innerWidth / 2 - 140, y: 120, width: 280, height: 0 };
  }
  if (anchor instanceof HTMLElement) {
    const r = anchor.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }
  return anchor;
}

/** Open a popover anchored under a rect (or centered). Phones get a bottom sheet. */
export function openPopover(
  anchor: AnchorRect | HTMLElement | undefined,
  content: HTMLElement,
  opts: PopoverOptions,
): HTMLElement {
  closePopover();
  const root = el('div', {
    class: `pop${opts.wide ? ' pop--wide' : ''}`,
    role: opts.role ?? 'dialog',
    'aria-label': opts.label,
  });
  root.append(content);
  document.body.append(root);
  const phone = window.innerWidth < 700;
  if (phone) {
    root.classList.add('pop--sheet');
  } else {
    const r = rectOf(anchor);
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    let top = r.y + r.height + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.y - h - 6);
    const left = Math.max(8, Math.min(r.x, window.innerWidth - w - 8));
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [
        ...root.querySelectorAll<HTMLElement>(
          '[role=menuitem],[role=menuitemradio],[role=option],.pop__swatch,.pop__cell',
        ),
      ];
      if (items.length === 0 || (e.target as HTMLElement).tagName === 'INPUT') return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const n = e.key === 'ArrowDown' ? i + 1 : i - 1;
      items[(n + items.length) % items.length]?.focus();
    }
  };
  const onDown = (e: PointerEvent): void => {
    if (!root.contains(e.target as Node)) close();
  };
  function close(): void {
    if (current?.root !== root) return;
    current = null;
    root.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    opts.onClose?.();
    window.dispatchEvent(new Event('ls-popover-change'));
  }
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
  }, 0);
  current = { root, close };
  window.dispatchEvent(new Event('ls-popover-change'));
  if (opts.focus) {
    root
      .querySelector<HTMLElement>(
        'input, [role=menuitem], [role=menuitemradio], button, [tabindex]',
      )
      ?.focus();
  }
  return root;
}

/** Buttons inside popovers keep the editor's selection (no focus steal on press). */
function keepSelection(b: HTMLElement): void {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
  });
}

export type MenuEntry =
  | {
      label: string;
      detail?: string | undefined;
      icon?: IconNode | undefined;
      checked?: boolean | undefined;
      shortcut?: string | undefined;
      disabled?: boolean | undefined;
      preview?: string | undefined;
      run: () => void;
    }
  | { heading: string }
  | 'sep';

export function menu(entries: MenuEntry[]): HTMLElement {
  const list = el('div', { class: 'pop__menu' });
  for (const e of entries) {
    if (e === 'sep') {
      list.append(el('hr', { class: 'pop__sep' }));
      continue;
    }
    if ('heading' in e) {
      list.append(el('div', { class: 'pop__heading' }, e.heading));
      continue;
    }
    const b = el(
      'button',
      {
        type: 'button',
        class: 'pop__item',
        role: e.checked === undefined ? 'menuitem' : 'menuitemradio',
        'aria-checked': e.checked === undefined ? undefined : String(e.checked),
        'aria-disabled': e.disabled ? 'true' : undefined,
      },
      e.icon ? icon(e.icon, 18) : el('span', { class: 'pop__noicon' }),
      el(
        'span',
        { class: 'pop__text' },
        el('span', { class: 'pop__label', style: e.preview }, e.label),
        e.detail ? el('span', { class: 'pop__detail' }, e.detail) : null,
      ),
      e.shortcut ? el('kbd', { class: 'pop__kbd' }, e.shortcut) : null,
    );
    keepSelection(b);
    b.addEventListener('click', () => {
      if (e.disabled) return;
      closePopover();
      e.run();
    });
    list.append(b);
  }
  return list;
}

export interface GalleryItem {
  label: string;
  preview: HTMLElement;
  selected?: boolean;
  run: () => void;
}

export function gallery(items: GalleryItem[], columns = 3): HTMLElement {
  const g = el('div', { class: 'pop__gallery', role: 'listbox', style: `--cols:${columns}` });
  for (const it of items) {
    const b = el(
      'button',
      {
        type: 'button',
        class: 'pop__tile',
        role: 'option',
        'aria-selected': String(Boolean(it.selected)),
        'aria-label': it.label,
      },
      it.preview,
      el('span', { class: 'pop__tile-label' }, it.label),
    );
    keepSelection(b);
    b.addEventListener('click', () => {
      closePopover();
      it.run();
    });
    g.append(b);
  }
  return g;
}

/** Word-like palette: theme tints plus standard colors. */
export const PALETTE = [
  '#000000',
  '#404040',
  '#7f7f7f',
  '#bfbfbf',
  '#ffffff',
  '#0f4761',
  '#156082',
  '#0a6a7c',
  '#45c3d6',
  '#d6ebee',
  '#c00000',
  '#e97132',
  '#ffc000',
  '#196b24',
  '#7030a0',
];
export const HIGHLIGHTS = ['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ffc000', '#d9d9d9'];

export function colorPicker(
  colors: string[],
  onPick: (color: string | null) => void,
  noneLabel: string,
): HTMLElement {
  const wrap = el('div', { class: 'pop__colors' });
  const none = el('button', { type: 'button', class: 'pop__item pop__none' }, noneLabel);
  keepSelection(none);
  none.addEventListener('click', () => {
    closePopover();
    onPick(null);
  });
  const grid = el('div', { class: 'pop__swatches', role: 'listbox', 'aria-label': 'Colors' });
  for (const c of colors) {
    const b = el('button', {
      type: 'button',
      class: 'pop__swatch',
      role: 'option',
      'aria-label': c,
      title: c,
      style: `--sw:${c}`,
    });
    keepSelection(b);
    b.addEventListener('click', () => {
      closePopover();
      onPick(c);
    });
    grid.append(b);
  }
  const custom = el('label', { class: 'pop__custom' }, 'More colors…');
  const input = el('input', { type: 'color', 'aria-label': 'Custom color' });
  input.addEventListener('change', () => {
    closePopover();
    onPick(input.value);
  });
  custom.append(input);
  wrap.append(none, grid, custom);
  return wrap;
}

/** Hover-to-size table picker (Insert → Table). */
export function tableGrid(onPick: (rows: number, cols: number) => void): HTMLElement {
  const R = 8;
  const C = 10;
  const label = el('div', { class: 'pop__heading', 'aria-live': 'polite' }, 'Insert Table');
  const grid = el('div', { class: 'pop__grid', style: `--cols:${C}` });
  const cells: HTMLElement[] = [];
  const mark = (r: number, c: number): void => {
    cells.forEach((cell, i) => {
      cell.classList.toggle('on', Math.floor(i / C) < r && i % C < c);
    });
    label.textContent = `${c} × ${r} table`;
  };
  for (let r = 1; r <= R; r++) {
    for (let c = 1; c <= C; c++) {
      const b = el('button', {
        type: 'button',
        class: 'pop__cell',
        'aria-label': `${c} by ${r} table`,
      });
      keepSelection(b);
      b.addEventListener('pointerenter', () => {
        mark(r, c);
      });
      b.addEventListener('focus', () => {
        mark(r, c);
      });
      b.addEventListener('click', () => {
        closePopover();
        onPick(r, c);
      });
      cells.push(b);
      grid.append(b);
    }
  }
  return el('div', { class: 'pop__table' }, label, grid);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Keep a toast clear of the splash promo card (it rests in the bottom-right corner after
 * loading): center the toast in the free space to the card's left, or lift it above.
 */
function avoidPromo(t: HTMLElement): void {
  t.style.removeProperty('left');
  t.style.removeProperty('bottom');
  t.style.removeProperty('max-width');
  const card = document
    .querySelector('ls-splash')
    ?.shadowRoot?.querySelector<HTMLElement>('.promo')
    ?.getBoundingClientRect();
  if (!card || card.width === 0) return;
  const r = t.getBoundingClientRect();
  const overlaps =
    r.left < card.right && r.right > card.left && r.top < card.bottom && r.bottom > card.top;
  if (!overlaps) return;
  const free = card.left - 24;
  if (free >= 280) {
    t.style.left = `${12 + free / 2}px`;
    t.style.maxWidth = `${free}px`;
  } else {
    t.style.bottom = `${window.innerHeight - card.top + 12}px`;
  }
}

export function toast(message: string, ms = 2600): void {
  const t = document.querySelector<HTMLElement>('#toast');
  if (!t) return;
  t.textContent = message;
  t.hidden = false;
  t.classList.remove('toast--out');
  avoidPromo(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.add('toast--out');
    setTimeout(() => {
      t.hidden = true;
    }, 200);
  }, ms);
}

/**
 * A polite, persistent update notice: a message, one action, and "Later".
 * Shows at most one at a time; the action button reports failures in a toast.
 */
export function updatePrompt(
  message: string,
  actionLabel: string,
  action: () => void | Promise<void>,
): HTMLElement {
  document.querySelector('.update-bar')?.remove();
  const later = el('button', { type: 'button', class: 'btn btn--chip' }, 'Later');
  const go = el('button', { type: 'button', class: 'btn btn--primary' }, actionLabel);
  const bar = el(
    'div',
    { class: 'update-bar', role: 'status', 'aria-live': 'polite' },
    el('span', { class: 'update-bar__text' }, message),
    el('span', { class: 'update-bar__actions' }, later, go),
  );
  later.addEventListener('click', () => {
    bar.remove();
  });
  go.addEventListener('click', () => {
    go.disabled = true;
    Promise.resolve(action())
      .then(() => {
        bar.remove();
      })
      .catch(() => {
        go.disabled = false;
        toast('The update didn’t finish. Try again later.');
      });
  });
  document.body.append(bar);
  return bar;
}

/** A small form popover (label + input + primary button). */
export function form(
  fields: { name: string; label: string; value?: string; type?: string; placeholder?: string }[],
  submitLabel: string,
  onSubmit: (values: Record<string, string>) => void,
): HTMLFormElement {
  const f = el('form', { class: 'pop__form' });
  for (const fd of fields) {
    const input = el('input', {
      name: fd.name,
      type: fd.type ?? 'text',
      value: fd.value ?? '',
      placeholder: fd.placeholder,
      class: 'pop__input',
    });
    if (fd.value) input.value = fd.value;
    f.append(el('label', { class: 'pop__field' }, el('span', {}, fd.label), input));
  }
  f.append(
    el(
      'div',
      { class: 'pop__actions' },
      el('button', { type: 'submit', class: 'btn btn--primary' }, submitLabel),
    ),
  );
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const values: Record<string, string> = {};
    for (const [k, v] of new FormData(f).entries()) values[k] = typeof v === 'string' ? v : v.name;
    closePopover();
    onSubmit(values);
  });
  return f;
}
