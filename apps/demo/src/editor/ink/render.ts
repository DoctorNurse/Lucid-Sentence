/**
 * Layered canvas rendering for ink.
 *
 * The page is covered by stacks of canvas **tiles** (one stack per layer). Tiles near the
 * viewport get a backing store at the current zoom × devicePixelRatio; tiles far away
 * release theirs, so a long document doesn't hold a page-sized bitmap per layer. Layers
 * redraw only the dirty rectangle of an edit (add, erase, move, undo), never everything.
 *
 * The live stroke has its own layer, drawn incrementally: finished chunks of the stroke
 * are frozen as `Path2D`s and only the tail is re-outlined on each pointer event.
 */
import { getStroke } from 'perfect-freehand';
import { pathFromOutline, strokeLean, strokeOptions } from './geometry.js';
import type { Point, Stroke } from './model.js';

export type Rect = [x: number, y: number, w: number, h: number];

export const TILE = 1024;
/** Largest backing-store scale (memory: a 816 × 1024 tile at 2.5 is ~5 M pixels). */
export const MAX_SCALE = 2.5;

export function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
}

export function intersects(a: Rect, b: Rect): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

export function pad(r: Rect, n: number): Rect {
  return [r[0] - n, r[1] - n, r[2] + 2 * n, r[3] + 2 * n];
}

