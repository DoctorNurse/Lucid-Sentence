/**
 * Ribbon theme tokens. The source of truth is @lucid-sentence/tokens (Chapternal
 * lineage; see docs/DESIGN.md). This module keeps the earlier ribbon-ui API
 * (`themes`, `shape`, `themeDeclarations`) as a thin view over that package.
 */
import {
  colors,
  fonts,
  motion,
  radii,
  shadows,
  themeDeclarations,
  touchTarget,
  type,
  type ThemeName,
} from '@lucid-sentence/tokens';

export { themeDeclarations, type ThemeName };

/** Legacy flat view of a theme (prefer `colors` from @lucid-sentence/tokens). */
export interface ThemeTokens {
  chrome: string;
  surface: string;
  raised: string;
  text: string;
  textMuted: string;
  border: string;
  hover: string;
  /** Lucid cyan. Light #0a6a7c (AA as text and with white text), dark #45c3d6. */
  accent: string;
  accentText: string;
  accentSoft: string;
  shadow: string;
  focus: string;
}

const view = (name: ThemeName): ThemeTokens => {
  const c = colors[name];
  return {
    chrome: c.canvas,
    surface: c.surface,
    raised: c.raised,
    text: c.ink,
    textMuted: c.muted,
    border: c.hairline,
    hover: c.hover,
    accent: c.accent,
    accentText: c.onAccent,
    accentSoft: c.accentSoft,
    shadow: shadows[name].md,
    focus: c.focus,
  };
};

export const themes: Record<ThemeName, ThemeTokens> = {
  light: view('light'),
  dark: view('dark'),
  'high-contrast': view('high-contrast'),
};

/** Non-color tokens shared by all themes. */
export const shape = {
  font: fonts.sans,
  fontMono: fonts.mono,
  fontDisplay: fonts.display,
  fontSize: type.sm,
  radiusSm: radii.sm,
  radiusLg: radii.md,
  motion: motion.quick,
  /** Minimum touch target on tablet and phone (plan §4.6). */
  touchTarget,
} as const;
