/**
 * Ink to Shape: recognize a hand-drawn stroke as a line, triangle, rectangle,
 * quadrilateral, polygon (5-12 corners, stars included), circle, or ellipse, and
 * replace its samples with a clean version of that shape.
 *
 * Plain geometry, no model: resample the path, find corners with Ramer-Douglas-Peucker,
 * fit an ellipse along the principal axes, and keep whichever explains the stroke best.
 */
import { segDist } from './geometry.js';
import type { Point, ShapeKind } from './model.js';

export interface RecognizedShape {
  kind: ShapeKind;
  /** Corners (polygons) or the two ends (line), in page px. */
  vertices: [number, number][];
  /** The new samples, densified along the outline (closed shapes end where they start). */
  points: Point[];
}

type XY = [number, number];

const dist = (a: XY, b: XY): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pathLength(p: readonly XY[]): number {
  let n = 0;
  for (let i = 1; i < p.length; i++) n += dist(p[i - 1]!, p[i]!);
  return n;
}

/** `n` points evenly spaced along the polyline. */
export function resample(p: readonly XY[], n: number): XY[] {
  const total = pathLength(p);
  if (p.length < 2 || total === 0) return p.length ? Array.from({ length: n }, () => p[0]!) : [];
  const step = total / (n - 1);
  const out: XY[] = [p[0]!];
  let acc = 0;
  for (let i = 1; i < p.length && out.length < n; i++) {
    let a = p[i - 1]!;
    const b = p[i]!;
    let d = dist(a, b);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const q: XY = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(q);
      a = q;
      d = dist(a, b);
      acc = 0;
    }
    acc += d;
  }
  while (out.length < n) out.push(p.at(-1)!);
  return out;
}

/** Ramer-Douglas-Peucker on an open polyline: indices of the kept points. */
function rdp(
  p: readonly XY[],
  eps: number,
  lo = 0,
  hi = p.length - 1,
  out = new Set<number>([0, p.length - 1]),
): Set<number> {
  let best = -1;
  let bestD = 0;
  for (let i = lo + 1; i < hi; i++) {
    const d = segDist(p[i]![0], p[i]![1], p[lo]![0], p[lo]![1], p[hi]![0], p[hi]![1]);
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0 && bestD > eps) {
    out.add(best);
    rdp(p, eps, lo, best, out);
    rdp(p, eps, best, hi, out);
  }
  return out;
}

/** Interior angle at b (degrees). */
function angleAt(a: XY, b: XY, c: XY): number {
  const v1: XY = [a[0] - b[0], a[1] - b[1]];
  const v2: XY = [c[0] - b[0], c[1] - b[1]];
  const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Mean distance of the samples to a closed polygon, relative to its size. */
function polygonError(samples: readonly XY[], poly: readonly XY[], size: number): number {
  let sum = 0;
  for (const p of samples) {
    let m = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      m = Math.min(m, segDist(p[0], p[1], a[0], a[1], b[0], b[1]));
    }
    sum += m;
  }
  return sum / samples.length / size;
}

interface EllipseFit {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Rotation of the x radius, radians. */
  rot: number;
  error: number;
}

/** Ellipse along the principal axes of the samples. */
export function fitEllipse(samples: readonly XY[]): EllipseFit {
  const n = samples.length;
  const cx = samples.reduce((s, p) => s + p[0], 0) / n;
  const cy = samples.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of samples) {
    sxx += (x - cx) ** 2;
    syy += (y - cy) ** 2;
    sxy += (x - cx) * (y - cy);
  }
  const rot = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  const uv = samples.map(([x, y]): XY => {
    const u = (x - cx) * c + (y - cy) * s;
    const v = -(x - cx) * s + (y - cy) * c;
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
    return [u, v];
  });
  const rx = Math.max(1, (u1 - u0) / 2);
  const ry = Math.max(1, (v1 - v0) / 2);
  const mu = (u0 + u1) / 2;
  const mv = (v0 + v1) / 2;
  let error = 0;
  for (const [u, v] of uv) error += Math.abs(Math.hypot((u - mu) / rx, (v - mv) / ry) - 1);
  return {
    cx: cx + mu * c - mv * s,
    cy: cy + mu * s + mv * c,
    rx,
    ry,
    rot,
    error: error / n,
  };
}

