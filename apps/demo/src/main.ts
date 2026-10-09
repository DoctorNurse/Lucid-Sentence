import { allCommands } from '@lucid-sentence/commands';
import { defineRibbon, type CommandEventDetail } from '@lucid-sentence/ribbon-ui';
import { defineSplash } from '@lucid-sentence/splash';
import { installFonts, themeStylesheet } from '@lucid-sentence/tokens';
import { drawRulers, PAGE_SIZES, type PageSize } from './page.js';

// Design tokens and bundled UI fonts (no network). See docs/DESIGN.md.
installFonts(document);
const tokens = document.createElement('style');
tokens.id = 'ls-tokens';
tokens.textContent = themeStylesheet();
document.head.prepend(tokens);

defineRibbon();
defineSplash();

// Splash with the launch promo (one per launch). The demo simulates engine
// loading; `?load=<ms>` changes the delay and `?promos=off` hides the promo.
// `?theme=`, `?paper=`, `?size=`, and `?layout=` preset the demo controls.
const params = new URLSearchParams(location.search);
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
  },
  Number.isFinite(loadMs) ? loadMs : 1500,
);

const ribbon = document.querySelector<HTMLElement>('#ribbon')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const sheet = document.querySelector<HTMLElement>('#sheet')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;

function radios(name: string, apply: (value: string) => void): void {
  const inputs = [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
  const preset = params.get(name);
  const match = inputs.find((i) => i.value === preset);
  if (match) match.checked = true;
  for (const i of inputs) {
    i.addEventListener('change', () => {
      apply(i.value);
    });
  }
  apply(inputs.find((i) => i.checked)?.value ?? inputs[0]!.value);
}

function select(id: string, apply: (value: string) => void): void {
  const el = document.querySelector<HTMLSelectElement>(`#${id}`)!;
  const preset = params.get(id);
  if (preset !== null && [...el.options].some((o) => o.value === preset)) el.value = preset;
  el.addEventListener('change', () => {
    apply(el.value);
  });
  apply(el.value);
}

radios('theme', (v) => {
  document.documentElement.dataset['theme'] = v;
  ribbon.setAttribute('theme', v);
  splash.setAttribute('theme', v);
});
radios('paper', (v) => {
  sheet.dataset['paper'] = v;
});
radios('size', (v) => {
  sheet.dataset['size'] = v;
  fit();
});
select('layout', (v) => {
  ribbon.setAttribute('layout', v);
  stage.dataset['layout'] = v;
  fit();
});
select('context', (v) => {
  ribbon.setAttribute('contextual', v);
});

/** Scale the page (and its rulers) down to fit narrow screens; 100% otherwise. */
function fit(): void {
  const size = PAGE_SIZES[(sheet.dataset['size'] ?? 'letter') as PageSize];
  drawRulers(
    document.querySelector<HTMLElement>('#ruler-h')!,
    document.querySelector<HTMLElement>('#ruler-v')!,
    size,
  );
  const avail = canvas.clientWidth - 24;
  const needed = size.widthPx + 22;
  const balloonRoom = 2 * 272; // keeps the page centered with the balloon beside it
  sheet.dataset['balloon'] = avail >= needed + balloonRoom ? 'side' : 'hidden';
  const scale = Math.min(1, avail / needed);
  sheet.style.setProperty('zoom', String(scale));
  placeComment();
  document.querySelector('#zoom')!.textContent = `${Math.round(scale * 100)}%`;
}
/** Line the margin pin and the balloon up with the commented text. */
function placeComment(): void {
  const anchor = document.querySelector<HTMLElement>('#comment-anchor');
  const page = document.querySelector<HTMLElement>('.page');
  if (!anchor || !page) return;
  const top = anchor.offsetTop;
  document.querySelector<HTMLElement>('.d-comment-pin')?.style.setProperty('top', `${top}px`);
  document
    .querySelector<HTMLElement>('.balloon')
    ?.style.setProperty('top', `${top + page.offsetTop - 8}px`);
}
new ResizeObserver(fit).observe(canvas);
void document.fonts.ready.then(placeComment);

const refs = allCommands();
const tabs = new Set(refs.map((r) => r.tab.id)).size;
document.querySelector('#stats')!.textContent =
  `${refs.length} commands · ${tabs} tabs · ${refs.filter((r) => r.command.stub).length} stubs`;
const words = (document.querySelector('.page')?.textContent ?? '').split(/\s+/).filter(Boolean);
document.querySelector('#words')!.textContent = `${words.length} words`;

ribbon.addEventListener('ls-command', (e) => {
  const { id, layout, pressed } = (e as CustomEvent<CommandEventDetail>).detail;
  document.querySelector('#last')!.textContent =
    `${id}${pressed === undefined ? '' : pressed ? ' (on)' : ' (off)'} · ${layout}`;
});
