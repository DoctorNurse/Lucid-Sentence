import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes dist/sw.js: an offline cache for the installable web app (PWA). It
 * precaches every built file, versioned by a hash of their contents, so the app
 * works offline after the first visit. Only same-origin files are cached.
 */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'lucid-sentence-sw',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) walk(path);
          else if (entry.name !== 'sw.js') files.push(path);
        }
      };
      walk(outDir);
      files.sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(f));
      const urls = ['./', ...files.map((f) => `./${relative(outDir, f).split(sep).join('/')}`)];
      const template = readFileSync(
        fileURLToPath(new URL('./sw.template.js', import.meta.url)),
        'utf8',
      );
      writeFileSync(
        join(outDir, 'sw.js'),
        template
          .replace('__VERSION__', hash.digest('hex').slice(0, 12))
          .replace('[/* __FILES__ */]', JSON.stringify(urls)),
      );
    },
  };
}

const src = (pkg: string): string =>
  fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [serviceWorker()],
  // Promo flag: LUCID_PROMOS=off pnpm build  -> no promo card in this build.
  define: {
    __LUCID_PROMOS__: JSON.stringify(process.env['LUCID_PROMOS'] !== 'off'),
  },
  // Relative base so the built demo can be opened from any path.
  base: './',
  resolve: {
    // Use workspace sources directly for instant reloads while developing.
    alias: {
      '@lucid-sentence/commands': src('commands'),
      '@lucid-sentence/ribbon-ui': src('ribbon-ui'),
      '@lucid-sentence/splash': src('splash'),
      '@lucid-sentence/tokens': src('tokens'),
    },
  },
});