/** Densify a polyline into samples every ~`step` px, with constant pressure. */
function samplesAlong(
  poly: readonly XY[],
  closed: boolean,
  p: number,
  t0: number,
  t1: number,
  step = 3,
): Point[] {
  const ring = closed ? [...poly, poly[0]!] : [...poly];
  const total = pathLength(ring) || 1;
  const out: Point[] = [];
  let run = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!;
    const b = ring[i]!;
    const d = dist(a, b);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      const t = t0 + ((run + d * f) / total) * (t1 - t0);
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, p, 0, 0, Math.round(t)]);
    }
    run += d;
  }
  const last = ring.at(-1)!;
  out.push([last[0], last[1], p, 0, 0, Math.round(t1)]);
  return out;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Snap a rectangle-ish quad to a clean rectangle (axis-aligned when within 8°). */
function cleanRectangle(v: readonly XY[]): XY[] {
  // Orientation from the longest edge.
  let best = 0;
  let rot = 0;
  for (let i = 0; i < 4; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % 4]!;
    const d = dist(a, b);
    if (d > best) {
      best = d;
      rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  // Fold into [-45°, 45°).
  rot = ((((rot + Math.PI / 4) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) - Math.PI / 4;
  if (Math.abs(rot) < (8 * Math.PI) / 180) rot = 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const cx = v.reduce((n, p) => n + p[0], 0) / 4;
  const cy = v.reduce((n, p) => n + p[1], 0) / 4;
  let u0 = Infinity;
  let u1 = -Infinity;
  let w0 = Infinity;
  let w1 = -Infinity;
  for (const [x, y] of v) {
    const u = (x - cx) * c + (y - cy) * s;
    const w = -(x - cx) * s + (y - cy) * c;
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    w0 = Math.min(w0, w);
    w1 = Math.max(w1, w);
  }
  const back = (u: number, w: number): XY => [cx + u * c - w * s, cy + u * s + w * c];
  return [back(u0, w0), back(u1, w0), back(u1, w1), back(u0, w1)];
}

/**
 * Recognize `points` as a shape, or return null (handwriting, scribbles, and open curves
 * stay as they are).
 */
export function recognizeShape(points: readonly Point[]): RecognizedShape | null {
  if (points.length < 3) return null;
  const raw = points.map((p): XY => [p[0], p[1]]);
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const diag = Math.hypot(w, h);
  if (diag < 24) return null;
  const pressure = points.reduce((s, p) => s + p[2], 0) / points.length;
  const t0 = points[0]![5] ?? 0;
  const t1 = points.at(-1)![5] ?? t0;
  const len = pathLength(raw);
  const chord = dist(raw[0]!, raw.at(-1)!);

  // Line: the path barely wanders from its chord.
  if (chord > 0.85 * diag && len <= chord * 1.12) {
    let dev = 0;
    for (const p of raw)
      dev = Math.max(
        dev,
        segDist(p[0], p[1], raw[0]![0], raw[0]![1], raw.at(-1)![0], raw.at(-1)![1]),
      );
    if (dev <= Math.max(3, chord * 0.06)) {
      let a = raw[0]!;
      let b = raw.at(-1)!;
      const ang = Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0]));
      const snap = (5 * Math.PI) / 180;
      if (ang <= snap) b = [b[0], a[1]];
      else if (ang >= Math.PI / 2 - snap) b = [a[0], b[1]];
      a = [r2(a[0]), r2(a[1])];
      b = [r2(b[0]), r2(b[1])];
      return {
        kind: 'line',
        vertices: [a, b],
        points: samplesAlong([a, b], false, pressure, t0, t1),
      };
    }
  }

  // Everything else must be (nearly) closed and not tiny.
  if (chord > Math.max(16, 0.22 * diag)) return null;
  if (Math.min(w, h) < 8 && len < 3 * diag) return null;

  // Close the loop, trim an overshoot, resample.
  const ring = resample([...raw, raw[0]!], 97).slice(0, 96);
  const ell = fitEllipse(ring);

  // Corners: start at the sample farthest from the centroid (always a corner on a polygon).
  let far = 0;
  let farD = 0;
  ring.forEach((p, i) => {
    const d = Math.hypot(p[0] - ell.cx, p[1] - ell.cy);
    if (d > farD) {
      farD = d;
      far = i;
    }
  });
  const rot = [...ring.slice(far), ...ring.slice(0, far)];
  const keep = [...rdp([...rot, rot[0]!], diag * 0.055)]
    .filter((i) => i < rot.length)
    .sort((a, b) => a - b);
  let verts = keep.map((i) => rot[i]!);
  // Drop near-straight "corners" (RDP keeps a few on long gentle edges).
  for (let pass = 0; pass < 3 && verts.length > 3; pass++) {
    const next = verts.filter(
      (v, i) =>
        angleAt(verts[(i - 1 + verts.length) % verts.length]!, v, verts[(i + 1) % verts.length]!) <
        160,
    );
    if (next.length === verts.length || next.length < 3) break;
    verts = next;
  }
  const polyErr = verts.length >= 3 ? polygonError(ring, verts, diag) : Infinity;

  const angles = verts.map((v, i) =>
    angleAt(verts[(i - 1 + verts.length) % verts.length]!, v, verts[(i + 1) % verts.length]!),
  );
  // A clean polygon explains the samples far better than any ellipse (its error is a
  // small fraction of the ellipse's). A smooth curve is the other way round, and RDP
  // cuts it into many shallow "corners" (all wider than 125°).
  const shallow = verts.length >= 5 && Math.min(...angles) > 125;
  const roundish = ell.error < 0.1 && (polyErr > ell.error * 0.2 || shallow);
  const polygonish = verts.length >= 3 && verts.length <= 12 && polyErr < 0.03 && !roundish;

  if (polygonish) {
    const n = verts.length;
    let kind: ShapeKind = n === 3 ? 'triangle' : n === 4 ? 'quad' : 'polygon';
    let clean = verts;
    if (n === 4 && angles.every((a) => Math.abs(a - 90) <= 15)) {
      kind = 'rectangle';
      clean = cleanRectangle(verts);
    }
    clean = clean.map(([x, y]): XY => [r2(x), r2(y)]);
    // Start where the pen started.
    let s0 = 0;
    clean.forEach((v, i) => {
      if (dist(v, raw[0]!) < dist(clean[s0]!, raw[0]!)) s0 = i;
    });
    clean = [...clean.slice(s0), ...clean.slice(0, s0)];
    return { kind, vertices: clean, points: samplesAlong(clean, true, pressure, t0, t1) };
  }
  if (roundish) {
    let { rx, ry, rot: a } = ell;
    const circle = Math.min(rx, ry) / Math.max(rx, ry) > 0.86;
    if (circle) rx = ry = (rx + ry) / 2;
    else if (Math.abs(Math.sin(2 * a)) < Math.sin((16 * Math.PI) / 180)) {
      // Snap a nearly axis-aligned ellipse.
      const swap = Math.abs(Math.sin(a)) > 0.7;
      a = 0;
      if (swap) [rx, ry] = [ry, rx];
    }
    // Start at the angle where the pen started, keep its direction.
    const c = Math.cos(a);
    const s = Math.sin(a);
    const local = (p: XY): number => {
      const u = (p[0] - ell.cx) * c + (p[1] - ell.cy) * s;
      const v = -(p[0] - ell.cx) * s + (p[1] - ell.cy) * c;
      return Math.atan2(v / ry, u / rx);
    };
    const th0 = local(raw[0]!);
    const dir = Math.sign(local(raw[Math.min(raw.length - 1, 4)]!) - th0 || 1);
    const steps = Math.max(36, Math.min(144, Math.round((Math.PI * (rx + ry)) / 3)));
    const poly: XY[] = [];
    for (let i = 0; i < steps; i++) {
      const th = th0 + (dir * 2 * Math.PI * i) / steps;
      const u = rx * Math.cos(th);
      const v = ry * Math.sin(th);
      poly.push([r2(ell.cx + u * c - v * s), r2(ell.cy + u * s + v * c)]);
    }
    return {
      kind: circle ? 'circle' : 'ellipse',
      vertices: [[r2(ell.cx), r2(ell.cy)]],
      points: samplesAlong(poly, true, pressure, t0, t1, 1000),
    };
  }
  return null;
}
