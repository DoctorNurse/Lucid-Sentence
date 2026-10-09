/**
 * .docx ink: InkML parts that Word opens as ink (behind the `inkdocx` flag).
 *
 * Format (MS-ODRAWXML, read 2026-10-09):
 * - §2.1.4 Ink Content Part: content type `application/inkml+xml`, relationship type
 *   `…/officeDocument/2006/relationships/customXml`, root `ink` in the W3C InkML namespace.
 *   `traceFormat` must sit in an `inkSource`; every `trace` needs `contextRef` and
 *   `brushRef`; channels Office reads include X, Y, F, T, OTx, OTy; brush properties
 *   width, height, color, transparency, tip, rasterOp, antiAliased, fitToCurve,
 *   ignorePressure.
 * - §2.2.7.6: in document.xml the part is referenced from `w14:contentPart` inside
 *   `a:graphicData uri="…/word/2010/wordprocessingInk"`, wrapped in
 *   `mc:AlternateContent` with `mc:Choice Requires="wpi"` and a VML `w:pict` fallback.
 * - Office 2016 ink extension (`…/office/drawing/2016/ink`): brush property
 *   `inkEffects` (pencil, …).
 *
 * Mapping: highlighter ↔ rasterOp maskPen + rectangle tip; pencil ↔ inkEffects pencil;
 * pen ↔ copyPen. Lucid-only data (exact tool, audio timestamp, straightened line) rides
 * in attributes of our own namespace, which Word ignores.
 *
 * Unverified until checked against files saved by current Word builds: whether Word keeps
 * F/T/OTx/OTy on re-save, how it anchors ink, and whether it reads `inkEffects` as a
 * brushProperty.
 */
import type { Point, Stroke, StrokeTool } from './model.js';

export const INKML_NS = 'http://www.w3.org/2003/InkML';
export const LS_NS = 'https://lucid-sentence.app/ns/ink/1';
export const INK_CONTENT_TYPE = 'application/inkml+xml';
export const INK_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml';
export const WPI_NS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk';
export const W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';

/** Page px (96/in) → 1/1000 cm (InkML resolution 1000 per cm, "himetric"). */
export const HIMETRIC_PER_PX = 2540 / 96;
const F_MAX = 32767;

/** Feature flag: `?inkdocx=1`, or `inkdocx` in the `lucid-sentence:flags` setting. */
export function inkDocxEnabled(
  search = typeof location === 'undefined' ? '' : location.search,
  flags = readFlags(),
): boolean {
  return new URLSearchParams(search).get('inkdocx') === '1' || flags.includes('inkdocx');
}

