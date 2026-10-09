import { cmd, group, tab } from '../define.js';

export const viewTab = tab('view', 'View', 'standard', [
  group('views', 'Views', 'gap', [
    cmd('read-mode', 'Read Mode', 'button', 'L', 1, 'strip'),
    cmd('print-layout', 'Print Layout', 'button', 'L', 1, 'strip', { coverage: 'verified' }),
    cmd('web-layout', 'Web Layout', 'button', 'L', 2, 'sheet'),
    cmd('outline', 'Outline', 'button', 'S', 2, 'sheet'),
    cmd('draft', 'Draft', 'button', 'S', 2, 'sheet'),
  ]),
  group('immersive', 'Immersive', 'gap', [
    cmd('focus', 'Focus', 'toggle', 'L', 2, 'sheet'),
    cmd('immersive-reader', 'Immersive Reader', 'toggle', 'L', 3, 'sheet'),
  ]),
  group('page-movement', 'Page Movement', 'gap', [
    cmd('vertical', 'Vertical', 'toggle', 'L', 2, 'sheet', { coverage: 'verified' }),
    cmd('side-to-side', 'Side to Side', 'toggle', 'L', 3, 'sheet'),
  ]),
  group('show', 'Show', 'verified', [
    cmd('ruler', 'Ruler', 'toggle', 'S', 2, 'sheet'),
    cmd('gridlines', 'Gridlines', 'toggle', 'S', 3, 'sheet', { coverage: 'unverified' }),
    cmd('navigation-pane', 'Navigation Pane', 'toggle', 'S', 1, 'strip'),
  ]),
  group('zoom', 'Zoom', 'verified', [
    cmd('zoom', 'Zoom', 'dialog', 'L', 1, 'strip+sub'),
    cmd('zoom-100', '100%', 'button', 'L', 2, 'sheet'),
    cmd('one-page', 'One Page', 'button', 'S', 2, 'sheet'),
    cmd('multiple-pages', 'Multiple Pages', 'button', 'S', 2, 'sheet'),
    cmd('page-width', 'Page Width', 'button', 'S', 1, 'sheet'),
  ]),
  group('window', 'Window', 'shell', [
    cmd('new-window', 'New Window', 'button', 'L', 3, 'sheet'),
    cmd('arrange-all', 'Arrange All', 'button', 'L', 3, 'sheet'),
    cmd('split', 'Split', 'toggle', 'L', 3, 'sheet'),
    cmd('side-by-side', 'View Side by Side', 'toggle', 'S', 3, 'sheet'),
    cmd('synchronous-scrolling', 'Synchronous Scrolling', 'toggle', 'S', 3, 'sheet'),
    cmd('reset-window-position', 'Reset Window Position', 'button', 'S', 3, 'sheet'),
    cmd('switch-windows', 'Switch Windows', 'menu', 'L', 3, 'sub'),
  ]),
  group('macros', 'Macros', 'verified', [
    cmd('macros', 'Macros', 'dialog', 'L', 3, 'sub', { shortcut: 'Alt+F8' }),
  ]),
  group('properties', 'Properties', 'verified', [
    cmd('properties', 'Properties', 'dialog', 'L', 3, 'sub'),
  ]),
]);
