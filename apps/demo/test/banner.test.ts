import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { addDocxBanner, addPdfBanner, BANNER_TAG, BANNER_URL } from '../src/engine/banner.js';

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const BODY = '<w:p><w:r><w:t>Hello body</w:t></w:r></w:p>';

function docx(sect: string, extra: Record<string, string> = {}, rels = ''): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document ${W}><w:body>${BODY}${sect}</w:body></w:document>`,
    ),
    'word/_rels/document.xml.rels': strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    ),
  };
  for (const [k, v] of Object.entries(extra)) files[k] = strToU8(v);
  return zipSync(files);
}
const read = (b: Uint8Array): Record<string, string> =>
  Object.fromEntries(Object.entries(unzipSync(b)).map(([k, v]) => [k, strFromU8(v)]));
const body = (x: string): string => x.slice(x.indexOf('<w:body>'), x.indexOf('<w:sectPr'));
const hdrRel = (id: string, t: string, kind = 'header'): string =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${kind}" Target="${t}"/>`;

describe('docx banner', () => {
  it('adds a first-page header with the linked banner and leaves the body alone', () => {
    const before = docx(
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:docGrid w:linePitch="360"/></w:sectPr>',
    );
    const f = read(addDocxBanner(before));
    const doc = f['word/document.xml']!;
    expect(body(doc)).toBe(body(read(before)['word/document.xml']!));
    expect(doc).toMatch(/<w:headerReference w:type="first" r:id="(rIdLucid\d)"\/>/);
    expect(doc).toMatch(/<w:titlePg\/><w:docGrid/);
    const hdr = f['word/header_lucid1.xml']!;
    expect(hdr).toContain(`w:val="${BANNER_TAG}"`);
    expect(hdr).toContain('Lucid Sentence');
    const link = /<w:hyperlink r:id="([^"]+)"/.exec(hdr)![1]!;
    expect(f['word/_rels/header_lucid1.xml.rels']).toContain(`Id="${link}"`);
    expect(f['word/_rels/header_lucid1.xml.rels']).toContain(
      `Target="${BANNER_URL}" TargetMode="External"`,
    );
    expect(f['[Content_Types].xml']).toContain('PartName="/word/header_lucid1.xml"');
  });

  it('keeps page 1 looking the same: copies the default header and footer first', () => {
    const before = docx(
      '<w:sectPr><w:headerReference w:type="default" r:id="rId8"/><w:footerReference w:type="default" r:id="rId9"/><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>',
      {
        'word/header1.xml': `<w:hdr ${W}><w:p><w:r><w:t>Company header</w:t></w:r></w:p></w:hdr>`,
        'word/footer1.xml': `<w:ftr ${W}><w:p><w:r><w:t>Page footer</w:t></w:r></w:p></w:ftr>`,
      },
      hdrRel('rId8', 'header1.xml') + hdrRel('rId9', 'footer1.xml', 'footer'),
    );
    const f = read(addDocxBanner(before));
    expect(f['word/header1.xml']).not.toContain(BANNER_TAG);
    expect(f['word/header_lucid1.xml']).toMatch(new RegExp(`${BANNER_TAG}.*Company header`));
    expect(f['word/footer_lucid1.xml']).toContain('Page footer');
    expect(f['word/document.xml']).toContain('<w:footerReference w:type="first"');
  });

  it('adds to an existing first-page header, once', () => {
    const before = docx(
      '<w:sectPr><w:headerReference w:type="first" r:id="rId3"/><w:titlePg/></w:sectPr>',
      { 'word/header2.xml': `<w:hdr ${W}><w:p><w:r><w:t>Title page</w:t></w:r></w:p></w:hdr>` },
      hdrRel('rId3', 'header2.xml'),
    );
    const once = addDocxBanner(before);
    const f = read(once);
    expect(f['word/header2.xml']).toMatch(
      new RegExp(`<w:hdr [^>]*><w:sdt>.*${BANNER_TAG}.*Title page`),
    );
    expect(Object.keys(f)).not.toContain('word/header_lucid1.xml');
    expect(addDocxBanner(once)).toBe(once);
  });
});

describe('pdf banner', () => {
  it('draws in a hidden-when-printed layer at the top of page 1, with a link and a closable note', async () => {
    const src = await PDFDocument.create();
    src.addPage([612, 792]).drawText('Body text', { x: 72, y: 700 });
    src.addPage([612, 792]);
    const out = await PDFDocument.load(await addPdfBanner(await src.save()));
    const ocp = out.catalog.lookup(PDFName.of('OCProperties'), PDFDict);
    const ocg = ocp.lookup(PDFName.of('OCGs'), PDFArray).lookup(0, PDFDict);
    const print = ocg.lookup(PDFName.of('Usage'), PDFDict).lookup(PDFName.of('Print'), PDFDict);
    expect(print.get(PDFName.of('PrintState'))).toBe(PDFName.of('OFF'));
    const as = ocp
      .lookup(PDFName.of('D'), PDFDict)
      .lookup(PDFName.of('AS'), PDFArray)
      .lookup(0, PDFDict);
    expect(as.get(PDFName.of('Event'))).toBe(PDFName.of('Print'));

    const annots = out.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const list = annots.asArray().map((_, i) => annots.lookup(i, PDFDict));
    const sub = (d: PDFDict): string => d.get(PDFName.of('Subtype'))!.toString();
    const link = list.find((d) => sub(d) === '/Link')!;
    expect(
      (link.lookup(PDFName.of('A'), PDFDict).get(PDFName.of('URI')) as PDFString).decodeText(),
    ).toBe(BANNER_URL);
    const note = list.find((d) => sub(d) === '/Text')!;
    expect(note.get(PDFName.of('Open'))!.toString()).toBe('true');
    expect(list.find((d) => sub(d) === '/Popup')).toBeTruthy();
    for (const d of list) {
      expect((d.get(PDFName.of('F')) as PDFNumber).asNumber() & 4).toBe(0); // no Print flag
      const r = d
        .lookup(PDFName.of('Rect'), PDFArray)
        .asArray()
        .map((n) => (n as PDFNumber).asNumber());
      expect(Math.min(r[1]!, r[3]!)).toBeGreaterThanOrEqual(792 - 22); // only the top strip
    }
    expect(out.getPage(1).node.get(PDFName.of('Annots'))).toBeUndefined();
  });
});
