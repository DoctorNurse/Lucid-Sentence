#!/usr/bin/env node
/**
 * Fidelity eval for the document engine: round-trips every .docx in
 * engine/fidelity/corpus and compares what came back with what went in.
 *
 *   node engine/fidelity/fidelity.mjs            # both paths, writes REPORT.md
 *   node engine/fidelity/fidelity.mjs --x2t      # converter only (no browser)
 *   node engine/fidelity/fidelity.mjs --check    # exit 1 on a regression vs baseline.json
 *   node engine/fidelity/fidelity.mjs --update   # accept the current results as the baseline
 *
 * Paths:
 *   x2t:   .docx → editor binary → .docx with the converter alone (Node).
 *   sdkjs: the app's real path: x2t in its worker, the document loaded into
 *          sdkjs in headless Chromium, serialized by sdkjs, converted back.
 *
 * Needs engine/dist (pnpm engine:build). SPDX-License-Identifier: AGPL-3.0-only
 */
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { model } from './docx-model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');
const CORPUS = join(HERE, 'corpus');
const args = new Set(process.argv.slice(2));
const require = createRequire(import.meta.url);

if (!existsSync(join(DIST, 'SOURCES.json'))) {
  console.error('[fidelity] engine/dist is missing: run `pnpm engine:build`');
  process.exit(2);
}

// ── x2t in Node
async function nodeX2t() {
  const Module = {
    noInitialRun: true,
    noExitRuntime: true,
    print() {},
    printErr() {},
    locateFile: (f) => join(DIST, 'x2t', f),
  };
  const ready = new Promise((r) => (Module.onRuntimeInitialized = r));
  // x2t.js is Emscripten CommonJS output; the repo is "type": "module", so run it
  // in a CommonJS-style scope rather than through require().
  const file = join(DIST, 'x2t', 'x2t.js');
  const cjs = { exports: {} };
  new Function(
    'Module',
    'require',
    'module',
    'exports',
    '__filename',
    '__dirname',
    readFileSync(file, 'utf8'),
  )(Module, require, cjs, cjs.exports, file, dirname(file));
  await ready;
  const FS = Module.FS;
  const rm = (p) => {
    if (!FS.analyzePath(p).exists) return;
    if (FS.isDir(FS.stat(p).mode)) {
      for (const e of FS.readdir(p)) if (e !== '.' && e !== '..') rm(`${p}/${e}`);
      FS.rmdir(p);
    } else FS.unlink(p);
  };
  return (data, from, to, media = {}) => {
    rm('/working');
    for (const d of ['/working', '/working/media', '/working/fonts', '/working/themes'])
      FS.mkdir(d);
    FS.writeFile(`/working/in.${from}`, data);
    for (const [n, b] of Object.entries(media)) FS.writeFile(`/working/media/${n}`, b);
    FS.writeFile(
      '/working/params.xml',
      `<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>/working/in.${from}</m_sFileFrom><m_sFileTo>/working/out.${to}</m_sFileTo><m_sFontDir>/working/fonts/</m_sFontDir><m_sThemeDir>/working/themes</m_sThemeDir><m_bIsNoBase64>true</m_bIsNoBase64></TaskQueueDataConvert>`,
    );
    const code = Module.ccall('main1', 'number', ['string'], ['/working/params.xml']);
    if (code !== 0) throw new Error(`x2t exit code ${code}`);
    const out = Buffer.from(FS.readFile(`/working/out.${to}`));
    const outMedia = {};
    if (to === 'bin')
      for (const n of FS.readdir('/working/media'))
        if (n !== '.' && n !== '..') outMedia[n] = Buffer.from(FS.readFile(`/working/media/${n}`));
    return { data: out, media: outMedia };
  };
}

