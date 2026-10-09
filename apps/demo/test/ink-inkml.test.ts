import { describe, expect, it } from 'vitest';
import {
  buildInkDocxParts,
  decodeTrace,
  inkDocxEnabled,
  inkMLToStrokes,
  INK_CONTENT_TYPE,
  INK_REL_TYPE,
  strokesToInkML,
} from '../src/editor/ink/inkml.js';
import type { Point, Stroke } from '../src/editor/ink/model.js';

const pts = (n: number, y = 40): Point[] =>
  Array.from({ length: n }, (_, i): Point => [
    12.5 + i * 7.25,
    y + Math.round(Math.sin(i) * 500) / 100,
    Math.round((0.3 + i * 0.05) * 1000) / 1000,
    10 - i,
    -5 + i,
    i * 16,
  ]);

const strokes: Stroke[] = [
  { id: 1, tool: 'pen', color: '#1a73e8', size: 3, points: pts(8), pressure: true, source: 'pen' },
  {
    id: 2,
    tool: 'pencil',
    color: '#333333',
    size: 2.5,
    points: pts(5, 90),
    pressure: true,
    source: 'pen',
    rec: 'rec-1',
    t: 4200,
  },
  {
    id: 3,
    tool: 'highlighter',
    color: '#ffeb3b',
    size: 16,
    points: [
      [20, 140, 0.5, 0, 0, 0],
      [300, 140, 0.5, 0, 0, 0],
    ],
    pressure: false,
    source: 'touch',
    shape: 'line',
  },
];

/** Positions survive to within InkML's himetric grid (1/1000 cm ≈ 0.038 px). */
function expectClose(a: Stroke[], b: Stroke[]): void {
  expect(a).toHaveLength(b.length);
  a.forEach((s, i) => {
    const e = b[i]!;
    expect({
      tool: s.tool,
      color: s.color,
      source: s.source,
      shape: s.shape,
      rec: s.rec,
      t: s.t,
    }).toEqual({
      tool: e.tool,
      color: e.color,
      source: e.source,
      shape: e.shape,
      rec: e.rec,
      t: e.t,
    });
    expect(s.size).toBeCloseTo(e.size, 1);
    expect(s.pressure).toBe(e.pressure);
    expect(s.points).toHaveLength(e.points.length);
    s.points.forEach((p, j) => {
      const q = e.points[j]!;
      expect(Math.abs(p[0] - q[0])).toBeLessThan(0.05);
      expect(Math.abs(p[1] - q[1])).toBeLessThan(0.05);
      if (e.pressure) expect(Math.abs(p[2] - q[2])).toBeLessThan(0.001);
      expect(p[3]).toBe(q[3]);
      expect(p[4]).toBe(q[4]);
      expect(p[5]).toBe(q[5]);
    });
  });
}

