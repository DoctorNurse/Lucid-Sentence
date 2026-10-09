import { describe, expect, it } from 'vitest';
import {
  heldAtEnd,
  isStraight,
  snapAxis,
  straighten,
  strokeLean,
  drawSize,
  thinPoints,
  strokeOptions,
} from '../src/editor/ink/geometry.js';
import {
  decodeInk,
  encodeInk,
  fromInkStroke,
  toInkStroke,
  upgradeV0,
  type Point,
  type Stroke,
} from '../src/editor/ink/model.js';
import { LiveOutline, TILE } from '../src/editor/ink/render.js';

const line = (n: number, dx = 4, dy = 0, t0 = 0, dt = 16): Point[] =>
  Array.from({ length: n }, (_, i): Point => [10 + i * dx, 20 + i * dy, 0.6, 12, -8, t0 + i * dt]);

const stroke = (over: Partial<Stroke> = {}): Stroke => ({
  id: 1,
  tool: 'pen',
  color: '#1a73e8',
  size: 4,
  points: line(10),
  pressure: true,
  source: 'pen',
  ...over,
});

describe('ink model', () => {
  it('interchange round trip keeps pressure, tilt and time', () => {
    const s = stroke({ shape: 'line', rec: 'r1', t: 1234 });
    const k = toInkStroke(s);
    expect(k.channels).toEqual(['x', 'y', 'p', 'tx', 'ty', 't']);
    expect(k.data).toBeInstanceOf(Float32Array);
    expect(k.brush).toMatchObject({ tool: 'pen', color: '#1a73e8', width: 4, pressure: true });
    expect(fromInkStroke(k, 1)).toEqual(s);
  });
  it('storage envelope round trip', () => {
    const strokes = [
      stroke(),
      stroke({ id: 2, tool: 'highlighter', color: '#ffeb3b', size: 14, pressure: false }),
    ];
    const stored = JSON.parse(JSON.stringify(encodeInk(strokes))) as unknown;
    expect((stored as { v: number }).v).toBe(1);
    expect(decodeInk(stored)).toEqual(strokes);
  });
  it('reads old drafts (v0 arrays)', () => {
    const v0 = [
      {
        id: 7,
        tool: 'pen',
        color: '#000',
        size: 3,
        points: [
          [1, 2, 0.5],
          [3, 4, 0.5],
        ],
      },
      {
        id: 8,
        tool: 'pencil',
        color: '#000',
        size: 3,
        points: [
          [1, 2, 0.8],
          [3, 4, 0.5],
        ],
      },
    ];
    const out = decodeInk(v0);
    expect(out[0]!.pressure).toBe(false);
    expect(out[1]!.pressure).toBe(true);
    expect(out[0]!.points[1]).toEqual([3, 4, 0.5]);
    expect(
      upgradeV0([{ ...v0[0]!, tool: 'pen', points: [[1, 2, 0.3, 5, 6, 7]] }])[0]!.points,
    ).toEqual([[1, 2, 0.3, 5, 6, 7]]);
    expect(decodeInk(null)).toEqual([]);
  });
});

describe('geometry', () => {
  it('pencil width follows stored tilt, so it survives a re-render', () => {
    const upright = stroke({
      tool: 'pencil',
      points: line(10).map((p) => [p[0], p[1], p[2], 0, 0, p[5]!]),
    });
    const leaning = stroke({
      tool: 'pencil',
      points: line(10).map((p) => [p[0], p[1], p[2], 50, 0, p[5]!]),
    });
    expect(strokeLean(upright.points)).toBe(0);
    expect(strokeLean(leaning.points)).toBeGreaterThan(0.5);
    expect(drawSize(leaning)).toBeGreaterThan(drawSize(upright));
    expect(drawSize(stroke({ tool: 'pen' }))).toBe(4);
  });
  it('simulates pressure only when the device gave none', () => {
    expect(strokeOptions(stroke(), true).simulatePressure).toBe(false);
    expect(strokeOptions(stroke({ pressure: false }), true).simulatePressure).toBe(true);
    expect(
      strokeOptions(stroke({ tool: 'highlighter', pressure: false }), true).simulatePressure,
    ).toBe(false);
  });
  it('detects straight lines and rejects wiggles and short dabs', () => {
    expect(isStraight(line(30), 4)).toBe(true);
    expect(isStraight(line(3), 4)).toBe(false);
    const wiggle = line(30).map((p, i): Point => [p[0], p[1] + (i % 2 ? 9 : -9), p[2]]);
    expect(isStraight(wiggle, 4)).toBe(false);
  });
  it('snaps near-axis lines and straightens to two points', () => {
    expect(snapAxis([0, 0], [100, 4])).toEqual([
      [0, 0],
      [100, 0],
    ]);
    expect(snapAxis([0, 0], [3, 100])).toEqual([
      [0, 0],
      [0, 100],
    ]);
    expect(snapAxis([0, 0], [100, 50])).toEqual([
      [0, 0],
      [100, 50],
    ]);
    const s = straighten(line(20, 5, 0.2));
    expect(s).toHaveLength(2);
    expect(s[0]![1]).toBe(s[1]![1]);
    expect(s[0]![3]).toBe(12); // tilt kept
  });
  it('hold to straighten needs a 400 ms rest before lift', () => {
    const moving = line(20);
    const last = moving.at(-1)!;
    const resting: Point[] = [...moving, [last[0] + 1, last[1], 0.6, 0, 0, last[5]! + 100]];
    expect(heldAtEnd(resting, last[5]! + 500)).toBe(true);
    expect(heldAtEnd(resting, last[5]! + 200)).toBe(false);
  });
  it('thins by distance but keeps the ends', () => {
    const dense = line(50, 0.5);
    const thin = thinPoints(dense, 2);
    expect(thin.length).toBeLessThan(dense.length);
    expect(thin[0]).toEqual(dense[0]);
    expect(thin.at(-1)).toEqual(dense.at(-1));
  });
});

describe('incremental outline', () => {
  // happy-dom has no Path2D; the outline only needs to construct one.
  (globalThis as Record<string, unknown>).Path2D ??= class {
    constructor(readonly d?: string) {}
  };
  it('freezes chunks and reports dirty regions', () => {
    const s = stroke({ points: [] });
    const live = new LiveOutline(s);
    let frozenBefore = 0;
    for (let i = 0; i < 200; i++) {
      s.points.push([10 + i * 3, 20 + Math.sin(i / 8) * 10, 0.6, 0, 0, i * 8]);
      const r = live.update([]);
      expect(r.tail).not.toBeNull();
      if (i > 3) expect(r.dirty).not.toBeNull();
      expect(live.frozen.length).toBeGreaterThanOrEqual(frozenBefore);
      frozenBefore = live.frozen.length;
    }
    expect(live.frozen.length).toBeGreaterThan(1);
    expect(live.box![2]).toBeGreaterThan(500);
    expect(TILE).toBe(1024);
  });
});
