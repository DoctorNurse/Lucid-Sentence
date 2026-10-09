import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROTATION_KEY,
  claimLaunchPromo,
  configurePromos,
  defineSplash,
  nextPromo,
  promos,
  promosEnabled,
  resetLaunchForTesting,
  type KeyValueStore,
  type LucidSplashElement,
  type Promo,
} from '../src/index.js';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

const promo = (id: string): Promo => ({
  id,
  appName: id.toUpperCase(),
  tagline: `${id} tagline`,
  url: `https://example.com/${id}`,
  ctaLabel: `Try ${id}`,
});

describe('promo config', () => {
  it('ships exactly one promo, Chapternal, linking to chapternal.com without tracking', () => {
    expect(promos.map((p) => p.id)).toEqual(['chapternal']);
    const [c] = promos;
    expect(c?.url).toBe('https://chapternal.com');
    expect(c?.ctaLabel).toMatch(/Chapternal/);
    expect(c?.icon).not.toMatch(/^https?:/);
  });
});

describe('rotation', () => {
  it('picks promos round-robin across launches and persists the index', () => {
    const store = new MemoryStore();
    const list = [promo('a'), promo('b'), promo('c')];
    expect([1, 2, 3, 4, 5].map(() => nextPromo(list, store)?.id)).toEqual([
      'a',
      'b',
      'c',
      'a',
      'b',
    ]);
    expect(store.getItem(ROTATION_KEY)).toBe('1');
  });

  it('recovers from garbage or broken storage', () => {
    const store = new MemoryStore();
    store.setItem(ROTATION_KEY, 'nope');
    expect(nextPromo([promo('a'), promo('b')], store)?.id).toBe('a');
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(nextPromo([promo('a')], broken)?.id).toBe('a');
    expect(nextPromo([], store)).toBeUndefined();
  });

  it('gives out at most one promo per launch', () => {
    resetLaunchForTesting();
    const store = new MemoryStore();
    const list = [promo('a'), promo('b')];
    expect(claimLaunchPromo(list, store)?.id).toBe('a');
    expect(claimLaunchPromo(list, store)).toBeUndefined();
    resetLaunchForTesting(); // next launch
    expect(claimLaunchPromo(list, store)?.id).toBe('b');
  });
});

describe('<ls-splash>', () => {
  beforeAll(() => {
    defineSplash();
  });
  beforeEach(() => {
    resetLaunchForTesting();
    configurePromos({ enabled: true });
    localStorage.clear();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function mount(attrs: Record<string, string> = {}, list?: Promo[]): LucidSplashElement {
    const el = document.createElement('ls-splash') as LucidSplashElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (list) el.promoList = list;
    el.storage = new MemoryStore();
    document.body.append(el);
    return el;
  }
  const card = (el: LucidSplashElement): HTMLElement | null =>
    el.shadowRoot!.querySelector<HTMLElement>('.promo');

  it('renders a labeled, accessible promo card and focuses it', () => {
    const el = mount({ 'asset-base': './' });
    const c = card(el)!;
    expect(c.getAttribute('role')).toBe('dialog');
    expect(c.getAttribute('aria-modal')).toBe('false');
    expect(c.getAttribute('aria-labelledby')).toBe('promo-label promo-title');
    expect(el.shadowRoot!.getElementById('promo-label')?.textContent).toBe('From Lucid Systems');
    expect(el.shadowRoot!.getElementById('promo-title')?.textContent).toBe('Chapternal');
    expect(el.shadowRoot!.activeElement).toBe(c);

    const close = c.querySelector('.promo__close')!;
    expect(close.tagName).toBe('BUTTON');
    expect(close.getAttribute('aria-label')).toMatch(/Close/);

    const link = c.querySelector<HTMLAnchorElement>('.promo__cta')!;
    expect(link.getAttribute('href')).toBe('https://chapternal.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toContain('(opens in a new tab)');
    expect(c.querySelector('img.promo__icon')?.getAttribute('src')).toBe(
      './promos/chapternal-icon.png',
    );

    const loader = el.shadowRoot!.querySelector('.loader')!;
    expect(loader.getAttribute('role')).toBe('status');
  });

  it('shows only one promo per launch even with several splashes', () => {
    const a = mount();
    const b = mount();
    expect(card(a)).not.toBeNull();
    expect(card(b)).toBeNull();
  });

  it('dismisses with the close button and restores focus', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    const el = mount();
    const events: unknown[] = [];
    el.addEventListener('ls-promo-dismissed', (e) => events.push((e as CustomEvent).detail));
    card(el)!.querySelector<HTMLButtonElement>('.promo__close')!.click();
    expect(card(el)).toBeNull();
    expect(events).toEqual([{ id: 'chapternal', reason: 'close' }]);
    expect(document.activeElement).toBe(button);
  });

  it('dismisses on Escape', () => {
    const el = mount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(el.promoOpen).toBe(false);
    expect(card(el)).toBeNull();
  });

  it('removes the cover on finish and keeps the card until dismissed or timed out', () => {
    vi.useFakeTimers();
    const el = mount({ 'auto-dismiss': '8000' });
    // blur the card so the timer is not paused by focus
    card(el)!.blur();
    el.finish();
    expect(el.dataset['state']).toBe('done');
    expect(el.loading).toBe(false);
    expect(el.hidden).toBe(false);
    expect(card(el)).not.toBeNull();
    vi.advanceTimersByTime(7999);
    expect(el.promoOpen).toBe(true);
    vi.advanceTimersByTime(1);
    expect(el.promoOpen).toBe(false);
    expect(el.hidden).toBe(true);
  });

  it('closes immediately on finish when there is no promo', () => {
    const el = mount({ promos: 'off' });
    expect(card(el)).toBeNull();
    el.finish();
    expect(el.hidden).toBe(true);
  });

  it('honors the disabled flag (runtime config and attribute)', () => {
    configurePromos({ enabled: false });
    expect(promosEnabled()).toBe(false);
    const el = mount();
    expect(card(el)).toBeNull();
    expect(el.promo).toBeUndefined();
    // Disabled launches do not consume the rotation.
    configurePromos({ enabled: true });
    expect(claimLaunchPromo(promos, new MemoryStore())?.id).toBe('chapternal');
  });

  it('refuses remote promo icons', () => {
    const el = mount({}, [{ ...promo('x'), icon: 'https://tracker.example/pixel.png' }]);
    expect(card(el)!.querySelector('img')).toBeNull();
    expect(el.iconUrl('//cdn.example/x.png')).toBeUndefined();
    expect(el.iconUrl('/abs/x.png')).toBe('/abs/x.png');
  });

  it('uses plain high-contrast tokens instead of brand colors', () => {
    const el = mount({ theme: 'high-contrast' });
    expect(card(el)!.classList.contains('promo--branded')).toBe(false);
  });
});
