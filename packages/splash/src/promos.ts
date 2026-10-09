/**
 * Promos shown on the splash screen: other apps from Lucid Systems LLC only.
 * One promo is shown per launch, chosen round-robin (see rotation.ts), so more
 * apps can be added here later without other code changes.
 *
 * Rules for entries: Lucid Systems apps only. Copy must come from the app's own
 * public site (note the source page next to each string). No tracking
 * parameters in URLs, and only bundled assets (no remote images or pixels).
 */
export interface PromoTheme {
  /** Card background (CSS color or gradient). */
  background: string;
  /** Primary text color on the background. */
  text: string;
  /** Secondary text color on the background. */
  muted: string;
  /** Brand gradient stops used for the border glow and CTA. */
  gradient: readonly [string, string, string];
  /** CTA text color on the gradient. */
  ctaText: string;
  /** Optional display font stack for the app name. */
  displayFont?: string;
}

export interface Promo {
  /** Stable id, used for rotation and events. */
  id: string;
  appName: string;
  /** Short headline. */
  tagline: string;
  /** One or two sentences under the headline. */
  description?: string;
  /** Up to three short value props, shown as chips. */
  highlights?: readonly string[];
  /** Opened externally (new tab or system browser). https only. */
  url: string;
  /**
   * Optional icon, relative to the host app's asset base (`asset-base`
   * attribute on <ls-splash>) or an absolute bundled URL. Never a remote URL.
   */
  icon?: string;
  /** Call-to-action label. */
  ctaLabel: string;
  /** Brand styling for the card. Falls back to Lucid Sentence tokens. */
  theme?: PromoTheme;
}

export const promos: readonly Promo[] = [
  {
    id: 'chapternal',
    appName: 'Chapternal',
    // chapternal.com <title>: "Chapternal — Audiobooks, made line by line"
    tagline: 'Audiobooks, made line by line.',
    // chapternal.com hero: "Listen to audiobooks free, right in your browser. Write a book?
    // Make its audiobook here: read it yourself or direct an AI voice, one line at a time."
    description:
      'Listen to audiobooks free, right in your browser. Write a book? Make its audiobook: read it yourself or direct an AI voice, one line at a time.',
    // chapternal.com "For listeners": "Free. No account." / "Full-cast readings with sound,
    // not one flat voice." / "Nothing to install."
    highlights: ['Free, no account', 'Full-cast readings', 'Nothing to install'],
    url: 'https://chapternal.com',
    // Chapternal's own public app icon (chapternal.com/__grok/icon-180.png).
    icon: 'promos/chapternal-icon.png',
    ctaLabel: 'Listen free on Chapternal',
    // Colors from chapternal.com's stylesheet: --color-logo-a #2ecbff,
    // --color-logo-mid #7b8cff, --color-logo-b #e879f9, background #0a0a0a,
    // foreground #e8e6e1, muted #9a968e. Display serif: Fraunces (OFL, bundled locally in packages/tokens/fonts).
    theme: {
      background:
        'radial-gradient(120% 90% at 0% 0%, rgb(46 203 255 / 16%), transparent 55%), radial-gradient(100% 80% at 100% 100%, rgb(232 121 249 / 14%), transparent 55%), #0c0b0a',
      text: '#e8e6e1',
      muted: '#a8a49c',
      gradient: ['#2ecbff', '#7b8cff', '#e879f9'],
      ctaText: '#0a0a0a',
      displayFont: "Fraunces, 'Source Serif 4', Georgia, 'Times New Roman', serif",
    },
  },
];
