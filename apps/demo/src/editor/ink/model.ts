/**
 * Unified ink data model.
 *
 * Two shapes of the same data:
 *
 * - The **editing** shape (`Stroke`, `Point`): plain arrays, cheap to push samples into
 *   while drawing and easy to inspect in tests. This is what `InkLayer` keeps in memory.
 * - The **interchange** shape (`InkStroke`, `InkDocument`): channels packed into a
 *   `Float32Array`, versioned. This is what we store (local drafts) and what the docx
 *   InkML writer reads.
 *
 * Old drafts (model v0: `[x, y, pressure]` points, numeric ids) upgrade losslessly.
 */

/** Ink tools that leave strokes on the page. */
export type StrokeTool = 'pen' | 'pencil' | 'highlighter';
export type InkTool = StrokeTool | 'eraser' | 'point-eraser' | 'lasso';

/**
 * One sample. Index 0-2 are always present (v0 drafts have only these).
 * `tiltX`/`tiltY` are degrees (-90..90, Pointer Events convention); `t` is
 * milliseconds since the stroke's first sample.
 */
export type Point = [
  x: number,
  y: number,
  pressure: number,
  tiltX?: number,
  tiltY?: number,
  t?: number,
];

export interface Stroke {
  id: number;
  tool: StrokeTool;
  color: string;
  size: number;
  points: Point[];
  /** The device reported real pressure (otherwise width is simulated from speed). */
  pressure?: boolean;
  /** Pointer type that drew the stroke. */
  source?: 'pen' | 'touch' | 'mouse' | 'import';
  /** The stroke was straightened into a line or converted into a shape (Ink to Shape). */
  shape?: ShapeKind;
  /** Milliseconds into the active audio recording when the stroke began. */
  t?: number;
  /** Recording the timestamp belongs to. */
  rec?: string;
}

/** Shapes a stroke can be recognized as. */
export const SHAPE_KINDS = [
  'line',
  'triangle',
  'rectangle',
  'quad',
  'polygon',
  'ellipse',
  'circle',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
export const isShapeKind = (v: unknown): v is ShapeKind =>
  typeof v === 'string' && (SHAPE_KINDS as readonly string[]).includes(v);

export type InkOp =
  | { kind: 'add'; strokes: Stroke[] }
  | { kind: 'remove'; strokes: Stroke[] }
  | { kind: 'replace'; before: Stroke[]; after: Stroke[] }
  | { kind: 'move'; ids: number[]; dx: number; dy: number };

// ---------------------------------------------------------------------------
// Interchange model (v1)

export const INK_MODEL_VERSION = 1;

export interface InkBrush {
  tool: StrokeTool;
  /** '#rrggbb' */
  color: string;
  /** 0..1 (applied once per layer, not per stroke). */
  opacity: number;
  /** Nominal width in page px at 100% zoom. */
  width: number;
  tip: 'ellipse' | 'rectangle';
  /** Width follows pressure. InkML `ignorePressure` is the inverse. */
  pressure: boolean;
  /** InkML rasterOp: copyPen (normal) or maskPen (highlighter). */
  blend: 'normal' | 'multiply';
  /** Office 2016 ink effect. */
  effect?: 'pencil';
}

/** Channels stored in `InkStroke.data`, interleaved in this order. */
export type InkChannel = 'x' | 'y' | 'p' | 'tx' | 'ty' | 't';
export const CHANNELS: readonly InkChannel[] = ['x', 'y', 'p', 'tx', 'ty', 't'];

export interface InkStroke {
  id: string;
  brush: InkBrush;
  channels: InkChannel[];
  data: Float32Array;
  source: 'pen' | 'touch' | 'mouse' | 'import';
  /** [x, y, w, h] in page px. */
  bbox: [number, number, number, number];
  audio?: { rec: string; t: number };
  shape?: ShapeKind;
}

export interface InkDocument {
  v: typeof INK_MODEL_VERSION;
  strokes: InkStroke[];
}

/** Opacity each tool is drawn with (per layer). */
export const TOOL_OPACITY: Record<StrokeTool, number> = {
  pen: 1,
  pencil: 0.86,
  highlighter: 0.38,
};

export function brushOf(s: Stroke): InkBrush {
  return {
    tool: s.tool,
    color: s.color,
    opacity: TOOL_OPACITY[s.tool],
    width: s.size,
    tip: s.tool === 'highlighter' ? 'rectangle' : 'ellipse',
    pressure: s.tool !== 'highlighter' && s.pressure !== false,
    blend: s.tool === 'highlighter' ? 'multiply' : 'normal',
    ...(s.tool === 'pencil' ? { effect: 'pencil' as const } : {}),
  };
}

export function bboxOf(points: readonly Point[], pad = 0): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
}

