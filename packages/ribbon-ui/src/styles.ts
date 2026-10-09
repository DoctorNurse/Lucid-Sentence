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
  position: relative;
  font-family: var(--ls-font-sans, ${shape.font});
  font-size: var(--ls-type-sm, ${shape.fontSize});
  line-height: 1.45;
  color: var(--ls-ink);
  --ls-motion: var(--ls-motion-quick, ${shape.motion});
  --ls-ease: var(--ls-motion-ease-out);
  --ls-btn: 30px;
}
@media (prefers-reduced-motion: reduce) {
  :host { --ls-motion: 0ms; }
  .ls-panel--enter, .ls-tab--appear, .ls-panel--peek, .ls-sheet, .ls-picker { animation: none !important; }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input, summary { font: inherit; color: inherit; }
button { background: none; border: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
button:focus-visible, summary:focus-visible, input:focus-visible {
  outline: 2px solid var(--ls-focus);
  outline-offset: 2px;
}
.ls-ribbon { background: var(--ls-canvas); padding: 8px 12px 10px; }

/* Tab row: a recessed segmented capsule (Chapternal .desk-pill) + pin button */
.ls-tabbar { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; }
.ls-ribbon[data-collapsed] .ls-tabbar { margin-bottom: 0; }
.ls-tabs {
  display: flex; gap: 2px; width: max-content; max-width: 100%; min-width: 0;
  overflow-x: auto; scrollbar-width: none; padding: 4px;
  background: var(--ls-recess); border-radius: var(--ls-radius-pill); box-shadow: var(--ls-shadow-inset);
}
.ls-tab {
  padding: 5px 14px; min-height: 30px; border-radius: var(--ls-radius-pill); white-space: nowrap;
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
  content: ''; display: inline-block; width: 6px; height: 6px; margin-inline-end: 6px; vertical-align: 1px;
  border-radius: 50%; background: var(--ls-accent);
}
.ls-tab--appear { animation: ls-appear var(--ls-motion-slow) var(--ls-ease) both; }
@keyframes ls-appear { from { opacity: 0; transform: translateY(-4px) scale(0.92); } to { opacity: 1; transform: none; } }
.ls-pin {
  display: grid; place-items: center; width: 32px; height: 32px; flex: none; margin-inline-start: auto;
  border-radius: 50%; color: var(--ls-muted);
}
.ls-pin:hover { background: var(--ls-hover); color: var(--ls-ink); }

/* Panel: a row of soft rounded group cards */
.ls-panel {
  display: flex; align-items: stretch; gap: 10px; overflow-x: auto; scrollbar-width: thin;
  padding: 2px 2px 6px; min-height: 116px;
}
.ls-panel--enter { animation: ls-enter var(--ls-motion-fast) var(--ls-ease) both; }
@keyframes ls-enter { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
.ls-panel--peek {
  position: absolute; z-index: 30; left: 12px; right: 12px; top: 52px;
  padding: 10px; background: var(--ls-canvas); border-radius: var(--ls-radius-lg); box-shadow: var(--ls-shadow-lg);
  animation: ls-enter var(--ls-motion-fast) var(--ls-ease) both;
}
.ls-group {
  display: flex; flex-direction: column; gap: 6px; flex: none;
  padding: 8px 8px 6px; background: var(--ls-surface);
  border-radius: var(--ls-radius-md); box-shadow: var(--ls-shadow-md);
}
.ls-group__body { display: flex; align-items: flex-start; gap: 4px; flex: 1; }
.ls-group__label {
  text-align: center; white-space: nowrap; padding-top: 2px; margin-top: auto;
  font-family: var(--ls-font-mono); font-size: var(--ls-type-label); font-weight: 500;
  letter-spacing: var(--ls-type-track-label); text-transform: uppercase; color: var(--ls-subtle);
}
.ls-stack { display: flex; flex-direction: column; gap: 3px; }
.ls-stack--small { gap: 2px; }

/* Commands */
.ls-cmd {
  position: relative; display: inline-flex; align-items: center; gap: 6px; border-radius: var(--ls-radius-pill);
  padding: 3px 10px 3px 6px; white-space: nowrap; color: var(--ls-ink); min-height: var(--ls-btn);
  transition: background var(--ls-motion) var(--ls-ease), color var(--ls-motion), box-shadow var(--ls-motion), transform var(--ls-motion);
}
.ls-cmd:hover { background: var(--ls-hover); }
.ls-cmd:active:not([aria-disabled='true']) { transform: scale(0.96); }
.ls-cmd[aria-pressed='true'] { background: var(--ls-accent-soft); color: var(--ls-accent); box-shadow: inset 0 0 0 1px var(--ls-accent); }
.ls-cmd[aria-disabled='true'] { opacity: 0.42; cursor: not-allowed; }
.ls-cmd--pending { cursor: help; }
.ls-cmd--pending .ls-glyph { opacity: 0.55; }
.ls-cmd--pending::after {
  content: ''; position: absolute; top: 3px; inset-inline-end: 3px; width: 5px; height: 5px;
  border-radius: 50%; background: var(--ls-subtle); opacity: 0.7;
}
.ls-cmd .ls-glyph { flex: none; color: var(--ls-muted); }
.ls-cmd:hover .ls-glyph, .ls-cmd[aria-pressed='true'] .ls-glyph { color: currentColor; }
.ls-cmd__chevron { display: inline-flex; color: var(--ls-subtle); }
.ls-chev { display: block; transition: transform var(--ls-motion) var(--ls-ease); }
.ls-chev--up { transform: rotate(180deg); }

/* Large: circular icon button over a label */
.ls-cmd--large {
  flex-direction: column; gap: 6px; padding: 2px 4px 4px; min-width: 64px; max-width: 92px;
  white-space: normal; text-align: center; line-height: 1.2; border-radius: var(--ls-radius-md);
  font-size: var(--ls-type-xs);
}
.ls-cmd--large:hover { background: transparent; }
.ls-cmd--large .ls-glyph {
  box-sizing: content-box; padding: 10px; border-radius: 50%; color: var(--ls-accent);
  background: var(--ls-raised); box-shadow: var(--ls-shadow-md);
  transition: transform var(--ls-motion) var(--ls-ease), box-shadow var(--ls-motion), background var(--ls-motion);
}
.ls-cmd--large:hover .ls-glyph { transform: translateY(-1px); box-shadow: var(--ls-shadow-lg); }
.ls-cmd--large[aria-pressed='true'] { background: transparent; box-shadow: none; }
.ls-cmd--large[aria-pressed='true'] .ls-glyph { background: var(--ls-accent); color: var(--ls-on-accent); }
.ls-cmd--large .ls-cmd__chevron { position: absolute; top: 30px; inset-inline-end: 6px; }
.ls-cmd--large.ls-cmd--pending::after { top: 4px; inset-inline-end: 12px; }

/* Small: circular icon-only button */
.ls-cmd--small {
  justify-content: center; width: var(--ls-btn); height: var(--ls-btn); padding: 0; min-height: 0; border-radius: 50%;
}
.ls-cmd--small .ls-glyph { color: var(--ls-ink); }
.ls-cmd--small .ls-cmd__chevron { position: absolute; bottom: -1px; inset-inline-end: -1px; transform: scale(0.75); }
.ls-cmd--small[aria-pressed='true'] .ls-glyph { color: var(--ls-accent); }

/* Medium: chip */
.ls-cmd--medium { box-shadow: inset 0 0 0 1px var(--ls-hairline); }
.ls-cmd--medium:hover { box-shadow: inset 0 0 0 1px transparent; }

/* Field: recessed pill showing a value (font name, size) */
.ls-cmd--field {
  justify-content: space-between; padding: 3px 8px 3px 12px; background: var(--ls-recess); box-shadow: var(--ls-shadow-inset);
}
.ls-cmd--field .ls-cmd__label { overflow: hidden; text-overflow: ellipsis; }
.ls-cmd--field:hover { background: var(--ls-recess); box-shadow: var(--ls-shadow-inset), inset 0 0 0 1px var(--ls-hairline); }
.ls-cmd--text.ls-cmd--large { min-height: 64px; justify-content: center; font-weight: 600; font-size: var(--ls-type-sm); }

/* Rows: menus, backstage, phone sheet */
.ls-cmd--row { width: 100%; justify-content: flex-start; padding: 8px 12px; border-radius: var(--ls-radius-sm); min-height: 36px; }
.ls-cmd__where {
  margin-inline-start: auto; font-family: var(--ls-font-mono); font-size: var(--ls-type-label);
  letter-spacing: var(--ls-type-track-wide); text-transform: uppercase; color: var(--ls-subtle);
}

/* Tooltip: name + shortcut (+ status) */
.ls-tip {
  position: fixed; z-index: 1000; pointer-events: none; max-width: 280px;
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px;
  padding: 6px 10px; border-radius: var(--ls-radius-sm);
  background: var(--ls-ink); color: var(--ls-canvas); box-shadow: var(--ls-shadow-lg);
  font-size: var(--ls-type-xs); animation: ls-enter var(--ls-motion-quick) var(--ls-ease) both;
}
.ls-tip strong { font-weight: 600; }
.ls-tip kbd {
  font-family: var(--ls-font-mono); font-size: var(--ls-type-label); letter-spacing: 0.04em;
  padding: 1px 6px; border-radius: var(--ls-radius-xs); background: color-mix(in srgb, var(--ls-canvas) 18%, transparent);
}
.ls-tip__note {
  flex-basis: 100%; font-family: var(--ls-font-mono); font-size: var(--ls-type-label);
  letter-spacing: var(--ls-type-track-wide); text-transform: uppercase; opacity: 0.8;
}

/* Tablet: near-desktop ribbon, 44 px targets, one row, overflow menus */
[data-layout='tablet'] { --ls-btn: var(--ls-touch); }
[data-layout='tablet'] .ls-panel { min-height: 0; align-items: stretch; }
[data-layout='tablet'] .ls-cmd { min-height: var(--ls-touch); min-width: var(--ls-touch); }
[data-layout='tablet'] .ls-cmd--medium { padding-inline-end: 12px; }
[data-layout='tablet'] .ls-group__body { align-items: center; }
[data-layout='tablet'] .ls-tab { min-height: 40px; padding-inline: 16px; }
[data-layout='tablet'] .ls-pin { width: var(--ls-touch); height: var(--ls-touch); }
.ls-overflow { position: relative; }
.ls-overflow__toggle {
  list-style: none; cursor: pointer; display: grid; place-items: center;
  min-width: var(--ls-touch); min-height: var(--ls-touch); border-radius: 50%;
  color: var(--ls-muted); background: var(--ls-recess); box-shadow: var(--ls-shadow-inset);
}
.ls-overflow__toggle::-webkit-details-marker { display: none; }
.ls-overflow__toggle:hover { color: var(--ls-ink); }
.ls-overflow[open] .ls-overflow__toggle { color: var(--ls-accent); }
.ls-overflow__menu {
  position: absolute; top: 100%; left: 0; z-index: 10; min-width: 240px; width: max-content; padding: 6px;
  background: var(--ls-raised); border: 1px solid var(--ls-hairline);
  border-radius: var(--ls-radius-md); box-shadow: var(--ls-shadow-lg);
  animation: ls-enter var(--ls-motion-quick) var(--ls-ease) both;
}
[data-layout='tablet'] .ls-overflow__menu .ls-cmd--row { min-height: var(--ls-touch); }

/* Backstage (File): rail + host-provided page */
.ls-panel--backstage { min-height: calc(100dvh - 140px); padding: 0; overflow: visible; }
.ls-backstage { display: flex; gap: 12px; width: 100%; align-items: stretch; }
.ls-backstage__rail {
  display: flex; flex-direction: column; gap: 6px; padding: 10px; width: 224px; flex: none;
  background: var(--ls-surface); border-radius: var(--ls-radius-lg); box-shadow: var(--ls-shadow-md);
}
.ls-backstage__back {
  display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; margin-bottom: 6px;
  border-radius: var(--ls-radius-pill); background: var(--ls-accent); color: var(--ls-on-accent); font-weight: 600;
}
.ls-backstage__section { display: flex; flex-direction: column; gap: 2px; }
.ls-backstage__section + .ls-backstage__section { border-top: 1px solid var(--ls-hairline); padding-top: 8px; margin-top: auto; }
.ls-backstage .ls-cmd--row[aria-current='page'] { background: var(--ls-selected); color: var(--ls-on-selected); font-weight: 600; }
.ls-backstage__pane {
  flex: 1; min-width: 0; padding: 24px 28px; background: var(--ls-surface);
  border-radius: var(--ls-radius-lg); box-shadow: var(--ls-shadow-md); overflow: auto;
  animation: ls-enter var(--ls-motion-fast) var(--ls-ease) both;
}

/* Phone: floating dock (Chapternal .desk-dock) + bottom sheet */
[data-layout='phone'] {
  position: relative; padding: 0 8px calc(8px + env(safe-area-inset-bottom, 0px));
  padding-inline: max(8px, env(safe-area-inset-left, 0px)); background: transparent; --ls-btn: var(--ls-touch);
}
.ls-phonebar {
  display: flex; align-items: center; gap: 6px; padding: 6px;
  background: var(--ls-surface); border-radius: var(--ls-radius-lg); box-shadow: var(--ls-shadow-lg);
}
.ls-picker-btn, .ls-sheet-toggle {
  display: inline-flex; align-items: center; gap: 4px;
  min-height: var(--ls-touch); padding: 0 14px; border-radius: var(--ls-radius-pill);
  font-weight: 600; white-space: nowrap; background: var(--ls-selected); color: var(--ls-on-selected); flex: none;
}
.ls-sheet-toggle { justify-content: center; min-width: var(--ls-touch); padding: 0; background: var(--ls-recess); box-shadow: var(--ls-shadow-inset); }
.ls-strip { display: flex; gap: 4px; overflow-x: auto; flex: 1; scrollbar-width: none; }
.ls-strip .ls-cmd { flex: none; }
.ls-picker, .ls-sheet {
  background: var(--ls-raised); border: 1px solid var(--ls-hairline); box-shadow: var(--ls-shadow-lg);
  border-radius: var(--ls-radius-xl); margin-bottom: 8px;
  animation: ls-sheet var(--ls-motion-fast) var(--ls-ease) both;
}
@keyframes ls-sheet { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.ls-picker { display: flex; flex-direction: column; padding: 6px; max-height: 60dvh; overflow-y: auto; }
.ls-picker__item { text-align: start; min-height: var(--ls-touch); padding: 0 16px; border-radius: var(--ls-radius-pill); }
.ls-picker__item[aria-selected='true'] { background: var(--ls-selected); color: var(--ls-on-selected); font-weight: 600; }
.ls-sheet { max-height: 58dvh; overflow-y: auto; overscroll-behavior: contain; }
.ls-sheet--full { max-height: 85dvh; }
.ls-handle {
  position: sticky; top: 0; z-index: 1; display: grid; place-items: center; width: 100%; height: 24px;
  background: var(--ls-raised); border-radius: var(--ls-radius-xl) var(--ls-radius-xl) 0 0; touch-action: none;
}
.ls-handle span { width: 40px; height: 5px; border-radius: 3px; background: var(--ls-hairline); box-shadow: inset 0 0 0 10px color-mix(in srgb, var(--ls-ink) 22%, transparent); }
.ls-sheet__content { display: flex; flex-direction: column; gap: 10px; padding: 4px 12px 12px; }
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
.ls-sheet .ls-cmd--pending::after { top: 50%; inset-inline-end: 12px; }
.ls-subpage { padding: 4px 12px 12px; }
.ls-subpage__header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ls-subpage__title { font-family: var(--ls-font-display); font-weight: 500; font-size: var(--ls-type-lg); margin: 0; }
.ls-back {
  display: inline-flex; align-items: center; gap: 4px;
  min-height: var(--ls-touch); padding: 0 14px; border-radius: var(--ls-radius-pill); color: var(--ls-accent); font-weight: 600; background: var(--ls-recess);
}
.ls-subpage__note { color: var(--ls-muted); }

@media (hover: none) {
  .ls-cmd:hover, .ls-tab:hover { background: none; }
  .ls-tab[aria-selected='true']:hover { background: var(--ls-selected); }
}
@media (forced-colors: active) {
  .ls-cmd[aria-pressed='true'] { outline: 2px solid Highlight; }
  .ls-tab[aria-selected='true'] { outline: 2px solid Highlight; }
}
`;
