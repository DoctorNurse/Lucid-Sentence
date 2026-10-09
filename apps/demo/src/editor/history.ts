/* eslint-disable @typescript-eslint/no-deprecated --
 * The stand-in editor deliberately uses document.execCommand: it is the only
 * API that edits contenteditable with the browser's native undo stack. The
 * engine (M1) replaces this surface entirely.
 */
/**
 * One undo timeline for text and ink. Text edits use the browser's native
 * contenteditable history; ink keeps its own operations. The timeline records
 * which kind came last, so Ctrl+Z undoes the most recent change of either kind.
 */
import type { InkLayer, InkOp } from './ink.js';

type Entry = { kind: 'text' } | { kind: 'ink'; op: InkOp };

export class History {
  #undo: Entry[] = [];
  #redo: Entry[] = [];
  #replaying = false;

  constructor(
    readonly doc: HTMLElement,
    readonly inkLayer: InkLayer,
    readonly onChange: () => void,
  ) {
    doc.addEventListener('ls-exec', () => {
      this.text();
    });
    doc.addEventListener('beforeinput', (e) => {
      if (this.#replaying) return;
      const t = e.inputType;
      if (t === 'historyUndo' || t === 'historyRedo') {
        // Native shortcuts inside the document go through the shared timeline.
        e.preventDefault();
        if (t === 'historyUndo') this.undo();
        else this.redo();
        return;
      }
      const last = this.#undo.at(-1);
      // Coalesce typing into one entry, as the browser does.
      if (last?.kind !== 'text' || !t.startsWith('insertText')) this.#undo.push({ kind: 'text' });
      this.#redo = [];
      this.onChange();
    });
  }

  /** Record a programmatic text change (execCommand also records it natively). */
  text(): void {
    this.#undo.push({ kind: 'text' });
    this.#redo = [];
    this.onChange();
  }

  ink(op: InkOp): void {
    this.#undo.push({ kind: 'ink', op });
    this.#redo = [];
    this.onChange();
  }

  /** Drop an ink operation that was withdrawn right after it happened. */
  retract(op: InkOp): void {
    const last = this.#undo.at(-1);
    if (last?.kind === 'ink' && last.op === op) {
      this.#undo.pop();
      this.onChange();
    }
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  undo(): void {
    const e = this.#undo.pop();
    if (!e) return;
    if (e.kind === 'ink') this.inkLayer.apply(e.op, true);
    else this.#native('undo');
    this.#redo.push(e);
    this.onChange();
  }

  redo(): void {
    const e = this.#redo.pop();
    if (!e) return;
    if (e.kind === 'ink') this.inkLayer.apply(e.op);
    else this.#native('redo');
    this.#undo.push(e);
    this.onChange();
  }

  #native(cmd: 'undo' | 'redo'): void {
    this.#replaying = true;
    this.doc.focus({ preventScroll: true });
    document.execCommand(cmd);
    this.#replaying = false;
  }
}
