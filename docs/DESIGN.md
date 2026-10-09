# Lucid Sentence design system

Lucid Sentence's interface comes from **Chapternal**, another Lucid Systems app.
It uses Chapternal's token system, its warm "Paper" light theme, its "Studio" dark
theme, and the controls of its Desk: segmented pill capsules, soft rounded cards,
small uppercase mono labels, circular icon buttons, chips, and recessed wells.
Lucid Sentence keeps its own **Lucid cyan** as the primary accent.

Light mode is the main reference. Dark mode and high contrast are first-class.

- Tokens: [`packages/tokens`](../packages/tokens) (TypeScript export and CSS custom properties)
- Used by: `packages/ribbon-ui`, `packages/splash`, `apps/demo`
- Contrast tests: `packages/tokens/test/tokens.test.ts` (WCAG AA, 4.5:1 for every text pair)

## How to use the tokens

```ts
import { installFonts, themeStylesheet, colors } from '@lucid-sentence/tokens';

installFonts(document); // @font-face for the bundled fonts (must be in the document, not a shadow root)
const style = document.createElement('style');
style.textContent = themeStylesheet(); // --ls-* on :root, for data-theme = auto | light | dark | high-contrast
document.head.prepend(style);
```

Web components set `themeDeclarations(theme, accent?)` on `:host`. Every token
becomes `--ls-<kebab-name>`, for example `--ls-canvas`, `--ls-on-accent`,
`--ls-radius-pill`, `--ls-shadow-inset`, `--ls-font-display`, and `--ls-type-track-label`.
The older names (`--ls-chrome`, `--ls-text`, `--ls-text-muted`, `--ls-border`,
`--ls-accent-text`, `--ls-shadow`) remain as aliases.

## Where the values come from

Legend:

- **C**: taken unchanged from Chapternal.
- **C~**: a Chapternal value, adjusted for contrast. The original is listed.
- **L**: Lucid Sentence's own value.
- **S**: estimated from the Chapternal Desk light-mode screenshot that R H supplied.

Chapternal sources (public, fetched October 2026):

1. `https://chapternal.com/assets/styles-Dpnh3FY3.css`. Its `:root` block holds the
   Studio dark theme, plus radii, motion, fonts, the type scale, and button sizes. The
   `html:has(.ld[data-scheme=light])` block holds the landing page's light colors. Desk
   component rules come from the same file (`.desk-pill`, `.desk-tone-toggle`,
   `.desk-dock`, `.desk-slider-thumb`, `.desk-deleted-switch`).
2. Chapternal's app bundle (`js/bounce-faces-*.js`). Its theme presets are
   **Studio** (dark), **Paper** (light), and **Chapternal**.
3. The chapternal.com homepage, which loads Fraunces as its display serif.

### Surfaces and text

| Token      | Role                          | Light                     | Src | Dark                      | Src |
| ---------- | ----------------------------- | ------------------------- | --- | ------------------------- | --- |
| `canvas`   | App background ("Page")       | `#efe8dc`                 | C   | `#0a0a0a`                 | C   |
| `surface`  | Panels, group cards ("Panel") | `#f6f1e8`                 | C   | `#171717`                 | C   |
| `raised`   | Popovers, sheets ("Raised")   | `#fffaf2`                 | C   | `#1c1c1c`                 | C   |
| `recess`   | Tab capsule, inputs, wells    | `#e6dfd2`                 | L/S | `#141413`                 | L   |
| `hairline` | 1 px rules, chip outlines     | `rgb(26 25 22 / 12%)`     | C   | `rgb(232 230 225 / 10%)`  | C   |
| `hover`    | Hover wash                    | ink at 6%                 | C   | ink at 6%                 | C   |
| `selected` | Selected pill segment         | `#d5cfc4`                 | C/S | `#2b2a28`                 | C   |
| `ink`      | Primary text                  | `#1a1916`                 | C   | `#e8e6e1`                 | C   |
| `muted`    | Secondary text                | `#5c574e`                 | C   | `#9a968e`                 | C   |
| `subtle`   | Quiet text, uppercase labels  | `#645f56` (was `#7a7468`) | C~  | `#8a867e` (was `#6f6c66`) | C~  |

Notes on the derived values:

- In the screenshot, the light canvas reads about `#efebe4`. The Paper preset's
  `#efe8dc` is used because it is the value Chapternal ships.
- `recess` and `selected` are not separate Chapternal tokens. Chapternal draws them
  with `color-mix(in srgb, var(--color-foreground) 4–12%, transparent)` washes
  (`.desk-pill`, `.desk-tone-toggle`). These are those washes resolved to solid
  colors and checked against the screenshot's darker filled pill.

