/**
 * Notes mode: handwriting-first view of the same .docx page. Paper backgrounds
 * are a view layer only (they are not saved into the document). The ink layer,
 * a floating pen toolbar, a magnifier writing strip, and audio recording synced
 * to strokes and typed paragraphs all stay on this device.
 */
import {
  Circle,
  Eraser,
  Highlighter,
  LassoSelect,
  Mic,
  Pause,
  PenLine,
  Pencil,
  Play,
  Square,
  Star,
  X,
} from 'lucide';
import { micError, type AudioNotes, type Recording } from './audio.js';
import type { InkLayer, InkTool, Stroke } from './ink.js';
import { formatTime, markPosition, seekTime } from './timeline.js';
import { el, icon, tap, toast } from './ui.js';

export type Paper = 'blank' | 'lined' | 'grid' | 'dotted';
export const PAPERS: { id: Paper; label: string }[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'lined', label: 'Lined' },
  { id: 'grid', label: 'Grid' },
  { id: 'dotted', label: 'Dotted' },
];
export const PAPER_COLORS = [
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'cream', label: 'Cream', color: '#fbf5e9' },
  { id: 'mist', label: 'Mist', color: '#eef5f6' },
  { id: 'night', label: 'Night', color: '#1c1c1c' },
];
export const INK_COLORS = [
  '#1a1916',
  '#0a6a7c',
  '#2f6fd0',
  '#c0392b',
  '#2e8b57',
  '#e0a800',
  '#7b3fb0',
];
export const WIDTHS = [2, 4, 7];

interface Favorite {
  tool: InkTool;
  color: string;
  size: number;
}

const FAV_KEY = 'lucid-sentence:pen-favorites';
const TOOLS: { id: InkTool; label: string; node: typeof PenLine }[] = [
  { id: 'pen', label: 'Pen', node: PenLine },
  { id: 'pencil', label: 'Pencil', node: Pencil },
  { id: 'highlighter', label: 'Highlighter', node: Highlighter },
  { id: 'eraser', label: 'Eraser', node: Eraser },
  { id: 'lasso', label: 'Lasso Select', node: LassoSelect },
];

/** Floating, draggable pen toolbar (Draw tab and Notes mode). */
export class PenToolbar {
  favorites: Favorite[];
  /** Phone: docked as a strip above the bottom bar (no dragging). */
  docked = false;
  #pos: { x: number; y: number } | null = null;

  constructor(
    readonly root: HTMLElement,
    readonly ink: InkLayer,
    readonly onClose: () => void,
  ) {
    try {
      this.favorites = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as Favorite[];
    } catch {
      this.favorites = [];
    }
    root.addEventListener('pointerdown', (e) => {
      if (!this.docked && (e.target as Element).closest('.pentool__grip')) this.#startDrag(e);
    });
  }

  show(on: boolean): void {
    this.root.hidden = !on;
    if (on) this.render();
  }

  #built = false;
  #favs: HTMLElement | null = null;
  #favKey = '';

