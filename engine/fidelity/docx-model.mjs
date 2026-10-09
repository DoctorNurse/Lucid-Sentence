/**
 * A small, dependency-free .docx reader for the fidelity eval: unzips the
 * package and reduces it to the things a round trip must keep (text,
 * paragraph styles, run formatting, lists, tables, pictures, sections,
 * headers/footers, links, comments).
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

/** Read every file in a zip archive: { name: Buffer }. */
export function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(off + 26);
    const lxlen = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    files[name] = method === 0 ? Buffer.from(data) : inflateRawSync(data);
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const attr = (xml, tag, name = 'w:val') => {
  const m = new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`).exec(xml);
  return m ? decode(m[1]) : null;
};
const has = (xml, tag) => {
  const m = new RegExp(`<${tag}\\b([^>]*?)/?>`).exec(xml);
  if (!m) return false;
  const v = /w:val="([^"]*)"/.exec(m[1]);
  return !v || !['0', 'false', 'none'].includes(v[1]);
};

/** Top-level elements of a given tag (handles nesting of the same tag). */
function elements(xml, tag) {
  const out = [];
  const open = new RegExp(`<${tag}(?=[\\s>/])`, 'g');
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*?(/?)>`, 'g');
  let m;
  while ((m = open.exec(xml))) {
    re.lastIndex = m.index;
    let depth = 0;
    let t;
    while ((t = re.exec(xml))) {
      if (t[2] === '/') {
        if (depth === 0) break;
        continue;
      }
      depth += t[1] ? -1 : 1;
      if (depth === 0) break;
    }
    const end = t ? re.lastIndex : xml.length;
    out.push(xml.slice(m.index, end));
    open.lastIndex = end;
  }
  return out;
}

function styleMap(files) {
  const xml = files['word/styles.xml']?.toString('utf8') ?? '';
  const map = {};
  for (const s of elements(xml, 'w:style')) {
    const id = /w:styleId="([^"]*)"/.exec(s)?.[1];
    const name = attr(s, 'w:name');
    const numbered = /<w:numPr\b/.test(s);
    if (id) map[id] = { name: name ?? id, numbered };
  }
  return map;
}

function runText(r) {
  let t = '';
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<w:cr\/>/g;
  let m;
  while ((m = re.exec(r)))
    t += m[1] !== undefined ? decode(m[1]) : m[0].startsWith('<w:tab') ? '\t' : '\n';
  return t;
}

function runFormat(r) {
  const pr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r)?.[1] ?? '';
  const f = [];
  if (has(pr, 'w:b')) f.push('b');
  if (has(pr, 'w:i')) f.push('i');
  if (has(pr, 'w:u')) f.push('u');
  if (has(pr, 'w:strike')) f.push('s');
  const va = attr(pr, 'w:vertAlign');
  if (va && va !== 'baseline') f.push(va);
  const font = attr(pr, 'w:rFonts', 'w:ascii');
  if (font) f.push(`font=${font}`);
  const sz = attr(pr, 'w:sz');
  if (sz) f.push(`sz=${Number(sz) / 2}`);
  const color = attr(pr, 'w:color');
  if (color && color !== 'auto' && color !== '000000') f.push(`color=${color.toUpperCase()}`);
  return f.join(' ');
}

function paragraph(p, styles) {
  const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p)?.[1] ?? '';
  const sid = attr(pPr, 'w:pStyle');
  const style = sid ? (styles[sid]?.name ?? sid) : 'Normal';
  const list = /<w:numPr\b/.test(pPr) || Boolean(sid && styles[sid]?.numbered);
  const align = attr(pPr, 'w:jc') ?? 'left';
  const segs = [];
  // Runs, including those inside hyperlinks, smart tags and so on (not pPr's rPr).
  const body = p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '');
  for (const r of elements(body, 'w:r')) {
    const text = runText(r);
    if (!text) continue;
    const fmt = runFormat(r);
    const last = segs[segs.length - 1];
    if (last && last.fmt === fmt) last.text += text;
    else segs.push({ text, fmt });
  }
  const norm = { start: 'left', end: 'right', both: 'justify', distribute: 'justify' };
  return {
    text: segs.map((s) => s.text).join(''),
    style: style.toLowerCase(),
    list,
    align: norm[align] ?? align,
    runs: segs.filter((s) => s.fmt && s.text.trim()).map((s) => `${s.fmt}: ${s.text}`),
  };
}

function bodyParts(xml) {
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? '';
  return body;
}

export function model(buf) {
  const files = unzip(buf);
  const doc = files['word/document.xml']?.toString('utf8');
  if (!doc) throw new Error('no word/document.xml');
  const styles = styleMap(files);
  const body = bodyParts(doc);
  // Body paragraphs (outside tables; tables are compared cell by cell below).
  let outside = body;
  for (const t of elements(body, 'w:tbl')) outside = outside.replace(t, '');
  const allParas = elements(outside, 'w:p').map((p) => paragraph(p, styles));
  const tables = elements(body, 'w:tbl').map((t) =>
    elements(t, 'w:tr').map((tr) =>
      elements(tr, 'w:tc').map((tc) =>
        elements(tc, 'w:p')
          .map((p) => paragraph(p, styles).text)
          .join('\n'),
      ),
    ),
  );
  const rels = files['word/_rels/document.xml.rels']?.toString('utf8') ?? '';
  const relTarget = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]*)"/.exec(m[0])?.[1];
    const target = /Target="([^"]*)"/.exec(m[0])?.[1];
    if (id) relTarget[id] = decode(target ?? '');
  }
  const links = [...doc.matchAll(/<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g)].map((m) => ({
    target: relTarget[/r:id="([^"]*)"/.exec(m[1])?.[1]] ?? null,
    text: elements(m[2], 'w:r').map(runText).join(''),
  }));
  const media = Object.entries(files)
    .filter(([n]) => n.startsWith('word/media/'))
    .map(([, b]) => createHash('sha256').update(b).digest('hex').slice(0, 16))
    .sort();
  const sections = [...doc.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].map((m) => {
    const pgSz = /<w:pgSz\b[^>]*>/.exec(m[0])?.[0] ?? '';
    const w = Number(/w:w="(\d+)"/.exec(pgSz)?.[1] ?? 0);
    const h = Number(/w:h="(\d+)"/.exec(pgSz)?.[1] ?? 0);
    return w > h ? 'landscape' : 'portrait';
  });
  const partText = (prefix) =>
    Object.entries(files)
      .filter(([n]) => new RegExp(`^word/${prefix}\\d*\\.xml$`).test(n))
      .map(([, b]) =>
        elements(b.toString('utf8'), 'w:p')
          .map((p) => paragraph(p, styles).text)
          .join('\n')
          .trim(),
      )
      .filter(Boolean)
      .sort();
  const comments = files['word/comments.xml']
    ? elements(files['word/comments.xml'].toString('utf8'), 'w:comment').map((c) => ({
        author: /w:author="([^"]*)"/.exec(c)?.[1] ?? '',
        text: elements(c, 'w:p')
          .map((p) => paragraph(p, styles).text)
          .join('\n'),
      }))
    : [];
  const pageBreaks =
    (doc.match(/<w:br\b[^>]*w:type="page"/g) ?? []).length +
    (doc.match(/<w:pageBreakBefore\b(?![^>]*w:val="(0|false)")/g) ?? []).length;
  return {
    paragraphs: allParas,
    tables,
    links,
    media,
    sections,
    headers: partText('header'),
    footers: partText('footer'),
    comments,
    pageBreaks,
  };
}
