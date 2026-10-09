import { expect, type CDPSession, type Page } from '@playwright/test';

/** Open the demo with the splash skipped, no promo, and no saved draft. */
export async function openDemo(page: Page, query = ''): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/?promos=off&load=0&draft=off${query ? `&${query}` : ''}`);
  await page.waitForFunction(() => '__ls' in window);
  await expect(page.locator('#doc')).toBeVisible();
  (page as Page & { errors?: string[] }).errors = errors;
}

export function consoleErrors(page: Page): string[] {
  return (page as Page & { errors?: string[] }).errors ?? [];
}

/** Put the caret (or a selection) inside the document by text match. */
export async function selectText(page: Page, text: string, caretOnly = false): Promise<void> {
  await page.evaluate(
    ({ text, caretOnly }) => {
      const doc = document.querySelector('#doc')!;
      const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.textContent!.indexOf(text);
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(n, i);
        if (caretOnly) r.collapse(true);
        else r.setEnd(n, i + text.length);
        (doc as HTMLElement).focus();
        const s = document.getSelection()!;
        s.removeAllRanges();
        s.addRange(r);
        return;
      }
      throw new Error(`text not found: ${text}`);
    },
    { text, caretOnly },
  );
}

export const ribbonButton = (page: Page, id: string) =>
  page.locator(`ls-ribbon [data-command="${id}"]`).first();

export const ribbonTab = (page: Page, id: string) =>
  page.locator(`ls-ribbon [data-tab="${id}"]`).first();

type PenInit = { pointerType?: 'pen' | 'mouse'; buttons?: number; pressure?: number };

/**
 * Draw a stroke with a real (CDP-synthesized) pen: pointerType "pen" with
 * pressure and tilt, so the page sees the same Pointer Events a stylus sends.
 */
export async function penStroke(
  page: Page,
  points: [number, number][],
  { pointerType = 'pen', buttons = 1, pressure = 0.6 }: PenInit = {},
): Promise<void> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const button = buttons & 2 ? 'right' : 'left';
  const [first, ...rest] = points;
  const base = { pointerType, force: pressure, tiltX: 10, tiltY: -5, button, buttons } as const;
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: first![0],
    y: first![1],
    pointerType,
    buttons: 0,
    button: 'none',
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: first![0],
    y: first![1],
    clickCount: 1,
    ...base,
  });
  for (const [x, y] of rest) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, ...base });
  }
  const last = points.at(-1)!;
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: last[0],
    y: last[1],
    clickCount: 1,
    ...base,
    buttons: 0,
  });
  await cdp.detach();
}

/** A finger (touch) drag, e.g. a resting palm. */
export async function touchDrag(page: Page, points: [number, number][]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: first![0], y: first![1], radiusX: 18, radiusY: 18 }],
  });
  for (const [x, y] of rest) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, radiusX: 18, radiusY: 18 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** A horizontal zig-zag across a box (page coordinates on screen). */
export function scribble(x: number, y: number, w = 160, h = 30, steps = 16): [number, number][] {
  return Array.from(
    { length: steps + 1 },
    (_, i) => [x + (w * i) / steps, y + (i % 2 ? h : 0)] as [number, number],
  );
}

export const strokeCount = (page: Page): Promise<number> =>
  page.evaluate(
    () => (window as unknown as { __ls: { ink: { strokes: unknown[] } } }).__ls.ink.strokes.length,
  );

/** A writable spot on the visible part of the page (below the ribbon). */
export async function pageSpot(page: Page): Promise<{ x: number; y: number }> {
  const pageBox = (await page.locator('#page').boundingBox())!;
  const canvas = (await page.locator('#canvas').boundingBox())!;
  return { x: pageBox.x + 120, y: Math.max(pageBox.y, canvas.y) + 40 };
}
