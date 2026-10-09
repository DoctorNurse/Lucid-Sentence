# @lucid-sentence/ribbon-ui

A framework-light web component, `<ls-ribbon>`, that renders the ribbon from
`@lucid-sentence/commands` in three layouts:

- **desktop**: tab row + grouped ribbon (large / medium / small commands), File backstage
- **tablet**: single-row touch ribbon (44 px targets) that collapses lower-priority
  commands into per-group overflow menus as width shrinks
- **phone**: tab picker + quick strip + sheet toggle; bottom sheet with every group,
  "Find a command" search, and sub-pages for menus, galleries, and dialogs

```ts
import { defineRibbon } from '@lucid-sentence/ribbon-ui';
defineRibbon();
```

```html
<ls-ribbon layout="auto" theme="auto" contextual="table-design table-layout"></ls-ribbon>
```

It emits `ls-command` events (`{ id, kind, layout, pressed? }`); engine wiring
comes in M1.

Theme tokens (`--ls-*` custom properties) provide Light, Dark, and
High-contrast themes with a cyan accent matched to the app icon (not Word blue), 8–12 px radii, Inter
type, and motion that honors `prefers-reduced-motion`. Glyphs are original
placeholder line tiles; the final original icon set is tracked in the plan
(§4.7). No Microsoft or ONLYOFFICE artwork is used.