  /** Save a pen as a favorite (Add Pen, or the star button). Returns false for non-pens. */
  addFavorite(
    f: Favorite = { tool: this.ink.tool, color: this.ink.color, size: this.ink.size },
  ): boolean {
    if (f.tool === 'eraser' || f.tool === 'point-eraser' || f.tool === 'lasso') return false;
    const same = (x: Favorite): boolean =>
      x.tool === f.tool && x.color === f.color && x.size === f.size;
    this.favorites = [...this.favorites.filter((x) => !same(x)), f].slice(-4);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(this.favorites));
    } catch {
      /* storage full or blocked: still in the toolbar for this session */
    }
    this.render();
    return true;
  }

  /**
   * Build the toolbar once, then update it in place. Rebuilding on every change used to
   * swap the buttons out from under a finger, and the tap was lost on Android.
   */
  render(): void {
    if (!this.#built) this.#build();
    const ink = this.ink;
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-tool]')) {
      const t = b.dataset['tool'];
      b.setAttribute(
        'aria-pressed',
        String(ink.tool === t || (t === 'eraser' && ink.tool === 'point-eraser')),
      );
    }
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-color]')) {
      b.setAttribute('aria-pressed', String(ink.color === b.dataset['color']));
    }
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-width]')) {
      b.setAttribute('aria-pressed', String(ink.size === Number(b.dataset['width'])));
    }
    const key = JSON.stringify(this.favorites);
    if (key !== this.#favKey && this.#favs) {
      this.#favKey = key;
      this.#renderFavs(this.#favs);
    }
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-fav]')) {
      const f = this.favorites[Number(b.dataset['fav'])];
      b.setAttribute(
        'aria-pressed',
        String(!!f && f.tool === ink.tool && f.color === ink.color && f.size === ink.size),
      );
    }
    if (this.#pos && !this.docked) {
      this.root.style.left = `${this.#pos.x}px`;
      this.root.style.top = `${this.#pos.y}px`;
      this.root.style.transform = 'none';
    }
  }

  #btn(label: string, node: typeof PenLine, run: () => void, extra = ''): HTMLButtonElement {
    const b = el('button', {
      type: 'button',
      class: `pentool__btn ${extra}`,
      'aria-label': label,
      title: label,
    });
    b.append(icon(node, 20));
    tap(b, () => {
      run();
      this.render();
    });
    return b;
  }

  #build(): void {
    this.#built = true;
    const ink = this.ink;
    const tools = el('div', { class: 'pentool__group', role: 'group', 'aria-label': 'Tools' });
    for (const t of TOOLS) {
      const b = this.#btn(t.label, t.node, () => {
        ink.setTool(t.id);
      });
      b.dataset['tool'] = t.id;
      tools.append(b);
    }
    const colors = el('div', { class: 'pentool__group', 'aria-label': 'Colors', role: 'group' });
    for (const c of INK_COLORS) {
      const b = el('button', {
        type: 'button',
        class: 'pentool__color',
        style: `--c:${c}`,
        'aria-label': `Color ${c}`,
        'data-color': c,
      });
      tap(b, () => {
        ink.color = c;
        if (ink.tool === 'eraser' || ink.tool === 'point-eraser' || ink.tool === 'lasso')
          ink.setTool('pen');
        this.render();
      });
      colors.append(b);
    }
    const widths = el('div', { class: 'pentool__group', 'aria-label': 'Width', role: 'group' });
    for (const w of WIDTHS) {
      const b = el('button', {
        type: 'button',
        class: 'pentool__width',
        'aria-label': `Width ${w}`,
        'data-width': String(w),
      });
      b.append(el('span', { style: `--w:${w + 2}px` }));
      tap(b, () => {
        ink.size = w;
        if (ink.tool === 'eraser' || ink.tool === 'point-eraser' || ink.tool === 'lasso')
          ink.setTool('pen');
        this.render();
      });
      widths.append(b);
    }
    this.#favs = el('div', { class: 'pentool__group pentool__favs', 'aria-label': 'Favorites' });
    const grip = el('span', {
      class: 'pentool__grip',
      'aria-hidden': 'true',
      title: 'Drag to move',
    });
    const close = this.#btn(
      'Close pen toolbar',
      X,
      () => {
        this.onClose();
      },
      'pentool__close',
    );
    this.root.replaceChildren(
      grip,
      tools,
      el('span', { class: 'pentool__sep' }),
      colors,
      el('span', { class: 'pentool__sep' }),
      widths,
      el('span', { class: 'pentool__sep' }),
      this.#favs,
      close,
    );
  }

  #renderFavs(favs: HTMLElement): void {
    const ink = this.ink;
    const items: HTMLElement[] = this.favorites.map((f, i) => {
      const b = el('button', {
        type: 'button',
        class: 'pentool__fav',
        style: `--c:${f.color}`,
        'aria-label': `Favorite ${i + 1}: ${f.tool}, ${f.color}, width ${f.size}`,
        title: `${f.tool} · ${f.size}`,
        'data-fav': String(i),
      });
      b.append(icon(TOOLS.find((t) => t.id === f.tool)?.node ?? PenLine, 16));
      tap(b, () => {
        ink.setTool(f.tool);
        ink.color = f.color;
        ink.size = f.size;
        this.render();
      });
      return b;
    });
    const star = this.#btn('Add current pen to favorites', Star, () => {
      if (this.addFavorite()) toast('Pen saved to favorites');
      else toast('Pick a pen, pencil, or highlighter first, then save it.');
    });
    favs.replaceChildren(...items, star);
  }

  #startDrag(e: PointerEvent): void {
    e.preventDefault();
    const r = this.root.getBoundingClientRect();
    const ox = e.clientX - r.left;
    const oy = e.clientY - r.top;
    const move = (m: PointerEvent): void => {
      const x = Math.max(4, Math.min(window.innerWidth - r.width - 4, m.clientX - ox));
      const y = Math.max(4, Math.min(window.innerHeight - r.height - 4, m.clientY - oy));
      this.#pos = { x, y };
      this.root.style.left = `${x}px`;
      this.root.style.top = `${y}px`;
      this.root.style.transform = 'none';
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}

