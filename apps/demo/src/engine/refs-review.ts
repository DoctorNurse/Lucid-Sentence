/**
 * References, Review and Layout ribbon commands on the ONLYOFFICE engine:
 * table of contents, footnotes and endnotes, captions, cross-references,
 * comments, Track Changes, Compare, word count, read aloud, proofing language,
 * columns and breaks. The engine work happens in the sdkjs bridge
 * (engine/sdkjs-addon/lucid/bridge.js); this module is the UI around it.
 */
import type { CommandEventDetail } from '@lucid-sentence/ribbon-ui';
import {
  closePopover,
  el,
  form,
  gallery,
  menu,
  openPopover,
  tap,
  type MenuEntry,
} from '../editor/ui.js';
import type { EngineApp } from './commands.js';
import { ReviewMode, TocStyle, type EngineComment } from './sdk.js';

type Handler = (a: EngineApp, d: CommandEventDetail) => void;

function pop(d: CommandEventDetail, content: HTMLElement, label: string, wide = false): void {
  openPopover(d.anchor, content, { label, focus: !d.anchor, role: 'dialog', wide });
}

// ── References › Table of Contents ─────────────────────────────────────────

/** Word's built-in tables, mapped onto the engine's TOC styles. */
export const TOC_STYLES: { label: string; style: number; levels: number }[] = [
  { label: 'Automatic Table 1', style: TocStyle.Standard, levels: 3 },
  { label: 'Automatic Table 2', style: TocStyle.Simple, levels: 3 },
  { label: 'Modern', style: TocStyle.Modern, levels: 3 },
  { label: 'Classic', style: TocStyle.Classic, levels: 3 },
  { label: 'Web (links, no page numbers)', style: TocStyle.Web, levels: 3 },
  { label: 'Two levels', style: TocStyle.Standard, levels: 2 },
];

function tocPreview(style: number): HTMLElement {
  const row = (text: string, lvl: number): HTMLElement =>
    el(
      'div',
      { class: `toc-prev__row toc-prev__row--${lvl}` },
      el('span', {}, text),
      style === TocStyle.Web ? null : el('span', { class: 'toc-prev__dots' }),
      style === TocStyle.Web ? null : el('span', {}, String(lvl + 1)),
    );
  return el(
    'div',
    { class: `toc-prev toc-prev--${style}` },
    el('div', { class: 'toc-prev__title' }, 'Contents'),
    row('Heading 1', 0),
    row('Heading 2', 1),
    row('Heading 3', 2),
  );
}

const tableOfContents: Handler = (a, d) => {
  const has = a.engine.peek((b, api) => b.hasToc(api)) ?? false;
  const box = el('div', {});
  box.append(
    gallery(
      TOC_STYLES.map((t) => ({
        label: t.label,
        preview: tocPreview(t.style),
        run: () => {
          a.engine.b((b, api) => {
            b.insertToc(api, t.style, t.levels);
          });
          a.toast(
            has
              ? `Table of contents: ${t.label}`
              : 'Table of contents inserted from your headings.',
          );
        },
      })),
      2,
    ),
    menu([
      'sep',
      {
        label: 'Update Table',
        disabled: !has,
        run: () => {
          updateToc(a);
        },
      },
      {
        label: 'Remove Table of Contents',
        disabled: !has,
        run: () => {
          a.engine.b((b, api) => b.removeToc(api));
          a.toast('Table of contents removed.');
        },
      },
    ]),
  );
  pop(d, box, 'Table of Contents', true);
};

function updateToc(a: EngineApp): void {
  const ok = a.engine.b((b, api) => b.updateToc(api, false));
  a.toast(
    ok ? 'Table of contents updated.' : 'There is no table of contents yet. Insert one first.',
  );
}

const addText: Handler = (a, d) => {
  const levels: MenuEntry[] = [
    {
      label: 'Do Not Show in Table of Contents',
      run: () => {
        a.engine.b((_b, api) => {
          api.asc_AddParagraphToTOC(0);
        });
      },
    },
  ];
  for (let i = 1; i <= 3; i++)
    levels.push({
      label: `Level ${i}`,
      run: () => {
        a.engine.b((_b, api) => {
          api.asc_AddParagraphToTOC(i);
        });
      },
    });
  pop(d, menu(levels), 'Add Text');
};

