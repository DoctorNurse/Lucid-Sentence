/**
 * The slice of sdkjs's public editor API (asc_docs_api) that Lucid Sentence
 * calls. Names are sdkjs's own; see ONLYOFFICE sdkjs word/api.js.
 */
export interface SdkApi {
  asc_registerCallback(name: string, fn: (...args: never[]) => void): void;
  put_TextPrBold(v: boolean): void;
  put_TextPrItalic(v: boolean): void;
  put_TextPrUnderline(v: boolean): void;
  put_TextPrStrikeout(v: boolean): void;
  /** 0 baseline, 1 subscript, 2 superscript */
  put_TextPrBaseline(v: number): void;
  put_TextPrFontName(name: string): void;
  put_TextPrFontSize(size: number): void;
  FontSizeIn(): void;
  FontSizeOut(): void;
  ClearFormating(): void;
  put_Style(name: string): void;
  /** type 0 bullets, 1 numbering; subtype -1 removes the list */
  put_ListType(type: number, subtype: number): void;
  /** 0 right, 1 left, 2 center, 3 justify */
  put_PrAlign(v: number): void;
  IncreaseIndent(): void;
  DecreaseIndent(): void;
  put_ShowParaMarks(v: boolean): void;
  get_ShowParaMarks(): boolean;
  put_AddPageBreak(): void;
  asc_AddFootnote(text?: string): void;
  asc_AddEndnote(text?: string): void;
  asc_AddParagraphToTOC(level: number): void;
  asc_showComments(resolved: boolean): void;
  asc_hideComments(): void;
  Undo(): void;
  Redo(): void;
  Copy(): void;
  Cut(): void;
  asc_EditSelectAll(): void;
  zoom(pct: number): void;
  zoomFitToWidth(): void;
  zoomFitToPage(): void;
  isDocumentModified(): boolean;
  asc_enableKeyEvents(on: boolean): void;
  Resize(): void;
  // Tables
  put_Table(cols: number, rows: number, styleId?: string): void;
  addRowAbove(count?: number): void;
  addRowBelow(count?: number): void;
  addColumnLeft(count?: number): void;
  addColumnRight(count?: number): void;
  remRow(): void;
  remColumn(): void;
  remTable(): void;
  MergeCells(): void;
  SplitCell(cols: number, rows: number): void;
  selectRow(): void;
  selectColumn(): void;
  selectCell(): void;
  selectTable(): void;
  // Headers and footers
  GoToHeader(page: number): void;
  GoToFooter(page: number): void;
  /** where: 1 header, 2 footer, -1 at the cursor; align: 0 right, 1 left, 2 center */
  put_PageNum(where: number, align: number): void;
  HeadersAndFooters_DifferentFirstPage(on: boolean): void;
  HeadersAndFooters_DifferentOddandEvenPage(on: boolean): void;
  // Spelling
  asc_setSpellCheck(on: boolean): void;
  asc_replaceMisspelledWord(word: string, prop: SdkSpellCheck): void;
  asc_ignoreMisspelledWord(prop: SdkSpellCheck, all: boolean): void;
  /** true re-reads the selection (Document_UpdateInterfaceState) first. */
  getSelectedElements(update?: boolean): SdkSelectedObject[];
}

/** asc_CSelectedObject: what the cursor is in (paragraph, table, picture, misspelled word, ...). */
export interface SdkSelectedObject {
  get_ObjectType(): number;
  get_ObjectValue(): unknown;
}

export interface SdkSpellCheck {
  get_Word(): string;
  get_Checked(): boolean;
  get_Variants(): string[] | null;
}

/** Asc.c_oAscTypeSelectElement */
export const SelectElement = {
  Paragraph: 0,
  Table: 1,
  Image: 2,
  Header: 3,
  Hyperlink: 4,
  SpellCheck: 5,
  Shape: 6,
  Chart: 8,
  Math: 9,
} as const;

