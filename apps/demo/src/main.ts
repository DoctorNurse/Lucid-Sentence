import { allCommands, type TabId } from '@lucid-sentence/commands';
import {
  defineRibbon,
  displayShortcut,
  svgIcon,
  type CommandEventDetail,
  type LucidRibbonElement,
} from '@lucid-sentence/ribbon-ui';
import { defineSplash, promosEnabled } from '@lucid-sentence/splash';
import { installFonts, themeStylesheet } from '@lucid-sentence/tokens';
import {
  BookOpenText,
  FileText,
  Focus,
  Globe,
  Minus,
  NotebookPen,
  Plus,
  Redo2,
  Save,
  Search,
  Undo2,
  X,
} from 'lucide';
import { AudioNotes } from './editor/audio.js';
import { backstagePage } from './editor/backstage.js';
import { WIRED, handlers, type App, type ViewState } from './editor/commands.js';
import { Comments } from './editor/comments.js';
import { FindPanel } from './editor/find.js';
import { HandwritingTools } from './editor/handwriting.js';
import { History } from './editor/history.js';
import { InkLayer, type InkTool } from './editor/ink.js';
import {
  buildInkDocxParts,
  inkDocxEnabled,
  inkMLToStrokes,
  strokesToInkML,
} from './editor/ink/inkml.js';
import { decodeInk, encodeInk } from './editor/ink/model.js';
import { connectPencil, pencilCommand } from './editor/ink/pencil.js';
import {
  PAPERS,
  PAPER_COLORS,
  PenToolbar,
  Timeline,
  WritingStrip,
  type Paper,
} from './editor/notes.js';
import { Palette } from './editor/palette.js';
import { EditorSurface } from './editor/surface.js';
import { closePopover, el, popoverOpen, tap, toast } from './editor/ui.js';
import { ENGINE_WIRED, appLevel, engineHandlers, enginePressed } from './engine/commands.js';
import { DocEngine } from './engine/engine.js';
import * as files from './engine/files.js';
import { initPlatform } from './native.js';
import { drawRulers, geometry, type PageSetup } from './page.js';

// Design tokens and bundled UI fonts (no network). See docs/DESIGN.md.
installFonts(document);
const tokens = document.createElement('style');
tokens.id = 'ls-tokens';
tokens.textContent = themeStylesheet();
document.head.prepend(tokens);

defineRibbon();
defineSplash();

const $ = (sel: string): HTMLElement => document.querySelector<HTMLElement>(sel)!;
const params = new URLSearchParams(location.search);
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// ── Splash (one promo per launch). `?load=<ms>` sets the delay; `?promos=off` hides the promo.
const splash = document.createElement('ls-splash') as HTMLElement & { finish(): void };
splash.setAttribute('icon', './icon-256.png');
splash.setAttribute('asset-base', './');
splash.setAttribute('status', 'Loading the editor…');
if (params.get('promos') === 'off') splash.setAttribute('promos', 'off');
document.body.append(splash);
const loadMs = Number(params.get('load') ?? 1500);
setTimeout(
  () => {
    splash.finish();
    document.body.classList.add('ready');
  },
  Number.isFinite(loadMs) ? loadMs : 1500,
);

// ── Elements
const ribbon = $('#ribbon') as LucidRibbonElement;
const stage = $('#stage');
const sheet = $('#sheet');
const canvas = $('#canvas');
const pageEl = $('#page');
const doc = $('#doc');
const SAMPLE = doc.innerHTML;

// ── Document engine state (functions below, in "Document engine")
const engineHost = $('#engine-host');
const engine = new DocEngine(engineHost, './engine/');
/** Where the open .docx lives, so Save writes back to it. */
let fileTarget: files.FileTarget = { kind: 'none' };
const engineApp = {
  engine,
  save: () => {
    void saveDocx(false);
  },
  saveAs: () => {
    void saveDocx(true);
  },
};

function setEngineMode(on: boolean): void {
  document.body.classList.toggle('engine', on);
  engineHost.hidden = !on;
  ribbon.wired = on ? new Set([...ENGINE_WIRED, ...[...WIRED].filter(appLevel)]) : WIRED;
  if (on) {
    if (document.body.classList.contains('notes')) setNotes(false);
    if (view.draw) setDraw(false);
    ribbon.setAttribute('contextual', '');
    // Web app: keep the whole engine for offline use from now on (see sw.template.js).
    if (!engineCached && 'serviceWorker' in navigator) {
      engineCached = true;
      navigator.serviceWorker.controller?.postMessage('cache-engine');
    }
  }
  refresh();
}
let engineCached = false;

function refreshEngine(): void {
  const s = engine.state;
  ribbon.pressed = enginePressed(engine);
  ribbon.values = new Map([
    ['home.font.font', s.font],
    ['home.font.size', s.size],
  ]);
  $('#pageinfo').textContent = `Page ${s.page} of ${s.pages}`;
  const words = engine.wordCount();
  $('#words').textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
  $('#zoom').textContent = `${s.zoom}%`;
  ($('#zoom-range') as HTMLInputElement).value = String(s.zoom);
  $('#saved').textContent = s.modified ? 'Edited' : 'Saved';
  $('#saved').classList.toggle('saved--dirty', s.modified);
  refreshQat();
}

/** Ask before discarding unsaved .docx edits. */
function confirmDiscard(): boolean {
  return (
    !engine.active ||
    !engine.state.modified ||
    window.confirm(`Discard unsaved changes to ${$('#doc-name').textContent}?`)
  );
}

async function withLoading<T>(fn: () => Promise<T>): Promise<T> {
  engineHost.hidden = false;
  engineHost.classList.add('engine-loading');
  document.body.classList.add('engine');
  try {
    return await fn();
  } finally {
    engineHost.classList.remove('engine-loading');
    setEngineMode(engine.active);
  }
}

async function openDocx(f: files.PickedFile): Promise<void> {
  if (!confirmDiscard()) return;
  backToDoc();
  status(`Opening ${f.name}…`);
  try {
    await withLoading(() => engine.open(f.bytes, f.name));
    fileTarget = f.target;
    $('#doc-name').textContent = f.name;
    status(`Opened ${f.name}`);
  } catch (e) {
    console.error(e);
    toast(`Couldn't open ${f.name}. It may be damaged or not a Word document.`, 5200);
    status('Ready');
  }
}