// ── References › Footnotes ────────────────────────────────────────────────

const noteNav: Handler = (a, d) => {
  const go = (endnote: boolean, next: boolean): void => {
    const ok = a.engine.b((b, api) => b.gotoNote(api, endnote, next));
    if (!ok)
      a.toast(endnote ? 'This document has no endnotes.' : 'This document has no footnotes.');
  };
  pop(
    d,
    menu([
      {
        label: 'Next Footnote',
        run: () => {
          go(false, true);
        },
      },
      {
        label: 'Previous Footnote',
        run: () => {
          go(false, false);
        },
      },
      {
        label: 'Next Endnote',
        run: () => {
          go(true, true);
        },
      },
      {
        label: 'Previous Endnote',
        run: () => {
          go(true, false);
        },
      },
    ]),
    'Next Footnote',
  );
};

const showNotes: Handler = (a) => {
  const n = a.engine.peek((b, api) => b.noteCounts(api));
  if (!n || (!n.footnotes && !n.endnotes)) {
    a.toast('This document has no footnotes or endnotes yet.');
    return;
  }
  // Footnotes sit at the bottom of their page, endnotes at the end of the document.
  a.engine.b((b, api) => b.gotoNote(api, !n.footnotes, true));
  a.toast(
    `${n.footnotes} footnote${n.footnotes === 1 ? '' : 's'}, ${n.endnotes} endnote${n.endnotes === 1 ? '' : 's'}. Moved to the first one.`,
  );
};

// ── References › Citations, Index, Authorities (not in the engine) ────────

const CITATIONS_NOTE =
  "Citations and bibliographies aren't available yet: the document engine can't create or edit them. Bibliographies already in a file still show, and are kept when you save.";
const INDEX_NOTE =
  "Index entries and indexes aren't available yet: the document engine doesn't support them. Ones already in a file are kept when you save.";
const TOA_NOTE =
  "Tables of authorities aren't available yet: the document engine doesn't support them. Ones already in a file are kept when you save.";

// ── References › Captions ─────────────────────────────────────────────────

const CAPTION_LABELS = ['Figure', 'Table', 'Equation'];

const insertCaption: Handler = (a, d) => {
  const st = a.engine.state;
  const def = st.inTable ? 'Table' : 'Figure';
  const f = el('form', { class: 'pop__form', 'data-testid': 'caption-form' });
  const label = el('select', { name: 'label', class: 'pop__input' });
  for (const l of CAPTION_LABELS) {
    const o = el('option', { value: l }, l);
    if (l === def) o.selected = true;
    label.append(o);
  }
  const pos = el('select', { name: 'pos', class: 'pop__input' });
  pos.append(
    el('option', { value: 'below' }, 'Below selected item'),
    el('option', { value: 'above' }, 'Above selected item'),
  );
  if (def === 'Table') pos.value = 'above';
  const exclude = el('input', { type: 'checkbox', name: 'exclude' });
  f.append(
    el('label', { class: 'pop__field' }, el('span', {}, 'Label'), label),
    el('label', { class: 'pop__field' }, el('span', {}, 'Position'), pos),
    el('label', { class: 'pop__check' }, exclude, ' Exclude label from caption'),
    el(
      'div',
      { class: 'pop__actions' },
      el('button', { type: 'submit', class: 'btn btn--primary' }, 'Insert'),
    ),
  );
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    closePopover();
    a.engine.b((b, api) => {
      b.insertCaption(api, label.value, pos.value === 'below', exclude.checked);
    });
  });
  pop(d, f, 'Insert Caption');
};

const tableOfFigures: Handler = (a, d) => {
  pop(
    d,
    menu(
      CAPTION_LABELS.map((l) => ({
        label: `Table of ${l === 'Figure' ? 'Figures' : l === 'Table' ? 'Tables' : 'Equations'}`,
        run: () => {
          a.engine.b((b, api) => {
            b.insertTableOfFigures(api, l);
          });
        },
      })),
    ),
    'Insert Table of Figures',
  );
};