### Accent, status, brand

| Token                     | Light                         | Src | Dark      | Src |
| ------------------------- | ----------------------------- | --- | --------- | --- |
| `accent` (Lucid cyan)     | `#0a6a7c` (was `#0b7488`)     | L   | `#45c3d6` | L   |
| `onAccent`                | `#ffffff`                     | L   | `#06232a` | L   |
| `accentSoft`              | `#d6ebee`                     | L   | `#13353b` | L   |
| `focus`                   | = accent                      | L   | = accent  | L   |
| `glow`                    | `#2ecbff`                     | C   | `#7fd4d4` | C   |
| `ok`                      | `#3f7a4b` (was `#84c08f`)     | C~  | `#84c08f` | C   |
| `warn`                    | `#8a6a2e` (was `#c4a574`)     | C~  | `#c4a574` | C   |
| `danger` (decorative)     | `#c17a6e`                     | C   | `#c17a6e` | C   |
| `dangerText`              | `#9c4f43`                     | C~  | `#d08a7e` | C~  |
| `logoA / logoMid / logoB` | `#2ecbff` `#7b8cff` `#e879f9` | C   | same      | C   |

Chapternal's own accent is warm ink in Paper (`#1a1916`) and gold in Studio (`#cbbf9e`).
Lucid Sentence uses cyan instead, so the two apps feel related but stay distinct, and
neither uses Word blue. The Chapternal logo gradient (`logoA → logoMid → logoB`) is
kept for brand moments, such as the comment avatar in the demo.

### Shape, type, motion

| Token group | Values                                                                                       | Src |
| ----------- | -------------------------------------------------------------------------------------------- | --- |
| Radii       | xs 4, sm 8, md 14, lg 16, xl 24, pill 999 (px)                                               | C   |
| Spacing     | 4 px base (`--spacing: .25rem`); buttons 10 × 14 px                                          | C   |
| Motion      | micro 80 ms, quick 150 ms, fast 250 ms, slow 400 ms                                          | C   |
| Easing      | out `cubic-bezier(.23,1,.32,1)`, smooth `cubic-bezier(.22,1,.36,1)`                          | C   |
| Fonts       | sans **Instrument Sans**, display **Fraunces**, mono **JetBrains Mono**                      | C   |
| Type sizes  | xs 12, sm 13 (UI body), base 14, lg 18, xl 20, display 24 (px)                               | C/L |
| Labels      | mono, 10.5 px, uppercase, tracking .12em (Chapternal uses .08em to .14em)                    | C   |
| Shadows     | light: inset hairline + `0 6px 14px -10px` ink 45%; dark: `0 12px 28px -16px #000` + 8% ring | C   |
| Touch       | 44 px minimum on tablet and phone                                                            | L   |

Chapternal's `--font-display` names Spectral first, but its pages load and display
Fraunces, so Lucid Sentence uses Fraunces. Fraunces is for display only: the app name,
sub-page titles, and the splash.

## Component language

| Element         | Treatment                                                                                | Chapternal origin                 |
| --------------- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| Ribbon tabs     | One recessed pill capsule; the selected tab is a darker filled pill; File is a cyan pill | `.desk-pill`                      |
| Ribbon groups   | Separate soft rounded cards (`surface`, radius 14, `shadow-md`)                          | `.desk-dock`, panels              |
| Group labels    | Mono, uppercase, letter-spaced, `subtle`                                                 | `.desk-tone-toggle`, status chips |
| Large commands  | Circular raised icon button over the label                                               | Desk round controls               |
| Small commands  | Circular icon button in a recessed well                                                  | Desk transport buttons            |
| Medium commands | Pill chips with a hairline outline                                                       | `.desk-tone-toggle`               |
| Toggled on      | `accentSoft` wash, cyan ring and text                                                    | n/a (Lucid)                       |
| Phone bar       | Floating dock card; tab picker is a filled pill                                          | `.desk-dock`                      |
| Search, selects | Recessed pills with an inner shadow                                                      | wells                             |
| Status bar      | Mono, uppercase, letter-spaced                                                           | Desk status rows                  |
| Menus, popovers | `surface` cards, radius 14, `shadow-lg`; on phone they open as bottom sheets             | panels                            |
| Command search  | Centered dialog with a recessed search pill and ranked results                           | wells                             |
| Backstage       | Full-window panel with a dark nav rail and card content                                  | n/a (Lucid)                       |
| Pen toolbar     | Floating, draggable pill with tool buttons, color dots, sizes, and favorites             | `.desk-dock`                      |
| Notes timeline  | Transport row with a mono time readout and cyan marks for each stroke or paragraph       | Chapternal player timeline        |

