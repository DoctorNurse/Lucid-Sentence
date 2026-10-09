import { cmd, group, tab } from '../define.js';

export const referencesTab = tab('references', 'References', 'standard', [
  group('toc', 'Table of Contents', 'verified', [
    cmd('table-of-contents', 'Table of Contents', 'gallery', 'L', 1, 'strip+sub'),
    cmd('add-text', 'Add Text', 'menu', 'S', 2, 'sub'),
    cmd('update-table', 'Update Table', 'button', 'S', 1, 'strip'),
  ]),
  group('footnotes', 'Footnotes', 'verified', [
    cmd('insert-footnote', 'Insert Footnote', 'button', 'L', 1, 'strip', {
      shortcut: 'Ctrl+Alt+F',
    }),
    cmd('insert-endnote', 'Insert Endnote', 'button', 'S', 2, 'sheet', {
      shortcut: 'Ctrl+Alt+D',
    }),
    cmd('next-footnote', 'Next Footnote', 'split', 'S', 2, 'sheet'),
    cmd('show-notes', 'Show Notes', 'button', 'S', 3, 'sheet'),
  ]),
  group('research', 'Research', 'stub', [
    cmd('researcher', 'Researcher', 'dialog', 'L', 3, 'sheet', { stub: true }),
  ]),
  group('citations', 'Citations & Bibliography', 'gap', [
    cmd('insert-citation', 'Insert Citation', 'menu', 'L', 1, 'strip+sub'),
    cmd('manage-sources', 'Manage Sources', 'dialog', 'S', 2, 'sub'),
    cmd('style', 'Bibliography Style', 'input', 'S', 2, 'sub'),
    cmd('bibliography', 'Bibliography', 'gallery', 'S', 2, 'sub'),
  ]),
  group('captions', 'Captions', 'verified', [
    cmd('insert-caption', 'Insert Caption', 'dialog', 'L', 1, 'sub'),
    cmd('table-of-figures', 'Insert Table of Figures', 'dialog', 'S', 2, 'sub'),
    cmd('update-table', 'Update Table', 'button', 'S', 2, 'sheet'),
    cmd('cross-reference', 'Cross-reference', 'dialog', 'S', 2, 'sub'),
  ]),
  group('index', 'Index', 'gap', [
    cmd('mark-entry', 'Mark Entry', 'dialog', 'L', 2, 'sub', { shortcut: 'Alt+Shift+X' }),
    cmd('insert-index', 'Insert Index', 'dialog', 'S', 2, 'sub'),
    cmd('update-index', 'Update Index', 'button', 'S', 3, 'sheet'),
  ]),
  group('table-of-authorities', 'Table of Authorities', 'gap', [
    cmd('mark-citation', 'Mark Citation', 'dialog', 'L', 2, 'sub', { shortcut: 'Alt+Shift+I' }),
    cmd('insert-toa', 'Insert Table of Authorities', 'dialog', 'S', 3, 'sub'),
    cmd('update-toa', 'Update Table', 'button', 'S', 3, 'sheet'),
  ]),
]);
