/** File backstage pages (rendered into <ls-ribbon>'s `backstage` slot). */
import { el, tap } from './ui.js';

export interface BackstageContext {
  docName: string;
  stats: () => {
    words: number;
    chars: number;
    paragraphs: number;
    pages: number;
    comments: number;
    strokes: number;
  };
  /** A .docx is open in the document engine (ONLYOFFICE). */
  engine: boolean;
  /** blank: a new Word document in the engine; notes/sample: the preview canvas (ink, Notes). */
  newDoc: (kind: 'blank' | 'notes' | 'sample') => void;
  /** Native dialog / File System Access picker; falls back to the <input> on this page. */
  pickFile: (fallback: () => void) => void;
  openFile: (file: File) => void;
  save: () => void;
  saveAs: () => void;
  downloadDocx: () => void;
  downloadHtml: () => void;
  downloadText: () => void;
  print: () => void;
  promosEnabled: boolean;
  settings: { autoSwitch: boolean; drawWithTouch: boolean; floatingToolbar: boolean };
  onSetting: (key: 'autoSwitch' | 'drawWithTouch' | 'floatingToolbar', value: boolean) => void;
  version: string;
}

const h = (title: string, sub?: string): HTMLElement =>
  el(
    'header',
    { class: 'bs__head' },
    el('h2', { class: 'bs__title' }, title),
    sub ? el('p', { class: 'bs__sub' }, sub) : null,
  );

function action(
  label: string,
  detail: string,
  run: () => void,
  primary = false,
): HTMLButtonElement {
  const b = el(
    'button',
    { type: 'button', class: `bs__card${primary ? ' bs__card--primary' : ''}` },
    el('span', { class: 'bs__card-label' }, label),
    el('span', { class: 'bs__card-detail' }, detail),
  );
  tap(b, run);
  return b;
}

