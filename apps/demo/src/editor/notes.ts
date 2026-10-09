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
import type { AudioNotes } from './audio.js';
import type { InkLayer, InkTool, Stroke } from './ink.js';
import { formatTime, markPosition, seekTime } from './timeline.js';
import { el, icon, toast } from './ui.js';

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
      if ((e.target as Element).closest('.pentool__grip')) this.#startDrag(e);
    });
  }

  show(on: boolean): void {
    this.root.hidden = !on;
    if (on) this.render();
  }

  render(): void {
    const ink = this.ink;
    const btn = (
      label: string,
      node: typeof PenLine,
      pressed: boolean,
      run: () => void,
      extra = '',
    ): HTMLButtonElement => {
      const b = el('button', {
        type: 'button',
        class: `pentool__btn ${extra}`,
        'aria-label': label,
        title: label,
        'aria-pressed': String(pressed),
      });
      b.append(icon(node, 20));
      b.addEventListener('click', () => {
        run();
        this.render();
      });
      return b;
    };
    const tools = el('div', { class: 'pentool__group', role: 'radiogroup', 'aria-label': 'Tools' });
    for (const t of TOOLS) {
      tools.append(
        btn(
          t.label,
          t.node,
          ink.tool === t.id || (t.id === 'eraser' && ink.tool === 'point-eraser'),
          () => {
            ink.setTool(t.id);
          },
        ),
      );
    }
    const colors = el('div', {
      class: 'pentool__group',
      'aria-label': 'Colors',
      role: 'radiogroup',
    });
    for (const c of INK_COLORS) {
      const b = el('button', {
        type: 'button',
        class: 'pentool__color',
        style: `--c:${c}`,
        'aria-label': `Color ${c}`,
        'aria-pressed': String(ink.color === c),
      });
      b.addEventListener('click', () => {
        ink.color = c;
        if (ink.tool === 'eraser' || ink.tool === 'lasso') ink.setTool('pen');
        this.render();
      });
      colors.append(b);
    }
    const widths = el('div', {
      class: 'pentool__group',
      'aria-label': 'Width',
      role: 'radiogroup',
    });
    for (const w of WIDTHS) {
      const b = el('button', {
        type: 'button',
        class: 'pentool__width',
        'aria-label': `Width ${w}`,
        'aria-pressed': String(ink.size === w),
      });
      b.append(el('span', { style: `--w:${w + 2}px` }));
      b.addEventListener('click', () => {
        ink.size = w;
        this.render();
      });
      widths.append(b);
    }
    const favs = el('div', { class: 'pentool__group pentool__favs', 'aria-label': 'Favorites' });
    this.favorites.forEach((f, i) => {
      const b = el('button', {
        type: 'button',
        class: 'pentool__fav',
        style: `--c:${f.color}`,
        'aria-label': `Favorite ${i + 1}: ${f.tool}, ${f.color}, width ${f.size}`,
        title: `${f.tool} · ${f.size}`,
      });
      b.append(icon(TOOLS.find((t) => t.id === f.tool)?.node ?? PenLine, 16));
      b.addEventListener('click', () => {
        ink.setTool(f.tool);
        ink.color = f.color;
        ink.size = f.size;
        this.render();
      });
      favs.append(b);
    });
    favs.append(
      btn('Add current pen to favorites', Star, false, () => {
        if (ink.tool === 'eraser' || ink.tool === 'point-eraser' || ink.tool === 'lasso') return;
        this.favorites = [
          ...this.favorites,
          { tool: ink.tool, color: ink.color, size: ink.size },
        ].slice(-4);
        localStorage.setItem(FAV_KEY, JSON.stringify(this.favorites));
        toast('Pen saved to favorites');
      }),
    );
    const grip = el('span', {
      class: 'pentool__grip',
      'aria-hidden': 'true',
      title: 'Drag to move',
    });
    const close = btn(
      'Close pen toolbar',
      X,
      false,
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
      favs,
      close,
    );
    if (this.#pos) {
      this.root.style.left = `${this.#pos.x}px`;
      this.root.style.top = `${this.#pos.y}px`;
      this.root.style.transform = 'none';
    }
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
    next.addEventListener('click', () => {
      this.#y += 32;
      this.#x = 96;
      this.update();
    });
    this.root.append(this.#svg, next);
    page.append(this.frame);
    document.body.append(this.root);
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
    this.open = on;
    this.root.hidden = !on;
    this.frame.hidden = !on;
    this.update();
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

/** Audio timeline bar (after Chapternal's audio timeline): record, play, marks, seek. */
export class Timeline {
  readonly root: HTMLElement;
  #selected: string | null = null;

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
    this.render();
  }

  render(): void {
    if (this.root.hidden) return;
    const a = this.audio;
    const recs = a.recordings;
    const sel = this.#selected ?? a.playing?.id ?? recs.at(-1)?.id ?? null;
    const rec = recs.find((r) => r.id === sel) ?? null;
    const recBtn = el('button', {
      type: 'button',
      class: `timeline__rec${a.recording ? ' is-on' : ''}`,
      'aria-pressed': String(a.recording),
      'aria-label': a.recording ? 'Stop recording' : 'Record audio',
    });
    recBtn.append(icon(a.recording ? Square : Mic, 18));
    recBtn.addEventListener('click', () => {
      if (a.recording) {
        void a.stop().then((r) => {
          if (r) {
            this.#selected = r.id;
            toast(`Saved recording on this device (${formatTime(r.duration)})`);
          }
        });
      } else {
        a.start().then(
          () => {
            toast('Recording. Strokes and typing are timestamped.');
          },
          () => {
            toast('Microphone not available');
          },
        );
      }
    });
    const playing = !a.audio.paused && a.playing?.id === sel;
    const playBtn = el('button', {
      type: 'button',
      class: 'timeline__play',
      'aria-label': playing ? 'Pause' : 'Play',
      disabled: rec && !a.recording ? undefined : '',
    });
    playBtn.append(icon(playing ? Pause : Play, 18));
    playBtn.addEventListener('click', () => {
      if (!rec) return;
      if (playing) a.pause();
      else void a.play(rec.id, a.playing?.id === rec.id ? a.position : 0);
    });
    const dur = a.recording ? (a.clock()?.t ?? 0) : (rec?.duration ?? 0);
    const pos = a.recording ? dur : a.playing?.id === sel ? a.position : 0;
    const track = el('div', {
      class: 'timeline__track',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Playback position',
      'aria-valuemin': '0',
      'aria-valuemax': String(Math.round(dur / 1000)),
      'aria-valuenow': String(Math.round(pos / 1000)),
      'aria-valuetext': formatTime(pos),
    });
    track.append(el('div', { class: 'timeline__fill', style: `width:${markPosition(pos, dur)}%` }));
    const recId = a.current?.id ?? sel;
    for (const s of this.ink.strokes.filter((x) => x.rec === recId && x.t !== undefined)) {
      track.append(
        el('span', {
          class: 'timeline__mark timeline__mark--ink',
          style: `left:${markPosition(s.t ?? 0, dur)}%`,
        }),
      );
    }
    for (const b of this.doc.querySelectorAll<HTMLElement>(`[data-rec="${recId ?? ''}"]`)) {
      track.append(
        el('span', {
          class: 'timeline__mark timeline__mark--text',
          style: `left:${markPosition(Number(b.dataset['t']), dur)}%`,
        }),
      );
    }
    track.append(el('span', { class: 'timeline__head', style: `left:${markPosition(pos, dur)}%` }));
    track.addEventListener('click', (e) => {
      if (!rec || a.recording) return;
      const r = track.getBoundingClientRect();
      void a.play(rec.id, ((e.clientX - r.left) / r.width) * rec.duration);
    });
    const time = el('span', { class: 'timeline__time' }, `${formatTime(pos)} / ${formatTime(dur)}`);
    const pick = el('select', { class: 'timeline__pick', 'aria-label': 'Recording' });
    if (recs.length === 0) pick.append(el('option', {}, 'No recordings'));
    recs.forEach((r, i) => {
      const o = el('option', { value: r.id }, `Recording ${i + 1} · ${formatTime(r.duration)}`);
      if (r.id === sel) o.selected = true;
      pick.append(o);
    });
    pick.addEventListener('change', () => {
      this.#selected = pick.value;
      this.render();
    });
    const live = el(
      'span',
      { class: 'timeline__live' },
      a.recording ? 'REC' : 'Tap ink to replay its moment',
    );
    const parts: Node[] = [recBtn, playBtn, time, track];
    if (a.recording) parts.push(icon(Circle, 10, 'timeline__dot'));
    parts.push(live, pick);
    this.root.replaceChildren(...parts);
    this.ink.markPlayback(a.playing && !a.audio.paused ? a.playing.id : null, pos);
  }
}
