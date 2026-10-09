/** Page geometry for the page view, in CSS px (96 per inch). */

const IN = 96;
const MM = 96 / 25.4;

export type PageSize = 'letter' | 'legal' | 'a4' | 'a5';
export type Orientation = 'portrait' | 'landscape';
export type MarginPreset = 'normal' | 'narrow' | 'moderate' | 'wide';

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PaperSize {
  label: string;
  detail: string;
  width: number;
  height: number;
  unit: 'in' | 'cm';
}

export const PAPER: Record<PageSize, PaperSize> = {
  letter: { label: 'Letter', detail: '8.5" × 11"', width: 8.5 * IN, height: 11 * IN, unit: 'in' },
  legal: { label: 'Legal', detail: '8.5" × 14"', width: 8.5 * IN, height: 14 * IN, unit: 'in' },
  a4: { label: 'A4', detail: '21 cm × 29.7 cm', width: 210 * MM, height: 297 * MM, unit: 'cm' },
  a5: { label: 'A5', detail: '14.8 cm × 21 cm', width: 148 * MM, height: 210 * MM, unit: 'cm' },
};

/** Word's margin presets. */
export const MARGINS: Record<MarginPreset, { label: string; detail: string; m: Margins }> = {
  normal: {
    label: 'Normal',
    detail: 'Top 1"  Bottom 1"  Left 1"  Right 1"',
    m: { top: IN, right: IN, bottom: IN, left: IN },
  },
  narrow: {
    label: 'Narrow',
    detail: 'All sides 0.5"',
    m: { top: IN / 2, right: IN / 2, bottom: IN / 2, left: IN / 2 },
  },
  moderate: {
    label: 'Moderate',
    detail: 'Top 1"  Bottom 1"  Left 0.75"  Right 0.75"',
    m: { top: IN, right: 0.75 * IN, bottom: IN, left: 0.75 * IN },
  },
  wide: {
    label: 'Wide',
    detail: 'Top 1"  Bottom 1"  Left 2"  Right 2"',
    m: { top: IN, right: 2 * IN, bottom: IN, left: 2 * IN },
  },
};

export interface PageSetup {
  size: PageSize;
  orientation: Orientation;
  margins: MarginPreset;
}

export interface PageGeometry {
  width: number;
  height: number;
  margins: Margins;
  unitPx: number;
  minor: number;
}

export function geometry(s: PageSetup): PageGeometry {
  const p = PAPER[s.size];
  const land = s.orientation === 'landscape';
  return {
    width: Math.round(land ? p.height : p.width),
    height: Math.round(land ? p.width : p.height),
    margins: MARGINS[s.margins].m,
    unitPx: p.unit === 'in' ? IN : 10 * MM,
    minor: p.unit === 'in' ? 8 : 2,
  };
}

/** Draw tick marks and numbers. Numbers count from the left/top margin, as in Word. */
export function drawRulers(h: HTMLElement, v: HTMLElement, g: PageGeometry): void {
  const build = (
    el: HTMLElement,
    length: number,
    start: number,
    end: number,
    axis: 'x' | 'y',
  ): void => {
    const frag = document.createDocumentFragment();
    const text = document.createElement('span');
    text.className = 'ruler__text';
    text.style.setProperty(axis === 'x' ? 'left' : 'top', `${start}px`);
    text.style.setProperty(axis === 'x' ? 'width' : 'height', `${length - start - end}px`);
    frag.append(text);
    const step = g.unitPx / g.minor;
    for (let i = -Math.floor(start / step); start + i * step <= length; i++) {
      const pos = start + i * step;
      if (pos < 0) continue;
      const major = i % g.minor === 0;
      const half = !major && g.minor % 2 === 0 && i % (g.minor / 2) === 0;
      const tick = document.createElement('span');
      tick.className = major
        ? 'ruler__num'
        : half
          ? 'ruler__tick ruler__tick--half'
          : 'ruler__tick';
      tick.style.setProperty(axis === 'x' ? 'left' : 'top', `${pos}px`);
      if (major && i !== 0) tick.textContent = String(Math.abs(i / g.minor));
      frag.append(tick);
    }
    el.style.setProperty(axis === 'x' ? 'width' : 'height', `${length}px`);
    el.replaceChildren(frag);
  };
  build(h, g.width, g.margins.left, g.margins.right, 'x');
  build(v, g.height, g.margins.top, g.margins.bottom, 'y');
}
