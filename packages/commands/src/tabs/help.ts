import { cmd, group, tab } from '../define.js';

export const helpTab = tab('help', 'Help', 'standard', [
  group('help', 'Help', 'ui-only', [
    cmd('help', 'Help', 'dialog', 'L', 1, 'strip+sub', { shortcut: 'F1' }),
    cmd('contact-support', 'Contact Support', 'button', 'L', 2, 'sheet'),
    cmd('feedback', 'Feedback', 'button', 'L', 2, 'sheet'),
    cmd('show-training', 'Show Training', 'button', 'L', 3, 'sheet'),
    cmd('whats-new', "What's New", 'dialog', 'L', 2, 'sub'),
  ]),
]);