function toggleRow(
  label: string,
  detail: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLElement {
  const input = el('input', { type: 'checkbox', role: 'switch', class: 'switch' });
  input.checked = checked;
  input.addEventListener('change', () => {
    onChange(input.checked);
  });
  return el(
    'label',
    { class: 'bs__switch' },
    el('span', {}, el('strong', {}, label), el('span', { class: 'bs__card-detail' }, detail)),
    input,
  );
}

export function backstagePage(id: string, ctx: BackstageContext): HTMLElement {
  const page = el('div', { class: 'bs', 'data-page': id });
  const s = ctx.stats();
  switch (id) {
    case 'file.rail.home':
    case 'file.rail.new': {
      page.append(
        h(
          id.endsWith('new') ? 'New' : 'Good to see you',
          'Start a document. Everything stays on this device.',
        ),
        el(
          'div',
          { class: 'bs__grid' },
          action(
            'Blank document',
            'Word document (.docx), Letter, Normal margins',
            () => {
              ctx.newDoc('blank');
            },
            true,
          ),
          action('Blank notes page', 'Handwriting, ink and Notes mode (preview canvas)', () => {
            ctx.newDoc('notes');
          }),
          action('Sample: Quarterly Notes', 'Headings, a list, a table, and a comment', () => {
            ctx.newDoc('sample');
          }),
        ),
        el('h3', { class: 'bs__h3' }, 'Recent'),
        el(
          'div',
          { class: 'bs__list' },
          el(
            'div',
            { class: 'bs__row' },
            el('strong', {}, ctx.docName),
            el('span', { class: 'bs__card-detail' }, 'This device · edited just now'),
          ),
        ),
      );
      break;
    }
    case 'file.rail.open': {
      const input = el('input', {
        type: 'file',
        accept: '.docx,.txt,.html,.htm',
        class: 'sr-only',
        id: 'open-file',
      });
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        if (f) ctx.openFile(f);
      });
      const pick = action(
        'Browse this device',
        'Word documents (.docx) open for editing. Text and HTML open in the preview.',
        () => {
          ctx.pickFile(() => {
            input.click();
          });
        },
        true,
      );
      page.append(h('Open'), el('div', { class: 'bs__grid' }, pick, input));
      break;
    }
    case 'file.rail.save':
    case 'file.rail.save-as':
    case 'file.rail.export': {
      if (ctx.engine) {
        page.append(
          h(id.endsWith('export') ? 'Export' : 'Save As', ctx.docName),
          el(
            'div',
            { class: 'bs__grid' },
            action(
              'Save',
              'Ctrl+S · back to the file you opened',
              ctx.save,
              !id.endsWith('save-as'),
            ),
            action('Save As…', 'F12 · choose a name and place', ctx.saveAs, id.endsWith('save-as')),
            action('Download a copy', 'Word document (.docx)', ctx.downloadDocx),
          ),
          el('p', { class: 'bs__sub' }, 'PDF export and other formats come later in M1.'),
        );
        break;
      }
      page.append(
        h(
          id.endsWith('export') ? 'Export' : 'Save a copy',
          'This is the preview canvas. To write a Word document, start a Blank document or open a .docx file. Here you can save a draft on this device or download a preview.',
        ),
        el(
          'div',
          { class: 'bs__grid' },
          action('Save draft on this device', 'Ctrl+S · stored in this browser', ctx.save, true),
          action('Download HTML', 'Formatted preview (.html)', ctx.downloadHtml),
          action('Download plain text', 'Text only (.txt)', ctx.downloadText),
          action('PDF via Print', 'Use your system print dialog → Save as PDF', ctx.print),
        ),
      );
      break;
    }
    case 'file.rail.print': {
      page.append(
        h('Print', 'Prints the page only, with white paper and no interface.'),
        el(
          'div',
          { class: 'bs__grid' },
          action('Print', 'Ctrl+P · system print dialog', ctx.print, true),
        ),
      );
      break;
    }
    case 'file.settings.account': {
      page.append(
        h('Account and About'),
        el(
          'div',
          { class: 'bs__about' },
          el('img', {
            src: './icon-256.png',
            alt: '',
            width: '72',
            height: '72',
            class: 'bs__icon',
          }),
          el(
            'div',
            {},
            el('h3', { class: 'bs__h3' }, `Lucid Sentence ${ctx.version}`),
            el(
              'p',
              { class: 'bs__sub' },
              'A .docx-only word processor with Word’s ribbon. AGPL-3.0. © 2026 Lucid Systems and contributors.',
            ),
          ),
        ),
        el('h3', { class: 'bs__h3' }, 'Attributions'),
        el(
          'ul',
          { class: 'bs__credits' },
          el(
            'li',
            {},
            'Document engine: based on the original ONLYOFFICE software developed by Ascensio System SIA, version 9.4 (sdkjs) and 9.3 (x2t converter, compiled to WebAssembly by CryptPad). This version is modified by Lucid Systems. AGPL-3.0 with additional terms: ',
            el(
              'a',
              { href: 'https://github.com/DoctorNurse/Lucid-Sentence/blob/main/NOTICE' },
              'notices and license',
            ),
            '. ONLYOFFICE is a trademark of Ascensio System SIA; Lucid Sentence is not affiliated with or endorsed by it.',
          ),
          el(
            'li',
            {},
            'Document fonts: Carlito, Caladea, Open Sans (SIL OFL 1.1 / Apache 2.0), Liberation (Liberation Fonts license), DejaVu (Bitstream Vera license), ASC (Ascensio System SIA).',
          ),
          el('li', {}, 'Icons: Lucide (ISC); some icons derive from Feather (MIT).'),
          el('li', {}, 'Fonts: Fraunces, Instrument Sans, JetBrains Mono (SIL OFL 1.1).'),
          el('li', {}, 'Ink smoothing: perfect-freehand (MIT).'),
          el('li', {}, 'Design: adapted from Chapternal (Lucid Systems LLC).'),
          el(
            'li',
            {},
            'Not affiliated with Microsoft. Word is a trademark of Microsoft Corporation.',
          ),
        ),
        el('h3', { class: 'bs__h3' }, 'Launch suggestions'),
        el(
          'p',
          { class: 'bs__sub' },
          ctx.promosEnabled
            ? 'Official builds show at most one suggestion for another Lucid Systems app at launch. No tracking. Builders can turn this off with LUCID_PROMOS=off; this demo also accepts ?promos=off.'
            : 'Launch suggestions are off in this build.',
        ),
      );
      break;
    }
    case 'file.settings.options': {
      page.append(
        h('Options', 'Pen and touch'),
        el(
          'div',
          { class: 'bs__list' },
          toggleRow(
            'Switch to drawing when a pen touches the page',
            'Apple Pencil, S Pen, and other active styluses',
            ctx.settings.autoSwitch,
            (v) => {
              ctx.onSetting('autoSwitch', v);
            },
          ),
          toggleRow(
            'Draw with touch',
            'Off: only a pen draws, fingers scroll (palm rejection)',
            ctx.settings.drawWithTouch,
            (v) => {
              ctx.onSetting('drawWithTouch', v);
            },
          ),
          toggleRow(
            'Floating pen toolbar',
            'Show a movable toolbar while drawing',
            ctx.settings.floatingToolbar,
            (v) => {
              ctx.onSetting('floatingToolbar', v);
            },
          ),
        ),
      );
      break;
    }
    case 'file.rail.share': {
      page.append(
        h('Share', 'Sharing goes through the system share sheet in the desktop and mobile apps.'),
        el(
          'div',
          { class: 'bs__grid' },
          action('Download HTML to share', 'Preview copy', ctx.downloadHtml, true),
        ),
      );
      break;
    }
    default: {
      page.append(
        h('Info', ctx.docName),
        el(
          'dl',
          { class: 'bs__stats' },
          ...(
            [
              ['Pages', s.pages],
              ['Words', s.words],
              ['Characters', s.chars],
              ['Paragraphs', s.paragraphs],
              ['Comments', s.comments],
              ['Ink strokes', s.strokes],
            ] as const
          ).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))]),
        ),
        el('h3', { class: 'bs__h3' }, 'Properties'),
        el(
          'dl',
          { class: 'bs__stats' },
          el('dt', {}, 'Format'),
          el('dd', {}, 'Word Document (.docx)'),
          el('dt', {}, 'Location'),
          el('dd', {}, 'This device'),
          el('dt', {}, 'Engine'),
          el('dd', {}, ctx.engine ? 'ONLYOFFICE document engine' : 'Preview canvas'),
        ),
      );
    }
  }
  return page;
}
