/**
 * Lucid Sentence design tokens.
 *
 * Lineage: Chapternal's token system (with R H's permission). Chapternal groups
 * its tokens as Surfaces (Page, Panel, Raised, Hairline), Type (Primary,
 * Secondary, Quiet), Accent (Accent, On accent, Focus ring), and Status (Good,
 * Warn, Danger), and ships "Studio" (dark) and "Paper" (light) presets.
 * Lucid Sentence keeps those roles and neutrals, uses its own cyan as the
 * primary accent, and adds document-view tokens (page canvas, paper, ruler).
 *
 * Every value notes where it came from:
 * - [C] taken unchanged from chapternal.com (stylesheet or app bundle; see docs/DESIGN.md)
 * - [C~] Chapternal value adjusted to meet WCAG AA (the original is in the note)
 * - [L] Lucid Sentence's own value
 * - [S] derived from the Chapternal Desk light-mode screenshot
 */

export type ThemeName = 'light' | 'dark' | 'high-contrast';

export interface ColorTokens {
  /** App background, behind everything ("Page" in Chapternal). */
  canvas: string;
  /** Panels and ribbon group cards ("Panel"). */
  surface: string;
  /** Popovers, sheets, menus ("Raised"). */
  raised: string;
  /** Recessed wells: the tab capsule, inputs. */
  recess: string;
  /** Primary text ("Primary"). */
  ink: string;
  /** Secondary text ("Secondary"). */
  muted: string;
  /** Quiet text: small uppercase labels ("Quiet"). */
  subtle: string;
  /** 1px separators and chip outlines ("Hairline"). */
  hairline: string;
  /** Hover wash. */
  hover: string;
  /** Selected segment of a segmented control (darker filled pill). */
  selected: string;
  /** Text on `selected`. */
  onSelected: string;
  /** Primary accent: Lucid cyan. Used for fills and for text/links. */
  accent: string;
  /** Text and icons on `accent`. */
  onAccent: string;
  /** Tinted wash for toggled-on states. */
  accentSoft: string;
  /** Focus ring. */
  focus: string;
  /** Glow color (slider knobs, live indicators). */
  glow: string;
  /** Status: good. */
  ok: string;
  /** Status: warn. */
  warn: string;
  /** Status: danger, decorative (borders, dots). */
  danger: string;
  /** Status: danger as text (AA on surfaces). */
  dangerText: string;
  /** Brand gradient stops shared with Chapternal's logo. */
  logoA: string;
  logoMid: string;
  logoB: string;
  /** Document view: the area around pages. */
  pageCanvas: string;
  /** Document view: paper color of a page in "white page" mode. */
  paper: string;
  /** Document view: default ink on the paper (only where the document doesn't set one). */
  paperInk: string;
  /** Document view: paper and ink in "dark page" mode. */
  paperDark: string;
  paperDarkInk: string;
  /** Rulers. */
  ruler: string;
  rulerInk: string;
  /** Margin area on rulers. */
  rulerMargin: string;
}

export interface ShadowTokens {
  sm: string;
  md: string;
  lg: string;
  /** Inner shadow for recessed wells. */
  inset: string;
  /** Page shadow in the document view. */
  page: string;
}

