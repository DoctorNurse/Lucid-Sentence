import { allCommands } from '@lucid-sentence/commands';
import { defineRibbon, type CommandEventDetail } from '@lucid-sentence/ribbon-ui';
import { defineSplash } from '@lucid-sentence/splash';

defineRibbon();
defineSplash();

// Splash with the launch promo (one per launch). The demo simulates engine
// loading; `?load=<ms>` changes the delay and `?promos=off` hides the promo.
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
const bind = (id: string, attr: string): void => {
  const select = document.querySelector<HTMLSelectElement>(`#${id}`)!;
  const apply = (): void => {
    ribbon.setAttribute(attr, select.value);
    if (attr === 'theme') {
      document.documentElement.dataset['theme'] = select.value;
      splash.setAttribute('theme', select.value);
    }
    if (attr === 'layout') stage.dataset['layout'] = select.value;
  };
  select.addEventListener('change', apply);
  apply();
};
bind('layout', 'layout');
bind('theme', 'theme');
bind('context', 'contextual');

const refs = allCommands();
const tabs = new Set(refs.map((r) => r.tab.id)).size;
document.querySelector('#stats')!.textContent =
  `${refs.length} commands · ${tabs} tabs · ${refs.filter((r) => r.command.stub).length} stubs`;

ribbon.addEventListener('ls-command', (e) => {
  const { id, layout, pressed } = (e as CustomEvent<CommandEventDetail>).detail;
  document.querySelector('#last')!.textContent =
    `${id}${pressed === undefined ? '' : pressed ? ' (on)' : ' (off)'} · ${layout}`;
});
