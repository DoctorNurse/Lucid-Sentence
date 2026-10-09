import { cmd, group, tab } from '../define.js';

/** Mailings: the largest engine gap (plan §4.8). Needs a local merge host. */
export const mailingsTab = tab('mailings', 'Mailings', 'standard', [
  group('create', 'Create', 'gap', [
    cmd('envelopes', 'Envelopes', 'dialog', 'L', 1, 'strip+sub'),
    cmd('labels', 'Labels', 'dialog', 'L', 1, 'strip+sub'),
  ]),
  group('start-mail-merge', 'Start Mail Merge', 'gap', [
    cmd('start', 'Start Mail Merge', 'menu', 'L', 1, 'strip+sub'),
    cmd('select-recipients', 'Select Recipients', 'menu', 'L', 1, 'sub'),
    cmd('edit-recipient-list', 'Edit Recipient List', 'dialog', 'L', 2, 'sub'),
  ]),
  group('write-insert-fields', 'Write & Insert Fields', 'gap', [
    cmd('highlight-merge-fields', 'Highlight Merge Fields', 'toggle', 'L', 2, 'sheet', {
      coverage: 'verified',
    }),
    cmd('address-block', 'Address Block', 'dialog', 'L', 2, 'sub', { coverage: 'unverified' }),
    cmd('greeting-line', 'Greeting Line', 'dialog', 'L', 2, 'sub', { coverage: 'unverified' }),
    cmd('insert-merge-field', 'Insert Merge Field', 'split', 'L', 1, 'sub', {
      coverage: 'verified',
    }),
    cmd('rules', 'Rules', 'menu', 'S', 2, 'sub'),
    cmd('match-fields', 'Match Fields', 'dialog', 'S', 3, 'sub', { coverage: 'unverified' }),
    cmd('update-labels', 'Update Labels', 'button', 'S', 3, 'sheet'),
  ]),
  group('preview-results', 'Preview Results', 'verified', [
    cmd('preview', 'Preview Results', 'toggle', 'L', 1, 'strip'),
    cmd('first-record', 'First Record', 'button', 'S', 2, 'sheet'),
    cmd('previous-record', 'Previous Record', 'button', 'S', 1, 'sheet'),
    cmd('go-to-record', 'Go to Record', 'input', 'S', 2, 'sub'),
    cmd('next-record', 'Next Record', 'button', 'S', 1, 'sheet'),
    cmd('last-record', 'Last Record', 'button', 'S', 2, 'sheet'),
    cmd('find-recipient', 'Find Recipient', 'dialog', 'S', 3, 'sub'),
    cmd('check-for-errors', 'Check for Errors', 'dialog', 'S', 3, 'sub', {
      coverage: 'unverified',
    }),
  ]),
  group('finish', 'Finish', 'gap', [
    cmd('finish-merge', 'Finish & Merge', 'menu', 'L', 1, 'strip+sub'),
  ]),
]);
