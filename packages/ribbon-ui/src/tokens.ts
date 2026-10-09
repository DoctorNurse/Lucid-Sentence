/**
 * Theme tokens (plan §4.7): Inter type, 8–12 px radii, a soft elevated ribbon,
 * quiet group labels, and a distinctive accent that is not Word blue.
 * Light, Dark, and High-contrast; "auto" follows the OS.
 */

export type ThemeName = 'light' | 'dark' | 'high-contrast';

export interface ThemeTokens {
  /** App chrome behind the ribbon. */
  chrome: string;
  /** Ribbon surface. */
  surface: string;
  /** Raised elements (sheets, popovers). */
  raised: string;
  text: string;
  textMuted: string;
  border: string;
  hover: string;
  /** Accent: "Lucid teal". User-selectable accents override this. */
  accent: string;
  accentText: string;
  accentSoft: string;
  shadow: string;
  focus: string;
}

export const themes: Record<ThemeName, ThemeTokens> = {
  light: {
    chrome: '#f4f5f2',
    surface: '#ffffff',
    raised: '#ffffff',
    text: '#1d2220',
    textMuted: '#69716d',
    border: '#e2e5e1',
    hover: '#eef2ef',
    accent: '#0e8a74',
    accentText: '#ffffff',
    accentSoft: '#dcf1eb',
    shadow: '0 1px 2px rgb(16 24 20 / 6%), 0 4px 16px rgb(16 24 20 / 6%)',
    focus: '#0e8a74',
  },
  dark: {
    chrome: '#141716',
    surface: '#1d211f',
    raised: '#252a28',
    text: '#e9ecea',
    textMuted: '#9aa29e',
    border: '#2f3532',
    hover: '#2a302d',
    accent: '#3cc7a8',
    accentText: '#06231c',
    accentSoft: '#173a32',
    shadow: '0 1px 2px rgb(0 0 0 / 40%), 0 6px 20px rgb(0 0 0 / 35%)',
    focus: '#3cc7a8',
  },
  'high-contrast': {
    chrome: '#000000',
    surface: '#000000',
    raised: '#000000',
    text: '#ffffff',
    textMuted: '#ffffff',
    border: '#ffffff',
    hover: '#1f1f1f',
    accent: '#ffd400',
    accentText: '#000000',
    accentSoft: '#3a3000',
    shadow: 'none',
    focus: '#ffd400',
  },
};

/** Non-color tokens shared by all themes. */
export const shape = {
  font: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  fontSize: '13px',
  radiusSm: '8px',
  radiusLg: '12px',
  motion: '140ms',
  /** Minimum touch target on tablet and phone (plan §4.6). */
  touchTarget: '44px',
} as const;

const KEBAB = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** CSS custom-property declarations for a theme, e.g. `--ls-accent: #0e8a74;`. */
export function themeDeclarations(name: ThemeName, accent?: string): string {
  const t = { ...themes[name], ...(accent ? { accent, focus: accent } : {}) };
  return Object.entries(t)
    .map(([k, v]) => `--ls-${KEBAB(k)}: ${v};`)
    .join(' ');
}
