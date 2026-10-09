/** A tiny single-stroke block-letter "hand" for tests: Tesseract must read real ink. */
type Pt = [number, number];
const ellipse = (cx: number, cy: number, rx: number, ry: number): Pt[] =>
  Array.from({ length: 25 }, (_, i): Pt => {
    const t = -Math.PI / 2 - (i / 24) * Math.PI * 2;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  });

/** Glyphs on a 6 x 10 grid (y down), each a list of strokes. */
const GLYPHS: Record<string, Pt[][]> = {
  A: [
    [
      [0, 10],
      [3, 0],
      [6, 10],
    ],
    [
      [1.2, 6],
      [4.8, 6],
    ],
  ],
  C: [ellipse(3.2, 5, 3, 5).slice(3, 23)],
  D: [
    [
      [0, 0],
      [0, 10],
      [3, 10],
      [6, 7],
      [6, 3],
      [3, 0],
      [0, 0],
    ],
  ],
  E: [
    [
      [6, 0],
      [0, 0],
      [0, 10],
      [6, 10],
    ],
    [
      [0, 5],
      [4.5, 5],
    ],
  ],
  H: [
    [
      [0, 0],
      [0, 10],
    ],
    [
      [6, 0],
      [6, 10],
    ],
    [
      [0, 5],
      [6, 5],
    ],
  ],
  I: [
    [
      [3, 0],
      [3, 10],
    ],
  ],
  L: [
    [
      [0, 0],
      [0, 10],
      [6, 10],
    ],
  ],
  N: [
    [
      [0, 10],
      [0, 0],
      [6, 10],
      [6, 0],
    ],
  ],
  O: [ellipse(3, 5, 3, 5)],
  R: [
    [
      [0, 10],
      [0, 0],
      [4, 0],
      [6, 1.5],
      [6, 3.5],
      [4, 5],
      [0, 5],
    ],
    [
      [3, 5],
      [6, 10],
    ],
  ],
  T: [
    [
      [0, 0],
      [6, 0],
    ],
    [
      [3, 0],
      [3, 10],
    ],
  ],
  U: [
    [
      [0, 0],
      [0, 7],
      [1, 9.5],
      [3, 10],
      [5, 9.5],
      [6, 7],
      [6, 0],
    ],
  ],
  W: [
    [
      [0, 0],
      [1.5, 10],
      [3, 3],
      [4.5, 10],
      [6, 0],
    ],
  ],
};

/** Strokes (viewport px) spelling `text` from (x, y), letters `size` px tall. */
export function inkText(text: string, x: number, y: number, size = 40): Pt[][] {
  const k = size / 10;
  const out: Pt[][] = [];
  let cx = x;
  for (const ch of text.toUpperCase()) {
    if (ch === ' ') {
      cx += 6 * k;
      continue;
    }
    const g = GLYPHS[ch];
    if (!g) throw new Error(`no glyph for ${ch}`);
    for (const stroke of g) {
      // Densify so the pen moves smoothly between corners.
      const pts: Pt[] = [];
      for (let i = 1; i < stroke.length; i++) {
        const [ax, ay] = stroke[i - 1]!;
        const [bx, by] = stroke[i]!;
        const n = Math.max(1, Math.round((Math.hypot(bx - ax, by - ay) * k) / 6));
        for (let j = 0; j < n; j++) {
          const f = j / n;
          pts.push([cx + (ax + (bx - ax) * f) * k, y + (ay + (by - ay) * f) * k]);
        }
      }
      const [lx, ly] = stroke.at(-1)!;
      pts.push([cx + lx * k, y + ly * k]);
      out.push(pts);
    }
    cx += 9 * k;
  }
  return out;
}