export const colors: Record<ThemeName, ColorTokens> = {
  light: {
    canvas: '#efe8dc', // [C] Paper preset background (screenshot reads ~#efebe4) [S]
    surface: '#f6f1e8', // [C] Paper preset surface
    raised: '#fffaf2', // [C] Paper preset elevated
    recess: '#e6dfd2', // [L] canvas mixed 6% toward ink (Chapternal .desk-pill: foreground 7–12% wash) [C~]
    ink: '#1a1916', // [C] Paper preset foreground
    muted: '#5c574e', // [C] Paper preset muted
    subtle: '#645f56', // [C~] Paper "subtle" #7a7468 (3.8:1) darkened to pass AA on recess
    hairline: 'rgb(26 25 22 / 12%)', // [C] landing light border #1a19161f
    hover: 'rgb(26 25 22 / 6%)', // [C] .desk-tone-toggle wash (foreground 4–6%)
    selected: '#d5cfc4', // [C] .desk-pill [aria-selected] = foreground ~9–12% over canvas
    onSelected: '#1a1916', // [C]
    accent: '#0a6a7c', // [L] Lucid cyan; #0b7488 darkened so it also passes AA as text on canvas
    onAccent: '#ffffff', // [L]
    accentSoft: '#d6ebee', // [L]
    focus: '#0a6a7c', // [L] (Chapternal ring = accent)
    glow: '#2ecbff', // [C] --color-logo-a / --color-stage-cyan
    ok: '#3f7a4b', // [C~] #84c08f darkened for light surfaces
    warn: '#8a6a2e', // [C~] #c4a574 darkened for light surfaces
    danger: '#c17a6e', // [C] --color-danger (muted rose)
    dangerText: '#9c4f43', // [C~] rose darkened for AA text
    logoA: '#2ecbff', // [C]
    logoMid: '#7b8cff', // [C]
    logoB: '#e879f9', // [C]
    pageCanvas: '#e7e0d3', // [L] canvas, one step deeper, so white pages lift off it
    paper: '#ffffff', // [L] print fidelity: pages are white by default
    paperInk: '#1a1916', // [C] stage ink
    paperDark: '#1c1c1c', // [C] Studio elevated
    paperDarkInk: '#e8e6e1', // [C] Studio foreground
    ruler: '#f6f1e8', // [C] surface
    rulerInk: '#5c574e', // [C] muted
    rulerMargin: '#e6dfd2', // [L] = recess
  },
  dark: {
    canvas: '#0a0a0a', // [C] Studio background
    surface: '#171717', // [C] Studio surface
    raised: '#1c1c1c', // [C] Studio elevated
    recess: '#141413', // [L] canvas + 4% ink
    ink: '#e8e6e1', // [C] Studio foreground
    muted: '#9a968e', // [C] Studio muted
    subtle: '#8a867e', // [C~] Studio "subtle" #6f6c66 (3.8:1) lightened for AA
    hairline: 'rgb(232 230 225 / 10%)', // [C] --color-border #e8e6e11a
    hover: 'rgb(232 230 225 / 6%)', // [C] .desk-tone-toggle wash
    selected: '#2b2a28', // [C] .desk-pill [aria-selected] #e8e6e117 over surface
    onSelected: '#e8e6e1', // [C]
    accent: '#45c3d6', // [L] Lucid cyan (dark)
    onAccent: '#06232a', // [L]
    accentSoft: '#13353b', // [L]
    focus: '#45c3d6', // [L]
    glow: '#7fd4d4', // [C] --color-spoke fallback (slider knob glow)
    ok: '#84c08f', // [C]
    warn: '#c4a574', // [C]
    danger: '#c17a6e', // [C]
    dangerText: '#d08a7e', // [C~] slightly lifted for AA on raised
    logoA: '#2ecbff', // [C]
    logoMid: '#7b8cff', // [C]
    logoB: '#e879f9', // [C]
    pageCanvas: '#121212', // [L]
    paper: '#ffffff', // [L] white page by default, even in dark mode (print fidelity)
    paperInk: '#1a1916', // [C]
    paperDark: '#1c1c1c', // [C] Studio elevated, for the optional dark page
    paperDarkInk: '#e8e6e1', // [C]
    ruler: '#171717', // [C] surface
    rulerInk: '#9a968e', // [C] muted
    rulerMargin: '#0f0f0f', // [L]
  },
  'high-contrast': {
    canvas: '#000000',
    surface: '#000000',
    raised: '#000000',
    recess: '#000000',
    ink: '#ffffff',
    muted: '#ffffff',
    subtle: '#ffffff',
    hairline: '#ffffff',
    hover: '#1f1f1f',
    selected: '#ffffff',
    onSelected: '#000000',
    accent: '#ffd400',
    onAccent: '#000000',
    accentSoft: '#3a3000',
    focus: '#ffd400',
    glow: '#ffd400',
    ok: '#7dff8a',
    warn: '#ffd400',
    danger: '#ff8a7a',
    dangerText: '#ff8a7a',
    logoA: '#ffffff',
    logoMid: '#ffffff',
    logoB: '#ffffff',
    pageCanvas: '#000000',
    paper: '#ffffff',
    paperInk: '#000000',
    paperDark: '#000000',
    paperDarkInk: '#ffffff',
    ruler: '#000000',
    rulerInk: '#ffffff',
    rulerMargin: '#1f1f1f',
  },
};

