import type { Command, Group, Registry, Tab, TabId } from '@lucid-sentence/commands';
import { glyph } from './icons.js';
import { inlinePrioritiesForTablet, type Layout } from './layout.js';

export interface PhoneState {
  /** Tab picker list is open. */
  picker: boolean;
  /** Bottom sheet is expanded. */
  sheet: boolean;
  /** Command whose sub-page is pushed inside the sheet. */
  subPage: string | null;
  /** "Find a command" query. */
  query: string;
}

export interface RibbonState {
  layout: Layout;
  width: number;
  activeTab: TabId;
  /** Contextual tabs currently relevant (e.g. cursor is in a table). */
  contextual: readonly TabId[];
  /** Toggle commands that are on. */
  pressed: ReadonlySet<string>;
  phone: PhoneState;
}

type Attrs = Record<string, string | boolean | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  }
  return el;
}

/** Tabs that are visible: all standard tabs plus the active contextual ones. */
export function visibleTabs(reg: Registry, contextual: readonly TabId[]): Tab[] {
  return reg.tabs.filter((t) => t.kind !== 'contextual' || contextual.includes(t.id));
}

function tooltip(c: Command): string {
  const parts = [c.label];
  if (c.shortcut) parts.push(`(${c.shortcut})`);
  if (c.stub) parts.push('— not available in Lucid Sentence');
  return parts.join(' ');
}

function commandButton(
  doc: Document,
  c: Command,
  state: RibbonState,
  size: 'large' | 'medium' | 'small' | 'row',
): HTMLButtonElement {
  const pressed = c.kind === 'toggle' ? String(state.pressed.has(c.id)) : undefined;
  const hasMenu = c.kind === 'menu' || c.kind === 'gallery' || c.kind === 'split';
  const showLabel = size !== 'small';
  return h(
    doc,
    'button',
    {
      type: 'button',
      class: `ls-cmd ls-cmd--${size}`,
      'data-action': 'command',
      'data-command': c.id,
      'data-kind': c.kind,
      title: tooltip(c),
      'aria-label': c.label,
      'aria-pressed': pressed,
      'aria-haspopup': hasMenu ? 'true' : c.kind === 'dialog' ? 'dialog' : undefined,
      'aria-disabled': c.stub ? 'true' : undefined,
      'aria-keyshortcuts': c.shortcut?.replace(/\bCtrl\b/g, 'Control'),
    },
    glyph(doc, c, size === 'large' ? 26 : 18),
    showLabel ? h(doc, 'span', { class: 'ls-cmd__label' }, c.label) : null,
    hasMenu && size !== 'row'
      ? h(doc, 'span', { class: 'ls-cmd__chevron', 'aria-hidden': 'true' }, '▾')
      : null,
  );
}

function tabRow(doc: Document, reg: Registry, state: RibbonState): HTMLElement {
  return h(
    doc,
    'div',
    { class: 'ls-tabs', role: 'tablist', 'aria-label': 'Ribbon tabs' },
    ...visibleTabs(reg, state.contextual).map((t) =>
      h(
        doc,
        'button',
        {
          type: 'button',
          role: 'tab',
          id: `ls-tab-${t.id}`,
          class: `ls-tab ls-tab--${t.kind}`,
          'data-action': 'tab',
          'data-tab': t.id,
          'aria-selected': String(t.id === state.activeTab),
          'aria-controls': 'ls-panel',
          tabindex: t.id === state.activeTab ? '0' : '-1',
        },
        t.label,
      ),
    ),
  );
}

function desktopGroup(doc: Document, g: Group, state: RibbonState): HTMLElement {
  // Large commands stand alone; medium and small commands stack in columns of up to three.
  const body = h(doc, 'div', { class: 'ls-group__body' });
  let stack: HTMLElement | null = null;
  let stackSize: string | null = null;
  for (const c of g.commands) {
    const size = c.placement.desktop.size;
    if (size === 'large') {
      stack = null;
      body.append(commandButton(doc, c, state, 'large'));
      continue;
    }
    if (!stack || stackSize !== size || stack.childElementCount >= 3) {
      stack = h(doc, 'div', { class: `ls-stack ls-stack--${size}` });
      stackSize = size;
      body.append(stack);
    }
    stack.append(commandButton(doc, c, state, size));
  }
  return h(
    doc,
    'section',
    { class: 'ls-group', 'aria-label': g.label, 'data-group': g.id },
    body,
    h(doc, 'div', { class: 'ls-group__label' }, g.label),
  );
}

