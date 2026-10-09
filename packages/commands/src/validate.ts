import { CONTEXTUAL_TAB_ORDER, TAB_ORDER } from './types.js';
import type { Registry } from './types.js';

/** Maximum taps from edit mode to any command on phone (plan §3.4, §4.6). */
export const MAX_PHONE_TAPS = 3;

/**
 * Taps from edit mode on phone: open the tab picker / sheet (1), tap the command
 * (2), then a sub-page if it opens one (3). Quick-strip commands on the current
 * tab still count the tab-picker tap, so this is a conservative upper bound.
 */
export function phoneTaps(subPage: boolean): number {
  return 2 + (subPage ? 1 : 0);
}

const DESKTOP_SIZES = new Set(['large', 'medium', 'small']);
const TABLET_PRIORITIES = new Set([1, 2, 3]);

/**
 * Validate the build rules for the registry. Returns a list of human-readable
 * problems; an empty list means the registry is valid. CI fails on any problem.
 *
 * Accepts `unknown` so it can check untyped data (JSON, plugins) too.
 */
export function validateRegistry(input: unknown): string[] {
  const problems: string[] = [];
  const reg = input as Partial<Registry> | null | undefined;
  if (!reg || !Array.isArray(reg.tabs)) return ['registry has no tabs array'];

  const ids = new Set<string>();
  const tabIds = reg.tabs.map((t) => (t as { id?: unknown }).id);
  const expected: readonly string[] = [...TAB_ORDER, ...CONTEXTUAL_TAB_ORDER];
  if (JSON.stringify(tabIds) !== JSON.stringify(expected)) {
    problems.push(`tab order is ${JSON.stringify(tabIds)}, expected ${JSON.stringify(expected)}`);
  }

  for (const tab of reg.tabs as unknown[]) {
    const t = tab as Record<string, unknown>;
    const tabId = String(t['id']);
    const groups = t['groups'];
    if (!Array.isArray(groups) || groups.length === 0) {
      problems.push(`${tabId}: tab has no groups`);
      continue;
    }
    for (const group of groups as unknown[]) {
      const g = group as Record<string, unknown>;
      const groupId = String(g['id']);
      if (!groupId.startsWith(`${tabId}.`)) problems.push(`${groupId}: not namespaced by tab`);
      const commands = g['commands'];
      if (!Array.isArray(commands) || commands.length === 0) {
        problems.push(`${groupId}: group has no commands`);
        continue;
      }
      for (const command of commands as unknown[]) {
        const c = command as Record<string, unknown>;
        const id = String(c['id']);
        if (!id.startsWith(`${groupId}.`)) problems.push(`${id}: not namespaced by group`);
        if (ids.has(id)) problems.push(`${id}: duplicate command id`);
        ids.add(id);
        if (typeof c['label'] !== 'string' || c['label'] === '') {
          problems.push(`${id}: missing label`);
        }
        const placement = c['placement'] as Record<string, Record<string, unknown>> | undefined;
        const desktop = placement?.['desktop'];
        const tablet = placement?.['tablet'];
        const phone = placement?.['phone'];
        if (!desktop || !DESKTOP_SIZES.has(desktop['size'] as string)) {
          problems.push(`${id}: missing desktop placement`);
        }
        if (!tablet || !TABLET_PRIORITIES.has(tablet['priority'] as number)) {
          problems.push(`${id}: missing tablet placement`);
        }
        if (
          !phone ||
          typeof phone['strip'] !== 'boolean' ||
          typeof phone['subPage'] !== 'boolean'
        ) {
          problems.push(`${id}: missing phone placement`);
        } else if (phoneTaps(phone['subPage']) > MAX_PHONE_TAPS) {
          problems.push(`${id}: more than ${MAX_PHONE_TAPS} taps on phone`);
        }
      }
    }
  }
  return problems;
}