function readFlags(): string {
  try {
    return typeof localStorage === 'undefined'
      ? ''
      : (localStorage.getItem('lucid-sentence:flags') ?? '');
  } catch {
    return '';
  }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cm = (px: number): string => String(Math.round((px * 2.54 * 1000) / 96) / 1000);

interface BrushKey {
  tool: StrokeTool;
  color: string;
  size: number;
  pressure: boolean;
}

function brushXml(id: string, b: BrushKey): string {
  const props: [string, string, string?][] = [
    ['width', cm(b.size), 'cm'],
    ['height', cm(b.size), 'cm'],
    ['color', b.color.toUpperCase()],
    ['tip', b.tool === 'highlighter' ? 'rectangle' : 'ellipse'],
    ['rasterOp', b.tool === 'highlighter' ? 'maskPen' : 'copyPen'],
    ['ignorePressure', b.pressure ? '0' : '1'],
    ['fitToCurve', '1'],
  ];
  if (b.tool === 'pencil') props.push(['inkEffects', 'pencil']);
  const lines = props.map(
    ([n, v, u]) =>
      `      <inkml:brushProperty name="${n}" value="${esc(v)}"${u ? ` units="${u}"` : ''}/>`,
  );
  return `    <inkml:brush xml:id="${id}" ls:tool="${b.tool}">\n${lines.join('\n')}\n    </inkml:brush>`;
}

/** One trace's text: explicit integer values, points separated by commas. */
function traceText(points: readonly Point[]): string {
  return points
    .map((p) =>
      [
        Math.round(p[0] * HIMETRIC_PER_PX),
        Math.round(p[1] * HIMETRIC_PER_PX),
        Math.round(Math.max(0, Math.min(1, p[2])) * F_MAX),
        Math.round(p[3] ?? 0),
        Math.round(p[4] ?? 0),
        Math.round(p[5] ?? 0),
      ].join(' '),
    )
    .join(', ');
}

/** Serialize strokes as one InkML document (one ink part). */
export function strokesToInkML(strokes: readonly Stroke[]): string {
  const brushes = new Map<string, string>();
  const brushFor = (s: Stroke): string => {
    const key = JSON.stringify([s.tool, s.color, s.size, s.pressure !== false]);
    let id = brushes.get(key);
    if (!id) {
      id = `br${brushes.size}`;
      brushes.set(key, id);
    }
    return id;
  };
  const traces = strokes.map((s) => {
    const attrs = [
      `contextRef="#ctx0"`,
      `brushRef="#${brushFor(s)}"`,
      `xml:id="ls${s.id}"`,
      s.shape ? `ls:shape="${s.shape}"` : '',
      s.rec !== undefined && s.t !== undefined ? `ls:rec="${esc(s.rec)}" ls:t="${s.t}"` : '',
      s.source ? `ls:source="${s.source}"` : '',
    ].filter(Boolean);
    return `  <inkml:trace ${attrs.join(' ')}>${traceText(s.points)}</inkml:trace>`;
  });
  const brushXmls = [...brushes].map(([key, id]) => {
    const [tool, color, size, pressure] = JSON.parse(key) as [StrokeTool, string, number, boolean];
    return brushXml(id, { tool, color, size, pressure });
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<inkml:ink xmlns:inkml="${INKML_NS}" xmlns:ls="${LS_NS}">
  <inkml:definitions>
    <inkml:context xml:id="ctx0">
      <inkml:inkSource xml:id="inkSrc0">
        <inkml:traceFormat>
          <inkml:channel name="X" type="integer" units="cm"/>
          <inkml:channel name="Y" type="integer" units="cm"/>
          <inkml:channel name="F" type="integer" max="${F_MAX}" units="dev"/>
          <inkml:channel name="OTx" type="integer" min="-90" max="90" units="deg"/>
          <inkml:channel name="OTy" type="integer" min="-90" max="90" units="deg"/>
          <inkml:channel name="T" type="integer" units="dev"/>
        </inkml:traceFormat>
        <inkml:channelProperties>
          <inkml:channelProperty channel="X" name="resolution" value="1000" units="1/cm"/>
          <inkml:channelProperty channel="Y" name="resolution" value="1000" units="1/cm"/>
          <inkml:channelProperty channel="F" name="resolution" value="${F_MAX}" units="1/dev"/>
          <inkml:channelProperty channel="OTx" name="resolution" value="1" units="1/deg"/>
          <inkml:channelProperty channel="OTy" name="resolution" value="1" units="1/deg"/>
          <inkml:channelProperty channel="T" name="resolution" value="1" units="1/dev"/>
        </inkml:channelProperties>
      </inkml:inkSource>
    </inkml:context>
${brushXmls.join('\n')}
  </inkml:definitions>
${traces.join('\n')}
</inkml:ink>
`;
}

// ---------------------------------------------------------------------------
// Reading

/**
 * Decode an InkML trace (W3C InkML §3.2.1): explicit values, first differences (`'`)
 * and second differences (`"`), with the mode persisting per channel; `!` resets to
 * explicit. Returns rows of numbers, one per point.
 */
export function decodeTrace(text: string, channels: number): number[][] {
  const rows: number[][] = [];
  const prev: number[] = new Array<number>(channels).fill(0);
  const vel: number[] = new Array<number>(channels).fill(0);
  const mode: string[] = new Array<string>(channels).fill('!');
  for (const pointText of text.split(',')) {
    if (!pointText.trim()) continue;
    const row: number[] = [];
    const re = /([!'"])?\s*(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
    let m: RegExpExecArray | null;
    let c = 0;
    while ((m = re.exec(pointText)) && c < channels) {
      if (m[1]) mode[c] = m[1];
      const n = Number(m[2]);
      let v: number;
      if (mode[c] === "'") {
        vel[c] = n;
        v = prev[c]! + n;
      } else if (mode[c] === '"') {
        vel[c] = vel[c]! + n;
        v = prev[c]! + vel[c]!;
      } else {
        vel[c] = rows.length > 0 ? n - prev[c]! : 0;
        v = n;
      }
      prev[c] = v;
      row.push(v);
      c++;
    }
    rows.push(row);
  }
  return rows;
}

interface ChannelDef {
  name: string;
  /** Multiply the raw value by this to get page px (X/Y), 0..1 (F), degrees, or ms. */
  scale: number;
}

const attr = (el: Element, name: string): string | null => el.getAttribute(name);

/** InkML descendants by local name (any prefix). Walks the tree rather than using
 * getElementsByTagNameNS, which some DOM implementations get wrong for parsed XML. */
/** An `ls:` attribute, found by namespace (any prefix). */
function lsAttr(el: Element, local: string): string | null {
  for (const a of el.attributes) {
    if (a.localName === local && a.namespaceURI === LS_NS) return a.value;
  }
  return el.getAttribute(`ls:${local}`);
}

function inkEls(root: Document | Element, local: string): Element[] {
  return [...root.getElementsByTagName('*')].filter(
    (el) => el.localName === local && el.namespaceURI === INKML_NS,
  );
}

function channelScale(name: string, ch: Element, props: Map<string, number>): number {
  const units = attr(ch, 'units') ?? '';
  const res = props.get(name);
  if (name === 'X' || name === 'Y') {
    // Value in `units`, scaled by resolution (values per unit).
    const perUnit = res ?? (units === 'cm' ? 1000 : units === 'in' ? 1 : 1);
    const pxPerUnit = units === 'in' ? 96 : units === 'cm' ? 96 / 2.54 : 1;
    return pxPerUnit / perUnit;
  }
  if (name === 'F') return 1 / (res ?? Number(attr(ch, 'max') ?? F_MAX));
  if (name === 'OTx' || name === 'OTy') return units === 'rad' ? 180 / Math.PI : 1 / (res ?? 1);
  if (name === 'T') return units === 's' ? 1000 : 1;
  return 1;
}

export interface InkMLResult {
  strokes: Stroke[];
  /** Traces we could not read (kept for diagnostics). */
  skipped: number;
}

/** Parse an InkML part into strokes. Unknown elements are ignored. */
export function inkMLToStrokes(xml: string, firstId = 1): InkMLResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const all = (local: string): Element[] => inkEls(doc, local);
  // Channels (the first traceFormat; Office writes one per inkSource).
  const props = new Map<string, number>();
  for (const p of all('channelProperty')) {
    if (attr(p, 'name') === 'resolution') {
      props.set(attr(p, 'channel') ?? '', Number(attr(p, 'value')));
    }
  }
  const format = all('traceFormat')[0];
  const chans: ChannelDef[] = format
    ? inkEls(format, 'channel').map((ch) => {
        const name = attr(ch, 'name') ?? '';
        return { name, scale: channelScale(name, ch, props) };
      })
    : [
        { name: 'X', scale: 1 },
        { name: 'Y', scale: 1 },
      ];
  const brushes = new Map<
    string,
    { tool: StrokeTool; color: string; size: number; pressure: boolean }
  >();
  for (const b of all('brush')) {
    const id =
      attr(b, 'xml:id') ?? b.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id') ?? '';
    const prop = (n: string): Element | undefined =>
      inkEls(b, 'brushProperty').find((p) => attr(p, 'name') === n);
    const value = (n: string): string | null => {
      const p = prop(n);
      return p ? attr(p, 'value') : null;
    };
    const widthEl = prop('width');
    let size = 4;
    if (widthEl) {
      const v = Number(attr(widthEl, 'value'));
      const u = attr(widthEl, 'units') ?? 'cm';
      size = u === 'mm' ? (v * 96) / 25.4 : u === 'in' ? v * 96 : (v * 96) / 2.54;
    }
    const own = lsAttr(b, 'tool') as StrokeTool | null;
    const tool: StrokeTool =
      own ??
      (value('rasterOp') === 'maskPen'
        ? 'highlighter'
        : value('inkEffects') === 'pencil'
          ? 'pencil'
          : 'pen');
    brushes.set(id, {
      tool,
      color: (value('color') ?? '#000000').toLowerCase(),
      size: Math.round(size * 100) / 100,
      pressure: value('ignorePressure') !== '1' && value('ignorePressure') !== 'true',
    });
  }
  const idx = (n: string): number => chans.findIndex((c) => c.name === n);
  const [ix, iy, iF, itx, ity, it] = ['X', 'Y', 'F', 'OTx', 'OTy', 'T'].map(idx) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const strokes: Stroke[] = [];
  let skipped = 0;
  let id = firstId;
  for (const tr of all('trace')) {
    const rows = decodeTrace(tr.textContent, chans.length);
    if (ix < 0 || iy < 0 || rows.length === 0) {
      skipped++;
      continue;
    }
    const ref = (attr(tr, 'brushRef') ?? '').replace(/^#/, '');
    const brush = brushes.get(ref) ?? {
      tool: 'pen' as const,
      color: '#000000',
      size: 4,
      pressure: true,
    };
    const val = (row: number[], i: number, d: number): number =>
      i >= 0 && row[i] !== undefined ? row[i] * chans[i]!.scale : d;
    const t0 = it >= 0 ? val(rows[0]!, it, 0) : 0;
    const points: Point[] = rows.map((r) => [
      Math.round(val(r, ix, 0) * 100) / 100,
      Math.round(val(r, iy, 0) * 100) / 100,
      iF >= 0 ? Math.round(val(r, iF, 0.5) * 1000) / 1000 : 0.5,
      Math.round(val(r, itx, 0)),
      Math.round(val(r, ity, 0)),
      Math.round(val(r, it, 0) - t0),
    ]);
    const shape = lsAttr(tr, 'shape');
    const rec = lsAttr(tr, 'rec');
    const t = lsAttr(tr, 't');
    const source = lsAttr(tr, 'source');
    strokes.push({
      id: id++,
      tool: brush.tool,
      color: brush.color,
      size: brush.size,
      points,
      pressure: brush.pressure && iF >= 0,
      source: source === 'pen' || source === 'touch' || source === 'mouse' ? source : 'import',
      ...(shape === 'line' ? { shape: 'line' as const } : {}),
      ...(rec && t ? { rec, t: Number(t) } : {}),
    });
  }
  return { strokes, skipped };
}

// ---------------------------------------------------------------------------
// Packaging (.docx parts)

export interface InkDocxParts {
  /** Part name (no leading slash) → XML. */
  parts: Record<string, string>;
  /** `<Override …/>` entries for [Content_Types].xml. */
  contentTypes: string[];
  /** `<Relationship …/>` entries for word/_rels/document.xml.rels. */
  relationships: string[];
  /** A `w:r` run to place in a paragraph (floating anchor at the ink's page position). */
  run: string;
}

const EMU_PER_PX = 9525;

/**
 * Build the parts for one ink object. `index` numbers the part (`word/ink/inkN.xml`);
 * `docPrId` must be unique in the document.
 */
export function buildInkDocxParts(
  strokes: readonly Stroke[],
  index = 1,
  docPrId = 1000 + index,
): InkDocxParts {
  const rid = `rIdLsInk${index}`;
  const name = `word/ink/ink${index}.xml`;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      x0 = Math.min(x0, p[0] - s.size / 2);
      y0 = Math.min(y0, p[1] - s.size / 2);
      x1 = Math.max(x1, p[0] + s.size / 2);
      y1 = Math.max(y1, p[1] + s.size / 2);
    }
  }
  if (!Number.isFinite(x0)) [x0, y0, x1, y1] = [0, 0, 1, 1];
  const emu = (px: number): number => Math.max(1, Math.round(px * EMU_PER_PX));
  const [ox, oy, cx, cy] = [emu(x0), emu(y0), emu(x1 - x0), emu(y1 - y0)];
  const vml = strokes
    .map((s) => {
      const pts = s.points
        .map((p) => `${Math.round(p[0] - x0)},${Math.round(p[1] - y0)}`)
        .join(' ');
      const op = s.tool === 'highlighter' ? ' opacity="0.4"' : '';
      return `<v:polyline points="${pts}" filled="f" strokecolor="${s.color}" strokeweight="${((s.size * 72) / 96).toFixed(2)}pt"><v:stroke endcap="round" joinstyle="round"${op}/></v:polyline>`;
    })
    .join('');
  const run = `<w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wpi="${WPI_NS}" xmlns:w14="${W14_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml"><mc:Choice Requires="wpi"><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251659264 + index}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${ox}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${oy}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${docPrId}" name="Ink ${index}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="${WPI_NS}"><w14:contentPart bwMode="auto" r:id="${rid}"><w14:nvContentPartPr><w14:cNvContentPartPr/></w14:nvContentPartPr><w14:xfrm><a:off x="${ox}" y="${oy}"/><a:ext cx="${cx}" cy="${cy}"/></w14:xfrm></w14:contentPart></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:group style="position:absolute;margin-left:${((x0 * 72) / 96).toFixed(2)}pt;margin-top:${((y0 * 72) / 96).toFixed(2)}pt;width:${(((x1 - x0) * 72) / 96).toFixed(2)}pt;height:${(((y1 - y0) * 72) / 96).toFixed(2)}pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;z-index:${index}" coordsize="${Math.round(x1 - x0)},${Math.round(y1 - y0)}">${vml}</v:group></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
  return {
    parts: { [name]: strokesToInkML(strokes) },
    contentTypes: [`<Override PartName="/${name}" ContentType="${INK_CONTENT_TYPE}"/>`],
    relationships: [
      `<Relationship Id="${rid}" Type="${INK_REL_TYPE}" Target="ink/ink${index}.xml"/>`,
    ],
    run,
  };
}