const updateFigures: Handler = (a) => {
  const ok = a.engine.b((b, api) => b.updateTablesOfFigures(api));
  if (!ok) updateToc(a);
};

const REF_KINDS: { id: string; label: string; what: { id: string; label: string }[] }[] = [
  {
    id: 'heading',
    label: 'Heading',
    what: [
      { id: 'text', label: 'Heading text' },
      { id: 'page', label: 'Page number' },
      { id: 'aboveBelow', label: 'Above/below' },
    ],
  },
  ...CAPTION_LABELS.map((l) => ({
    id: l,
    label: l,
    what: [
      { id: 'number', label: 'Label and number' },
      { id: 'text', label: 'Caption text only' },
      { id: 'page', label: 'Page number' },
      { id: 'aboveBelow', label: 'Above/below' },
    ],
  })),
  {
    id: 'footnote',
    label: 'Footnote',
    what: [
      { id: 'number', label: 'Footnote number' },
      { id: 'page', label: 'Page number' },
    ],
  },
  {
    id: 'endnote',
    label: 'Endnote',
    what: [
      { id: 'number', label: 'Endnote number' },
      { id: 'page', label: 'Page number' },
    ],
  },
];

const crossReference: Handler = (a, d) => {
  const f = el('form', { class: 'pop__form', 'data-testid': 'xref-form' });
  const kind = el('select', { name: 'kind', class: 'pop__input', 'aria-label': 'Reference type' });
  for (const k of REF_KINDS) kind.append(el('option', { value: k.id }, k.label));
  const what = el('select', {
    name: 'what',
    class: 'pop__input',
    'aria-label': 'Insert reference to',
  });
  const list = el('select', {
    name: 'target',
    class: 'pop__input pop__list',
    size: '6',
    'aria-label': 'For which',
  });
  const insert = el('button', { type: 'submit', class: 'btn btn--primary' }, 'Insert');
  const fill = (): void => {
    const k = REF_KINDS.find((x) => x.id === kind.value)!;
    what.replaceChildren(...k.what.map((w) => el('option', { value: w.id }, w.label)));
    const items = a.engine.peek((b, api) => b.crossRefTargets(api, k.id)) ?? [];
    list.replaceChildren(...items.map((t, i) => el('option', { value: String(i) }, t)));
    if (items.length) list.selectedIndex = 0;
    else
      list.append(el('option', { disabled: '' }, `No ${k.label.toLowerCase()}s in this document`));
    insert.disabled = !items.length;
  };
  kind.addEventListener('change', fill);
  fill();
  f.append(
    el('label', { class: 'pop__field' }, el('span', {}, 'Reference type'), kind),
    el('label', { class: 'pop__field' }, el('span', {}, 'Insert reference to'), what),
    el('label', { class: 'pop__field' }, el('span', {}, 'For which'), list),
    el('div', { class: 'pop__actions' }, insert),
  );
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const i = Number(list.value);
    if (!Number.isFinite(i)) return;
    closePopover();
    a.engine.b((b, api) => b.insertCrossRef(api, kind.value, i, what.value));
  });
  pop(d, f, 'Cross-reference', true);
};

// ── Review › Comments ─────────────────────────────────────────────────────