/** Magnifier writing strip: write large; ink lands small in the framed area of the page. */
export class WritingStrip {
  readonly root: HTMLElement;
  readonly frame: HTMLElement;
  #svg: SVGSVGElement;
  #use: SVGUseElement;
  #x = 96;
  #y = 160;
  readonly zoom = 2.5;
  open = false;

  constructor(
    readonly page: HTMLElement,
    readonly ink: InkLayer,
  ) {
    const ns = 'http://www.w3.org/2000/svg';
    this.root = el('div', {
      class: 'strip',
      hidden: '',
      role: 'region',
      'aria-label': 'Magnified writing strip',
    });
    this.frame = el('div', { class: 'strip-frame', hidden: '', 'aria-hidden': 'true' });
    this.#svg = document.createElementNS(ns, 'svg');
    this.#svg.setAttribute('class', 'strip__ink');
    this.#use = document.createElementNS(ns, 'use');
    if (!ink.group.id) ink.group.id = 'ink-strokes';
    this.#use.setAttribute('href', `#${ink.group.id}`);
    this.#svg.append(this.#use);
    const next = el(
      'button',
      { type: 'button', class: 'strip__next', 'aria-label': 'Move the strip to the next line' },
      '↵',
    );
    tap(next, () => {
      this.#y += 32;
      this.#x = 96;
      this.update();
    });
    this.root.append(this.#svg, next);
    page.append(this.frame);
    document.body.append(this.root); // main.ts moves it into the layout
    let drawing = false;
    const map = (e: PointerEvent): [number, number] => {
      const r = this.#svg.getBoundingClientRect();
      return [
        this.#x + (e.clientX - r.left) / this.zoom,
        this.#y + (e.clientY - r.top) / this.zoom,
      ];
    };
    this.#svg.addEventListener('pointerdown', (e) => {
      if (!ink.accepts(e.pointerType)) return;
      e.preventDefault();
      this.#svg.setPointerCapture(e.pointerId);
      drawing = true;
      ink.startStroke(...map(e), e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5, e.pointerType);
    });
    this.#svg.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      ink.extendStroke(...map(e), e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5);
    });
    const end = (): void => {
      if (!drawing) return;
      drawing = false;
      ink.endStroke();
      // Auto-advance when writing nears the right edge of the strip.
      const w = this.#svg.clientWidth / this.zoom;
      const last = ink.strokes.at(-1);
      const maxX = last ? Math.max(...last.points.map((p) => p[0])) : 0;
      if (maxX > this.#x + w * 0.8) {
        this.#x = Math.min(this.page.offsetWidth - w - 48, this.#x + w * 0.6);
        this.update();
      }
    };
    this.#svg.addEventListener('pointerup', end);
    this.#svg.addEventListener('pointercancel', end);
    page.addEventListener('dblclick', (e) => {
      if (!this.open) return;
      const r = page.getBoundingClientRect();
      const s = r.width / page.offsetWidth || 1;
      this.#x = (e.clientX - r.left) / s - 20;
      this.#y = (e.clientY - r.top) / s - 16;
      this.update();
    });
  }

  toggle(on = !this.open): void {
    if (on && !this.open) this.#intoView();
    this.open = on;
    // The strip shows the vector copy of the ink; include the stroke being drawn.
    this.ink.mirrorLive = on;
    this.root.hidden = !on;
    this.frame.hidden = !on;
    this.update();
  }

  /** Opening: if the writing frame is off screen, move it to the top of what's visible. */
  #intoView(): void {
    const scroller = this.page.closest<HTMLElement>('.canvas');
    if (!scroller) return;
    const pr = this.page.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    const z = pr.width / (this.page.offsetWidth || 1) || 1;
    const top = (sr.top - pr.top) / z;
    const bottom = (sr.bottom - pr.top) / z;
    if (this.#y < top + 8 || this.#y > bottom - 120) {
      this.#y = Math.max(48, Math.round(top + 40));
      this.#x = 96;
    }
  }

  update(): void {
    const w = this.#svg.clientWidth / this.zoom || 240;
    const h = this.#svg.clientHeight / this.zoom || 48;
    this.frame.style.left = `${this.#x}px`;
    this.frame.style.top = `${this.#y}px`;
    this.frame.style.width = `${w}px`;
    this.frame.style.height = `${h}px`;
    this.#svg.setAttribute('viewBox', `${this.#x} ${this.#y} ${w} ${h}`);
    this.root.style.setProperty('--strip-bg-x', `${-this.#x * this.zoom}px`);
    this.root.style.setProperty('--strip-bg-y', `${-this.#y * this.zoom}px`);
  }
}

