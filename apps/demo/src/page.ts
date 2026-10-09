/** Page geometry for the page-view mock, in CSS px (96 per inch). */
export interface PageGeometry {
  label: string;
  widthPx: number;
  heightPx: number;
  /** Default margins as Word sets them: 1 in (Letter), 2.54 cm (A4). */
  marginPx: number;
  /** Ruler unit in px, minor subdivisions per unit, and the unit label. */
  unitPx: number;
  minor: number;
  unit: 'in' | 'cm';
}

export type PageSize = 'letter' | 'a4';

const MM = 96 / 25.4;

export const PAGE_SIZES: Record<PageSize, PageGeometry> = {
  letter: {
    label: 'Letter',
    widthPx: 816,
    heightPx: 1056,
    marginPx: 96,
    unitPx: 96,
    minor: 8,
    unit: 'in',
  },
  a4: {
    label: 'A4',
    widthPx: Math.round(210 * MM),
    heightPx: Math.round(297 * MM),
    marginPx: Math.round(25.4 * MM),
    unitPx: 10 * MM,
    minor: 2,
    unit: 'cm',
  },
};

/** Draw tick marks and numbers. Numbers count from the left/top margin, as in Word. */
export function drawRulers(h: HTMLElement, v: HTMLElement, g: PageGeometry): void {
  const build = (el: HTMLElement, length: number, axis: 'x' | 'y'): void => {
    const frag = document.createDocumentFragment();
    const margin = document.createElement('span');
    margin.className = 'ruler__text';
    margin.style.setProperty(axis === 'x' ? 'left' : 'top', `${g.marginPx}px`);
    margin.style.setProperty(axis === 'x' ? 'width' : 'height', `${length - 2 * g.marginPx}px`);
    frag.append(margin);
    const step = g.unitPx / g.minor;
    for (let i = -Math.floor(g.marginPx / step); g.marginPx + i * step <= length; i++) {
      const pos = g.marginPx + i * step;
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
  build(h, g.widthPx, 'x');
  build(v, g.heightPx, 'y');
}
