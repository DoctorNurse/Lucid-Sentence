import { writeFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { registry } from '../packages/commands/src/index';
import { consoleErrors, openDemo, selectText } from './helpers';

// Control audit (not part of CI): runs every registry command at tablet size and
// records what visibly happened. LS_AUDIT=<dir> enables it and names the output dir.
const OUT = process.env['LS_AUDIT'];
test.skip(!OUT, 'audit only');

test.use({ viewport: { width: 1024, height: 640 }, hasTouch: true, deviceScaleFactor: 2 });

interface Snap {
  doc: string;
  view: string;
  ink: string;
  body: string;
  page: string;
  pop: string | null;
  toast: string | null;
  status: string;
  sel: string;
  bars: string;
  calls: string[];
}

const snap = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    const w = window as unknown as {
      __ls: {
        app: { view: unknown; page: unknown };
        ink: { strokes: unknown[]; tool: string; active: boolean };
      };
      __calls: string[];
    };
    const ls = w.__ls;
    const t = document.querySelector<HTMLElement>('#toast')!;
    const pop = document.querySelector<HTMLElement>('.pop');
    const pageEl = document.querySelector<HTMLElement>('#page')!;
    return {
      doc: document.querySelector('#doc')!.innerHTML,
      view: JSON.stringify([ls.app.view, ls.app.page]),
      ink: JSON.stringify([ls.ink.strokes.length, ls.ink.tool, ls.ink.active]),
      body: document.body.className + document.documentElement.className,
      page:
        (pageEl.getAttribute('style') ?? '') +
        '|' +
        pageEl.className +
        JSON.stringify(pageEl.dataset),
      pop: pop ? (pop.getAttribute('aria-label') ?? 'popover') : null,
      toast: t.hidden ? null : t.textContent,
      status: document.querySelector('#last')!.textContent,
      sel: String(document.getSelection()),
      bars: [
        ...document.querySelectorAll<HTMLElement>(
          '#findpanel,#comments,#notesbar,.navpane,#backstage,.update-bar',
        ),
      ]
        .map((e) => `${e.id || e.className}:${e.hidden ? 0 : 1}:${e.childElementCount}`)
        .join(','),
      calls: [...w.__calls],
    };
  });

const TABS = registry.tabs.map((t) => t.id);

for (const tabId of TABS) {
  test(`audit ${tabId}`, async ({ page: first, context }) => {
    test.setTimeout(900_000);
    await context.addInitScript(() => {
      const w = window as unknown as { __calls: string[] };
      w.__calls = [];
      window.print = () => w.__calls.push('print');
      window.open = (u?: string | URL) => {
        w.__calls.push(`open:${String(u)}`);
        return null;
      };
      HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
        w.__calls.push(`file-input:${this.type}`);
      };
      const sp = window.speechSynthesis as SpeechSynthesis | undefined;
      if (sp) {
        const orig = sp.speak.bind(sp);
        sp.speak = (u) => {
          w.__calls.push('speak');
          orig(u);
        };
      }
    });
    await first.close();
    const tab = registry.tabs.find((t) => t.id === tabId)!;
    const results: unknown[] = [];
    for (const g of tab.groups) {
      for (const c of g.commands) {
        const page = await context.newPage();
        console.log(`> ${c.id}`);
        let error: string | null = null;
        await openDemo(page);
        const wired = await page.evaluate(
          (id) =>
            (
              window as unknown as { __ls: { ribbon: { wired: Set<string> } } }
            ).__ls.ribbon.wired.has(id),
          c.id,
        );
        await selectText(page, 'round-trip fidelity');
        const before = await snap(page);
        try {
          await page.evaluate((id) => {
            (window as unknown as { __ls: { run: (id: string) => void } }).__ls.run(id);
          }, c.id);
          await page.waitForTimeout(150);
        } catch (e) {
          error = String(e);
        }
        const after = await snap(page).catch((e: unknown) => {
          error = `snapshot failed: ${String(e)}`;
          return before;
        });
        const changed = (Object.keys(before) as (keyof Snap)[]).filter(
          (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
        );
        results.push({
          tab: tab.id,
          group: g.label,
          id: c.id,
          label: c.label,
          kind: c.kind,
          stub: !!c.stub,
          wired,
          changed,
          pop: after.pop,
          toast: after.toast,
          status: after.status,
          calls: after.calls,
          errors: consoleErrors(page),
          error,
        });
        await page.close().catch(() => undefined);
      }
    }
    mkdirSync(OUT!, { recursive: true });
    writeFileSync(`${OUT}/commands-${tabId}.json`, JSON.stringify(results, null, 1));
    expect(results.length).toBe(tab.groups.reduce((n, g) => n + g.commands.length, 0));
  });
}
