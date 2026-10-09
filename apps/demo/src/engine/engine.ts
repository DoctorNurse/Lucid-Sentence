/**
 * DocEngine: one ONLYOFFICE sdkjs document, hosted in a same-origin iframe
 * (engine/lucid/apps/word/main/index.html). Each open gets a fresh iframe so
 * sdkjs state never carries over between documents.
 */
import {
  SelectElement,
  type HostWindow,
  type SdkApi,
  type SdkBridge,
  type SdkSelectedObject,
  type SdkSpellCheck,
} from './sdk.js';
import { X2t } from './x2t.js';

export interface EngineState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sub: boolean;
  sup: boolean;
  font: string;
  size: string;
  align: 'left' | 'center' | 'right' | 'justify';
  style: string;
  list: 'bullet' | 'number' | null;
  canUndo: boolean;
  canRedo: boolean;
  pages: number;
  page: number;
  zoom: number;
  modified: boolean;
  showMarks: boolean;
  /** Where the cursor is, for the contextual tabs. */
  inTable: boolean;
  image: boolean;
  inHeader: boolean;
  /** The misspelled word at the cursor and its suggestions (null: none). */
  spell: { word: string; variants: string[] | null } | null;
}

/** A spot in the parent page where the document wants a context menu. */
export interface EngineContextMenu {
  x: number;
  y: number;
}

export interface PictureFile {
  name: string;
  bytes: Uint8Array;
}

const initial = (): EngineState => ({
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  sub: false,
  sup: false,
  font: '',
  size: '',
  align: 'left',
  style: 'Normal',
  list: null,
  canUndo: false,
  canRedo: false,
  pages: 1,
  page: 1,
  zoom: 100,
  modified: false,
  showMarks: false,
  inTable: false,
  image: false,
  inHeader: false,
  spell: null,
});

const PICTURE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

const ALIGN = ['right', 'left', 'center', 'justify'] as const;

export class DocEngine extends EventTarget {
  readonly x2t: X2t;
  state: EngineState = initial();
  private frame: HTMLIFrameElement | null = null;
  private api: SdkApi | null = null;
  private bridge: SdkBridge | null = null;
  private media: Record<string, Uint8Array> = {};
  private urls: string[] = [];
  private spellProp: SdkSpellCheck | null = null;
  private pictureSeq = 0;

  /** base: where engine/dist is served, ending in "/" (e.g. "./engine/"). */
  constructor(
    private readonly host: HTMLElement,
    private readonly base: string,
  ) {
    super();
    this.x2t = new X2t(`${base}x2t/worker.js`);
  }

  get active(): boolean {
    return this.api !== null;
  }

  /** Open .docx bytes. Throws when the file can't be read; the old document stays open then. */
  async open(bytes: Uint8Array, title: string): Promise<void> {
    const conv = await this.x2t.convert(bytes, 'docx', 'bin');
    await this.mount(conv.data, conv.media, title);
  }

  /** A new blank document. */
  async blank(title: string): Promise<void> {
    await this.mount(null, {}, title);
  }

  private async mount(
    bin: Uint8Array | null,
    media: Record<string, Uint8Array>,
    title: string,
  ): Promise<void> {
    const frame = document.createElement('iframe');
    frame.className = 'engine-frame';
    frame.title = title;
    frame.src = `${this.base}lucid/apps/word/main/index.html`;
    const urls: string[] = [];
    const images: Record<string, string> = {};
    for (const [name, data] of Object.entries(media)) {
      const url = URL.createObjectURL(new Blob([data as BlobPart]));
      urls.push(url);
      images[`media/${name}`] = url;
    }
    const loaded = new Promise<void>((resolve, reject) => {
      frame.addEventListener('load', () => {
        resolve();
      });
      frame.addEventListener('error', () => {
        reject(new Error('the editor failed to load'));
      });
    });
    this.host.append(frame);
    try {
      await loaded;
      const win: HostWindow | null = frame.contentWindow;
      if (!win?.LucidHost) throw new Error('the editor failed to load');
      const state = initial();
      const api = await win.LucidHost.boot({
        bin,
        images,
        title,
        register: (a) => {
          this.listen(a, state);
        },
      });
      // Success: swap in the new document.
      this.close();
      this.frame = frame;
      this.api = api;
      this.bridge = win.LucidBridge ?? null;
      this.media = media;
      this.urls = urls;
      this.state = state;
      this.state.modified = false;
      this.forwardKeys(frame);
      this.syncList();
      this.emit();
      this.focus();
    } catch (e) {
      frame.remove();
      for (const u of urls) URL.revokeObjectURL(u);
      throw e;
    }
  }

