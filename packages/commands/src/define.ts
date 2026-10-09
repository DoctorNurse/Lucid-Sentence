import type {
  Command,
  CommandKind,
  Coverage,
  DesktopSize,
  Group,
  Placements,
  Tab,
  TabId,
  TabKind,
} from './types.js';

/** Compact desktop size codes used in the data files. */
export type D = 'L' | 'M' | 'S';
/** Tablet priority. */
export type T = 1 | 2 | 3;
/**
 * Compact phone placement codes:
 * - `strip`      quick strip + sheet, acts immediately
 * - `strip+sub`  quick strip + sheet, opens a sub-page
 * - `sheet`      sheet only, acts immediately
 * - `sub`        sheet only, opens a sub-page
 */
export type P = 'strip' | 'strip+sub' | 'sheet' | 'sub';

const SIZE: Record<D, DesktopSize> = { L: 'large', M: 'medium', S: 'small' };

export function placement(d: D, t: T, p: P): Placements {
  return {
    desktop: { size: SIZE[d] },
    tablet: { priority: t },
    phone: { strip: p.startsWith('strip'), subPage: p.endsWith('sub') },
  };
}

/** A command definition before its id is namespaced by group and tab. */
export interface CommandDef {
  slug: string;
  label: string;
  kind: CommandKind;
  placement: Placements;
  stub?: boolean;
  coverage?: Coverage;
  shortcut?: string;
}

export interface CommandExtras {
  stub?: boolean;
  coverage?: Coverage;
  shortcut?: string;
}

/**
 * Define a command. Desktop, tablet, and phone placements are required
 * positional arguments, so a command cannot be declared without them.
 */
export function cmd(
  slug: string,
  label: string,
  kind: CommandKind,
  d: D,
  t: T,
  p: P,
  extras: CommandExtras = {},
): CommandDef {
  return { slug, label, kind, placement: placement(d, t, p), ...extras };
}

export interface GroupDef {
  slug: string;
  label: string;
  coverage: Coverage;
  commands: readonly CommandDef[];
}

export function group(
  slug: string,
  label: string,
  coverage: Coverage,
  commands: readonly CommandDef[],
): GroupDef {
  return { slug, label, coverage, commands };
}

export function tab(
  id: TabId,
  label: string,
  kind: TabKind,
  groups: readonly GroupDef[],
  context?: string,
): Tab {
  const builtGroups: Group[] = groups.map((g) => {
    const groupId = `${id}.${g.slug}`;
    const commands: Command[] = g.commands.map(({ slug, ...rest }) => ({
      ...rest,
      id: `${groupId}.${slug}`,
    }));
    return { id: groupId, label: g.label, coverage: g.coverage, commands };
  });
  return context === undefined
    ? { id, label, kind, groups: builtGroups }
    : { id, label, kind, context, groups: builtGroups };
}
