/**
 * Ink layer for the Draw tab and Notes mode (Pointer Events: pen, touch, mouse).
 *
 * - Pressure-sensitive, smoothed strokes (perfect-freehand, MIT), rendered as SVG.
 * - Pen, pencil (tilt widens the line), highlighter, stroke and point erasers, lasso select.
 * - Touch: fingers draw when "Draw with Touch" is on (the default on phones, where many
 *   styluses are capacitive and report pointerType 'touch'). Two fingers scroll and pinch-zoom.
 * - Palm rejection: once a real pen (pointerType 'pen') is detected, a phone's default
 *   switches to pen only; touch is also ignored while a pen is in contact or hovering.
 * - Pen hover preview (pen pointer moves with no contact; tracked by pointer id, because
 *   some Android WebViews report buttons = 0 or pressure = 0 during contact).
 * - Android: a pen's touch events are cancelled while it draws, so the WebView never turns
 *   the stroke into a scroll (which would fire pointercancel and cut the line short).
 * - Stylus barrel/eraser buttons (buttons bitmask 2 or 32) erase while held.
 * - Every change is an undoable operation (see history.ts).
 * - Strokes carry a recording timestamp when audio is recording (Notes mode).
 */
import { getStroke } from 'perfect-freehand';

export type InkTool = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'point-eraser' | 'lasso';
export type Point = [x: number, y: number, pressure: number];

export interface Stroke {
  id: number;
  tool: 'pen' | 'pencil' | 'highlighter';
  color: string;
  size: number;
  points: Point[];
  /** Milliseconds into the active audio recording when the stroke began. */
  t?: number;
  /** Recording the timestamp belongs to. */
  rec?: string;
}

export type InkOp =
  | { kind: 'add'; strokes: Stroke[] }
  | { kind: 'remove'; strokes: Stroke[] }
  | { kind: 'replace'; before: Stroke[]; after: Stroke[] }
  | { kind: 'move'; ids: number[]; dx: number; dy: number };

export interface InkOptions {
  /** A real pen was detected for the first time while touch drawing was the default. */
  onPenDetected?: () => void;
  /** Current zoom in percent, and a setter (two-finger pinch while drawing). */
  getZoom?: () => number;
  setZoom?: (percent: number) => void;
  /** Called for each completed operation (for the shared undo timeline). */
  onOp: (op: InkOp) => void;
  /** A pen touched the page while draw mode was off. Return true to start drawing. */
  onPenWhileIdle: () => boolean;
  onStatus?: (msg: string) => void;
  /** Current recording position, if audio is recording. */
  clock?: () => { rec: string; t: number } | null;
  /** A timestamped stroke was tapped while not drawing (seek playback). */
  onStrokeTap?: (stroke: Stroke) => void;
}

const SVG = 'http://www.w3.org/2000/svg';
const ERASER_BUTTONS = 2 | 32;