async function newEngineDoc(): Promise<void> {
  if (!confirmDiscard()) return;
  backToDoc();
  try {
    await withLoading(() => engine.blank('Document1.docx'));
    fileTarget = { kind: 'none' };
    $('#doc-name').textContent = 'Document1.docx';
  } catch (e) {
    console.error(e);
    toast("The document engine couldn't start on this device.", 5200);
  }
}

/** Close the .docx (after asking about unsaved changes) and go back to the preview canvas. */
function leaveEngine(): Promise<boolean> {
  if (!engine.active) return Promise.resolve(true);
  if (!confirmDiscard()) return Promise.resolve(false);
  engine.close();
  fileTarget = { kind: 'none' };
  setEngineMode(false);
  return Promise.resolve(true);
}

async function pickAndOpen(fallback: () => void): Promise<void> {
  try {
    const f = await files.pickOpen(fallback);
    if (!f) return;
    if (/\.docx$/i.test(f.name)) await openDocx(f);
    else toast('Pick a Word document (.docx).');
  } catch (e) {
    console.error(e);
    toast("Couldn't open that file.");
  }
}

let saving = false;
async function saveDocx(as: boolean): Promise<void> {
  if (!engine.active || saving) return;
  saving = true;
  const name = $('#doc-name').textContent || 'Document1.docx';
  status('Saving…');
  try {
    const bytes = await engine.exportDocx();
    let savedTo = name;
    if (as || !(await files.writeTo(fileTarget, bytes))) {
      const r = await files.saveAs(name, bytes);
      if (!r) {
        status('Ready');
        return;
      }
      fileTarget = r.target;
      savedTo = r.name;
      $('#doc-name').textContent = r.name;
    }
    engine.markSaved();
    const where = fileTarget.kind === 'none' ? 'Downloaded' : 'Saved';
    status(`${where} ${savedTo}`);
    toast(`${where} ${savedTo}`);
    if (stage.classList.contains('backstage')) backToDoc();
  } catch (e) {
    console.error(e);
    toast(`Couldn't save ${name}. Try Save As to pick another place.`, 5200);
    status('Ready');
  } finally {
    saving = false;
  }
}

async function downloadDocx(): Promise<void> {
  if (!engine.active) return;
  try {
    files.download($('#doc-name').textContent || 'Document1.docx', await engine.exportDocx());
  } catch (e) {
    console.error(e);
    toast("Couldn't prepare the download.");
  }
}

// ── Core
const surface = new EditorSurface(doc);
// Phones: fingers draw by default, because many phone styluses are capacitive and report
// pointerType 'touch'. The first real pen switches this default to pen only.
const TOUCH_KEY = 'lucid-sentence:draw-with-touch';
const touchChoice = localStorage.getItem(TOUCH_KEY);
const phoneLike =
  window.matchMedia('(pointer: coarse)').matches &&
  Math.min(window.innerWidth, window.innerHeight) < 600;
const settings = {
  autoSwitch: localStorage.getItem('lucid-sentence:auto-switch') !== 'off',
  drawWithTouch: touchChoice === null ? phoneLike : touchChoice === 'on',
  floatingToolbar: true,
};
const view: ViewState = {
  ruler: true,
  gridlines: false,
  showMarks: false,
  navPane: false,
  focus: false,
  read: false,
  web: false,
  paperDark: false,
  draw: false,
  formatPainter: false,
  readAloud: false,
  zoom: 100,
  zoomFit: false,
  columns: 1,
  hyphenate: false,
  watermark: null,
  pageColor: null,
  spacing: 'normal',
  headerRow: true,
  bandedRows: false,
  firstColumn: false,
};
let pageSetup: PageSetup = {
  size: params.get('size') === 'a4' ? 'a4' : 'letter',
  orientation: 'portrait',
  margins: 'normal',
};
let language = 'en-US';

const audio = new AudioNotes(() => {
  timeline.render();
});
const ink = new InkLayer(document.querySelector<SVGSVGElement>('#ink')!, pageEl, canvas, {
  onOp: (op) => {
    history.ink(op);
  },
  onRetract: (op) => {
    history.retract(op);
  },
  onPenWhileIdle: () => {
    setDraw(true);
    return true;
  },
  onPenDetected: () => {
    settings.drawWithTouch = false;
    toast(
      'Pen detected: only the pen draws now; fingers scroll. Draw with Touch turns finger drawing back on.',
    );
    refresh();
  },
  getZoom: () => view.zoom,
  setZoom: (z) => {
    setZoom(z);
  },
  onStatus: (m) => {
    status(m);
  },
  clock: () => audio.clock(),
  onStrokeTap: (s) => {
    timeline.seekStroke(s);
  },
});
ink.drawWithTouch = settings.drawWithTouch;
ink.shapeMode = localStorage.getItem('lucid-sentence:ink-to-shape') === 'on';
ink.touchAuto = touchChoice === null && phoneLike;
ink.autoSwitch = settings.autoSwitch;
const history = new History(doc, ink, () => {
  refreshQat();
  scheduleLayout();
});
const find = new FindPanel($('#findpanel'), surface);
const comments = new Comments($('#comments'), surface, () => {
  scheduleLayout();
});
const pen = new PenToolbar($('#pentool'), ink, () => {
  if (document.body.classList.contains('notes')) setNotes(false);
  else setDraw(false);
});
const strip = new WritingStrip(pageEl, ink);
// In the layout, just above the Notes bar: it never covers the controls or the page.
stage.insertBefore(strip.root, $('#notesbar'));
const timeline = new Timeline(audio, ink, doc);
stage.insertBefore(timeline.root, $('.status'));

function status(msg: string): void {
  $('#last').textContent = msg;
}

function setDraw(on: boolean, tool?: InkTool): void {
  if (tool) ink.setTool(tool);
  view.draw = on;
  ink.setActive(on);
  document.body.classList.toggle('drawing', on);
  pen.show(on && (settings.floatingToolbar || document.body.classList.contains('notes')));
  placePenToolbar();
  // Until the user drags it, the pen toolbar floats just below the ribbon (not on phones,
  // where it docks as a strip above the bottom bar).
  if (on && !pen.docked && pen.root.style.transform !== 'none') {
    pen.root.style.top = `${Math.round($('.workspace').getBoundingClientRect().top) + 14}px`;
  }
  $('#mode').textContent = on
    ? `Drawing · ${ink.tool}`
    : document.body.classList.contains('notes')
      ? 'Notes mode'
      : '';
  if (document.body.classList.contains('notes')) syncNotesbar();
  if (on && ribbon.activeTab !== 'draw' && !document.body.classList.contains('notes'))
    ribbon.activeTab = 'draw';
  refresh();
}

