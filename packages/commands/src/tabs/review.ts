import { cmd, group, tab } from '../define.js';

export const reviewTab = tab('review', 'Review', 'standard', [
  group('proofing', 'Proofing', 'verified', [
    cmd('spelling-grammar', 'Spelling & Grammar', 'dialog', 'L', 1, 'strip+sub', {
      shortcut: 'F7',
    }),
    cmd('thesaurus', 'Thesaurus', 'dialog', 'S', 2, 'sub', {
      coverage: 'unverified',
      shortcut: 'Shift+F7',
    }),
    cmd('word-count', 'Word Count', 'dialog', 'S', 2, 'sub', { shortcut: 'Ctrl+Shift+G' }),
  ]),
  group('speech', 'Speech', 'shell', [
    cmd('read-aloud', 'Read Aloud', 'toggle', 'L', 2, 'sheet', { shortcut: 'Ctrl+Alt+Space' }),
  ]),
  group('accessibility', 'Accessibility', 'gap', [
    cmd('check-accessibility', 'Check Accessibility', 'dialog', 'L', 2, 'sub'),
  ]),
  group('language', 'Language', 'unverified', [
    cmd('translate', 'Translate', 'menu', 'L', 3, 'sheet', { stub: true, coverage: 'stub' }),
    cmd('language', 'Language', 'menu', 'L', 2, 'sub'),
  ]),
  group('comments', 'Comments', 'verified', [
    cmd('new-comment', 'New Comment', 'button', 'L', 1, 'strip', { shortcut: 'Ctrl+Alt+M' }),
    cmd('delete', 'Delete', 'split', 'M', 2, 'sub'),
    cmd('previous', 'Previous', 'button', 'M', 2, 'sheet'),
    cmd('next', 'Next', 'button', 'M', 2, 'sheet'),
    cmd('show-comments', 'Show Comments', 'toggle', 'M', 2, 'sheet'),
  ]),
  group('tracking', 'Tracking', 'verified', [
    cmd('track-changes', 'Track Changes', 'split', 'L', 1, 'strip+sub', {
      shortcut: 'Ctrl+Shift+E',
    }),
    cmd('display-for-review', 'Display for Review', 'menu', 'M', 2, 'sub'),
    cmd('show-markup', 'Show Markup', 'menu', 'M', 2, 'sub'),
    cmd('reviewing-pane', 'Reviewing Pane', 'split', 'M', 3, 'sub', { coverage: 'unverified' }),
  ]),
  group('changes', 'Changes', 'verified', [
    cmd('accept', 'Accept', 'split', 'L', 1, 'strip+sub'),
    cmd('reject', 'Reject', 'split', 'L', 1, 'strip+sub'),
    cmd('previous-change', 'Previous Change', 'button', 'S', 2, 'sheet'),
    cmd('next-change', 'Next Change', 'button', 'S', 2, 'sheet'),
  ]),
  group('compare', 'Compare', 'verified', [
    cmd('compare', 'Compare', 'dialog', 'L', 2, 'sub'),
    cmd('combine', 'Combine', 'dialog', 'L', 3, 'sub'),
  ]),
  group('protect', 'Protect', 'verified', [
    cmd('block-authors', 'Block Authors', 'button', 'L', 3, 'sheet', {
      stub: true,
      coverage: 'stub',
    }),
    cmd('restrict-editing', 'Restrict Editing', 'dialog', 'L', 2, 'sub'),
  ]),
  group('ink', 'Ink', 'verified', [cmd('hide-ink', 'Hide Ink', 'toggle', 'L', 3, 'sheet')]),
]);
