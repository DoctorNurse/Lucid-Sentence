/**
 * Stroke geometry: outlines (perfect-freehand, MIT), straight-line snapping, hit tests.
 *
 * The straight-line rule and the "draw lines without pressure noise" idea are inspired
 * by Saber (https://github.com/saber-notes/saber); this is an independent implementation.
 */
import { getStroke, type StrokeOptions } from 'perfect-freehand';
import { lean } from './input.js';
import type { Point, Stroke, StrokeTool } from './model.js';

/** Distance from (px, py) to the segment (ax, ay)–(bx, by). */
export function segDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Point-in-polygon (even-odd). */
export function inside(x: number, y: number, poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Closed SVG path through an outline polygon, smoothed with quadratic midpoints. */
export function pathFromOutline(pts: number[][]): string {
  if (pts.length < 2) return '';
  const f = (n: number): string => n.toFixed(2);
  const parts = [`M${f(pts[0]![0]!)},${f(pts[0]![1]!)} Q`];
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    parts.push(`${f(x0!)},${f(y0!)} ${f((x0! + x1!) / 2)},${f((y0! + y1!) / 2)}`);
  }
  return `${parts.join(' ')} Z`;
}

/** Average lean (0 upright … 1 flat) over a stroke's stored tilt. */
export function strokeLean(points: readonly Point[]): number {
  let sum = 0;
  let n = 0;
  for (const p of points) {
    const tx = p[3] ?? 0;
    const ty = p[4] ?? 0;
    if (tx === 0 && ty === 0) continue;
    // Small-angle approximation of altitude from tilt is enough for width.
    const alt = Math.PI / 2 - Math.min(Math.PI / 2, Math.hypot(tx, ty) * (Math.PI / 180));
    sum += lean(alt);
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/** The width a stroke is drawn with (pencil widens with tilt). Deterministic from stored data. */
export function drawSize(
  s: Pick<Stroke, 'tool' | 'size' | 'points'>,
  leanOverride?: number,
): number {
  if (s.tool !== 'pencil') return s.size;
  const l = leanOverride ?? strokeLean(s.points);
  return s.size * 0.8 * (1 + l);
}

export function strokeOptions(
  s: Pick<Stroke, 'tool' | 'size' | 'points' | 'pressure'>,
  last: boolean,
  leanOverride?: number,
): StrokeOptions {
  const tool: StrokeTool = s.tool;
  return {
    size: drawSize(s, leanOverride),
    thinning: tool === 'highlighter' ? 0 : tool === 'pencil' ? 0.75 : 0.6,
    smoothing: 0.55,
    streamline: tool === 'highlighter' ? 0.7 : 0.45,
    simulatePressure: tool !== 'highlighter' && s.pressure !== true,
    last,
    start: { cap: tool !== 'highlighter', taper: 0 },
    end: { cap: tool !== 'highlighter', taper: 0 },
  };
}

/** Outline polygon for a whole stroke. */
export function outline(
  s: Pick<Stroke, 'tool' | 'size' | 'points' | 'pressure'>,
  last = true,
): number[][] {
  const pts = s.points.length === 1 ? [s.points[0]!, nudge(s.points[0]!)] : s.points;
  return getStroke(pts as number[][], strokeOptions(s, last));
}

const nudge = (p: Point): Point => [p[0] + 0.1, p[1] + 0.1, p[2], p[3] ?? 0, p[4] ?? 0, p[5] ?? 0];

/** Every Nth point (keeping the last), for the zoomed-out level of detail. */
export function decimate<T>(points: readonly T[], n: number): T[] {
  if (n <= 1 || points.length <= 8 * n) return [...points];
  const out: T[] = [];
  for (let i = 0; i < points.length - 1; i += n) out.push(points[i]!);
  out.push(points.at(-1)!);
  return out;
}

/** Drop samples closer than `min` px to the previous kept one (keeps first and last). */
export function thinPoints(points: readonly Point[], min: number): Point[] {
  if (points.length <= 2 || min <= 0) return [...points];
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const q = out.at(-1)!;
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= min) out.push(p);
  }
  out.push(points.at(-1)!);
  return out;
}

export function strokeLength(points: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  }
  return len;
}

export interface LineFit {
  /** Largest distance of any sample from the chord, in px. */
  deviation: number;
  /** Chord length in px. */
  length: number;
}

export function lineFit(points: readonly Point[]): LineFit {
  const a = points[0]!;
  const b = points.at(-1)!;
  let deviation = 0;
  for (const p of points)
    deviation = Math.max(deviation, segDist(p[0], p[1], a[0], a[1], b[0], b[1]));
  return { deviation, length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
}

/**
 * Is this stroke meant as a straight line? The chord must be at least 5× the pen width
 * (and 24 px), no sample may stray more than 4% of the length (min 2 px) from it, and the
 * path may not wander (path length ≤ 1.08 × chord).
 */
export function isStraight(points: readonly Point[], size: number): boolean {
  if (points.length < 2) return false;
  const { deviation, length } = lineFit(points);
  if (length < Math.max(24, 5 * size)) return false;
  if (deviation > Math.max(2, length * 0.04)) return false;
  return strokeLength(points) <= length * 1.08;
}

/** Snap a segment to horizontal or vertical when within `deg` degrees. */
export function snapAxis(
  a: [number, number],
  b: [number, number],
  deg = 5,
): [[number, number], [number, number]] {
  const angle = Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0]));
  const snap = (deg * Math.PI) / 180;
  if (angle <= snap) return [a, [b[0], a[1]]];
  if (angle >= Math.PI / 2 - snap) return [a, [a[0], b[1]]];
  return [a, b];
}

/** Replace a stroke's samples with a straight two-point line (average pressure and tilt). */
export function straighten(points: readonly Point[]): Point[] {
  const n = points.length;
  const avg = (i: 2 | 3 | 4): number => points.reduce((s, p) => s + (p[i] ?? 0), 0) / n;
  const p = avg(2);
  const tx = avg(3);
  const ty = avg(4);
  const first = points[0]!;
  const last = points.at(-1)!;
  const [a, b] = snapAxis([first[0], first[1]], [last[0], last[1]]);
  return [
    [a[0], a[1], p, tx, ty, first[5] ?? 0],
    [b[0], b[1], p, tx, ty, last[5] ?? 0],
  ];
}

/**
 * "Hold to straighten": the pen rested (moved less than `radius` px) for at least `ms`
 * before lifting. `liftT` is the lift time on the same clock as the points' `t`.
 */
export function heldAtEnd(points: readonly Point[], liftT: number, ms = 400, radius = 4): boolean {
  if (points.length < 2) return false;
  const last = points.at(-1)!;
  // Time of the last sample that was outside the rest radius.
  let movedAt = points[0]![5] ?? 0;
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!;
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) > radius) {
      movedAt = points[i + 1]![5] ?? movedAt;
      break;
    }
  }
  return liftT - movedAt >= ms;
}
