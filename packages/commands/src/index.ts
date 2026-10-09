export * from './types.js';
export { placement, cmd, group, tab } from './define.js';
export type { CommandDef, GroupDef, CommandExtras, D, T, P } from './define.js';
export {
  registry,
  allCommands,
  getTab,
  findCommand,
  searchCommands,
  coverageOf,
  type CommandRef,
} from './registry.js';
export { validateRegistry, phoneTaps, MAX_PHONE_TAPS } from './validate.js';
