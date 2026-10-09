/** Comments: anchors in the text, balloons beside the page (Insert/Review → Comment). */
import { Trash } from 'lucide';
import type { EditorSurface } from './surface.js';
import { el, icon, tap, toast } from './ui.js';

export interface Comment {
  id: string;
  author: string;
  initials: string;
  text: string;
  created: number;
}

export class Comments {
  list: Comment[] = [
    {
      id: 'c1',
      author: 'R H',
      initials: 'RH',
      text: 'Link this to the fidelity eval results once M2 lands.',
      created: Date.now() - 2 * 3600_000,
    },
  ];
  visible = true;
  current: string | null = null;

  constructor(
    readonly aside: HTMLElement,
    readonly surface: EditorSurface,
    readonly onChange: () => void,
  ) {
    surface.root.addEventListener('click', (e) => {
      const m = (e.target as Element).closest<HTMLElement>('mark.d-comment');
      if (m?.dataset['comment']) this.focus(m.dataset['comment'], false);
    });
  }

  add(author = 'R H'): void {
    const r = this.surface.range();
    if (!r) return;
    if (r.collapsed) {
      // Comment on the word at the caret, like Word.
      const sel = document.getSelection();
      sel?.modify('move', 'backward', 'word');
      sel?.modify('extend', 'forward', 'word');
    }
    const range = this.surface.range();
    if (!range || range.collapsed) {
      toast('Select some text to comment on');
      return;
    }
    const id = `c${Date.now().toString(36)}`;
    const box = document.createElement('div');
    box.append(range.cloneContents());
    this.surface.insertHTML(`<mark class="d-comment" data-comment="${id}">${box.innerHTML}</mark>`);
    this.list.push({
      id,
      author,
      initials: author
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2),
      text: '',
      created: Date.now(),
    });
    this.visible = true;
    this.render();
    this.focus(id, true);
    this.onChange();
  }

  remove(id = this.current): void {
    if (!id) return;
    const mark = this.surface.root.querySelector<HTMLElement>(`mark[data-comment="${id}"]`);
    if (mark) mark.replaceWith(...mark.childNodes);
    this.list = this.list.filter((c) => c.id !== id);
    this.current = null;
    this.render();
    this.onChange();
  }

  step(dir: 1 | -1): void {
    const ids = this.ordered().map((c) => c.id);
    if (ids.length === 0) return;
    const i = this.current ? ids.indexOf(this.current) : -1;
    this.focus(ids[(i + dir + ids.length) % ids.length]!, false);
  }

  ordered(): Comment[] {
    const marks = [...this.surface.root.querySelectorAll<HTMLElement>('mark.d-comment')].map(
      (m) => m.dataset['comment'],
    );
    return this.list
      .filter((c) => marks.includes(c.id))
      .sort((a, b) => marks.indexOf(a.id) - marks.indexOf(b.id));
  }

  focus(id: string, edit: boolean): void {
    this.current = id;
    this.visible = true;
    this.render();
    const b = this.aside.querySelector<HTMLElement>(`[data-comment="${id}"]`);
    const anchor = this.surface.root.querySelector(`mark[data-comment="${id}"]`);
    anchor?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (edit) b?.querySelector('textarea')?.focus();
  }

  toggle(on = !this.visible): void {
    this.visible = on;
    this.render();
  }

  /** The markup column takes space only when comments are shown and the document has some. */
  get shown(): boolean {
    return this.visible && this.ordered().length > 0;
  }

  render(): void {
    this.aside.hidden = !this.visible;
    document.body.classList.toggle('comments-hidden', !this.visible);
    document.body.classList.toggle('no-comments', this.ordered().length === 0);
    const page = this.surface.root.closest<HTMLElement>('.page');
    let lastBottom = 0;
    this.aside.replaceChildren();
    for (const c of this.ordered()) {
      const mark = this.surface.root.querySelector<HTMLElement>(`mark[data-comment="${c.id}"]`);
      if (!mark || !page) continue;
      let top = mark.offsetTop;
      for (
        let p = mark.offsetParent as HTMLElement | null;
        p && p !== page;
        p = p.offsetParent as HTMLElement | null
      )
        top += p.offsetTop;
      top = Math.max(top - 8, lastBottom + 8);
      const del = el('button', {
        type: 'button',
        class: 'balloon__del',
        'aria-label': 'Delete comment',
      });
      del.append(icon(Trash, 14));
      tap(del, () => {
        this.remove(c.id);
      });
      const text = el('textarea', {
        class: 'balloon__input',
        rows: '2',
        'aria-label': `Comment by ${c.author}`,
        placeholder: 'Add a comment…',
      });
      text.value = c.text;
      text.addEventListener('input', () => {
        c.text = text.value;
      });
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          this.surface.focus();
        }
      });
      const mins = Math.round((Date.now() - c.created) / 60000);
      const b = el(
        'article',
        {
          class: `balloon${c.id === this.current ? ' is-current' : ''}`,
          'data-comment': c.id,
          style: `top:${top}px`,
          'aria-label': `Comment by ${c.author}`,
        },
        el(
          'div',
          { class: 'balloon__head' },
          el('span', { class: 'balloon__avatar', 'aria-hidden': 'true' }, c.initials),
          el('span', { class: 'balloon__who' }, c.author),
          el(
            'span',
            { class: 'balloon__when' },
            mins < 1 ? 'now' : mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`,
          ),
          del,
        ),
        text,
      );
      b.addEventListener('focusin', () => {
        this.current = c.id;
        for (const x of this.aside.querySelectorAll('.balloon'))
          x.classList.toggle('is-current', x === b);
      });
      this.aside.append(b);
      lastBottom = top + 84;
    }
    for (const m of this.surface.root.querySelectorAll<HTMLElement>('mark.d-comment')) {
      m.classList.toggle('is-current', m.dataset['comment'] === this.current);
    }
  }
}