/**
 * Phones: the pen toolbar docks in the layout as a one-line, horizontally scrolling strip
 * just above the bottom ribbon bar, so it never covers the page. Wider screens: it floats.
 */
function placePenToolbar(): void {
  const dock = ribbon.layout === 'phone';
  if (dock === pen.docked && pen.root.isConnected) return;
  pen.docked = dock;
  pen.root.classList.toggle('pentool--docked', dock);
  if (dock) {
    pen.root.style.removeProperty('top');
    pen.root.style.removeProperty('left');
    pen.root.style.removeProperty('transform');
    stage.insertBefore(pen.root, ribbon);
  } else {
    document.body.insertBefore(pen.root, $('#toast'));
  }
}

// ── Back gesture (Android) and browser Back: close the sheet, picker, or popover first.
let backArmed = false;
function overlayOpen(): boolean {
  return popoverOpen() || ribbon.sheetOpen;
}
function syncBack(): void {
  const open = overlayOpen();
  if (open && !backArmed) {
    backArmed = true;
    window.history.pushState({ lsOverlay: true }, '');
  } else if (!open && backArmed) {
    backArmed = false;
    if ((window.history.state as { lsOverlay?: boolean } | null)?.lsOverlay) window.history.back();
  }
}
window.addEventListener('popstate', () => {
  if (!backArmed) return;
  backArmed = false;
  if (popoverOpen()) closePopover();
  else ribbon.closeSheet();
  syncBack();
});
window.addEventListener('ls-popover-change', () => {
  queueMicrotask(syncBack);
});
ribbon.addEventListener('ls-sheet-change', () => {
  queueMicrotask(syncBack);
});

// ── Page geometry, rulers, pagination, zoom
function setPage(p: Partial<PageSetup>): void {
  pageSetup = { ...pageSetup, ...p };
  layout();
  if (view.zoomFit) setZoom('fit');
}

let layoutQueued = false;
function scheduleLayout(): void {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    layout();
  });
}

function layout(): void {
  const g = geometry(pageSetup);
  sheet.style.setProperty('--page-w', `${g.width}px`);
  sheet.style.setProperty('--page-h', `${g.height}px`);
  sheet.style.setProperty('--m-top', `${g.margins.top}px`);
  sheet.style.setProperty('--m-right', `${g.margins.right}px`);
  sheet.style.setProperty('--m-bottom', `${g.margins.bottom}px`);
  sheet.style.setProperty('--m-left', `${g.margins.left}px`);
  drawRulers($('#ruler-h'), $('#ruler-v'), g);
  // Page breaks push the next content to the top of the next page.
  const H = g.height;
  const breaks = [...doc.querySelectorAll<HTMLElement>('.d-page-break')];
  for (const b of breaks) b.style.height = '0px';
  for (const b of breaks) {
    const top = b.offsetTop;
    const next = Math.ceil((top + 1) / H) * H + g.margins.top;
    b.style.height = `${Math.max(24, next - top)}px`;
  }
  const contentBottom = doc.offsetTop + doc.scrollHeight + g.margins.bottom;
  const pages = view.web ? 1 : Math.max(1, Math.ceil(contentBottom / H));
  pageEl.style.minHeight = `${pages * H}px`;
  pageEl.dataset['pages'] = String(pages);
  const marks = $('#page-marks');
  marks.replaceChildren(
    ...Array.from({ length: pages - 1 }, (_, i) =>
      el(
        'div',
        { class: 'page-mark', style: `top:${(i + 1) * H}px` },
        el('span', {}, `Page ${i + 2}`),
      ),
    ),
  );
  ink.setSize(g.width, pages * H);
  updateStatus();
  comments.render();
  strip.update();
}

function setZoom(z: number | 'fit' | 'page'): void {
  if (engine.active) {
    engine.run((api) => {
      if (z === 'fit') api.zoomFitToWidth();
      else if (z === 'page') api.zoomFitToPage();
      else api.zoom(Math.max(50, Math.min(500, z)));
    });
    return;
  }
  const g = geometry(pageSetup);
  const availW = canvas.clientWidth - 32;
  const sheetW = g.width + 22 + (comments.shown && ribbon.layout !== 'phone' ? 276 : 0);
  let scale: number;
  if (z === 'fit') {
    view.zoomFit = true;
    scale = Math.min(1.5, availW / sheetW);
  } else if (z === 'page') {
    view.zoomFit = false;
    scale = Math.min(availW / sheetW, (canvas.clientHeight - 40) / (g.height + 22));
  } else {
    view.zoomFit = false;
    scale = z / 100;
  }
  scale = Math.max(0.25, Math.min(4, scale));
  view.zoom = Math.round(scale * 100);
  sheet.style.setProperty('zoom', String(scale));
  ink.refreshView();
  $('#zoom').textContent = `${view.zoom}%`;
  ($('#zoom-range') as HTMLInputElement).value = String(view.zoom);
}

function updateStatus(): void {
  const pages = Number(pageEl.dataset['pages'] ?? '1');
  const H = geometry(pageSetup).height;
  const r = surface.range();
  let cur = 1;
  if (r) {
    const rect = r.getBoundingClientRect();
    const pr = pageEl.getBoundingClientRect();
    const scale = pr.width / pageEl.offsetWidth || 1;
    if (rect.height > 0)
      cur = Math.min(pages, Math.max(1, Math.floor((rect.top - pr.top) / scale / H) + 1));
  }
  $('#pageinfo').textContent = `Page ${cur} of ${pages}`;
  const words = (surface.text().match(/\S+/g) ?? []).length;
  $('#words').textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
}