function tabletGroup(doc: Document, g: Group, state: RibbonState): HTMLElement {
  const inline = inlinePrioritiesForTablet(state.width);
  const shown = g.commands.filter((c) => inline.has(c.placement.tablet.priority));
  const overflow = g.commands.filter((c) => !inline.has(c.placement.tablet.priority));
  const body = h(
    doc,
    'div',
    { class: 'ls-group__body' },
    ...shown.map((c) => commandButton(doc, c, state, 'medium')),
  );
  if (overflow.length > 0) {
    body.append(
      h(
        doc,
        'details',
        { class: 'ls-overflow' },
        h(doc, 'summary', { class: 'ls-overflow__toggle', title: `More ${g.label} commands` }, '⋯'),
        h(
          doc,
          'div',
          { class: 'ls-overflow__menu', role: 'menu' },
          ...overflow.map((c) => commandButton(doc, c, state, 'row')),
        ),
      ),
    );
  }
  return h(
    doc,
    'section',
    { class: 'ls-group', 'aria-label': g.label, 'data-group': g.id },
    body,
    h(doc, 'div', { class: 'ls-group__label' }, g.label),
  );
}

function backstage(doc: Document, tab: Tab, state: RibbonState): HTMLElement {
  return h(
    doc,
    'nav',
    { class: 'ls-backstage', 'aria-label': 'File' },
    ...tab.groups.map((g) =>
      h(
        doc,
        'div',
        { class: 'ls-backstage__section', 'data-group': g.id },
        ...g.commands.map((c) => commandButton(doc, c, state, 'row')),
      ),
    ),
  );
}

function activeTabOf(reg: Registry, state: RibbonState): Tab {
  const tabs = visibleTabs(reg, state.contextual);
  return tabs.find((t) => t.id === state.activeTab) ?? tabs[1] ?? tabs[0]!;
}

function renderWide(doc: Document, reg: Registry, state: RibbonState): HTMLElement {
  const tab = activeTabOf(reg, state);
  const panel = h(doc, 'div', {
    class: 'ls-panel',
    id: 'ls-panel',
    role: 'tabpanel',
    'aria-labelledby': `ls-tab-${tab.id}`,
  });
  if (tab.kind === 'backstage') {
    panel.append(backstage(doc, tab, state));
  } else {
    const groupFn = state.layout === 'tablet' ? tabletGroup : desktopGroup;
    panel.append(...tab.groups.map((g) => groupFn(doc, g, state)));
  }
  return h(
    doc,
    'div',
    { class: 'ls-ribbon', 'data-layout': state.layout },
    tabRow(doc, reg, state),
    panel,
  );
}

