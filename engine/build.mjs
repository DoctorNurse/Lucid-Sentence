#!/usr/bin/env node
/**
 * Builds the offline document engine into engine/dist/ from pinned sources
 * (engine/manifest.json):
 *
 *   dist/sdkjs/word/        ONLYOFFICE sdkjs word SDK, built from source at the
 *                           pinned commit with our bridge addon (engine/sdkjs-addon)
 *   dist/sdkjs/common/      the runtime files sdkjs loads (font engine, images, ...)
 *   dist/sdkjs/vendor/      XRegExp and jQuery, which sdkjs expects as globals
 *   dist/fonts/             the bundled fonts, in sdkjs's web font format
 *   dist/x2t/               x2t.wasm (ONLYOFFICE core via CryptPad) + our worker
 *   dist/lucid/apps/word/main/  the host page the app loads in an iframe
 *   dist/SOURCES.json       what went in, for the Legal Notices and Corresponding Source
 *
 * Needs git, python3, unzip, tar, and network on the first run; later runs reuse
 * engine/.cache. `--check` only verifies that dist/ matches the manifest.
 *
 * Copyright (C) 2026 Lucid Systems and the Lucid Sentence contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CACHE = join(ROOT, '.cache');
const DIST = join(ROOT, 'dist');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const log = (m) => console.log(`[engine] ${m}`);
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const sha = (alg, buf) => createHash(alg).update(buf).digest('hex');

/** Hash of the given inputs (files and folders under engine/). */
function hashInputs(files, dirs) {
  const h = createHash('sha256');
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(p.slice(ROOT.length)).update(readFileSync(p));
    }
  };
  for (const f of files) h.update(f).update(readFileSync(join(ROOT, f)));
  for (const d of dirs) walk(join(ROOT, d));
  return h.digest('hex').slice(0, 16);
}
/** Everything that determines dist/ (CI caches dist/ under this key). */
export const inputsHash = () =>
  hashInputs(['manifest.json', 'build.mjs'], ['sdkjs-addon', 'fonts', 'host']);
/** What determines the compiled SDK: the pinned commit and our addon. */
const sdkHash = () =>
  createHash('sha256')
    .update(JSON.stringify(manifest.sdkjs))
    .update(hashInputs([], ['sdkjs-addon']))
    .digest('hex')
    .slice(0, 16);

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── sdkjs: compile the word SDK from source with our addon
function buildSdkjs() {
  const { repo, commit, version, build } = manifest.sdkjs;
  const src = join(CACHE, `sdkjs-${commit.slice(0, 12)}`);
  if (!existsSync(join(src, '.git'))) {
    log(`fetching sdkjs ${commit}`);
    mkdirSync(src, { recursive: true });
    sh('git', ['init', '-q'], src);
    sh('git', ['fetch', '-q', '--depth', '1', repo, commit], src);
    sh('git', ['checkout', '-q', 'FETCH_HEAD'], src);
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src }).toString().trim();
  if (head !== commit) throw new Error(`sdkjs checkout is ${head}, expected ${commit}`);
  const out = join(src, 'deploy', 'sdkjs', 'word');
  const stamp = join(src, 'deploy', 'lucid-stamp');
  const want = sdkHash();
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== want) {
    log('building the sdkjs word SDK with the Lucid bridge addon');
    const date = new Date().toISOString().slice(0, 10);
    const copyright = [
      `Copyright (C) Ascensio System SIA 2009-${new Date().getFullYear()}. All rights reserved`,
      ' *',
      ' * Modified version: based on the original ONLYOFFICE software developed by',
      ` * Ascensio System SIA. Modified by Lucid Systems (built ${date}): adds the`,
      ' * Lucid Sentence engine bridge. AGPL-3.0-only with the ONLYOFFICE',
      ' * additional terms; source: https://github.com/DoctorNurse/Lucid-Sentence',
    ].join('\n');
    // sdkjs 9.4's own build: concatenates the sources (upstream dropped Closure).
    execFileSync(
      process.platform === 'win32' ? 'python' : 'python3',
      ['build.py', '--product', 'word', '--addon', join(ROOT, 'sdkjs-addon')],
      {
        cwd: join(src, 'build'),
        stdio: 'inherit',
        env: {
          ...process.env,
          PRODUCT_VERSION: version,
          BUILD_NUMBER: build,
          APP_COPYRIGHT: copyright,
          PUBLISHER_URL: 'https://github.com/DoctorNurse/Lucid-Sentence',
        },
      },
    );
    writeFileSync(stamp, want);
  }
  return { src, out };
}

function stageSdkjs({ src, out }) {
  const dst = join(DIST, 'sdkjs');
  cpSync(out, join(dst, 'word'), { recursive: true });
  const common = join(src, 'common');
  // Only what the word editor loads at run time.
  for (const p of [
    'libfont/engine/fonts.js',
    'libfont/engine/fonts.wasm',
    'zlib/engine/zlib.js',
    'zlib/engine/zlib.wasm',
    'Charts/ChartStyles.js',
    'Drawings/Format/path-boolean-min.js',
    'Images',
  ]) {
    cpSync(join(common, p), join(dst, 'common', p), { recursive: true });
  }
  // The built-in blank document (AscCommon.getEmpty), for File > New.
  cpSync(join(src, 'word', 'document', 'empty.js'), join(dst, 'word', 'document', 'empty.js'));
  cpSync(join(ROOT, 'fonts', 'AllFonts.js'), join(dst, 'common', 'AllFonts.js'));
  for (const v of ['xregexp-all-min.js', 'jquery.min.js']) {
    cpSync(join(src, 'vendor', v), join(dst, 'vendor', v));
  }
  cpSync(join(src, 'LICENSE'), join(DIST, 'licenses', 'sdkjs-LICENSE.txt'));
}

