/**
 * On-device handwriting recognition for Convert to text and Search ink.
 *
 * 1. The system recognizer, where the browser has one (the Handwriting Recognition API,
 *    `navigator.createHandwritingRecognizer`; ChromeOS today). It reads the strokes
 *    themselves, with timing.
 * 2. Otherwise Tesseract (Apache-2.0) compiled to WebAssembly, running in a worker with
 *    the English LSTM model. Its files ship inside the app under `ocr/`, so nothing is
 *    downloaded from another site and no ink leaves the device. Each line of ink is
 *    rendered black-on-white and read as a single text line.
 *
 * English only for now. Results are best for clear print or neat cursive.
 */
import type { Rect } from './render.js';
import type { Stroke } from './model.js';

export interface InkLine {
  ids: number[];
  /** [x, y, w, h] in page px. */
  box: Rect;
}

export interface LineText extends InkLine {
  text: string;
  /** 0..100 (Tesseract), or -1 when the engine doesn't say. */
  confidence: number;
}

export type EngineName = 'system' | 'tesseract';

export interface Engine {
  name: EngineName;
  /** Human-readable, for the "read on this device by …" note. */
  label: string;
  read(strokes: readonly Stroke[], line: InkLine): Promise<{ text: string; confidence: number }>;
}

/** Strokes that can be handwriting: not highlighter, not converted shapes. */
export function writable(strokes: readonly Stroke[]): Stroke[] {
  return strokes.filter((s) => s.tool !== 'highlighter' && !s.shape && s.points.length > 0);
}

function boxOf(s: Stroke): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of s.points) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

const unionBox = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
};

/**
 * Group strokes into lines of writing: a stroke joins the line its vertical middle falls
 * into (or that overlaps it by half its height). Small marks (dots, crossbars) join the
 * nearest line. Lines come back top to bottom.
 */
export function groupLines(strokes: readonly Stroke[]): InkLine[] {
  const items = writable(strokes).map((s) => ({ s, b: boxOf(s) }));
  if (items.length === 0) return [];
  const heights = items.map((i) => i.b[3]).sort((a, b) => a - b);
  const median = Math.max(8, heights[Math.floor(heights.length / 2)]!);
  // Tall strokes first so lines get their full extent before small marks join.
  items.sort((a, b) => b.b[3] - a.b[3]);
  const lines: { ids: number[]; box: Rect; core: [number, number] }[] = [];
  for (const { s, b } of items) {
    const mid = b[1] + b[3] / 2;
    let best: (typeof lines)[number] | null = null;
    let bestScore = Infinity;
    for (const l of lines) {
      const [c0, c1] = l.core;
      const overlap = Math.min(c1, b[1] + b[3]) - Math.max(c0, b[1]);
      // Small marks (an i's dot, an accent) may float a bit further from the line.
      const slack = b[3] < median * 0.4 ? median * 0.6 : median * 0.25;
      const inside = mid >= c0 - slack && mid <= c1 + slack;
      if (!inside && overlap < Math.min(b[3], c1 - c0) * 0.5) continue;
      const score = Math.abs(mid - (c0 + c1) / 2);
      if (score < bestScore) {
        bestScore = score;
        best = l;
      }
    }
    if (best) {
      best.ids.push(s.id);
      best.box = unionBox(best.box, b);
    } else {
      // A line's "core" band is its first (tallest) stroke, capped near the typical height
      // so one tall loop doesn't swallow the line below.
      const h = Math.min(b[3], median * 1.6);
      lines.push({ ids: [s.id], box: b, core: [mid - h / 2, mid + h / 2] });
    }
  }
  const byId = new Map(strokes.map((s) => [s.id, s]));
  return lines
    .map((l) => ({
      ids: l.ids.sort((a, b) => (byId.get(a)!.t ?? a) - (byId.get(b)!.t ?? b) || a - b),
      box: l.box,
    }))
    .sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
}

/** Render one line of ink black on white, scaled so the line is about `height` px tall. */
export function renderLine(
  strokes: readonly Stroke[],
  line: InkLine,
  height = 72,
): HTMLCanvasElement {
  const want = new Set(line.ids);
  const pad = 18;
  const scale = Math.min(4, Math.max(0.25, height / Math.max(12, line.box[3])));
  const c = document.createElement('canvas');
  c.width = Math.ceil(line.box[2] * scale + pad * 2);
  c.height = Math.ceil(line.box[3] * scale + pad * 2);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    if (!want.has(s.id)) continue;
    const w = Math.max(2.5, Math.min(6, s.size * scale));
    const pts = s.points.map((p) => [
      (p[0] - line.box[0]) * scale + pad,
      (p[1] - line.box[1]) * scale + pad,
    ]);
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0]![0]!, pts[0]![1]!, w / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0]![0]!, pts[0]![1]!);
    for (const p of pts.slice(1)) ctx.lineTo(p[0]!, p[1]!);
    ctx.stroke();
  }
  return c;
}