/** Editing stroke → interchange stroke. */
export function toInkStroke(s: Stroke): InkStroke {
  const n = CHANNELS.length;
  const data = new Float32Array(s.points.length * n);
  s.points.forEach((p, i) => {
    data[i * n] = p[0];
    data[i * n + 1] = p[1];
    data[i * n + 2] = p[2];
    data[i * n + 3] = p[3] ?? 0;
    data[i * n + 4] = p[4] ?? 0;
    data[i * n + 5] = p[5] ?? 0;
  });
  return {
    id: `s${s.id}`,
    brush: brushOf(s),
    channels: [...CHANNELS],
    data,
    source: s.source ?? 'pen',
    bbox: bboxOf(s.points, s.size / 2),
    ...(s.rec !== undefined && s.t !== undefined ? { audio: { rec: s.rec, t: s.t } } : {}),
    ...(s.shape ? { shape: s.shape } : {}),
  };
}

/** Interchange stroke → editing stroke (`id` assigned by the caller). */
export function fromInkStroke(k: InkStroke, id: number): Stroke {
  const n = k.channels.length;
  const at = (ch: InkChannel): number => k.channels.indexOf(ch);
  const [ix, iy, ip, itx, ity, it] = CHANNELS.map(at) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const points: Point[] = [];
  for (let i = 0; i + n <= k.data.length; i += n) {
    const v = (j: number, d: number): number => (j >= 0 ? k.data[i + j]! : d);
    points.push([
      round2(v(ix, 0)),
      round2(v(iy, 0)),
      round3(v(ip, 0.5)),
      round2(v(itx, 0)),
      round2(v(ity, 0)),
      Math.round(v(it, 0)),
    ]);
  }
  return {
    id,
    tool: k.brush.tool,
    color: k.brush.color,
    size: k.brush.width,
    points,
    pressure: k.brush.pressure,
    source: k.source,
    ...(k.shape ? { shape: k.shape } : {}),
    ...(k.audio ? { t: k.audio.t, rec: k.audio.rec } : {}),
  };
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------------------
// Storage (JSON envelope; point data as base64 of the Float32Array)

interface StoredStroke extends Omit<InkStroke, 'data'> {
  data: string;
}
export interface StoredInk {
  v: number;
  strokes: StoredStroke[];
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodeInk(strokes: readonly Stroke[]): StoredInk {
  return {
    v: INK_MODEL_VERSION,
    strokes: strokes.map((s) => {
      const k = toInkStroke(s);
      return {
        ...k,
        data: toBase64(new Uint8Array(k.data.buffer, k.data.byteOffset, k.data.byteLength)),
      };
    }),
  };
}

/** Accepts a v1 envelope or a v0 stroke array (old drafts). */
export function decodeInk(raw: unknown): Stroke[] {
  if (Array.isArray(raw)) return upgradeV0(raw as V0Stroke[]);
  const doc = raw as Partial<StoredInk> | null;
  if (!doc || !Array.isArray(doc.strokes)) return [];
  return doc.strokes.map((s, i) => {
    const bytes = fromBase64(s.data);
    const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    return fromInkStroke({ ...s, data }, i + 1);
  });
}

interface V0Stroke {
  id: number;
  tool: StrokeTool;
  color: string;
  size: number;
  points: number[][];
  t?: number;
  rec?: string;
}

/** v0 drafts: `[x, y, pressure]` points; pressure 0.5 everywhere meant "simulated". */
export function upgradeV0(strokes: readonly V0Stroke[]): Stroke[] {
  return strokes.map((s) => {
    const points = s.points.map((p): Point =>
      p.length >= 6 ? (p.slice(0, 6) as Point) : [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0.5],
    );
    return {
      ...s,
      points,
      pressure: points.some((p) => p[2] !== 0.5),
    };
  });
}
