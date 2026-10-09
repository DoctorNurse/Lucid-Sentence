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
}

export interface SdkBridge {
  version: number;
  getBinary(api: SdkApi): Uint8Array;
  mediaNames(): string[];
  listType(api: SdkApi): 'bullet' | 'number' | null;
  markSaved(api: SdkApi): void;
  paragraphs(api: SdkApi): { text: string; style: string; table?: boolean }[];
  styleNames(api: SdkApi): string[];
}

export interface HostWindow extends Window {
  LucidHost?: {
    boot(opts: {
      bin: Uint8Array | null;
      images: Record<string, string>;
      title: string;
      author?: string;
      locale?: string;
      register?: (api: SdkApi) => void;
    }): Promise<SdkApi>;
  };
  LucidBridge?: SdkBridge;
}