function when(t: number): string {
  if (!t) return '';
  return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const newComment: Handler = (a, d) => {
  const f = form(
    [{ name: 'text', label: `Comment as ${a.author()}`, placeholder: 'Write a comment' }],
    'Post',
    (v) => {
      const text = (v.text ?? '').trim();
      if (!text) return;
      a.engine.b((b, api) => b.addComment(api, text, a.author()));
    },
  );
  f.dataset.testid = 'comment-form';
  pop(d, f, 'New Comment');
};

/** The Comments pane: every comment with reply, resolve and delete. */
export function commentsPane(a: EngineApp, d: CommandEventDetail): void {
  const box = el('div', { class: 'cpane', 'data-testid': 'comments-pane' });
  const render = (): void => {
    const list = a.engine.peek((b, api) => b.commentList(api)) ?? [];
    box.replaceChildren(
      el(
        'div',
        { class: 'pop__heading' },
        list.length ? `Comments (${list.length})` : 'No comments yet',
      ),
    );
    for (const c of list) box.append(card(c));
    if (!list.length)
      box.append(
        el('p', { class: 'cpane__empty' }, 'Select some text, then Review › New Comment.'),
      );
  };
  const btn = (label: string, fn: () => void, testid?: string): HTMLButtonElement => {
    const b = el(
      'button',
      { type: 'button', class: 'btn btn--chip', 'data-testid': testid },
      label,
    );
    tap(b, fn);
    return b;
  };
  const card = (c: EngineComment): HTMLElement => {
    const reply = el('input', { class: 'pop__input', placeholder: 'Reply', 'aria-label': 'Reply' });
    const replyForm = el('form', { class: 'cpane__reply' }, reply);
    replyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = reply.value.trim();
      if (!text) return;
      a.engine.peek((b, api) => b.replyComment(api, c.id, text, a.author()));
      render();
    });
    return el(
      'article',
      { class: `cpane__card${c.solved ? ' cpane__card--solved' : ''}`, 'data-comment': c.id },
      el(
        'header',
        { class: 'cpane__who' },
        el('strong', {}, c.author || 'Author'),
        el('time', {}, when(c.time)),
      ),
      c.quote ? el('blockquote', { class: 'cpane__quote' }, c.quote) : null,
      el('p', { class: 'cpane__text' }, c.text),
      ...c.replies.map((r) =>
        el(
          'div',
          { class: 'cpane__replyrow' },
          el('strong', {}, r.author || 'Author'),
          ' ',
          r.text,
        ),
      ),
      c.solved ? el('p', { class: 'cpane__resolved' }, 'Resolved') : null,
      replyForm,
      el(
        'div',
        { class: 'cpane__actions' },
        btn('Go to', () => {
          a.engine.b((b, api) => b.gotoComment(api, true, c.id));
        }),
        btn(
          c.solved ? 'Reopen' : 'Resolve',
          () => {
            a.engine.peek((b, api) => b.resolveComment(api, c.id, !c.solved));
            render();
          },
          'comment-resolve',
        ),
        btn(
          'Delete',
          () => {
            a.engine.peek((b, api) => {
              b.removeComment(api, c.id);
            });
            render();
          },
          'comment-delete',
        ),
      ),
    );
  };
  render();
  pop(d, box, 'Comments', true);
}

const deleteComment: Handler = (a, d) => {
  pop(
    d,
    menu([
      {
        label: 'Delete',
        run: () => {
          const id = a.engine.peek((b, api) => b.currentComment(api));
          if (!id) {
            a.toast('Go to a comment first (Review › Next), then Delete.');
            return;
          }
          a.engine.b((b, api) => {
            b.removeComment(api, id);
          });
        },
      },
      {
        label: 'Delete All Comments in Document',
        run: () => {
          a.engine.b((b, api) => {
            b.removeAllComments(api);
          });
        },
      },
    ]),
    'Delete',
  );
};

const gotoComment =
  (next: boolean): Handler =>
  (a) => {
    const id = a.engine.b((b, api) => b.gotoComment(api, next));
    if (!id) a.toast('This document has no comments.');
  };

// ── Review › Tracking and Changes ─────────────────────────────────────────

const trackChanges: Handler = (a) => {
  const on = !a.engine.state.track;
  a.engine.b((b, api) => {
    b.setTrack(api, on);
  });
  a.engine.state.track = on;
  a.toast(on ? 'Track Changes is on. Your edits are marked.' : 'Track Changes is off.');
};

export const DISPLAY_MODES: { label: string; mode: number; detail: string }[] = [
  {
    label: 'Simple Markup',
    mode: ReviewMode.Simple,
    detail: 'Shows the edited text, with a mark where it changed',
  },
  { label: 'All Markup', mode: ReviewMode.All, detail: 'Shows every insertion and deletion' },
  {
    label: 'No Markup',
    mode: ReviewMode.NoMarkup,
    detail: 'Shows the document as if all changes were accepted',
  },
  { label: 'Original', mode: ReviewMode.Original, detail: 'Shows the document before the changes' },
];

