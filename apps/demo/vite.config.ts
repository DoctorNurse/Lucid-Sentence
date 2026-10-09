import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
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
      // Handwriting recognition files (~11 MB) load on first use and are cached then,
      // so installing the web app doesn't download them up front.
      const precache = files.filter((f) => !relative(outDir, f).startsWith(`ocr${sep}`));
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(f));
      const urls = ['./', ...precache.map((f) => `./${relative(outDir, f).split(sep).join('/')}`)];
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

/**
 * On-device handwriting recognition files (Tesseract, Apache-2.0), served from our own
 * origin under ocr/ so recognition never touches the network: the worker, the LSTM
 * engine (SIMD build plus a plain fallback), and the English "best_int" model.
 */
const require = createRequire(import.meta.url);
function ocrFiles(): Record<string, string> {
  const tess = dirname(require.resolve('tesseract.js/package.json'));
  const core = dirname(require.resolve('tesseract.js-core/package.json', { paths: [tess] }));
  const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
  return {
    'worker.min.js': join(tess, 'dist', 'worker.min.js'),
    'tesseract-core-simd-lstm.wasm.js': join(core, 'tesseract-core-simd-lstm.wasm.js'),
    'tesseract-core-lstm.wasm.js': join(core, 'tesseract-core-lstm.wasm.js'),
    'eng.traineddata.gz': join(eng, '4.0.0_best_int', 'eng.traineddata.gz'),
  };
}
function ocrAssets(): Plugin {
  return {
    name: 'lucid-sentence-ocr',
    configureServer(server) {
      const files = ocrFiles();
      server.middlewares.use((req, res, next) => {
        const m = /\/ocr\/([^/?#]+)/.exec(req.url ?? '');
        const file = m ? files[m[1]!] : undefined;
        if (!file) {
          next();
          return;
        }
        res.setHeader(
          'Content-Type',
          file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream',
        );
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(ocrFiles())) {
        this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: readFileSync(file) });
      }
    },
  };
}

const src = (pkg: string): string =>
  fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [ocrAssets(), serviceWorker()],
  // Promo flag: LUCID_PROMOS=off pnpm build  -> no promo card in this build.
  define: {
    __LUCID_PROMOS__: JSON.stringify(process.env['LUCID_PROMOS'] !== 'off'),
  },
  // Relative base so the built demo can be opened from any path.
  base: './',
  resolve: {
    // Use workspace sources directly for instant reloads while developing.
    alias: {
      '@lucid-sentence/ai': src('ai'),
      '@lucid-sentence/commands': src('commands'),
      '@lucid-sentence/ribbon-ui': src('ribbon-ui'),
      '@lucid-sentence/splash': src('splash'),
      '@lucid-sentence/tokens': src('tokens'),
    },
  },
});