/** Audio timeline bar (after Chapternal's audio timeline): record, play, marks, scrub. */
export class Timeline {
  readonly root: HTMLElement;
  #selected: string | null = null;
  readonly #rec: HTMLButtonElement;
  readonly #play: HTMLButtonElement;
  readonly #time: HTMLElement;
  readonly #track: HTMLElement;
  readonly #fill: HTMLElement;
  readonly #head: HTMLElement;
  readonly #marks: HTMLElement;
  readonly #dot: Element;
  readonly #live: HTMLElement;
  readonly #pick: HTMLSelectElement;
  #recIcon = '';
  #playIcon = '';
  #marksKey = '';
  #pickKey = '';
  #tick: ReturnType<typeof setInterval> | null = null;
  /** Position being dragged to (ms), while scrubbing. */
  #scrub: number | null = null;
  #starting = false;

  constructor(
    readonly audio: AudioNotes,
    readonly ink: InkLayer,
    readonly doc: HTMLElement,
  ) {
    this.root = el('div', {
      class: 'timeline',
      role: 'region',
      'aria-label': 'Audio notes',
      hidden: '',
    });
    this.#rec = el('button', { type: 'button', class: 'timeline__rec' });
    this.#play = el('button', { type: 'button', class: 'timeline__play' });
    this.#time = el('span', { class: 'timeline__time' });
    this.#fill = el('div', { class: 'timeline__fill' });
    this.#marks = el('span', { class: 'timeline__marks' });
    this.#head = el('span', { class: 'timeline__head' });
    this.#track = el(
      'div',
      {
        class: 'timeline__track',
        role: 'slider',
        tabindex: '0',
        'aria-label': 'Playback position',
        'aria-valuemin': '0',
      },
      this.#fill,
      this.#marks,
      this.#head,
    );
    this.#dot = icon(Circle, 10, 'timeline__dot');
    this.#live = el('span', { class: 'timeline__live' });
    this.#pick = el('select', { class: 'timeline__pick', 'aria-label': 'Recording' });
    this.root.append(
      this.#rec,
      this.#play,
      this.#time,
      this.#track,
      this.#dot,
      this.#live,
      this.#pick,
    );