function sheetBody(doc: Document, reg: Registry, tab: Tab, state: RibbonState): HTMLElement {
  const { phone } = state;
  if (phone.subPage) {
    const all = reg.tabs.flatMap((t) => t.groups.flatMap((g) => g.commands));
    const c = all.find((x) => x.id === phone.subPage);
    return h(
      doc,
      'div',
      { class: 'ls-subpage' },
      h(
        doc,
        'div',
        { class: 'ls-subpage__header' },
        h(doc, 'button', { type: 'button', class: 'ls-back', 'data-action': 'back' }, '‹ Back'),
        h(doc, 'h2', { class: 'ls-subpage__title' }, c?.label ?? ''),
      ),
      h(
        doc,
        'p',
        { class: 'ls-subpage__note' },
        `The ${c?.kind ?? 'command'} for “${c?.label ?? ''}” opens here, with the same fields as desktop. Engine wiring lands in M1.`,
      ),
    );
  }

  const search = h(doc, 'input', {
    type: 'search',
    class: 'ls-search',
    placeholder: 'Find a command',
    'aria-label': 'Find a command',
    'data-action': 'search',
    value: phone.query,
  });

  if (phone.query.trim()) {
    const terms = phone.query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = reg.tabs.flatMap((t) =>
      t.groups.flatMap((g) =>
        g.commands
          .filter((c) =>
            terms.every((term) => `${c.label} ${g.label} ${t.label}`.toLowerCase().includes(term)),
          )
          .map((c) => ({ t, c })),
      ),
    );
    return h(
      doc,
      'div',
      { class: 'ls-sheet__content' },
      search,
      h(
        doc,
        'div',
        { class: 'ls-results', role: 'list' },
        ...results.slice(0, 40).map(({ t, c }) => {
          const b = commandButton(doc, c, state, 'row');
          b.append(h(doc, 'span', { class: 'ls-cmd__where' }, t.label));
          return b;
        }),
      ),
    );
  }

  return h(
    doc,
    'div',
    { class: 'ls-sheet__content' },
    search,
    ...tab.groups.map((g) =>
      h(
        doc,
        'section',
        { class: 'ls-sheet__group', 'aria-label': g.label, 'data-group': g.id },
        h(doc, 'h3', { class: 'ls-sheet__group-label' }, g.label),
        h(
          doc,
          'div',
          { class: 'ls-sheet__cmds' },
          ...g.commands.map((c) => commandButton(doc, c, state, 'row')),
        ),
      ),
    ),
  );
}

function renderPhone(doc: Document, reg: Registry, state: RibbonState): HTMLElement {
  const tab = activeTabOf(reg, state);
  const { phone } = state;
  const strip = tab.groups.flatMap((g) => g.commands).filter((c) => c.placement.phone.strip);

  const bar = h(
    doc,
    'div',
    { class: 'ls-phonebar' },
    h(
      doc,
      'button',
      {
        type: 'button',
        class: 'ls-picker-btn',
        'data-action': 'picker',
        'aria-haspopup': 'listbox',
        'aria-expanded': String(phone.picker),
      },
      `${tab.label} ▾`,
    ),
    h(
      doc,
      'div',
      { class: 'ls-strip', role: 'toolbar', 'aria-label': `${tab.label} quick commands` },
      ...strip.map((c) => commandButton(doc, c, state, 'small')),
    ),
    h(
      doc,
      'button',
      {
        type: 'button',
        class: 'ls-sheet-toggle',
        'data-action': 'sheet',
        'aria-expanded': String(phone.sheet),
        'aria-label': phone.sheet ? 'Collapse commands' : 'Show all commands',
      },
      phone.sheet ? '▾' : '▴',
    ),
  );

  const picker = phone.picker
    ? h(
        doc,
        'div',
        { class: 'ls-picker', role: 'listbox', 'aria-label': 'Tabs' },
        ...visibleTabs(reg, state.contextual).map((t) =>
          h(
            doc,
            'button',
            {
              type: 'button',
              role: 'option',
              class: `ls-picker__item ls-tab--${t.kind}`,
              'data-action': 'tab',
              'data-tab': t.id,
              'aria-selected': String(t.id === tab.id),
            },
            t.label,
          ),
        ),
      )
    : null;

  const sheet = phone.sheet
    ? h(
        doc,
        'div',
        {
          class: `ls-sheet${tab.kind === 'backstage' ? ' ls-sheet--full' : ''}`,
          role: 'dialog',
          'aria-label': `${tab.label} commands`,
        },
        sheetBody(doc, reg, tab, state),
      )
    : null;

  return h(doc, 'div', { class: 'ls-ribbon', 'data-layout': 'phone' }, picker, sheet, bar);
}

/** Render the ribbon for the current state. Pure: returns a fresh element tree. */
export function renderRibbon(doc: Document, reg: Registry, state: RibbonState): HTMLElement {
  return state.layout === 'phone' ? renderPhone(doc, reg, state) : renderWide(doc, reg, state);
}
