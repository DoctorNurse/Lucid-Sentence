import { cmd, group, tab } from '../define.js';

export const designTab = tab('design', 'Design', 'standard', [
  group('document-formatting', 'Document Formatting', 'unverified', [
    cmd('themes', 'Themes', 'gallery', 'L', 1, 'strip+sub'),
    cmd('style-set', 'Style Set', 'gallery', 'L', 1, 'strip+sub', { coverage: 'gap' }),
    cmd('colors', 'Colors', 'gallery', 'L', 1, 'strip+sub', { coverage: 'verified' }),
    cmd('fonts', 'Fonts', 'gallery', 'L', 2, 'sub'),
    cmd('paragraph-spacing', 'Paragraph Spacing', 'menu', 'M', 2, 'sub', { coverage: 'gap' }),
    cmd('effects', 'Effects', 'gallery', 'M', 3, 'sub'),
    cmd('set-as-default', 'Set as Default', 'button', 'M', 3, 'sheet'),
  ]),
  group('page-background', 'Page Background', 'verified', [
    cmd('watermark', 'Watermark', 'gallery', 'L', 1, 'sub'),
    cmd('page-color', 'Page Color', 'menu', 'L', 1, 'sub'),
    cmd('page-borders', 'Page Borders', 'dialog', 'L', 2, 'sub', { coverage: 'gap' }),
  ]),
]);