export const shadows: Record<ThemeName, ShadowTokens> = {
  light: {
    // [C] light-tone buttons: inset hairline + 0 6px 14px -10px ink 45%
    sm: '0 1px 2px -1px rgb(26 25 22 / 28%)',
    md: '0 1px 0 rgb(255 255 255 / 60%) inset, 0 6px 14px -10px rgb(26 25 22 / 45%), 0 0 0 1px rgb(26 25 22 / 6%)',
    lg: '0 18px 40px -20px rgb(26 25 22 / 45%), 0 0 0 1px rgb(26 25 22 / 6%)',
    inset: 'inset 0 1px 2px rgb(26 25 22 / 12%), inset 0 0 0 1px rgb(26 25 22 / 6%)',
    page: '0 1px 2px rgb(26 25 22 / 10%), 0 12px 32px -12px rgb(26 25 22 / 28%)',
  },
  dark: {
    // [C] 0 12px 28px -16px #000; inset 0 0 0 1px #cbbf9e33; --shadow-border #eee8df14
    sm: '0 0 0 1px rgb(238 232 223 / 8%)',
    md: '0 0 0 1px rgb(238 232 223 / 8%), 0 12px 28px -16px #000',
    lg: '0 0 0 1px rgb(238 232 223 / 10%), 0 24px 48px -20px #000',
    inset: 'inset 0 1px 2px rgb(0 0 0 / 60%), inset 0 0 0 1px rgb(232 230 225 / 6%)',
    page: '0 0 0 1px rgb(238 232 223 / 6%), 0 16px 40px -16px #000',
  },
  'high-contrast': {
    sm: '0 0 0 1px #ffffff',
    md: '0 0 0 1px #ffffff',
    lg: '0 0 0 2px #ffffff',
    inset: 'inset 0 0 0 1px #ffffff',
    page: '0 0 0 2px #ffffff',
  },
};

/** [C] Chapternal --radius-* (xs 4, sm 8, md 14, lg 16, xl 24) and --btn-radius-pill 999. */
export const radii = {
  xs: '4px',
  sm: '8px',
  md: '14px',
  lg: '16px',
  xl: '24px',
  pill: '999px',
} as const;

/** [C] Chapternal --spacing .25rem scale and --btn-* paddings. */
export const space = {
  hair: '2px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
} as const;

/**
 * Fonts. [C] Chapternal: --font-sans "Instrument Sans", --font-mono "JetBrains Mono",
 * display serif Fraunces (loaded on chapternal.com; its --font-display lists Spectral).
 * All three are SIL OFL 1.1 and bundled in packages/tokens/fonts (no network).
 * UI chrome only: document text always uses the document's own fonts.
 */
export const fonts = {
  sans: "'Instrument Sans', 'Source Sans 3', 'Segoe UI', system-ui, -apple-system, sans-serif",
  display: "'Fraunces', 'Spectral', 'Source Serif 4', Georgia, serif",
  mono: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
} as const;

/** [C] Chapternal type scale (--text-xs .75rem … ) plus small mono labels (9–11px). */
export const type = {
  label: '10.5px', // uppercase mono labels (Chapternal .desk-tone-toggle .6875rem, chips 9–11px)
  xs: '12px',
  sm: '13px', // UI body
  base: '14px',
  lg: '18px',
  xl: '20px',
  display: '24px',
  /** [C] label tracking: .08em (toggles, chips) to .14em (status chips). */
  trackLabel: '0.12em',
  trackWide: '0.08em',
  trackTight: '-0.01em',
} as const;

/** [C] Chapternal --motion-* and --ease-*. */
export const motion = {
  micro: '80ms',
  quick: '150ms',
  fast: '250ms',
  slow: '400ms',
  easeOut: 'cubic-bezier(.23, 1, .32, 1)',
  easeInOut: 'cubic-bezier(.4, 0, .2, 1)',
  easeSmooth: 'cubic-bezier(.22, 1, .36, 1)',
} as const;

/** Minimum touch target on tablet and phone (plan §4.6). */
export const touchTarget = '44px';
