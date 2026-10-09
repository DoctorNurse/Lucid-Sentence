# @lucid-sentence/splash

The Lucid Sentence splash/loading screen, `<ls-splash>`. It shows the brand icon
and a loading bar. It can also show **one promo card per launch** for another
app from **Lucid Systems LLC** (currently Chapternal).

```ts
import { defineSplash } from '@lucid-sentence/splash';
defineSplash();

const splash = document.createElement('ls-splash');
splash.setAttribute('icon', './icon-256.png');
splash.setAttribute('asset-base', './'); // where promo icons are served from
document.body.append(splash);
// …when the editor is ready:
splash.finish();
```

## Behavior

- **While loading**, the splash covers the window, because the editor isn't
  usable yet. If a promo is chosen for this launch, the card appears with the
  loader. It is labeled **"From Lucid Systems"**.
- **At most one promo per launch.** `claimLaunchPromo()` hands out a promo once
  per app lifetime. Promos rotate **round-robin across launches**. Only the
  index of the last promo shown is stored in `localStorage`
  (`lucid-sentence:promo-rotation`).
- **`finish()`** removes the cover right away. The card moves to the
  bottom-right corner on desktop and tablet, or stays at the top on phone. It
  never blocks the editor.
- **Dismissal:** the ✕ button, **Esc**, clicking the CTA, or **auto-dismiss 8 s
  after loading finishes**. The 8 s timer is a deliberate choice; set it with
  `auto-dismiss="ms"`, or `0` for never. A thin countdown line shows the timer.
  It pauses while the card is hovered or focused and restarts when the pointer
  or focus leaves. While loading, the card stays until the user dismisses it.
- **Accessibility:** the card is a non-modal `role="dialog"`. It is labeled by
  "From Lucid Systems" plus the app name, and described by the tagline and
  description. It gets focus when shown, and focus returns to the previously
  focused element when it closes. The close button has an `aria-label`. The
  link says "(opens in a new tab)" to screen readers. The loader is a polite
  `role="status"`. Phone and tablet use 44 px or larger touch targets. Motion
  respects `prefers-reduced-motion`.
- **Themes:** `theme="auto|light|dark|high-contrast"`. Auto follows OS dark
  mode and "increase contrast". The card uses the promoted app's brand colors,
  except in high-contrast and forced-colors modes, where it uses plain
  high-contrast tokens.
- **Privacy:** no tracking and no network calls. The promo icon must be a
  bundled asset; remote `http(s)` icons are refused. The CTA is a plain
  `target="_blank" rel="noopener noreferrer"` link with no tracking parameters.
  Events (`ls-promo-shown`, `ls-promo-dismissed`, `ls-splash-closed`) are local
  DOM events only.

## Turning promos off (forks and distributions)

Promos are only for Lucid Systems apps in official Lucid Sentence builds. Forks
and third-party distributions can turn them off in any of these ways:

| Where      | How                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build time | Define the global `__LUCID_PROMOS__` as `false` (Vite: `define: { __LUCID_PROMOS__: 'false' }`). The demo does this when built with `LUCID_PROMOS=off pnpm build`. |
| Runtime    | `configurePromos({ enabled: false })` before the splash connects                                                                                                   |
| Markup     | `<ls-splash promos="off">`                                                                                                                                         |

When disabled, nothing is shown and the rotation index is not advanced.

## Adding a promo

Add an entry to `src/promos.ts`. Rules:

- Lucid Systems apps only.
- Copy taken from the app's own public site, with the source noted in a comment.
- `https` URL with no tracking parameters.
- An icon bundled with the app (put it in `assets/promos/` and serve it under
  `asset-base`).

Rotation picks the new entry up automatically.
