import { expect, test, type Page } from '@playwright/test';
import { consoleErrors, openDemo, pageSpot, penStroke, scribble, strokeCount } from './helpers';

// Stylus engine: pressure, tilt, buttons, hover, palm rejection, pointercancel,
// coalesced/predicted samples, highlighter layers and straight lines, at phone and
// tablet sizes. Gestures CDP can't express (eraser bit 32, cancel, coalesced and
// predicted lists, contact size) are synthetic PointerEvents on the ink overlay.

const SHOTS = process.env['LS_SHOTS'];

interface Step {
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';
  x: number;
  y: number;
  pointerType?: 'pen' | 'touch' | 'mouse';
  pointerId?: number;
  buttons?: number;
  button?: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  width?: number;
  height?: number;
  coalesced?: [number, number][];
  predicted?: [number, number][];
  /** Wait this long (ms) before dispatching. */
  wait?: number;
}

/** Dispatch synthetic PointerEvents (client coordinates) on the ink overlay. */
async function pointer(page: Page, steps: Step[]): Promise<void> {
  await page.evaluate(async (steps) => {
    const svg = document.querySelector('#ink')!;
    for (const s of steps) {
      if (s.wait) await new Promise((r) => setTimeout(r, s.wait));
      const base = {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: s.pointerId ?? 7,
        pointerType: s.pointerType ?? 'pen',
        isPrimary: true,
        pressure: s.pressure ?? (s.type === 'pointerup' ? 0 : 0.6),
        tiltX: s.tiltX ?? 20,
        tiltY: s.tiltY ?? 0,
        width: s.width ?? 1,
        height: s.height ?? 1,
        buttons: s.buttons ?? (s.type === 'pointerup' || s.type === 'pointercancel' ? 0 : 1),
        button: s.button ?? (s.type === 'pointermove' ? -1 : 0),
      };
      const at = (x: number, y: number) =>
        new PointerEvent('pointermove', { ...base, clientX: x, clientY: y });
      svg.dispatchEvent(
        new PointerEvent(s.type, {
          ...base,
          clientX: s.x,
          clientY: s.y,
          ...(s.coalesced ? { coalescedEvents: s.coalesced.map(([x, y]) => at(x, y)) } : {}),
          ...(s.predicted ? { predictedEvents: s.predicted.map(([x, y]) => at(x, y)) } : {}),
        }),
      );
    }
  }, steps);
}

/** A pen (or finger) stroke as synthetic events: down, moves, up. */
function stroke(points: [number, number][], over: Partial<Step> = {}): Step[] {
  const [first, ...rest] = points;
  const last = points.at(-1)!;
  return [
    { type: 'pointerdown', x: first![0], y: first![1], ...over },
    ...rest.map(([x, y]): Step => ({ type: 'pointermove', x, y, ...over })),
    { type: 'pointerup', x: last[0], y: last[1], ...over, buttons: 0 },
  ];
}

type Ink = {
  strokes: {
    tool: string;
    color: string;
    size: number;
    points: number[][];
    pressure?: boolean;
    shape?: string;
  }[];
  tool: string;
  color: string;
  effectiveTool: string;
  drawWithTouch: boolean;
  rejected: number;
  setActive(on: boolean): void;
  setTool(t: string): void;
  render(): void;
  widthOf(s: unknown): number;
  pixelAt(layer: string, x: number, y: number): number[] | null;
};

async function startDrawing(page: Page, tool = 'pen', color?: string): Promise<void> {
  await page.evaluate(
    ({ tool, color }) => {
      const ink = (window as unknown as { __ls: { ink: Ink } }).__ls.ink;
      ink.setActive(true);
      ink.setTool(tool);
      if (color) ink.color = color;
    },
    { tool, color },
  );
}

const ink = <T>(page: Page, fn: (ink: Ink) => T): Promise<T> =>
  page.evaluate((src) => {
    const ink = (window as unknown as { __ls: { ink: Ink } }).__ls.ink;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return (new Function('ink', `return (${src})(ink)`) as (i: Ink) => T)(ink);
  }, fn.toString());