// ── Fonts: pinned TTFs, stored the way sdkjs's web font loader expects them
const FONT_KEY = Buffer.from(
  'a066d620149647fa9569b850b0414948a066d620149647fa9569b850b0414948',
  'hex',
);
async function stageFonts() {
  const { repo, commit, licenses } = manifest.fonts;
  const list = JSON.parse(readFileSync(join(ROOT, 'fonts', 'fonts.json'), 'utf8'));
  const raw = (p) => `${repo.replace('github.com', 'raw.githubusercontent.com')}/${commit}/${p}`;
  const cacheDir = join(CACHE, `core-fonts-${commit.slice(0, 12)}`);
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(join(DIST, 'fonts'), { recursive: true });
  // Fonts that come from a release archive instead of core-fonts ("archive:<name>/<file>").
  const archives = manifest.fonts.archives ?? {};
  const unpacked = {};
  const unpack = async (name) => {
    if (unpacked[name]) return unpacked[name];
    const a = archives[name];
    const dir = join(CACHE, `${name}-${a.sha256.slice(0, 12)}`);
    const tgz = `${dir}.tar.gz`;
    if (!existsSync(tgz) || sha('sha256', readFileSync(tgz)) !== a.sha256) {
      log(`fetching ${a.url}`);
      const data = await download(a.url);
      if (sha('sha256', data) !== a.sha256) throw new Error(`sha256 mismatch: ${a.url}`);
      writeFileSync(tgz, data);
    }
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    sh('tar', ['-xzf', `${name}-${a.sha256.slice(0, 12)}.tar.gz`, '-C', dir], CACHE);
    cpSync(join(dir, a.root, a.license), join(DIST, 'licenses', `font-${name}-LICENSE.txt`));
    return (unpacked[name] = join(dir, a.root));
  };
  for (const f of list) {
    let data;
    if (f.source.startsWith('archive:')) {
      const [name, file] = f.source.slice('archive:'.length).split('/');
      data = readFileSync(join(await unpack(name), file));
      if (sha('sha256', data) !== f.sha256) throw new Error(`sha256 mismatch: ${f.source}`);
    } else {
      const cached = join(cacheDir, f.source.replace(/\//g, '__'));
      data = existsSync(cached) ? readFileSync(cached) : null;
      if (!data || sha('sha256', data) !== f.sha256) {
        log(`fetching font ${f.source}`);
        data = await download(raw(f.source));
        if (sha('sha256', data) !== f.sha256) throw new Error(`sha256 mismatch: ${f.source}`);
        writeFileSync(cached, data);
      }
    }
    const web = Buffer.from(data);
    for (let i = 0; i < 32 && i < web.length; i++) web[i] ^= FONT_KEY[i];
    writeFileSync(join(DIST, 'fonts', f.file), web);
  }
  for (const [p] of Object.entries(licenses)) {
    const cached = join(cacheDir, p.replace(/\//g, '__'));
    if (!existsSync(cached)) writeFileSync(cached, await download(raw(p)));
    cpSync(cached, join(DIST, 'licenses', `font-${p.split('/')[0]}-LICENSE.txt`));
  }
}

// ── x2t: CryptPad's WebAssembly build of ONLYOFFICE core
async function stageX2t() {
  const { url, sha512 } = manifest.x2t;
  const zip = join(CACHE, `x2t-${sha512.slice(0, 12)}.zip`);
  if (!existsSync(zip) || sha('sha512', readFileSync(zip)) !== sha512) {
    log('fetching x2t');
    const data = await download(url);
    if (sha('sha512', data) !== sha512) throw new Error('x2t.zip sha512 mismatch');
    writeFileSync(zip, data);
  }
  const dir = join(DIST, 'x2t');
  mkdirSync(dir, { recursive: true });
  sh('unzip', ['-q', '-o', zip, 'x2t.js', 'x2t.wasm', '-d', dir]);
  cpSync(join(ROOT, 'host', 'x2t-worker.js'), join(dir, 'worker.js'));
}

function stageHost() {
  const dir = join(DIST, 'lucid', 'apps', 'word', 'main');
  for (const f of ['index.html', 'host.js', 'host.css'])
    cpSync(join(ROOT, 'host', f), join(dir, f));
}

function sizeOf(p) {
  const s = statSync(p);
  if (!s.isDirectory()) return s.size;
  return readdirSync(p).reduce((n, e) => n + sizeOf(join(p, e)), 0);
}

async function main() {
  const check = process.argv.includes('--check');
  const want = inputsHash();
  const stampFile = join(DIST, 'SOURCES.json');
  if (existsSync(stampFile) && JSON.parse(readFileSync(stampFile, 'utf8')).inputs === want) {
    log(`dist/ is up to date (${want})`);
    return;
  }
  if (check) {
    console.error('[engine] dist/ is missing or stale: run `pnpm engine:build`');
    process.exit(1);
  }
  mkdirSync(CACHE, { recursive: true });
  const sdk = buildSdkjs();
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(join(DIST, 'licenses'), { recursive: true });
  stageSdkjs(sdk);
  await stageFonts();
  await stageX2t();
  stageHost();
  writeFileSync(
    stampFile,
    JSON.stringify(
      {
        inputs: want,
        sdkjs: manifest.sdkjs,
        x2t: manifest.x2t,
        fonts: { repo: manifest.fonts.repo, commit: manifest.fonts.commit },
      },
      null,
      2,
    ),
  );
  log(`done: ${(sizeOf(DIST) / 1e6).toFixed(1)} MB in engine/dist`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