// ── View state → DOM
function applyView(): void {
  const b = document.body.classList;
  sheet.classList.toggle('no-ruler', !view.ruler);
  pageEl.classList.toggle('gridlines', view.gridlines);
  doc.classList.toggle('show-marks', view.showMarks);
  $('#navpane').hidden = !view.navPane;
  b.toggle('focus-mode', view.focus);
  b.toggle('read-mode', view.read);
  b.toggle('web-layout', view.web);
  sheet.dataset['paper'] = view.paperDark ? 'dark' : 'white';
  doc.style.columnCount = view.columns > 1 ? String(view.columns) : '';
  doc.style.hyphens = view.hyphenate ? 'auto' : '';
  doc.dataset['spacing'] = view.spacing;
  doc.classList.toggle('t-header', view.headerRow);
  doc.classList.toggle('t-banded', view.bandedRows);
  doc.classList.toggle('t-first-col', view.firstColumn);
  $('#watermark').textContent = view.watermark ?? '';
  if (view.pageColor && view.pageColor !== '#ffffff')
    pageEl.style.setProperty('--page-color', view.pageColor);
  else pageEl.style.removeProperty('--page-color');
  const paperRadio = document.querySelector<HTMLInputElement>(
    `input[name="paper"][value="${view.paperDark ? 'dark' : 'white'}"]`,
  );
  if (paperRadio) paperRadio.checked = true;
  if (view.navPane) renderNav();
  scheduleLayout();
  refresh();
}

function renderNav(): void {
  const list = $('#navlist');
  list.replaceChildren(
    ...[...doc.querySelectorAll<HTMLElement>('h1,h2,h3,h4')].map((h) => {
      const b = el(
        'button',
        { type: 'button', class: `navpane__item navpane__item--${h.tagName.toLowerCase()}` },
        h.textContent.trim() || '(Empty heading)',
      );
      tap(b, () => {
        h.scrollIntoView({ block: 'start', behavior: 'smooth' });
        const r = document.createRange();
        r.setStart(h, 0);
        r.collapse(true);
        const s = document.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
        doc.focus({ preventScroll: true });
      });
      return el('li', {}, b);
    }),
  );
}

// ── Selection → ribbon state, contextual tabs
function refresh(): void {
  if (engine.active) {
    refreshEngine();
    return;
  }
  const st = surface.state();
  const p = new Set<string>();
  const on = (id: string, v: boolean): void => {
    if (v) p.add(id);
  };
  on('home.font.bold', st.bold);
  on('home.font.italic', st.italic);
  on('home.font.underline', st.underline);
  on('home.font.strikethrough', st.strike);
  on('home.font.subscript', st.sub);
  on('home.font.superscript', st.sup);
  on('home.paragraph.align-left', st.align === 'left');
  on('home.paragraph.align-center', st.align === 'center');
  on('home.paragraph.align-right', st.align === 'right');
  on('home.paragraph.justify', st.align === 'justify');
  on('home.paragraph.show-marks', view.showMarks);
  on('home.clipboard.format-painter', view.formatPainter);
  on('view.show.ruler', view.ruler);
  on('view.show.gridlines', view.gridlines);
  on('table-layout.table.view-gridlines', view.gridlines);
  on('view.show.navigation-pane', view.navPane);
  on('view.immersive.focus', view.focus);
  on('view.page-movement.vertical', true);
  on('review.comments.show-comments', comments.visible);
  on('review.speech.read-aloud', view.readAloud);
  on('review.ink.hide-ink', ink.hidden);
  on('draw.drawing-tools.select', !view.draw);
  on('draw.drawing-tools.lasso', view.draw && ink.tool === 'lasso');
  on('draw.drawing-tools.draw-with-touch', settings.drawWithTouch);
  on('draw.convert.ink-to-shape', ink.shapeMode);
  on('draw.replay.ink-replay', ink.replaying);
  on('table-design.style-options.header-row', view.headerRow);
  on('table-design.style-options.banded-rows', view.bandedRows);
  on('table-design.style-options.first-column', view.firstColumn);
  ribbon.pressed = p;
  ribbon.values = new Map([
    ['home.font.font', st.font || 'Aptos'],
    ['home.font.size', st.size],
  ]);
  const ctx: TabId[] = [];
  if (st.inTable) ctx.push('table-design', 'table-layout');
  if (st.image) ctx.push('picture-format');
  const next = ctx.join(' ');
  if ((ribbon.getAttribute('contextual') ?? '') !== next) {
    const had = new Set((ribbon.getAttribute('contextual') ?? '').split(' ').filter(Boolean));
    ribbon.setAttribute('contextual', next);
    // Word brings Picture Format forward when a picture is selected.
    if (st.image && !had.has('picture-format')) ribbon.activeTab = 'picture-format';
  }
  updateStatus();
  refreshQat();
}

let refreshQueued = false;
document.addEventListener('selectionchange', () => {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    refresh();
  });
});
doc.addEventListener('ls-selection', refresh);
doc.addEventListener('ls-change', () => {
  scheduleLayout();
  refresh();
  markDirty();
});
doc.addEventListener('input', () => {
  scheduleLayout();
  markDirty();
  if (view.navPane) renderNav();
});
pageEl.addEventListener('ls-ink-change', () => {
  markDirty();
  timeline.render();
});

// ── App facade for the command dispatcher
const app: App = {
  surface,
  ink,
  history,
  find,
  comments,
  pen,
  view,
  get page() {
    return pageSetup;
  },
  setPage,
  applyView,
  setDraw,
  openBackstage,
  openPalette: () => {
    palette.open();
  },
  save,
  print: () => {
    window.print();
  },
  setZoom,
  refresh,
  get language() {
    return language;
  },
  setLanguage: (l) => {
    language = l;
    doc.lang = l;
    doc.dir = /^(ar|he)/.test(l) ? 'rtl' : 'ltr';
    $('#lang').textContent = new Intl.DisplayNames(['en'], { type: 'language' }).of(l) ?? l;
  },
  settings,
};

ribbon.wired = WIRED;
ribbon.addEventListener('ls-command', (e) => {
  const d = (e as CustomEvent<CommandEventDetail>).detail;
  if (engine.active && !appLevel(d.id)) {
    const eh = engineHandlers[d.id];
    if (eh) {
      eh(engineApp, d);
      status(allCommands().find((r) => r.command.id === d.id)?.command.label ?? d.id);
      refresh();
    } else {
      toast(unavailable(d.id));
    }
    return;
  }
  if (engine.active && engineHandlers[d.id]) {
    engineHandlers[d.id]!(engineApp, d);
    return;
  }
  const h = handlers[d.id];
  if (!h) return;
  h(app, d);
  const label = allCommands().find((r) => r.command.id === d.id)?.command.label ?? d.id;
  status(label);
  refresh();
});
/** What to tell the user about a command that can't run here (never fail silently). */
function unavailable(id: string): string {
  const ref = allCommands().find((r) => r.command.id === id);
  const label = ref?.command.label ?? id;
  if (ref?.command.stub) return `${label} isn't available in Lucid Sentence.`;
  return engine.active
    ? `${label} isn't connected to the document engine yet.`
    : `${label} arrives with the document engine. Open a .docx file or start a Blank document to use it.`;
}
ribbon.addEventListener('ls-command-pending', (e) => {
  const { id } = (e as CustomEvent<{ id: string }>).detail;
  const msg = unavailable(id);
  status(msg);
  toast(msg);
});
ribbon.addEventListener('ls-tab-change', (e) => {
  const { tab } = (e as CustomEvent<{ tab: TabId }>).detail;
  stage.classList.toggle('backstage', tab === 'file');
  if (tab === 'file') renderBackstage();
});

