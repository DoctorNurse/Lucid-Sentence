import { colors, type ColorTokens, type ThemeName } from './tokens.js';

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb color. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb color: ${hex}`);
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((x) => channel(parseInt(x, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two #rrggbb colors. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

type Key = keyof ColorTokens;

/** Text/background pairs that must meet WCAG AA (4.5:1) in every theme. */
export const TEXT_PAIRS: readonly [Key, Key][] = [
  ['ink', 'canvas'],
  ['ink', 'surface'],
  ['ink', 'raised'],
  ['ink', 'recess'],
  ['muted', 'canvas'],
  ['muted', 'surface'],
  ['muted', 'raised'],
  ['muted', 'recess'],
  ['subtle', 'canvas'],
  ['subtle', 'surface'],
  ['subtle', 'raised'],
  ['subtle', 'recess'],
  ['onSelected', 'selected'],
  ['accent', 'canvas'],
  ['accent', 'surface'],
  ['accent', 'raised'],
  ['onAccent', 'accent'],
  ['dangerText', 'surface'],
  ['dangerText', 'raised'],
  ['paperInk', 'paper'],
  ['paperDarkInk', 'paperDark'],
  ['rulerInk', 'ruler'],
];

export interface ContrastResult {
  theme: ThemeName;
  fg: Key;
  bg: Key;
  ratio: number;
}

export function contrastReport(theme: ThemeName): ContrastResult[] {
  const c = colors[theme];
  return TEXT_PAIRS.map(([fg, bg]) => ({ theme, fg, bg, ratio: contrast(c[fg], c[bg]) }));
}
