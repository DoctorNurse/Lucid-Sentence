/**
 * Ink layer for the Draw tab and Notes mode (Pointer Events: pen, touch, mouse).
 *
 * Input (ink/input.ts): pressure, tiltX/tiltY and altitude/azimuth (normalized both
 * ways), coalesced samples, predicted samples (drawn, never stored), hover, and pen
 * buttons tracked for the whole hover → contact → lift cycle (barrel `buttons & 2`,
 * eraser end `buttons & 32`).
 *
 * Palm rejection (ink/palm.ts): pen-only once a pen is seen (phones), touches ignored
 * near pen activity, palm-sized contacts ignored, a finger stroke retracted when a
 * second finger follows quickly, and `pointercancel` discards the live stroke.
 *
 * Rendering (ink/render.ts): tiled canvas layers. Highlighters sit **under** the text,
 * one layer per color, drawn opaque and faded once per layer so overlapping strokes of
 * one color never stack. Pens and pencils sit above the text. The stroke being drawn is
 * outlined incrementally on its own low-latency layer. A vector copy of every stroke is
 * kept in the overlay SVG's <defs> (`#ink-strokes`) for the magnifier and tests.
 *
 * Every change is an undoable operation (history.ts). Strokes carry a recording
 * timestamp when audio is recording (Notes mode).
 *
 * Several behaviors (highlighter layering, hold-to-straighten, button tool switching,
 * retracting a pinch's first stroke) are inspired by Saber
 * (https://github.com/saber-notes/saber, GPL-3.0). No Saber code is used.
 */
import { getStroke } from 'perfect-freehand';
import {
  decimate,
  drawSize,
  heldAtEnd,
  inside,
  isStraight,
  outline,
  pathFromOutline,
  segDist,
  straighten,
  strokeOptions,
  thinPoints,
} from './ink/geometry.js';
import { PenButtons, readSample, type PointerLike } from './ink/input.js';
import {
  bboxOf,
  TOOL_OPACITY,
  type InkOp,
  type InkTool,
  type Point,
  type Stroke,
  type StrokeTool,
} from './ink/model.js';
import { recognizeShape } from './ink/shapes.js';
import { PalmGuard, type TouchLike } from './ink/palm.js';
import {
  LiveOutline,
  pad,
  strokePath,
  strokePathLo,
  TiledLayer,
  union,
  type Rect,
} from './ink/render.js';

export { inside, segDist } from './ink/geometry.js';
export type { InkOp, InkTool, Point, Stroke } from './ink/model.js';

export interface InkOptions {
  /** A real pen was detected for the first time while touch drawing was the default. */
  onPenDetected?: () => void;
  /** Current zoom in percent, and a setter (two-finger pinch while drawing). */
  getZoom?: () => number;
  setZoom?: (percent: number) => void;
  /** Called for each completed operation (for the shared undo timeline). */
  onOp: (op: InkOp) => void;
  /** An operation already reported was withdrawn (a pinch's accidental first stroke). */
  onRetract?: (op: InkOp) => void;
  /** A pen touched the page while draw mode was off. Return true to start drawing. */
  onPenWhileIdle: () => boolean;
  onStatus?: (msg: string) => void;
  /** Current recording position, if audio is recording. */
  clock?: () => { rec: string; t: number } | null;
  /** A timestamped stroke was tapped while not drawing (seek playback). */
  onStrokeTap?: (stroke: Stroke) => void;
}

const SVG = 'http://www.w3.org/2000/svg';

interface Live {
  stroke: Stroke;
  pointerType: string;
  outline: LiveOutline;
  /** event.timeStamp of the first sample. */
  t0: number;
  /** performance.now() at the start (for retraction). */
  startedAt: number;
  lastP: number;
}

export class InkLayer {
  strokes: Stroke[] = [];
  tool: InkTool = 'pen';
  /** Ink to Shape: closed strokes and lines become clean shapes as they're drawn. */
  shapeMode = false;
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
  /** Highlighter strokes that look like lines become straight lines. */
  autoStraightenHighlighter = true;
  /** Resting the pen for 400 ms before lifting straightens a line-like stroke. */
  holdToStraighten = true;
  /** Mirror the live stroke into the vector copy (the magnifier strip shows it). */
  mirrorLive = false;
  /** Pointer type of the last accepted stroke (status and tests). */
  lastPointerType = '';
  /** Strokes discarded because the system cancelled the pointer (diagnostics). */
  cancelled = 0;
  selected = new Set<number>();
  readonly palm = new PalmGuard();
  readonly buttons = new PenButtons();