function run(id: string): void {
  if (engine.active && (engineHandlers[id] || !appLevel(id))) {
    if (engineHandlers[id] && ribbon.invoke(id)) return;
    const eh = engineHandlers[id];
    if (eh) eh(engineApp, { id, kind: 'button', layout: ribbon.layout });
    else toast(unavailable(id));
    refresh();
    return;
  }
  if (handlers[id] && ribbon.invoke(id)) return;
  if (!WIRED.has(id)) {
    toast(unavailable(id));
    return;
  }
  handlers[id]?.(app, { id, kind: 'button', layout: ribbon.layout });
  refresh();
}

// ── Backstage
function renderBackstage(): void {
  const id = ribbon.backstagePage;
  $('#backstage').replaceChildren(
    backstagePage(id, {
      docName: $('#doc-name').textContent,
      engine: engine.active,
      pickFile: (fallback) => {
        void pickAndOpen(fallback);
      },
      saveAs: () => {
        void saveDocx(true);
      },
      downloadDocx: () => {
        void downloadDocx();
      },
      stats: () => ({
        words: (surface.text().match(/\S+/g) ?? []).length,
        chars: surface.text().replace(/\n/g, '').length,
        paragraphs: doc.querySelectorAll('p,h1,h2,h3,h4,li,blockquote').length,
        pages: Number(pageEl.dataset['pages'] ?? '1'),
        comments: comments.ordered().length,
        strokes: ink.strokes.length,
      }),
      newDoc: (kind) => {
        if (kind === 'blank') {
          void newEngineDoc();
          return;
        }
        void leaveEngine().then((left) => {
          if (left) newPreviewDoc(kind);
        });
      },
      openFile,
      save,
      downloadHtml: () => {
        download(
          `${baseName()}.html`,
          `<!doctype html><meta charset="utf-8"><title>${baseName()}</title>${doc.innerHTML}`,
          'text/html',
        );
      },
      downloadText: () => {
        download(`${baseName()}.txt`, surface.text(), 'text/plain');
      },
      print: () => {
        backToDoc();
        setTimeout(() => {
          window.print();
        }, 50);
      },
      promosEnabled: promosEnabled(),
      settings,
      onSetting: (k, v) => {
        settings[k] = v;
        ink.autoSwitch = settings.autoSwitch;
        if (k === 'drawWithTouch') {
          ink.drawWithTouch = v;
          ink.touchAuto = false;
          localStorage.setItem(TOUCH_KEY, v ? 'on' : 'off');
        }
        localStorage.setItem('lucid-sentence:auto-switch', settings.autoSwitch ? 'on' : 'off');
        refresh();
      },
      version: '0.1 preview',
    }),
  );
}

function openBackstage(id: string): void {
  closePopover();
  ribbon.backstagePage = id;
  ribbon.activeTab = 'file';
  stage.classList.add('backstage');
  renderBackstage();
}

// Clicks and keys inside the engine's iframe never reach this document, so a
// ribbon popover can't see them; close it when focus moves into the frame.
window.addEventListener('blur', () => {
  if (popoverOpen() && document.activeElement?.classList.contains('engine-frame')) closePopover();
});

function backToDoc(): void {
  ribbon.activeTab = 'home';
  stage.classList.remove('backstage');
  if (engine.active) engine.focus();
  else surface.focus();
}

const baseName = (): string => $('#doc-name').textContent.replace(/\.docx$/i, '') || 'Document';

function download(name: string, content: string, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
  }, 1000);
}

function sanitize(html: string): string {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach(
    (n) => {
      n.remove();
    },
  );
  d.querySelectorAll('*').forEach((n) => {
    for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
    }
  });
  return d.body.innerHTML;
}

function newPreviewDoc(kind: 'notes' | 'sample'): void {
  doc.innerHTML = kind === 'notes' ? '<p><br></p>' : SAMPLE;
  ink.strokes = [];
  ink.render();
  $('#doc-name').textContent = kind === 'notes' ? 'Notes1.docx' : 'Quarterly-Notes.docx';
  backToDoc();
  scheduleLayout();
}

function openFile(f: File): void {
  if (/\.docx$/i.test(f.name)) {
    void files.fromFile(f).then(openDocx);
    return;
  }
  void leaveEngine().then((left) => {
    if (left) openPreviewFile(f);
  });
}
function openPreviewFile(f: File): void {
  void f.text().then((t) => {
    doc.innerHTML = /\.html?$/i.test(f.name)
      ? sanitize(t)
      : t
          .split(/\n{2,}|\r\n\r\n/)
          .map(
            (p) =>
              `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`,
          )
          .join('');
    $('#doc-name').textContent = f.name.replace(/\.(txt|html?)$/i, '.docx');
    backToDoc();
    scheduleLayout();
  });
}

// ── Save (draft on this device)
const DRAFT = 'lucid-sentence:draft';
let dirty = false;
function markDirty(): void {
  if (dirty) return;
  dirty = true;
  $('#saved').textContent = 'Edited';
  $('#saved').classList.add('saved--dirty');
}
function save(): void {
  if (engine.active) {
    void saveDocx(false);
    return;
  }
  try {
    localStorage.setItem(
      DRAFT,
      JSON.stringify({
        html: doc.innerHTML,
        ink: encodeInk(ink.strokes),
        name: $('#doc-name').textContent,
        at: Date.now(),
      }),
    );
    dirty = false;
    $('#saved').textContent = 'Saved';
    $('#saved').classList.remove('saved--dirty');
    toast(
      'Draft saved on this device. To write a .docx, start a Blank document or open a .docx file.',
    );
  } catch {
    toast('Could not save (storage full or blocked)');
  }
}
if (params.get('draft') !== 'off') {
  try {
    const raw = localStorage.getItem(DRAFT);
    if (raw) {
      const d = JSON.parse(raw) as { html: string; ink?: unknown; strokes?: unknown; name: string };
      doc.innerHTML = sanitize(d.html);
      // v1 drafts carry `ink`; older drafts carry a plain `strokes` array (model v0).
      ink.strokes = decodeInk(d.ink ?? d.strokes ?? []);
      ink.render();
      $('#doc-name').textContent = d.name;
    }
  } catch {
    /* ignore a corrupt draft */
  }
}

