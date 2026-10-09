import { shape } from './tokens.js';

/**
 * Component styles. Colors, radii, shadows, and type come from --ls-* tokens
 * (@lucid-sentence/tokens) set on :host. Visual language after Chapternal's Desk:
 * a recessed pill capsule for tabs, soft rounded cards for groups, small
 * uppercase mono group labels, circular icon buttons, and pill chips.
 */
export const ribbonCss = /* css */ `
:host {
  display: block;
  font-family: var(--ls-font-sans, ${shape.font});
  font-size: var(--ls-type-sm, ${shape.fontSize});
  line-height: 1.45;
  color: var(--ls-ink);
  --ls-motion: var(--ls-motion-quick, ${shape.motion});
  --ls-ease: var(--ls-motion-ease-out);
}
@media (prefers-reduced-motion: reduce) {
  :host { --ls-motion: 0ms; }
}
* { box-sizing: border-box; }
button, input, summary { font: inherit; color: inherit; }
button { background: none; border: 0; cursor: pointer; }
button:focus-visible, summary:focus-visible, input:focus-visible {
  outline: 2px solid var(--ls-focus);
  outline-offset: 2px;
}
.ls-ribbon { background: var(--ls-canvas); padding: 8px 12px 12px; }

/* Tab row: a recessed segmented capsule (Chapternal .desk-pill) */
.ls-tabs {
  display: flex; gap: 2px; width: max-content; max-width: 100%;
  overflow-x: auto; scrollbar-width: none; margin: 0 0 10px; padding: 4px;
  background: var(--ls-recess); border-radius: var(--ls-radius-pill); box-shadow: var(--ls-shadow-inset);
}
.ls-tab {
  padding: 6px 14px; min-height: 32px; border-radius: var(--ls-radius-pill); white-space: nowrap;
  color: var(--ls-muted); font-weight: 500;
  transition: background var(--ls-motion) var(--ls-ease), color var(--ls-motion) var(--ls-ease), box-shadow var(--ls-motion);
}
.ls-tab:hover { background: var(--ls-hover); color: var(--ls-ink); }
.ls-tab[aria-selected='true'] {
  color: var(--ls-on-selected); background: var(--ls-selected); font-weight: 600;
  box-shadow: var(--ls-shadow-sm);
}
.ls-tab--backstage { color: var(--ls-on-accent); background: var(--ls-accent); font-weight: 600; }
.ls-tab--backstage:hover { color: var(--ls-on-accent); background: var(--ls-accent); filter: brightness(1.08); }
.ls-tab--backstage[aria-selected='true'] { color: var(--ls-on-accent); background: var(--ls-accent); }
.ls-tab--contextual { position: relative; color: var(--ls-accent); }
.ls-tab--contextual::before {
  content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 6px; vertical-align: 1px;
  border-radius: 50%; background: var(--ls-accent);
}

/* Panel: a row of soft rounded group cards */
.ls-panel {
  display: flex; align-items: stretch; gap: 10px; overflow-x: auto; scrollbar-width: thin;
  padding: 2px 2px 6px; min-height: 112px;
}
.ls-group {
  display: flex; flex-direction: column; gap: 6px; flex: none;
  padding: 10px 10px 8px; background: var(--ls-surface);
  border-radius: var(--ls-radius-md); box-shadow: var(--ls-shadow-md);
}
.ls-group__body { display: flex; align-items: flex-start; gap: 4px; flex: 1; }
.ls-group__label {
  text-align: center; white-space: nowrap; padding-top: 2px;
  font-family: var(--ls-font-mono); font-size: var(--ls-type-label); font-weight: 500;
  letter-spacing: var(--ls-type-track-label); text-transform: uppercase; color: var(--ls-subtle);
}
.ls-stack { display: flex; flex-direction: column; gap: 3px; }

/* Commands */
.ls-cmd {
  display: inline-flex; align-items: center; gap: 6px; border-radius: var(--ls-radius-pill);
  padding: 3px 10px 3px 4px; white-space: nowrap; color: var(--ls-ink); min-height: 28px;
  transition: background var(--ls-motion) var(--ls-ease), color var(--ls-motion), box-shadow var(--ls-motion);
}
.ls-cmd:hover { background: var(--ls-hover); }
.ls-cmd[aria-pressed='true'] { background: var(--ls-accent-soft); color: var(--ls-accent); box-shadow: inset 0 0 0 1px var(--ls-accent); }
.ls-cmd[aria-disabled='true'] { opacity: 0.42; cursor: not-allowed; }
.ls-cmd .ls-glyph { flex: none; color: var(--ls-muted); }
.ls-cmd:hover .ls-glyph, .ls-cmd[aria-pressed='true'] .ls-glyph { color: currentColor; }
.ls-cmd__chevron { font-size: 9px; color: var(--ls-subtle); }
/* The button itself is the circle on large and small buttons, so drop the glyph's own ring. */
.ls-cmd--large .ls-glyph circle, .ls-cmd--small .ls-glyph circle { display: none; }

/* Large: circular icon button over a label */
.ls-cmd--large {
  flex-direction: column; gap: 6px; padding: 2px 4px 4px; min-width: 64px; max-width: 92px;
  white-space: normal; text-align: center; line-height: 1.2; border-radius: var(--ls-radius-md);
  font-size: var(--ls-type-xs);
}
.ls-cmd--large:hover { background: transparent; }
.ls-cmd--large .ls-glyph {
  box-sizing: content-box; padding: 9px; border-radius: 50%; color: var(--ls-accent);
  background: var(--ls-raised); box-shadow: var(--ls-shadow-md);
  transition: transform var(--ls-motion) var(--ls-ease), box-shadow var(--ls-motion);
}
.ls-cmd--large:hover .ls-glyph { transform: translateY(-1px); box-shadow: var(--ls-shadow-lg); }
.ls-cmd--large[aria-pressed='true'] { background: transparent; box-shadow: none; }
.ls-cmd--large[aria-pressed='true'] .ls-glyph { background: var(--ls-accent); color: var(--ls-on-accent); }

/* Small: circular icon-only button in a recessed well */
.ls-cmd--small {
  padding: 4px; min-height: 0; border-radius: 50%; background: var(--ls-recess); box-shadow: var(--ls-shadow-inset);
}
.ls-cmd--small:hover { background: var(--ls-hover); }
.ls-cmd--small .ls-glyph { color: var(--ls-ink); }

/* Medium: chip */
.ls-cmd--medium { box-shadow: inset 0 0 0 1px var(--ls-hairline); }
.ls-cmd--medium:hover { box-shadow: inset 0 0 0 1px transparent; }

/* Rows: menus, backstage, phone sheet */
.ls-cmd--row { width: 100%; justify-content: flex-start; padding: 8px 12px; border-radius: var(--ls-radius-sm); }
.ls-cmd__where {
  margin-left: auto; font-family: var(--ls-font-mono); font-size: var(--ls-type-label);
  letter-spacing: var(--ls-type-track-wide); text-transform: uppercase; color: var(--ls-subtle);
}

/* Tablet: touch targets, one row, overflow menus */
[data-layout='tablet'] .ls-panel { min-height: 0; align-items: stretch; }
[data-layout='tablet'] .ls-cmd { min-height: var(--ls-touch); min-width: var(--ls-touch); padding-right: 12px; }
[data-layout='tablet'] .ls-group__body { align-items: center; }
[data-layout='tablet'] .ls-tab { min-height: var(--ls-touch); }
.ls-overflow { position: relative; }
.ls-overflow__toggle {
  list-style: none; cursor: pointer; display: grid; place-items: center;
  min-width: var(--ls-touch); min-height: var(--ls-touch); border-radius: 50%;
  color: var(--ls-muted); background: var(--ls-recess); box-shadow: var(--ls-shadow-inset);
}
.ls-overflow__toggle::-webkit-details-marker { display: none; }
.ls-overflow__toggle:hover { color: var(--ls-ink); }
.ls-overflow__menu {
  position: absolute; top: 100%; left: 0; z-index: 10; min-width: 220px; width: max-content; padding: 6px;
  background: var(--ls-raised); border: 1px solid var(--ls-hairline);
  border-radius: var(--ls-radius-md); box-shadow: var(--ls-shadow-lg);
}

/* Backstage (File) */
.ls-backstage {
  display: flex; flex-direction: column; gap: 8px; padding: 8px; min-width: 260px;
  background: var(--ls-surface); border-radius: var(--ls-radius-md); box-shadow: var(--ls-shadow-md);
}
.ls-backstage__section { display: flex; flex-direction: column; }
.ls-backstage__section + .ls-backstage__section { border-top: 1px solid var(--ls-hairline); padding-top: 8px; }

/* Phone: floating dock (Chapternal .desk-dock) + bottom sheet */
[data-layout='phone'] { position: relative; padding: 0 8px 8px; background: transparent; }
.ls-phonebar {
  display: flex; align-items: center; gap: 6px; padding: 6px;
  background: var(--ls-surface); border-radius: var(--ls-radius-md); box-shadow: var(--ls-shadow-lg);
}
.ls-picker-btn, .ls-sheet-toggle {
  min-height: var(--ls-touch); padding: 0 14px; border-radius: var(--ls-radius-pill);
  font-weight: 600; white-space: nowrap; background: var(--ls-selected); color: var(--ls-on-selected);
}
.ls-sheet-toggle { min-width: var(--ls-touch); padding: 0; background: var(--ls-recess); box-shadow: var(--ls-shadow-inset); }
.ls-strip { display: flex; gap: 4px; overflow-x: auto; flex: 1; scrollbar-width: none; }
.ls-strip .ls-cmd { min-width: var(--ls-touch); min-height: var(--ls-touch); justify-content: center; flex: none; }
.ls-picker, .ls-sheet {
  background: var(--ls-raised); border: 1px solid var(--ls-hairline); box-shadow: var(--ls-shadow-lg);
  border-radius: var(--ls-radius-xl); margin-bottom: 8px;
}
.ls-picker { display: flex; flex-direction: column; padding: 6px; max-height: 60vh; overflow-y: auto; }
.ls-picker__item { text-align: left; min-height: var(--ls-touch); padding: 0 16px; border-radius: var(--ls-radius-pill); }
.ls-picker__item[aria-selected='true'] { background: var(--ls-selected); color: var(--ls-on-selected); font-weight: 600; }
.ls-sheet { max-height: 55vh; overflow-y: auto; }
.ls-sheet--full { max-height: 85vh; }
.ls-sheet__content { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.ls-search {
  min-height: var(--ls-touch); padding: 0 16px; border-radius: var(--ls-radius-pill);
  border: 0; background: var(--ls-recess); box-shadow: var(--ls-shadow-inset);
}
.ls-search::placeholder { color: var(--ls-subtle); }
.ls-sheet__group {
  background: var(--ls-surface); border-radius: var(--ls-radius-md); box-shadow: var(--ls-shadow-sm); padding: 6px;
}
.ls-sheet__group-label {
  margin: 4px 8px 4px; font-family: var(--ls-font-mono); font-size: var(--ls-type-label); font-weight: 500;
  letter-spacing: var(--ls-type-track-label); text-transform: uppercase; color: var(--ls-subtle);
}
.ls-sheet__cmds .ls-cmd, .ls-results .ls-cmd { min-height: var(--ls-touch); }
.ls-subpage { padding: 12px; }
.ls-subpage__header { display: flex; align-items: center; gap: 8px; }
.ls-subpage__title { font-family: var(--ls-font-display); font-weight: 500; font-size: var(--ls-type-lg); margin: 0; }
.ls-back { min-height: var(--ls-touch); padding: 0 14px; border-radius: var(--ls-radius-pill); color: var(--ls-accent); font-weight: 600; background: var(--ls-recess); }
.ls-subpage__note { color: var(--ls-muted); }
`;
