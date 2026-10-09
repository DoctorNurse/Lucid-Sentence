import { designTab } from './tabs/design.js';
import { drawTab } from './tabs/draw.js';
import { fileTab } from './tabs/file.js';
import { helpTab } from './tabs/help.js';
import { homeTab } from './tabs/home.js';
import { insertTab } from './tabs/insert.js';
import { layoutTab } from './tabs/layout.js';
import { mailingsTab } from './tabs/mailings.js';
import { referencesTab } from './tabs/references.js';
import { reviewTab } from './tabs/review.js';
import { viewTab } from './tabs/view.js';
import {
  equationTab,
  headerFooterTab,
  pictureFormatTab,
  shapeFormatTab,
  tableDesignTab,
  tableLayoutTab,
} from './tabs/contextual.js';
import type { Command, Coverage, Group, Registry, Tab, TabId } from './types.js';

/** The one command registry. Desktop, tablet, and phone layouts all render from this. */
export const registry: Registry = {
  tabs: [
    fileTab,
    homeTab,
    insertTab,
    drawTab,
    designTab,
    layoutTab,
    referencesTab,
    mailingsTab,
    reviewTab,
    viewTab,
    helpTab,
    tableDesignTab,
    tableLayoutTab,
    pictureFormatTab,
    shapeFormatTab,
    headerFooterTab,
    equationTab,
  ],
};

export interface CommandRef {
  tab: Tab;
  group: Group;
  command: Command;
}

/** Every command with its tab and group, in ribbon order. */
export function allCommands(reg: Registry = registry): CommandRef[] {
  return reg.tabs.flatMap((tab) =>
    tab.groups.flatMap((group) => group.commands.map((command) => ({ tab, group, command }))),
  );
}

export function getTab(id: TabId, reg: Registry = registry): Tab | undefined {
  return reg.tabs.find((t) => t.id === id);
}

export function findCommand(id: string, reg: Registry = registry): CommandRef | undefined {
  return allCommands(reg).find((ref) => ref.command.id === id);
}

/**
 * "Tell me"-style search across all commands (plan §4.6, phone sheet search).
 * Matches every whitespace-separated term against label, group, tab, and id.
 */
export function searchCommands(query: string, reg: Registry = registry): CommandRef[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return allCommands(reg).filter(({ tab, group, command }) => {
    const hay = `${command.label} ${group.label} ${tab.label} ${command.id}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Effective coverage for a command: its own override, else its group's. */
export function coverageOf(ref: CommandRef): Coverage {
  return ref.command.coverage ?? (ref.command.stub ? 'stub' : ref.group.coverage);
}
