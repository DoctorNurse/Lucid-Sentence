# Lucid Sentence — installable preview (`apps/shell`)

A [Tauri 2](https://v2.tauri.app) app that wraps the web app in `apps/demo` so
people can install Lucid Sentence without a developer setup: a `.dmg` for macOS
(Apple silicon and Intel), `.msi` and setup `.exe` for Windows, AppImage and
`.deb` for Linux, and an `.apk` for Android. iPhone and iPad use the web app
installed from Safari (Add to Home Screen); see the main README.

**Preview: .docx saving arrives with the engine.** The app runs the editor UI on
a sample page. Opening a `.docx` from Finder or Explorer starts the app and shows
a message that opening and saving `.docx` files come with the document engine.
The shell never reads the file.

## What the shell does

| Area             | Behavior                                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity         | Name "Lucid Sentence", bundle id `com.lucidsystems.sentence`, version `0.1.0-preview` (MSI uses `0.1.0`, macOS build number `0.1.0`, Android version code 1).                                                                                             |
| Icons            | The generated set from `pnpm icons`: `apps/desktop/icons/macos/LucidSentence.icns`, `apps/desktop/icons/windows/lucid-sentence.ico`, Linux hicolor PNGs, and `apps/mobile/android-res` (copied in during the APK build).                                  |
| File association | `.docx` ("Word Document", role Viewer, rank Alternate on macOS so it never takes over as the default app).                                                                                                                                                |
| Network          | None. The web app is bundled. A strict Content Security Policy allows only the app's own files. Three links open in the system browser, and only these: the Chapternal promo link and this repository's Issues pages (Help → Feedback / Contact Support). |
| Microphone       | Notes mode recording. macOS shows the usage message from `Info.plist`; the hardened runtime entitlement is in `Entitlements.plist`. Recording isn't wired up in the Android preview yet.                                                                  |

## Build locally

Needs Node 20.19+, pnpm 10, and Rust (stable). On Linux also install
`libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`. See the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm --filter @lucid-sentence/shell tauri dev      # run against the Vite dev server
pnpm --filter @lucid-sentence/shell tauri build    # installers in src-tauri/target/release/bundle/
```

Android needs the Android SDK, NDK, and Java 17:

```sh
pnpm --filter @lucid-sentence/shell tauri android init
pnpm --filter @lucid-sentence/shell tauri android build --apk
```

`src-tauri/gen/` and `src-tauri/target/` are generated and not committed.

## Releases

`.github/workflows/release.yml` builds every platform on a pushed `v*` tag and
publishes a GitHub Release with auto-generated notes. Running the workflow by hand
(or a pull request that touches `apps/shell` or `apps/demo`) builds everything and
keeps the files as workflow artifacts without releasing. Assets have stable names
(the README links to them under `releases/download/<tag>/…`; switch those links to
`releases/latest/download/…` once a stable, non-pre-release version ships):

`Lucid-Sentence-macOS.dmg`, `Lucid-Sentence-Windows-Setup.exe`,
`Lucid-Sentence-Windows.msi`, `Lucid-Sentence-Linux.AppImage`,
`Lucid-Sentence-Linux.deb`, `Lucid-Sentence-Android.apk`, `SHA256SUMS.txt`, plus the
updater files: `latest.json`, `Lucid-Sentence-macOS.app.tar.gz`, and a `.sig` next to
each updatable file.

Cut a release (after review; bump the version in `tauri.conf.json`, `Cargo.toml`, and
`package.json`, the numeric `bundleVersion`/`wix.version`, and Android's `versionCode`):

```sh
git tag -s v0.1.3-preview -m "Lucid Sentence 0.1.3 preview" && git push origin v0.1.3-preview
```

Release tags must be on a commit that contains this workflow. Tags with a
pre-release part (for example `v0.1.0-preview`) are published as GitHub
pre-releases; `releases/latest` skips those.

### Auto-update

| Platform              | How it updates                                                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS, Windows, Linux | Tauri's updater plugin. A few seconds after launch the app reads `https://doctornurse.github.io/Lucid-Sentence/updates/latest.json` (then `releases/latest/download/latest.json`), downloads the update, verifies its minisign signature against the public key in `tauri.conf.json`, and offers **Restart to update**. |
| Android               | Tauri's updater doesn't support mobile. The web app asks the GitHub Releases API for the newest release (pre-releases included) and offers **Download update**, which opens the APK link; Android's installer finishes. APKs signed with the same release key install in place.                                         |
| Web app, iOS          | The service worker downloads the new version in the background; the page offers **Reload for new version**.                                                                                                                                                                                                             |

Why Pages: `releases/latest` skips pre-releases, and every release so far is a
pre-release. After publishing, the Release workflow starts `pages.yml`, which copies
`latest.json` from the newest release into the site at `updates/latest.json`.

The updater key pair was made with `pnpm --filter @lucid-sentence/shell exec tauri
signer generate`. Only the public key is in the repository. The private key and its
password live in the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
secrets (and a private offline backup). Losing the private key means existing installs
can no longer auto-update: they would need a manual install of a build with a new key.

### Signing secrets (all optional)

Without them the build still succeeds: macOS gets an ad-hoc signature (users
approve it once in System Settings), Windows installers are unsigned (SmartScreen
warns), and the APK is signed with a temporary key.

| Secret                               | Used for                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`                  | Base64 of the **Developer ID Application** certificate exported as `.p12` (`openssl base64 -A -in cert.p12`).                                                             |
| `APPLE_CERTIFICATE_PASSWORD`         | The `.p12` export password.                                                                                                                                               |
| `APPLE_SIGNING_IDENTITY`             | Optional. For example `Developer ID Application: Lucid Systems LLC (TEAMID)`. If unset, the workflow uses the first Developer ID Application identity in the certificate. |
| `APPLE_ID`                           | Apple Account email used for notarization.                                                                                                                                |
| `APPLE_PASSWORD`                     | An **app-specific password** for that Apple Account (appleid.apple.com → Sign-In and Security → App-Specific Passwords).                                                  |
| `APPLE_TEAM_ID`                      | The 10-character Team ID (developer.apple.com → Membership).                                                                                                              |
| `WINDOWS_CERTIFICATE`                | Base64 of a code-signing `.pfx`.                                                                                                                                          |
| `WINDOWS_CERTIFICATE_PASSWORD`       | The `.pfx` password.                                                                                                                                                      |
| `ANDROID_KEYSTORE`                   | Base64 of a release keystore (`.jks`). Keep the keystore itself out of the repository and backed up safely: Android updates must be signed with the same key.             |
| `ANDROID_KEYSTORE_PASSWORD`          | Keystore password.                                                                                                                                                        |
| `ANDROID_KEY_ALIAS`                  | Key alias in the keystore.                                                                                                                                                |
| `ANDROID_KEY_PASSWORD`               | Optional; defaults to the keystore password.                                                                                                                              |
| `TAURI_SIGNING_PRIVATE_KEY`          | The updater private key (contents of the key file from `tauri signer generate`). Without it, no updater files are built.                                                  |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The updater key's password.                                                                                                                                               |

With the Apple secrets set, Tauri signs the app with the hardened runtime and
notarizes it, then the workflow signs the `.dmg`, submits it with
`xcrun notarytool`, staples the ticket (`xcrun stapler staple`), and checks it with
`spctl`. If only the certificate is set, the app and `.dmg` are signed but not
notarized.

Create an Android release keystore once, on your own computer:

```sh
keytool -genkeypair -v -keystore lucid-sentence-release.jks -alias lucid-sentence \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -i lucid-sentence-release.jks | pbcopy   # macOS; paste into the ANDROID_KEYSTORE secret
```

Without `ANDROID_KEYSTORE`, each release's APK is signed with a new temporary key,
so installing a newer preview over an older one fails: uninstall the old one first.
(0.1.0-preview was built that way. From 0.1.1-preview on, the repository has a
permanent release key, so APKs update in place.)

## Swapping in the engine later

The shell only points at a folder of web files (`build.frontendDist` in
`src-tauri/tauri.conf.json`). When the ONLYOFFICE-based editor is ready, it can
either replace that folder (web editor plus a native bridge in `src-tauri`) or the
desktop build can move to the DesktopEditors fork planned in `apps/desktop`. The
release workflow, icons, file association, and asset names stay the same.