// ---------------------------------------------------------------------------
// Engines

interface HwPoint {
  x: number;
  y: number;
  t?: number;
}
interface HwStroke {
  addPoint(p: HwPoint): void;
}
interface HwDrawing {
  addStroke(s: HwStroke): void;
  getPrediction(): Promise<{ text: string }[]>;
  clear(): void;
}
interface HwRecognizer {
  startDrawing(hints?: Record<string, unknown>): HwDrawing;
  finish?(): void;
}
interface HwNavigator {
  createHandwritingRecognizer?: (c: { languages: string[] }) => Promise<HwRecognizer>;
}

async function systemEngine(): Promise<Engine | null> {
  const nav = navigator as Navigator & HwNavigator;
  const Ctor = (globalThis as { HandwritingStroke?: new () => HwStroke }).HandwritingStroke;
  if (typeof nav.createHandwritingRecognizer !== 'function' || !Ctor) return null;
  let rec: HwRecognizer;
  try {
    rec = await nav.createHandwritingRecognizer({ languages: ['en'] });
  } catch {
    return null;
  }
  return {
    name: 'system',
    label: "your device's handwriting recognizer",
    async read(strokes, line) {
      const want = new Set(line.ids);
      const drawing = rec.startDrawing({ recognitionType: 'text', alternatives: 1 });
      for (const s of strokes) {
        if (!want.has(s.id)) continue;
        const hs = new Ctor();
        for (const p of s.points) hs.addPoint({ x: p[0], y: p[1], t: (s.t ?? 0) + (p[5] ?? 0) });
        drawing.addStroke(hs);
      }
      const out = await drawing.getPrediction();
      drawing.clear();
      return { text: out[0]?.text ?? '', confidence: -1 };
    },
  };
}

/** The 16-byte probe wasm-feature-detect uses for fixed-width SIMD. */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

interface TessWorker {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(img: HTMLCanvasElement): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
}

async function tesseractEngine(): Promise<Engine> {
  if (typeof WebAssembly !== 'object') throw new Error('WebAssembly is not available');
  const base = new URL('ocr/', document.baseURI).href;
  const simd = WebAssembly.validate(SIMD_PROBE);
  const { createWorker } = (await import('tesseract.js')) as unknown as {
    createWorker: (lang: string, oem: number, opts: Record<string, unknown>) => Promise<TessWorker>;
  };
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}${simd ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'}`,
    langPath: base.replace(/\/$/, ''),
    gzip: true,
    cacheMethod: 'none',
    logger: () => undefined,
    errorHandler: () => undefined,
  });
  // 7 = treat the image as a single text line.
  await worker.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' });
  return {
    name: 'tesseract',
    label: 'on-device recognition (Tesseract)',
    async read(strokes, line) {
      const { data } = await worker.recognize(renderLine(strokes, line));
      return { text: data.text.replace(/\s+/g, ' ').trim(), confidence: data.confidence };
    },
  };
}

let engine: Promise<Engine> | null = null;

/** The recognizer for this device (loaded once, on first use). */
export function getEngine(): Promise<Engine> {
  engine ??= (async () => (await systemEngine()) ?? (await tesseractEngine()))();
  engine.catch(() => {
    engine = null;
  });
  return engine;
}

/** Recognize every line of the given strokes. */
export async function recognizeInk(
  strokes: readonly Stroke[],
  onLine?: (done: number, total: number) => void,
): Promise<{ engine: Engine; lines: LineText[] }> {
  const e = await getEngine();
  const lines = groupLines(strokes);
  const out: LineText[] = [];
  for (const [i, l] of lines.entries()) {
    const r = await e.read(strokes, l);
    out.push({ ...l, text: r.text, confidence: r.confidence });
    onLine?.(i + 1, lines.length);
  }
  return { engine: e, lines: out };
}

// ---------------------------------------------------------------------------
// Search

/** Lowercase words without punctuation. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/** Levenshtein distance, giving up early past `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * Does recognized text match a query? Every query word must appear, as a prefix of a
 * word, or (words of 4+ letters) within one typo, since recognition misreads letters.
 */
export function matches(text: string, query: string): boolean {
  const q = words(query);
  if (q.length === 0) return false;
  const t = words(text);
  return q.every((w) =>
    t.some((x) => x.startsWith(w) || (w.length >= 4 && editDistance(x, w, 1) <= 1)),
  );
}
