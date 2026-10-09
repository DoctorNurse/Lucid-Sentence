import { cmd, group, tab, type CommandDef } from '../define.js';

/**
 * Contextual tabs (plan §4.2). ONLYOFFICE exposes these settings in right-side
 * panels; Sentence re-presents them as Word-style contextual tabs (mostly UI only).
 */

const arrange = (): CommandDef[] => [
  cmd('position', 'Position', 'gallery', 'L', 2, 'sub'),
  cmd('wrap-text', 'Wrap Text', 'menu', 'L', 1, 'strip+sub'),
  cmd('bring-forward', 'Bring Forward', 'split', 'M', 2, 'sub'),
  cmd('send-backward', 'Send Backward', 'split', 'M', 2, 'sub'),
  cmd('selection-pane', 'Selection Pane', 'dialog', 'M', 3, 'sub', { coverage: 'unverified' }),
  cmd('align', 'Align', 'menu', 'S', 2, 'sub'),
  cmd('group', 'Group', 'menu', 'S', 3, 'sub'),
  cmd('rotate', 'Rotate', 'menu', 'S', 2, 'sub'),
];

export const tableDesignTab = tab(
  'table-design',
  'Table Design',
  'contextual',
  [
    group('style-options', 'Table Style Options', 'ui-only', [
      cmd('header-row', 'Header Row', 'toggle', 'S', 1, 'sheet'),
      cmd('total-row', 'Total Row', 'toggle', 'S', 2, 'sheet'),
      cmd('banded-rows', 'Banded Rows', 'toggle', 'S', 2, 'sheet'),
      cmd('first-column', 'First Column', 'toggle', 'S', 2, 'sheet'),
      cmd('last-column', 'Last Column', 'toggle', 'S', 3, 'sheet'),
      cmd('banded-columns', 'Banded Columns', 'toggle', 'S', 3, 'sheet'),
    ]),
    group('table-styles', 'Table Styles', 'ui-only', [
      cmd('gallery', 'Table Styles', 'gallery', 'L', 1, 'strip+sub'),
      cmd('shading', 'Shading', 'split', 'L', 1, 'strip+sub'),
    ]),
    group('borders', 'Borders', 'ui-only', [
      cmd('border-styles', 'Border Styles', 'gallery', 'L', 2, 'sub'),
      cmd('line-style', 'Line Style', 'input', 'S', 3, 'sub'),
      cmd('line-weight', 'Line Weight', 'input', 'S', 3, 'sub'),
      cmd('pen-color', 'Pen Color', 'split', 'S', 3, 'sub'),
      cmd('borders', 'Borders', 'split', 'L', 1, 'strip+sub'),
      cmd('border-painter', 'Border Painter', 'toggle', 'L', 3, 'sheet'),
    ]),
  ],
  'Cursor is in a table',
);

export const tableLayoutTab = tab(
  'table-layout',
  'Table Layout',
  'contextual',
  [
    group('table', 'Table', 'ui-only', [
      cmd('select', 'Select', 'menu', 'L', 2, 'sub'),
      cmd('view-gridlines', 'View Gridlines', 'toggle', 'L', 3, 'sheet'),
      cmd('properties', 'Properties', 'dialog', 'L', 2, 'sub'),
    ]),
    group('draw', 'Draw', 'unverified', [
      cmd('draw-table', 'Draw Table', 'toggle', 'L', 3, 'sheet'),
      cmd('eraser', 'Eraser', 'toggle', 'L', 3, 'sheet'),
    ]),
    group('rows-columns', 'Rows & Columns', 'ui-only', [
      cmd('delete', 'Delete', 'menu', 'L', 1, 'strip+sub'),
      cmd('insert-above', 'Insert Above', 'button', 'L', 1, 'strip'),
      cmd('insert-below', 'Insert Below', 'button', 'M', 1, 'strip'),
      cmd('insert-left', 'Insert Left', 'button', 'M', 2, 'sheet'),
      cmd('insert-right', 'Insert Right', 'button', 'M', 2, 'sheet'),
    ]),
    group('merge', 'Merge', 'ui-only', [
      cmd('merge-cells', 'Merge Cells', 'button', 'M', 1, 'strip'),
      cmd('split-cells', 'Split Cells', 'dialog', 'M', 2, 'sub'),
      cmd('split-table', 'Split Table', 'button', 'M', 3, 'sheet'),
    ]),
    group('cell-size', 'Cell Size', 'ui-only', [
      cmd('autofit', 'AutoFit', 'menu', 'L', 2, 'sub'),
      cmd('height', 'Height', 'input', 'S', 2, 'sub'),
      cmd('width', 'Width', 'input', 'S', 2, 'sub'),
      cmd('distribute-rows', 'Distribute Rows', 'button', 'S', 3, 'sheet'),
      cmd('distribute-columns', 'Distribute Columns', 'button', 'S', 3, 'sheet'),
    ]),
    group('alignment', 'Alignment', 'ui-only', [
      cmd('cell-align', 'Cell Alignment', 'menu', 'S', 1, 'sub'),
      cmd('text-direction', 'Text Direction', 'button', 'L', 3, 'sheet'),
      cmd('cell-margins', 'Cell Margins', 'dialog', 'L', 3, 'sub'),
    ]),
    group('data', 'Data', 'ui-only', [
      cmd('sort', 'Sort', 'dialog', 'L', 2, 'sub'),
      cmd('repeat-header-rows', 'Repeat Header Rows', 'toggle', 'S', 3, 'sheet'),
      cmd('convert-to-text', 'Convert to Text', 'dialog', 'S', 3, 'sub'),
      cmd('formula', 'Formula', 'dialog', 'S', 3, 'sub'),
    ]),
  ],
  'Cursor is in a table',
);

