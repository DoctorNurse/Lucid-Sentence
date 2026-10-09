import {
  colors,
  fonts,
  motion,
  radii,
  shadows,
  space,
  touchTarget,
  type,
  type ThemeName,
} from './tokens.js';

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/**
 * CSS custom-property declarations for a theme: `--ls-<token>: value;`.
 * Includes legacy aliases used by earlier components (--ls-chrome, --ls-text, …).
 */
export function themeDeclarations(name: ThemeName, accent?: string): string {
  const c = { ...colors[name], ...(accent ? { accent, focus: accent } : {}) };
  const s = shadows[name];
  const decl: [string, string][] = [
    ...Object.entries(c).map(([k, v]) => [kebab(k), v] as [string, string]),
    ...Object.entries(s).map(([k, v]) => [`shadow-${k}`, v] as [string, string]),
    ...Object.entries(radii).map(([k, v]) => [`radius-${k}`, v] as [string, string]),
    ...Object.entries(space).map(([k, v]) => [`space-${k}`, v] as [string, string]),
    ...Object.entries(fonts).map(([k, v]) => [`font-${k}`, v] as [string, string]),
    ...Object.entries(type).map(([k, v]) => [`type-${kebab(k)}`, v] as [string, string]),
    ...Object.entries(motion).map(([k, v]) => [`motion-${kebab(k)}`, v] as [string, string]),
    ['touch', touchTarget],
    // Legacy aliases (pre-token-package names).
    ['chrome', c.canvas],
    ['text', c.ink],
    ['text-muted', c.muted],
    ['border', c.hairline],
    ['accent-text', c.onAccent],
    ['shadow', s.md],
  ];
  return decl.map(([k, v]) => `--ls-${k}: ${v};`).join(' ');
}

/**
 * Document-level stylesheet: theme variables on :root for `data-theme`
 * (light | dark | high-contrast | auto), following the OS when auto.
 */
export function themeStylesheet(): string {
  return [
    `:root, :root[data-theme='light'] { color-scheme: light; ${themeDeclarations('light')} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']):not([data-theme='high-contrast']) { color-scheme: dark; ${themeDeclarations('dark')} } }`,
    `@media (prefers-contrast: more) { :root:not([data-theme='light']):not([data-theme='dark']) { ${themeDeclarations('high-contrast')} } }`,
    `:root[data-theme='dark'] { color-scheme: dark; ${themeDeclarations('dark')} }`,
    `:root[data-theme='high-contrast'] { color-scheme: dark; ${themeDeclarations('high-contrast')} }`,
  ].join('\n');
}
