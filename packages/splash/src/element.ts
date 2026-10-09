import { themeDeclarations, type ThemeName } from '@lucid-sentence/ribbon-ui';
import { promosEnabled } from './config.js';
import { promos as defaultPromos, type Promo } from './promos.js';
import { claimLaunchPromo, type KeyValueStore } from './rotation.js';
import { splashCss } from './styles.js';

export type DismissReason = 'close' | 'escape' | 'cta' | 'timeout' | 'api';

/** Default auto-dismiss delay after loading finishes (ms). */
export const DEFAULT_AUTO_DISMISS_MS = 8000;

/**
 * `<ls-splash>`: splash/loading screen with at most one promo card per launch.
 *
 * Attributes:
 * - `icon`: app icon URL (the brand icon)
 * - `asset-base`: base URL for promo icons (e.g. `./`), which are bundled with the app
 * - `app-name`: defaults to "Lucid Sentence"
 * - `status`: loading status text (announced politely)
 * - `theme`: `auto` (default; follows OS dark mode and "more contrast") | `light` | `dark` | `high-contrast`
 * - `layout`: optional `desktop` | `tablet` | `phone`; by default the viewport width decides
 * - `promos="off"`: never show a promo (see also `configurePromos` and the build flag)
 * - `auto-dismiss`: ms after loading finishes before the card hides itself (`0` = never)
 *
 * Behavior: while loading, the splash covers the window (the editor is not ready
 * yet). `finish()` removes the cover at once. The promo card, if any, moves to a
 * corner, never blocks the editor, and closes on its ✕ button, Esc, its link, or
 * after `auto-dismiss` ms. The timer pauses while the card is hovered or focused.
 *
 * Events (local DOM only; nothing is sent over the network):
 * `ls-promo-shown`, `ls-promo-dismissed` ({ id, reason }), `ls-splash-closed`.
 */
