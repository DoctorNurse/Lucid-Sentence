/**
 * Command dispatcher keyed by registry ids. Only ids listed here are "wired";
 * the ribbon shows every other command as "Coming with the engine".
 */
import type { CommandEventDetail, IconNode } from '@lucid-sentence/ribbon-ui';
import {
  AlignCenterHorizontal,
  ArrowDownToLine,
  ArrowUpToLine,
  Columns2,
  FileText,
  Minus,
  PanelBottom,
  PanelTop,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  SquareDashed,
  Table,
  Trash,
} from 'lucide';
import type { Comments } from './comments.js';
import type { FindPanel } from './find.js';
import type { History } from './history.js';
import type { InkLayer, InkTool } from './ink.js';
import type { PenToolbar } from './notes.js';
import {
  MARGINS,
  PAPER,
  type MarginPreset,
  type Orientation,
  type PageSetup,
  type PageSize,
} from '../page.js';
import { STYLES, type EditorSurface, type StyleName } from './surface.js';
import {
  HIGHLIGHTS,
  PALETTE,
  colorPicker,
  el,
  form,
  gallery,
  menu,
  openPopover,
  tableGrid,
  toast,
} from './ui.js';

export interface ViewState {
  ruler: boolean;
  gridlines: boolean;
  showMarks: boolean;
  navPane: boolean;
  focus: boolean;
  read: boolean;
  web: boolean;
  paperDark: boolean;
  draw: boolean;
  formatPainter: boolean;
  readAloud: boolean;
  zoom: number;
  zoomFit: boolean;
  columns: number;
  hyphenate: boolean;
  watermark: string | null;
  pageColor: string | null;
  spacing: 'compact' | 'normal' | 'open';
  headerRow: boolean;
  bandedRows: boolean;
  firstColumn: boolean;
}

export interface App {
  surface: EditorSurface;
  ink: InkLayer;
  history: History;
  find: FindPanel;
  comments: Comments;
  pen: PenToolbar;
  view: ViewState;
  page: PageSetup;
  setPage: (p: Partial<PageSetup>) => void;
  applyView: () => void;
  setDraw: (on: boolean, tool?: InkTool) => void;
  openBackstage: (id: string) => void;
  openPalette: () => void;
  save: () => void;
  print: () => void;
  setZoom: (pct: number | 'fit' | 'page') => void;
  refresh: () => void;
  language: string;
  setLanguage: (l: string) => void;
  settings: { autoSwitch: boolean; drawWithTouch: boolean; floatingToolbar: boolean };
}

type Handler = (app: App, d: CommandEventDetail) => void;

const FONTS = [
  'Aptos',
  'Calibri',
  'Arial',
  'Cambria',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Courier New',
];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

function pop(d: CommandEventDetail, content: HTMLElement, label: string, wide = false): void {
  openPopover(d.anchor, content, {
    label,
    focus: !d.anchor,
    role: 'dialog',
    wide,
  });
}

function choice<T>(
  d: CommandEventDetail,
  label: string,
  items: { label: string; detail?: string; value: T; icon?: IconNode | undefined }[],
  current: T | undefined,
  run: (v: T) => void,
): void {
  pop(
    d,
    menu(
      items.map((it) => ({
        label: it.label,
        detail: it.detail,
        icon: it.icon,
        checked: current === undefined ? undefined : it.value === current,
        run: () => {
          run(it.value);
        },
      })),
    ),
    label,
  );
}

function stylePreview(name: StyleName): HTMLElement {
  const s = STYLES.find((x) => x.name === name)!;
  const p = el(
    s.tag === 'blockquote' ? 'blockquote' : (s.tag as 'p'),
    { class: `style-preview ${s.cls ?? ''}` },
    name === 'Normal' ? 'Aa Normal' : name,
  );
  return el('div', { class: 'doc doc--preview' }, p);
}

function blockChoices(
  app: App,
  d: CommandEventDetail,
  label: string,
  prop: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight' | 'lineHeight',
  values: { label: string; v: string }[],
): void {
  choice(
    d,
    label,
    values.map((x) => ({ label: x.label, value: x.v })),
    undefined,
    (v) => {
      app.surface.setBlockStyle(prop, v);
    },
  );
}

const spacingValues = [0, 6, 12, 18, 24].map((pt) => ({ label: `${pt} pt`, v: `${pt}pt` }));
const indentValues = [0, 0.25, 0.5, 1, 1.5].map((i) => ({ label: `${i}"`, v: `${i}in` }));

function pictureFromFile(app: App, file: File): void {
  const r = new FileReader();
  r.onload = () => {
    app.surface.insertHTML(
      `<img src="${typeof r.result === 'string' ? r.result : ''}" alt="${file.name.replace(/"/g, '')}" class="d-img">`,
    );
    toast('Picture inserted. Select it for Picture Format.');
  };
  r.readAsDataURL(file);
}

