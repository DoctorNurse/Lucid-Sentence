import { allCommands, registry } from '@lucid-sentence/commands';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ICON_BY_ID,
  TEXT_ONLY,
  defineRibbon,
  iconFor,
  isPending,
  renderRibbon,
  tooltip,
  type LucidRibbonElement,
  type RibbonState,
} from '../src/index.js';

const refs = allCommands();
const byId = new Map(refs.map((r) => [r.command.id, r.command]));

function state(overrides: Partial<RibbonState> = {}): RibbonState {
  return {
    layout: 'desktop',
    width: 1440,
    activeTab: 'home',
    contextual: [],
    pressed: new Set(),
    phone: { picker: false, sheet: false, subPage: null, query: '' },
    ...overrides,
  };
}

describe('icons (Lucide)', () => {
  it('every command has an icon or is explicitly text-only', () => {
    const missing = refs
      .filter((r) => !iconFor(r.command.id) && !TEXT_ONLY.has(r.command.id))
      .map((r) => r.command.id);
    expect(missing).toEqual([]);
  });

  it('text-only and per-id overrides refer to real commands', () => {
    for (const id of TEXT_ONLY) expect(byId.has(id), id).toBe(true);
    for (const id of Object.keys(ICON_BY_ID)) expect(byId.has(id), id).toBe(true);
  });

  it('renders an SVG icon in every visible command on every tab', () => {
    for (const tab of registry.tabs) {
      const root = document.createElement('div');
      root.append(
        renderRibbon(
          document,
          registry,
          state({ activeTab: tab.id, contextual: tab.kind === 'contextual' ? [tab.id] : [] }),
        ),
      );
      const buttons = [...root.querySelectorAll<HTMLElement>('.ls-panel [data-command]')];
      for (const b of buttons) {
        const id = b.dataset['command']!;
        if (TEXT_ONLY.has(id)) continue;
        expect(b.querySelector('svg'), `${tab.id}: ${id}`).not.toBeNull();
      }
    }
  });
});

describe('tooltips and the "coming with the engine" state', () => {
  it('tooltips carry the name and the shortcut', () => {
    expect(tooltip(byId.get('home.font.bold')!)).toBe('Bold (Ctrl+B)');
    expect(tooltip(byId.get('home.font.bold')!, true)).toContain('coming with the engine');
  });

  it('marks commands the host has not wired as pending', () => {
    const wired = new Set(['home.font.bold']);
    expect(isPending(byId.get('home.font.bold')!, { wired })).toBe(false);
    expect(isPending(byId.get('home.font.italic')!, { wired })).toBe(true);
    expect(isPending(byId.get('home.font.italic')!, { wired: undefined })).toBe(false);
    const root = document.createElement('div');
    root.append(renderRibbon(document, registry, state({ wired })));
    expect(
      root.querySelector('[data-command="home.font.bold"]')!.hasAttribute('data-pending'),
    ).toBe(false);
    expect(
      root.querySelector('[data-command="home.font.italic"]')!.hasAttribute('data-pending'),
    ).toBe(true);
  });

  it('exposes accessible roles, labels and states', () => {
    const root = document.createElement('div');
    root.append(renderRibbon(document, registry, state({ pressed: new Set(['home.font.bold']) })));
    for (const g of root.querySelectorAll('.ls-group')) {
      expect(g.getAttribute('role')).toBe('toolbar');
      expect(g.getAttribute('aria-label')).toBeTruthy();
    }
    expect(
      root.querySelector('[data-command="home.font.bold"]')!.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      root.querySelector('[data-command="home.font.italic"]')!.getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      root.querySelector('[data-command="home.styles.gallery"]')!.getAttribute('aria-haspopup'),
    ).toBe('true');
    for (const b of root.querySelectorAll('[data-command]'))
      expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
  });
});

describe('<ls-ribbon> with a host dispatcher', () => {
  beforeAll(() => {
    defineRibbon();
  });

  it('fires ls-command-pending (not ls-command) for unwired commands', () => {
    const el = document.createElement('ls-ribbon') as LucidRibbonElement;
    el.setAttribute('layout', 'desktop');
    el.wired = new Set(['home.font.bold']);
    document.body.append(el);
    const fired: string[] = [];
    el.addEventListener('ls-command', (e) =>
      fired.push(`run:${(e as CustomEvent<{ id: string }>).detail.id}`),
    );
    el.addEventListener('ls-command-pending', (e) =>
      fired.push(`pending:${(e as CustomEvent<{ id: string }>).detail.id}`),
    );
    el.shadowRoot!.querySelector<HTMLElement>('[data-command="home.font.bold"]')!.click();
    el.shadowRoot!.querySelector<HTMLElement>('[data-command="home.font.italic"]')!.click();
    expect(fired).toEqual(['run:home.font.bold', 'pending:home.font.italic']);
    // Toggle state is host-owned once `wired` is set.
    expect(el.pressed.has('home.font.bold')).toBe(false);
    el.pressed = new Set(['home.font.bold']);
    expect(
      el.shadowRoot!.querySelector('[data-command="home.font.bold"]')!.getAttribute('aria-pressed'),
    ).toBe('true');
    el.remove();
  });

  it('tapping a stub (unavailable) command reports it instead of doing nothing', () => {
    const el = document.createElement('ls-ribbon') as LucidRibbonElement;
    el.setAttribute('layout', 'desktop');
    el.wired = new Set();
    document.body.append(el);
    const fired: { id: string; stub?: boolean }[] = [];
    el.addEventListener('ls-command-pending', (e) =>
      fired.push((e as CustomEvent<{ id: string; stub?: boolean }>).detail),
    );
    const stub = el.shadowRoot!.querySelector<HTMLElement>('[aria-disabled="true"][data-command]');
    expect(stub).toBeTruthy();
    stub!.click();
    expect(fired).toEqual([{ id: stub!.dataset['command'], stub: true }]);
    el.invoke(stub!.dataset['command']!);
    expect(fired).toHaveLength(2);
    el.remove();
  });

  it('collapses and restores the ribbon', () => {
    const el = document.createElement('ls-ribbon') as LucidRibbonElement;
    document.body.append(el);
    el.toggleCollapsed();
    expect(el.hasAttribute('collapsed')).toBe(true);
    el.toggleCollapsed();
    expect(el.hasAttribute('collapsed')).toBe(false);
    el.remove();
  });
});