export class LucidSplashElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['theme', 'status', 'icon', 'app-name', 'asset-base'];
  }

  /** Override the promo list (tests, or distributions with other entries). */
  promoList: readonly Promo[] = defaultPromos;
  /** Override persistence for rotation (defaults to localStorage). */
  storage: KeyValueStore | undefined;

  #promo: Promo | undefined;
  #promoOpen = false;
  #loading = true;
  #returnFocus: Element | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #hovering = false;
  #media: MediaQueryList[] = [];
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  get promo(): Promo | undefined {
    return this.#promo;
  }

  get promoOpen(): boolean {
    return this.#promoOpen;
  }

  get loading(): boolean {
    return this.#loading;
  }

  connectedCallback(): void {
    if (this.#promo === undefined && this.getAttribute('promos') !== 'off' && promosEnabled()) {
      this.#promo = claimLaunchPromo(this.promoList, this.storage);
      this.#promoOpen = this.#promo !== undefined;
    }
    if (typeof matchMedia === 'function') {
      this.#media = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)'].map((q) => {
        const m = matchMedia(q);
        m.addEventListener('change', this.#onTheme);
        return m;
      });
    }
    document.addEventListener('keydown', this.#onKeydown, true);
    this.dataset['state'] = 'loading';
    this.#render();
    if (this.#promoOpen && this.#promo) {
      this.#returnFocus = document.activeElement;
      this.#root.querySelector<HTMLElement>('.promo')?.focus();
      this.dispatchEvent(
        new CustomEvent('ls-promo-shown', { detail: { id: this.#promo.id }, bubbles: true }),
      );
    }
  }

  disconnectedCallback(): void {
    document.removeEventListener('keydown', this.#onKeydown, true);
    for (const m of this.#media) m.removeEventListener('change', this.#onTheme);
    this.#clearTimer();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.#render();
  }

  get theme(): ThemeName {
    const t = this.getAttribute('theme') ?? 'auto';
    if (t === 'light' || t === 'dark' || t === 'high-contrast') return t;
    if (this.#media[1]?.matches) return 'high-contrast';
    return this.#media[0]?.matches ? 'dark' : 'light';
  }

  get autoDismissMs(): number {
    const raw = this.getAttribute('auto-dismiss');
    const n = raw === null ? DEFAULT_AUTO_DISMISS_MS : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_AUTO_DISMISS_MS;
  }

  /** Loading is done: remove the cover. The promo card (if open) stays, non-blocking. */
  finish(): void {
    if (!this.#loading) return;
    this.#loading = false;
    this.dataset['state'] = 'done';
    this.#render();
    if (this.#promoOpen) this.#startTimer();
    else this.#close();
  }

  /** Close the promo card. */
  dismissPromo(reason: DismissReason = 'api'): void {
    if (!this.#promoOpen || !this.#promo) return;
    this.#promoOpen = false;
    this.#clearTimer();
    const hadFocus = this.#root.activeElement !== null;
    this.#render();
    if (hadFocus && this.#returnFocus instanceof HTMLElement && this.#returnFocus.isConnected) {
      this.#returnFocus.focus();
    }
    this.dispatchEvent(
      new CustomEvent('ls-promo-dismissed', {
        detail: { id: this.#promo.id, reason },
        bubbles: true,
      }),
    );
    if (!this.#loading) this.#close();
  }

  #close(): void {
    this.hidden = true;
    this.dispatchEvent(new CustomEvent('ls-splash-closed', { bubbles: true }));
  }

  #onTheme = (): void => {
    this.#render();
  };

  #onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.#promoOpen) {
      e.stopPropagation();
      this.dismissPromo('escape');
    }
  };

  #startTimer(): void {
    this.#clearTimer();
    const ms = this.autoDismissMs;
    if (ms === 0 || this.#loading || this.#hovering) return;
    if (this.#root.activeElement !== null) return; // paused while focused
    this.#timer = setTimeout(() => {
      this.dismissPromo('timeout');
    }, ms);
    const card = this.#root.querySelector<HTMLElement>('.promo');
    if (card) {
      card.style.setProperty('--promo-dismiss-ms', `${ms}ms`);
      card.classList.remove('promo--timing');
      card.getBoundingClientRect(); // force a reflow so the countdown animation restarts
      card.classList.add('promo--timing');
    }
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#root.querySelector('.promo')?.classList.remove('promo--timing');
  }

  #el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {},
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  #render(): void {
    const style = this.#el('style');
    style.textContent = `:host { ${themeDeclarations(this.theme)} } ${splashCss}`;
    const nodes: Node[] = [style];
    const appName = this.getAttribute('app-name') ?? 'Lucid Sentence';

    const loader = this.#el('div', { class: 'loader', part: 'loader' });
    if (this.#loading) {
      loader.setAttribute('role', 'status');
      loader.setAttribute('aria-live', 'polite');
    } else {
      loader.setAttribute('aria-hidden', 'true');
    }
    const icon = this.getAttribute('icon');
    if (icon) loader.append(this.#el('img', { class: 'loader__icon', src: icon, alt: '' }));
    loader.append(
      this.#el('div', { class: 'loader__name' }, appName),
      this.#el('div', { class: 'loader__bar', 'aria-hidden': 'true' }),
      this.#el('div', { class: 'loader__status' }, this.getAttribute('status') ?? 'Loading…'),
    );
    loader.querySelector('.loader__bar')?.append(this.#el('span'));
    nodes.push(loader);

    if (this.#promoOpen && this.#promo) nodes.push(this.#card(this.#promo));
    this.toggleAttribute('data-promo', this.#promoOpen);
    this.#root.replaceChildren(...nodes);
  }

  /** Resolve a promo icon against `asset-base`. Remote (http/https) icons are refused. */
  iconUrl(icon: string | undefined): string | undefined {
    if (!icon || /^[a-z][a-z0-9+.-]*:\/\//i.test(icon) || icon.startsWith('//')) return undefined;
    if (icon.startsWith('/') || icon.startsWith('data:')) return icon;
    const base = this.getAttribute('asset-base') ?? '';
    return base === '' ? icon : `${base.replace(/\/$/, '')}/${icon}`;
  }

  #card(p: Promo): HTMLElement {
    const card = this.#el('section', {
      class: 'promo',
      part: 'promo',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-labelledby': 'promo-label promo-title',
      'aria-describedby': 'promo-tagline promo-desc',
      tabindex: '-1',
      'data-promo': p.id,
    });
    const t = p.theme;
    if (t && this.theme !== 'high-contrast') {
      card.classList.add('promo--branded');
      card.style.setProperty('--promo-bg', t.background);
      card.style.setProperty('--promo-text', t.text);
      card.style.setProperty('--promo-muted', t.muted);
      card.style.setProperty('--promo-a', t.gradient[0]);
      card.style.setProperty('--promo-b', t.gradient[1]);
      card.style.setProperty('--promo-c', t.gradient[2]);
      card.style.setProperty('--promo-cta-text', t.ctaText);
      if (t.displayFont) card.style.setProperty('--promo-display', t.displayFont);
    }

    const head = this.#el('div', { class: 'promo__head' });
    const close = this.#el('button', {
      type: 'button',
      class: 'promo__close',
      'aria-label': `Close ${p.appName} suggestion`,
      title: 'Close (Esc)',
    });
    close.textContent = '✕';
    close.addEventListener('click', () => {
      this.dismissPromo('close');
    });
    head.append(
      this.#el('span', { class: 'promo__eyebrow', id: 'promo-label' }, 'From Lucid Systems'),
      close,
    );

    const iconSrc = this.iconUrl(p.icon);
    const tile = iconSrc
      ? this.#el('img', { class: 'promo__icon', src: iconSrc, alt: '', width: '56', height: '56' })
      : this.#el('div', { class: 'promo__icon', 'aria-hidden': 'true' }, p.appName.slice(0, 1));

    const titles = this.#el('div', { class: 'promo__titles' });
    titles.append(
      this.#el('h2', { class: 'promo__title', id: 'promo-title' }, p.appName),
      this.#el('p', { class: 'promo__tagline', id: 'promo-tagline' }, p.tagline),
    );
    const hero = this.#el('div', { class: 'promo__hero' });
    hero.append(tile, titles);

    const body: Node[] = [head, hero];
    body.push(this.#el('p', { class: 'promo__desc', id: 'promo-desc' }, p.description ?? ''));
    if (p.highlights && p.highlights.length > 0) {
      const list = this.#el('ul', {
        class: 'promo__chips',
        'aria-label': `${p.appName} highlights`,
      });
      for (const h of p.highlights.slice(0, 3)) list.append(this.#el('li', {}, h));
      body.push(list);
    }

    const cta = this.#el('a', {
      class: 'promo__cta',
      href: p.url,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    cta.append(
      this.#el('span', {}, p.ctaLabel),
      this.#el('span', { class: 'promo__arrow', 'aria-hidden': 'true' }, '↗'),
      this.#el('span', { class: 'sr-only' }, ' (opens in a new tab)'),
    );
    cta.addEventListener('click', () => {
      this.dismissPromo('cta');
    });
    body.push(cta, this.#el('div', { class: 'promo__timer', 'aria-hidden': 'true' }));
    card.append(...body);

    card.addEventListener('pointerenter', () => {
      this.#hovering = true;
      this.#clearTimer();
    });
    card.addEventListener('pointerleave', () => {
      this.#hovering = false;
      this.#startTimer();
    });
    card.addEventListener('focusin', () => {
      this.#clearTimer();
    });
    card.addEventListener('focusout', (e) => {
      if (!card.contains(e.relatedTarget as Node | null)) {
        queueMicrotask(() => {
          if (this.#promoOpen) this.#startTimer();
        });
      }
    });
    return card;
  }
}

/** Register `<ls-splash>` (idempotent). */
export function defineSplash(tag = 'ls-splash'): void {
  if (!customElements.get(tag)) customElements.define(tag, LucidSplashElement);
}
