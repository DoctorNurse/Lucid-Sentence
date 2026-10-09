import type { Command } from '@lucid-sentence/commands';
import { iconFor, type IconNode } from './icon-map.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Two-letter initials for a label (used by text-only fallbacks and avatars). */
export function initials(label: string): string {
  const words = label
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const first = words[0] ?? '?';
  if (words.length === 1) return first.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (first[0]! + words[1]![0]!).toUpperCase();
}

/**
 * Render a Lucide icon node as an inline SVG: a 24-unit grid, a 1.75 stroke in
 * currentColor, with round caps and joins. It matches the Chapternal line look.
 */
export function svgIcon(
  doc: Document,
  node: IconNode,
  px: number,
  cls = 'ls-glyph',
): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24',
    width: String(px),
    height: String(px),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: cls,
  })) {
    svg.setAttribute(k, v);
  }
  for (const [tag, attrs] of node) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'key') continue;
      el.setAttribute(k, String(v));
    }
    svg.append(el);
  }
  return svg;
}

/** The icon for a command, or null when the command is text-only (see TEXT_ONLY). */
export function glyph(doc: Document, command: Command, px: number): SVGSVGElement | null {
  const node = iconFor(command.id);
  return node ? svgIcon(doc, node, px) : null;
}
