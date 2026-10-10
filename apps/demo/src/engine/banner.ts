/**
 * The optional "Made with Lucid Sentence" banner added to exported files.
 *
 * It is applied to the bytes on the way out (the open document never changes):
 *  - PDF: a slim strip in the top 20 points of page 1, above any normal margin,
 *    in an optional content group that viewers can hide and that never prints,
 *    with a link and a note (open by default) that readers can close.
 *  - .docx: one centered line in the first-page header, in a content control
 *    tagged "lucid-sentence-banner" so it is easy to find and delete. The body
 *    is not touched. Page 1 keeps its header and footer: if the document had no
 *    separate first-page header, the default one is copied first.
 * Settings > Options turns it off.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFOperator,
  PDFString,
  rgb,
  StandardFonts,
} from 'pdf-lib';

export const BANNER_URL = 'https://lucidsystemsai.com/sentence/';
export const BANNER_TAG = 'lucid-sentence-banner';
const LABEL = 'Lucid Sentence';
const NOTE =
  'This file was made with Lucid Sentence, a free, open-source word processor: ' +
  `${BANNER_URL}\nThe banner at the top doesn't print, and you can hide it in your viewer's layers. Close this note anytime.`;

/** Banner strip height and its distance from the top edge, in points. */
const STRIP = { height: 13, top: 4 };

export async function addPdfBanner(pdf: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  if (doc.getPageCount() === 0) return pdf;
  const ctx = doc.context;
  const page = doc.getPage(0);
  const box = page.getMediaBox();
  const top = box.y + box.height;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 7;
  const lead = 'Made with ';
  const textW = font.widthOfTextAtSize(lead + LABEL, size);
  const w = textW + 16;
  const x0 = box.x + (box.width - w) / 2;
  const y0 = top - STRIP.top - STRIP.height;

  // The optional content group: on screen by default, never printed.
  const ocg = ctx.register(
    ctx.obj({
      Type: 'OCG',
      Name: PDFString.of('Lucid Sentence banner'),
      Intent: 'View',
      Usage: { Print: { PrintState: 'OFF' }, View: { ViewState: 'ON' } },
    }),
  );
  const catalog = doc.catalog;
  let props = catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict);
  if (!props) {
    props = ctx.obj({ OCGs: [], D: { Order: [], ON: [], AS: [] } });
    catalog.set(PDFName.of('OCProperties'), props);
  }
  const arr = (d: PDFDict, k: string): PDFArray => {
    let a = d.lookupMaybe(PDFName.of(k), PDFArray);
    if (!a) {
      a = ctx.obj([]);
      d.set(PDFName.of(k), a);
    }
    return a;
  };
  let d = props.lookupMaybe(PDFName.of('D'), PDFDict);
  if (!d) {
    d = ctx.obj({});
    props.set(PDFName.of('D'), d);
  }
  arr(props, 'OCGs').push(ocg);
  arr(d, 'Order').push(ocg);
  arr(d, 'ON').push(ocg);
  arr(d, 'AS').push(ctx.obj({ Event: 'Print', OCGs: [ocg], Category: ['Print'] }));

  // Drawn inside /OC marked content so hiding the layer hides it.
  const res = page.node.Resources() ?? ctx.obj({});
  page.node.set(PDFName.of('Resources'), res);
  let propDict = res.lookupMaybe(PDFName.of('Properties'), PDFDict);
  if (!propDict) {
    propDict = ctx.obj({});
    res.set(PDFName.of('Properties'), propDict);
  }
  propDict.set(PDFName.of('LucidBanner'), ocg);
  page.pushOperators(PDFOperator.of('BDC' as never, [PDFName.of('OC'), PDFName.of('LucidBanner')]));
  page.drawRectangle({
    x: x0,
    y: y0,
    width: w,
    height: STRIP.height,
    color: rgb(0.93, 0.97, 0.98),
    borderColor: rgb(0.27, 0.76, 0.84),
    borderWidth: 0.5,
  });
  const ty = y0 + (STRIP.height - size) / 2 + 1;
  page.drawText(lead, { x: x0 + 8, y: ty, size, font, color: rgb(0.4, 0.45, 0.5) });
  page.drawText(LABEL, {
    x: x0 + 8 + font.widthOfTextAtSize(lead, size),
    y: ty,
    size,
    font,
    color: rgb(0.04, 0.42, 0.49),
  });
  page.pushOperators(PDFOperator.of('EMC' as never));

  // Link and note: no Print flag, so neither prints; both belong to the layer.
  const link = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x0, y0, x0 + w, y0 + STRIP.height],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(BANNER_URL) },
      OC: ocg,
      F: 0,
    }),
  );
  const note = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [x0 + w + 4, y0, x0 + w + 4 + STRIP.height, y0 + STRIP.height],
      Contents: PDFString.of(NOTE),
      T: PDFString.of(LABEL),
      Name: 'Comment',
      Open: true,
      C: [0.27, 0.76, 0.84],
      OC: ocg,
      F: 0,
    }),
  );
  // The popup sits in the top strip beside the banner, not over the body.
  const popup = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Popup',
      Parent: note,
      Rect: [
        x0 + w + 22,
        top - 2 - STRIP.top - STRIP.height,
        Math.min(box.x + box.width - 4, x0 + w + 22 + 200),
        top - 2,
      ],
      Open: true,
      F: 0,
    }),
  );
  (ctx.lookup(note) as PDFDict).set(PDFName.of('Popup'), popup);
  let annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) {
    annots = ctx.obj([]);
    page.node.set(PDFName.of('Annots'), annots);
  }
  annots.push(link);
  annots.push(note);
  annots.push(popup);
  return doc.save({ useObjectStreams: false });
}

const HYPERLINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';
const HEADER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const FOOTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function bannerXml(linkId: string): string {
  const run = (t: string, color: string, u = false): string =>
    `<w:r><w:rPr><w:color w:val="${color}"/><w:sz w:val="14"/><w:szCs w:val="14"/>${
      u ? '<w:u w:val="single"/>' : ''
    }</w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
  return (
    `<w:sdt><w:sdtPr><w:alias w:val="Lucid Sentence banner (delete to remove)"/><w:tag w:val="${BANNER_TAG}"/></w:sdtPr>` +
    '<w:sdtContent><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="60"/></w:pPr>' +
    run('Made with ', '7A8A94') +
    `<w:hyperlink r:id="${linkId}" w:history="1">${run(LABEL, '0A6A7C', true)}</w:hyperlink>` +
    '</w:p></w:sdtContent></w:sdt>'
  );
}

const relsPath = (part: string): string => {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
};
const EMPTY_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

function addRel(rels: string, id: string, type: string, target: string, external = false): string {
  const r = `<Relationship Id="${id}" Type="${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`;
  return rels.replace('</Relationships>', `${r}</Relationships>`);
}
function relTarget(rels: string, id: string): string | null {
  const m = new RegExp(`<Relationship\\b[^>]*\\bId="${id}"[^>]*>`).exec(rels);
  return m ? (/\bTarget="([^"]+)"/.exec(m[0])?.[1] ?? null) : null;
}
function refId(sect: string, kind: 'header' | 'footer', type: string): string | null {
  const re = new RegExp(`<w:${kind}Reference\\b[^>]*>`, 'g');
  for (const m of sect.match(re) ?? []) {
    if (new RegExp(`w:type="${type}"`).test(m)) return /r:id="([^"]+)"/.exec(m)?.[1] ?? null;
  }
  return null;
}
function freeId(rels: string, base: string): string {
  let n = 1;
  while (rels.includes(`Id="${base}${n}"`)) n++;
  return `${base}${n}`;
}
function freePart(files: Record<string, Uint8Array>, base: string): string {
  let n = 1;
  while (files[`word/${base}${n}.xml`]) n++;
  return `${base}${n}.xml`;
}