export const pictureFormatTab = tab(
  'picture-format',
  'Picture Format',
  'contextual',
  [
    group('adjust', 'Adjust', 'unverified', [
      cmd('remove-background', 'Remove Background', 'button', 'L', 3, 'sheet'),
      cmd('corrections', 'Corrections', 'gallery', 'L', 2, 'sub'),
      cmd('color', 'Color', 'gallery', 'L', 2, 'sub'),
      cmd('artistic-effects', 'Artistic Effects', 'gallery', 'L', 3, 'sub'),
      cmd('transparency', 'Transparency', 'gallery', 'L', 2, 'sub'),
      cmd('compress', 'Compress Pictures', 'dialog', 'S', 3, 'sub'),
      cmd('change-picture', 'Change Picture', 'menu', 'S', 2, 'sub', { coverage: 'verified' }),
      cmd('reset', 'Reset Picture', 'split', 'S', 3, 'sheet'),
    ]),
    group('picture-styles', 'Picture Styles', 'ui-only', [
      cmd('gallery', 'Picture Styles', 'gallery', 'L', 1, 'strip+sub'),
      cmd('border', 'Picture Border', 'split', 'S', 2, 'sub'),
      cmd('effects', 'Picture Effects', 'menu', 'S', 3, 'sub'),
      cmd('layout', 'Picture Layout', 'gallery', 'S', 3, 'sub'),
    ]),
    group('accessibility', 'Accessibility', 'ui-only', [
      cmd('alt-text', 'Alt Text', 'dialog', 'L', 1, 'strip+sub'),
    ]),
    group('arrange', 'Arrange', 'verified', arrange()),
    group('size', 'Size', 'verified', [
      cmd('crop', 'Crop', 'split', 'L', 1, 'strip+sub'),
      cmd('height', 'Height', 'input', 'S', 2, 'sub'),
      cmd('width', 'Width', 'input', 'S', 2, 'sub'),
    ]),
  ],
  'A picture is selected',
);

export const shapeFormatTab = tab(
  'shape-format',
  'Shape Format',
  'contextual',
  [
    group('insert-shapes', 'Insert Shapes', 'verified', [
      cmd('shapes', 'Shapes', 'gallery', 'L', 2, 'sub'),
      cmd('edit-shape', 'Edit Shape', 'menu', 'S', 3, 'sub'),
      cmd('text-box', 'Draw Text Box', 'split', 'S', 2, 'sub'),
    ]),
    group('shape-styles', 'Shape Styles', 'ui-only', [
      cmd('gallery', 'Shape Styles', 'gallery', 'L', 1, 'strip+sub'),
      cmd('fill', 'Shape Fill', 'split', 'S', 1, 'strip+sub'),
      cmd('outline', 'Shape Outline', 'split', 'S', 1, 'strip+sub'),
      cmd('effects', 'Shape Effects', 'menu', 'S', 3, 'sub'),
    ]),
    group('wordart-styles', 'WordArt Styles', 'ui-only', [
      cmd('gallery', 'WordArt Styles', 'gallery', 'L', 2, 'sub'),
      cmd('text-fill', 'Text Fill', 'split', 'S', 2, 'sub'),
      cmd('text-outline', 'Text Outline', 'split', 'S', 3, 'sub'),
      cmd('text-effects', 'Text Effects', 'menu', 'S', 3, 'sub'),
    ]),
    group('text', 'Text', 'ui-only', [
      cmd('text-direction', 'Text Direction', 'menu', 'M', 3, 'sub'),
      cmd('align-text', 'Align Text', 'menu', 'M', 2, 'sub'),
      cmd('create-link', 'Create Link', 'button', 'M', 3, 'sheet', { coverage: 'unverified' }),
    ]),
    group('accessibility', 'Accessibility', 'ui-only', [
      cmd('alt-text', 'Alt Text', 'dialog', 'L', 2, 'sub'),
    ]),
    group('arrange', 'Arrange', 'verified', arrange()),
    group('size', 'Size', 'verified', [
      cmd('height', 'Height', 'input', 'S', 2, 'sub'),
      cmd('width', 'Width', 'input', 'S', 2, 'sub'),
    ]),
  ],
  'A shape or text box is selected',
);

