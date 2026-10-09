import { cmd, group, tab } from '../define.js';

/** File (backstage), plan §4.4. The left rail, with Account and Options at the bottom. */
export const fileTab = tab('file', 'File', 'backstage', [
  group('rail', 'File', 'verified', [
    cmd('home', 'Home', 'button', 'L', 1, 'sub'),
    cmd('new', 'New', 'button', 'L', 1, 'strip+sub', { shortcut: 'Ctrl+N' }),
    cmd('open', 'Open', 'dialog', 'L', 1, 'strip+sub', { shortcut: 'Ctrl+O' }),
    cmd('info', 'Info', 'button', 'L', 1, 'sub', { coverage: 'unverified' }),
    cmd('save', 'Save', 'button', 'L', 1, 'strip', { shortcut: 'Ctrl+S' }),
    cmd('save-as', 'Save As', 'dialog', 'L', 1, 'strip+sub', { shortcut: 'F12' }),
    cmd('print', 'Print', 'dialog', 'L', 1, 'strip+sub', { shortcut: 'Ctrl+P' }),
    cmd('share', 'Share', 'dialog', 'L', 1, 'sub', { coverage: 'shell' }),
    cmd('export', 'Export', 'dialog', 'L', 1, 'sub'),
    cmd('close', 'Close', 'button', 'L', 1, 'sheet', { shortcut: 'Ctrl+W' }),
  ]),
  group('settings', 'Settings', 'ui-only', [
    cmd('account', 'Account', 'button', 'L', 2, 'sub'),
    cmd('options', 'Options', 'dialog', 'L', 2, 'sub'),
  ]),
]);