const displayForReview: Handler = (a, d) => {
  const cur = a.engine.state.reviewMode;
  pop(
    d,
    menu(
      DISPLAY_MODES.map((m) => ({
        label: m.label,
        detail: m.detail,
        checked: m.mode === cur,
        run: () => {
          a.engine.b((b, api) => {
            b.setDisplayMode(api, m.mode);
          });
          a.engine.state.reviewMode = m.mode;
        },
      })),
    ),
    'Display for Review',
  );
};

let commentsShown = true;
const showMarkup: Handler = (a, d) => {
  pop(
    d,
    menu([
      {
        label: 'Comments',
        checked: commentsShown,
        run: () => {
          commentsShown = !commentsShown;
          a.engine.b((_b, api) => {
            if (commentsShown) api.asc_showComments(true);
            else api.asc_hideComments();
          });
        },
      },
      'sep',
      ...DISPLAY_MODES.slice(0, 2).map((m) => ({
        label: `Insertions and Deletions (${m.label})`,
        checked: a.engine.state.reviewMode === m.mode,
        run: () => {
          a.engine.b((b, api) => {
            b.setDisplayMode(api, m.mode);
          });
          a.engine.state.reviewMode = m.mode;
        },
      })),
    ]),
    'Show Markup',
  );
};

const change =
  (accept: boolean): Handler =>
  (a, d) => {
    const n = a.engine.peek((b, api) => b.revisionCount(api)) ?? 0;
    const run = (which: 'next' | 'this' | 'all'): void => {
      if (!n) {
        a.toast('There are no tracked changes in this document.');
        return;
      }
      a.engine.b((b, api) => {
        if (accept) b.acceptChange(api, which);
        else b.rejectChange(api, which);
      });
    };
    const verb = accept ? 'Accept' : 'Reject';
    pop(
      d,
      menu([
        {
          label: `${verb} and Move to Next`,
          run: () => {
            run('next');
          },
        },
        {
          label: `${verb} This Change`,
          run: () => {
            run('this');
          },
        },
        {
          label: `${verb} All Changes`,
          detail: n ? `${n} in this document` : 'None',
          run: () => {
            run('all');
          },
        },
      ]),
      verb,
    );
  };

const gotoChange =
  (next: boolean): Handler =>
  (a) => {
    const ok = a.engine.b((b, api) => b.gotoChange(api, next));
    if (!ok) a.toast('There are no tracked changes in this document.');
  };

const reviewingPane: Handler = (a, d) => {
  commentsPane(a, d);
};

const compare: Handler = (a) => {
  void (async () => {
    const f = await a.pickDocx();
    if (!f) return;
    a.toast(`Comparing with ${f.name}…`);
    try {
      await a.engine.compareWith(f.bytes);
      a.toast(
        `Compared with ${f.name}. The differences are tracked changes: review them with Accept and Reject.`,
        6000,
      );
    } catch (e) {
      console.error(e);
      a.toast(`Couldn't compare with ${f.name}.`);
    }
  })();
};

// ── Review › Proofing, Speech, Language ───────────────────────────────────

export function countText(paras: string[]): {
  words: number;
  chars: number;
  charsNoSpaces: number;
  paragraphs: number;
  lines: number;
} {
  let words = 0;
  let chars = 0;
  let noSp = 0;
  let paragraphs = 0;
  for (const p of paras) {
    words += (p.match(/\S+/g) ?? []).length;
    chars += p.length;
    noSp += p.replace(/\s/g, '').length;
    if (p.trim()) paragraphs++;
  }
  return { words, chars, charsNoSpaces: noSp, paragraphs, lines: paras.length };
}

