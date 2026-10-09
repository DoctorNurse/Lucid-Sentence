/**
 * Ribbon commands mapped onto the ONLYOFFICE engine (sdkjs asc_docs_api).
 * While a .docx is open in the engine, only the ids in ENGINE_WIRED run; the
 * rest say honestly that they aren't connected to the engine yet. The map
 * grows one command at a time (docs/PLAN.md, M1).
 */
import type { CommandEventDetail } from '@lucid-sentence/ribbon-ui';
import { gallery, el, menu, openPopover } from '../editor/ui.js';
import type { DocEngine } from './engine.js';

export interface EngineApp {
  engine: DocEngine;
  save: () => void;
  saveAs: () => void;
}

type Handler = (a: EngineApp, d: CommandEventDetail) => void;

/** Fonts that render on every device: the engine bundles a metric-compatible
 * face for each (Calibri → Carlito, Cambria → Caladea, Arial → Liberation Sans,
 * Times New Roman → Liberation Serif, Courier New → Liberation Mono), and the
 * saved file keeps the name the user picked. */
export const ENGINE_FONTS = [
  'Calibri',
  'Cambria',
  'Arial',
  'Times New Roman',
  'Courier New',
  'Carlito',
  'Caladea',
  'Liberation Sans',
  'Liberation Serif',
  'Liberation Mono',
  'Open Sans',
  'DejaVu Sans',
];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
/** Word's Quick Styles order; the gallery shows the ones the document defines. */
const QUICK_STYLES = [
  'Normal',
  'No Spacing',
  'Heading 1',
  'Heading 2',
  'Heading 3',
  'Heading 4',
  'Title',
  'Subtitle',
  'Quote',
  'Intense Quote',
  'List Paragraph',
  'List Bullet',
  'List Number',
  'Caption',
];

function pop(d: CommandEventDetail, content: HTMLElement, label: string, wide = false): void {
  openPopover(d.anchor, content, { label, focus: !d.anchor, role: 'dialog', wide });
}

const toggle =
  (
    key: 'bold' | 'italic' | 'underline' | 'strike',
    call: 'put_TextPrBold' | 'put_TextPrItalic' | 'put_TextPrUnderline' | 'put_TextPrStrikeout',
  ): Handler =>
  (a) => {
    const on = !a.engine.state[key];
    a.engine.run((api) => {
      api[call](on);
    });
  };

const align =
  (v: number): Handler =>
  (a) => {
    a.engine.run((api) => {
      api.put_PrAlign(v);
    });
  };

