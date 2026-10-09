import type { Command, Group, Registry, Tab, TabId } from '@lucid-sentence/commands';
import { glyph, svgIcon } from './icons.js';
import { inlinePrioritiesForTablet, type Layout } from './layout.js';
import { ArrowLeft, ChevronDown, Ellipsis, PanelTopClose, Pin } from './ui-icons.js';

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
  /** Current values for field commands (font name, size), keyed by command id. */
  values?: ReadonlyMap<string, string>;
  /**
   * Commands the host can run. When set, any other non-stub command shows a
   * "Coming with the engine" state instead of firing. When undefined, all commands are live.
   */
  wired?: ReadonlySet<string> | undefined;
  /** Ribbon collapsed to the tab row (Ctrl+F1); `peek` shows the panel temporarily. */
  collapsed?: boolean;
  peek?: boolean;
  /** Selected File (backstage) page, a `file.*` command id. */
  backstagePage?: string;
  /** Contextual tabs that just appeared (animated in). */
  appearing?: ReadonlySet<TabId>;
  /** The active tab changed since the last render (panel animates in). */
  tabChanged?: boolean;
  /**
   * Tablet: how many groups, counted from the end, collapse to a single button so the
   * row fits the width (Word collapses the rightmost groups first). Set by the element.
   */
  collapsedGroups?: number;
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

/** True when the command is neither a stub nor live in the host. */
export function isPending(c: Command, state: Pick<RibbonState, 'wired'>): boolean {
  return !c.stub && state.wired !== undefined && !state.wired.has(c.id);
}

/** Plain-text tooltip (also used for aria-description). */
export function tooltip(c: Command, pending = false): string {
  const parts = [c.label];
  if (c.shortcut) parts.push(`(${c.shortcut})`);
  if (c.stub) parts.push('— not available in Lucid Sentence');
  else if (pending) parts.push('— coming with the engine');
  return parts.join(' ');
}

const FIELD_WIDTH: Record<string, string> = { 'home.font.font': '144px', 'home.font.size': '64px' };

function commandButton(
  doc: Document,
  c: Command,
  state: RibbonState,
  size: 'large' | 'medium' | 'small' | 'row',
): HTMLButtonElement {
  const pressed = c.kind === 'toggle' ? String(state.pressed.has(c.id)) : undefined;
  const hasMenu = c.kind === 'menu' || c.kind === 'gallery' || c.kind === 'split';
  const pending = isPending(c, state);
  const icon = glyph(doc, c, size === 'large' ? 24 : 18);
  const field = c.kind === 'input' && !icon && size !== 'row';
  const showLabel = size !== 'small' || !icon;
  const cls = [
    'ls-cmd',
    `ls-cmd--${field ? 'field' : size}`,
    pending ? 'ls-cmd--pending' : '',
    icon ? '' : 'ls-cmd--text',
  ]
    .filter(Boolean)
    .join(' ');
  const value = state.values?.get(c.id);
  const btn = h(
    doc,
    'button',
    {
      type: 'button',
      class: cls,
      'data-action': 'command',
      'data-command': c.id,
      'data-kind': c.kind,
      'data-tip': c.label,
      'data-shortcut': c.shortcut,
      'data-pending': pending ? 'true' : undefined,
      'aria-label': field && value ? `${c.label}: ${value}` : c.label,
      'aria-description': pending
        ? 'Coming with the engine'
        : c.stub
          ? 'Not available in Lucid Sentence'
          : undefined,
      'aria-pressed': pressed,
      'aria-haspopup': hasMenu || field ? 'true' : c.kind === 'dialog' ? 'dialog' : undefined,
      'aria-disabled': c.stub ? 'true' : undefined,
      'aria-keyshortcuts': c.shortcut?.replace(/\bCtrl\b/g, 'Control'),
    },
    icon,
    showLabel
      ? h(doc, 'span', { class: 'ls-cmd__label' }, field ? (value ?? c.label) : c.label)
      : null,
    (hasMenu || field) && size !== 'row'
      ? h(doc, 'span', { class: 'ls-cmd__chevron' }, svgIcon(doc, ChevronDown, 12, 'ls-chev'))
      : null,
  );
  if (field) btn.style.width = FIELD_WIDTH[c.id] ?? '120px';
  return btn;
}