export const headerFooterTab = tab(
  'header-footer',
  'Header & Footer',
  'contextual',
  [
    group('header-footer', 'Header & Footer', 'verified', [
      cmd('header', 'Header', 'gallery', 'L', 1, 'sub'),
      cmd('footer', 'Footer', 'gallery', 'L', 1, 'sub'),
      cmd('page-number', 'Page Number', 'menu', 'L', 1, 'strip+sub'),
    ]),
    group('insert', 'Insert', 'verified', [
      cmd('date-time', 'Date & Time', 'dialog', 'L', 2, 'sub'),
      cmd('document-info', 'Document Info', 'menu', 'L', 3, 'sub', { coverage: 'unverified' }),
      cmd('quick-parts', 'Quick Parts', 'menu', 'L', 3, 'sub', { coverage: 'gap' }),
      cmd('pictures', 'Pictures', 'button', 'L', 2, 'sub'),
    ]),
    group('navigation', 'Navigation', 'verified', [
      cmd('go-to-header', 'Go to Header', 'button', 'L', 2, 'sheet'),
      cmd('go-to-footer', 'Go to Footer', 'button', 'L', 2, 'sheet'),
      cmd('previous', 'Previous', 'button', 'S', 3, 'sheet'),
      cmd('next', 'Next', 'button', 'S', 3, 'sheet'),
      cmd('link-to-previous', 'Link to Previous', 'toggle', 'S', 2, 'sheet'),
    ]),
    group('options', 'Options', 'verified', [
      cmd('different-first-page', 'Different First Page', 'toggle', 'S', 2, 'sheet'),
      cmd('different-odd-even', 'Different Odd & Even Pages', 'toggle', 'S', 2, 'sheet'),
      cmd('show-document-text', 'Show Document Text', 'toggle', 'S', 3, 'sheet'),
    ]),
    group('position', 'Position', 'verified', [
      cmd('header-from-top', 'Header from Top', 'input', 'S', 3, 'sub'),
      cmd('footer-from-bottom', 'Footer from Bottom', 'input', 'S', 3, 'sub'),
      cmd('insert-alignment-tab', 'Insert Alignment Tab', 'dialog', 'S', 3, 'sub'),
    ]),
    group('close', 'Close', 'ui-only', [
      cmd('close', 'Close Header and Footer', 'button', 'L', 1, 'strip'),
    ]),
  ],
  'Editing a header or footer',
);

export const equationTab = tab(
  'equation',
  'Equation',
  'contextual',
  [
    group('tools', 'Tools', 'verified', [
      cmd('equation', 'Equation', 'split', 'L', 2, 'sub'),
      cmd('ink-equation', 'Ink Equation', 'dialog', 'L', 3, 'sub', { coverage: 'gap' }),
    ]),
    group('conversions', 'Conversions', 'verified', [
      cmd('convert', 'Convert', 'menu', 'L', 2, 'sub'),
      cmd('normal-text', 'Normal Text', 'toggle', 'S', 3, 'sheet'),
    ]),
    group('symbols', 'Symbols', 'verified', [
      cmd('symbols', 'Symbols', 'gallery', 'L', 1, 'strip+sub'),
    ]),
    group('structures', 'Structures', 'verified', [
      cmd('fraction', 'Fraction', 'gallery', 'L', 1, 'strip+sub'),
      cmd('script', 'Script', 'gallery', 'L', 1, 'strip+sub'),
      cmd('radical', 'Radical', 'gallery', 'L', 1, 'strip+sub'),
      cmd('integral', 'Integral', 'gallery', 'L', 2, 'sub'),
      cmd('large-operator', 'Large Operator', 'gallery', 'L', 2, 'sub'),
      cmd('bracket', 'Bracket', 'gallery', 'L', 2, 'sub'),
      cmd('function', 'Function', 'gallery', 'L', 2, 'sub'),
      cmd('accent', 'Accent', 'gallery', 'L', 3, 'sub'),
      cmd('limit-log', 'Limit and Log', 'gallery', 'L', 3, 'sub'),
      cmd('operator', 'Operator', 'gallery', 'L', 3, 'sub'),
      cmd('matrix', 'Matrix', 'gallery', 'L', 3, 'sub'),
    ]),
  ],
  'Cursor is in an equation',
);
