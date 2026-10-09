# @lucid-sentence/tokens

Design tokens for Lucid Sentence: light (Chapternal "Paper"), dark (Chapternal
"Studio"), and high contrast. Exported as TypeScript objects and `--ls-*` CSS custom
properties, together with the bundled OFL UI fonts (Fraunces, Instrument Sans,
JetBrains Mono).

```ts
import { colors, themeDeclarations, themeStylesheet, installFonts } from '@lucid-sentence/tokens';
```

- `themeStylesheet()`: `:root` variables for `data-theme` = `auto | light | dark | high-contrast`
- `themeDeclarations(theme, accent?)`: declarations for a shadow root's `:host`
- `installFonts(document)`: `@font-face` rules for the bundled fonts (no network)
- `contrastReport(theme)`: the WCAG ratio for every text pair (the tests require at least 4.5:1)

For the source of each value and the contrast adjustments, see [docs/DESIGN.md](../../docs/DESIGN.md).
