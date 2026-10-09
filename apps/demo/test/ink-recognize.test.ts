import { describe, expect, it } from 'vitest';
import { micError, pickMime } from '../src/editor/audio.js';
import type { Point, Stroke } from '../src/editor/ink/model.js';
import { editDistance, groupLines, matches, words, writable } from '../src/editor/ink/recognize.js';

let nextId = 1;
/** A stroke spanning [x, x+w] x [y, y+h]. */
function stroke(x: number, y: number, w: number, h: number, extra: Partial<Stroke> = {}): Stroke {
  const points: Point[] = [
    [x, y, 0.5],
    [x + w / 2, y + h, 0.5],
    [x + w, y + h / 2, 0.5],
  ];
  return { id: nextId++, tool: 'pen', color: '#000', size: 3, points, ...extra };
}

describe('handwriting lines', () => {
  it('groups strokes into lines, top to bottom, and keeps dots with their line', () => {
    const a = stroke(10, 100, 20, 30);
    const b = stroke(40, 102, 20, 28);
    const dot = stroke(45, 88, 2, 2); // the dot of an "i", above the line
    const c = stroke(10, 180, 20, 30);
    const d = stroke(40, 178, 25, 34);
    const lines = groupLines([c, a, dot, d, b]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.ids.sort()).toEqual([a.id, b.id, dot.id].sort());
    expect(lines[1]!.ids.sort()).toEqual([c.id, d.id].sort());
    expect(lines[0]!.box[1]).toBeLessThan(lines[1]!.box[1]);
  });

  it('a tall loop does not swallow the next line', () => {
    const tallY = stroke(10, 100, 20, 70); // a "y" with a long descender
    const small = stroke(40, 110, 15, 25);
    const next = stroke(10, 170, 20, 25);
    expect(groupLines([tallY, small, next])).toHaveLength(2);
  });

  it('skips highlighter and converted shapes', () => {
    const hl = stroke(0, 0, 50, 10, { tool: 'highlighter' });
    const shape = stroke(0, 0, 50, 50, { shape: 'circle' });
    const pen = stroke(0, 0, 20, 20);
    expect(writable([hl, shape, pen]).map((s) => s.id)).toEqual([pen.id]);
    expect(groupLines([hl, shape])).toEqual([]);
  });
});

describe('searching recognized ink', () => {
  it('normalizes words', () => {
    expect(words("Héllo, World! It's 2026.")).toEqual(['hello', 'world', "it's", '2026']);
  });

  it('measures edit distance with an early exit', () => {
    expect(editDistance('world', 'world')).toBe(0);
    expect(editDistance('world', 'wor1d')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('a', 'abcdef', 2)).toBe(3);
  });

  it('matches prefixes and one misread letter, but not unrelated words', () => {
    expect(matches('HELLO WORLD', 'world')).toBe(true);
    expect(matches('HELLO WORLD', 'hel')).toBe(true);
    expect(matches('HELL0 W0RLD', 'world')).toBe(true); // 0 for O: one typo
    expect(matches('meeting notes', 'notes meeting')).toBe(true);
    expect(matches('HELLO WORLD', 'planet')).toBe(false);
    expect(matches('cat', 'cut')).toBe(false); // short words must match exactly
    expect(matches('anything', '  ')).toBe(false);
  });
});

describe('audio notes', () => {
  it('records in the first format the WebView supports', () => {
    expect(pickMime((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMime((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickMime(() => false)).toBeUndefined();
    expect(
      pickMime(() => {
        throw new Error('isTypeSupported missing');
      }),
    ).toBeUndefined();
  });

  it('explains microphone failures in plain words', () => {
    const err = (name: string): DOMException => new DOMException('x', name);
    expect(micError(err('NotAllowedError'))).toContain('Settings → Apps → Lucid Sentence');
    expect(micError(err('NotFoundError'))).toContain('No microphone');
    expect(micError(err('NotReadableError'))).toContain('busy');
    expect(micError(err('NotSupportedError'))).toContain("isn't supported");
    expect(micError(new Error('?'))).toContain('permission');
  });
});
