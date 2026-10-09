# @lucid-sentence/commands

The **single command registry** for Lucid Sentence: tab → group → command for
all eleven Word tabs (File through Help) plus the contextual tabs (Table Design,
Table Layout, Picture Format, Shape Format, Header & Footer, Equation).

Every command has three placements, generated from one definition:

- `desktop.size`: `large` | `medium` | `small`
- `tablet.priority`: `1` (stays visible) | `2` (collapses when narrow) | `3` (group overflow)
- `phone.strip` / `phone.subPage`: in the tab's quick strip; opens a sub-page in the sheet

Each group also carries the ONLYOFFICE **coverage** status from plan §4.8
(`verified`, `ui-only`, `unverified`, `gap`, `shell`, `stub`), which M0 refines
against sdkjs.

```ts
import { registry, allCommands, searchCommands, validateRegistry } from '@lucid-sentence/commands';

validateRegistry(registry); // [] — CI fails on any problem
```

**Build rule (plan §4.6):** `validateRegistry` and the tests fail if any command
lacks a desktop, tablet, or phone placement, if ids collide, or if a phone
command needs more than 3 taps.