All icons are Lucide (ISC; some derived from Feather, MIT), drawn at a 1.75 px stroke.
Every ribbon command has an icon except a few that render as text fields or text
buttons (`TEXT_ONLY`); `packages/ribbon-ui/src/icon-map.ts` maps command ids to icons and `packages/ribbon-ui/test/icons.test.ts` checks the coverage.

## Document page view

The page view uses Letter (8.5 × 11 in, 816 × 1056 px at 96 dpi) or A4 (210 × 297 mm),
with Word's default margins (1 in or 2.54 cm). The canvas around the page is warm
(`pageCanvas`). The rulers match the page size and have margin markers, and they count
from the margin as Word's do. On narrow screens the page and rulers scale down together.

- **Pages are white by default in every theme, including dark.** This is for print
  fidelity: what you see is what prints and what other Word users see. In dark mode the
  canvas and chrome go dark. **Page → Dark** is an optional view-only preference
  (`paperDark` / `paperDarkInk`). It never changes the document or its saved colors.
- **UI fonts never touch document text.** Fraunces, Instrument Sans, and JetBrains Mono
  are for chrome only. A document's text always uses the fonts the .docx defines (theme
  fonts and styles), substituted metric-compatibly where needed by the engine. The demo
  page stands in with common system document fonts (Aptos, Carlito, Calibri).
- Comment anchors, margin pins, and balloons are UI overlays drawn on top of the page.
  They are not document formatting.

## Contrast (WCAG 2.2 AA)

Every text pair in `TEXT_PAIRS` is tested at 4.5:1 or better, in all three themes.

| Pair                     | Light | Dark  |
| ------------------------ | ----- | ----- |
| ink on canvas            | 14.44 | 15.87 |
| muted on canvas          | 5.89  | 6.72  |
| muted on recess          | 5.41  | 6.26  |
| subtle on canvas         | 5.21  | 5.46  |
| subtle on recess (worst) | 4.78  | 5.08  |
| subtle on raised         | 6.10  | 4.70  |
| onSelected on selected   | 11.34 | 11.50 |
| accent on canvas         | 5.12  | 9.46  |
| onAccent on accent       | 6.24  | 7.83  |
| dangerText on surface    | 5.17  | 6.50  |
| paperInk on paper        | 17.58 | 17.58 |
| rulerInk on ruler        | 6.37  | 6.08  |

Adjustments made to reach AA:

| Token               | Chapternal value      | Ratio (fails)  | Lucid value           | Ratio                       |
| ------------------- | --------------------- | -------------- | --------------------- | --------------------------- |
| light `subtle`      | `#7a7468`             | 3.81 on canvas | `#645f56`             | 5.21 / 4.78 recess          |
| dark `subtle`       | `#6f6c66`             | 3.78 on canvas | `#8a867e`             | 5.46 / 4.70 raised          |
| light `accent`      | `#0b7488` (Lucid)     | 4.46 on canvas | `#0a6a7c`             | 5.12                        |
| light `dangerText`  | `#c17a6e`             | 2.75 on canvas | `#9c4f43`             | 5.17 surface                |
| light `ok` / `warn` | `#84c08f` / `#c4a574` | under 2.5      | `#3f7a4b` / `#8a6a2e` | darkened for light surfaces |

Disabled commands (42% opacity) are exempt under WCAG 1.4.3 (inactive components).
High contrast is pure black and white with a `#ffd400` accent (14.67:1). It is
selected by `theme="high-contrast"` or by OS "more contrast" when the theme is auto.

## Fonts

All three fonts are bundled in [`packages/tokens/fonts`](../packages/tokens/fonts). They
are never loaded from the network.

| Family          | File                            | License     | Source                                |
| --------------- | ------------------------------- | ----------- | ------------------------------------- |
| Fraunces        | `Fraunces-Variable.woff2`       | SIL OFL 1.1 | github.com/undercasetype/Fraunces     |
| Instrument Sans | `InstrumentSans-Variable.woff2` | SIL OFL 1.1 | github.com/Instrument/instrument-sans |
| JetBrains Mono  | `JetBrainsMono-Variable.woff2`  | SIL OFL 1.1 | github.com/JetBrains/JetBrainsMono    |

Each file is a variable WOFF2 subset to Latin and Latin-1, with common punctuation,
arrows, and symbols. Only the upright styles are bundled. The license text for each
font sits next to it (`*-OFL.txt`). None of these fonts declares a Reserved Font Name,
so the subsets keep their original family names.

Instrument Sans and JetBrains Mono are Chapternal's actual UI fonts. Lucid Sentence uses
them instead of the Inter and system mono originally suggested, to stay closest to the
source design. Both are OFL, just like Inter.
