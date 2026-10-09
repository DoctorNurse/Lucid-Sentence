import { describe, expect, it } from 'vitest';
import {
  CONTEXTUAL_TAB_ORDER,
  MAX_PHONE_TAPS,
  TAB_ORDER,
  allCommands,
  coverageOf,
  findCommand,
  getTab,
  phoneTaps,
  registry,
  searchCommands,
  validateRegistry,
} from '../src/index.js';

describe('command registry: build rules (plan §4.6)', () => {
  it('passes validateRegistry with no problems', () => {
    expect(validateRegistry(registry)).toEqual([]);
  });

  // The plan's build rule: CI fails if any command lacks a phone or tablet placement.
  it.each(allCommands().map((r) => [r.command.id, r.command] as const))(
    '%s has desktop, tablet, and phone placements',
    (_id, command) => {
      expect(command.placement.desktop.size).toMatch(/^(large|medium|small)$/);
      expect([1, 2, 3]).toContain(command.placement.tablet.priority);
      expect(typeof command.placement.phone.strip).toBe('boolean');
      expect(typeof command.placement.phone.subPage).toBe('boolean');
      expect(phoneTaps(command.placement.phone.subPage)).toBeLessThanOrEqual(MAX_PHONE_TAPS);
    },
  );

  it('fails when a command lacks a phone placement', () => {
    const bad = structuredClone(registry) as unknown as {
      tabs: { groups: { commands: { placement: Record<string, unknown> }[] }[] }[];
    };
    delete bad.tabs[1]!.groups[0]!.commands[0]!.placement['phone'];
    expect(validateRegistry(bad)).toEqual(['home.clipboard.paste: missing phone placement']);
  });

  it('fails when a command lacks a tablet placement', () => {
    const bad = structuredClone(registry) as unknown as {
      tabs: { groups: { commands: { placement: Record<string, unknown> }[] }[] }[];
    };
    delete bad.tabs[2]!.groups[1]!.commands[0]!.placement['tablet'];
    expect(validateRegistry(bad)).toEqual(['insert.tables.table: missing tablet placement']);
  });

  it('fails on duplicate ids and empty groups', () => {
    const bad = structuredClone(registry) as unknown as {
      tabs: { groups: { commands: unknown[] }[] }[];
    };
    const home = bad.tabs[1]!;
    home.groups[0]!.commands.push(home.groups[0]!.commands[0]);
    home.groups[1]!.commands = [];
    const problems = validateRegistry(bad);
    expect(problems).toContain('home.clipboard.paste: duplicate command id');
    expect(problems).toContain('home.font: group has no commands');
  });
});

describe('command registry: ribbon map (plan §4.2)', () => {
  it("has Word's eleven tabs in order, then the contextual tabs", () => {
    expect(registry.tabs.map((t) => t.id)).toEqual([...TAB_ORDER, ...CONTEXTUAL_TAB_ORDER]);
    expect(registry.tabs.map((t) => t.label).slice(0, 11)).toEqual([
      'File',
      'Home',
      'Insert',
      'Draw',
      'Design',
      'Layout',
      'References',
      'Mailings',
      'Review',
      'View',
      'Help',
    ]);
  });

  it('marks File as backstage and contextual tabs as contextual with a context', () => {
    expect(getTab('file')?.kind).toBe('backstage');
    for (const id of CONTEXTUAL_TAB_ORDER) {
      const t = getTab(id);
      expect(t?.kind).toBe('contextual');
      expect(t?.context).toBeTruthy();
    }
  });

  it.each([
    ['home', ['Clipboard', 'Font', 'Paragraph', 'Styles', 'Editing', 'Voice', 'Editor', 'Add-ins']],
    [
      'insert',
      [
        'Pages',
        'Tables',
        'Illustrations',
        'Add-ins',
        'Media',
        'Links',
        'Comments',
        'Header & Footer',
        'Text',
        'Symbols',
      ],
    ],
    ['draw', ['Drawing Tools', 'Convert', 'Insert', 'Replay']],
    ['design', ['Document Formatting', 'Page Background']],
    ['layout', ['Page Setup', 'Paragraph', 'Arrange']],
    [
      'references',
      [
        'Table of Contents',
        'Footnotes',
        'Research',
        'Citations & Bibliography',
        'Captions',
        'Index',
        'Table of Authorities',
      ],
    ],
    [
      'mailings',
      ['Create', 'Start Mail Merge', 'Write & Insert Fields', 'Preview Results', 'Finish'],
    ],
    [
      'review',
      [
        'Proofing',
        'Speech',
        'Accessibility',
        'Language',
        'Comments',
        'Tracking',
        'Changes',
        'Compare',
        'Protect',
        'Ink',
      ],
    ],
    [
      'view',
      ['Views', 'Immersive', 'Page Movement', 'Show', 'Zoom', 'Window', 'Macros', 'Properties'],
    ],
    ['help', ['Help']],
  ] as const)('%s has the Word groups in order', (id, groups) => {
    expect(getTab(id)?.groups.map((g) => g.label)).toEqual(groups);
  });

  it('keeps the plan stub list as stubs (and only those)', () => {
    const stubs = allCommands()
      .filter((r) => r.command.stub)
      .map((r) => r.command.id)
      .sort();
    expect(stubs).toEqual(
      [
        'home.voice.dictate',
        'home.editor.editor',
        'home.add-ins.add-ins',
        'insert.illustrations.3d-models',
        'insert.add-ins.get-add-ins',
        'references.research.researcher',
        'review.language.translate',
        'review.protect.block-authors',
      ].sort(),
    );
    for (const ref of allCommands().filter((r) => r.command.stub)) {
      expect(coverageOf(ref)).toBe('stub');
    }
  });

  it('gives every tab at least one quick-strip command on phone', () => {
    for (const t of registry.tabs) {
      const strip = t.groups.flatMap((g) => g.commands).filter((c) => c.placement.phone.strip);
      expect(strip.length, t.id).toBeGreaterThan(0);
    }
  });

  it('has a reasonably complete command set', () => {
    expect(allCommands().length).toBeGreaterThan(300);
  });
});

describe('command lookup', () => {
  it('finds a command by id', () => {
    expect(findCommand('home.font.bold')?.command.shortcut).toBe('Ctrl+B');
    expect(findCommand('nope')).toBeUndefined();
  });

  it('searches like "Tell me"', () => {
    const ids = searchCommands('track changes').map((r) => r.command.id);
    expect(ids).toContain('review.tracking.track-changes');
    expect(searchCommands('   ')).toEqual([]);
  });
});
