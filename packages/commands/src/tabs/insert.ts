import { cmd, group, tab } from '../define.js';

export const insertTab = tab('insert', 'Insert', 'standard', [
  group('pages', 'Pages', 'verified', [
    cmd('cover-page', 'Cover Page', 'gallery', 'M', 2, 'sub', { coverage: 'gap' }),
    cmd('blank-page', 'Blank Page', 'button', 'M', 2, 'sheet'),
    cmd('page-break', 'Page Break', 'button', 'M', 1, 'strip', { shortcut: 'Ctrl+Enter' }),
  ]),
  group('tables', 'Tables', 'verified', [
    cmd('table', 'Table', 'gallery', 'L', 1, 'strip+sub'),
    cmd('draw-table', 'Draw Table', 'toggle', 'S', 3, 'sheet', { coverage: 'unverified' }),
    cmd('convert-text-to-table', 'Convert Text to Table', 'dialog', 'S', 3, 'sub'),
    cmd('quick-tables', 'Quick Tables', 'gallery', 'S', 3, 'sub', { coverage: 'unverified' }),
  ]),
  group('illustrations', 'Illustrations', 'verified', [
    cmd('pictures', 'Pictures', 'menu', 'L', 1, 'strip+sub'),
    cmd('shapes', 'Shapes', 'gallery', 'L', 1, 'strip+sub'),
    cmd('icons', 'Icons', 'dialog', 'L', 2, 'sub', { coverage: 'ui-only' }),
    cmd('3d-models', '3D Models', 'menu', 'L', 3, 'sheet', { stub: true, coverage: 'stub' }),
    cmd('smartart', 'SmartArt', 'dialog', 'L', 2, 'sub'),
    cmd('chart', 'Chart', 'dialog', 'L', 2, 'sub'),
    cmd('screenshot', 'Screenshot', 'menu', 'L', 3, 'sub', { coverage: 'shell' }),
  ]),
  group('add-ins', 'Add-ins', 'stub', [
    cmd('get-add-ins', 'Get Add-ins', 'dialog', 'L', 3, 'sheet', { stub: true }),
  ]),
  group('media', 'Media', 'verified', [
    cmd('online-video', 'Online Video', 'dialog', 'L', 3, 'sub'),
  ]),
  group('links', 'Links', 'verified', [
    cmd('link', 'Link', 'dialog', 'L', 1, 'strip+sub', { shortcut: 'Ctrl+K' }),
    cmd('bookmark', 'Bookmark', 'dialog', 'L', 2, 'sub'),
    cmd('cross-reference', 'Cross-reference', 'dialog', 'L', 3, 'sub'),
  ]),
  group('comments', 'Comments', 'verified', [
    cmd('comment', 'Comment', 'button', 'L', 1, 'strip', { shortcut: 'Ctrl+Alt+M' }),
  ]),
  group('header-footer', 'Header & Footer', 'verified', [
    cmd('header', 'Header', 'gallery', 'L', 1, 'sub'),
    cmd('footer', 'Footer', 'gallery', 'L', 1, 'sub'),
    cmd('page-number', 'Page Number', 'menu', 'L', 1, 'sub'),
  ]),
  group('text', 'Text', 'verified', [
    cmd('text-box', 'Text Box', 'gallery', 'L', 1, 'sub'),
    cmd('quick-parts', 'Quick Parts', 'menu', 'S', 3, 'sub', { coverage: 'gap' }),
    cmd('wordart', 'WordArt', 'gallery', 'S', 2, 'sub'),
    cmd('drop-cap', 'Drop Cap', 'menu', 'S', 3, 'sub'),
    cmd('signature-line', 'Signature Line', 'dialog', 'S', 3, 'sub', { coverage: 'unverified' }),
    cmd('date-time', 'Date & Time', 'dialog', 'S', 3, 'sub'),
    cmd('object', 'Object', 'split', 'S', 3, 'sub', { coverage: 'unverified' }),
  ]),
  group('symbols', 'Symbols', 'verified', [
    cmd('equation', 'Equation', 'split', 'L', 1, 'sub', { shortcut: 'Alt+=' }),
    cmd('symbol', 'Symbol', 'gallery', 'L', 1, 'strip+sub'),
  ]),
]);