// ── Quick Access Toolbar, titlebar, status bar icons
const icons: Record<string, Parameters<typeof svgIcon>[1]> = {
  'qat.save': Save,
  'qat.undo': Undo2,
  'qat.redo': Redo2,
};
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-qat]')) {
  b.append(svgIcon(document, icons[b.dataset['qat']!]!, 18));
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
  });
  tap(b, () => {
    const q = b.dataset['qat'];
    if (q === 'qat.save') save();
    else if (engine.active)
      engine.run((api) => {
        if (q === 'qat.undo') api.Undo();
        else api.Redo();
      });
    else if (q === 'qat.undo') history.undo();
    else history.redo();
    refresh();
  });
}
function refreshQat(): void {
  const e = engine.active ? engine.state : null;
  document.querySelector<HTMLButtonElement>('[data-qat="qat.undo"]')!.disabled = e
    ? !e.canUndo
    : !history.canUndo;
  document.querySelector<HTMLButtonElement>('[data-qat="qat.redo"]')!.disabled = e
    ? !e.canRedo
    : !history.canRedo;
}
$('.search-pill__icon').append(svgIcon(document, Search, 16));
$('.notes-pill__icon').append(svgIcon(document, NotebookPen, 16));
$('#palette-kbd').textContent = displayShortcut('Alt+Q');
const statusIcons: Record<string, Parameters<typeof svgIcon>[1]> = {
  'view.immersive.focus': Focus,
  'view.views.read-mode': BookOpenText,
  'view.views.print-layout': FileText,
  'view.views.web-layout': Globe,
};
for (const b of document.querySelectorAll<HTMLButtonElement>('.status [data-cmd]')) {
  const node = statusIcons[b.dataset['cmd']!];
  if (node) {
    b.append(svgIcon(document, node, 16));
    b.title = b.getAttribute('aria-label') ?? '';
  }
  tap(b, (e) => {
    const id = b.dataset['cmd']!;
    const r = b.getBoundingClientRect();
    handlers[id]?.(app, {
      id,
      kind: 'button',
      layout: ribbon.layout,
      anchor: { x: r.left, y: r.top - 8 - 240, width: r.width, height: 0 },
    });
    e.stopPropagation();
    refresh();
  });
}
$('#zoom-out').append(svgIcon(document, Minus, 16));
$('#zoom-in').append(svgIcon(document, Plus, 16));
tap($('#zoom-out'), () => {
  setZoom(Math.max(50, view.zoom - 10));
});
tap($('#zoom-in'), () => {
  setZoom(Math.min(200, view.zoom + 10));
});
($('#zoom-range') as HTMLInputElement).addEventListener('input', (e) => {
  setZoom(Number((e.target as HTMLInputElement).value));
});

// ── Palette
const palette = new Palette({ isWired: (id) => WIRED.has(id), run });
tap($('#open-palette'), () => {
  palette.open();
});

// ── Notes mode
const notesbar = $('#notesbar');
let paper: Paper = 'lined';
let paperColor = 'white';
const handwriting = new HandwritingTools({ ink, surface, page: pageEl, scroller: canvas });
/**
 * Built once and updated in place (syncNotesbar). Rebuilding it on every state change
 * replaced the buttons under the user's finger, and Android WebView then dropped the tap.
 */
