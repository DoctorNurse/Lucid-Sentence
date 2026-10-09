/**
 * Updates for the installed apps. Every check is quiet: offline, slow, or failing
 * networks just mean no prompt.
 *
 * - Desktop (macOS, Windows, Linux): Tauri's updater reads a signed latest.json
 *   (GitHub Pages, then GitHub Releases), downloads the update in the background,
 *   verifies its signature, and offers "Restart to update".
 * - Android: Tauri's updater doesn't support mobile, so the app asks the GitHub
 *   Releases API for the newest release (pre-releases included) and, if it is newer,
 *   offers to download its APK; Android's installer takes it from there. APKs are
 *   signed with the same release key, so the update installs over the current app.
 *   Releases have one APK per CPU type; Lucid-Sentence-Android.apk is the arm64 one
 *   (nearly every phone and tablet), so the app asks for the one matching its build.
 * - Web app / iPhone and iPad home-screen app: the service worker fetches the new
 *   version in the background and the page offers "Reload for new version".
 */
import { updatePrompt } from './editor/ui.js';

const REPO = 'DoctorNurse/Lucid-Sentence';
const APK = 'Lucid-Sentence-Android.apk';
/** Other CPU types' APKs, by Rust's std::env::consts::ARCH (the shell's app_arch). */
const APK_BY_ARCH: Record<string, string> = {
  arm: 'Lucid-Sentence-Android-armv7.apk',
  x86_64: 'Lucid-Sentence-Android-x86_64.apk',
};

/** The release asset to update from on this CPU type (arm64 and unknown: the default APK). */
export function apkName(arch: string | undefined): string {
  return (arch && APK_BY_ARCH[arch]) || APK;
}

interface Version {
  core: number[];
  pre: string[];
}

function parse(v: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim());
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] };
}

/** Semantic-version order: 1 if a > b, -1 if a < b, 0 if equal (or unparsable). */
export function compareVersions(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i]! > y.core[i]! ? 1 : -1;
  }
  // A release outranks its pre-releases (1.0.0 > 1.0.0-preview).
  if (x.pre.length === 0 || y.pre.length === 0) {
    return x.pre.length === y.pre.length ? 0 : x.pre.length === 0 ? 1 : -1;
  }
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) > Number(q) ? 1 : -1;
    if (pn !== qn) return pn ? -1 : 1;
    return p > q ? 1 : -1;
  }
  return 0;
}

export interface ReleaseInfo {
  tag_name: string;
  draft: boolean;
  assets: { name: string; browser_download_url: string }[];
}

/** The newest release with an APK that is newer than `current`, if any. */
export function newerApk(
  releases: readonly ReleaseInfo[],
  current: string,
  name = APK,
): { version: string; url: string } | null {
  let best: { version: string; url: string } | null = null;
  for (const r of releases) {
    if (r.draft || !parse(r.tag_name)) continue;
    // Releases before per-CPU APKs only have the default (universal) one.
    const apk = r.assets.find((a) => a.name === name) ?? r.assets.find((a) => a.name === APK);
    if (!apk || !apk.browser_download_url.startsWith(`https://github.com/${REPO}/`)) continue;
    const version = r.tag_name.replace(/^v/, '');
    if (compareVersions(version, current) <= 0) continue;
    if (!best || compareVersions(version, best.version) > 0) {
      best = { version, url: apk.browser_download_url };
    }
  }
  return best;
}

const online = (): boolean => typeof navigator === 'undefined' || navigator.onLine;

/** Desktop app: Tauri updater (signature-checked), then "Restart to update". */
export async function checkDesktopUpdate(): Promise<void> {
  if (!online()) return;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check({ timeout: 15_000 });
  if (!update) return;
  await update.download();
  updatePrompt(
    `Update available: Lucid Sentence ${update.version} is ready.`,
    'Restart to update',
    async () => {
      await update.install();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    },
  );
}

/** Android app: compare with the newest GitHub release and offer its APK. */
export async function checkAndroidUpdate(
  current: string,
  arch: string | undefined,
  openUrl: (url: string) => Promise<void>,
  toast: (message: string, ms?: number) => void,
): Promise<void> {
  if (!online()) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, 10_000);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) return;
    const found = newerApk((await res.json()) as ReleaseInfo[], current, apkName(arch));
    if (!found) return;
    updatePrompt(
      `Update available: Lucid Sentence ${found.version}.`,
      'Download update',
      async () => {
        await openUrl(found.url);
        toast('When the download finishes, open it and tap Update.', 8000);
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Web app: register the service worker and offer a reload when a new version is waiting. */
export function watchServiceWorker(): void {
  if (location.protocol !== 'https:' || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const offer = (worker: ServiceWorker): void => {
    updatePrompt('A new version of Lucid Sentence is ready.', 'Reload for new version', () => {
      sw.addEventListener('controllerchange', () => {
        location.reload();
      });
      worker.postMessage('skip-waiting');
    });
  };
  window.addEventListener('load', () => {
    sw.register('./sw.js')
      .then((reg) => {
        // A version downloaded earlier is already waiting.
        if (reg.waiting && sw.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          next?.addEventListener('statechange', () => {
            // Only an update (there is a current version) needs a reload.
            if (next.state === 'installed' && sw.controller) offer(next);
          });
        });
        // Home-screen apps stay open for days: check again when they come back.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && online()) void reg.update().catch(() => {});
        });
      })
      .catch(() => {
        /* offline support is optional */
      });
  });
}