function tabRow(doc: Document, reg: Registry, state: RibbonState): HTMLElement {
  const row = h(
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
          class: `ls-tab ls-tab--${t.kind}${state.appearing?.has(t.id) ? ' ls-tab--appear' : ''}`,
          'data-action': 'tab',
          'data-tab': t.id,
          'aria-selected': String(t.id === state.activeTab),
          'aria-controls': 'ls-panel',
          'aria-expanded':
            state.collapsed && t.id === state.activeTab ? String(Boolean(state.peek)) : undefined,
          tabindex: t.id === state.activeTab ? '0' : '-1',
          title: t.context ? `${t.label}: ${t.context}` : undefined,
        },
        t.label,
      ),
    ),
  );
  const collapse = h(
    doc,
    'button',
    {
      type: 'button',
      class: 'ls-pin',
      'data-action': 'collapse',
      'data-tip': state.collapsed ? 'Pin the ribbon' : 'Collapse the ribbon',
      'data-shortcut': 'Ctrl+F1',
      'aria-label': state.collapsed ? 'Pin the ribbon' : 'Collapse the ribbon',
      'aria-pressed': String(!state.collapsed),
      'aria-keyshortcuts': 'Control+F1',
    },
    svgIcon(doc, state.collapsed ? Pin : PanelTopClose, 16),
  );
  return h(doc, 'div', { class: 'ls-tabbar' }, row, collapse);
}

function groupSection(doc: Document, g: Group, body: HTMLElement): HTMLElement {
  return h(
    doc,
    'section',
    { class: 'ls-group', role: 'toolbar', 'aria-label': g.label, 'data-group': g.id },
    body,
    h(doc, 'div', { class: 'ls-group__label', 'aria-hidden': 'true' }, g.label),
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
    const max = 3;
    if (!stack || stackSize !== size || stack.childElementCount >= max) {
      stack = h(doc, 'div', { class: `ls-stack ls-stack--${size}` });
      stackSize = size;
      body.append(stack);
    }
    stack.append(commandButton(doc, c, state, size));
  }
  return groupSection(doc, g, body);
}

function tabletGroup(doc: Document, g: Group, state: RibbonState, collapsed = false): HTMLElement {
  if (collapsed) return collapsedGroup(doc, g, state);
  const inline = inlinePrioritiesForTablet(state.width);
  const shown = g.commands.filter((c) => inline.has(c.placement.tablet.priority));
  const overflow = g.commands.filter((c) => !inline.has(c.placement.tablet.priority));
  const body = h(
    doc,
    'div',
    { class: 'ls-group__body' },
    ...shown.map((c) => commandButton(doc, c, state, c.kind === 'input' ? 'medium' : 'small')),
  );
  if (overflow.length > 0) {
    body.append(
      h(
        doc,
        'details',
        { class: 'ls-overflow' },
        h(
          doc,
          'summary',
          {
            class: 'ls-overflow__toggle',
            'data-tip': `More ${g.label} commands`,
            'aria-label': `More ${g.label} commands`,
          },
          svgIcon(doc, Ellipsis, 18),
        ),
        h(
          doc,
          'div',
          { class: 'ls-overflow__menu', role: 'menu', 'aria-label': `${g.label} commands` },
          ...overflow.map((c) => commandButton(doc, c, state, 'row')),
        ),
      ),
    );
  }
  return groupSection(doc, g, body);
}

/** A whole group as one button with all its commands in a menu (narrow tablets). */
function collapsedGroup(doc: Document, g: Group, state: RibbonState): HTMLElement {
  const first = g.commands.find((c) => glyph(doc, c, 18));
  const body = h(
    doc,
    'div',
    { class: 'ls-group__body' },
    h(
      doc,
      'details',
      { class: 'ls-overflow ls-overflow--group' },
      h(
        doc,
        'summary',
        {
          class: 'ls-overflow__toggle ls-overflow__toggle--group',
          'data-tip': `${g.label} commands`,
          'aria-label': `${g.label} commands`,
        },
        first ? glyph(doc, first, 18) : svgIcon(doc, Ellipsis, 18),
        svgIcon(doc, ChevronDown, 12, 'ls-chev'),
      ),
      h(
        doc,
        'div',
        { class: 'ls-overflow__menu', role: 'menu', 'aria-label': `${g.label} commands` },
        ...g.commands.map((c) => commandButton(doc, c, state, 'row')),
      ),
    ),
  );
  const section = groupSection(doc, g, body);
  section.classList.add('ls-group--collapsed');
  return section;
}