/** Add the banner to page 1's header of a .docx (bytes in, bytes out). Already there: unchanged. */
export function addDocxBanner(docx: Uint8Array): Uint8Array {
  const files = unzipSync(docx);
  const read = (p: string): string | null => (files[p] ? strFromU8(files[p]) : null);
  const write = (p: string, s: string): void => {
    files[p] = strToU8(s);
  };
  const docPath = 'word/document.xml';
  const docRelsPath = relsPath(docPath);
  let xml = read(docPath);
  if (!xml) return docx;
  let docRels = read(docRelsPath) ?? EMPTY_RELS;
  let types = read('[Content_Types].xml') ?? '';

  // The first section's properties are the first <w:sectPr> in the file.
  const start = xml.search(/<w:sectPr\b/);
  if (start < 0) return docx;
  const selfClosing = /^<w:sectPr\b[^>]*\/>/.exec(xml.slice(start));
  const end = selfClosing ? start + selfClosing[0].length : xml.indexOf('</w:sectPr>', start) + 11;
  let sect = xml.slice(start, end);
  if (selfClosing) sect = sect.replace(/\/>$/, '></w:sectPr>');
  const titlePg = /<w:titlePg(?:\s*\/>|\s+w:val="(?:1|true|on)"\s*\/>)/.test(sect);

  /** Copy a header/footer part (and its rels) to a new name; returns the new part name. */
  const copyPart = (kind: 'header' | 'footer', from: string | null): string => {
    const name = freePart(files, `${kind}_lucid`);
    const src = from ? read(`word/${from}`) : null;
    write(
      `word/${name}`,
      src ??
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${kind === 'header' ? 'hdr' : 'ftr'} ${NS}><w:p/></w:${kind === 'header' ? 'hdr' : 'ftr'}>`,
    );
    const srcRels = from ? read(relsPath(`word/${from}`)) : null;
    if (srcRels) write(relsPath(`word/${name}`), srcRels);
    if (!types.includes(`PartName="/word/${name}"`)) {
      types = types.replace(
        '</Types>',
        `<Override PartName="/word/${name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml"/></Types>`,
      );
    }
    return name;
  };
  const addRef = (kind: 'header' | 'footer', part: string): void => {
    const id = freeId(docRels, 'rIdLucid');
    docRels = addRel(docRels, id, kind === 'header' ? HEADER : FOOTER, part);
    sect = sect.replace(
      /<w:sectPr\b[^>]*>/,
      (o) => `${o}<w:${kind}Reference w:type="first" r:id="${id}"/>`,
    );
  };

  let headerPart: string | null = null;
  const firstHdr = titlePg ? refId(sect, 'header', 'first') : null;
  if (firstHdr) headerPart = relTarget(docRels, firstHdr);
  if (!headerPart) {
    // No first-page header yet. Page 1 shows the default header and footer
    // today (or nothing, with titlePg on), so start the new ones from those.
    const defHdr = titlePg ? null : refId(sect, 'header', 'default');
    headerPart = copyPart('header', defHdr ? relTarget(docRels, defHdr) : null);
    addRef('header', headerPart);
    if (!titlePg) {
      if (!refId(sect, 'footer', 'first')) {
        const defFtr = refId(sect, 'footer', 'default');
        if (defFtr) addRef('footer', copyPart('footer', relTarget(docRels, defFtr)));
      }
      sect = sect.replace(/<w:titlePg\b[^>]*\/>/, '');
      const after =
        /<w:(?:textDirection|bidi|rtlGutter|docGrid|printerSettings|sectPrChange)\b/.exec(sect);
      sect = after
        ? `${sect.slice(0, after.index)}<w:titlePg/>${sect.slice(after.index)}`
        : sect.replace('</w:sectPr>', '<w:titlePg/></w:sectPr>');
    }
  }

  const hPath = `word/${headerPart.replace(/^\/?word\//, '')}`;
  let hdr = read(hPath);
  if (!hdr) return docx;
  if (hdr.includes(`w:val="${BANNER_TAG}"`)) return docx;
  let hRels = read(relsPath(hPath)) ?? EMPTY_RELS;
  const linkId = freeId(hRels, 'rIdLucidLink');
  hRels = addRel(hRels, linkId, HYPERLINK, BANNER_URL, true);
  if (!/xmlns:r=/.test(hdr.slice(0, hdr.indexOf('>', hdr.indexOf('<w:hdr')) + 1))) {
    hdr = hdr.replace(
      /<w:hdr\b/,
      '<w:hdr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    );
  }
  hdr = hdr.replace(/<w:hdr\b[^>]*>/, (o) => o + bannerXml(linkId));
  write(hPath, hdr);
  write(relsPath(hPath), hRels);
  xml = xml.slice(0, start) + sect + xml.slice(end);
  write(docPath, xml);
  write(docRelsPath, docRels);
  if (types) write('[Content_Types].xml', types);
  return zipSync(files, { level: 6 });
}