    tap(this.#rec, () => {
      this.#toggleRecord();
    });
    tap(this.#play, () => {
      const rec = this.#current();
      if (!rec || this.audio.recording) return;
      if (this.#isPlaying(rec.id)) this.audio.pause();
      else
        void this.audio.play(rec.id, this.audio.playing?.id === rec.id ? this.audio.position : 0);
    });
    this.#pick.addEventListener('change', () => {
      this.#selected = this.#pick.value;
      if (this.audio.playing && this.audio.playing.id !== this.#selected) this.audio.pause();
      this.render();
    });
    this.#bindScrub();

    // Typed paragraphs get the time they were started while recording.
    doc.addEventListener('input', () => {
      const c = audio.clock();
      if (!c) return;
      const sel = document.getSelection();
      const n = sel?.anchorNode;
      const block = (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>(
        'p,h1,h2,h3,h4,li,blockquote',
      );
      if (block && doc.contains(block) && !block.dataset['t']) {
        block.dataset['rec'] = c.rec;
        block.dataset['t'] = String(Math.round(c.t));
      }
    });
    doc.addEventListener('click', (e) => {
      if (!document.body.classList.contains('notes') || audio.recording) return;
      const block = (e.target as Element).closest<HTMLElement>('[data-t]');
      if (block?.dataset['rec'] && e.altKey)
        void this.seek(block.dataset['rec'], Number(block.dataset['t']));
    });
  }

  #current(): Recording | null {
    const recs = this.audio.recordings;
    const sel = this.#selected ?? this.audio.playing?.id ?? recs.at(-1)?.id ?? null;
    return recs.find((r) => r.id === sel) ?? null;
  }

  #isPlaying(id: string): boolean {
    return !this.audio.audio.paused && this.audio.playing?.id === id;
  }

  #toggleRecord(): void {
    const a = this.audio;
    if (a.recording) {
      void a.stop().then((r) => {
        if (r) {
          this.#selected = r.id;
          toast(
            `Saved recording on this device (${formatTime(r.duration)}). Tap ink to hear that moment.`,
          );
        }
        this.render();
      });
      return;
    }
    if (this.#starting) return;
    this.#starting = true;
    this.#live.textContent = 'Starting the microphone…';
    a.start().then(
      () => {
        this.#starting = false;
        a.pause();
        toast('Recording. Strokes and typing are timestamped.');
        this.render();
      },
      (e: unknown) => {
        this.#starting = false;
        toast(micError(e), 7000);
        this.render();
      },
    );
  }

  #bindScrub(): void {
    const t = this.#track;
    const at = (e: PointerEvent): number => {
      const rec = this.#current();
      const r = t.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1)));
      return f * (rec?.duration ?? 0);
    };
    t.addEventListener('pointerdown', (e) => {
      if (!this.#current() || this.audio.recording) return;
      e.preventDefault();
      t.setPointerCapture(e.pointerId);
      this.#scrub = at(e);
      this.render();
    });
    t.addEventListener('pointermove', (e) => {
      if (this.#scrub === null) return;
      this.#scrub = at(e);
      this.render();
    });
    const end = (e: PointerEvent, cancel: boolean): void => {
      if (this.#scrub === null) return;
      const pos = cancel ? null : at(e);
      this.#scrub = null;
      const rec = this.#current();
      if (rec && pos !== null) void this.audio.play(rec.id, pos);
      this.render();
    };
    t.addEventListener('pointerup', (e) => {
      end(e, false);
    });
    t.addEventListener('pointercancel', (e) => {
      end(e, true);
    });
    t.addEventListener('keydown', (e) => {
      const rec = this.#current();
      if (!rec || this.audio.recording) return;
      const step = e.key === 'ArrowRight' ? 5000 : e.key === 'ArrowLeft' ? -5000 : 0;
      if (!step) return;
      e.preventDefault();
      const base = this.audio.playing?.id === rec.id ? this.audio.position : 0;
      void this.audio.play(rec.id, Math.max(0, Math.min(rec.duration, base + step)));
    });
  }

  /** Seek to a stroke's moment (tap a stroke while not drawing). */
  seekStroke(s: Stroke): void {
    if (s.rec && s.t !== undefined) void this.seek(s.rec, s.t);
  }

  async seek(rec: string, t: number): Promise<void> {
    this.#selected = rec;
    await this.audio.play(rec, seekTime(t));
    toast(`Playing from ${formatTime(seekTime(t))}`);
  }

  show(on: boolean): void {
    this.root.hidden = !on;
    if (!on && this.audio.playing) this.audio.pause();
    this.render();
  }

  /** Update in place. Never rebuild the buttons: a tap that lands while they're being
   * replaced is lost (that's what made record/play feel dead on Android). */
  render(): void {
    const a = this.audio;
    if (a.recording && this.#tick === null && !this.root.hidden) {
      this.#tick = setInterval(() => {
        this.render();
      }, 250);
    } else if ((!a.recording || this.root.hidden) && this.#tick !== null) {
      clearInterval(this.#tick);
      this.#tick = null;
    }
    if (this.root.hidden) return;
    const recs = a.recordings;
    const rec = this.#current();
    const sel = rec?.id ?? null;

    const recIcon = a.recording ? 'stop' : 'mic';
    this.#rec.classList.toggle('is-on', a.recording);
    this.#rec.setAttribute('aria-pressed', String(a.recording));
    this.#rec.setAttribute('aria-label', a.recording ? 'Stop recording' : 'Record audio');
    if (recIcon !== this.#recIcon) {
      this.#recIcon = recIcon;
      this.#rec.replaceChildren(icon(a.recording ? Square : Mic, 18));
    }

    const playing = sel !== null && this.#isPlaying(sel);
    this.#play.disabled = !rec || a.recording;
    this.#play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if ((playing ? 'pause' : 'play') !== this.#playIcon) {
      this.#playIcon = playing ? 'pause' : 'play';
      this.#play.replaceChildren(icon(playing ? Pause : Play, 18));
    }

    const dur = a.recording ? (a.clock()?.t ?? 0) : (rec?.duration ?? 0);
    const pos =
      this.#scrub ?? (a.recording ? dur : a.playing && a.playing.id === sel ? a.position : 0);
    this.#time.textContent = `${formatTime(pos)} / ${formatTime(dur)}`;
    this.#fill.style.width = `${markPosition(pos, dur)}%`;
    this.#head.style.left = `${markPosition(pos, dur)}%`;
    this.#track.setAttribute('aria-valuemax', String(Math.round(dur / 1000)));
    this.#track.setAttribute('aria-valuenow', String(Math.round(pos / 1000)));
    this.#track.setAttribute('aria-valuetext', formatTime(pos));
    this.#track.classList.toggle('is-disabled', !rec || a.recording);

    // Marks: one per stroke and typed paragraph in this recording.
    const recId = a.current?.id ?? sel;
    const strokes = this.ink.strokes.filter((x) => x.rec === recId && x.t !== undefined);
    const blocks = [...this.doc.querySelectorAll<HTMLElement>(`[data-rec="${recId ?? ''}"]`)];
    const key = `${recId}|${Math.round(dur / (a.recording ? 1000 : 1))}|${strokes.length}|${blocks.length}`;
    if (key !== this.#marksKey) {
      this.#marksKey = key;
      this.#marks.replaceChildren(
        ...strokes.map((s) =>
          el('span', {
            class: 'timeline__mark timeline__mark--ink',
            style: `left:${markPosition(s.t ?? 0, dur)}%`,
          }),
        ),
        ...blocks.map((b) =>
          el('span', {
            class: 'timeline__mark timeline__mark--text',
            style: `left:${markPosition(Number(b.dataset['t']), dur)}%`,
          }),
        ),
      );
    }

    (this.#dot as HTMLElement | SVGElement).style.display = a.recording ? '' : 'none';
    this.#live.textContent = this.#starting
      ? 'Starting the microphone…'
      : a.recording
        ? 'REC'
        : recs.length
          ? 'Tap ink to replay its moment'
          : 'Tap the mic to record a lecture with your notes';

    // Recordings list: rebuild only when it changes (an open picker must not be replaced).
    const pickKey = `${recs.map((r) => `${r.id}:${Math.round(r.duration / 1000)}`).join(',')}|${sel}`;
    if (pickKey !== this.#pickKey && document.activeElement !== this.#pick) {
      this.#pickKey = pickKey;
      const opts = recs.length === 0 ? [el('option', { value: '' }, 'No recordings')] : [];
      recs.forEach((r, i) => {
        const o = el('option', { value: r.id }, `Recording ${i + 1} · ${formatTime(r.duration)}`);
        if (r.id === sel) o.selected = true;
        opts.push(o);
      });
      this.#pick.replaceChildren(...opts);
      this.#pick.disabled = recs.length === 0;
    }
    this.ink.markPlayback(playing ? sel : null, pos);
  }
}