function buildNotesbar(): void {
  const seg = (
    name: string,
    items: { id: string; label: string }[],
    onPick: (v: string) => void,
  ): HTMLElement => {
    const track = el('span', { class: 'seg__track', role: 'radiogroup', 'aria-label': name });
    for (const it of items) {
      const b = el(
        'button',
        { type: 'button', role: 'radio', class: 'seg__btn', 'data-value': it.id },
        it.label,
      );
      // Keep focus where it is (Type puts it in the document; a focused button would
      // take it back on touch devices).
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
      });
      tap(b, () => {
        onPick(it.id);
        syncNotesbar();
      });
      track.append(b);
    }
    return el(
      'span',
      { class: 'seg', 'data-seg': name },
      el('span', { class: 'seg__label' }, name),
      track,
    );
  };
  const colors = el('span', {
    class: 'notes__colors',
    role: 'radiogroup',
    'aria-label': 'Paper color',
  });
  for (const c of PAPER_COLORS) {
    const b = el('button', {
      type: 'button',
      role: 'radio',
      class: 'notes__swatch',
      style: `--sw:${c.color}`,
      'aria-label': `${c.label} paper`,
      'data-paper-color': c.id,
    });
    tap(b, () => {
      paperColor = c.id;
      localStorage.setItem('lucid-sentence:paper-color', paperColor);
      applyPaper();
      syncNotesbar();
    });
    colors.append(b);
  }
  const chip = (
    label: string,
    id: string,
    run: (b: HTMLButtonElement) => void,
  ): HTMLButtonElement => {
    const b = el('button', { type: 'button', class: 'btn btn--chip', 'data-notes': id }, label);
    tap(b, () => {
      run(b);
    });
    return b;
  };
  const close = el('button', {
    type: 'button',
    class: 'notes__close',
    'aria-label': 'Exit Notes mode',
    title: 'Exit Notes mode',
  });
  close.append(svgIcon(document, X, 18));
  tap(close, () => {
    setNotes(false);
  });
  const scroll = el(
    'div',
    { class: 'notesbar__scroll' },
    el('span', { class: 'notes__title' }, 'Notes'),
    seg(
      'Input',
      [
        { id: 'write', label: 'Write' },
        { id: 'type', label: 'Type' },
      ],
      (v) => {
        if (v === 'write') {
          setDraw(true, ['pen', 'pencil', 'highlighter'].includes(ink.tool) ? ink.tool : 'pen');
          toast('Write: the pen draws on the page.');
        } else {
          setDraw(false);
          strip.toggle(false);
          // Put the caret in the document so the keyboard comes up.
          surface.focus();
          if (!surface.range()) {
            const r = document.createRange();
            r.selectNodeContents(doc);
            r.collapse(false);
            document.getSelection()?.removeAllRanges();
            document.getSelection()?.addRange(r);
          }
          toast('Type: tap where you want to type. The pen still writes when you use it.');
        }
      },
    ),
    seg('Paper', PAPERS, (v) => {
      paper = v as Paper;
      localStorage.setItem('lucid-sentence:paper', paper);
      applyPaper();
    }),
    colors,
    chip('Magnifier', 'magnifier', () => {
      const on = !strip.open;
      if (on && !view.draw) setDraw(true, 'pen');
      strip.toggle(on);
      syncNotesbar();
      scheduleLayout();
      if (on)
        toast(
          'Magnifier: write large in the strip; it lands small in the box on the page. ↵ moves to the next line.',
          4200,
        );
    }),
    chip('Convert to text', 'convert', (b) => {
      void handwriting.convert(b);
    }),
    chip('Search ink', 'search', (b) => {
      handwriting.search(b);
    }),
  );
  notesbar.replaceChildren(scroll, close);
}
function syncNotesbar(): void {
  const input = view.draw ? 'write' : 'type';
  for (const b of notesbar.querySelectorAll<HTMLElement>('[data-seg="Input"] .seg__btn'))
    b.setAttribute('aria-checked', String(b.dataset['value'] === input));
  for (const b of notesbar.querySelectorAll<HTMLElement>('[data-seg="Paper"] .seg__btn'))
    b.setAttribute('aria-checked', String(b.dataset['value'] === paper));
  for (const b of notesbar.querySelectorAll<HTMLElement>('[data-paper-color]'))
    b.setAttribute('aria-checked', String(b.dataset['paperColor'] === paperColor));
  notesbar
    .querySelector('[data-notes="magnifier"]')
    ?.setAttribute('aria-pressed', String(strip.open));
}
{
  const savedPaper = localStorage.getItem('lucid-sentence:paper');
  if (savedPaper && PAPERS.some((p) => p.id === savedPaper)) paper = savedPaper as Paper;
  const savedColor = localStorage.getItem('lucid-sentence:paper-color');
  if (savedColor && PAPER_COLORS.some((c) => c.id === savedColor)) paperColor = savedColor;
}
buildNotesbar();
function applyPaper(): void {
  const on = document.body.classList.contains('notes');
  pageEl.dataset['paper'] = on ? paper : '';
  const c = PAPER_COLORS.find((x) => x.id === paperColor);
  if (on && c && c.id !== 'white') pageEl.style.setProperty('--note-paper', c.color);
  else pageEl.style.removeProperty('--note-paper');
  pageEl.classList.toggle('paper-night', on && paperColor === 'night');
  strip.root.style.setProperty('--note-paper', on && c ? c.color : '#fff');
  strip.root.classList.toggle('strip--night', on && paperColor === 'night');
}
/** Notes mode collapsed the ribbon (short screens) and should restore it on exit. */
let notesCollapsedRibbon = false;
function setNotes(on: boolean): void {
  document.body.classList.toggle('notes', on);
  $('#notes-toggle').setAttribute('aria-pressed', String(on));
  notesbar.hidden = !on;
  timeline.show(on);
  // Tablets in landscape (~640 px tall): the ribbon, notes bar, and timeline would leave
  // a sliver of page. Collapse the ribbon to its tab row while taking notes.
  if (on && !ribbon.collapsed && ribbon.layout !== 'phone' && window.innerHeight < 900) {
    ribbon.toggleCollapsed(true);
    notesCollapsedRibbon = true;
  } else if (!on && notesCollapsedRibbon) {
    if (ribbon.collapsed) ribbon.toggleCollapsed(false);
    notesCollapsedRibbon = false;
  }
  if (on) {
    setDraw(true, ink.tool === 'lasso' || ink.tool.includes('eraser') ? 'pen' : ink.tool);
  } else {
    strip.toggle(false);
    setDraw(false);
  }
  applyPaper();
  syncNotesbar();
  $('#mode').textContent = on ? 'Notes mode' : '';
  scheduleLayout();
}
tap($('#notes-toggle'), () => {
  if (engine.active) {
    toast(
      'Notes mode and ink work on notes pages for now (File > New > Blank notes page). Ink in .docx files comes later in M1.',
      5200,
    );
    return;
  }
  setNotes(!document.body.classList.contains('notes'));
});

// ── Keyboard shortcuts (registry shortcuts for wired commands + app keys)
const keyOf = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  let k = e.key.toLowerCase();
  if (e.code.startsWith('Key')) k = e.code.slice(3).toLowerCase();
  else if (e.code.startsWith('Digit')) k = e.code.slice(5);
  else if (e.code === 'Equal') k = '=';
  else if (e.code === 'BracketLeft') k = '[';
  else if (e.code === 'BracketRight') k = ']';
  parts.push(k);
  return parts.join('+');
};
const SHORTCUTS = new Map<string, string>();
for (const r of allCommands()) {
  const s = r.command.shortcut;
  if (!s || !WIRED.has(r.command.id) || r.tab.kind === 'contextual') continue;
  const norm = s.toLowerCase().replace(/\s/g, '');
  if (!SHORTCUTS.has(norm)) SHORTCUTS.set(norm, r.command.id);
}
SHORTCUTS.set('ctrl+shift+.', 'home.font.grow');
SHORTCUTS.set('ctrl+shift+,', 'home.font.shrink');