export function outlineBox(pts: number[][]): Rect | null {
  if (pts.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x! < x0) x0 = x!;
    if (y! < y0) y0 = y!;
    if (x! > x1) x1 = x!;
    if (y! > y1) y1 = y!;
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

interface Tile {
  canvas: HTMLCanvasElement;
  y0: number;
  h: number;
  ctx: CanvasRenderingContext2D | null;
  scale: number;
}

export type Painter = (ctx: CanvasRenderingContext2D, rect: Rect) => void;

export class TiledLayer {
  readonly el: HTMLDivElement;
  #tiles: Tile[] = [];
  #w = 0;
  #h = 0;
  #view: [number, number] = [0, TILE];
  #scale = 1;

  constructor(
    className: string,
    readonly paint: Painter,
    readonly lowLatency = false,
  ) {
    this.el = document.createElement('div');
    this.el.className = `ink-layer ${className}`;
    this.el.setAttribute('aria-hidden', 'true');
  }

  get tileCount(): number {
    return this.#tiles.length;
  }

  /** Tiles that currently hold a backing store (tests and diagnostics). */
  get liveTiles(): number {
    return this.#tiles.filter((t) => t.ctx).length;
  }

  resize(w: number, h: number): void {
    if (w === this.#w && h === this.#h) return;
    this.#w = w;
    this.#h = h;
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
    const n = Math.max(1, Math.ceil(h / TILE));
    while (this.#tiles.length > n) this.#tiles.pop()!.canvas.remove();
    while (this.#tiles.length < n) {
      const canvas = document.createElement('canvas');
      canvas.className = 'ink-tile';
      this.el.append(canvas);
      this.#tiles.push({ canvas, y0: 0, h: 0, ctx: null, scale: 0 });
    }
    this.#tiles.forEach((t, i) => {
      t.y0 = i * TILE;
      t.h = Math.min(TILE, h - t.y0);
      t.canvas.style.top = `${t.y0}px`;
      t.canvas.style.width = `${w}px`;
      t.canvas.style.height = `${t.h}px`;
      this.#free(t);
    });
    this.#sync();
  }

  /** Visible page range (page px) and the on-screen scale (zoom × devicePixelRatio). */
  setView(top: number, bottom: number, scale: number): void {
    this.#view = [top, bottom];
    this.#scale = Math.max(0.5, Math.min(MAX_SCALE, scale));
    this.#sync();
  }

  #sync(): void {
    const [top, bottom] = this.#view;
    for (const t of this.#tiles) {
      const near = t.y0 + t.h >= top - TILE / 2 && t.y0 <= bottom + TILE / 2;
      if (!near) {
        this.#free(t);
        continue;
      }
      if (t.ctx && Math.abs(t.scale - this.#scale) < 0.05) continue;
      this.#alloc(t);
      this.#redrawTile(t, [0, t.y0, this.#w, t.h]);
    }
  }

  #alloc(t: Tile): void {
    t.scale = this.#scale;
    t.canvas.width = Math.max(1, Math.round(this.#w * t.scale));
    t.canvas.height = Math.max(1, Math.round(t.h * t.scale));
    t.ctx = t.canvas.getContext('2d', this.lowLatency ? { desynchronized: true } : undefined);
  }

  #free(t: Tile): void {
    if (!t.ctx && t.canvas.width === 0) return;
    t.canvas.width = 0;
    t.canvas.height = 0;
    t.ctx = null;
    t.scale = 0;
  }

  #begin(t: Tile, rect: Rect): CanvasRenderingContext2D | null {
    const ctx = t.ctx;
    if (!ctx) return null;
    ctx.setTransform(t.scale, 0, 0, t.scale, 0, -t.y0 * t.scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect[0], rect[1], rect[2], rect[3]);
    ctx.clip();
    return ctx;
  }

  #redrawTile(t: Tile, rect: Rect): void {
    const ctx = this.#begin(t, rect);
    if (!ctx) return;
    ctx.clearRect(rect[0], rect[1], rect[2], rect[3]);
    this.paint(ctx, rect);
    ctx.restore();
  }

  /** Repaint a page rectangle (or everything) from the painter. */
  invalidate(rect?: Rect | null): void {
    const r: Rect = rect ? pad(rect, 2) : [0, 0, this.#w, this.#h];
    for (const t of this.#tiles) {
      if (!t.ctx || !intersects(r, [0, t.y0, this.#w, t.h])) continue;
      this.#redrawTile(t, r);
    }
  }

  /** Draw directly (on top) into every tile the rectangle touches. */
  draw(rect: Rect, fn: (ctx: CanvasRenderingContext2D) => void, clear = false): void {
    const r = pad(rect, 2);
    for (const t of this.#tiles) {
      if (!t.ctx || !intersects(r, [0, t.y0, this.#w, t.h])) continue;
      const ctx = this.#begin(t, r);
      if (!ctx) continue;
      if (clear) ctx.clearRect(r[0], r[1], r[2], r[3]);
      fn(ctx);
      ctx.restore();
    }
  }

  clear(rect?: Rect | null): void {
    if (!rect) {
      for (const t of this.#tiles) {
        if (t.ctx) {
          t.ctx.setTransform(1, 0, 0, 1, 0, 0);
          t.ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
        }
      }
      return;
    }
    this.draw(rect, () => undefined, true);
  }

  /** Read one device pixel at a page point (tests). */
  pixel(x: number, y: number): [number, number, number, number] | null {
    const t = this.#tiles.find((k) => y >= k.y0 && y < k.y0 + k.h);
    if (!t?.ctx) return null;
    const d = t.ctx.getImageData(
      Math.floor(x * t.scale),
      Math.floor((y - t.y0) * t.scale),
      1,
      1,
    ).data;
    return [d[0]!, d[1]!, d[2]!, d[3]!];
  }
}

export interface CachedPath {
  d: string;
  path: Path2D;
  box: Rect;
  lo?: Path2D;
}

const cache = new WeakMap<Stroke, CachedPath>();
const loCache = new WeakMap<Stroke, Path2D>();

/** Outline, SVG path, Path2D, and bounds for a committed stroke (cached per object). */
export function strokePath(s: Stroke, outlineFn: (s: Stroke) => number[][]): CachedPath {
  let c = cache.get(s);
  if (!c) {
    const pts = outlineFn(s);
    const d = pathFromOutline(pts);
    c = { d, path: new Path2D(d), box: outlineBox(pts) ?? [0, 0, 0, 0] };
    cache.set(s, c);
  }
  return c;
}

/** Level of detail for zoomed-out views: every 4th sample, no smoothing. */
export function strokePathLo(s: Stroke, lo: (s: Stroke) => number[][]): Path2D {
  let p = loCache.get(s);
  if (!p) {
    p = new Path2D(pathFromOutline(lo(s)));
    loCache.set(s, p);
  }
  return p;
}

/**
 * Incremental outline of the stroke being drawn. Every `chunk` samples the head of the
 * stroke is frozen into a Path2D; only the tail (plus predicted samples) is re-outlined
 * per event, so the cost per event stays flat however long the stroke gets. Chunks
 * overlap by `overlap` samples so smoothing warms up and joins don't show.
 */
export class LiveOutline {
  readonly frozen: { path: Path2D; box: Rect }[] = [];
  #start = 0;
  #prevTail: Rect | null = null;
  #leanSum = 0;
  #leanN = 0;

  constructor(
    readonly stroke: Stroke,
    readonly chunk = 64,
    readonly overlap = 8,
  ) {}

  /** Running mean lean (pencil width), from samples so far. */
  #lean(): number {
    const pts = this.stroke.points;
    while (this.#leanN < pts.length) {
      this.#leanSum += strokeLean([pts[this.#leanN]!]);
      this.#leanN++;
    }
    return this.#leanN === 0 ? 0 : this.#leanSum / this.#leanN;
  }

  #outline(points: Point[], last: boolean, first: boolean): number[][] {
    const pts =
      points.length === 1
        ? [points[0]!, [points[0]![0] + 0.1, points[0]![1] + 0.1, points[0]![2]]]
        : points;
    const o = strokeOptions(this.stroke, last, this.#lean());
    if (!first) o.start = { cap: true, taper: 0 };
    return getStroke(pts as number[][], o);
  }

  /**
   * Bring the outline up to date. Returns the dirty rectangle to repaint and the
   * tail path (frozen chunks are in `frozen`).
   */
  update(predicted: Point[] = []): { dirty: Rect | null; tail: Path2D | null } {
    const pts = this.stroke.points;
    let dirty: Rect | null = null;
    while (pts.length - this.#start > this.chunk + this.overlap) {
      const end = this.#start + this.chunk;
      const o = this.#outline(pts.slice(this.#start, end + 1), true, this.#start === 0);
      const box = outlineBox(o);
      if (box) {
        this.frozen.push({ path: new Path2D(pathFromOutline(o)), box });
        dirty = union(dirty, box);
      }
      this.#start = end - this.overlap;
    }
    const tailPts = [...pts.slice(this.#start), ...predicted];
    const o = this.#outline(tailPts, false, this.#start === 0);
    const box = outlineBox(o);
    dirty = union(union(dirty, this.#prevTail), box);
    this.#prevTail = box;
    return { dirty, tail: o.length > 1 ? new Path2D(pathFromOutline(o)) : null };
  }

  /** Bounds of everything drawn so far. */
  get box(): Rect | null {
    let b: Rect | null = this.#prevTail;
    for (const f of this.frozen) b = union(b, f.box);
    return b;
  }
}