export const handlers: Record<string, Handler> = {
  // ── Home › Clipboard
  'home.clipboard.cut': (a) => {
    a.surface.exec('cut');
  },
  'home.clipboard.copy': (a) => {
    a.surface.exec('copy');
    toast('Copied');
  },
  'home.clipboard.paste': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Keep Text Only',
          detail: 'Paste as plain text',
          run: () => {
            handlers['home.clipboard.paste-text-only']!(a, d);
          },
        },
        {
          label: 'Keep Source Formatting',
          detail: 'Paste with formatting',
          run: () => {
            handlers['home.clipboard.paste-keep-source']!(a, d);
          },
        },
      ]),
      'Paste',
    );
  },
  'home.clipboard.paste-text-only': (a) => {
    navigator.clipboard.readText().then(
      (t) => {
        a.surface.insertText(t);
      },
      () => {
        toast('Press Ctrl+V to paste (clipboard permission needed)');
      },
    );
  },
  'home.clipboard.paste-keep-source': (a) => {
    navigator.clipboard.read().then(
      async (items) => {
        for (const it of items) {
          if (it.types.includes('text/html')) {
            a.surface.insertHTML(await (await it.getType('text/html')).text());
            return;
          }
          if (it.types.includes('text/plain')) {
            a.surface.insertText(await (await it.getType('text/plain')).text());
            return;
          }
        }
      },
      () => {
        toast('Press Ctrl+V to paste (clipboard permission needed)');
      },
    );
  },
  'home.clipboard.paste-merge': (a, d) => {
    handlers['home.clipboard.paste-text-only']!(a, d);
  },
  'home.clipboard.format-painter': (a) => {
    a.view.formatPainter = !a.view.formatPainter;
    if (a.view.formatPainter) {
      const st = a.surface.state();
      const apply = (): void => {
        a.surface.root.removeEventListener('mouseup', apply);
        a.view.formatPainter = false;
        const now = a.surface.state();
        const toggles: [keyof typeof st, string][] = [
          ['bold', 'bold'],
          ['italic', 'italic'],
          ['underline', 'underline'],
          ['strike', 'strikeThrough'],
        ];
        for (const [k, c] of toggles) if (st[k] !== now[k]) a.surface.exec(c);
        a.surface.setFont(st.font);
        a.surface.setFontSize(Number(st.size));
        a.refresh();
      };
      a.surface.root.addEventListener('mouseup', apply);
      toast('Format Painter: select text to apply the formatting');
    }
    a.refresh();
  },

  // ── Home › Font
  'home.font.font': (a, d) => {
    const cur = a.surface.state().font;
    pop(
      d,
      menu(
        FONTS.map((f) => ({
          label: f,
          checked: f === cur,
          preview: `font-family:'${f}'`,
          run: () => {
            a.surface.setFont(f);
          },
        })),
      ),
      'Font',
    );
  },
  'home.font.size': (a, d) => {
    const cur = a.surface.state().size;
    pop(
      d,
      menu(
        SIZES.map((s) => ({
          label: String(s),
          checked: String(s) === cur,
          run: () => {
            a.surface.setFontSize(s);
          },
        })),
      ),
      'Font Size',
    );
  },
  'home.font.grow': (a) => {
    a.surface.stepFontSize(1);
  },
  'home.font.shrink': (a) => {
    a.surface.stepFontSize(-1);
  },
  'home.font.change-case': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Sentence case.',
          run: () => {
            a.surface.changeCase('sentence');
          },
        },
        {
          label: 'lowercase',
          run: () => {
            a.surface.changeCase('lower');
          },
        },
        {
          label: 'UPPERCASE',
          run: () => {
            a.surface.changeCase('upper');
          },
        },
        {
          label: 'Capitalize Each Word',
          run: () => {
            a.surface.changeCase('title');
          },
        },
        {
          label: 'tOGGLE cASE',
          run: () => {
            a.surface.changeCase('toggle');
          },
        },
      ]),
      'Change Case',
    );
  },
  'home.font.clear-formatting': (a) => {
    a.surface.clearFormatting();
  },
  'home.font.bold': (a) => {
    a.surface.exec('bold');
  },
  'home.font.italic': (a) => {
    a.surface.exec('italic');
  },
  'home.font.underline': (a) => {
    a.surface.exec('underline');
  },
  'home.font.strikethrough': (a) => {
    a.surface.exec('strikeThrough');
  },
  'home.font.subscript': (a) => {
    a.surface.exec('subscript');
  },
  'home.font.superscript': (a) => {
    a.surface.exec('superscript');
  },
  'home.font.highlight': (a, d) => {
    pop(
      d,
      colorPicker(
        HIGHLIGHTS,
        (c) => {
          a.surface.exec('hiliteColor', c ?? 'transparent');
        },
        'No Color',
      ),
      'Text Highlight Color',
    );
  },
  'home.font.font-color': (a, d) => {
    pop(
      d,
      colorPicker(
        PALETTE,
        (c) => {
          a.surface.exec('foreColor', c ?? '#000000');
        },
        'Automatic',
      ),
      'Font Color',
    );
  },

  // ── Home › Paragraph
  'home.paragraph.bullets': (a) => {
    a.surface.exec('insertUnorderedList');
  },
  'home.paragraph.numbering': (a) => {
    a.surface.exec('insertOrderedList');
  },
  'home.paragraph.decrease-indent': (a) => {
    a.surface.indent(-1);
  },
  'home.paragraph.increase-indent': (a) => {
    a.surface.indent(1);
  },
  'home.paragraph.sort': (a) => {
    const blocks = a.surface
      .selectedBlocks()
      .filter((b) => b.tagName === 'P' || b.tagName === 'LI');
    if (blocks.length < 2) {
      toast('Select two or more paragraphs to sort');
      return;
    }
    const texts = blocks
      .map((b) => b.innerHTML)
      .sort((x, y) => x.replace(/<[^>]+>/g, '').localeCompare(y.replace(/<[^>]+>/g, '')));
    blocks.forEach((b, i) => {
      b.innerHTML = texts[i]!;
    });
    a.surface.changed();
  },
  'home.paragraph.show-marks': (a) => {
    a.view.showMarks = !a.view.showMarks;
    a.applyView();
  },
  'home.paragraph.align-left': (a) => {
    a.surface.exec('justifyLeft');
  },
  'home.paragraph.align-center': (a) => {
    a.surface.exec('justifyCenter');
  },
  'home.paragraph.align-right': (a) => {
    a.surface.exec('justifyRight');
  },
  'home.paragraph.justify': (a) => {
    a.surface.exec('justifyFull');
  },
  'home.paragraph.line-spacing': (a, d) => {
    const vals = ['1.0', '1.15', '1.5', '2.0', '2.5', '3.0'];
    pop(
      d,
      menu([
        ...vals.map((v) => ({
          label: v,
          run: () => {
            a.surface.setBlockStyle('lineHeight', v);
          },
        })),
        'sep' as const,
        {
          label: 'Add Space Before Paragraph',
          run: () => {
            a.surface.setBlockStyle('marginTop', '12pt');
          },
        },
        {
          label: 'Remove Space After Paragraph',
          run: () => {
            a.surface.setBlockStyle('marginBottom', '0pt');
          },
        },
      ]),
      'Line and Paragraph Spacing',
    );
  },
  'home.paragraph.shading': (a, d) => {
    pop(
      d,
      colorPicker(
        PALETTE,
        (c) => {
          a.surface.setBlockStyle('backgroundColor', c ?? '');
        },
        'No Color',
      ),
      'Shading',
    );
  },
  'home.paragraph.borders': (a, d) => {
    const line = '1px solid currentColor';
    pop(
      d,
      menu([
        {
          label: 'Bottom Border',
          icon: PanelBottom,
          run: () => {
            a.surface.setBlockStyle('borderBottom', line);
          },
        },
        {
          label: 'Top Border',
          icon: PanelTop,
          run: () => {
            a.surface.setBlockStyle('borderTop', line);
          },
        },
        {
          label: 'Outside Borders',
          icon: Square,
          run: () => {
            a.surface.setBlockStyle('border', line);
            a.surface.setBlockStyle('padding', '4px 6px');
          },
        },
        {
          label: 'No Border',
          icon: SquareDashed,
          run: () => {
            a.surface.setBlockStyle('border', '');
          },
        },
        'sep',
        {
          label: 'Horizontal Line',
          icon: Minus,
          run: () => {
            a.surface.exec('insertHorizontalRule');
          },
        },
      ]),
      'Borders',
    );
  },

  // ── Home › Styles, Editing
  'home.styles.gallery': (a, d) => {
    const cur = a.surface.state().style;
    pop(
      d,
      gallery(
        STYLES.map((s) => ({
          label: s.name,
          preview: stylePreview(s.name),
          selected: s.name === cur,
          run: () => {
            a.surface.applyStyle(s.name);
          },
        })),
        4,
      ),
      'Styles',
      true,
    );
  },
  'home.editing.find': (a) => {
    a.find.open(false);
  },
  'home.editing.replace': (a) => {
    a.find.open(true);
  },
  'home.editing.select': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          run: () => {
            a.surface.exec('selectAll');
          },
        },
        {
          label: 'Select Objects (ink)',
          run: () => {
            a.setDraw(true, 'lasso');
            toast('Lasso around ink to select it');
          },
        },
      ]),
      'Select',
    );
  },

  // ── Insert
  'insert.pages.page-break': (a) => {
    a.surface.insertHTML(
      '<div class="d-page-break" contenteditable="false" data-label="Page Break"></div><p><br></p>',
    );
  },
  'insert.pages.blank-page': (a) => {
    a.surface.insertHTML(
      '<div class="d-page-break" contenteditable="false" data-label="Page Break"></div><p><br></p><div class="d-page-break" contenteditable="false" data-label="Page Break"></div><p><br></p>',
    );
  },
  'insert.tables.table': (a, d) => {
    pop(
      d,
      tableGrid((r, c) => {
        a.surface.insertTable(r, c);
      }),
      'Insert Table',
    );
  },
  'insert.tables.quick-tables': (a) => {
    a.surface.insertTable(4, 3);
  },
  'insert.illustrations.pictures': (a, d) => {
    const input = el('input', { type: 'file', accept: 'image/*', class: 'sr-only' });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) pictureFromFile(a, f);
    });
    document.body.append(input);
    pop(
      d,
      menu([
        {
          label: 'This Device…',
          detail: 'Insert a picture from a file',
          run: () => {
            input.click();
          },
        },
        {
          label: 'Sample Picture',
          detail: 'The Lucid Sentence icon',
          run: () => {
            a.surface.insertHTML(
              '<img src="./icon-256.png" alt="Lucid Sentence app icon" class="d-img" width="160">',
            );
          },
        },
      ]),
      'Pictures',
    );
  },
  'insert.links.link': (a, d) => {
    const text = a.surface.range()?.toString() ?? '';
    pop(
      d,
      form(
        [
          { name: 'text', label: 'Text to display', value: text },
          { name: 'url', label: 'Address', type: 'url', placeholder: 'https://' },
        ],
        'Insert',
        (v) => {
          const url = v['url'] ?? '';
          if (!/^(https?:|mailto:)/i.test(url)) {
            toast('Use an https:// or mailto: address');
            return;
          }
          if (text && v['text'] === text) a.surface.exec('createLink', url);
          else
            a.surface.insertHTML(
              `<a href="${url.replace(/"/g, '%22')}">${(v['text'] || url).replace(/</g, '&lt;')}</a>`,
            );
        },
      ),
      'Insert Link',
    );
  },
  'insert.comments.comment': (a) => {
    a.comments.add();
  },
  'insert.text.date-time': (a, d) => {
    const now = new Date();
    const fmts = [
      now.toLocaleDateString('en-US'),
      now.toLocaleDateString('en-US', { dateStyle: 'long' }),
      now.toLocaleDateString('en-US', { dateStyle: 'full' }),
      now.toISOString().slice(0, 10),
      now.toLocaleString('en-US'),
    ];
    pop(
      d,
      menu(
        fmts.map((f) => ({
          label: f,
          run: () => {
            a.surface.insertText(f);
          },
        })),
      ),
      'Date & Time',
    );
  },
  'insert.symbols.symbol': (a, d) => {
    const syms = [
      '©',
      '®',
      '™',
      '§',
      '¶',
      '—',
      '–',
      '…',
      '€',
      '£',
      '¥',
      '°',
      '±',
      '×',
      '÷',
      '≠',
      '≤',
      '≥',
      '→',
      '←',
      '✓',
      '•',
      'α',
      'π',
      'Ω',
    ];
    const g = el('div', { class: 'pop__symbols', role: 'listbox', 'aria-label': 'Symbols' });
    for (const s of syms) {
      const b = el(
        'button',
        { type: 'button', class: 'pop__cell pop__sym', role: 'option', 'aria-label': s },
        s,
      );
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
      });
      b.addEventListener('click', () => {
        a.surface.insertText(s);
      });
      g.append(b);
    }
    pop(d, g, 'Symbol');
  },

  // ── Draw
  'draw.drawing-tools.select': (a) => {
    a.setDraw(false);
  },
  'draw.drawing-tools.lasso': (a) => {
    a.setDraw(!(a.view.draw && a.ink.tool === 'lasso'), 'lasso');
  },
  'draw.drawing-tools.eraser': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Stroke Eraser',
          detail: 'Erase whole strokes',
          checked: a.ink.tool === 'eraser',
          run: () => {
            a.setDraw(true, 'eraser');
          },
        },
        {
          label: 'Point Eraser',
          detail: 'Erase part of a stroke',
          checked: a.ink.tool === 'point-eraser',
          run: () => {
            a.setDraw(true, 'point-eraser');
          },
        },
        'sep',
        {
          label: 'Erase All Ink on Page',
          icon: Trash,
          run: () => {
            a.ink.clear();
          },
        },
      ]),
      'Eraser',
    );
  },
  'draw.drawing-tools.pens': (a, d) => {
    const presets: { label: string; tool: InkTool; color: string; size: number }[] = [
      { label: 'Ink pen', tool: 'pen', color: '#1a1916', size: 3 },
      { label: 'Cyan pen', tool: 'pen', color: '#0a6a7c', size: 4 },
      { label: 'Red pen', tool: 'pen', color: '#c0392b', size: 3 },
      { label: 'Pencil', tool: 'pencil', color: '#404040', size: 3 },
      { label: 'Yellow highlighter', tool: 'highlighter', color: '#ffd400', size: 6 },
      { label: 'Cyan highlighter', tool: 'highlighter', color: '#45c3d6', size: 6 },
    ];
    pop(
      d,
      gallery(
        presets.map((p) => ({
          label: p.label,
          preview: el('span', {
            class: `pen-preview pen-preview--${p.tool}`,
            style: `--c:${p.color};--w:${p.size + 1}px`,
          }),
          selected: a.view.draw && a.ink.tool === p.tool && a.ink.color === p.color,
          run: () => {
            a.ink.color = p.color;
            a.ink.size = p.size;
            a.setDraw(true, p.tool);
          },
        })),
        3,
      ),
      'Pens',
    );
  },
  'draw.drawing-tools.add-pen': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Pen',
          run: () => {
            a.setDraw(true, 'pen');
            a.pen.show(true);
          },
        },
        {
          label: 'Pencil',
          run: () => {
            a.setDraw(true, 'pencil');
            a.pen.show(true);
          },
        },
        {
          label: 'Highlighter',
          run: () => {
            a.setDraw(true, 'highlighter');
            a.pen.show(true);
          },
        },
      ]),
      'Add Pen',
    );
  },
  'draw.drawing-tools.draw-with-touch': (a) => {
    a.settings.drawWithTouch = !a.settings.drawWithTouch;
    a.ink.drawWithTouch = a.settings.drawWithTouch;
    toast(
      a.settings.drawWithTouch
        ? 'Draw with Touch on: fingers draw too'
        : 'Draw with Touch off: only a pen draws; fingers scroll',
    );
    a.refresh();
  },
  'draw.replay.ink-replay': (a) => {
    a.ink.replay();
  },

  // ── Design
  'design.page-background.watermark': (a, d) => {
    pop(
      d,
      menu([
        ...['CONFIDENTIAL', 'DRAFT', 'DO NOT COPY', 'SAMPLE'].map((w) => ({
          label: w,
          checked: a.view.watermark === w,
          run: () => {
            a.view.watermark = w;
            a.applyView();
          },
        })),
        'sep' as const,
        {
          label: 'Remove Watermark',
          run: () => {
            a.view.watermark = null;
            a.applyView();
          },
        },
      ]),
      'Watermark',
    );
  },
  'design.page-background.page-color': (a, d) => {
    const wrap = el('div', {});
    wrap.append(
      colorPicker(
        ['#ffffff', '#fbf5e9', '#eef5f6', '#f4f0fa', '#fff8e1', '#eef7ee'],
        (c) => {
          a.view.pageColor = c;
          a.applyView();
        },
        'No Color (white)',
      ),
    );
    const dark = el(
      'button',
      {
        type: 'button',
        class: 'pop__item',
        role: 'menuitemcheckbox',
        'aria-checked': String(a.view.paperDark),
      },
      a.view.paperDark ? 'Dark page (view only): On' : 'Dark page (view only)',
    );
    dark.addEventListener('click', () => {
      a.view.paperDark = !a.view.paperDark;
      a.applyView();
      dark.textContent = a.view.paperDark ? 'Dark page (view only): On' : 'Dark page (view only)';
    });
    wrap.append(el('hr', { class: 'pop__sep' }), dark);
    pop(d, wrap, 'Page Color');
  },
  'design.document-formatting.paragraph-spacing': (a, d) => {
    choice(
      d,
      'Paragraph Spacing',
      [
        { label: 'Compact', value: 'compact' as const },
        { label: 'Normal', value: 'normal' as const },
        { label: 'Open', value: 'open' as const },
      ],
      a.view.spacing,
      (v) => {
        a.view.spacing = v;
        a.applyView();
      },
    );
  },

  // ── Layout
  'layout.page-setup.margins': (a, d) => {
    choice(
      d,
      'Margins',
      (Object.keys(MARGINS) as MarginPreset[]).map((k) => ({
        label: MARGINS[k].label,
        detail: MARGINS[k].detail,
        value: k,
        icon: FileText,
      })),
      a.page.margins,
      (v) => {
        a.setPage({ margins: v });
      },
    );
  },
  'layout.page-setup.orientation': (a, d) => {
    choice<Orientation>(
      d,
      'Orientation',
      [
        { label: 'Portrait', value: 'portrait', icon: RectangleVertical },
        { label: 'Landscape', value: 'landscape', icon: RectangleHorizontal },
      ],
      a.page.orientation,
      (v) => {
        a.setPage({ orientation: v });
      },
    );
  },
  'layout.page-setup.size': (a, d) => {
    choice(
      d,
      'Size',
      (Object.keys(PAPER) as PageSize[]).map((k) => ({
        label: PAPER[k].label,
        detail: PAPER[k].detail,
        value: k,
      })),
      a.page.size,
      (v) => {
        a.setPage({ size: v });
      },
    );
  },
  'layout.page-setup.columns': (a, d) => {
    choice(
      d,
      'Columns',
      [
        { label: 'One', value: 1, icon: RectangleVertical },
        { label: 'Two', value: 2, icon: Columns2 },
        { label: 'Three', value: 3, icon: Columns2 },
      ],
      a.view.columns,
      (v) => {
        a.view.columns = v;
        a.applyView();
      },
    );
  },
  'layout.page-setup.breaks': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Page',
          detail: 'Start the next page here',
          run: () => {
            handlers['insert.pages.page-break']!(a, d);
          },
        },
      ]),
      'Breaks',
    );
  },
  'layout.page-setup.hyphenation': (a, d) => {
    choice(
      d,
      'Hyphenation',
      [
        { label: 'None', value: false },
        { label: 'Automatic', value: true },
      ],
      a.view.hyphenate,
      (v) => {
        a.view.hyphenate = v;
        a.applyView();
      },
    );
  },
  'layout.paragraph.indent-left': (a, d) => {
    blockChoices(a, d, 'Indent Left', 'marginLeft', indentValues);
  },
  'layout.paragraph.indent-right': (a, d) => {
    blockChoices(a, d, 'Indent Right', 'marginRight', indentValues);
  },
  'layout.paragraph.spacing-before': (a, d) => {
    blockChoices(a, d, 'Spacing Before', 'marginTop', spacingValues);
  },
  'layout.paragraph.spacing-after': (a, d) => {
    blockChoices(a, d, 'Spacing After', 'marginBottom', spacingValues);
  },

  // ── Review
  'review.proofing.spelling-grammar': (a) => {
    const on = (a.surface.root.spellcheck = !a.surface.root.spellcheck);
    toast(on ? 'Spelling marks on (browser spell checker)' : 'Spelling marks off');
    a.refresh();
  },
  'review.proofing.word-count': (a, d) => {
    const t = a.surface.text();
    const words = (t.match(/\S+/g) ?? []).length;
    const rows: [string, string][] = [
      ['Pages', a.surface.root.closest('.page')?.getAttribute('data-pages') ?? '1'],
      ['Words', String(words)],
      ['Characters (no spaces)', String(t.replace(/\s/g, '').length)],
      ['Characters (with spaces)', String(t.replace(/\n/g, '').length)],
      ['Paragraphs', String(a.surface.root.querySelectorAll('p,h1,h2,h3,h4,li,blockquote').length)],
    ];
    pop(
      d,
      el(
        'dl',
        { class: 'pop__stats' },
        ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]),
      ),
      'Word Count',
    );
  },
  'review.speech.read-aloud': (a) => {
    if (!('speechSynthesis' in window)) {
      toast('Read Aloud needs speech support in this browser');
      return;
    }
    if (a.view.readAloud) {
      speechSynthesis.cancel();
      a.view.readAloud = false;
      a.refresh();
      return;
    }
    const r = a.surface.range();
    const text = r && !r.collapsed ? r.toString() : a.surface.text();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = a.language;
    u.onend = () => {
      a.view.readAloud = false;
      a.refresh();
    };
    a.view.readAloud = true;
    speechSynthesis.speak(u);
    a.refresh();
  },
  'review.accessibility.check-accessibility': (a, d) => {
    const root = a.surface.root;
    const issues: string[] = [];
    root.querySelectorAll('img').forEach((img) => {
      if (!img.alt.trim()) issues.push('A picture has no alt text.');
    });
    root.querySelectorAll('table').forEach((t) => {
      if (!t.querySelector('th')) issues.push('A table has no header row.');
    });
    let last = 1;
    root.querySelectorAll('h1,h2,h3,h4').forEach((h) => {
      const n = Number(h.tagName[1]);
      if (n > last + 1) issues.push(`Heading “${h.textContent.trim()}” skips a level.`);
      last = n;
    });
    root.querySelectorAll('a').forEach((l) => {
      if (/^(click here|here|link)$/i.test(l.textContent.trim()))
        issues.push('A link has unclear text.');
    });
    pop(
      d,
      el(
        'div',
        { class: 'pop__report' },
        el(
          'div',
          { class: 'pop__heading' },
          issues.length
            ? `${issues.length} issue${issues.length > 1 ? 's' : ''}`
            : 'No issues found',
        ),
        ...issues.map((i) => el('p', {}, i)),
      ),
      'Accessibility',
    );
  },
  'review.language.language': (a, d) => {
    const langs = [
      ['en-US', 'English (US)'],
      ['en-GB', 'English (UK)'],
      ['es-ES', 'Spanish'],
      ['fr-FR', 'French'],
      ['de-DE', 'German'],
      ['ar', 'Arabic (right to left)'],
      ['he', 'Hebrew (right to left)'],
    ] as const;
    choice(
      d,
      'Language',
      langs.map(([v, l]) => ({ label: l, value: v })),
      a.language,
      (v) => {
        a.setLanguage(v);
      },
    );
  },
  'review.comments.new-comment': (a) => {
    a.comments.add();
  },
  'review.comments.delete': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Delete',
          run: () => {
            a.comments.remove();
          },
        },
        {
          label: 'Delete All Comments',
          run: () => {
            for (const c of [...a.comments.list]) a.comments.remove(c.id);
          },
        },
      ]),
      'Delete',
    );
  },
  'review.comments.previous': (a) => {
    a.comments.step(-1);
  },
  'review.comments.next': (a) => {
    a.comments.step(1);
  },
  'review.comments.show-comments': (a) => {
    a.comments.toggle();
    a.refresh();
  },
  'review.ink.hide-ink': (a) => {
    a.ink.svg.classList.toggle('ink--hidden');
    a.refresh();
  },

  // ── View
  'view.views.read-mode': (a) => {
    a.view.read = !a.view.read;
    a.view.web = false;
    a.applyView();
  },
  'view.views.print-layout': (a) => {
    a.view.read = false;
    a.view.web = false;
    a.applyView();
  },
  'view.views.web-layout': (a) => {
    a.view.web = true;
    a.view.read = false;
    a.applyView();
  },
  'view.immersive.focus': (a) => {
    a.view.focus = !a.view.focus;
    a.applyView();
    if (a.view.focus) toast('Focus: press Esc to exit');
  },
  'view.page-movement.vertical': (a) => {
    a.refresh();
  },
  'view.show.ruler': (a) => {
    a.view.ruler = !a.view.ruler;
    a.applyView();
  },
  'view.show.gridlines': (a) => {
    a.view.gridlines = !a.view.gridlines;
    a.applyView();
  },
  'view.show.navigation-pane': (a) => {
    a.view.navPane = !a.view.navPane;
    a.applyView();
  },
  'view.zoom.zoom': (a, d) => {
    choice(
      d,
      'Zoom',
      [200, 150, 125, 100, 75, 50]
        .map((z): { label: string; value: number | 'fit' | 'page' } => ({
          label: `${z}%`,
          value: z,
        }))
        .concat([
          { label: 'Page Width', value: 'fit' },
          { label: 'One Page', value: 'page' },
        ]),
      a.view.zoomFit ? 'fit' : a.view.zoom,
      (v) => {
        a.setZoom(v);
      },
    );
  },
  'view.zoom.zoom-100': (a) => {
    a.setZoom(100);
  },
  'view.zoom.page-width': (a) => {
    a.setZoom('fit');
  },
  'view.zoom.one-page': (a) => {
    a.setZoom('page');
  },
  'view.window.new-window': () => {
    window.open(location.href, '_blank', 'noopener');
  },
  'view.properties.properties': (a) => {
    a.openBackstage('file.rail.info');
  },

  // ── Help
  'help.help.help': (_a, d) => {
    const rows = [
      ['Search commands', 'Alt+Q'],
      ['Bold / Italic / Underline', 'Ctrl+B / I / U'],
      ['Undo / Redo', 'Ctrl+Z / Ctrl+Y'],
      ['Find / Replace', 'Ctrl+F / Ctrl+H'],
      ['Insert link', 'Ctrl+K'],
      ['Collapse the ribbon', 'Ctrl+F1'],
      ['Save draft', 'Ctrl+S'],
      ['Print', 'Ctrl+P'],
    ];
    pop(
      d,
      el(
        'dl',
        { class: 'pop__stats' },
        ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, el('kbd', {}, v))]),
      ),
      'Keyboard shortcuts',
    );
  },
  'help.help.feedback': () => {
    window.open(
      'https://github.com/DoctorNurse/Lucid-Sentence/issues/new',
      '_blank',
      'noopener,noreferrer',
    );
  },
  'help.help.contact-support': () => {
    window.open(
      'https://github.com/DoctorNurse/Lucid-Sentence/issues',
      '_blank',
      'noopener,noreferrer',
    );
  },
  'help.help.whats-new': (_a, d) => {
    pop(
      d,
      el(
        'div',
        { class: 'pop__report' },
        el('div', { class: 'pop__heading' }, 'What’s new in this preview'),
        ...[
          'Real icons (Lucide) across all ribbon commands',
          'A working preview editor with styles, lists, tables, comments, and find',
          'Draw tab and Notes mode with pressure-sensitive ink',
          'Command search: Alt+Q',
        ].map((t) => el('p', {}, t)),
      ),
      'What’s New',
    );
  },

  // ── Contextual: table
  'table-layout.rows-columns.insert-above': (a) => {
    a.surface.tableOp('row-above');
  },
  'table-layout.rows-columns.insert-below': (a) => {
    a.surface.tableOp('row-below');
  },
  'table-layout.rows-columns.insert-left': (a) => {
    a.surface.tableOp('col-left');
  },
  'table-layout.rows-columns.insert-right': (a) => {
    a.surface.tableOp('col-right');
  },
  'table-layout.rows-columns.delete': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Delete Rows',
          run: () => {
            a.surface.tableOp('del-row');
          },
        },
        {
          label: 'Delete Columns',
          run: () => {
            a.surface.tableOp('del-col');
          },
        },
        {
          label: 'Delete Table',
          icon: Table,
          run: () => {
            a.surface.tableOp('del-table');
          },
        },
      ]),
      'Delete',
    );
  },
  'table-layout.table.select': (a, d) => {
    const sel = (n: Node | null | undefined): void => {
      if (!n) return;
      const r = document.createRange();
      r.selectNodeContents(n);
      const s = document.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    };
    pop(
      d,
      menu([
        {
          label: 'Select Cell',
          run: () => {
            sel(a.surface.cell());
          },
        },
        {
          label: 'Select Row',
          run: () => {
            sel(a.surface.cell()?.parentElement);
          },
        },
        {
          label: 'Select Table',
          run: () => {
            sel(a.surface.cell()?.closest('table'));
          },
        },
      ]),
      'Select',
    );
  },
  'table-layout.table.view-gridlines': (a) => {
    a.view.gridlines = !a.view.gridlines;
    a.applyView();
  },
  'table-layout.alignment.cell-align': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Top',
          icon: ArrowUpToLine,
          run: () => {
            const c = a.surface.cell();
            if (c) c.style.verticalAlign = 'top';
          },
        },
        {
          label: 'Center',
          icon: AlignCenterHorizontal,
          run: () => {
            const c = a.surface.cell();
            if (c) c.style.verticalAlign = 'middle';
          },
        },
        {
          label: 'Bottom',
          icon: ArrowDownToLine,
          run: () => {
            const c = a.surface.cell();
            if (c) c.style.verticalAlign = 'bottom';
          },
        },
      ]),
      'Cell Alignment',
    );
  },
  'table-design.style-options.header-row': (a) => {
    a.view.headerRow = !a.view.headerRow;
    a.applyView();
  },
  'table-design.style-options.banded-rows': (a) => {
    a.view.bandedRows = !a.view.bandedRows;
    a.applyView();
  },
  'table-design.style-options.first-column': (a) => {
    a.view.firstColumn = !a.view.firstColumn;
    a.applyView();
  },
  'table-design.table-styles.gallery': (a, d) => {
    const styles = [
      ['plain', 'Plain'],
      ['grid', 'Grid'],
      ['cyan', 'Lucid Cyan'],
      ['minimal', 'Minimal'],
    ] as const;
    pop(
      d,
      gallery(
        styles.map(([k, l]) => ({
          label: l,
          preview: el(
            'span',
            { class: `tbl-preview tbl-preview--${k}` },
            ...Array.from({ length: 9 }, () => el('i')),
          ),
          run: () => {
            const t = a.surface.cell()?.closest('table');
            if (t) {
              t.dataset['style'] = k;
              a.surface.changed();
            }
          },
        })),
        4,
      ),
      'Table Styles',
      true,
    );
  },
  'table-design.table-styles.shading': (a, d) => {
    pop(
      d,
      colorPicker(
        PALETTE,
        (c) => {
          const cell = a.surface.cell();
          if (cell) cell.style.backgroundColor = c ?? '';
        },
        'No Color',
      ),
      'Shading',
    );
  },

  // ── Contextual: picture
  'picture-format.accessibility.alt-text': (a, d) => {
    const img = a.surface.selectedImage;
    if (!img) return;
    pop(
      d,
      form(
        [{ name: 'alt', label: 'Alt text (describe the picture)', value: img.alt }],
        'Save',
        (v) => {
          img.alt = v['alt'] ?? '';
          a.surface.changed();
        },
      ),
      'Alt Text',
    );
  },
  'picture-format.adjust.reset': (a) => {
    const img = a.surface.selectedImage;
    if (img) {
      img.removeAttribute('style');
      img.removeAttribute('data-style');
      a.surface.changed();
    }
  },
  'picture-format.picture-styles.gallery': (a, d) => {
    const img = a.surface.selectedImage;
    if (!img) return;
    const styles = [
      ['plain', 'Simple'],
      ['rounded', 'Rounded'],
      ['shadow', 'Drop Shadow'],
      ['frame', 'Frame'],
    ] as const;
    pop(
      d,
      gallery(
        styles.map(([k, l]) => ({
          label: l,
          preview: el('span', { class: `img-preview img-preview--${k}` }),
          run: () => {
            img.dataset['style'] = k;
            a.surface.changed();
          },
        })),
        4,
      ),
      'Picture Styles',
      true,
    );
  },
  'picture-format.arrange.wrap-text': (a, d) => {
    const img = a.surface.selectedImage;
    if (!img) return;
    choice(
      d,
      'Wrap Text',
      [
        { label: 'In Line with Text', value: 'inline' },
        { label: 'Square, left', value: 'left' },
        { label: 'Square, right', value: 'right' },
      ],
      img.dataset['wrap'] ?? 'inline',
      (v) => {
        img.dataset['wrap'] = v;
        a.surface.changed();
      },
    );
  },
  'picture-format.size.width': (a, d) => {
    const img = a.surface.selectedImage;
    if (!img) return;
    choice(
      d,
      'Width',
      [25, 50, 75, 100].map((p) => ({ label: `${p}% of text width`, value: p })),
      undefined,
      (v) => {
        img.style.width = `${v}%`;
        img.style.height = 'auto';
        a.surface.changed();
      },
    );
  },
  'picture-format.size.height': (a, d) => {
    handlers['picture-format.size.width']!(a, d);
  },
  'picture-format.adjust.change-picture': (a, d) => {
    a.surface.selectedImage?.remove();
    handlers['insert.illustrations.pictures']!(a, d);
  },

  // ── File
  'file.rail.home': (a) => {
    a.openBackstage('file.rail.home');
  },
  'file.rail.new': (a) => {
    a.openBackstage('file.rail.new');
  },
  'file.rail.open': (a) => {
    a.openBackstage('file.rail.open');
  },
  'file.rail.info': (a) => {
    a.openBackstage('file.rail.info');
  },
  'file.rail.save': (a) => {
    a.save();
  },
  'file.rail.save-as': (a) => {
    a.openBackstage('file.rail.save-as');
  },
  'file.rail.print': (a) => {
    a.openBackstage('file.rail.print');
  },
  'file.rail.share': (a) => {
    a.openBackstage('file.rail.share');
  },
  'file.rail.export': (a) => {
    a.openBackstage('file.rail.export');
  },
  'file.rail.close': (a) => {
    a.openBackstage('file.rail.new');
  },
  'file.settings.account': (a) => {
    a.openBackstage('file.settings.account');
  },
  'file.settings.options': (a) => {
    a.openBackstage('file.settings.options');
  },
};

/** Ids the demo can run today. */
export const WIRED: ReadonlySet<string> = new Set(Object.keys(handlers));