function pathFromOutline(pts: number[][]): string {
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

export class InkLayer {
  strokes: Stroke[] = [];
  tool: InkTool = 'pen';
  color = '#1a1916';
  size = 4;
  active = false;
  /** Let fingers draw (Word: Draw with Touch). Off = pen only; touch scrolls. */
  drawWithTouch = false;
  /** Enter draw mode automatically when a pen touches the page. */
  autoSwitch = true;
  /**
   * Touch drawing is the device default (phones), not a user choice: the first real pen
   * turns it off so the pen gets palm rejection.
   */
  touchAuto = false;
  /** A pointer with pointerType 'pen' has been seen this session. */
  penDetected = false;
  /** Pointer type of the last accepted stroke (status and tests). */
  lastPointerType = '';
  /** Count of touches rejected as palms (tests and diagnostics). */
  rejected = 0;
  selected = new Set<number>();

  #nextId = 1;
  #live: { stroke: Stroke; path: SVGPathElement; pointerType: string } | null = null;
  #penSeenAt = -Infinity;
  /** Pointers in contact with the ink layer (pen hover = a pen move not in this set). */
  #contacts = new Set<number>();
  #erasing: {
    tool: 'eraser' | 'point-eraser';
    before: Stroke[];
    hits: number;
    last?: [number, number];
  } | null = null;
  #lasso: { pts: [number, number][]; path: SVGPathElement } | null = null;
  #drag: { x: number; y: number; dx: number; dy: number } | null = null;
  #pan: { y: number; x: number } | null = null;
  /** Touch pointers down on the ink layer while drawing (for two-finger gestures). */
  #touches = new Map<number, [number, number]>();
  #pinch: { dist: number; mid: [number, number]; zoom: number } | null = null;
  /** After a two-finger gesture, remaining fingers don't draw until all are lifted. */
  #gestureLock = false;
  readonly #hoverDot: SVGCircleElement;
  readonly #group: SVGGElement;
  readonly #overlay: SVGGElement;

  constructor(
    readonly svg: SVGSVGElement,
    readonly page: HTMLElement,
    readonly scroller: HTMLElement,
    readonly opts: InkOptions,
  ) {
    this.#group = document.createElementNS(SVG, 'g');
    this.#overlay = document.createElementNS(SVG, 'g');
    this.#hoverDot = document.createElementNS(SVG, 'circle');
    this.#hoverDot.setAttribute('class', 'ink-hover');
    this.#hoverDot.setAttribute('r', '0');
    this.#overlay.append(this.#hoverDot);
    svg.append(this.#group, this.#overlay);
    svg.addEventListener('pointerdown', (e) => {
      this.#down(e);
    });
    svg.addEventListener('pointermove', (e) => {
      this.#move(e);
    });
    svg.addEventListener('pointerup', (e) => {
      this.#up(e);
    });
    svg.addEventListener('pointercancel', (e) => {
      this.#up(e);
    });
    svg.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'pen') this.#hover(null);
    });
    // Pen side button / long press would open a context menu over the page.
    svg.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
    // Android WebView: a stylus also sends touch events. If they aren't cancelled, the
    // WebView pans the page and cancels the pen's pointer stream after a few points.
    // (Cancelling them also stops the keyboard's handwriting mode taking over the pen.)
    const guard = (e: TouchEvent): void => {
      const stylus = [...e.changedTouches].some(
        (t) => (t as Touch & { touchType?: string }).touchType === 'stylus',
      );
      const penBusy = this.#live?.pointerType === 'pen' || this.#penContact;
      if ((stylus && (this.active || this.autoSwitch)) || penBusy) {
        if (e.cancelable) e.preventDefault();
      }
    };
    page.addEventListener('touchstart', guard, { passive: false });
    page.addEventListener('touchmove', guard, { passive: false });
    // Auto-switch: a pen touching the page enters draw mode (setting).
    page.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'pen') this.#detectPen();
        if (this.active || e.pointerType !== 'pen' || !this.autoSwitch) return;
        if (this.opts.onPenWhileIdle()) {
          e.preventDefault();
          this.#down(e);
        }
      },
      true,
    );
    page.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'pen') {
        this.#penSeenAt = performance.now();
        this.#detectPen();
      }
    });
    // Tap a timestamped stroke (not drawing) to seek the recording.
    page.addEventListener('click', (e) => {
      if (this.active || !this.opts.onStrokeTap) return;
      const [x, y] = this.#pt(e);
      const s = this.hitTest(x, y);
      if (s?.t !== undefined) this.opts.onStrokeTap(s);
    });
    document.addEventListener('keydown', (e) => {
      if (!this.active || this.selected.size === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelection();
      } else if (e.key === 'Escape') {
        this.select([]);
      }
    });
  }

  #detectPen(): void {
    if (this.penDetected) return;
    this.penDetected = true;
    if (this.touchAuto && this.drawWithTouch) {
      this.drawWithTouch = false;
      this.touchAuto = false;
      this.opts.onPenDetected?.();
    }
  }

  /** Abandon whatever a finger started: a second finger means scroll or zoom. */
  #abortTouch(): void {
    if (this.#live?.pointerType === 'touch') {
      this.#live.path.remove();
      this.#live = null;
    }
    if (this.#erasing) {
      const er = this.#erasing;
      this.#erasing = null;
      if (er.hits > 0) {
        this.opts.onOp({
          kind: 'replace',
          before: er.before,
          after: this.strokes.map((s) => ({ ...s })),
        });
      }
    }
    if (this.#lasso) {
      this.#lasso.path.remove();
      this.#lasso = null;
    }
    if (this.#drag) {
      this.#group.querySelectorAll('path.is-selected').forEach((p) => {
        p.removeAttribute('transform');
      });
      this.#drag = null;
    }
    this.#pan = null;
  }

  #pinchState(): { dist: number; mid: [number, number] } {
    const [a, b] = [...this.#touches.values()];
    return {
      dist: Math.hypot(a![0] - b![0], a![1] - b![1]),
      mid: [(a![0] + b![0]) / 2, (a![1] + b![1]) / 2],
    };
  }

  /** Whether a two-finger gesture is in progress (tests and diagnostics). */
  get gesturing(): boolean {
    return this.#pinch !== null;
  }

  setActive(on: boolean): void {
    this.active = on;
    this.svg.classList.toggle('ink--active', on);
    this.svg.dataset['tool'] = this.tool;
    if (!on) {
      this.#contacts.clear();
      this.#touches.clear();
      this.#pinch = null;
      this.#gestureLock = false;
      this.#penContact = false;
      this.select([]);
      this.#hover(null);
    }
  }

  setTool(tool: InkTool): void {
    this.tool = tool;
    this.svg.dataset['tool'] = tool;
    if (tool !== 'lasso') this.select([]);
  }

  #pt(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.page.getBoundingClientRect();
    const scale = r.width / this.page.offsetWidth || 1;
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  }

  /** Pens report pressure; mouse and touch use a constant and simulated pressure. */
  #pressure(e: PointerEvent): number {
    if (e.pointerType === 'pen') return Math.max(0.05, e.pressure || 0.5);
    return 0.5;
  }

  /** Palm rejection and the Draw with Touch setting. */
  accepts(pointerType: string): boolean {
    if (pointerType !== 'touch') return true;
    if (!this.drawWithTouch) return false;
    // A pen in contact, hovering, or used in the last 700 ms: treat touches as a resting palm.
    if (this.#live?.pointerType === 'pen') return false;
    return performance.now() - this.#penSeenAt > 700;
  }

  /** A pen is in contact with the ink layer. */
  #penContact = false;

  #down(e: PointerEvent): void {
    if (!this.active) return;
    this.#contacts.add(e.pointerId);
    if (e.pointerType === 'pen') {
      this.#penSeenAt = performance.now();
      this.#penContact = true;
      this.#detectPen();
    }
    if (e.pointerType === 'touch') {
      this.#touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.#touches.size >= 2) {
        // Two fingers: scroll and zoom, never ink.
        e.preventDefault();
        this.#abortTouch();
        this.#gestureLock = true;
        this.#pinch = { ...this.#pinchState(), zoom: this.opts.getZoom?.() ?? 100 };
        return;
      }
      if (this.#gestureLock) return;
    }
    if (!this.accepts(e.pointerType)) {
      this.rejected++;
      if (e.pointerType === 'touch' && !this.drawWithTouch)
        this.#pan = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.#live) return; // one stroke at a time
    e.preventDefault();
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    this.lastPointerType = e.pointerType;
    const [x, y] = this.#pt(e);
    const barrel = e.pointerType === 'pen' && (e.buttons & ERASER_BUTTONS) !== 0;
    const tool = barrel ? 'eraser' : this.tool;
    if (tool === 'eraser' || tool === 'point-eraser') {
      this.#erasing = { tool, before: this.strokes.map((s) => ({ ...s })), hits: 0 };
      this.#erase(x, y);
      return;
    }
    if (tool === 'lasso') {
      if (this.selected.size > 0 && this.#inSelection(x, y)) {
        this.#drag = { x, y, dx: 0, dy: 0 };
        return;
      }
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('class', 'ink-lasso');
      this.#overlay.append(path);
      this.#lasso = { pts: [[x, y]], path };
      return;
    }
    const clock = this.opts.clock?.() ?? null;
    const stroke: Stroke = {
      id: this.#nextId++,
      tool,
      color: this.color,
      size: tool === 'highlighter' ? Math.max(this.size * 3, 14) : this.size,
      points: [[x, y, this.#pressure(e)]],
      ...(clock ? { t: clock.t, rec: clock.rec } : {}),
    };
    const path = document.createElementNS(SVG, 'path');
    this.#group.append(path);
    this.#live = { stroke, path, pointerType: e.pointerType };
    this.#paint(path, stroke, e);
  }

  #move(e: PointerEvent): void {
    if (e.pointerType === 'touch' && this.#touches.has(e.pointerId)) {
      this.#touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.#pinch) {
        if (this.#touches.size < 2) return;
        const now = this.#pinchState();
        this.scroller.scrollBy(this.#pinch.mid[0] - now.mid[0], this.#pinch.mid[1] - now.mid[1]);
        this.#pinch.mid = now.mid;
        if (this.opts.setZoom && this.#pinch.dist > 0) {
          const z = Math.round((this.#pinch.zoom * now.dist) / this.#pinch.dist);
          if (Math.abs(z - (this.opts.getZoom?.() ?? z)) >= 2) this.opts.setZoom(z);
        }
        return;
      }
      if (this.#gestureLock) return;
    }
    if (this.#pan && e.pointerType === 'touch') {
      this.scroller.scrollBy(this.#pan.x - e.clientX, this.#pan.y - e.clientY);
      this.#pan = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType === 'pen') this.#penSeenAt = performance.now();
    const [x, y] = this.#pt(e);
    if (e.pointerType === 'pen' && !this.#contacts.has(e.pointerId)) {
      this.#hover([x, y]);
      return;
    }
    if (this.#live && e.pointerType !== this.#live.pointerType) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const all = events.length > 0 ? events : [e];
    if (this.#erasing) {
      for (const ce of all) this.#erase(...this.#pt(ce));
      return;
    }
    if (this.#drag) {
      this.#drag.dx = x - this.#drag.x;
      this.#drag.dy = y - this.#drag.y;
      const t = `translate(${this.#drag.dx} ${this.#drag.dy})`;
      this.#group.querySelectorAll('path.is-selected').forEach((p) => {
        p.setAttribute('transform', t);
      });
      return;
    }
    if (this.#lasso) {
      this.#lasso.pts.push([x, y]);
      this.#lasso.path.setAttribute(
        'd',
        `M${this.#lasso.pts.map((p) => p.join(',')).join(' L')} Z`,
      );
      return;
    }
    if (!this.#live) return;
    for (const ce of all) {
      const [cx, cy] = this.#pt(ce);
      this.#live.stroke.points.push([cx, cy, this.#pressure(ce)]);
    }
    this.#paint(this.#live.path, this.#live.stroke, e);
  }

  #up(e: PointerEvent): void {
    this.#pan = null;
    this.#contacts.delete(e.pointerId);
    if (e.pointerType === 'touch') {
      this.#touches.delete(e.pointerId);
      if (this.#touches.size < 2) this.#pinch = null;
      if (this.#touches.size === 0) this.#gestureLock = false;
      if (this.#gestureLock || this.#pinch) return;
    }
    if (e.pointerType === 'pen') this.#penContact = false;
    if (e.pointerType === 'pen') this.#penSeenAt = performance.now();
    if (this.#erasing) {
      const er = this.#erasing;
      this.#erasing = null;
      if (er.hits > 0) {
        this.opts.onOp({
          kind: 'replace',
          before: er.before,
          after: this.strokes.map((s) => ({ ...s })),
        });
      }
      return;
    }
    if (this.#drag) {
      const { dx, dy } = this.#drag;
      this.#drag = null;
      if (dx !== 0 || dy !== 0) {
        const op: InkOp = { kind: 'move', ids: [...this.selected], dx, dy };
        this.apply(op);
        this.opts.onOp(op);
      }
      return;
    }
    if (this.#lasso) {
      const poly = this.#lasso.pts;
      this.#lasso.path.remove();
      this.#lasso = null;
      this.select(
        this.strokes
          .filter(
            (s) => s.points.filter((p) => inside(p[0], p[1], poly)).length > s.points.length / 2,
          )
          .map((s) => s.id),
      );
      return;
    }
    if (!this.#live || e.pointerType !== this.#live.pointerType) return;
    const { stroke, path } = this.#live;
    this.#live = null;
    path.remove();
    const p0 = stroke.points[0]!;
    if (stroke.points.length === 1) stroke.points.push([p0[0] + 0.1, p0[1] + 0.1, p0[2]]);
    const op: InkOp = { kind: 'add', strokes: [stroke] };
    this.apply(op);
    this.opts.onOp(op);
  }

  #paint(path: SVGPathElement, s: Stroke, e?: PointerEvent): void {
    let size = s.size;
    if (s.tool === 'pencil' && e?.pointerType === 'pen') {
      // A tilted pencil draws a broader line (tiltX/tiltY in degrees).
      const tilt = Math.min(60, Math.hypot(e.tiltX || 0, e.tiltY || 0));
      size = s.size * (1 + tilt / 60);
    }
    const simulate = !(this.#live?.pointerType === 'pen' || s.points.some((p) => p[2] !== 0.5));
    const outline = getStroke(s.points, {
      size: s.tool === 'pencil' ? size * 0.8 : size,
      thinning: s.tool === 'highlighter' ? 0 : s.tool === 'pencil' ? 0.75 : 0.6,
      smoothing: 0.55,
      streamline: s.tool === 'highlighter' ? 0.7 : 0.45,
      simulatePressure: simulate,
      last: this.#live?.stroke !== s,
      start: { cap: s.tool !== 'highlighter', taper: 0 },
      end: { cap: s.tool !== 'highlighter', taper: 0 },
    });
    path.setAttribute('d', pathFromOutline(outline));
    path.setAttribute('fill', s.color);
    path.setAttribute(
      'class',
      `ink-stroke ink-stroke--${s.tool}${this.selected.has(s.id) ? ' is-selected' : ''}${s.t !== undefined ? ' has-time' : ''}`,
    );
    path.dataset['id'] = String(s.id);
  }

  /** Draw from another surface (the magnifier strip) in page coordinates. */
  startStroke(x: number, y: number, pressure: number, pointerType: string): void {
    if (this.tool === 'eraser' || this.tool === 'point-eraser' || this.tool === 'lasso') return;
    const clock = this.opts.clock?.() ?? null;
    const tool = this.tool;
    const stroke: Stroke = {
      id: this.#nextId++,
      tool,
      color: this.color,
      size: tool === 'highlighter' ? Math.max(this.size * 3, 14) : this.size,
      points: [[x, y, pressure]],
      ...(clock ? { t: clock.t, rec: clock.rec } : {}),
    };
    const path = document.createElementNS(SVG, 'path');
    this.#group.append(path);
    this.lastPointerType = pointerType;
    this.#live = { stroke, path, pointerType };
    this.#paint(path, stroke);
  }

  extendStroke(x: number, y: number, pressure: number): void {
    if (!this.#live) return;
    this.#live.stroke.points.push([x, y, pressure]);
    this.#paint(this.#live.path, this.#live.stroke);
  }

  endStroke(): void {
    if (!this.#live) return;
    const { stroke, path } = this.#live;
    this.#live = null;
    path.remove();
    const op: InkOp = { kind: 'add', strokes: [stroke] };
    this.apply(op);
    this.opts.onOp(op);
  }

  /** The SVG group holding rendered strokes (for magnified views). */
  get group(): SVGGElement {
    return this.#group;
  }

  #hover(p: [number, number] | null): void {
    if (!p || !this.active) {
      this.#hoverDot.setAttribute('r', '0');
      this.svg.classList.remove('ink--hover');
      return;
    }
    const eraser = this.tool === 'eraser' || this.tool === 'point-eraser';
    this.svg.classList.add('ink--hover');
    this.#hoverDot.setAttribute('cx', String(p[0]));
    this.#hoverDot.setAttribute('cy', String(p[1]));
    this.#hoverDot.setAttribute('r', String(eraser ? 10 : Math.max(2.5, this.size / 2)));
    this.#hoverDot.setAttribute('fill', eraser ? 'none' : this.color);
    this.#hoverDot.classList.toggle('ink-hover--eraser', eraser);
  }

  /** Topmost stroke near a point. */
  hitTest(x: number, y: number, r = 8): Stroke | undefined {
    const near = (s: Stroke): boolean =>
      s.points.some((p, i) => {
        const q = s.points[i + 1] ?? p;
        return segDist(x, y, p[0], p[1], q[0], q[1]) <= r + s.size / 2;
      });
    return [...this.strokes].reverse().find(near);
  }

  #erase(x: number, y: number): void {
    const er = this.#erasing;
    if (!er) return;
    // Sample along the eraser's path so fast movements don't skip strokes.
    const [lx, ly] = er.last ?? [x, y];
    er.last = [x, y];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / 6));
    if (steps > 1) {
      for (let i = 1; i < steps; i++)
        this.#eraseAt(lx + ((x - lx) * i) / steps, ly + ((y - ly) * i) / steps);
    }
    this.#eraseAt(x, y);
  }

  #eraseAt(x: number, y: number): void {
    const er = this.#erasing;
    if (!er) return;
    const hit = (p: Point): boolean => Math.hypot(p[0] - x, p[1] - y) <= 12;
    if (er.tool === 'eraser') {
      const touched = (s: Stroke): boolean =>
        s.points.some((p, i) => {
          const q = s.points[i + 1] ?? p;
          return segDist(x, y, p[0], p[1], q[0], q[1]) <= 10 + s.size / 2;
        });
      const keep = this.strokes.filter((s) => !touched(s));
      if (keep.length !== this.strokes.length) {
        er.hits += this.strokes.length - keep.length;
        this.strokes = keep;
        this.render();
      }
      return;
    }
    // Point eraser: split strokes where the eraser passes.
    let changed = false;
    const next: Stroke[] = [];
    for (const s of this.strokes) {
      if (!s.points.some(hit)) {
        next.push(s);
        continue;
      }
      changed = true;
      let run: Point[] = [];
      const flush = (): void => {
        if (run.length > 1) next.push({ ...s, id: this.#nextId++, points: run });
        run = [];
      };
      for (const p of s.points) {
        if (hit(p)) flush();
        else run.push(p);
      }
      flush();
    }
    if (changed) {
      er.hits++;
      this.strokes = next;
      this.render();
    }
  }

  #inSelection(x: number, y: number): boolean {
    return this.strokes.some(
      (s) => this.selected.has(s.id) && s.points.some((p) => Math.hypot(p[0] - x, p[1] - y) < 18),
    );
  }

  select(ids: number[]): void {
    this.selected = new Set(ids);
    this.render();
    if (ids.length > 0) {
      this.opts.onStatus?.(
        `${ids.length} ink stroke${ids.length === 1 ? '' : 's'} selected · drag to move, Delete to remove`,
      );
    }
  }

  deleteSelection(): void {
    const strokes = this.strokes.filter((s) => this.selected.has(s.id));
    if (strokes.length === 0) return;
    const op: InkOp = { kind: 'remove', strokes };
    this.apply(op);
    this.opts.onOp(op);
    this.select([]);
  }

  clear(): void {
    if (this.strokes.length === 0) return;
    const op: InkOp = { kind: 'remove', strokes: [...this.strokes] };
    this.apply(op);
    this.opts.onOp(op);
  }

  /** Apply an operation, or undo it with `reverse`. */
  apply(op: InkOp, reverse = false): void {
    if (op.kind === 'add' || op.kind === 'remove') {
      const adding = (op.kind === 'add') !== reverse;
      const ids = new Set(op.strokes.map((s) => s.id));
      const rest = this.strokes.filter((s) => !ids.has(s.id));
      this.strokes = adding ? [...rest, ...op.strokes] : rest;
    } else if (op.kind === 'replace') {
      this.strokes = (reverse ? op.before : op.after).map((s) => ({ ...s }));
    } else {
      const k = reverse ? -1 : 1;
      const ids = new Set(op.ids);
      this.strokes = this.strokes.map((s) =>
        ids.has(s.id)
          ? { ...s, points: s.points.map(([x, y, p]): Point => [x + k * op.dx, y + k * op.dy, p]) }
          : s,
      );
    }
    this.render();
    this.page.dispatchEvent(new Event('ls-ink-change', { bubbles: true }));
  }

  render(): void {
    this.#nextId = Math.max(this.#nextId, ...this.strokes.map((s) => s.id + 1));
    this.#group.replaceChildren();
    for (const s of this.strokes) {
      const p = document.createElementNS(SVG, 'path');
      this.#paint(p, s);
      this.#group.append(p);
    }
  }

  /** Mark strokes recorded at or before `t` in a recording (playback highlight). */
  markPlayback(rec: string | null, t: number): void {
    for (const p of this.#group.querySelectorAll<SVGPathElement>('path')) {
      const s = this.strokes.find((x) => String(x.id) === p.dataset['id']);
      const future = rec !== null && s?.rec === rec && s.t !== undefined && s.t > t;
      p.classList.toggle('is-future', future);
    }
  }

  /** Replay strokes in drawing order. */
  replay(): void {
    const all = [...this.strokes];
    if (all.length === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.#group.replaceChildren();
    let si = 0;
    let pi = 1;
    let path: SVGPathElement | null = null;
    const step = (): void => {
      const s = all[si];
      if (!s) {
        this.render();
        return;
      }
      if (!path) {
        path = document.createElementNS(SVG, 'path');
        this.#group.append(path);
      }
      pi = Math.min(s.points.length, pi + 3);
      this.#paint(path, { ...s, points: s.points.slice(0, pi) });
      if (pi >= s.points.length) {
        si++;
        pi = 1;
        path = null;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
