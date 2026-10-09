import { allCommands } from '@lucid-sentence/commands';
import { describe, expect, it } from 'vitest';
import { WIRED, handlers } from '../src/editor/commands.js';
import { inside, segDist } from '../src/editor/ink.js';
import { rank } from '../src/editor/palette.js';
import { openedFilesMessage } from '../src/native.js';
import { formatTime, markPosition, marksFor, seekTime, type Mark } from '../src/editor/timeline.js';

describe('audio timeline helpers', () => {
  it('positions marks as a clamped percentage', () => {
    expect(markPosition(5000, 10000)).toBe(50);
    expect(markPosition(-10, 10000)).toBe(0);
    expect(markPosition(20000, 10000)).toBe(100);
    expect(markPosition(10, 0)).toBe(0);
  });
  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65_400)).toBe('1:05');
    expect(formatTime(3_725_000)).toBe('1:02:05');
  });
  it('seeks slightly before a mark, never below zero', () => {
    expect(seekTime(10_000)).toBe(8_500);
    expect(seekTime(500)).toBe(0);
  });
  it('filters and sorts marks per recording', () => {
    const marks: Mark[] = [
      { rec: 'a', t: 300, kind: 'stroke', ref: '1' },
      { rec: 'b', t: 100, kind: 'text', ref: 'p1' },
      { rec: 'a', t: 100, kind: 'text', ref: 'p2' },
    ];
    expect(marksFor('a', marks).map((m) => m.ref)).toEqual(['p2', '1']);
  });
});

describe('ink geometry', () => {
  it('measures distance to a segment', () => {
    expect(segDist(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(segDist(-3, 4, 0, 0, 10, 0)).toBe(5);
    expect(segDist(1, 1, 1, 1, 1, 1)).toBe(0);
  });
  it('tests points against a lasso polygon', () => {
    const sq: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(inside(5, 5, sq)).toBe(true);
    expect(inside(15, 5, sq)).toBe(false);
  });
});

describe('command palette ranking', () => {
  const refs = allCommands();
  it('puts exact label matches first', () => {
    expect(rank('bold', refs)[0]?.command.id).toBe('home.font.bold');
    expect(rank('page break', refs)[0]?.command.label).toBe('Page Break');
  });
  it('requires every term to match', () => {
    expect(rank('zzz nothing', refs)).toEqual([]);
    expect(rank('', refs)).toEqual([]);
  });
});

describe('command dispatcher', () => {
  const ids = new Set(allCommands().map((r) => r.command.id));
  it('only wires real registry ids', () => {
    const unknown = Object.keys(handlers).filter((id) => !ids.has(id));
    expect(unknown).toEqual([]);
  });
  it('wires the core editing commands', () => {
    for (const id of [
      'home.font.bold',
      'home.font.italic',
      'home.font.underline',
      'home.font.font',
      'home.font.size',
      'home.paragraph.bullets',
      'home.styles.gallery',
      'home.editing.find',
      'home.editing.replace',
      'insert.tables.table',
      'insert.pages.page-break',
      'layout.page-setup.margins',
      'review.comments.new-comment',
      'view.show.ruler',
      'draw.drawing-tools.pens',
    ]) {
      expect(WIRED.has(id), id).toBe(true);
    }
  });
});

describe('installable preview', () => {
  it('explains that opened .docx files arrive with the engine, without claiming saving works', () => {
    const msg = openedFilesMessage(['Report.docx', 'Plan.docx']);
    expect(msg).toContain('“Report.docx”, “Plan.docx”');
    expect(msg).toMatch(/arrive with the document engine/);
    expect(msg).not.toMatch(/saved|opened successfully/i);
  });
});