  /**
   * App shortcuts (save, open, palette, print) work while the document has the
   * keyboard: keys inside the iframe never reach the app's own listener.
   */
  private forwardKeys(frame: HTMLIFrameElement): void {
    frame.contentWindow?.addEventListener(
      'keydown',
      (e) => {
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        const app =
          (mod && !e.altKey && ['s', 'o', 'p', 'n', 'k'].includes(k)) ||
          (e.altKey && !mod && e.code === 'KeyQ') ||
          e.key === 'F12' ||
          e.key === 'F7' ||
          (mod && e.key === 'F1');
        if (!app) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.dispatchEvent(new CustomEvent<KeyboardEvent>('key', { detail: e }));
      },
      true,
    );
  }

  private listen(api: SdkApi, s: EngineState): void {
    const on = (name: string, fn: (...a: never[]) => void): void => {
      api.asc_registerCallback(name, (...a: never[]) => {
        fn(...a);
        if (this.api === api) this.queueEmit();
      });
    };
    on('asc_onBold', (v: boolean) => (s.bold = v));
    on('asc_onItalic', (v: boolean) => (s.italic = v));
    on('asc_onUnderline', (v: boolean) => (s.underline = v));
    on('asc_onStrikeout', (v: boolean) => (s.strike = v));
    on('asc_onVerticalAlign', (v: number) => {
      s.sub = v === 1;
      s.sup = v === 2;
    });
    on('asc_onFontFamily', (f: { asc_getName?: () => string; get_Name?: () => string }) => {
      s.font = f.asc_getName?.() ?? f.get_Name?.() ?? '';
    });
    on('asc_onFontSize', (v: number) => (s.size = String(v)));
    on('asc_onPrAlign', (v: number) => (s.align = ALIGN[v] ?? 'left'));
    on('asc_onParaStyleName', (v: string) => (s.style = v));
    on('asc_onCanUndo', (v: boolean) => (s.canUndo = v));
    on('asc_onCanRedo', (v: boolean) => (s.canRedo = v));
    on('asc_onCountPages', (v: number) => (s.pages = v));
    on('asc_onCurrentPage', (v: number) => (s.page = v + 1));
    on('asc_onZoomChange', (v: number) => (s.zoom = v));
    on('asc_onDocumentModifiedChanged', () => (s.modified = api.isDocumentModified()));
    on('asc_onFocusObject', (objs: SdkSelectedObject[]) => {
      this.readSelection(s, objs);
      if (this.api === api) this.syncList();
    });
    // Suggestions for the word at the cursor arrive from the spell worker later; the
    // selection stack still holds the empty list until it is re-read.
    on('asc_onSpellCheckVariantsFound', () => {
      this.readSelection(s, api.getSelectedElements(true));
    });
    api.asc_registerCallback('asc_onContextMenu', (data: { get_X(): number; get_Y(): number }) => {
      if (this.api !== api || !this.frame) return;
      const r = this.frame.getBoundingClientRect();
      this.dispatchEvent(
        new CustomEvent<EngineContextMenu>('contextmenu', {
          detail: { x: r.left + data.get_X(), y: r.top + data.get_Y() },
        }),
      );
    });
  }

  private readSelection(s: EngineState, objs: SdkSelectedObject[]): void {
    s.inTable = false;
    s.image = false;
    s.inHeader = false;
    s.spell = null;
    this.spellProp = null;
    for (const o of objs) {
      const t = o.get_ObjectType();
      if (t === SelectElement.Table) s.inTable = true;
      else if (t === SelectElement.Image) s.image = true;
      else if (t === SelectElement.Header) s.inHeader = true;
      else if (t === SelectElement.SpellCheck) {
        const p = o.get_ObjectValue() as SdkSpellCheck;
        if (!p.get_Checked()) {
          this.spellProp = p;
          s.spell = { word: p.get_Word(), variants: p.get_Variants() };
        }
      }
    }
  }

  private syncList(): void {
    this.state.list = this.api && this.bridge ? this.bridge.listType(this.api) : null;
  }

