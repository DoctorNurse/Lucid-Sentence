/**
 * Platform glue for the installable preview.
 *
 * - Inside the desktop/Android app (Tauri): links open in the system browser
 *   (only the few allowed by apps/shell/src-tauri/capabilities), and documents
 *   opened from the OS (.docx file association) show the preview message.
 * - On the web (https): registers the service worker so the PWA works offline
 *   after the first visit and can be added to the home screen.
 * - Update checks (see updates.ts) are the only requests this file starts: the
 *   desktop app's signed updater feed, and on Android the GitHub Releases API.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { checkAndroidUpdate, checkDesktopUpdate, watchServiceWorker } from './updates.js';

/** Message shown when the OS hands the preview a document it can't open yet. */
export function openedFilesMessage(names: readonly string[]): string {
  const list = names.map((n) => `“${n}”`).join(', ');
  return `${list} can’t be opened in this preview yet. Opening and saving .docx files arrive with the document engine.`;
}

async function wireDesktop(toast: (message: string, ms?: number) => void): Promise<void> {
  const [{ listen }, { openUrl }] = await Promise.all([
    import('@tauri-apps/api/event'),
    import('@tauri-apps/plugin-opener'),
  ]);
  const openExternal = (href: string): void => {
    openUrl(href).catch(() => {
      toast('This link isn’t available in the preview app.');
    });
  };
  // External links go to the system browser instead of replacing the app's page.
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!a) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin || !/^https?:$/.test(url.protocol)) return;
      e.preventDefault();
      openExternal(url.href);
    },
    true,
  );
  window.open = (target?: string | URL): null => {
    const url = target ? new URL(String(target), location.href) : null;
    if (url && url.origin !== location.origin && /^https?:$/.test(url.protocol)) {
      openExternal(url.href);
    } else {
      toast('New windows aren’t available in the preview app.');
    }
    return null;
  };
  const showOpened = async (): Promise<void> => {
    const names = await invoke<string[]>('take_opened_files');
    if (names.length > 0) toast(openedFilesMessage(names), 9000);
  };
  await listen('ls-open-files', () => void showOpened());
  await showOpened();
  // Look for an update a few seconds after launch, so starting up stays quick.
  setTimeout(() => {
    const quiet = (): void => {
      /* offline or no update feed: try again next launch */
    };
    if (/Android/i.test(navigator.userAgent)) {
      void import('@tauri-apps/api/app')
        .then(({ getVersion }) => getVersion())
        .then((v) => checkAndroidUpdate(v, openUrl, toast))
        .catch(quiet);
    } else {
      checkDesktopUpdate().catch(quiet);
    }
  }, 4000);
}

export function initPlatform(toast: (message: string, ms?: number) => void): void {
  if (isTauri()) {
    document.documentElement.dataset['shell'] = 'app';
    wireDesktop(toast).catch(() => {
      /* the editor still works without the native glue */
    });
  } else {
    watchServiceWorker();
  }
}
