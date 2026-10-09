import { cmd, group, tab } from '../define.js';

export const layoutTab = tab('layout', 'Layout', 'standard', [
  group('page-setup', 'Page Setup', 'verified', [
    cmd('margins', 'Margins', 'menu', 'L', 1, 'strip+sub'),
    cmd('orientation', 'Orientation', 'menu', 'L', 1, 'strip+sub'),
    cmd('size', 'Size', 'menu', 'L', 1, 'strip+sub'),
    cmd('columns', 'Columns', 'menu', 'L', 1, 'sub'),
    cmd('breaks', 'Breaks', 'menu', 'S', 2, 'sub'),
    cmd('line-numbers', 'Line Numbers', 'menu', 'S', 3, 'sub'),
    cmd('hyphenation', 'Hyphenation', 'menu', 'S', 3, 'sub'),
  ]),
  group('paragraph', 'Paragraph', 'ui-only', [
    cmd('indent-left', 'Indent Left', 'input', 'M', 2, 'sub'),
    cmd('indent-right', 'Indent Right', 'input', 'M', 2, 'sub'),
    cmd('spacing-before', 'Spacing Before', 'input', 'M', 2, 'sub'),
    cmd('spacing-after', 'Spacing After', 'input', 'M', 2, 'sub'),
  ]),
  group('arrange', 'Arrange', 'verified', [
    cmd('position', 'Position', 'gallery', 'L', 1, 'sub'),
    cmd('wrap-text', 'Wrap Text', 'menu', 'L', 1, 'sub'),
    cmd('bring-forward', 'Bring Forward', 'split', 'M', 2, 'sub'),
    cmd('send-backward', 'Send Backward', 'split', 'M', 2, 'sub'),
    cmd('selection-pane', 'Selection Pane', 'dialog', 'M', 3, 'sub', { coverage: 'unverified' }),
    cmd('align', 'Align', 'menu', 'S', 2, 'sub'),
    cmd('group', 'Group', 'menu', 'S', 3, 'sub'),
    cmd('rotate', 'Rotate', 'menu', 'S', 3, 'sub'),
  ]),
]);
