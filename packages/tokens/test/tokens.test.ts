import { describe, expect, it } from 'vitest';
import {
  colors,
  contrast,
  contrastReport,
  fontFaceCss,
  installFonts,
  themeDeclarations,
  themeStylesheet,
  type ThemeName,
} from '../src/index.js';

const THEMES: ThemeName[] = ['light', 'dark', 'high-contrast'];

describe('WCAG AA contrast for text tokens', () => {
  it.each(THEMES.flatMap((t) => contrastReport(t).map((r) => [t, r.fg, r.bg, r.ratio] as const)))(
    '%s: %s on %s (%f:1) is at least 4.5:1',
    (_t, _fg, _bg, ratio) => {
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('computes known ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('Chapternal lineage', () => {
  it('uses Chapternal Paper (light) and Studio (dark) neutrals', () => {
    expect(colors.light).toMatchObject({
      canvas: '#efe8dc',
      surface: '#f6f1e8',
      raised: '#fffaf2',
      ink: '#1a1916',
      muted: '#5c574e',
    });
    expect(colors.dark).toMatchObject({
      canvas: '#0a0a0a',
      surface: '#171717',
      raised: '#1c1c1c',
      ink: '#e8e6e1',
      muted: '#9a968e',
    });
    for (const t of ['light', 'dark'] as const) {
      expect([colors[t].logoA, colors[t].logoMid, colors[t].logoB]).toEqual([
        '#2ecbff',
        '#7b8cff',
        '#e879f9',
      ]);
    }
  });

  it('keeps pages white by default in every theme (print fidelity)', () => {
    for (const t of THEMES) expect(colors[t].paper).toBe('#ffffff');
  });
});

describe('CSS output', () => {
  it('emits custom properties and legacy aliases', () => {
    const d = themeDeclarations('light');
    expect(d).toContain('--ls-canvas: #efe8dc;');
    expect(d).toContain('--ls-chrome: #efe8dc;');
    expect(d).toContain('--ls-radius-pill: 999px;');
    expect(d).toContain("--ls-font-display: 'Fraunces'");
    expect(themeDeclarations('dark', '#ff00aa')).toContain('--ls-accent: #ff00aa;');
    expect(themeStylesheet()).toContain(":root[data-theme='dark']");
  });

  it('declares bundled fonts and installs them once', () => {
    const css = fontFaceCss({
      fraunces: 'a.woff2',
      instrumentSans: 'b.woff2',
      jetbrainsMono: 'c.woff2',
    });
    expect(css).toContain("font-family: 'Fraunces'");
    expect(css).toContain("font-family: 'Instrument Sans'");
    expect(css).toContain("font-family: 'JetBrains Mono'");
    expect(css).not.toMatch(/https?:\/\/fonts\./);
    installFonts(document);
    installFonts(document);
    expect(document.querySelectorAll('#ls-fonts')).toHaveLength(1);
  });
});
