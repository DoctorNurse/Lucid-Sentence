import { shape } from '@lucid-sentence/ribbon-ui';

export const splashCss = /* css */ `
:host {
  position: fixed; inset: 0; z-index: 2147483000;
  font-family: ${shape.font}; font-size: ${shape.fontSize}; line-height: 1.45;
  color: var(--ls-text);
  --ls-motion: ${shape.motion};
}
:host([data-state='done']) { pointer-events: none; }
:host([hidden]) { display: none; }
@media (prefers-reduced-motion: reduce) { :host { --ls-motion: 0ms; } }
* { box-sizing: border-box; }

.loader {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px;
  background: var(--ls-chrome);
  transition: opacity 200ms ease;
}
:host([data-state='done']) .loader { opacity: 0; visibility: hidden; }
/* While a promo shows during loading, keep the loader clear of the card. */
:host([data-promo]) .loader { justify-content: flex-start; padding-top: max(40px, 16vh); }
.loader__icon { width: 96px; height: 96px; border-radius: 22px; box-shadow: var(--ls-shadow); }
.loader__name { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
.loader__bar {
  position: relative; width: 180px; height: 4px; overflow: hidden;
  border-radius: 999px; background: var(--ls-border);
}
.loader__bar span {
  position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: inherit;
  background: var(--ls-accent); animation: ls-slide 1.1s ease-in-out infinite;
}
@keyframes ls-slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@media (prefers-reduced-motion: reduce) { .loader__bar span { animation: none; width: 100%; opacity: 0.6; } }
.loader__status { color: var(--ls-text-muted); }

.promo {
  --promo-bg: var(--ls-raised);
  --promo-text: var(--ls-text);
  --promo-muted: var(--ls-text-muted);
  --promo-a: var(--ls-accent);
  --promo-b: var(--ls-accent);
  --promo-c: var(--ls-accent);
  --promo-cta-text: var(--ls-accent-text);
  --promo-display: inherit;
  pointer-events: auto;
  position: absolute; left: 50%; bottom: 48px; transform: translateX(-50%);
  width: min(400px, calc(100vw - 24px)); overflow: hidden;
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px 16px 18px;
  color: var(--promo-text);
  border: 1px solid var(--ls-border); border-radius: 16px;
  background: var(--promo-bg);
  box-shadow: var(--ls-shadow);
  animation: promo-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.promo--branded {
  border-color: transparent;
  background: linear-gradient(120deg, var(--promo-a), var(--promo-b), var(--promo-c), var(--promo-a));
  background-size: 300% 100%;
  animation: promo-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both, promo-sheen 9s linear infinite;
  box-shadow: 0 18px 50px rgb(0 0 0 / 45%),
    0 0 44px -14px color-mix(in srgb, var(--promo-a) 70%, transparent);
}
/* Brand surface sits 1px inside, so the moving gradient reads as a glowing border. */
.promo--branded::before {
  content: ''; position: absolute; inset: 1px; border-radius: 15px; background: var(--promo-bg);
}
.promo--branded > :not(.promo__timer) { position: relative; }
@keyframes promo-in { from { opacity: 0; translate: 0 10px; } to { opacity: 1; translate: 0 0; } }
@keyframes promo-sheen { from { background-position: 0% 0; } to { background-position: 300% 0; } }
.promo:focus { outline: none; }
.promo:focus-visible { outline: 2px solid var(--ls-focus); outline-offset: 3px; }
/* After loading finishes the card moves out of the way and never blocks the editor. */
:host([data-state='done']) .promo { left: auto; right: 16px; bottom: 40px; transform: none; }

.promo__head { display: flex; align-items: center; justify-content: space-between; margin: -4px -6px -2px 0; }
.promo__eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--promo-muted);
}
.promo__close {
  width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 999px;
  background: transparent; color: var(--promo-muted); font: inherit; font-size: 15px; cursor: pointer;
  transition: background var(--ls-motion), color var(--ls-motion);
}
.promo__close:hover { background: color-mix(in srgb, var(--promo-text) 12%, transparent); color: var(--promo-text); }
.promo__hero { display: flex; align-items: center; gap: 14px; }
.promo__icon {
  flex: none; width: 56px; height: 56px; border-radius: 14px; object-fit: cover;
  display: grid; place-items: center; font-weight: 700; font-size: 22px;
  background: var(--ls-accent-soft); color: var(--ls-accent);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 8%), 0 8px 24px -8px color-mix(in srgb, var(--promo-c) 55%, transparent);
}
.promo__titles { min-width: 0; }
.promo__title {
  margin: 0; font-family: var(--promo-display); font-size: 22px; font-weight: 600;
  letter-spacing: -0.01em; line-height: 1.15;
}
.promo__tagline { margin: 2px 0 0; font-size: 14px; font-weight: 500; color: var(--promo-text); opacity: 0.92; }
.promo__desc { margin: 0; font-size: 13px; line-height: 1.5; color: var(--promo-muted); }
.promo__desc:empty { display: none; }
.promo__chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.promo__chips li {
  padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 500;
  color: var(--promo-text);
  background: color-mix(in srgb, var(--promo-text) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--promo-text) 14%, transparent);
}
.promo__cta {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 42px; padding: 0 18px; margin-top: 2px;
  border-radius: 999px; font-weight: 700; font-size: 14px; text-decoration: none;
  color: var(--promo-cta-text);
  background: linear-gradient(100deg, var(--promo-a), var(--promo-b) 50%, var(--promo-c));
  box-shadow: 0 6px 20px -6px color-mix(in srgb, var(--promo-b) 70%, transparent);
  transition: transform var(--ls-motion) ease, box-shadow var(--ls-motion) ease, filter var(--ls-motion);
}
.promo__cta:hover { transform: translateY(-1px); filter: brightness(1.06); }
.promo__arrow { transition: transform var(--ls-motion) ease; }
.promo__cta:hover .promo__arrow { transform: translate(2px, -2px); }
.promo__cta:focus-visible, .promo__close:focus-visible { outline: 2px solid var(--ls-focus); outline-offset: 2px; }
/* Countdown line for auto-dismiss (paused = removed while hovered or focused). */
.promo__timer {
  position: absolute; left: 0; right: 0; bottom: 0; height: 2px; transform-origin: left;
  background: linear-gradient(90deg, var(--promo-a), var(--promo-c)); opacity: 0;
}
.promo--timing .promo__timer { opacity: 0.7; animation: promo-countdown var(--promo-dismiss-ms, 8s) linear both; }
@keyframes promo-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) {
  .promo, .promo--branded { animation: none; }
  .promo--timing .promo__timer { animation: none; opacity: 0; }
  .promo__cta:hover, .promo__cta:hover .promo__arrow { transform: none; }
}
.sr-only {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap;
}

/* Phone: full-width card near the top, clear of the bottom ribbon bar; 44 px targets. */
@media (max-width: 699px) {
  :host([data-promo]:not([layout])) .loader { justify-content: flex-end; padding: 0 0 max(40px, 14vh); }
  :host(:not([layout])) .promo, :host(:not([layout])[data-state='done']) .promo {
    left: 12px; right: 12px; top: calc(12px + env(safe-area-inset-top, 0px)); bottom: auto;
    width: auto; transform: none;
  }
  :host(:not([layout])) .promo__close { width: 44px; height: 44px; }
  :host(:not([layout])) .promo__cta { min-height: 48px; }
}
:host([data-promo][layout='phone']) .loader { justify-content: flex-end; padding: 0 0 max(40px, 14vh); }
:host([layout='phone']) .promo, :host([layout='phone'][data-state='done']) .promo {
  left: 12px; right: 12px; top: calc(12px + env(safe-area-inset-top, 0px)); bottom: auto;
  width: auto; transform: none;
}
:host([layout='phone']) .promo__close, :host([layout='tablet']) .promo__close { width: 44px; height: 44px; }
:host([layout='phone']) .promo__cta, :host([layout='tablet']) .promo__cta { min-height: 48px; }

@media (forced-colors: active) {
  .promo, .promo--branded { border: 1px solid CanvasText; background: Canvas; }
  .promo__cta { border: 1px solid ButtonText; background: ButtonFace; color: ButtonText; }
}
`;