/** Client point → page coordinates (unzoomed page px). */
async function toPage(page: Page, x: number, y: number): Promise<[number, number]> {
  return page.evaluate(
    ([x, y]) => {
      const el = document.querySelector('#page') as HTMLElement;
      const r = el.getBoundingClientRect();
      const s = r.width / el.offsetWidth;
      return [(x! - r.left) / s, (y! - r.top) / s] as [number, number];
    },
    [x, y],
  );
}

const line = (x: number, y: number, len: number, n = 16, dy = 0): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [x + (len * i) / n, y + (dy * i) / n]);

const sizes = [
  {
    name: 'phone',
    use: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true },
  },
  { name: 'tablet', use: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2 } },
] as const;

for (const size of sizes) {
  test.describe(`stylus engine (${size.name})`, () => {
    test.use({ ...size.use, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await openDemo(page);
    });

    test.afterEach(({ page }) => {
      expect(consoleErrors(page)).toEqual([]);
    });

    test('pressure and tilt are kept in every point; pencil width survives a re-render', async ({
      page,
    }) => {
      await startDrawing(page, 'pencil');
      const { x, y } = await pageSpot(page);
      await penStroke(page, scribble(x, y, 160, 30, 12));
      await expect.poll(() => strokeCount(page)).toBe(1);
      const before = await ink(page, (i) => {
        const s = i.strokes[0]!;
        return {
          pressure: s.pressure,
          p: s.points.map((p) => p[2]),
          tilt: s.points.map((p) => [p[3], p[4]]),
          width: i.widthOf(s),
        };
      });
      expect(before.pressure).toBe(true);
      expect(before.p.every((p) => p !== undefined && p > 0 && p !== 0.5)).toBe(true);
      expect(before.tilt.every(([tx, ty]) => tx === 10 && ty === -5)).toBe(true);
      expect(before.width).toBeGreaterThan(0);
      // Re-render from the model (as after undo, zoom or reopening the draft).
      const after = await ink(page, (i) => {
        i.render();
        return i.widthOf(i.strokes[0]);
      });
      expect(after).toBe(before.width);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/ink-${size.name}-pressure-tilt.png` });
    });

    test('the eraser end (buttons & 32) erases', async ({ page }) => {
      await startDrawing(page);
      const { x, y } = await pageSpot(page);
      await pointer(page, stroke(line(x, y, 150)));
      await pointer(page, stroke(line(x, y + 60, 150)));
      await expect.poll(() => strokeCount(page)).toBe(2);
      await pointer(page, stroke(line(x + 70, y - 20, 0, 4, 40), { buttons: 32 }));
      await expect.poll(() => strokeCount(page)).toBe(1);
      expect(await ink(page, (i) => i.tool)).toBe('pen');
    });

    test('hovering with the barrel held switches to the eraser, and back on release', async ({
      page,
    }) => {
      await startDrawing(page);
      const { x, y } = await pageSpot(page);
      await pointer(page, [{ type: 'pointermove', x, y, buttons: 2 }]);
      expect(await ink(page, (i) => i.effectiveTool)).toBe('eraser');
      await expect(page.locator('#ink')).toHaveAttribute('data-tool', 'eraser');
      await pointer(page, [{ type: 'pointermove', x: x + 5, y, buttons: 0 }]);
      expect(await ink(page, (i) => i.effectiveTool)).toBe('pen');
      await expect(page.locator('#ink')).toHaveAttribute('data-tool', 'pen');
    });

    test('pressing the barrel mid-stroke keeps the ink so far, then erases', async ({ page }) => {
      await startDrawing(page);
      const { x, y } = await pageSpot(page);
      await pointer(page, stroke(line(x, y + 80, 150)));
      await expect.poll(() => strokeCount(page)).toBe(1);
      // Draw right, then press the barrel and sweep down through the first stroke.
      const steps: Step[] = [
        { type: 'pointerdown', x, y },
        ...line(x, y, 100, 8)
          .slice(1)
          .map(([px, py]): Step => ({ type: 'pointermove', x: px, y: py })),
        ...line(x + 100, y, 0, 8, 120).map(([px, py]): Step => ({
          type: 'pointermove',
          x: px,
          y: py,
          buttons: 3,
        })),
        // The WebView may report buttons = 0 before lift; still erasing.
        { type: 'pointermove', x: x + 100, y: y + 125, buttons: 1 },
        { type: 'pointerup', x: x + 100, y: y + 125 },
      ];
      await pointer(page, steps);
      const tools = await ink(page, (i) => i.strokes.map((s) => s.points[0]![1]));
      // The first stroke was erased; the part drawn before the press was kept.
      expect(tools).toHaveLength(1);
      const [, py] = await toPage(page, x, y);
      expect(Math.abs(tools[0]! - py)).toBeLessThan(2);
      expect(await ink(page, (i) => i.effectiveTool)).toBe('pen');
    });

    test('pointercancel discards the stroke being drawn', async ({ page }) => {
      await startDrawing(page);
      const { x, y } = await pageSpot(page);
      const steps = stroke(line(x, y, 150));
      steps[steps.length - 1] = { type: 'pointercancel', x: x + 150, y };
      await pointer(page, steps);
      expect(await strokeCount(page)).toBe(0);
      const [px, py] = await toPage(page, x + 75, y);
      const live = await page.evaluate(
        ([px, py]) =>
          (window as unknown as { __ls: { ink: Ink } }).__ls.ink.pixelAt('live', px!, py!)?.[3] ??
          0,
        [px, py],
      );
      expect(live).toBe(0);
      // The next stroke still works.
      await pointer(page, stroke(line(x, y + 40, 150)));
      await expect.poll(() => strokeCount(page)).toBe(1);
    });

    test('coalesced samples are all kept; predicted samples never are', async ({ page }) => {
      await startDrawing(page);
      const { x, y } = await pageSpot(page);
      const coalesced = line(x, y, 200, 20).slice(1);
      await pointer(page, [
        { type: 'pointerdown', x, y },
        {
          type: 'pointermove',
          x: x + 200,
          y,
          coalesced,
          predicted: [
            [x + 240, y + 80],
            [x + 280, y + 160],
          ],
        },
        { type: 'pointerup', x: x + 200, y },
      ]);
      await expect.poll(() => strokeCount(page)).toBe(1);
      const pts = await ink(page, (i) => i.strokes[0]!.points);
      // Thinning may drop a few, but far more than the 2 dispatched events survive.
      expect(pts.length).toBeGreaterThan(10);
      const [, py] = await toPage(page, x, y);
      expect(pts.every((p) => Math.abs(p[1]! - py) < 1)).toBe(true);
    });

    test('overlapping highlighter strokes of one color do not darken', async ({ page }) => {
      await startDrawing(page, 'highlighter', '#ffd400');
      await page.evaluate(() => {
        (
          window as unknown as { __ls: { ink: Ink & { autoStraightenHighlighter: boolean } } }
        ).__ls.ink.autoStraightenHighlighter = false;
      });
      const { x, y } = await pageSpot(page);
      await pointer(page, stroke(line(x, y + 20, 180, 18, 0.01), { pressure: 0.5 }));
      await pointer(page, stroke(line(x + 90, y - 30, 0.01, 18, 100), { pressure: 0.5 }));
      await expect.poll(() => strokeCount(page)).toBe(2);
      const [ox, oy] = await toPage(page, x + 90, y + 20); // overlap
      const [sx, sy] = await toPage(page, x + 30, y + 20); // first stroke only
      const px = await page.evaluate(
        ({ o, s }) => {
          const ink = (window as unknown as { __ls: { ink: Ink } }).__ls.ink;
          const layer = document.querySelector('.ink-hl__color[data-color="#ffd400"]')!;
          return {
            overlap: ink.pixelAt('#ffd400', o[0]!, o[1]!),
            single: ink.pixelAt('#ffd400', s[0]!, s[1]!),
            opacity: getComputedStyle(layer).opacity,
            blend: getComputedStyle(layer).mixBlendMode,
            layers: document.querySelectorAll('.ink-hl__color').length,
          };
        },
        { o: [ox, oy], s: [sx, sy] },
      );
      expect(px.single?.[3]).toBe(255);
      expect(px.overlap).toEqual(px.single);
      expect(Number(px.opacity)).toBeCloseTo(0.38, 2);
      expect(px.blend).toBe('multiply');
      expect(px.layers).toBe(1);
      // A second color gets its own layer (colors still mix where they cross).
      await page.evaluate(() => {
        (window as unknown as { __ls: { ink: Ink } }).__ls.ink.color = '#4caf50';
      });
      await pointer(page, stroke(line(x, y + 60, 180, 18, 0.01), { pressure: 0.5 }));
      await expect(page.locator('.ink-hl__color')).toHaveCount(2);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/ink-${size.name}-highlighter.png` });
    });

    test('a highlighter line snaps straight; a pen held still at the end straightens', async ({
      page,
    }) => {
      await startDrawing(page, 'highlighter', '#ffd400');
      const { x, y } = await pageSpot(page);
      const wobbly = line(x, y, 200, 20).map(([px, py], i): [number, number] => [
        px,
        py + (i % 2 ? 1.5 : -1.5),
      ]);
      await pointer(page, stroke(wobbly, { pressure: 0.5 }));
      await expect.poll(() => strokeCount(page)).toBe(1);
      let s = await ink(page, (i) => i.strokes[0]!);
      expect(s.shape).toBe('line');
      expect(s.points).toHaveLength(2);
      expect(s.points[0]![1]).toBe(s.points[1]![1]); // snapped horizontal

      await startDrawing(page, 'pen', '#202124');
      const pen = line(x, y + 60, 200, 20, 6).map(([px, py], i): [number, number] => [
        px,
        py + (i % 2 ? 1 : -1),
      ]);
      const steps = stroke(pen);
      steps[steps.length - 1]!.wait = 550; // rest before lifting
      await pointer(page, steps);
      await expect.poll(() => strokeCount(page)).toBe(2);
      s = await ink(page, (i) => i.strokes[1]!);
      expect(s.shape).toBe('line');
      // Without the rest, a pen stroke stays as drawn.
      await pointer(page, stroke(line(x, y + 120, 200, 20).map(([a, b], i) => [a, b + (i % 2)])));
      await expect.poll(() => strokeCount(page)).toBe(3);
      s = await ink(page, (i) => i.strokes[2]!);
      expect(s.shape).toBeUndefined();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/ink-${size.name}-straight.png` });
    });

    test('palm rejection: a large contact after a pen is ignored', async ({ page }) => {
      await startDrawing(page);
      await page.evaluate(() => {
        (window as unknown as { __ls: { ink: Ink } }).__ls.ink.drawWithTouch = true;
      });
      const { x, y } = await pageSpot(page);
      await pointer(page, stroke(line(x, y, 120)));
      await expect.poll(() => strokeCount(page)).toBe(1);
      // Re-enable fingers (the first pen turned them off on touch-first devices).
      await page.evaluate(() => {
        (window as unknown as { __ls: { ink: Ink } }).__ls.ink.drawWithTouch = true;
      });
      const touch = { pointerType: 'touch' as const, pointerId: 21, pressure: 0.5 };
      // Right after the pen: rejected (pen proximity window).
      await pointer(page, stroke(line(x, y + 50, 120), touch));
      expect(await strokeCount(page)).toBe(1);
      // Later, a palm-sized contact is still rejected; a fingertip draws.
      const palm = { ...touch, width: 80, height: 70 };
      await pointer(page, [{ ...stroke(line(x, y + 100, 120), palm)[0]!, wait: 800 }]);
      await pointer(page, stroke(line(x, y + 100, 120), palm).slice(1));
      expect(await strokeCount(page)).toBe(1);
      await pointer(page, stroke(line(x, y + 150, 120), { ...touch, width: 12, height: 12 }));
      await expect.poll(() => strokeCount(page)).toBe(2);
      expect(await ink(page, (i) => i.rejected)).toBeGreaterThanOrEqual(2);
    });

    test('a second finger right after a finger stroke takes it back (pinch, not ink)', async ({
      page,
    }) => {
      await startDrawing(page);
      await page.evaluate(() => {
        (window as unknown as { __ls: { ink: Ink } }).__ls.ink.drawWithTouch = true;
      });
      const { x, y } = await pageSpot(page);
      const f = (id: number) => ({ pointerType: 'touch' as const, pointerId: id, pressure: 0.5 });
      // One finger strokes, then two fingers land within 300 ms: retracted.
      await pointer(page, [
        ...stroke(line(x, y, 100, 6), f(31)),
        { type: 'pointerdown', x: x + 20, y: y + 40, ...f(32) },
        { type: 'pointerdown', x: x + 80, y: y + 40, ...f(33) },
        { type: 'pointerup', x: x + 20, y: y + 40, ...f(32) },
        { type: 'pointerup', x: x + 80, y: y + 40, ...f(33) },
      ]);
      expect(await strokeCount(page)).toBe(0);
      // A second finger during a finger stroke abandons it.
      await pointer(page, [
        { type: 'pointerdown', x, y: y + 80, ...f(34) },
        { type: 'pointermove', x: x + 40, y: y + 80, ...f(34) },
        { type: 'pointerdown', x: x + 80, y: y + 120, ...f(35) },
        { type: 'pointerup', x: x + 40, y: y + 80, ...f(34) },
        { type: 'pointerup', x: x + 80, y: y + 120, ...f(35) },
      ]);
      expect(await strokeCount(page)).toBe(0);
      // A finger stroke on its own stays.
      await pointer(page, [...stroke(line(x, y + 160, 100, 6), f(36))]);
      await expect.poll(() => strokeCount(page)).toBe(1);
      await page.waitForTimeout(350);
      await pointer(page, [
        { type: 'pointerdown', x, y: y + 220, ...f(37) },
        { type: 'pointerdown', x: x + 80, y: y + 220, ...f(38) },
        { type: 'pointerup', x, y: y + 220, ...f(37) },
        { type: 'pointerup', x: x + 80, y: y + 220, ...f(38) },
      ]);
      expect(await strokeCount(page)).toBe(1);
      // Undo has nothing of the retracted stroke: one undo removes the kept stroke.
      await page.keyboard.press('Control+z');
      await expect.poll(() => strokeCount(page)).toBe(0);
    });

    test('mixed tools render in layers: highlighter under text, ink above', async ({ page }) => {
      await startDrawing(page, 'highlighter', '#ffd400');
      const { x, y } = await pageSpot(page);
      await pointer(page, stroke(line(x, y + 10, 200), { pressure: 0.5 }));
      await startDrawing(page, 'pen', '#1a73e8');
      await penStroke(page, scribble(x, y, 200, 40, 14));
      await startDrawing(page, 'pencil', '#5f6368');
      await penStroke(page, scribble(x, y + 70, 200, 30, 14));
      await expect.poll(() => strokeCount(page)).toBe(3);
      const z = await page.evaluate(() => {
        const zi = (s: string) => Number(getComputedStyle(document.querySelector(s)!).zIndex);
        return { hl: zi('.ink-hl'), ink: zi('.ink-canvas'), overlay: zi('#ink') };
      });
      expect(z.hl).toBeLessThan(1);
      expect(z.ink).toBeGreaterThan(1);
      expect(z.overlay).toBeGreaterThan(z.ink);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/ink-${size.name}-layers.png` });
    });
  });
}