const wordCount: Handler = (a, d) => {
  const sel = a.engine.peek((b, api) => b.selectedText(api)) ?? '';
  const all = a.engine.paragraphs().map((p) => p.text);
  const c = sel.trim() ? countText(sel.split('\n')) : countText(all);
  const rows: [string, string][] = [
    ['Pages', String(a.engine.state.pages || 1)],
    ['Words', c.words.toLocaleString()],
    ['Characters (no spaces)', c.charsNoSpaces.toLocaleString()],
    ['Characters (with spaces)', c.chars.toLocaleString()],
    ['Paragraphs', c.paragraphs.toLocaleString()],
  ];
  const dl = el('dl', { class: 'pop__stats', 'data-testid': 'word-count' });
  for (const [k, v] of rows) dl.append(el('dt', {}, k), el('dd', {}, v));
  pop(
    d,
    el(
      'div',
      {},
      el('div', { class: 'pop__heading' }, sel.trim() ? 'Statistics (selection)' : 'Statistics'),
      dl,
    ),
    'Word Count',
  );
};

/** Voices that work offline (installed on the device). */
export function offlineVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter((v) => v.localService);
}

let speaking = false;
export const isReadingAloud = (): boolean => speaking;

const readAloud: Handler = (a) => {
  if (!('speechSynthesis' in window)) {
    a.toast("Read Aloud isn't available here: this device has no speech voices.");
    return;
  }
  if (speaking) {
    speechSynthesis.cancel();
    speaking = false;
    a.refresh();
    return;
  }
  const sel = a.engine.peek((b, api) => b.selectedText(api)) ?? '';
  const text = sel.trim()
    ? sel
    : a.engine
        .paragraphs()
        .map((p) => p.text)
        .join('\n');
  if (!text.trim()) {
    a.toast('There is nothing to read yet.');
    return;
  }
  const voices = offlineVoices();
  const lang = navigator.language || 'en-US';
  const voice =
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.startsWith(lang.slice(0, 2))) ??
    voices[0];
  if (!voice) {
    a.toast(
      "Read Aloud needs a voice installed on this device (it doesn't use online voices). Add one in your system's text-to-speech settings.",
      7000,
    );
    return;
  }
  // Long text in one utterance stops early on some engines; speak paragraph by paragraph.
  const parts = text.split(/\n+/).filter((p) => p.trim());
  speaking = true;
  a.refresh();
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.voice = voice;
    u.lang = voice.lang;
    if (i === parts.length - 1)
      u.onend = u.onerror = () => {
        speaking = false;
        a.refresh();
      };
    speechSynthesis.speak(u);
  });
  a.toast(`Reading aloud with ${voice.name}. Choose Read Aloud again to stop.`);
};

/** Proofing languages: the ones with a spell-check dictionary in the app. */
export const LANGUAGES: { label: string; lcid: number }[] = [
  { label: 'English (United States)', lcid: 1033 },
  { label: 'English (United Kingdom)', lcid: 2057 },
  { label: 'Spanish (Spain)', lcid: 3082 },
  { label: 'French (France)', lcid: 1036 },
  { label: 'German (Germany)', lcid: 1031 },
  { label: 'Portuguese (Brazil)', lcid: 1046 },
];

const language: Handler = (a, d) => {
  const entries: MenuEntry[] = [{ heading: 'Set proofing language for the selection' }];
  for (const l of LANGUAGES)
    entries.push({
      label: l.label,
      run: () => {
        a.engine.b((b, api) => {
          b.setLanguage(api, l.lcid, false);
        });
        a.toast(`Proofing language: ${l.label}`);
      },
    });
  entries.push('sep', { heading: 'Default for this document' });
  for (const l of LANGUAGES)
    entries.push({
      label: l.label,
      run: () => {
        a.engine.b((b, api) => {
          b.setLanguage(api, l.lcid, true);
        });
        a.toast(`Document language: ${l.label}`);
      },
    });
  pop(d, menu(entries), 'Language');
};

// ── Layout › Columns, Breaks ──────────────────────────────────────────────

