/**
 * Ribbon commands mapped onto the ONLYOFFICE engine (sdkjs asc_docs_api).
 * While a .docx is open in the engine, only the ids in ENGINE_WIRED run; the
 * rest say honestly that they aren't connected to the engine yet. The map
 * grows one command at a time (docs/PLAN.md, M1).
 */
import type { CommandEventDetail } from '@lucid-sentence/ribbon-ui';
import { gallery, el, menu, openPopover, tableGrid, type MenuEntry } from '../editor/ui.js';
import type { DocEngine } from './engine.js';

export interface EngineApp {
  engine: DocEngine;
  save: () => void;
  saveAs: () => void;
  /** Ask for picture files (native picker, File System Access, or <input>). */
  insertPictures: () => void;
  print: () => void;
  toast: (msg: string) => void;
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

const call =
  (fn: (api: Parameters<Parameters<DocEngine['run']>[0]>[0]) => void): Handler =>
  (a) => {
    a.engine.run(fn);
  };

/** Header or footer editing, from the Insert tab or the Header & Footer tab. */
const editHeader =
  (footer: boolean): Handler =>
  (a) => {
    const page = Math.max(0, a.engine.state.page - 1);
    a.engine.run((api) => {
      if (footer) api.GoToFooter(page);
      else api.GoToHeader(page);
    });
  };

const PAGE_NUMBER_SPOTS: { label: string; where: number; align: number }[] = [
  { label: 'Top of Page, Left', where: 1, align: 1 },
  { label: 'Top of Page, Center', where: 1, align: 2 },
  { label: 'Top of Page, Right', where: 1, align: 0 },
  { label: 'Bottom of Page, Left', where: 2, align: 1 },
  { label: 'Bottom of Page, Center', where: 2, align: 2 },
  { label: 'Bottom of Page, Right', where: 2, align: 0 },
  { label: 'Current Position', where: -1, align: 0 },
];
const pageNumber: Handler = (a, d) => {
  pop(
    d,
    menu(
      PAGE_NUMBER_SPOTS.map((p) => ({
        label: p.label,
        run: () => {
          a.engine.run((api) => {
            api.put_PageNum(p.where, p.align);
          });
        },
      })),
    ),
    'Page Number',
  );
};

/** Suggestions and actions for the misspelled word at the cursor. */
export function spellingEntries(a: EngineApp): MenuEntry[] {
  const sp = a.engine.state.spell;
  if (!sp) return [];
  const out: MenuEntry[] = [{ heading: `“${sp.word}”` }];
  if (sp.variants === null)
    out.push({ label: 'Looking for suggestions…', disabled: true, run: () => {} });
  else if (sp.variants.length === 0)
    out.push({ label: 'No suggestions', disabled: true, run: () => {} });
  for (const v of (sp.variants ?? []).slice(0, 6)) {
    out.push({
      label: v,
      run: () => {
        a.engine.replaceMisspelling(v);
      },
    });
  }
  out.push(
    {
      label: 'Ignore',
      run: () => {
        a.engine.ignoreMisspelling(false);
      },
    },
    {
      label: 'Ignore All',
      run: () => {
        a.engine.ignoreMisspelling(true);
      },
    },
  );
  return out;
}

const spelling: Handler = (a, d) => {
  const word = a.engine.nextMisspelling();
  if (word === null) {
    a.toast('Spelling check complete. No misspellings found.');
    return;
  }
  const show = (): void => {
    const entries: MenuEntry[] = [
      ...spellingEntries(a),
      'sep',
      {
        label: 'Next Misspelling',
        shortcut: 'F7',
        run: () => {
          spelling(a, d);
        },
      },
    ];
    pop(d, menu(entries), 'Spelling');
  };
  show();
  // Suggestions arrive from the spell worker shortly after the word is selected.
  if (a.engine.state.spell?.variants === null) {
    const again = (): void => {
      if (a.engine.state.spell?.word === word && a.engine.state.spell.variants !== null) {
        a.engine.removeEventListener('state', again);
        show();
      }
    };
    a.engine.addEventListener('state', again);
    setTimeout(() => {
      a.engine.removeEventListener('state', again);
    }, 3000);
  }
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
  'insert.tables.table': (a, d) => {
    pop(
      d,
      tableGrid((rows, cols) => {
        a.engine.run((api) => {
          api.put_Table(cols, rows);
        });
      }),
      'Insert Table',
    );
  },
  'insert.illustrations.pictures': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'This Device…',
          detail: 'PNG, JPEG, GIF, BMP, or WebP',
          run: () => {
            a.insertPictures();
          },
        },
      ]),
      'Insert Picture',
    );
  },
  'insert.header-footer.header': editHeader(false),
  'insert.header-footer.footer': editHeader(true),
  'insert.header-footer.page-number': pageNumber,

  // Table Layout (contextual)
  'table-layout.rows-columns.insert-above': call((api) => {
    api.addRowAbove(1);
  }),
  'table-layout.rows-columns.insert-below': call((api) => {
    api.addRowBelow(1);
  }),
  'table-layout.rows-columns.insert-left': call((api) => {
    api.addColumnLeft(1);
  }),
  'table-layout.rows-columns.insert-right': call((api) => {
    api.addColumnRight(1);
  }),
  'table-layout.rows-columns.delete': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Delete Rows',
          run: () => {
            a.engine.run((api) => {
              api.remRow();
            });
          },
        },
        {
          label: 'Delete Columns',
          run: () => {
            a.engine.run((api) => {
              api.remColumn();
            });
          },
        },
        {
          label: 'Delete Table',
          run: () => {
            a.engine.run((api) => {
              api.remTable();
            });
          },
        },
      ]),
      'Delete',
    );
  },
  'table-layout.merge.merge-cells': call((api) => {
    api.MergeCells();
  }),
  'table-layout.merge.split-cells': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Split into 2 Columns',
          run: () => {
            a.engine.run((api) => {
              api.SplitCell(2, 1);
            });
          },
        },
        {
          label: 'Split into 3 Columns',
          run: () => {
            a.engine.run((api) => {
              api.SplitCell(3, 1);
            });
          },
        },
        {
          label: 'Split into 2 Rows',
          run: () => {
            a.engine.run((api) => {
              api.SplitCell(1, 2);
            });
          },
        },
      ]),
      'Split Cells',
    );
  },
  'table-layout.table.select': (a, d) => {
    pop(
      d,
      menu([
        {
          label: 'Select Cell',
          run: () => {
            a.engine.run((api) => {
              api.selectCell();
            });
          },
        },
        {
          label: 'Select Column',
          run: () => {
            a.engine.run((api) => {
              api.selectColumn();
            });
          },
        },
        {
          label: 'Select Row',
          run: () => {
            a.engine.run((api) => {
              api.selectRow();
            });
          },
        },
        {
          label: 'Select Table',
          run: () => {
            a.engine.run((api) => {
              api.selectTable();
            });
          },
        },
      ]),
      'Select',
    );
  },

  // Header & Footer (contextual)
  'header-footer.header-footer.header': editHeader(false),
  'header-footer.header-footer.footer': editHeader(true),
  'header-footer.header-footer.page-number': pageNumber,
  'header-footer.navigation.go-to-header': editHeader(false),
  'header-footer.navigation.go-to-footer': editHeader(true),
  'header-footer.insert.pictures': (a) => {
    a.insertPictures();
  },
  'header-footer.close.close': (a) => {
    a.engine.closeHeaderFooter();
  },

  // Review › Proofing
  'review.proofing.spelling-grammar': spelling,

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
  'file.rail.print': (a) => {
    a.print();
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
