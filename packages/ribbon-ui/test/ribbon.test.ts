import { allCommands, registry, type TabId } from '@lucid-sentence/commands';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  defineRibbon,
  initials,
  ribbonCss,
  renderRibbon,
  resolveLayout,
  themeDeclarations,
  themes,
  type LucidRibbonElement,
  type RibbonState,
} from '../src/index.js';

function state(overrides: Partial<RibbonState> = {}): RibbonState {
  return {
    layout: 'desktop',
    width: 1280,
    activeTab: 'home',
    contextual: [],
    pressed: new Set(),
    phone: { picker: false, sheet: false, subPage: null, query: '' },
    ...overrides,
  };
}

const ids = (root: Element, sel: string, attr: string): string[] =>
  [...root.querySelectorAll(sel)].map((e) => e.getAttribute(attr) ?? '');

describe('layout', () => {
  it('resolves auto layout by width', () => {
    expect(resolveLayout('auto', 390)).toBe('phone');
    expect(resolveLayout('auto', 820)).toBe('tablet');
    expect(resolveLayout('auto', 1440)).toBe('desktop');
    expect(resolveLayout('phone', 1440)).toBe('phone');
  });
});

describe('renderRibbon: desktop', () => {
  it("shows Word's eleven tabs in order and hides contextual tabs until relevant", () => {
    const el = renderRibbon(document, registry, state());
    expect(ids(el, '[role=tab]', 'data-tab')).toEqual([
      'file',
      'home',
      'insert',
      'draw',
      'design',
      'layout',
      'references',
      'mailings',
      'review',
      'view',
      'help',
    ]);
    const withTable = renderRibbon(
      document,
      registry,
      state({ contextual: ['table-design', 'table-layout'] }),
    );
    expect(ids(withTable, '[role=tab]', 'data-tab').slice(-2)).toEqual([
      'table-design',
      'table-layout',
    ]);
  });

  it.each(registry.tabs.map((t) => [t.id] as const))(
    'renders every command of the %s tab',
    (tabId: TabId) => {
      const el = renderRibbon(document, registry, state({ activeTab: tabId, contextual: [tabId] }));
      const rendered = ids(el, '[data-action=command]', 'data-command').sort();
      const expected = allCommands()
        .filter((r) => r.tab.id === tabId)
        .map((r) => r.command.id)
        .sort();
      expect(rendered).toEqual(expected);
    },
  );

  it('disables stubs and reflects toggle state', () => {
    const el = renderRibbon(document, registry, state({ pressed: new Set(['home.font.bold']) }));
    expect(
      el.querySelector('[data-command="home.voice.dictate"]')?.getAttribute('aria-disabled'),
    ).toBe('true');
    expect(el.querySelector('[data-command="home.font.bold"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

describe('renderRibbon: tablet and phone keep every command reachable', () => {
  it.each(registry.tabs.map((t) => [t.id] as const))('tablet renders all of %s', (tabId) => {
    const el = renderRibbon(
      document,
      registry,
      state({ layout: 'tablet', width: 760, activeTab: tabId, contextual: [tabId] }),
    );
    const expected = allCommands().filter((r) => r.tab.id === tabId).length;
    expect(el.querySelectorAll('[data-action=command]').length).toBe(expected);
  });

  it.each(registry.tabs.map((t) => [t.id] as const))(
    'phone bottom sheet lists every group and command of %s',
    (tabId) => {
      const el = renderRibbon(
        document,
        registry,
        state({
          layout: 'phone',
          width: 390,
          activeTab: tabId,
          contextual: [tabId],
          phone: { picker: false, sheet: true, subPage: null, query: '' },
        }),
      );
      const tab = registry.tabs.find((t) => t.id === tabId)!;
      expect(ids(el, '.ls-sheet [data-group]', 'data-group')).toEqual(tab.groups.map((g) => g.id));
      const inSheet = ids(el, '.ls-sheet [data-action=command]', 'data-command');
      expect(inSheet.sort()).toEqual(tab.groups.flatMap((g) => g.commands.map((c) => c.id)).sort());
    },
  );

  it('phone tab picker lists all tabs plus active contextual tabs', () => {
    const el = renderRibbon(
      document,
      registry,
      state({
        layout: 'phone',
        contextual: ['table-layout'],
        phone: { picker: true, sheet: false, subPage: null, query: '' },
      }),
    );
    expect(ids(el, '.ls-picker [data-tab]', 'data-tab')).toHaveLength(12);
  });

  it('phone search finds commands on any tab', () => {
    const el = renderRibbon(
      document,
      registry,
      state({
        layout: 'phone',
        phone: { picker: false, sheet: true, subPage: null, query: 'labels' },
      }),
    );
    expect(ids(el, '.ls-results [data-command]', 'data-command')).toContain(
      'mailings.create.labels',
    );
  });
});

describe('<ls-ribbon> element', () => {
  beforeAll(() => {
    defineRibbon();
  });

  it('switches tabs and emits ls-command events', () => {
    const el = document.createElement('ls-ribbon') as LucidRibbonElement;
    el.setAttribute('layout', 'desktop');
    document.body.append(el);
    const root = el.shadowRoot!;
    root.querySelector<HTMLElement>('[data-tab="review"]')!.click();
    expect(el.activeTab).toBe('review');

    const events: unknown[] = [];
    el.addEventListener('ls-command', (e) => events.push((e as CustomEvent).detail));
    root.querySelector<HTMLElement>('[data-command="review.tracking.track-changes"]')!.click();
    root.querySelector<HTMLElement>('[data-command="review.language.translate"]')!.click();
    expect(events).toEqual([
      { id: 'review.tracking.track-changes', kind: 'split', layout: 'desktop' },
    ]);
    el.remove();
  });

  it('opens a sub-page inside the sheet on phone', () => {
    const el = document.createElement('ls-ribbon') as LucidRibbonElement;
    el.setAttribute('layout', 'phone');
    document.body.append(el);
    const root = el.shadowRoot!;
    root.querySelector<HTMLElement>('[data-action=picker]')!.click();
    root.querySelector<HTMLElement>('.ls-picker [data-tab="layout"]')!.click();
    root
      .querySelector<HTMLElement>('.ls-sheet [data-command="layout.page-setup.margins"]')!
      .click();
    expect(root.querySelector('.ls-subpage__title')?.textContent).toBe('Margins');
    el.remove();
  });
});

describe('theme tokens', () => {
  it('provides light, dark, and high-contrast themes with a non-Word accent', () => {
    expect(Object.keys(themes)).toEqual(['light', 'dark', 'high-contrast']);
    // Word's brand blue is #2b579a / #185abd; the accent must be distinct.
    for (const t of Object.values(themes))
      expect(t.accent.toLowerCase()).not.toMatch(/2b579a|185abd/);
    expect(themeDeclarations('dark')).toContain('--ls-accent: #45c3d6;');
    expect(themeDeclarations('light', '#7c3aed')).toContain('--ls-accent: #7c3aed;');
  });

  it('draws its theme from @lucid-sentence/tokens (Chapternal Paper / Studio)', () => {
    expect(themes.light.chrome).toBe('#efe8dc');
    expect(themes.light.accent).toBe('#0a6a7c');
    expect(themes.dark.chrome).toBe('#0a0a0a');
    expect(ribbonCss).toContain('var(--ls-radius-pill)');
    expect(ribbonCss).toContain('text-transform: uppercase');
  });

  it('builds placeholder glyph initials', () => {
    expect(initials('Format Painter')).toBe('FP');
    expect(initials('Bold')).toBe('Bo');
    expect(initials('Show/Hide ¶')).toBe('SH');
  });
});