export const engineHandlers: Record<string, Handler> = {
  // Home › Clipboard
  'home.clipboard.cut': (a) => {
    a.engine.run((api) => {
      api.Cut();
    });
  },
  'home.clipboard.copy': (a) => {
    a.engine.run((api) => {
      api.Copy();
    });
  },

  // Home › Font
  'home.font.font': (a, d) => {
    const cur = a.engine.state.font;
    pop(
      d,
      menu(
        ENGINE_FONTS.map((f) => ({
          label: f,
          checked: f === cur,
          run: () => {
            a.engine.run((api) => {
              api.put_TextPrFontName(f);
            });
          },
        })),
      ),
      'Font',
    );
  },
  'home.font.size': (a, d) => {
    const cur = a.engine.state.size;
    pop(
      d,
      menu(
        SIZES.map((s) => ({
          label: String(s),
          checked: String(s) === cur,
          run: () => {
            a.engine.run((api) => {
              api.put_TextPrFontSize(s);
            });
          },
        })),
      ),
      'Font Size',
    );
  },
  'home.font.grow': (a) => {
    a.engine.run((api) => {
      api.FontSizeIn();
    });
  },
  'home.font.shrink': (a) => {
    a.engine.run((api) => {
      api.FontSizeOut();
    });
  },
  'home.font.clear-formatting': (a) => {
    a.engine.run((api) => {
      api.ClearFormating();
    });
  },
  'home.font.bold': toggle('bold', 'put_TextPrBold'),
  'home.font.italic': toggle('italic', 'put_TextPrItalic'),
  'home.font.underline': toggle('underline', 'put_TextPrUnderline'),
  'home.font.strikethrough': toggle('strike', 'put_TextPrStrikeout'),
  'home.font.subscript': (a) => {
    const v = a.engine.state.sub ? 0 : 1;
    a.engine.run((api) => {
      api.put_TextPrBaseline(v);
    });
  },
  'home.font.superscript': (a) => {
    const v = a.engine.state.sup ? 0 : 2;
    a.engine.run((api) => {
      api.put_TextPrBaseline(v);
    });
  },

  // Home › Paragraph
  'home.paragraph.bullets': (a) => {
    const off = a.engine.state.list === 'bullet';
    a.engine.run((api) => {
      api.put_ListType(0, off ? -1 : 1);
    });
  },
  'home.paragraph.numbering': (a) => {
    const off = a.engine.state.list === 'number';
    a.engine.run((api) => {
      api.put_ListType(1, off ? -1 : 1);
    });
  },
  'home.paragraph.increase-indent': (a) => {
    a.engine.run((api) => {
      api.IncreaseIndent();
    });
  },
  'home.paragraph.decrease-indent': (a) => {
    a.engine.run((api) => {
      api.DecreaseIndent();
    });
  },
  'home.paragraph.align-left': align(1),
  'home.paragraph.align-center': align(2),
  'home.paragraph.align-right': align(0),
  'home.paragraph.justify': align(3),
  'home.paragraph.show-marks': (a) => {
    const on = !a.engine.state.showMarks;
    a.engine.state.showMarks = on;
    a.engine.run((api) => {
      api.put_ShowParaMarks(on);
    });
  },

  // Home › Styles, Editing
  'home.styles.gallery': (a, d) => {
    const defined = new Set(a.engine.styleNames().map((s) => s.toLowerCase()));
    const names = QUICK_STYLES.filter(
      (s) => s === 'Normal' || defined.has(s.toLowerCase()) || /^Heading [12]$|^Title$/.test(s),
    );
    const cur = a.engine.state.style;
    pop(
      d,
      gallery(
        names.map((s) => ({
          label: s,
          preview: el(
            'div',
            { class: `engine-style engine-style--${s.toLowerCase().replace(/\s+/g, '-')}` },
            s,
          ),
          selected: s.toLowerCase() === cur.toLowerCase(),
          run: () => {
            a.engine.run((api) => {
              api.put_Style(s);
            });
          },
        })),
        4,
      ),
      'Styles',
      true,
    );
  },
  'home.editing.select': (a) => {
    a.engine.run((api) => {
      api.asc_EditSelectAll();
    });
  },

  // Insert
  'insert.pages.page-break': (a) => {
    a.engine.run((api) => {
      api.put_AddPageBreak();
    });
  },

  // View › Zoom
  'view.zoom.zoom-100': (a) => {
    a.engine.run((api) => {
      api.zoom(100);
    });
  },
  'view.zoom.one-page': (a) => {
    a.engine.run((api) => {
      api.zoomFitToPage();
    });
  },
  'view.zoom.page-width': (a) => {
    a.engine.run((api) => {
      api.zoomFitToWidth();
    });
  },

  // File
  'file.rail.save': (a) => {
    a.save();
  },
  'file.rail.save-as': (a) => {
    a.saveAs();
  },
};

export const ENGINE_WIRED: ReadonlySet<string> = new Set(Object.keys(engineHandlers));

/**
 * App-level commands that keep working in engine mode because they don't
 * touch the document: the File backstage, Help, and the command palette.
 */
export function appLevel(id: string): boolean {
  return id.startsWith('file.') || id.startsWith('help.');
}

/** Pressed toggles for the ribbon, from the engine's selection state. */
export function enginePressed(e: DocEngine): Set<string> {
  const s = e.state;
  const p = new Set<string>();
  const on = (id: string, v: boolean): void => {
    if (v) p.add(id);
  };
  on('home.font.bold', s.bold);
  on('home.font.italic', s.italic);
  on('home.font.underline', s.underline);
  on('home.font.strikethrough', s.strike);
  on('home.font.subscript', s.sub);
  on('home.font.superscript', s.sup);
  on('home.paragraph.bullets', s.list === 'bullet');
  on('home.paragraph.numbering', s.list === 'number');
  on('home.paragraph.align-left', s.align === 'left');
  on('home.paragraph.align-center', s.align === 'center');
  on('home.paragraph.align-right', s.align === 'right');
  on('home.paragraph.justify', s.align === 'justify');
  on('home.paragraph.show-marks', s.showMarks);
  return p;
}
