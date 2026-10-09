import { registry as defaultRegistry, type Registry, type TabId } from '@lucid-sentence/commands';
import { resolveLayout, type Layout, type LayoutSetting } from './layout.js';
import { renderRibbon, visibleTabs, type RibbonState } from './render.js';
import { ribbonCss } from './styles.js';
import { themeDeclarations, type ThemeName } from './tokens.js';

export type ThemeSetting = ThemeName | 'auto';

/** Screen-space rectangle of the invoking button (for anchoring popovers). */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CommandEventDetail {
  id: string;
  kind: string;
  layout: Layout;
  /** For toggles: the new state. */
  pressed?: boolean;
  /** Where the invoking button is on screen, when known. */
  anchor?: AnchorRect;
}

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Display a Windows-notation shortcut for this platform (Ctrl → ⌘ on Apple). */
export function displayShortcut(s: string): string {
  if (!IS_MAC) return s;
  return s
    .replace(/\bCtrl\b/g, '⌘')
    .replace(/\bAlt\b/g, '⌥')
    .replace(/\bShift\b/g, '⇧');
}

/**
 * `<ls-ribbon>`: renders the ribbon from the command registry.
 *
 * Attributes:
 * - `layout`: `auto` (default, by width) | `desktop` | `tablet` | `phone`
 * - `theme`: `auto` (default, follows OS) | `light` | `dark` | `high-contrast`
 * - `accent`: optional CSS color overriding the accent
 * - `contextual`: space-separated contextual tab ids to show (e.g. `table-design table-layout`)
 * - `collapsed`: show only the tab row (Ctrl+F1 in the demo); tabs then open the panel temporarily
 *
 * Properties: `pressed` (Set of toggled-on ids), `values` (Map of field values),
 * `wired` (Set of ids the host can run; others show "Coming with the engine").
 *
 * Events (bubble, composed): `ls-command` (CommandEventDetail), `ls-command-pending`
 * ({ id }), `ls-tab-change` ({ tab }), `ls-collapse-change` ({ collapsed }),
 * `ls-sheet-change` ({ open }) when the phone sheet or tab picker opens or closes.
 *
 * Phone sheet: the chevron and the handle toggle it; swiping the handle down, tapping
 * outside the ribbon, Escape, or `closeSheet()` (the host wires the Back gesture) close it.
 *
 * Slots: `backstage` (File page content), `subpage` (phone sub-page content).
 */
