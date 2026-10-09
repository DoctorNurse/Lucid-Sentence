/**
 * Bundled UI fonts (SIL OFL 1.1; license texts in packages/tokens/fonts/).
 * Latin subsets as variable WOFF2. No network: files are served by the app.
 *
 * @font-face must live in the document (not inside a shadow root), so call
 * installFonts(document) once at startup.
 */
export interface FontFiles {
  fraunces: string;
  instrumentSans: string;
  jetbrainsMono: string;
}

/** URLs resolved relative to this module, so bundlers (Vite) copy the files. */
export function defaultFontFiles(): FontFiles {
  return {
    fraunces: new URL('../fonts/Fraunces-Variable.woff2', import.meta.url).href,
    instrumentSans: new URL('../fonts/InstrumentSans-Variable.woff2', import.meta.url).href,
    jetbrainsMono: new URL('../fonts/JetBrainsMono-Variable.woff2', import.meta.url).href,
  };
}

export function fontFaceCss(files: FontFiles = defaultFontFiles()): string {
  const face = (family: string, url: string, weight: string, extra = ''): string =>
    `@font-face { font-family: '${family}'; src: url('${url}') format('woff2'); font-weight: ${weight}; font-style: normal; font-display: swap;${extra} }`;
  return [
    face('Fraunces', files.fraunces, '100 900'),
    face('Instrument Sans', files.instrumentSans, '400 700', ' font-stretch: 75% 100%;'),
    face('JetBrains Mono', files.jetbrainsMono, '100 800'),
  ].join('\n');
}

/** Add the @font-face rules to a document once. */
export function installFonts(doc: Document, files?: FontFiles): void {
  if (doc.getElementById('ls-fonts')) return;
  const style = doc.createElement('style');
  style.id = 'ls-fonts';
  style.textContent = fontFaceCss(files);
  doc.head.append(style);
}
