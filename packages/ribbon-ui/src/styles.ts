import { shape } from './tokens.js';

/** Component styles. Colors come from --ls-* theme tokens set on :host. */
export const ribbonCss = /* css */ `
:host {
  display: block;
  font-family: ${shape.font};
  font-size: ${shape.fontSize};
  line-height: 1.45;
  color: var(--ls-text);
  --ls-radius-sm: ${shape.radiusSm};
  --ls-radius-lg: ${shape.radiusLg};
  --ls-motion: ${shape.motion};
  --ls-touch: ${shape.touchTarget};
}
@media (prefers-reduced-motion: reduce) {
  :host { --ls-motion: 0ms; }
}
* { box-sizing: border-box; }
button, input, summary { font: inherit; color: inherit; }
button { background: none; border: 0; cursor: pointer; }
button:focus-visible, summary:focus-visible, input:focus-visible {
  outline: 2px solid var(--ls-focus);
  outline-offset: 1px;
}
.ls-ribbon { background: var(--ls-chrome); padding: 6px 10px 10px; }

/* Tab row */
.ls-tabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; padding: 0 2px 6px; }
.ls-tab {
  padding: 6px 12px; border-radius: var(--ls-radius-sm); white-space: nowrap;
  color: var(--ls-text-muted);
  transition: background var(--ls-motion), color var(--ls-motion);
}
.ls-tab:hover { background: var(--ls-hover); color: var(--ls-text); }
.ls-tab[aria-selected='true'] { color: var(--ls-accent); font-weight: 600; background: var(--ls-surface); box-shadow: var(--ls-shadow); }
.ls-tab--backstage { color: var(--ls-accent-text); background: var(--ls-accent); font-weight: 600; }
.ls-tab--backstage:hover { color: var(--ls-accent-text); background: var(--ls-accent); filter: brightness(1.08); }
.ls-tab--backstage[aria-selected='true'] { color: var(--ls-accent-text); background: var(--ls-accent); }
.ls-tab--contextual { border-bottom: 2px solid var(--ls-accent); border-radius: var(--ls-radius-sm) var(--ls-radius-sm) 0 0; }

/* Panel */
.ls-panel {
  display: flex; align-items: stretch; gap: 0; overflow-x: auto;
  background: var(--ls-surface); border-radius: var(--ls-radius-lg);
  box-shadow: var(--ls-shadow); padding: 6px 4px; min-height: 104px;
}
.ls-group { display: flex; flex-direction: column; padding: 0 8px; border-right: 1px solid var(--ls-border); }
.ls-group:last-child { border-right: 0; }
.ls-group__body { display: flex; align-items: flex-start; gap: 2px; flex: 1; }
.ls-group__label { text-align: center; font-size: 11px; color: var(--ls-text-muted); padding-top: 2px; white-space: nowrap; }
.ls-stack { display: flex; flex-direction: column; gap: 1px; }

/* Commands */
.ls-cmd {
  display: inline-flex; align-items: center; gap: 6px; border-radius: var(--ls-radius-sm);
  padding: 3px 6px; white-space: nowrap; color: var(--ls-text);
  transition: background var(--ls-motion);
}
.ls-cmd:hover { background: var(--ls-hover); }
.ls-cmd[aria-pressed='true'] { background: var(--ls-accent-soft); color: var(--ls-accent); }
.ls-cmd[aria-disabled='true'] { opacity: 0.42; cursor: not-allowed; }
.ls-cmd--large { flex-direction: column; gap: 2px; padding: 6px 8px; min-width: 56px; max-width: 92px; white-space: normal; text-align: center; line-height: 1.2; }
.ls-cmd--large .ls-glyph { color: var(--ls-accent); }
.ls-cmd__chevron { font-size: 9px; color: var(--ls-text-muted); }
.ls-cmd--small { padding: 4px; }
.ls-cmd--row { width: 100%; justify-content: flex-start; padding: 8px 10px; }
.ls-cmd__where { margin-left: auto; font-size: 11px; color: var(--ls-text-muted); }

/* Tablet: touch targets, one row, overflow menus */
[data-layout='tablet'] .ls-panel { min-height: 0; align-items: center; }
[data-layout='tablet'] .ls-cmd { min-height: var(--ls-touch); min-width: var(--ls-touch); }
[data-layout='tablet'] .ls-group__body { align-items: center; }
[data-layout='tablet'] .ls-tab { min-height: var(--ls-touch); }
.ls-overflow { position: relative; }
.ls-overflow__toggle {
  list-style: none; cursor: pointer; display: grid; place-items: center;
  min-width: var(--ls-touch); min-height: var(--ls-touch); border-radius: var(--ls-radius-sm);
  color: var(--ls-text-muted);
}
.ls-overflow__toggle::-webkit-details-marker { display: none; }
.ls-overflow__toggle:hover { background: var(--ls-hover); }
.ls-overflow__menu {
  position: absolute; top: 100%; left: 0; z-index: 10; min-width: 220px; width: max-content; padding: 6px;
  background: var(--ls-raised); border: 1px solid var(--ls-border);
  border-radius: var(--ls-radius-lg); box-shadow: var(--ls-shadow);
}

/* Backstage (File) */
.ls-backstage { display: flex; flex-direction: column; gap: 8px; padding: 6px; min-width: 220px; }
.ls-backstage__section { display: flex; flex-direction: column; }
.ls-backstage__section + .ls-backstage__section { border-top: 1px solid var(--ls-border); padding-top: 8px; }

/* Phone: tab picker + strip + bottom sheet */
[data-layout='phone'] { position: relative; padding: 0; background: transparent; }
.ls-phonebar {
  display: flex; align-items: center; gap: 4px; padding: 6px;
  background: var(--ls-surface); border-top: 1px solid var(--ls-border); box-shadow: var(--ls-shadow);
}
.ls-picker-btn, .ls-sheet-toggle {
  min-height: var(--ls-touch); padding: 0 12px; border-radius: var(--ls-radius-sm);
  font-weight: 600; white-space: nowrap; background: var(--ls-hover);
}
.ls-sheet-toggle { min-width: var(--ls-touch); padding: 0; }
.ls-strip { display: flex; gap: 2px; overflow-x: auto; flex: 1; scrollbar-width: none; }
.ls-strip .ls-cmd { min-width: var(--ls-touch); min-height: var(--ls-touch); justify-content: center; }
.ls-picker, .ls-sheet {
  background: var(--ls-raised); border: 1px solid var(--ls-border); box-shadow: var(--ls-shadow);
  border-radius: var(--ls-radius-lg) var(--ls-radius-lg) 0 0;
}
.ls-picker { display: flex; flex-direction: column; padding: 6px; max-height: 60vh; overflow-y: auto; }
.ls-picker__item { text-align: left; min-height: var(--ls-touch); padding: 0 14px; border-radius: var(--ls-radius-sm); }
.ls-picker__item[aria-selected='true'] { background: var(--ls-accent-soft); color: var(--ls-accent); font-weight: 600; }
.ls-sheet { max-height: 55vh; overflow-y: auto; }
.ls-sheet--full { max-height: 85vh; }
.ls-sheet__content { display: flex; flex-direction: column; gap: 8px; padding: 10px; }
.ls-search {
  min-height: var(--ls-touch); padding: 0 12px; border-radius: var(--ls-radius-sm);
  border: 1px solid var(--ls-border); background: var(--ls-surface);
}
.ls-sheet__group-label { margin: 6px 4px 2px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ls-text-muted); }
.ls-sheet__cmds .ls-cmd, .ls-results .ls-cmd { min-height: var(--ls-touch); }
.ls-subpage { padding: 10px; }
.ls-subpage__header { display: flex; align-items: center; gap: 8px; }
.ls-subpage__title { font-size: 15px; margin: 0; }
.ls-back { min-height: var(--ls-touch); padding: 0 10px; border-radius: var(--ls-radius-sm); color: var(--ls-accent); font-weight: 600; }
.ls-subpage__note { color: var(--ls-text-muted); }
`;