export class LucidRibbonElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['layout', 'theme', 'accent', 'contextual', 'collapsed'];
  }

  registry: Registry = defaultRegistry;
  #activeTab: TabId = 'home';
  #pressed: ReadonlySet<string> = new Set<string>();
  #values: ReadonlyMap<string, string> = new Map();
  #wired: ReadonlySet<string> | undefined;
  #phone = { picker: false, sheet: false, subPage: null as string | null, query: '' };
  #width = 1280;
  #peek = false;
  #backstagePage = 'file.rail.info';
  #lastTab: TabId | null = null;
  #lastContextual = new Set<TabId>();
  #resize: ResizeObserver | undefined;
  #media: MediaQueryList | undefined;
  #tipTimer: ReturnType<typeof setTimeout> | undefined;
  /** A press on a sheet toggle (handled on pointerup so a tap never depends on `click`). */
  #press: {
    id: number;
    x: number;
    y: number;
    el: HTMLElement;
    handle: boolean;
    dy: number;
  } | null = null;
  #pressedAt = -Infinity;
  #sheetWasOpen = false;
  readonly #tip: HTMLDivElement;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#tip = document.createElement('div');
    this.#tip.className = 'ls-tip';
    this.#tip.setAttribute('role', 'tooltip');
    this.#tip.id = 'ls-tip';
    this.#tip.hidden = true;
    this.#root.addEventListener('click', (e) => {
      this.#onClick(e);
    });
    this.#root.addEventListener('input', (e) => {
      this.#onInput(e);
    });
    // Keep the document selection: ribbon buttons never take focus on pointer press.
    this.#root.addEventListener('pointerdown', (e) => {
      const t = e.target as Element;
      if (t.closest('button, summary') && !t.closest('input')) e.preventDefault();
      this.#hideTip();
      this.#pressStart(e as PointerEvent);
    });
    this.#root.addEventListener('pointermove', (e) => {
      this.#pressMove(e as PointerEvent);
    });
    this.#root.addEventListener('pointerup', (e) => {
      this.#pressEnd(e as PointerEvent, false);
    });
    this.#root.addEventListener('pointercancel', (e) => {
      this.#pressEnd(e as PointerEvent, true);
    });
    this.#root.addEventListener(
      'toggle',
      (e) => {
        this.#placeOverflow(e.target as HTMLElement);
      },
      true,
    );
    this.#root.addEventListener('keydown', (e) => {
      this.#onKeydown(e as KeyboardEvent);
    });
    this.#root.addEventListener('pointerover', (e) => {
      this.#scheduleTip(e.target as Element, 450);
    });
    this.#root.addEventListener('pointerout', () => {
      this.#hideTip();
    });
    this.#root.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      if (t.matches(':focus-visible')) this.#scheduleTip(t, 0);
    });
    this.#root.addEventListener('focusout', () => {
      this.#hideTip();
    });
  }

  connectedCallback(): void {
    this.#width = this.getBoundingClientRect().width || this.#width;
    if (typeof ResizeObserver !== 'undefined') {
      this.#resize = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w && Math.abs(w - this.#width) >= 1) {
          this.#width = w;
          this.render();
        }
      });
      this.#resize.observe(this);
    }
    if (typeof matchMedia === 'function') {
      this.#media = matchMedia('(prefers-color-scheme: dark)');
      this.#media.addEventListener('change', this.#onScheme);
    }
    document.addEventListener('pointerdown', this.#onOutside, true);
    this.render();
  }

  disconnectedCallback(): void {
    this.#resize?.disconnect();
    this.#media?.removeEventListener('change', this.#onScheme);
    document.removeEventListener('pointerdown', this.#onOutside, true);
  }

  attributeChangedCallback(name: string): void {
    if (name === 'collapsed') this.#peek = false;
    if (this.isConnected) this.render();
  }

  get activeTab(): TabId {
    return this.#activeTab;
  }

  set activeTab(id: TabId) {
    this.#setTab(id);
    this.render();
  }

  /** Toggled-on commands (bold, align, ruler, …). Updates in place, without a re-render. */
  get pressed(): ReadonlySet<string> {
    return this.#pressed;
  }

  set pressed(ids: ReadonlySet<string>) {
    this.#pressed = ids;
    this.#sync();
  }

  /** Field values (font name, size), keyed by command id. Updates in place. */
  set values(v: ReadonlyMap<string, string>) {
    this.#values = v;
    this.#sync();
  }

  get values(): ReadonlyMap<string, string> {
    return this.#values;
  }

  /** Commands the host can run; the rest show "Coming with the engine". */
  set wired(ids: ReadonlySet<string> | undefined) {
    this.#wired = ids;
    if (this.isConnected) this.render();
  }

  get wired(): ReadonlySet<string> | undefined {
    return this.#wired;
  }

  /** Selected File page (`file.*` id). */
  set backstagePage(id: string) {
    this.#backstagePage = id;
    if (this.isConnected) this.render();
  }

  get backstagePage(): string {
    return this.#backstagePage;
  }

  get collapsed(): boolean {
    return this.hasAttribute('collapsed');
  }

  /** Collapse or pin the ribbon (Word: Ctrl+F1). */
  toggleCollapsed(force?: boolean): void {
    const next = force ?? !this.collapsed;
    this.toggleAttribute('collapsed', next);
    this.dispatchEvent(
      new CustomEvent('ls-collapse-change', {
        detail: { collapsed: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** The phone command sheet or tab picker is open. */
  get sheetOpen(): boolean {
    return this.layout === 'phone' && (this.#phone.sheet || this.#phone.picker);
  }

  /** Collapse the phone command sheet and tab picker (Back gesture, tap outside). */
  closeSheet(): void {
    if (!this.#phone.sheet && !this.#phone.picker) return;
    this.#phone.sheet = false;
    this.#phone.picker = false;
    this.#phone.subPage = null;
    this.render();
  }

  #toggleSheet(): void {
    this.#phone.sheet = !this.#phone.sheet;
    this.#phone.picker = false;
    this.#phone.subPage = null;
    this.render();
  }

  #pressStart(e: PointerEvent): void {
    if (!e.isPrimary || e.button > 0) return;
    const t = (e.target as Element).closest<HTMLElement>('button[data-action]');
    if (!t) return;
    const handle = t.classList.contains('ls-handle');
    // Touch and pen taps activate on pointerup (see #pressEnd); mice use click.
    if (!handle && e.pointerType === 'mouse') return;
    this.#press = { id: e.pointerId, x: e.clientX, y: e.clientY, el: t, handle, dy: 0 };
    if (handle) {
      try {
        t.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
    }
  }

  #pressMove(e: PointerEvent): void {
    const p = this.#press;
    if (!p || p.id !== e.pointerId || !p.handle) return;
    p.dy = Math.max(0, e.clientY - p.y);
    const sheet = this.#root.querySelector<HTMLElement>('.ls-sheet');
    if (sheet) {
      sheet.style.animation = 'none';
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${p.dy}px)`;
    }
  }

  /**
   * Touch and pen: a tap runs its action on pointerup, and the click that may follow is
   * ignored. Android WebView sometimes drops that click (the first tap after a swipe or
   * a fling, or after the pressed element re-rendered), which made the sheet's chevron
   * and handle feel dead. Swiping the handle down 48 px or more collapses the sheet.
   */
  #pressEnd(e: PointerEvent, cancelled: boolean): void {
    const p = this.#press;
    if (!p || p.id !== e.pointerId) return;
    this.#press = null;
    const sheet = this.#root.querySelector<HTMLElement>('.ls-sheet');
    if (p.handle && p.dy > 48) {
      this.#pressedAt = performance.now();
      this.closeSheet();
      return;
    }
    if (sheet && p.handle) {
      sheet.style.transition = '';
      sheet.style.transform = '';
    }
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (cancelled || moved > 12 || !p.el.isConnected) return;
    if (p.handle && e.pointerType === 'mouse') return; // the click handles it
    this.#pressedAt = performance.now();
    this.#activate(p.el);
  }

  /** Width used for "auto" layout; normally measured with ResizeObserver. */
  setWidth(width: number): void {
    this.#width = width;
    this.render();
  }

  get layout(): Layout {
    // A touch-only device (iPad, Galaxy Tab, including a trackpad-less split screen) keeps the touch layout.
    const coarse =
      typeof matchMedia === 'function' &&
      matchMedia('(any-pointer: coarse) and (not (any-pointer: fine))').matches;
    return resolveLayout(
      (this.getAttribute('layout') ?? 'auto') as LayoutSetting,
      this.#width,
      coarse,
    );
  }

  get theme(): ThemeName {
    const t = (this.getAttribute('theme') ?? 'auto') as ThemeSetting;
    if (t !== 'auto') return t;
    return this.#media?.matches ? 'dark' : 'light';
  }

  #onScheme = (): void => {
    this.render();
  };

  #onOutside = (e: Event): void => {
    if (e.composedPath().includes(this)) return;
    if (this.#peek) {
      this.#peek = false;
      this.render();
    }
    // Phone: tapping the page (or anything outside the ribbon) collapses the sheet.
    if (this.#phone.sheet || this.#phone.picker) this.closeSheet();
    for (const d of this.#root.querySelectorAll('details[open]')) d.removeAttribute('open');
  };

  #contextual(): TabId[] {
    return (this.getAttribute('contextual') ?? '').split(/\s+/).filter(Boolean) as TabId[];
  }

  #setTab(id: TabId): void {
    if (id === this.#activeTab) return;
    this.#activeTab = id;
    this.dispatchEvent(
      new CustomEvent('ls-tab-change', { detail: { tab: id }, bubbles: true, composed: true }),
    );
  }

  state(): RibbonState {
    const contextual = this.#contextual();
    // Fall back to Home if the active contextual tab is no longer relevant.
    if (!visibleTabs(this.registry, contextual).some((t) => t.id === this.#activeTab)) {
      this.#setTab('home');
    }
    const appearing = new Set(contextual.filter((t) => !this.#lastContextual.has(t)));
    return {
      layout: this.layout,
      width: this.#width,
      activeTab: this.#activeTab,
      contextual,
      pressed: this.#pressed,
      phone: { ...this.#phone },
      values: this.#values,
      wired: this.#wired,
      collapsed: this.collapsed,
      peek: this.#peek,
      backstagePage: this.#backstagePage,
      appearing,
      tabChanged: this.#lastTab !== null && this.#lastTab !== this.#activeTab,
    };
  }

  render(): void {
    const focused = this.#root.activeElement as HTMLElement | null;
    const focusKey = focused ? this.#keyOf(focused) : null;
    const style = document.createElement('style');
    const accent = this.getAttribute('accent') ?? undefined;
    style.textContent = `:host { ${themeDeclarations(this.theme, accent)} } ${ribbonCss}`;
    const s = this.state();
    this.#root.replaceChildren(style, renderRibbon(document, this.registry, s), this.#tip);
    // Tablet: collapse whole groups (rightmost first) until the row fits; no hidden overflow.
    if (s.layout === 'tablet') {
      const groups = this.#root.querySelectorAll('.ls-panel .ls-group').length;
      const fits = (): boolean => {
        const p = this.#root.querySelector<HTMLElement>('.ls-panel');
        return !p || Boolean(p.hidden) || p.clientWidth === 0 || p.scrollWidth <= p.clientWidth + 1;
      };
      for (let n = 1; n <= groups && !fits(); n++) {
        s.collapsedGroups = n;
        this.#root.replaceChildren(style, renderRibbon(document, this.registry, s), this.#tip);
      }
    }
    this.#root
      .querySelector<HTMLElement>('.ls-tab[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.#lastTab = this.#activeTab;
    this.#lastContextual = new Set(s.contextual);
    this.toggleAttribute('data-backstage', this.#activeTab === 'file' && s.layout !== 'phone');
    const open = s.layout === 'phone' && (s.phone.sheet || s.phone.picker);
    if (open !== this.#sheetWasOpen) {
      this.#sheetWasOpen = open;
      this.dispatchEvent(
        new CustomEvent('ls-sheet-change', { detail: { open }, bubbles: true, composed: true }),
      );
    }
    if (focusKey) {
      const el = this.#root.querySelector<HTMLElement>(focusKey);
      el?.focus();
      if (el instanceof HTMLInputElement) el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  #keyOf(el: HTMLElement): string | null {
    if (el.dataset['command']) return `[data-command="${el.dataset['command']}"]`;
    if (el.dataset['tab']) return `[data-tab="${el.dataset['tab']}"]`;
    if (el.dataset['action']) return `[data-action="${el.dataset['action']}"]`;
    return null;
  }

  /** Update toggle and field state on the existing buttons (no re-render, no focus loss). */
  #sync(): void {
    for (const b of this.#root.querySelectorAll<HTMLElement>('[data-command][aria-pressed]')) {
      b.setAttribute('aria-pressed', String(this.#pressed.has(b.dataset['command']!)));
    }
    for (const b of this.#root.querySelectorAll<HTMLElement>('.ls-cmd--field')) {
      const id = b.dataset['command']!;
      const v = this.#values.get(id);
      const label = b.querySelector('.ls-cmd__label');
      if (label && v !== undefined && label.textContent !== v) {
        label.textContent = v;
        b.setAttribute('aria-label', `${b.dataset['tip'] ?? ''}: ${v}`);
      }
    }
  }

  #scheduleTip(target: Element, delay: number): void {
    const el = target.closest<HTMLElement>('[data-tip]');
    clearTimeout(this.#tipTimer);
    if (!el) {
      this.#hideTip();
      return;
    }
    this.#tipTimer = setTimeout(() => {
      this.#showTip(el);
    }, delay);
  }

  #showTip(el: HTMLElement, note?: string): void {
    if (!el.isConnected) return;
    const tip = this.#tip;
    tip.replaceChildren();
    const name = document.createElement('strong');
    name.textContent = el.dataset['tip'] ?? '';
    tip.append(name);
    if (el.dataset['shortcut']) {
      const k = document.createElement('kbd');
      k.textContent = displayShortcut(el.dataset['shortcut']);
      tip.append(k);
    }
    const extra =
      note ??
      (el.dataset['pending']
        ? 'Coming with the engine'
        : el.getAttribute('aria-disabled') === 'true'
          ? 'Not available in Lucid Sentence'
          : undefined);
    if (extra) {
      const p = document.createElement('span');
      p.className = 'ls-tip__note';
      p.textContent = extra;
      tip.append(p);
    }
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const below = this.layout !== 'phone';
    tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 8))}px`;
    tip.style.top = below ? `${r.bottom + 8}px` : `${r.top - tip.offsetHeight - 8}px`;
    el.setAttribute('aria-describedby', 'ls-tip');
  }

  #hideTip(): void {
    clearTimeout(this.#tipTimer);
    this.#tip.hidden = true;
  }

  #onClick(e: Event): void {
    const target = (e.target as Element | null)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    // Already run on pointerup (touch or pen tap).
    if (performance.now() - this.#pressedAt < 700) return;
    this.#activate(target);
  }

  #activate(target: HTMLElement): void {
    const action = target.dataset['action'];
    if (action === 'tab') {
      const id = target.dataset['tab'] as TabId;
      if (this.collapsed && this.layout !== 'phone') {
        this.#peek = !(this.#peek && id === this.#activeTab);
      }
      this.#setTab(id);
      this.#phone.picker = false;
      this.#phone.subPage = null;
      if (this.layout === 'phone') this.#phone.sheet = true;
      this.render();
      this.#root.querySelector<HTMLElement>(`[data-tab="${this.#activeTab}"]`)?.focus();
    } else if (action === 'collapse') {
      this.toggleCollapsed();
    } else if (action === 'back-home') {
      this.#setTab('home');
      this.render();
    } else if (action === 'picker') {
      this.#phone.picker = !this.#phone.picker;
      this.render();
    } else if (action === 'sheet') {
      this.#toggleSheet();
    } else if (action === 'back') {
      this.#phone.subPage = null;
      this.render();
    } else if (action === 'command') {
      this.#invoke(target);
    }
  }

  /** Run a command as if its button were pressed (used by shortcuts and the palette). */
  invoke(id: string): boolean {
    const btn = this.#root.querySelector<HTMLElement>(`[data-command="${id}"]`);
    const cmd = this.registry.tabs
      .flatMap((t) => t.groups.flatMap((g) => g.commands))
      .find((c) => c.id === id);
    if (!cmd) return false;
    if (btn) {
      this.#invoke(btn);
      return true;
    }
    if (cmd.stub) {
      this.#pending(id, true);
      return false;
    }
    if (this.#wired && !this.#wired.has(id)) {
      this.#pending(id);
      return false;
    }
    this.#fire({ id, kind: cmd.kind, layout: this.layout });
    return true;
  }

  #pending(id: string, stub = false): void {
    this.dispatchEvent(
      new CustomEvent('ls-command-pending', {
        detail: { id, stub },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #fire(detail: CommandEventDetail): void {
    this.dispatchEvent(
      new CustomEvent<CommandEventDetail>('ls-command', { detail, bubbles: true, composed: true }),
    );
  }

  #invoke(button: HTMLElement): void {
    const id = button.dataset['command']!;
    if (button.getAttribute('aria-disabled') === 'true') {
      // Not available: say so (a disabled-looking button that does nothing feels broken).
      this.#showTip(button);
      this.#pending(id, true);
      return;
    }
    const kind = button.dataset['kind']!;
    if (button.dataset['pending']) {
      this.#showTip(button);
      this.#pending(id);
      return;
    }
    this.#hideTip();
    const r = button.getBoundingClientRect();
    const detail: CommandEventDetail = { id, kind, layout: this.layout };
    if (r.width > 0) detail.anchor = { x: r.left, y: r.top, width: r.width, height: r.height };
    if (kind === 'toggle') {
      // The host owns toggle state (via `pressed`); the event carries the requested state.
      detail.pressed = !this.#pressed.has(id);
      if (this.#wired === undefined) {
        const next = new Set(this.#pressed);
        if (detail.pressed) next.add(id);
        else next.delete(id);
        this.#pressed = next;
      }
    }
    if (this.layout === 'phone' && kind !== 'toggle' && kind !== 'button') {
      this.#phone.sheet = true;
      this.#phone.subPage = id;
    }
    if (id.startsWith('file.')) this.#backstagePage = id;
    if (this.#peek && !id.startsWith('file.')) this.#peek = false;
    for (const d of this.#root.querySelectorAll('details[open]')) d.removeAttribute('open');
    this.render();
    this.#fire(detail);
  }

  #placeOverflow(details: HTMLElement): void {
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    for (const other of this.#root.querySelectorAll('details[open]')) {
      if (other !== details) other.removeAttribute('open');
    }
    const menu = details.querySelector<HTMLElement>('.ls-overflow__menu');
    const rect = details.getBoundingClientRect();
    if (!menu) return;
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 248))}px`;
  }

  #onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.dataset['action'] === 'search') {
      this.#phone.query = t.value;
      this.render();
    }
  }

  /** Arrow keys move between tabs (WAI-ARIA tabs pattern); Esc closes peeks and menus. */
  #onKeydown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') {
      const open = this.#root.querySelector('details[open]');
      if (open) {
        open.removeAttribute('open');
        open.querySelector<HTMLElement>('summary')?.focus();
      } else if (this.#peek) {
        this.#peek = false;
        this.render();
      } else if (this.#activeTab === 'file') {
        this.#setTab('home');
        this.render();
      } else if (this.#phone.sheet || this.#phone.picker) {
        this.closeSheet();
      }
      this.#hideTip();
      return;
    }
    if (t.getAttribute('role') !== 'tab' || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) {
      return;
    }
    const rtl = getComputedStyle(this).direction === 'rtl';
    const forward = (e.key === 'ArrowRight') !== rtl;
    const tabs = visibleTabs(this.registry, this.#contextual());
    const i = tabs.findIndex((x) => x.id === this.#activeTab);
    const next = tabs[(i + (forward ? 1 : tabs.length - 1)) % tabs.length];
    if (next) {
      e.preventDefault();
      this.#setTab(next.id);
      this.render();
      this.#root.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
    }
  }
}

/** Register `<ls-ribbon>` (idempotent). */
export function defineRibbon(tag = 'ls-ribbon'): void {
  if (!customElements.get(tag)) customElements.define(tag, LucidRibbonElement);
}
