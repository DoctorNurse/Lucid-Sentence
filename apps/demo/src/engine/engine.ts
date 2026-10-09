/**
 * DocEngine: one ONLYOFFICE sdkjs document, hosted in a same-origin iframe
 * (engine/lucid/apps/word/main/index.html). Each open gets a fresh iframe so
 * sdkjs state never carries over between documents.
 */
import type { HostWindow, SdkApi, SdkBridge } from './sdk.js';
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
});

const ALIGN = ['right', 'left', 'center', 'justify'] as const;

export class DocEngine extends EventTarget {
  readonly x2t: X2t;
  state: EngineState = initial();
  private frame: HTMLIFrameElement | null = null;
  private api: SdkApi | null = null;
  private bridge: SdkBridge | null = null;
  private media: Record<string, Uint8Array> = {};
  private urls: string[] = [];

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
    on('asc_onFocusObject', () => {
      if (this.api === api) this.syncList();
    });
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
    this.state = initial();
  }
}