function backstage(doc: Document, tab: Tab, state: RibbonState): HTMLElement {
  const current = state.backstagePage ?? 'file.rail.info';
  const rail = h(
    doc,
    'nav',
    { class: 'ls-backstage__rail', 'aria-label': 'File' },
    h(
      doc,
      'button',
      {
        type: 'button',
        class: 'ls-backstage__back',
        'data-action': 'back-home',
        'aria-label': 'Back to document (Esc)',
      },
      svgIcon(doc, ArrowLeft, 18),
      h(doc, 'span', {}, 'Back'),
    ),
    ...tab.groups.map((g) =>
      h(
        doc,
        'div',
        { class: 'ls-backstage__section', 'data-group': g.id },
        ...g.commands.map((c) => {
          const b = commandButton(doc, c, state, 'row');
          if (c.id === current) b.setAttribute('aria-current', 'page');
          return b;
        }),
      ),
    ),
  );
  return h(
    doc,
    'div',
    { class: 'ls-backstage' },
    rail,
    h(doc, 'div', { class: 'ls-backstage__pane' }, h(doc, 'slot', { name: 'backstage' })),
  );
}

function activeTabOf(reg: Registry, state: RibbonState): Tab {
  const tabs = visibleTabs(reg, state.contextual);
  return tabs.find((t) => t.id === state.activeTab) ?? tabs[1] ?? tabs[0]!;
}

function renderWide(doc: Document, reg: Registry, state: RibbonState): HTMLElement {
  const tab = activeTabOf(reg, state);
  const hidden = state.collapsed && !state.peek && tab.kind !== 'backstage';
  const panel = h(doc, 'div', {
    class: `ls-panel${state.tabChanged ? ' ls-panel--enter' : ''}${state.collapsed && state.peek ? ' ls-panel--peek' : ''}`,
    id: 'ls-panel',
    role: 'tabpanel',
    'aria-labelledby': `ls-tab-${tab.id}`,
    hidden,
  });
  if (tab.kind === 'backstage') {
    panel.classList.add('ls-panel--backstage');
    panel.append(backstage(doc, tab, state));
  } else {
    const n = tab.groups.length;
    const collapsedFrom = n - (state.collapsedGroups ?? 0);
    panel.append(
      ...tab.groups.map((g, i) =>
        state.layout === 'tablet'
          ? tabletGroup(doc, g, state, i >= collapsedFrom)
          : desktopGroup(doc, g, state),
      ),
    );
  }
  return h(
    doc,
    'div',
    {
      class: 'ls-ribbon',
      'data-layout': state.layout,
      'data-collapsed': state.collapsed ? 'true' : undefined,
      'data-tab-kind': tab.kind,
      'data-narrow': state.layout === 'tablet' && state.width < 900 ? 'true' : undefined,
    },
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
        h(
          doc,
          'button',
          { type: 'button', class: 'ls-back', 'data-action': 'back', 'aria-label': 'Back' },
          svgIcon(doc, ArrowLeft, 18),
          'Back',
        ),
        h(doc, 'h2', { class: 'ls-subpage__title' }, c?.label ?? ''),
      ),
      c && isPending(c, state)
        ? h(doc, 'p', { class: 'ls-subpage__note' }, `${c.label} is coming with the engine.`)
        : h(doc, 'slot', { name: 'subpage' }),
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
    tab.kind === 'backstage' ? h(doc, 'slot', { name: 'backstage' }) : null,
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
      h(doc, 'span', {}, tab.label),
      svgIcon(doc, ChevronDown, 14, 'ls-chev'),
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
      svgIcon(doc, ChevronDown, 18, `ls-chev${phone.sheet ? '' : ' ls-chev--up'}`),
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
        h(
          doc,
          'button',
          {
            type: 'button',
            class: 'ls-handle',
            'data-action': 'sheet',
            'aria-label': 'Collapse commands',
          },
          h(doc, 'span', { 'aria-hidden': 'true' }),
        ),
        sheetBody(doc, reg, tab, state),
      )
    : null;

  return h(doc, 'div', { class: 'ls-ribbon', 'data-layout': 'phone' }, picker, sheet, bar);
}

/** Render the ribbon for the current state. Pure: returns a fresh element tree. */
export function renderRibbon(doc: Document, reg: Registry, state: RibbonState): HTMLElement {
  return state.layout === 'phone' ? renderPhone(doc, reg, state) : renderWide(doc, reg, state);
}