  #nextId = 1;
  #live: Live | null = null;
  /** Pointers in contact with the ink layer (pen hover = a pen move not in this set). */
  #contacts = new Set<number>();
  #erasing: {
    tool: 'eraser' | 'point-eraser';
    before: Stroke[];
    hits: number;
    last?: [number, number];
    /** Stroke kept from the same contact (barrel pressed mid-stroke): never erased by it. */
    keep?: number;
  } | null = null;
  #lasso: { pts: [number, number][]; path: SVGPathElement } | null = null;
  #drag: { x: number; y: number; dx: number; dy: number; box: Rect | null } | null = null;
  #pan: { y: number; x: number } | null = null;
  /** Touch pointers down on the ink layer while drawing (for two-finger gestures). */
  #touches = new Map<number, [number, number]>();
  #pinch: { dist: number; mid: [number, number]; zoom: number } | null = null;
  /** After a two-finger gesture, remaining fingers don't draw until all are lifted. */
  #gestureLock = false;
  /** The last committed finger stroke (retracted if a second finger follows quickly). */
  #lastTouchAdd: { op: InkOp; startedAt: number } | null = null;
  /** Page rect and scale cached for the current gesture. */
  #frame: { left: number; top: number; scale: number } | null = null;
  #future = new Set<number>();
  #replaying: { upTo: number } | null = null;
  #hidden = false;
  #w = 0;
  #h = 0;
  #viewQueued = false;

  readonly #hoverDot: SVGCircleElement;
  readonly #group: SVGGElement;
  readonly #overlay: SVGGElement;
  readonly #livePath: SVGPathElement;
  readonly hlRoot: HTMLDivElement;
  readonly inkRoot: HTMLDivElement;
  readonly #ink: TiledLayer;
  readonly #hl = new Map<string, { root: HTMLDivElement; layer: TiledLayer }>();
  readonly #liveLayer: TiledLayer;

  constructor(
    readonly svg: SVGSVGElement,
    readonly page: HTMLElement,
    readonly scroller: HTMLElement,
    readonly opts: InkOptions,
  ) {
    const defs = document.createElementNS(SVG, 'defs');
    this.#group = document.createElementNS(SVG, 'g');
    this.#group.id = 'ink-strokes';
    this.#livePath = document.createElementNS(SVG, 'path');
    defs.append(this.#group);
    this.#overlay = document.createElementNS(SVG, 'g');
    this.#hoverDot = document.createElementNS(SVG, 'circle');
    this.#hoverDot.setAttribute('class', 'ink-hover');
    this.#hoverDot.setAttribute('r', '0');
    this.#overlay.append(this.#hoverDot);
    svg.append(defs, this.#overlay);

    // Layers: highlighters under the text, pens above it, the live stroke on top.
    this.hlRoot = document.createElement('div');
    this.hlRoot.className = 'ink-hl';
    this.inkRoot = document.createElement('div');
    this.inkRoot.className = 'ink-canvas';
    this.#ink = new TiledLayer('ink-layer--ink', (ctx, r) => {
      this.#paintStrokes(ctx, r, (s) => s.tool !== 'highlighter');
    });
    this.inkRoot.append(this.#ink.el);
    this.#liveLayer = new TiledLayer('ink-layer--live', () => undefined, true);
    page.prepend(this.hlRoot);
    svg.before(this.inkRoot);

    svg.addEventListener('pointerdown', (e) => {
      this.#down(e);
    });
    svg.addEventListener('pointermove', (e) => {
      this.#move(e);
    });
    svg.addEventListener('pointerup', (e) => {
      this.#up(e, false);
    });
    svg.addEventListener('pointercancel', (e) => {
      this.#up(e, true);
    });
    svg.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'pen' && !this.#contacts.has(e.pointerId)) {
        this.palm.pen(performance.now(), 'leave');
        this.#hover(null);
      }
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
      const penBusy = this.#live?.pointerType === 'pen' || this.palm.penContact;
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
        this.palm.pen(performance.now(), this.#contacts.has(e.pointerId) ? 'contact' : 'hover');
        this.#detectPen();
      } else if (!this.active && this.opts.onStrokeTap && e.pointerType === 'mouse') {
        // Not drawing: a pointer cursor over strokes that seek the recording.
        const s = this.hitTest(...this.#pt(e));
        page.classList.toggle('ink-seekable', s?.t !== undefined);
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
    const queue = (): void => {
      this.refreshView();
    };
    scroller.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
  }

  // -------------------------------------------------------------------------
  // Public state

  /** A pointer with pointerType 'pen' has been seen this session. */
  get penDetected(): boolean {
    return this.palm.penDetected;
  }

  /** Count of touches rejected as palms (tests and diagnostics). */
  get rejected(): number {
    return this.palm.rejected;
  }

  /** Whether a two-finger gesture is in progress (tests and diagnostics). */
  get gesturing(): boolean {
    return this.#pinch !== null;
  }

  /** The tool in effect right now (a held pen button means the eraser). */
  get effectiveTool(): InkTool {
    return this.buttons.held || this.buttons.latched ? 'eraser' : this.tool;
  }

  get hidden(): boolean {
    return this.#hidden;
  }

  /** The SVG group holding the vector copy of every stroke (for magnified views). */
  get group(): SVGGElement {
    return this.#group;
  }

  /** Highlighter colors that currently have a layer (tests). */
  get highlighterLayers(): string[] {
    return [...this.#hl.keys()];
  }

  setHidden(on: boolean): void {
    this.#hidden = on;
    this.svg.classList.toggle('ink--hidden', on);
    this.hlRoot.hidden = on;
    this.inkRoot.hidden = on;
  }

  /** Size of the drawable area in page px (the page column, all pages). */
  setSize(w: number, h: number): void {
    this.#w = w;
    this.#h = h;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(h));
    for (const r of [this.hlRoot, this.inkRoot]) {
      r.style.width = `${w}px`;
      r.style.height = `${h}px`;
    }
    this.#ink.resize(w, h);
    this.#liveLayer.resize(w, h);
    for (const { layer } of this.#hl.values()) layer.resize(w, h);
    this.#syncView();
  }

  /** Re-read the visible range and zoom (after scrolling or zooming). */
  refreshView(): void {
    if (this.#viewQueued) return;
    this.#viewQueued = true;
    requestAnimationFrame(() => {
      this.#viewQueued = false;
      this.#syncView();
    });
  }

  #syncView(): void {
    if (this.#w === 0) return;
    const pr = this.page.getBoundingClientRect();
    const sr = this.scroller.getBoundingClientRect();
    const zoom = pr.width / (this.page.offsetWidth || 1) || 1;
    const top = (sr.top - pr.top) / zoom;
    const bottom = (sr.bottom - pr.top) / zoom;
    const scale = zoom * (window.devicePixelRatio || 1);
    for (const l of this.#layers()) l.setView(top, bottom, scale);
  }

  #layers(): TiledLayer[] {
    return [this.#ink, this.#liveLayer, ...[...this.#hl.values()].map((h) => h.layer)];
  }

  #penHandled = false;

  /** The first pen this session: a device-default "fingers draw" turns off (palm layer 1). */
  #detectPen(): void {
    this.palm.penDetected = true;
    if (this.#penHandled) return;
    this.#penHandled = true;
    if (this.touchAuto && this.drawWithTouch) {
      this.drawWithTouch = false;
      this.touchAuto = false;
      this.opts.onPenDetected?.();
    }
  }

  setActive(on: boolean): void {
    this.active = on;
    this.svg.classList.toggle('ink--active', on);
    this.svg.dataset['tool'] = this.effectiveTool;
    if (!on) {
      this.#contacts.clear();
      this.#touches.clear();
      this.#pinch = null;
      this.#gestureLock = false;
      this.palm.penContact = false;
      this.buttons.reset();
      this.select([]);
      this.#hover(null);
    }
    this.refreshView();
  }

  setTool(tool: InkTool): void {
    this.tool = tool;
    this.svg.dataset['tool'] = this.effectiveTool;
    if (tool !== 'lasso') this.select([]);
  }

  #pt(e: { clientX: number; clientY: number }): [number, number] {
    const f = this.#frame ?? this.#measure();
    return [(e.clientX - f.left) / f.scale, (e.clientY - f.top) / f.scale];
  }

  #measure(): { left: number; top: number; scale: number } {
    const r = this.page.getBoundingClientRect();
    return { left: r.left, top: r.top, scale: r.width / this.page.offsetWidth || 1 };
  }

  /** Palm rejection and the Draw with Touch setting. */
  accepts(pointerType: string, e?: TouchLike): boolean {
    if (pointerType === 'touch' && this.#live?.pointerType === 'pen') return false;
    return this.palm.peek({ pointerType, ...e }, this.drawWithTouch, performance.now()) === null;
  }

  // -------------------------------------------------------------------------
  // Pointer handling

  #down(e: PointerEvent): void {
    if (!this.active) return;
    this.#frame = this.#measure();
    this.#contacts.add(e.pointerId);
    if (e.pointerType === 'pen') {
      this.palm.pen(performance.now(), 'contact');
      this.#detectPen();
      if (this.buttons.update(e, 'down')) this.#toolChanged();
    }
    if (e.pointerType === 'touch') {
      this.#touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.#touches.size >= 2) {
        // Two fingers: scroll and zoom, never ink.
        e.preventDefault();
        this.#abortTouch();
        this.#retractTouchStroke();
        this.#gestureLock = true;
        this.#pinch = { ...this.#pinchState(), zoom: this.opts.getZoom?.() ?? 100 };
        return;
      }
      if (this.#gestureLock) return;
    }
    const rejection =
      e.pointerType === 'touch' && this.#live?.pointerType === 'pen'
        ? 'pen-active'
        : this.palm.check(e, this.drawWithTouch, performance.now());
    if (rejection) {
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
    const tool = this.effectiveTool;
    if (tool === 'eraser' || tool === 'point-eraser') {
      this.#startErase(tool, x, y);
      return;
    }
    if (tool === 'lasso') {
      if (this.selected.size > 0 && this.#inSelection(x, y)) {
        this.#startDrag(x, y);
        return;
      }
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('class', 'ink-lasso');
      this.#overlay.append(path);
      this.#lasso = { pts: [[x, y]], path };
      return;
    }
    this.#begin(tool, e);
  }

  #begin(tool: StrokeTool, e: PointerEvent): void {
    const clock = this.opts.clock?.() ?? null;
    const s = readSample(e, (cx, cy) => this.#pt({ clientX: cx, clientY: cy }));
    const real = !Number.isNaN(s.p);
    const stroke: Stroke = {
      id: this.#nextId++,
      tool,
      color: this.color,
      size: tool === 'highlighter' ? Math.max(this.size * 3, 14) : this.size,
      points: [[s.x, s.y, real ? s.p : 0.5, s.tiltX, s.tiltY, 0]],
      pressure: real,
      source: e.pointerType === 'pen' || e.pointerType === 'touch' ? e.pointerType : 'mouse',
      ...(clock ? { t: clock.t, rec: clock.rec } : {}),
    };
    this.#startLive(stroke, e.pointerType, e.timeStamp, real ? s.p : 0.5);
  }

  #startLive(stroke: Stroke, pointerType: string, t0: number, p: number): void {
    this.#live = {
      stroke,
      pointerType,
      outline: new LiveOutline(stroke),
      t0,
      startedAt: performance.now(),
      lastP: p,
    };
    // The live layer joins the stack the finished stroke will land in.
    const host = stroke.tool === 'highlighter' ? this.#hlLayer(stroke.color).root : this.inkRoot;
    host.append(this.#liveLayer.el);
    this.#liveLayer.el.style.opacity = stroke.tool === 'pencil' ? String(TOOL_OPACITY.pencil) : '';
    this.#syncView();
    this.#drawLive([]);
  }

  /** Append samples from a pointer event (coalesced samples included). */
  #extend(e: PointerEvent): void {
    const live = this.#live!;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length > 0 ? events : [e]) live.stroke.points.push(this.#point(ce));
    const predicted =
      typeof e.getPredictedEvents === 'function'
        ? e.getPredictedEvents().map((pe) => this.#point(pe, true))
        : [];
    this.#drawLive(predicted);
  }

  #point(e: PointerLike, predicted = false): Point {
    const live = this.#live!;
    const s = readSample(e, (cx, cy) => this.#pt({ clientX: cx, clientY: cy }));
    let p = s.p;
    if (Number.isNaN(p)) p = live.stroke.pressure ? live.lastP : 0.5;
    else if (!predicted) {
      if (!live.stroke.pressure) {
        // First real pressure: earlier samples were placeholders.
        live.stroke.pressure = true;
        for (const q of live.stroke.points) q[2] = p;
      }
      live.lastP = p;
    }
    return [s.x, s.y, p, s.tiltX, s.tiltY, Math.max(0, Math.round(s.t - live.t0))];
  }

  #drawLive(predicted: Point[]): void {
    const live = this.#live;
    if (!live) return;
    const { dirty, tail } = live.outline.update(predicted);
    if (dirty) {
      const color = live.stroke.color;
      this.#liveLayer.draw(
        dirty,
        (ctx) => {
          ctx.fillStyle = color;
          for (const f of live.outline.frozen) ctx.fill(f.path);
          if (tail) ctx.fill(tail);
        },
        true,
      );
    }
    if (this.mirrorLive) {
      this.#livePath.setAttribute(
        'd',
        live.stroke.points.length > 1 ? pathOf(outline(live.stroke, false)) : '',
      );
      this.#livePath.setAttribute('fill', live.stroke.color);
      this.#livePath.setAttribute('class', `ink-stroke ink-stroke--${live.stroke.tool}`);
      if (!this.#livePath.isConnected) this.#group.append(this.#livePath);
    }
  }

  #endLive(commit: boolean, liftT?: number): Stroke | null {
    const live = this.#live;
    if (!live) return null;
    this.#live = null;
    this.#liveLayer.clear(live.outline.box ? pad(live.outline.box, 4) : null);
    this.#livePath.remove();
    if (!commit) return null;
    const stroke = live.stroke;
    stroke.points = thinPoints(stroke.points, Math.min(1, stroke.size * 0.1));
    if (stroke.points.length === 1) {
      const p0 = stroke.points[0]!;
      stroke.points.push([p0[0] + 0.1, p0[1] + 0.1, p0[2], p0[3] ?? 0, p0[4] ?? 0, p0[5] ?? 0]);
    }
    const lift = liftT ?? stroke.points.at(-1)![5] ?? 0;
    const straightenable = stroke.tool !== 'pencil' || this.holdToStraighten;
    if (
      straightenable &&
      isStraight(stroke.points, stroke.size) &&
      ((stroke.tool === 'highlighter' && this.autoStraightenHighlighter) ||
        (this.holdToStraighten && heldAtEnd(stroke.points, lift)))
    ) {
      stroke.points = straighten(stroke.points);
      stroke.shape = 'line';
    }
    if (this.shapeMode && !stroke.shape) {
      const shape = recognizeShape(stroke.points);
      if (shape) {
        stroke.points = shape.points;
        stroke.shape = shape.kind;
      }
    }
    const op: InkOp = { kind: 'add', strokes: [stroke] };
    this.apply(op);
    this.opts.onOp(op);
    this.#lastTouchAdd = live.pointerType === 'touch' ? { op, startedAt: live.startedAt } : null;
    return stroke;
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
    const [x, y] = this.#pt(e);
    if (e.pointerType === 'pen' && !this.#contacts.has(e.pointerId)) {
      // Hover: the barrel button (or eraser end) switches the tool while held.
      if (this.buttons.update(e, 'hover')) this.#toolChanged();
      this.#hover([x, y]);
      return;
    }
    if (this.#live && e.pointerType !== this.#live.pointerType) return;
    if (e.pointerType === 'pen' && this.buttons.update(e, 'move')) {
      this.#toolChanged();
      if (this.#live) {
        // The button went down mid-stroke: keep what was drawn (unless it's a blip),
        // then erase for the rest of this contact.
        const s = this.#live.stroke;
        const keep =
          s.points.length >= 4 &&
          Math.hypot(s.points.at(-1)![0] - s.points[0]![0], s.points.at(-1)![1] - s.points[0]![1]) >
            6;
        const kept = this.#endLive(keep);
        this.#startErase('eraser', x, y, kept?.id);
        return;
      }
    }
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const all = events.length > 0 ? events : [e];
    if (this.#erasing) {
      for (const ce of all) this.#erase(...this.#pt(ce));
      return;
    }
    if (this.#drag) {
      this.#moveDrag(x, y);
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
    this.#extend(e);
  }

  #up(e: PointerEvent, cancel: boolean): void {
    this.#pan = null;
    this.#contacts.delete(e.pointerId);
    if (e.pointerType === 'touch') {
      this.#touches.delete(e.pointerId);
      if (this.#touches.size < 2) this.#pinch = null;
      if (this.#touches.size === 0) this.#gestureLock = false;
      if (this.#gestureLock || this.#pinch) return;
    }
    if (e.pointerType === 'pen') {
      this.palm.pen(performance.now(), 'up');
      if (this.buttons.update(e, 'up')) this.#toolChanged();
    }
    if (this.#contacts.size === 0) this.#frame = null;
    if (this.#erasing) {
      const er = this.#erasing;
      this.#erasing = null;
      if (cancel) {
        this.#restore(er.before);
        return;
      }
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
      this.#endDrag(cancel);
      return;
    }
    if (this.#lasso) {
      const poly = this.#lasso.pts;
      this.#lasso.path.remove();
      this.#lasso = null;
      if (cancel) return;
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
    if (cancel) {
      // The system took the pointer (palm, or a gesture): the stroke was never meant.
      this.cancelled++;
      this.#endLive(false);
      this.opts.onStatus?.('Stroke discarded (the system cancelled the pointer)');
      return;
    }
    this.#endLive(true, e.timeStamp - this.#live.t0);
  }

  #toolChanged(): void {
    this.svg.dataset['tool'] = this.effectiveTool;
  }

  /** Abandon whatever a finger started: a second finger means scroll or zoom. */
  #abortTouch(): void {
    if (this.#live?.pointerType === 'touch') this.#endLive(false);
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
    if (this.#drag) this.#endDrag(true);
    this.#pan = null;
  }

  /** A second finger followed a finger stroke quickly: that stroke was a pinch starting. */
  #retractTouchStroke(): void {
    const last = this.#lastTouchAdd;
    this.#lastTouchAdd = null;
    if (!last || !this.palm.shouldRetract(last.startedAt, performance.now())) return;
    if (last.op.kind !== 'add') return;
    this.apply(last.op, true);
    this.opts.onRetract?.(last.op);
  }

  #pinchState(): { dist: number; mid: [number, number] } {
    const [a, b] = [...this.#touches.values()];
    return {
      dist: Math.hypot(a![0] - b![0], a![1] - b![1]),
      mid: [(a![0] + b![0]) / 2, (a![1] + b![1]) / 2],
    };
  }

  // -------------------------------------------------------------------------
  // Drawing from another surface (the magnifier strip), in page coordinates

  startStroke(x: number, y: number, pressure: number, pointerType: string): void {
    if (this.tool === 'eraser' || this.tool === 'point-eraser' || this.tool === 'lasso') return;
    const clock = this.opts.clock?.() ?? null;
    const tool = this.tool;
    const real = pointerType === 'pen' && pressure > 0 && pressure !== 0.5;
    const stroke: Stroke = {
      id: this.#nextId++,
      tool,
      color: this.color,
      size: tool === 'highlighter' ? Math.max(this.size * 3, 14) : this.size,
      points: [[x, y, real ? pressure : 0.5, 0, 0, 0]],
      pressure: real,
      source: pointerType === 'pen' || pointerType === 'touch' ? pointerType : 'mouse',
      ...(clock ? { t: clock.t, rec: clock.rec } : {}),
    };
    this.lastPointerType = pointerType;
    this.#startLive(stroke, pointerType, performance.now(), real ? pressure : 0.5);
  }

  extendStroke(x: number, y: number, pressure: number): void {
    const live = this.#live;
    if (!live) return;
    const p = live.stroke.pressure && pressure > 0 ? pressure : live.lastP;
    live.stroke.points.push([x, y, p, 0, 0, Math.round(performance.now() - live.t0)]);
    this.#drawLive([]);
  }

  endStroke(): void {
    this.#endLive(true, performance.now() - (this.#live?.t0 ?? 0));
  }

  // -------------------------------------------------------------------------
  // Rendering

  #hlLayer(color: string): { root: HTMLDivElement; layer: TiledLayer } {
    let h = this.#hl.get(color);
    if (!h) {
      const root = document.createElement('div');
      root.className = 'ink-hl__color';
      root.dataset['color'] = color;
      const layer = new TiledLayer('ink-layer--hl', (ctx, r) => {
        this.#paintStrokes(ctx, r, (s) => s.tool === 'highlighter' && s.color === color);
      });
      root.append(layer.el);
      this.hlRoot.append(root);
      h = { root, layer };
      this.#hl.set(color, h);
      if (this.#w > 0) {
        layer.resize(this.#w, this.#h);
        this.#syncView();
      }
    }
    return h;
  }

  /** Paint strokes matching `which` that intersect `rect`. */
  #paintStrokes(ctx: CanvasRenderingContext2D, rect: Rect, which: (s: Stroke) => boolean): void {
    const lo = this.#zoom() < 0.9;
    const upTo = this.#replaying?.upTo ?? Infinity;
    for (let i = 0; i < this.strokes.length && i < upTo; i++) {
      const s = this.strokes[i]!;
      if (!which(s)) continue;
      if (this.#drag && this.selected.has(s.id)) continue;
      const c = strokePath(s, (k) => outline(k));
      if (!intersectsRect(c.box, rect)) continue;
      const hl = s.tool === 'highlighter';
      // Highlighters are opaque here; their layer applies the opacity once.
      ctx.globalAlpha = (hl ? 1 : TOOL_OPACITY[s.tool]) * (this.#future.has(s.id) ? 0.22 : 1);
      ctx.fillStyle = s.color;
      if (this.selected.has(s.id)) {
        ctx.shadowColor = getAccent();
        ctx.shadowBlur = 4;
      }
      ctx.fill(lo ? strokePathLo(s, lowOutline) : c.path);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  #zoom(): number {
    return (this.opts.getZoom?.() ?? 100) / 100;
  }

  /** Repaint the area a set of strokes covers, on the layers they live in. */
  #invalidate(strokes: readonly Stroke[]): void {
    let ink: Rect | null = null;
    const hl = new Map<string, Rect | null>();
    for (const s of strokes) {
      const box = strokePath(s, (k) => outline(k)).box;
      if (s.tool === 'highlighter') {
        this.#hlLayer(s.color);
        hl.set(s.color, union(hl.get(s.color) ?? null, box));
      } else ink = union(ink, box);
    }
    if (ink) this.#ink.invalidate(pad(ink, 6));
    for (const [color, box] of hl) this.#hl.get(color)?.layer.invalidate(box ? pad(box, 2) : null);
    this.#pruneHighlighters();
  }

  #pruneHighlighters(): void {
    const used = new Set(this.strokes.filter((s) => s.tool === 'highlighter').map((s) => s.color));
    for (const [color, h] of this.#hl) {
      if (used.has(color) || h.root.contains(this.#liveLayer.el)) continue;
      h.root.remove();
      this.#hl.delete(color);
    }
  }

  #mirrorAdd(strokes: readonly Stroke[]): void {
    this.#group.append(...strokes.map((s) => this.#mirrorPath(s)));
  }

  #mirror(): void {
    this.#group.replaceChildren(...this.strokes.map((s) => this.#mirrorPath(s)));
  }

  #mirrorPath(s: Stroke): SVGPathElement {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', strokePath(s, (k) => outline(k)).d);
    p.setAttribute('fill', s.color);
    p.setAttribute(
      'class',
      `ink-stroke ink-stroke--${s.tool}${this.selected.has(s.id) ? ' is-selected' : ''}${s.t !== undefined ? ' has-time' : ''}${this.#future.has(s.id) ? ' is-future' : ''}`,
    );
    p.dataset['id'] = String(s.id);
    return p;
  }

  /** Full repaint (after replacing `strokes` wholesale, e.g. loading a draft). */
  render(): void {
    this.#nextId = Math.max(this.#nextId, ...this.strokes.map((s) => s.id + 1));
    for (const s of this.strokes) if (s.tool === 'highlighter') this.#hlLayer(s.color);
    this.#pruneHighlighters();
    this.#ink.invalidate();
    for (const { layer } of this.#hl.values()) layer.invalidate();
    this.#mirror();
  }

  #hover(p: [number, number] | null): void {
    if (!p || !this.active) {
      this.#hoverDot.setAttribute('r', '0');
      this.svg.classList.remove('ink--hover');
      return;
    }
    const tool = this.effectiveTool;
    const eraser = tool === 'eraser' || tool === 'point-eraser';
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
        return segDist(x, y, p[0], p[1], q[0], q[1]) <= r + drawSize(s) / 2;
      });
    return [...this.strokes].reverse().find(near);
  }

  // -------------------------------------------------------------------------
  // Erasing

  #startErase(tool: 'eraser' | 'point-eraser', x: number, y: number, keep?: number): void {
    this.#erasing = {
      tool,
      before: this.strokes.map((s) => ({ ...s })),
      hits: 0,
      ...(keep !== undefined ? { keep } : {}),
    };
    this.#erase(x, y);
  }

  #restore(before: Stroke[]): void {
    const changed = [...this.strokes, ...before];
    this.strokes = before;
    this.#invalidate(changed);
    this.#mirror();
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
        s.id !== er.keep &&
        s.points.some((p, i) => {
          const q = s.points[i + 1] ?? p;
          return segDist(x, y, p[0], p[1], q[0], q[1]) <= 10 + drawSize(s) / 2;
        });
      const gone = this.strokes.filter(touched);
      if (gone.length > 0) {
        er.hits += gone.length;
        this.strokes = this.strokes.filter((s) => !gone.includes(s));
        this.#invalidate(gone);
        this.#mirror();
      }
      return;
    }
    // Point eraser: split strokes where the eraser passes.
    const changed: Stroke[] = [];
    const next: Stroke[] = [];
    for (const s of this.strokes) {
      if (s.id === er.keep || !s.points.some(hit)) {
        next.push(s);
        continue;
      }
      changed.push(s);
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
    if (changed.length > 0) {
      er.hits++;
      this.strokes = next;
      this.#invalidate(changed);
      this.#mirror();
    }
  }

  // -------------------------------------------------------------------------
  // Lasso selection and moving

  #inSelection(x: number, y: number): boolean {
    return this.strokes.some(
      (s) => this.selected.has(s.id) && s.points.some((p) => Math.hypot(p[0] - x, p[1] - y) < 18),
    );
  }

  #selectedBox(): Rect | null {
    let b: Rect | null = null;
    for (const s of this.strokes)
      if (this.selected.has(s.id)) b = union(b, strokePath(s, (k) => outline(k)).box);
    return b;
  }

  #startDrag(x: number, y: number): void {
    this.#drag = { x, y, dx: 0, dy: 0, box: null };
    const sel = this.strokes.filter((s) => this.selected.has(s.id));
    this.#invalidate(sel); // paints them out of the committed layers
    this.inkRoot.append(this.#liveLayer.el);
    this.#liveLayer.el.style.opacity = '';
    this.#moveDrag(x, y);
  }

  #moveDrag(x: number, y: number): void {
    const d = this.#drag!;
    d.dx = x - d.x;
    d.dy = y - d.y;
    const box = this.#selectedBox();
    if (!box) return;
    const moved: Rect = [box[0] + d.dx, box[1] + d.dy, box[2], box[3]];
    const dirty = union(d.box, moved)!;
    d.box = moved;
    const sel = this.strokes.filter((s) => this.selected.has(s.id));
    this.#liveLayer.draw(
      pad(dirty, 8),
      (ctx) => {
        ctx.translate(d.dx, d.dy);
        ctx.shadowColor = getAccent();
        ctx.shadowBlur = 4;
        for (const s of sel) {
          ctx.globalAlpha =
            s.tool === 'highlighter' ? TOOL_OPACITY.highlighter : TOOL_OPACITY[s.tool];
          ctx.fillStyle = s.color;
          ctx.fill(strokePath(s, (k) => outline(k)).path);
        }
      },
      true,
    );
  }

  #endDrag(cancel: boolean): void {
    const d = this.#drag!;
    this.#drag = null;
    this.#liveLayer.clear(d.box ? pad(d.box, 10) : null);
    const sel = this.strokes.filter((s) => this.selected.has(s.id));
    if (cancel || (d.dx === 0 && d.dy === 0)) {
      this.#invalidate(sel);
      return;
    }
    const op: InkOp = { kind: 'move', ids: [...this.selected], dx: d.dx, dy: d.dy };
    this.apply(op);
    this.opts.onOp(op);
  }

  select(ids: number[]): void {
    const before = this.strokes.filter((s) => this.selected.has(s.id));
    this.selected = new Set(ids);
    const after = this.strokes.filter((s) => this.selected.has(s.id));
    if (before.length + after.length > 0) {
      this.#invalidate([...before, ...after]);
      this.#mirror();
    }
    if (ids.length > 0) {
      this.opts.onStatus?.(
        `${ids.length} ink stroke${ids.length === 1 ? '' : 's'} selected · drag to move, Delete to remove`,
      );
    }
  }

  /**
   * Ink to Shape on existing strokes: convert the ones that read as shapes (one undo
   * step). Returns how many changed.
   */
  convertToShapes(ids: readonly number[]): number {
    const want = new Set(ids);
    let changed = 0;
    const after = this.strokes.map((s) => {
      if (!want.has(s.id) || s.shape) return s;
      const shape = recognizeShape(s.points);
      if (!shape) return s;
      changed++;
      return { ...s, points: shape.points, shape: shape.kind };
    });
    if (changed === 0) return 0;
    const op: InkOp = { kind: 'replace', before: this.strokes.map((s) => ({ ...s })), after };
    this.apply(op);
    this.opts.onOp(op);
    return changed;
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

  // -------------------------------------------------------------------------
  // Operations

  /** Apply an operation, or undo it with `reverse`. */
  apply(op: InkOp, reverse = false): void {
    const prev = this.strokes;
    if (op.kind === 'add' || op.kind === 'remove') {
      const adding = (op.kind === 'add') !== reverse;
      const ids = new Set(op.strokes.map((s) => s.id));
      const rest = this.strokes.filter((s) => !ids.has(s.id));
      this.strokes = adding ? [...rest, ...op.strokes] : rest;
      if (adding && op.kind === 'add' && !reverse && op.strokes.every((s) => !prev.includes(s))) {
        // Fast path: a new stroke is drawn on top, no repaint of what's under it.
        this.#nextId = Math.max(this.#nextId, ...op.strokes.map((s) => s.id + 1));
        this.#drawOnTop(op.strokes);
        this.#mirrorAdd(op.strokes);
        this.page.dispatchEvent(new Event('ls-ink-change', { bubbles: true }));
        return;
      } else this.#invalidate([...op.strokes, ...prev.filter((s) => ids.has(s.id))]);
    } else if (op.kind === 'replace') {
      this.strokes = (reverse ? op.before : op.after).map((s) => ({ ...s }));
      this.#invalidate([...prev, ...op.before, ...op.after]);
    } else {
      const k = reverse ? -1 : 1;
      const ids = new Set(op.ids);
      const moved: Stroke[] = [];
      this.strokes = this.strokes.map((s) => {
        if (!ids.has(s.id)) return s;
        const m: Stroke = {
          ...s,
          points: s.points.map(
            ([x, y, ...rest]): Point => [x + k * op.dx, y + k * op.dy, ...rest] as Point,
          ),
        };
        moved.push(s, m);
        return m;
      });
      this.#invalidate(moved);
    }
    this.#mirror();
    this.page.dispatchEvent(new Event('ls-ink-change', { bubbles: true }));
  }

  #drawOnTop(strokes: readonly Stroke[]): void {
    for (const s of strokes) {
      const c = strokePath(s, (k) => outline(k));
      if (s.tool === 'highlighter') {
        // Same color, opaque: drawing on top never darkens what's already there.
        this.#hlLayer(s.color).layer.draw(c.box, (ctx) => {
          ctx.fillStyle = s.color;
          ctx.fill(c.path);
        });
      } else {
        this.#ink.draw(c.box, (ctx) => {
          ctx.globalAlpha = TOOL_OPACITY[s.tool] * (this.#future.has(s.id) ? 0.22 : 1);
          ctx.fillStyle = s.color;
          ctx.fill(c.path);
        });
      }
    }
  }

  /** Mark strokes recorded after `t` in a recording (dimmed during playback). */
  markPlayback(rec: string | null, t: number): void {
    const next = new Set(
      this.strokes
        .filter((s) => rec !== null && s.rec === rec && s.t !== undefined && s.t > t)
        .map((s) => s.id),
    );
    const changed = this.strokes.filter((s) => next.has(s.id) !== this.#future.has(s.id));
    this.#future = next;
    if (changed.length === 0) return;
    this.#invalidate(changed);
    for (const p of this.#group.querySelectorAll<SVGPathElement>('path')) {
      p.classList.toggle('is-future', next.has(Number(p.dataset['id'])));
    }
  }

  get replaying(): boolean {
    return this.#replaying !== null;
  }

  /**
   * Replay strokes in drawing order; calling it again stops the replay. It's an explicit
   * request, so it runs even with reduced motion (just faster). Long pages are sped up
   * to finish in about 8 seconds. Returns false when there's no ink.
   */
  replay(onDone?: () => void): boolean {
    if (this.#replaying) {
      this.#replaying = null;
      return true;
    }
    const all = [...this.strokes];
    if (all.length === 0) return false;
    const total = all.reduce((n, s) => n + s.points.length, 0);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const perFrame = Math.max(reduced ? 12 : 3, Math.ceil(total / ((reduced ? 2 : 8) * 60)));
    this.#syncView();
    this.#replaying = { upTo: 0 };
    this.render();
    let si = 0;
    let pi = 1;
    const step = (): void => {
      const s = all[si];
      if (!s || !this.#replaying) {
        this.#replaying = null;
        this.#liveLayer.clear();
        this.render();
        onDone?.();
        return;
      }
      pi = Math.min(s.points.length, pi + perFrame);
      const partial: Stroke = { ...s, points: s.points.slice(0, pi) };
      const host = s.tool === 'highlighter' ? this.#hlLayer(s.color).root : this.inkRoot;
      host.append(this.#liveLayer.el);
      const o = getStroke(partial.points as number[][], strokeOptions(partial, false));
      const path = new Path2D(pathOf(o));
      const box = strokePath(s, (k) => outline(k)).box;
      this.#liveLayer.draw(
        pad(box, 4),
        (ctx) => {
          ctx.globalAlpha = s.tool === 'highlighter' ? 1 : TOOL_OPACITY[s.tool];
          ctx.fillStyle = s.color;
          ctx.fill(path);
        },
        true,
      );
      if (pi >= s.points.length) {
        this.#liveLayer.clear(pad(box, 6));
        si++;
        pi = 1;
        this.#replaying.upTo = si;
        this.#drawOnTop([s]);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  }

  /** Read a layer pixel at a page point (tests): 'ink', 'live', or a highlighter color. */
  pixelAt(layer: string, x: number, y: number): [number, number, number, number] | null {
    if (layer === 'ink') return this.#ink.pixel(x, y);
    if (layer === 'live') return this.#liveLayer.pixel(x, y);
    return this.#hl.get(layer)?.layer.pixel(x, y) ?? null;
  }

  /** Width the renderer uses for a stroke (tests: tilt must survive a re-render). */
  widthOf(s: Stroke): number {
    return drawSize(s);
  }

  /** Tiles holding a bitmap (tests: far-away tiles must be released). */
  get allocatedTiles(): number {
    return this.#layers().reduce((n, l) => n + l.liveTiles, 0);
  }

  /** Outline bounds of a stroke (tests). */
  boundsOf(s: Stroke): Rect {
    return strokePath(s, (k) => outline(k)).box;
  }

  /** Stroke bounds from samples (no rendering). */
  static sampleBounds(s: Stroke): Rect {
    return bboxOf(s.points, s.size / 2);
  }
}

function pathOf(o: number[][]): string {
  return o.length > 1 ? pathFromOutline(o) : '';
}

function lowOutline(s: Stroke): number[][] {
  const pts = decimate(s.points, 4);
  const o = strokeOptions(s, true);
  return getStroke(pts as number[][], { ...o, smoothing: 0, streamline: 0 });
}

function intersectsRect(a: Rect, b: Rect): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

let accent = '';
function getAccent(): string {
  if (!accent) {
    accent =
      getComputedStyle(document.documentElement).getPropertyValue('--ls-accent').trim() ||
      '#2f6fdf';
  }
  return accent;
}
