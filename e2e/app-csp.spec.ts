import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The desktop and Android apps serve every file with the CSP from tauri.conf.json.
// 0.1.5-preview's CSP blocked same-origin fetches and WebAssembly, so the engine
// never started and "Opening…" stayed forever. Run the web app under that exact
// policy here, so a CSP that breaks the engine fails CI.
const conf = JSON.parse(
  readFileSync(new URL('../apps/shell/src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { app: { security: { csp: Record<string, string> } } };
const CSP = Object.entries(conf.app.security.csp)
  .map(([k, v]) => `${k} ${v}`)
  .join('; ');
const CORPUS = new URL('../engine/fidelity/corpus/', import.meta.url);

type W = { __ls?: { engine: { active: boolean }; app: { openBackstage(id: string): void } } };

async function openApp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.text().startsWith('CSP ')) violations.push(m.text());
  });
  await page.addInitScript(() => {
    Object.assign(window, { showOpenFilePicker: undefined, showSaveFilePicker: undefined });
    document.addEventListener('securitypolicyviolation', (e) => {
      console.log(`CSP ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    await route.fulfill({
      response: res,
      headers: { ...res.headers(), 'content-security-policy': CSP },
    });
  });
  await page.goto('/?promos=off&load=0&draft=off');
  // Polling with evaluate: waitForFunction needs eval, which this CSP rightly blocks.
  await expect.poll(() => page.evaluate(() => '__ls' in window)).toBe(true);
  return violations;
}

const active = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as W).__ls?.engine.active ?? false);

async function pickDocx(page: Page, name: string): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as W).__ls!.app.openBackstage('file.rail.open');
  });
  await page.locator('#open-file').setInputFiles(new URL(name, CORPUS).pathname);
}

test('the app CSP lets the engine open a .docx and start a new document', async ({ page }) => {
  const violations = await openApp(page);
  await pickDocx(page, '01-basic.docx');
  await expect.poll(() => active(page), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('.engine-status')).toBeHidden();
  // New (blank) document: sdkjs loads its fonts and scripts under the same policy.
  await page.evaluate(() =>
    (
      window as unknown as { __ls: { engine: { blank(t: string): Promise<void> } } }
    ).__ls.engine.blank('Document1.docx'),
  );
  expect(await active(page)).toBe(true);
  expect(violations.filter((v) => !v.includes('api.github.com'))).toEqual([]);
});

test('a converter that cannot load shows an error with Retry, not an endless "Opening…"', async ({
  page,
}) => {
  await openApp(page);
  let block = true;
  await page.route('**/engine/x2t/x2t.wasm', async (route) => {
    if (block) await route.fulfill({ status: 404, body: 'gone' });
    else await route.fallback();
  });
  await pickDocx(page, '01-basic.docx');
  const status = page.locator('.engine-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText(/didn.t start/, { timeout: 30_000 });
  const retry = status.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  if (process.env['LS_SHOTS'])
    await page.screenshot({ path: `${process.env['LS_SHOTS']}/engine-error.png` });
  block = false;
  await retry.click();
  await expect.poll(() => active(page), { timeout: 30_000 }).toBe(true);
  await expect(status).toBeHidden();
});
