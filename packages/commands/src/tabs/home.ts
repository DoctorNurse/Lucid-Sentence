import { cmd, group, tab } from '../define.js';

export const homeTab = tab('home', 'Home', 'standard', [
  group('clipboard', 'Clipboard', 'verified', [
    cmd('paste', 'Paste', 'split', 'L', 1, 'strip+sub', { shortcut: 'Ctrl+V' }),
    cmd('paste-keep-source', 'Keep Source Formatting', 'button', 'S', 3, 'sheet'),
    cmd('paste-merge', 'Merge Formatting', 'button', 'S', 3, 'sheet'),
    cmd('paste-text-only', 'Keep Text Only', 'button', 'S', 3, 'sheet'),
    cmd('paste-special', 'Paste Special', 'dialog', 'S', 3, 'sub', {
      shortcut: 'Ctrl+Alt+V',
    }),
    cmd('cut', 'Cut', 'button', 'S', 1, 'strip', { shortcut: 'Ctrl+X' }),
    cmd('copy', 'Copy', 'button', 'S', 1, 'strip', { shortcut: 'Ctrl+C' }),
    cmd('format-painter', 'Format Painter', 'toggle', 'S', 2, 'sheet', {
      shortcut: 'Ctrl+Shift+C',
    }),
  ]),
  group('font', 'Font', 'verified', [
    cmd('font', 'Font', 'input', 'M', 1, 'strip+sub', { shortcut: 'Ctrl+Shift+F' }),
    cmd('size', 'Font Size', 'input', 'M', 1, 'strip+sub', { shortcut: 'Ctrl+Shift+P' }),
    cmd('grow', 'Increase Font Size', 'button', 'S', 2, 'sheet', { shortcut: 'Ctrl+]' }),
    cmd('shrink', 'Decrease Font Size', 'button', 'S', 2, 'sheet', { shortcut: 'Ctrl+[' }),
    cmd('change-case', 'Change Case', 'menu', 'S', 3, 'sub', { shortcut: 'Shift+F3' }),
    cmd('clear-formatting', 'Clear All Formatting', 'button', 'S', 2, 'sheet'),
    cmd('bold', 'Bold', 'toggle', 'S', 1, 'strip', { shortcut: 'Ctrl+B' }),
    cmd('italic', 'Italic', 'toggle', 'S', 1, 'strip', { shortcut: 'Ctrl+I' }),
    cmd('underline', 'Underline', 'split', 'S', 1, 'strip', { shortcut: 'Ctrl+U' }),
    cmd('strikethrough', 'Strikethrough', 'toggle', 'S', 2, 'sheet'),
    cmd('subscript', 'Subscript', 'toggle', 'S', 2, 'sheet', { shortcut: 'Ctrl+=' }),
    cmd('superscript', 'Superscript', 'toggle', 'S', 2, 'sheet', { shortcut: 'Ctrl+Shift+=' }),
    cmd('text-effects', 'Text Effects and Typography', 'gallery', 'S', 3, 'sub', {
      coverage: 'unverified',
    }),
    cmd('highlight', 'Text Highlight Color', 'split', 'S', 1, 'strip+sub'),
    cmd('font-color', 'Font Color', 'split', 'S', 1, 'strip+sub'),
    cmd('font-dialog', 'Font Settings', 'dialog', 'S', 3, 'sub', { shortcut: 'Ctrl+D' }),
  ]),
  group('paragraph', 'Paragraph', 'verified', [
    cmd('bullets', 'Bullets', 'split', 'S', 1, 'strip+sub'),
    cmd('numbering', 'Numbering', 'split', 'S', 1, 'strip+sub'),
    cmd('multilevel-list', 'Multilevel List', 'gallery', 'S', 2, 'sub'),
    cmd('decrease-indent', 'Decrease Indent', 'button', 'S', 2, 'sheet'),
    cmd('increase-indent', 'Increase Indent', 'button', 'S', 2, 'sheet'),
    cmd('sort', 'Sort', 'dialog', 'S', 3, 'sub'),
    cmd('show-marks', 'Show/Hide ¶', 'toggle', 'S', 2, 'sheet', { shortcut: 'Ctrl+Shift+8' }),
    cmd('align-left', 'Align Left', 'toggle', 'S', 1, 'strip', { shortcut: 'Ctrl+L' }),
    cmd('align-center', 'Center', 'toggle', 'S', 1, 'strip', { shortcut: 'Ctrl+E' }),
    cmd('align-right', 'Align Right', 'toggle', 'S', 1, 'sheet', { shortcut: 'Ctrl+R' }),
    cmd('justify', 'Justify', 'toggle', 'S', 1, 'sheet', { shortcut: 'Ctrl+J' }),
    cmd('line-spacing', 'Line and Paragraph Spacing', 'menu', 'S', 2, 'sub'),
    cmd('shading', 'Shading', 'split', 'S', 3, 'sub'),
    cmd('borders', 'Borders', 'split', 'S', 3, 'sub'),
    cmd('paragraph-dialog', 'Paragraph Settings', 'dialog', 'S', 3, 'sub'),
  ]),
  group('styles', 'Styles', 'verified', [
    cmd('gallery', 'Styles', 'gallery', 'L', 1, 'strip+sub'),
    cmd('styles-pane', 'Styles Pane', 'dialog', 'S', 3, 'sub', {
      coverage: 'unverified',
      shortcut: 'Ctrl+Alt+Shift+S',
    }),
  ]),
  group('editing', 'Editing', 'verified', [
    cmd('find', 'Find', 'split', 'M', 1, 'strip+sub', { shortcut: 'Ctrl+F' }),
    cmd('replace', 'Replace', 'dialog', 'M', 1, 'sub', { shortcut: 'Ctrl+H' }),
    cmd('select', 'Select', 'menu', 'M', 2, 'sub'),
  ]),
  group('voice', 'Voice', 'stub', [
    cmd('dictate', 'Dictate', 'split', 'L', 3, 'sheet', { stub: true }),
  ]),
  group('editor', 'Editor', 'stub', [
    cmd('editor', 'Editor', 'dialog', 'L', 3, 'sheet', { stub: true }),
  ]),
  group('add-ins', 'Add-ins', 'stub', [
    cmd('add-ins', 'Add-ins', 'dialog', 'L', 3, 'sheet', { stub: true }),
  ]),
]);
