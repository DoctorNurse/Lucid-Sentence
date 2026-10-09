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
}

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
