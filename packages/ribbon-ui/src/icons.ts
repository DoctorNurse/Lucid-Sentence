import type { Command } from '@lucid-sentence/commands';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Placeholder glyph: an original 1.5 px line tile with the command's initials,
 * plus a small kind marker (chevron for menus and galleries, corner arrow for
 * dialogs). The final icon set is original line art (plan §4.7); no Microsoft
 * or ONLYOFFICE artwork is used.
 */
export function initials(label: string): string {
  const words = label
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const first = words[0] ?? '?';
  if (words.length === 1) return first.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (first[0]! + words[1]![0]!).toUpperCase();
}

export function glyph(doc: Document, command: Command, px: number): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(px));
  svg.setAttribute('height', String(px));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ls-glyph');

  const tile = doc.createElementNS(SVG_NS, 'rect');
  for (const [k, v] of Object.entries({
    x: '2.75',
    y: '2.75',
    width: '18.5',
    height: '18.5',
    rx: '5',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
  })) {
    tile.setAttribute(k, v);
  }
  svg.append(tile);

  const text = doc.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', '12');
  text.setAttribute('y', '15.5');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '9');
  text.setAttribute('font-weight', '600');
  text.setAttribute('fill', 'currentColor');
  text.textContent = initials(command.label);
  svg.append(text);

  if (command.kind === 'dialog') {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M15.5 18.5h3v-3');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    svg.append(p);
  }
  return svg;
}
