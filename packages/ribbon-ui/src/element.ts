import { registry as defaultRegistry, type Registry, type TabId } from '@lucid-sentence/commands';
import { resolveLayout, type Layout, type LayoutSetting } from './layout.js';
import { renderRibbon, visibleTabs, type RibbonState } from './render.js';
import { ribbonCss } from './styles.js';
import { themeDeclarations, type ThemeName } from './tokens.js';

export type ThemeSetting = ThemeName | 'auto';

export interface CommandEventDetail {
  id: string;
  kind: string;
  layout: Layout;
  /** For toggles: the new state. */
  pressed?: boolean;
}

/**
 * `<ls-ribbon>`: renders the ribbon from the command registry.
 *
 * Attributes:
 * - `layout`: `auto` (default, by width) | `desktop` | `tablet` | `phone`
 * - `theme`: `auto` (default, follows OS) | `light` | `dark` | `high-contrast`
 * - `accent`: optional CSS color overriding the accent
 * - `contextual`: space-separated contextual tab ids to show (e.g. `table-design table-layout`)
 *
 * Events: `ls-command` (CustomEvent<CommandEventDetail>), bubbles and is composed.
 */
export class LucidRibbonElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['layout', 'theme', 'accent', 'contextual'];
  }

  registry: Registry = defaultRegistry;
  #activeTab: TabId = 'home';
  #pressed = new Set<string>();
  #phone = { picker: false, sheet: false, subPage: null as string | null, query: '' };
  #width = 1280;
  #resize: ResizeObserver | undefined;
  #media: MediaQueryList | undefined;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.addEventListener('click', (e) => {
      this.#onClick(e);
    });
    this.#root.addEventListener('input', (e) => {
      this.#onInput(e);
    });
    // Overflow menus escape the horizontally scrolling panel with fixed positioning.
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
    this.render();
  }

  disconnectedCallback(): void {
    this.#resize?.disconnect();
    this.#media?.removeEventListener('change', this.#onScheme);
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  get activeTab(): TabId {
    return this.#activeTab;
  }

  set activeTab(id: TabId) {
    this.#activeTab = id;
    this.render();
  }

  /** Width used for "auto" layout; normally measured with ResizeObserver. */
  setWidth(width: number): void {
    this.#width = width;
    this.render();
  }

  get layout(): Layout {
    return resolveLayout((this.getAttribute('layout') ?? 'auto') as LayoutSetting, this.#width);
  }

  get theme(): ThemeName {
    const t = (this.getAttribute('theme') ?? 'auto') as ThemeSetting;
    if (t !== 'auto') return t;
    return this.#media?.matches ? 'dark' : 'light';
  }

  #onScheme = (): void => {
    this.render();
  };

  #contextual(): TabId[] {
    return (this.getAttribute('contextual') ?? '').split(/\s+/).filter(Boolean) as TabId[];
  }

  state(): RibbonState {
    const contextual = this.#contextual();
    // Fall back to Home if the active contextual tab is no longer relevant.
    if (!visibleTabs(this.registry, contextual).some((t) => t.id === this.#activeTab)) {
      this.#activeTab = 'home';
    }
    return {
      layout: this.layout,
      width: this.#width,
      activeTab: this.#activeTab,
      contextual,
      pressed: this.#pressed,
      phone: { ...this.#phone },
    };
  }

  render(): void {
    const focusedSearch = this.#root.activeElement?.classList.contains('ls-search') ?? false;
    const style = document.createElement('style');
    const accent = this.getAttribute('accent') ?? undefined;
    style.textContent = `:host { ${themeDeclarations(this.theme, accent)} } ${ribbonCss}`;
    this.#root.replaceChildren(style, renderRibbon(document, this.registry, this.state()));
    if (focusedSearch) {
      const input = this.#root.querySelector<HTMLInputElement>('.ls-search');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  }

  #onClick(e: Event): void {
    const target = (e.target as Element | null)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset['action'];
    if (action === 'tab') {
      this.#activeTab = target.dataset['tab'] as TabId;
      this.#phone.picker = false;
      this.#phone.subPage = null;
      if (this.layout === 'phone') this.#phone.sheet = true;
      this.render();
      this.#root.querySelector<HTMLElement>(`[data-tab="${this.#activeTab}"]`)?.focus();
    } else if (action === 'picker') {
      this.#phone.picker = !this.#phone.picker;
      this.render();
    } else if (action === 'sheet') {
      this.#phone.sheet = !this.#phone.sheet;
      this.#phone.picker = false;
      this.#phone.subPage = null;
      this.render();
    } else if (action === 'back') {
      this.#phone.subPage = null;
      this.render();
    } else if (action === 'command') {
      this.#invoke(target);
    }
  }

  #invoke(button: HTMLElement): void {
    if (button.getAttribute('aria-disabled') === 'true') return;
    const id = button.dataset['command']!;
    const kind = button.dataset['kind']!;
    const detail: CommandEventDetail = { id, kind, layout: this.layout };
    if (kind === 'toggle') {
      if (this.#pressed.has(id)) this.#pressed.delete(id);
      else this.#pressed.add(id);
      detail.pressed = this.#pressed.has(id);
    }
    if (this.layout === 'phone' && kind !== 'toggle' && kind !== 'button') {
      this.#phone.sheet = true;
      this.#phone.subPage = id;
    }
    this.render();
    this.dispatchEvent(
      new CustomEvent<CommandEventDetail>('ls-command', { detail, bubbles: true, composed: true }),
    );
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
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 236))}px`;
  }

  #onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.dataset['action'] === 'search') {
      this.#phone.query = t.value;
      this.render();
    }
  }

  /** Arrow keys move between tabs (WAI-ARIA tabs pattern). */
  #onKeydown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t.getAttribute('role') !== 'tab' || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) {
      return;
    }
    const tabs = visibleTabs(this.registry, this.#contextual());
    const i = tabs.findIndex((x) => x.id === this.#activeTab);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (next) {
      e.preventDefault();
      this.#activeTab = next.id;
      this.render();
      this.#root.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
    }
  }
}

/** Register `<ls-ribbon>` (idempotent). */
export function defineRibbon(tag = 'ls-ribbon'): void {
  if (!customElements.get(tag)) customElements.define(tag, LucidRibbonElement);
}