export interface SdkBridge {
  version: number;
  getBinary(api: SdkApi): Uint8Array;
  mediaNames(): string[];
  listType(api: SdkApi): 'bullet' | 'number' | null;
  markSaved(api: SdkApi): void;
  paragraphs(api: SdkApi): { text: string; style: string; table?: boolean }[];
  styleNames(api: SdkApi): string[];
  nextMisspelling(api: SdkApi): string | null;
  misspellingCount(api: SdkApi): number;
  insertImages(api: SdkApi, images: { name: string; url: string }[]): void;
  pdfData(api: SdkApi): Uint8Array;
  closeHeaderFooter(api: SdkApi): void;
  // References
  insertToc(api: SdkApi, style: number, levels?: number): void;
  hasToc(api: SdkApi): boolean;
  updateToc(api: SdkApi, pageNumbersOnly?: boolean): boolean;
  removeToc(api: SdkApi): boolean;
  gotoNote(api: SdkApi, endnote: boolean, next: boolean): boolean;
  noteCounts(api: SdkApi): { footnotes: number; endnotes: number };
  insertCaption(api: SdkApi, label: string, below: boolean, excludeLabel?: boolean): void;
  insertTableOfFigures(api: SdkApi, label: string): void;
  updateTablesOfFigures(api: SdkApi): boolean;
  crossRefTargets(api: SdkApi, kind: string): string[];
  insertCrossRef(api: SdkApi, kind: string, index: number, what: string): boolean;
  // Review
  commentList(api: SdkApi): EngineComment[];
  addComment(api: SdkApi, text: string, author: string): string | null;
  replyComment(api: SdkApi, id: string, text: string, author: string): boolean;
  resolveComment(api: SdkApi, id: string, solved: boolean): boolean;
  removeComment(api: SdkApi, id: string): void;
  removeAllComments(api: SdkApi): void;
  gotoComment(api: SdkApi, next: boolean, id?: string): string | null;
  currentComment(api: SdkApi): string | null;
  setAuthor(api: SdkApi, name: string): void;
  setTrack(api: SdkApi, on: boolean): void;
  isTrack(api: SdkApi): boolean;
  setDisplayMode(api: SdkApi, mode: number): void;
  displayMode(api: SdkApi): number;
  revisionCount(api: SdkApi): number;
  acceptChange(api: SdkApi, which: 'next' | 'this' | 'all'): void;
  rejectChange(api: SdkApi, which: 'next' | 'this' | 'all'): void;
  gotoChange(api: SdkApi, next: boolean): boolean;
  compareWith(
    api: SdkApi,
    bin: Uint8Array,
    images: Record<string, string>,
    local: Record<string, string>,
  ): void;
  selectionForAssistant(api: SdkApi): string;
  selectedText(api: SdkApi): string;
  replaceTracked(api: SdkApi, text: string, after: boolean, done?: () => void): void;
  // Layout
  setColumns(api: SdkApi, kind: 'one' | 'two' | 'three' | 'left' | 'right'): void;
  columnCount(api: SdkApi): number;
  insertBreak(api: SdkApi, kind: 'page' | 'column' | 'next' | 'continuous' | 'even' | 'odd'): void;
  sectionCount(api: SdkApi): number;
  setLanguage(api: SdkApi, lcid: number, asDefault: boolean): void;
}

export interface EngineComment {
  id: string;
  author: string;
  text: string;
  quote: string;
  solved: boolean;
  time: number;
  replies: { author: string; text: string; time: number }[];
}

/** Asc.c_oAscDisplayModeInReview */
export const ReviewMode = { All: 0, NoMarkup: 1, Original: 2, Simple: 3 } as const;

/** Asc.c_oAscTOCStylesType */
export const TocStyle = {
  Current: 0,
  Simple: 1,
  Standard: 2,
  Modern: 3,
  Classic: 4,
  Web: 5,
} as const;

export interface HostWindow extends Window {
  LucidHost?: {
    boot(opts: {
      bin: Uint8Array | null;
      images: Record<string, string>;
      title: string;
      author?: string;
      locale?: string;
      spellCheck?: boolean;
      register?: (api: SdkApi) => void;
    }): Promise<SdkApi>;
  };
  LucidBridge?: SdkBridge;
}
