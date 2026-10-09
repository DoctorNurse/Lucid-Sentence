import { cmd, group, tab } from '../define.js';

/**
 * Draw. On phones, ink needs an explicit draw mode so scrolling is not mistaken
 * for ink (plan §4.6); that mode is entered by choosing a pen from the gallery.
 */
export const drawTab = tab('draw', 'Draw', 'standard', [
  group('drawing-tools', 'Drawing Tools', 'verified', [
    cmd('select', 'Select', 'toggle', 'L', 1, 'strip'),
    cmd('lasso', 'Lasso Select', 'toggle', 'L', 2, 'sheet', { coverage: 'gap' }),
    cmd('eraser', 'Eraser', 'split', 'L', 1, 'strip+sub'),
    cmd('pens', 'Pens', 'gallery', 'L', 1, 'strip+sub'),
    cmd('add-pen', 'Add Pen', 'menu', 'L', 2, 'sub'),
    cmd('draw-with-touch', 'Draw with Touch', 'toggle', 'L', 1, 'strip'),
  ]),
  group('convert', 'Convert', 'gap', [
    cmd('ink-to-shape', 'Ink to Shape', 'toggle', 'L', 2, 'sheet'),
    cmd('ink-to-math', 'Ink to Math', 'dialog', 'L', 2, 'sub'),
  ]),
  group('insert', 'Insert', 'unverified', [
    cmd('drawing-canvas', 'Drawing Canvas', 'button', 'L', 2, 'sheet'),
  ]),
  group('replay', 'Replay', 'gap', [cmd('ink-replay', 'Ink Replay', 'button', 'L', 3, 'sheet')]),
]);