document.addEventListener('keydown', (e) => {
  const k = keyOf(e);
  const inDoc = doc.contains(document.activeElement) || document.activeElement === doc;
  const inField = !inDoc && (document.activeElement?.matches('input, textarea, select') ?? false);
  if (k === 'alt+q' || (k === 'ctrl+k' && !inDoc)) {
    e.preventDefault();
    palette.open();
    return;
  }
  if (k === 'ctrl+f1') {
    e.preventDefault();
    ribbon.toggleCollapsed();
    return;
  }
  if (e.key === 'Escape' && !popoverOpen() && !palette.root.open) {
    if (!$('#findpanel').hidden) {
      find.close();
    } else if (view.focus || view.read) {
      view.focus = false;
      view.read = false;
      applyView();
    } else if (document.body.classList.contains('notes')) {
      setNotes(false);
    } else if (view.draw) {
      setDraw(false);
    } else if (stage.classList.contains('backstage')) {
      backToDoc();
    }
    return;
  }
  if (inField) return;
  if (engine.active) {
    engineKey(e, k);
    return;
  }
  if (k === 'ctrl+z' || k === 'ctrl+y' || k === 'ctrl+shift+z') {
    e.preventDefault();
    if (k === 'ctrl+z') history.undo();
    else history.redo();
    refresh();
    return;
  }
  if (k === 'ctrl+s') {
    e.preventDefault();
    save();
    return;
  }
  if (k === 'ctrl+p') {
    e.preventDefault();
    window.print();
    return;
  }
  if (k === 'ctrl+n' || k === 'ctrl+o' || k === 'ctrl+w') return; // reserved by browsers; desktop shell handles these
  const id = SHORTCUTS.get(k);
  if (id) {
    e.preventDefault();
    closePopover();
    run(id);
  }
});

// ── Document engine (ONLYOFFICE sdkjs + x2t): real .docx files, see engine/README.md
function engineKey(e: KeyboardEvent, k: string): void {
  const go = (fn: () => void): void => {
    e.preventDefault();
    closePopover();
    fn();
  };
  if (k === 'ctrl+s') go(save);
  else if (k === 'f12') go(() => void saveDocx(true));
  else if (k === 'ctrl+o')
    go(() => {
      openBackstage('file.rail.open');
    });
  else if (k === 'ctrl+p')
    go(() => {
      toast('Printing .docx files comes later in M1.');
    });
  else if (k === 'ctrl+z' || k === 'ctrl+y' || k === 'ctrl+shift+z')
    go(() => {
      engine.run((api) => {
        if (k === 'ctrl+z') api.Undo();
        else api.Redo();
      });
    });
  else {
    const id = SHORTCUTS.get(k) ?? ENGINE_SHORTCUTS.get(k);
    if (id && engineHandlers[id])
      go(() => {
        run(id);
      });
  }
}
const ENGINE_SHORTCUTS = new Map<string, string>();
for (const r of allCommands()) {
  const sc = r.command.shortcut;
  if (sc && ENGINE_WIRED.has(r.command.id))
    ENGINE_SHORTCUTS.set(sc.toLowerCase().replace(/\s/g, ''), r.command.id);
}
engine.addEventListener('state', () => {
  refresh();
});
engine.addEventListener('key', (ev) => {
  const e = (ev as CustomEvent<KeyboardEvent>).detail;
  const k = keyOf(e);
  if (k === 'alt+q' || k === 'ctrl+k') {
    palette.open();
    return;
  }
  if (k === 'ctrl+f1') {
    ribbon.toggleCollapsed();
    return;
  }
  engineKey(e, k);
});

// OS "Open With" / file association (desktop app): open the files for real.
async function openPath(path: string): Promise<void> {
  try {
    await openDocx(await files.readPath(path));
  } catch {
    toast(`Couldn't read ${files.nameFromPath(path)}.`);
  }
}

// ── Demo controls (theme, page color, layout)
function radios(name: string, apply: (value: string) => void): void {
  const inputs = [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
  const match = inputs.find((i) => i.value === params.get(name));
  if (match) match.checked = true;
  for (const i of inputs) {
    i.addEventListener('change', () => {
      apply(i.value);
    });
  }
  apply(inputs.find((i) => i.checked)?.value ?? inputs[0]!.value);
}
radios('theme', (v) => {
  document.documentElement.dataset['theme'] = v;
  ribbon.setAttribute('theme', v);
  splash.setAttribute('theme', v);
});
radios('paper', (v) => {
  view.paperDark = v === 'dark';
  applyView();
});
const layoutSel = $('#layout') as HTMLSelectElement;
if (params.get('layout') && [...layoutSel.options].some((o) => o.value === params.get('layout')))
  layoutSel.value = params.get('layout')!;
const applyLayout = (): void => {
  ribbon.setAttribute('layout', layoutSel.value);
  stage.dataset['layout'] = layoutSel.value;
  document.body.dataset['layout'] = ribbon.layout;
  placePenToolbar();
};
layoutSel.addEventListener('change', applyLayout);
applyLayout();

// ── Startup
if (IS_MAC) document.body.classList.add('mac');
new ResizeObserver(() => {
  document.body.dataset['layout'] = ribbon.layout;
  placePenToolbar();
  if (view.zoomFit || canvas.clientWidth < geometry(pageSetup).width + 300) setZoom('fit');
}).observe(canvas);
layout();
applyView();
comments.render();
refresh();
if (params.get('notes') === '1') setNotes(true);
initPlatform(toast, (paths) => {
  // One window holds one document for now: open the first, mention the rest.
  const [first, ...rest] = paths;
  if (first) void openPath(first);
  if (rest.length)
    toast(`Opened ${files.nameFromPath(first!)}. Open the others one at a time for now.`);
});
if (params.get('tab')) ribbon.activeTab = params.get('tab') as TabId;
void document.fonts.ready.then(() => {
  layout();
});

// Apple Pencil double-tap / squeeze (native iPad app only; see editor/ink/pencil.ts).
let toolBeforeEraser: InkTool = 'pen';
connectPencil((e) => {
  const cmd = pencilCommand(e);
  if (!cmd) return;
  if (!view.draw) setDraw(true);
  if (cmd === 'toggle-eraser' || cmd === 'previous-tool') {
    const erasing = ink.tool === 'eraser' || ink.tool === 'point-eraser';
    if (!erasing) toolBeforeEraser = ink.tool;
    setDraw(true, erasing ? toolBeforeEraser : 'eraser');
  } else {
    pen.show(true);
  }
  refresh();
});

// .docx ink (InkML) behind the `inkdocx` flag until the engine's docx writer lands (M1).
const inkDocx = inkDocxEnabled()
  ? {
      inkml: () => strokesToInkML(ink.strokes),
      parts: () => buildInkDocxParts(ink.strokes),
      read: (xml: string) => inkMLToStrokes(xml).strokes,
    }
  : undefined;

// Test hooks (used by Playwright e2e tests; harmless in production builds).
Object.assign(window, {
  __ls: {
    app,
    ink,
    audio,
    timeline,
    history,
    ribbon,
    palette,
    run,
    setNotes,
    toast,
    inkDocx,
    strip,
    pen,
    handwriting,
    engine,
  },
});
