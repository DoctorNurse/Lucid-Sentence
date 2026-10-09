/**
 * Command registry schema: tab -> group -> command.
 *
 * Build rule (plan §4.6): every command must declare a desktop, a tablet, and a
 * phone placement. Touch only changes layout and presentation, never which
 * commands exist. `validateRegistry()` enforces this at runtime and CI runs it.
 */

/** Word's ribbon tabs, in Word's order, followed by the contextual tabs. */
export const TAB_ORDER = [
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
] as const;

export const CONTEXTUAL_TAB_ORDER = [
  'table-design',
  'table-layout',
  'picture-format',
  'shape-format',
  'header-footer',
  'equation',
] as const;

export type MainTabId = (typeof TAB_ORDER)[number];
export type ContextualTabId = (typeof CONTEXTUAL_TAB_ORDER)[number];
export type TabId = MainTabId | ContextualTabId;

/** What the command looks like and how it behaves when invoked. */
export type CommandKind =
  | 'button' // runs immediately
  | 'toggle' // on/off state (Bold, Track Changes, Ruler)
  | 'split' // primary action + menu (Paste, Highlight, Font Color)
  | 'menu' // opens a list of options (Change Case, Margins)
  | 'gallery' // opens a visual gallery (Styles, Themes, Table)
  | 'dialog' // opens a dialog or pane (Font dialog, Manage Sources)
  | 'input'; // inline field (Font name, Size, Spacing)

/** Desktop ribbon size: large = icon over label, medium = icon + label, small = icon only. */
export type DesktopSize = 'large' | 'medium' | 'small';

export interface DesktopPlacement {
  size: DesktopSize;
}

/**
 * Tablet: one-row ribbon that collapses progressively as width shrinks (plan §4.6).
 * priority 1 = stays visible longest, 2 = collapses into the group's overflow when
 * narrow, 3 = lives in the group's overflow menu by default.
 */
export interface TabletPlacement {
  priority: 1 | 2 | 3;
}

/**
 * Phone: tab picker + quick strip + bottom sheet (plan §4.6).
 * Every command is listed in the bottom sheet under its group. `strip` also puts
 * it in the tab's horizontally scrolling quick strip. `subPage` means invoking it
 * pushes a sub-page (gallery, menu, dialog) inside the sheet.
 */
export interface PhonePlacement {
  strip: boolean;
  subPage: boolean;
}

export interface Placements {
  desktop: DesktopPlacement;
  tablet: TabletPlacement;
  phone: PhonePlacement;
}

/**
 * ONLYOFFICE coverage status from plan §4.8. "unverified" items must be confirmed
 * against sdkjs in M0; "gap" means new engine work.
 */
export type Coverage = 'verified' | 'ui-only' | 'unverified' | 'gap' | 'shell' | 'stub';

export interface Command {
  /** Globally unique, `${tab}.${group}.${slug}`. */
  id: string;
  label: string;
  kind: CommandKind;
  placement: Placements;
  /** Kept in place but disabled or replaced by an open alternative (plan §4.2). */
  stub?: boolean;
  /** Overrides the group's coverage status for this command. */
  coverage?: Coverage;
  /** Default keyboard shortcut (Windows notation; Ctrl maps to Cmd on macOS). */
  shortcut?: string;
}

export interface Group {
  /** `${tab}.${slug}` */
  id: string;
  label: string;
  coverage: Coverage;
  commands: readonly Command[];
}

export type TabKind = 'backstage' | 'standard' | 'contextual';

export interface Tab {
  id: TabId;
  label: string;
  kind: TabKind;
  /** For contextual tabs: when the tab appears. */
  context?: string;
  groups: readonly Group[];
}

export interface Registry {
  tabs: readonly Tab[];
}