const columns: Handler = (a, d) => {
  const n = a.engine.peek((b, api) => b.columnCount(api)) ?? 1;
  const opts: { label: string; kind: 'one' | 'two' | 'three' | 'left' | 'right'; n: number }[] = [
    { label: 'One', kind: 'one', n: 1 },
    { label: 'Two', kind: 'two', n: 2 },
    { label: 'Three', kind: 'three', n: 3 },
    { label: 'Left', kind: 'left', n: 0 },
    { label: 'Right', kind: 'right', n: 0 },
  ];
  pop(
    d,
    menu(
      opts.map((o) => ({
        label: o.label,
        checked: o.n ? o.n === n : undefined,
        run: () => {
          a.engine.b((b, api) => {
            b.setColumns(api, o.kind);
          });
        },
      })),
    ),
    'Columns',
  );
};

const breaks: Handler = (a, d) => {
  type K = 'page' | 'column' | 'next' | 'continuous' | 'even' | 'odd';
  const item = (label: string, kind: K, detail: string): MenuEntry => ({
    label,
    detail,
    run: () => {
      a.engine.b((b, api) => {
        b.insertBreak(api, kind);
      });
    },
  });
  pop(
    d,
    menu([
      { heading: 'Page Breaks' },
      item('Page', 'page', 'Start the next text on a new page'),
      item('Column', 'column', 'Continue in the next column'),
      { heading: 'Section Breaks' },
      item('Next Page', 'next', 'New section on the next page'),
      item('Continuous', 'continuous', 'New section on the same page'),
      item('Even Page', 'even', 'New section on the next even page'),
      item('Odd Page', 'odd', 'New section on the next odd page'),
    ]),
    'Breaks',
  );
};

export const refsReviewHandlers: Record<string, Handler> = {
  // References
  'references.toc.table-of-contents': tableOfContents,
  'references.toc.add-text': addText,
  'references.toc.update-table': (a) => {
    updateToc(a);
  },
  'references.footnotes.insert-footnote': (a) => {
    a.engine.b((_b, api) => {
      api.asc_AddFootnote();
    });
  },
  'references.footnotes.insert-endnote': (a) => {
    a.engine.b((_b, api) => {
      api.asc_AddEndnote();
    });
  },
  'references.footnotes.next-footnote': noteNav,
  'references.footnotes.show-notes': showNotes,
  'references.captions.insert-caption': insertCaption,
  'references.captions.table-of-figures': tableOfFigures,
  'references.captions.update-table': updateFigures,
  'references.captions.cross-reference': crossReference,

  // Review
  'review.proofing.word-count': wordCount,
  'review.speech.read-aloud': readAloud,
  'review.language.language': language,
  'review.comments.new-comment': newComment,
  'review.comments.delete': deleteComment,
  'review.comments.previous': gotoComment(false),
  'review.comments.next': gotoComment(true),
  'review.comments.show-comments': commentsPane,
  'review.tracking.track-changes': trackChanges,
  'review.tracking.display-for-review': displayForReview,
  'review.tracking.show-markup': showMarkup,
  'review.tracking.reviewing-pane': reviewingPane,
  'review.changes.accept': change(true),
  'review.changes.reject': change(false),
  'review.changes.previous-change': gotoChange(false),
  'review.changes.next-change': gotoChange(true),
  'review.compare.compare': compare,

  // Layout
  'layout.page-setup.columns': columns,
  'layout.page-setup.breaks': breaks,
};

/** Commands the engine can't do, with what to tell the user instead of a generic note. */
export const ENGINE_UNSUPPORTED: Record<string, string> = {
  'references.citations.insert-citation': CITATIONS_NOTE,
  'references.citations.manage-sources': CITATIONS_NOTE,
  'references.citations.style': CITATIONS_NOTE,
  'references.citations.bibliography': CITATIONS_NOTE,
  'references.index.mark-entry': INDEX_NOTE,
  'references.index.insert-index': INDEX_NOTE,
  'references.index.update-index': INDEX_NOTE,
  'references.table-of-authorities.mark-citation': TOA_NOTE,
  'references.table-of-authorities.insert-toa': TOA_NOTE,
  'references.table-of-authorities.update-toa': TOA_NOTE,
};