describe('InkML', () => {
  it('round-trips strokes: tool, color, width, pressure, tilt, time, audio link', () => {
    const xml = strokesToInkML(strokes);
    expect(xml).toContain('xmlns:inkml="http://www.w3.org/2003/InkML"');
    expect(xml).toContain('name="rasterOp" value="maskPen"');
    expect(xml).toContain('name="inkEffects" value="pencil"');
    const back = inkMLToStrokes(xml, 1);
    expect(back.skipped).toBe(0);
    expectClose(back.strokes, strokes);
    // And again: a second round trip is stable.
    expectClose(inkMLToStrokes(strokesToInkML(back.strokes)).strokes, back.strokes);
  });

  it('shares one brush between strokes that look the same', () => {
    const twin = { ...strokes[0]!, id: 9 };
    const xml = strokesToInkML([strokes[0]!, twin]);
    expect(xml.match(/<inkml:brush /g)).toHaveLength(1);
  });

  it('reads Office-style ink (no ls: attributes, difference-encoded traces)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<inkml:ink xmlns:inkml="http://www.w3.org/2003/InkML">
  <inkml:definitions>
    <inkml:context xml:id="ctx0">
      <inkml:inkSource xml:id="inkSrc0">
        <inkml:traceFormat>
          <inkml:channel name="X" type="integer" max="32767" units="cm"/>
          <inkml:channel name="Y" type="integer" max="32767" units="cm"/>
          <inkml:channel name="F" type="integer" max="32767" units="dev"/>
          <inkml:channel name="T" type="integer" max="2.14748E9" units="dev"/>
        </inkml:traceFormat>
        <inkml:channelProperties>
          <inkml:channelProperty channel="X" name="resolution" value="1000" units="1/cm"/>
          <inkml:channelProperty channel="Y" name="resolution" value="1000" units="1/cm"/>
          <inkml:channelProperty channel="F" name="resolution" value="32767" units="1/dev"/>
          <inkml:channelProperty channel="T" name="resolution" value="1" units="1/dev"/>
        </inkml:channelProperties>
      </inkml:inkSource>
      <inkml:timestamp xml:id="ts0" timeString="2026-10-09T05:00:00.000"/>
    </inkml:context>
    <inkml:brush xml:id="br0">
      <inkml:brushProperty name="width" value="0.35" units="cm"/>
      <inkml:brushProperty name="height" value="0.35" units="cm"/>
      <inkml:brushProperty name="color" value="#FFFF00"/>
      <inkml:brushProperty name="tip" value="rectangle"/>
      <inkml:brushProperty name="rasterOp" value="maskPen"/>
    </inkml:brush>
  </inkml:definitions>
  <inkml:trace contextRef="#ctx0" brushRef="#br0">1000 2000 16000 0, '100 '0 '0 '16, "0 "0 "0 "0, !5000 !2000 !16000 !100</inkml:trace>
  <inkml:trace contextRef="#ctx0" brushRef="#missing">0 0 0 0, 10 10 0 0</inkml:trace>
</inkml:ink>`;
    const { strokes: out, skipped } = inkMLToStrokes(xml, 5);
    expect(skipped).toBe(0);
    expect(out).toHaveLength(2);
    const [hl, plain] = out as [Stroke, Stroke];
    expect(hl).toMatchObject({ id: 5, tool: 'highlighter', color: '#ffff00', source: 'import' });
    expect(hl.size).toBeCloseTo(13.23, 1); // 0.35 cm
    const cm = 96 / 2.54 / 1000;
    expect(hl.points.map((p) => [p[0], p[5]])).toEqual([
      [Math.round(1000 * cm * 100) / 100, 0],
      [Math.round(1100 * cm * 100) / 100, 16],
      [Math.round(1200 * cm * 100) / 100, 32],
      [Math.round(5000 * cm * 100) / 100, 100],
    ]);
    expect(hl.points[0]![2]).toBeCloseTo(16000 / 32767, 3);
    expect(plain.tool).toBe('pen');
  });

  it('decodes first and second differences per channel', () => {
    expect(decodeTrace(`10 20, '1 '2, '1 '2, "1 "0, !0 !0`, 2)).toEqual([
      [10, 20],
      [11, 22],
      [12, 24],
      [14, 26],
      [0, 0],
    ]);
    // Modes persist per channel; values without a prefix keep the last mode.
    expect(decodeTrace(`0 0, '5 0, 5 1`, 2)).toEqual([
      [0, 0],
      [5, 0],
      [10, 1],
    ]);
  });

  it('skips traces without X/Y', () => {
    const xml = `<inkml:ink xmlns:inkml="http://www.w3.org/2003/InkML"><inkml:trace></inkml:trace></inkml:ink>`;
    expect(inkMLToStrokes(xml)).toEqual({ strokes: [], skipped: 1 });
  });
});

describe('.docx ink parts', () => {
  it('builds the ink part, content type, relationship and an anchored run', () => {
    const out = buildInkDocxParts(strokes, 2);
    expect(Object.keys(out.parts)).toEqual(['word/ink/ink2.xml']);
    expect(out.contentTypes[0]).toContain(`ContentType="${INK_CONTENT_TYPE}"`);
    expect(out.relationships[0]).toContain(`Type="${INK_REL_TYPE}"`);
    expect(out.relationships[0]).toContain('Target="ink/ink2.xml"');
    expect(out.run).toContain('Requires="wpi"');
    expect(out.run).toContain('r:id="rIdLsInk2"');
    expect(out.run).toContain('<v:polyline');
    // The run must be well-formed XML once w: is declared.
    const doc = new DOMParser().parseFromString(
      out.run.replace(
        '<w:r>',
        '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      ),
      'application/xml',
    );
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    // The part reads back to the same strokes.
    expectClose(inkMLToStrokes(out.parts['word/ink/ink2.xml']!).strokes, strokes);
  });

  it('anchors at the ink bounds in EMU', () => {
    const one: Stroke[] = [
      {
        id: 1,
        tool: 'pen',
        color: '#000000',
        size: 2,
        points: [
          [101, 201, 0.5],
          [201, 301, 0.5],
        ],
      },
    ];
    const { run } = buildInkDocxParts(one);
    expect(run).toContain(`<wp:posOffset>${100 * 9525}</wp:posOffset>`);
    expect(run).toContain(`<wp:extent cx="${102 * 9525}" cy="${102 * 9525}"/>`);
  });

  it('is behind a flag', () => {
    expect(inkDocxEnabled('', '')).toBe(false);
    expect(inkDocxEnabled('?inkdocx=1', '')).toBe(true);
    expect(inkDocxEnabled('', 'foo,inkdocx')).toBe(true);
  });
});