  private emitQueued = false;
  private queueEmit(): void {
    if (this.emitQueued) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      this.emit();
    });
  }
  private emit(): void {
    this.dispatchEvent(new Event('state'));
  }

  /** Run an sdkjs call, then give the keyboard back to the document. */
  run(fn: (api: SdkApi) => void): void {
    if (!this.api) return;
    fn(this.api);
    this.focus();
    // Some calls (lists) finish a tick later and send no selection event.
    setTimeout(() => {
      this.syncList();
      this.emit();
    }, 50);
  }

  call<T>(fn: (api: SdkApi) => T): T | undefined {
    return this.api ? fn(this.api) : undefined;
  }

  focus(): void {
    if (!this.frame || !this.api) return;
    this.frame.contentWindow?.focus();
    // sdkjs reads the keyboard through its hidden textarea.
    this.frame.contentDocument?.getElementById('area_id')?.focus({ preventScroll: true });
    this.api.asc_enableKeyEvents(true);
  }

  /** Words in the document (for the status bar). */
  wordCount(): number {
    let n = 0;
    for (const p of this.paragraphs()) n += (p.text.match(/\S+/g) ?? []).length;
    return n;
  }

  /** Paragraph styles the document defines, for the Styles gallery. */
  styleNames(): string[] {
    return this.api && this.bridge ? this.bridge.styleNames(this.api) : [];
  }

  paragraphs(): { text: string; style: string; table?: boolean }[] {
    return this.api && this.bridge ? this.bridge.paragraphs(this.api) : [];
  }

  /** Serialize to .docx bytes. */
  async exportDocx(): Promise<Uint8Array> {
    if (!this.api || !this.bridge) throw new Error('no document is open');
    const bin = this.bridge.getBinary(this.api);
    const media: Record<string, Uint8Array> = {};
    for (const name of this.bridge.mediaNames()) {
      const m = this.media[name];
      if (m) media[name] = m;
    }
    const out = await this.x2t.convert(bin, 'bin', 'docx', media);
    return out.data;
  }

  /** Render the document to PDF (what Print and Export use). */
  async exportPdf(): Promise<Uint8Array> {
    if (!this.api || !this.bridge) throw new Error('no document is open');
    const bin = this.bridge.getBinary(this.api);
    const pages = this.bridge.pdfData(this.api);
    const out = await this.x2t.convert(bin, 'bin', 'pdf', { ...this.media }, pages);
    return out.data;
  }

  /** Insert pictures at the cursor; they are saved into the .docx's media folder. */
  insertPictures(files: PictureFile[]): void {
    if (!this.api || !this.bridge) return;
    const list: { name: string; url: string }[] = [];
    for (const f of files) {
      const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? 'png').toLowerCase();
      const type = PICTURE_TYPES[ext];
      if (!type) continue;
      const name = `lucid-picture-${Date.now().toString(36)}-${++this.pictureSeq}.${ext === 'jpeg' ? 'jpg' : ext}`;
      const url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type }));
      this.urls.push(url);
      this.media[name] = f.bytes;
      list.push({ name, url });
    }
    if (!list.length) return;
    const bridge = this.bridge;
    this.run((api) => {
      bridge.insertImages(api, list);
    });
  }

  /** Select the next misspelled word; returns it, or null when there are none. */
  nextMisspelling(): string | null {
    if (!this.api || !this.bridge) return null;
    const w = this.bridge.nextMisspelling(this.api);
    this.readSelection(this.state, this.api.getSelectedElements());
    this.focus();
    this.emit();
    return w;
  }

  misspellingCount(): number {
    return this.api && this.bridge ? this.bridge.misspellingCount(this.api) : 0;
  }

  replaceMisspelling(word: string): void {
    const prop = this.spellProp;
    if (!prop) return;
    this.run((api) => {
      api.asc_replaceMisspelledWord(word, prop);
    });
  }

  ignoreMisspelling(all: boolean): void {
    const prop = this.spellProp;
    if (!prop) return;
    this.run((api) => {
      api.asc_ignoreMisspelledWord(prop, all);
    });
  }

  closeHeaderFooter(): void {
    const bridge = this.bridge;
    if (!bridge) return;
    this.run((api) => {
      bridge.closeHeaderFooter(api);
    });
  }

  markSaved(): void {
    if (!this.api || !this.bridge) return;
    this.bridge.markSaved(this.api);
    this.state.modified = false;
    this.emit();
  }

  /** Close the document (the caller handles unsaved changes first). */
  close(): void {
    this.frame?.remove();
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.frame = null;
    this.api = null;
    this.bridge = null;
    this.media = {};
    this.urls = [];
    this.spellProp = null;
    this.state = initial();
  }
}
