import { describe, expect, it } from 'vitest';
import type { Point } from '../src/editor/ink/model.js';
import { recognizeShape } from '../src/editor/ink/shapes.js';

/** Deterministic wobble so "hand-drawn" input is reproducible. */
function wobble(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647 - 0.5) * 2;
  };
}

function trace(
  corners: [number, number][],
  closed: boolean,
  jitter = 2,
  step = 3,
  seed = 7,
): Point[] {
  const r = wobble(seed);
  const ring = closed ? [...corners, corners[0]!] : corners;
  const out: Point[] = [];
  let t = 0;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1]!;
    const [bx, by] = ring[i]!;
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      out.push([
        ax + (bx - ax) * f + r() * jitter,
        ay + (by - ay) * f + r() * jitter,
        0.5,
        0,
        0,
        (t += 8),
      ]);
    }
  }
  const [lx, ly] = ring.at(-1)!;
  out.push([lx + 3, ly + 2, 0.5, 0, 0, t + 8]);
  return out;
}

function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot = 0,
  jitter = 2,
  sweep = 2.05,
): Point[] {
  const r = wobble(11);
  const out: Point[] = [];
  const n = 90;
  for (let i = 0; i <= n * (sweep / 2); i++) {
    const th = (i / n) * 2 * Math.PI;
    const u = rx * Math.cos(th) + r() * jitter;
    const v = ry * Math.sin(th) + r() * jitter;
    out.push([
      cx + u * Math.cos(rot) - v * Math.sin(rot),
      cy + u * Math.sin(rot) + v * Math.cos(rot),
      0.5,
      0,
      0,
      i * 8,
    ]);
  }
  return out;
}

describe('Ink to Shape recognizer', () => {
  it('recognizes a wobbly line and snaps it to the axis', () => {
    const s = recognizeShape(
      trace(
        [
          [10, 100],
          [300, 104],
        ],
        false,
        1.5,
      ),
    );
    expect(s?.kind).toBe('line');
    expect(s!.vertices[1]![1]).toBe(s!.vertices[0]![1]);
  });

  it('recognizes rectangles (axis-aligned and rotated)', () => {
    const r = recognizeShape(
      trace(
        [
          [50, 50],
          [250, 52],
          [252, 170],
          [48, 168],
        ],
        true,
      ),
    );
    expect(r?.kind).toBe('rectangle');
    // Snapped to the axes: two distinct x and two distinct y values.
    expect(new Set(r!.vertices.map((v) => Math.round(v[0]))).size).toBe(2);
    expect(new Set(r!.vertices.map((v) => Math.round(v[1]))).size).toBe(2);
    const a = Math.PI / 6;
    const rot = ([x, y]: [number, number]): [number, number] => [
      200 + x * Math.cos(a) - y * Math.sin(a),
      200 + x * Math.sin(a) + y * Math.cos(a),
    ];
    const rr = recognizeShape(
      trace([rot([-100, -60]), rot([100, -60]), rot([100, 60]), rot([-100, 60])], true),
    );
    expect(rr?.kind).toBe('rectangle');
  });

  it('recognizes triangles and other quadrilaterals', () => {
    expect(
      recognizeShape(
        trace(
          [
            [100, 20],
            [200, 200],
            [10, 190],
          ],
          true,
        ),
      )?.kind,
    ).toBe('triangle');
    expect(
      recognizeShape(
        trace(
          [
            [50, 50],
            [250, 50],
            [300, 170],
            [100, 170],
          ],
          true,
        ),
      )?.kind,
    ).toBe('quad');
  });

  it('recognizes a five-pointed star as a polygon with 10 corners', () => {
    const star: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 120 : 48;
      const th = -Math.PI / 2 + (i * Math.PI) / 5;
      star.push([200 + r * Math.cos(th), 200 + r * Math.sin(th)]);
    }
    const s = recognizeShape(trace(star, true, 1.5));
    expect(s?.kind).toBe('polygon');
    expect(s!.vertices).toHaveLength(10);
  });

  it('recognizes circles and ellipses', () => {
    expect(recognizeShape(ellipse(200, 200, 80, 78))?.kind).toBe('circle');
    expect(recognizeShape(ellipse(200, 200, 140, 60))?.kind).toBe('ellipse');
    expect(recognizeShape(ellipse(200, 200, 140, 60, 0.6))?.kind).toBe('ellipse');
  });

  it('tolerates lumpy, shaky hand-drawn input', () => {
    const lumpy = (rx: number, ry: number, seed: number): Point[] => {
      const r = wobble(seed);
      return Array.from({ length: 95 }, (_, i): Point => {
        const th = (i / 90) * 2 * Math.PI;
        const k = 1 + 0.06 * Math.sin(3 * th + seed) + r() * 0.03;
        return [200 + rx * k * Math.cos(th), 200 + ry * k * Math.sin(th), 0.5, 0, 0, i * 8];
      });
    };
    const kinds = { circle: 0, ellipse: 0, rectangle: 0, triangle: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      if (recognizeShape(lumpy(70, 70, seed))?.kind === 'circle') kinds.circle++;
      if (recognizeShape(lumpy(120, 60, seed))?.kind === 'ellipse') kinds.ellipse++;
      const rect = trace(
        [
          [50, 50],
          [250, 55],
          [245, 170],
          [48, 165],
        ],
        true,
        3.5,
        3,
        seed,
      );
      if (recognizeShape(rect)?.kind === 'rectangle') kinds.rectangle++;
      const tri = trace(
        [
          [100, 20],
          [200, 200],
          [10, 190],
        ],
        true,
        3.5,
        3,
        seed,
      );
      if (recognizeShape(tri)?.kind === 'triangle') kinds.triangle++;
    }
    expect(kinds.circle).toBe(20);
    expect(kinds.rectangle).toBe(20);
    expect(kinds.triangle).toBe(20);
    expect(kinds.ellipse).toBeGreaterThanOrEqual(18);
  });

  it('closed shapes come back closed, with the original timing range', () => {
    const src = ellipse(200, 200, 80, 80);
    const s = recognizeShape(src)!;
    const a = s.points[0]!;
    const b = s.points.at(-1)!;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1);
    expect(a[5]).toBe(src[0]![5]);
    expect(b[5]).toBe(src.at(-1)![5]);
  });

  it('leaves handwriting, open curves, and tiny marks alone', () => {
    // An open arc (a "C").
    expect(recognizeShape(ellipse(200, 200, 80, 80, 0, 1, 1.4))).toBeNull();
    // Cursive-like loops.
    const loops: Point[] = [];
    for (let i = 0; i < 200; i++) {
      const th = i / 6;
      loops.push([20 + i * 1.2 + 10 * Math.cos(th), 100 + 18 * Math.sin(th), 0.5, 0, 0, i * 8]);
    }
    expect(recognizeShape(loops)).toBeNull();
    // A dot / tick.
    expect(
      recognizeShape(
        trace(
          [
            [10, 10],
            [14, 18],
            [22, 4],
          ],
          false,
          0.5,
        ),
      ),
    ).toBeNull();
    // A zig-zag (open).
    expect(
      recognizeShape(
        trace(
          [
            [0, 0],
            [40, 60],
            [80, 0],
            [120, 60],
            [160, 0],
          ],
          false,
        ),
      ),
    ).toBeNull();
  });
});
