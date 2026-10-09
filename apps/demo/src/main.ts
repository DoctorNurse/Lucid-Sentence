import { allCommands } from '@lucid-sentence/commands';
import { defineRibbon, type CommandEventDetail } from '@lucid-sentence/ribbon-ui';

defineRibbon();

const ribbon = document.querySelector<HTMLElement>('#ribbon')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const bind = (id: string, attr: string): void => {
  const select = document.querySelector<HTMLSelectElement>(`#${id}`)!;
  const apply = (): void => {
    ribbon.setAttribute(attr, select.value);
    if (attr === 'theme') document.documentElement.dataset['theme'] = select.value;
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