// ── sdkjs in Chromium
const MIME = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
};
function serve() {
  const server = createServer((req, res) => {
    const path = join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(DIST) || !existsSync(path)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    try {
      res.setHeader('Content-Type', MIME[extname(path)] ?? 'application/octet-stream');
      res.end(readFileSync(path));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function sdkjsRoundTrip(browser, base, bytes) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${base}/lucid/apps/word/main/index.html`);
    await page.waitForFunction(() => window.LucidHost);
    const out = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const w = new Worker('../../../../x2t/worker.js');
      let n = 0;
      const call = (m) =>
        new Promise((res, rej) => {
          const id = ++n;
          w.addEventListener('message', function h(e) {
            if (e.data.id !== id) return;
            w.removeEventListener('message', h);
            if (e.data.ok) res(e.data);
            else rej(new Error(e.data.error));
          });
          w.postMessage({ id, ...m });
        });
      const r = await call({ data: bytes, from: 'docx', to: 'bin' });
      const images = {};
      for (const [k, v] of Object.entries(r.media || {}))
        images[`media/${k}`] = URL.createObjectURL(new Blob([v]));
      const api = await window.LucidHost.boot({ bin: r.data, images, title: 'corpus.docx' });
      const pages = await new Promise((res) => {
        let last = -1;
        const t = setInterval(() => {
          const c = api.WordControl?.m_oLogicDocument?.Pages?.length ?? 0;
          if (c === last) {
            clearInterval(t);
            res(c);
          }
          last = c;
        }, 300);
      });
      const bin = window.LucidBridge.getBinary(api);
      const media = {};
      for (const name of window.LucidBridge.mediaNames())
        if (r.media?.[name]) media[name] = r.media[name];
      const s = await call({ data: bin, from: 'bin', to: 'docx', media });
      let out = '';
      const u8 = new Uint8Array(s.data);
      for (let i = 0; i < u8.length; i += 0x8000)
        out += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return { docx: btoa(out), pages };
    }, bytes.toString('base64'));
    return { data: Buffer.from(out.docx, 'base64'), pages: out.pages, errors };
  } finally {
    await page.close();
  }
}

// ── Comparison
function compare(a, b) {
  const checks = {};
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const field = (k) => (ps) => ps.map((p) => p[k]);
  checks.text = eq(field('text')(a.paragraphs), field('text')(b.paragraphs));
  checks.styles = eq(field('style')(a.paragraphs), field('style')(b.paragraphs));
  checks.lists = eq(field('list')(a.paragraphs), field('list')(b.paragraphs));
  checks.alignment = eq(field('align')(a.paragraphs), field('align')(b.paragraphs));
  checks.runs = eq(field('runs')(a.paragraphs), field('runs')(b.paragraphs));
  checks.tables = eq(a.tables, b.tables);
  checks.pictures = eq(a.media, b.media);
  checks.sections = eq(a.sections, b.sections);
  checks.headers = eq(a.headers, b.headers) && eq(a.footers, b.footers);
  checks.links = eq(a.links, b.links);
  checks.comments = eq(a.comments, b.comments);
  checks.pageBreaks = a.pageBreaks === b.pageBreaks;
  const diffs = [];
  if (!checks.text || !checks.styles || !checks.runs || !checks.lists || !checks.alignment) {
    const n = Math.max(a.paragraphs.length, b.paragraphs.length);
    for (let i = 0; i < n && diffs.length < 6; i++) {
      const x = a.paragraphs[i];
      const y = b.paragraphs[i];
      if (!eq(x, y)) diffs.push({ i, before: x, after: y });
    }
  }
  for (const k of ['tables', 'pictures', 'sections', 'headers', 'links', 'comments', 'pageBreaks'])
    if (!checks[k]) {
      const pick = (m) =>
        k === 'pictures' ? m.media : k === 'headers' ? [m.headers, m.footers] : m[k];
      diffs.push({ [k]: { before: pick(a), after: pick(b) } });
    }
  return { checks, diffs };
}

// ── Main
const files = readdirSync(CORPUS)
  .filter((f) => f.endsWith('.docx'))
  .sort();
const results = {};
const x2t = await nodeX2t();
for (const f of files) {
  const src = readFileSync(join(CORPUS, f));
  const before = model(src);
  const bin = x2t(src, 'docx', 'bin');
  const back = x2t(bin.data, 'bin', 'docx', bin.media);
  results[f] = { x2t: compare(before, model(back.data)) };
}

if (!args.has('--x2t')) {
  const { chromium } = await import('@playwright/test');
  const exe = process.env.PW_CHROMIUM;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const f of files) {
      const src = readFileSync(join(CORPUS, f));
      try {
        const r = await sdkjsRoundTrip(browser, base, src);
        results[f].sdkjs = {
          ...compare(model(src), model(r.data)),
          pages: r.pages,
          errors: r.errors,
        };
      } catch (e) {
        results[f].sdkjs = { error: String(e.message ?? e) };
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

// ── Report
const CHECKS = [
  'text',
  'styles',
  'runs',
  'lists',
  'alignment',
  'tables',
  'pictures',
  'sections',
  'headers',
  'links',
  'comments',
  'pageBreaks',
];
const paths = args.has('--x2t') ? ['x2t'] : ['x2t', 'sdkjs'];
let md =
  '# Fidelity report\n\nGenerated by `node engine/fidelity/fidelity.mjs`. ✓ = kept, ✗ = changed, – = not applicable.\n\n';
let total = 0;
let passed = 0;
for (const p of paths) {
  md += `## ${p === 'x2t' ? 'Converter only (x2t: docx → bin → docx)' : 'Full editor path (x2t + sdkjs in Chromium)'}\n\n`;
  md += `| File | ${CHECKS.join(' | ')} |${p === 'sdkjs' ? ' pages |' : ''}\n|${'---|'.repeat(CHECKS.length + 1)}${p === 'sdkjs' ? '---|' : ''}\n`;
  for (const f of files) {
    const r = results[f][p];
    if (!r || r.error) {
      md += `| ${f} | ${r?.error ?? 'not run'} |\n`;
      continue;
    }
    md += `| ${f} | ${CHECKS.map((c) => {
      total++;
      if (r.checks[c]) passed++;
      return r.checks[c] ? '✓' : '✗';
    }).join(' | ')} |${p === 'sdkjs' ? ` ${r.pages} |` : ''}\n`;
  }
  md += '\n';
}
md += `**${passed} of ${total} checks kept.**\n\n## Differences\n\n`;
for (const f of files)
  for (const p of paths) {
    const r = results[f][p];
    if (r?.diffs?.length)
      md += `<details><summary>${f} (${p})</summary>\n\n\`\`\`json\n${JSON.stringify(r.diffs, null, 1).slice(0, 4000)}\n\`\`\`\n</details>\n\n`;
    if (r?.errors?.length) md += `${f} (${p}) page errors: ${r.errors.join('; ')}\n\n`;
  }
writeFileSync(join(HERE, 'REPORT.md'), md);
const summary = Object.fromEntries(
  files.map((f) => [
    f,
    Object.fromEntries(paths.map((p) => [p, results[f][p]?.checks ?? { error: true }])),
  ]),
);
console.log(md.split('## Differences')[0]);

const BASE = join(HERE, 'baseline.json');
if (args.has('--update')) {
  writeFileSync(BASE, JSON.stringify(summary, null, 2) + '\n');
  console.log('[fidelity] baseline updated');
} else if (args.has('--check')) {
  const base = JSON.parse(readFileSync(BASE, 'utf8'));
  const regressions = [];
  for (const [f, byPath] of Object.entries(base))
    for (const [p, checks] of Object.entries(byPath)) {
      if (!paths.includes(p)) continue;
      for (const [c, ok] of Object.entries(checks))
        if (ok === true && summary[f]?.[p]?.[c] !== true) regressions.push(`${f} ${p} ${c}`);
    }
  if (regressions.length) {
    console.error(`[fidelity] regressions:\n  ${regressions.join('\n  ')}`);
    process.exit(1);
  }
  console.log('[fidelity] no regressions against baseline.json');
}
