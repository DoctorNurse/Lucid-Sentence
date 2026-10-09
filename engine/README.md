# Document engine: ONLYOFFICE 9.4 (sdkjs + x2t)

Lucid Sentence opens and saves `.docx` files with the ONLYOFFICE document
engine, running entirely on the device, with no document server:

| Piece        | What it does                                                           | Where it comes from                                                                                                         |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| sdkjs        | Document model, layout, editing, canvas rendering                      | Built from source: `ONLYOFFICE/sdkjs` branch `release/v9.4.0` at the commit pinned in `manifest.json`                       |
| x2t          | Converts `.docx` ⇄ the editor's binary format                          | ONLYOFFICE `core`, compiled to WebAssembly by CryptPad (`cryptpad/onlyoffice-x2t-wasm`), sha512-pinned                      |
| fonts        | Metric-compatible fonts for layout (Carlito, Caladea, Liberation 2, …) | `ONLYOFFICE/core-fonts` at a pinned commit plus the Liberation 2.1.5 release; each file sha256-pinned in `fonts/fonts.json` |
| dictionaries | Hunspell spell-check dictionaries (en-US, en-GB, es-ES, fr-FR, de-DE)  | `ONLYOFFICE/dictionaries` at a pinned commit, sha256-pinned in `manifest.json`; only licenses compatible with AGPL-3.0      |
| bridge       | Small addon compiled into sdkjs (`sdkjs-addon/`)                       | Ours: offline open, binary export, saved-state reset, pictures, spelling navigation, PDF page data                          |
| host         | The page sdkjs runs in, plus the x2t worker (`host/`)                  | Ours                                                                                                                        |

We do not use ONLYOFFICE `web-apps` (their editor UI). Our own ribbon drives
sdkjs through its public `asc_docs_api` methods.

## Building

```sh
pnpm engine:build          # fetch, verify, build, stage into engine/dist
pnpm engine:build --check  # exit 1 if engine/dist is missing or stale
```

Needs git, python3, unzip and network access the first time; the downloads
are cached in `engine/.cache`, and each one is checked against the hashes in
`manifest.json` / `fonts/fonts.json`. `engine/dist` is about 97 MB (24 MB gzipped) and is not
committed. `apps/demo` serves and bundles it under `engine/`, and
`engine/dist/SOURCES.json` records exactly which sources went into it.

Layout of `engine/dist` (sdkjs loads its siblings by relative path):

```
sdkjs/word/sdk-all-min.js, sdk-all.js   the word editor
sdkjs/common/…                          font engine, zlib, images, chart styles
sdkjs/vendor/…                          jQuery, XRegExp (MIT)
fonts/000…025                           fonts in sdkjs's web font format
lucid/apps/word/main/index.html         the host page the app loads in an iframe
sdkjs/common/spell/spell/…              the Hunspell spell-check worker (WebAssembly)
dictionaries/<lang>/<lang>.aff, .dic    spell-check dictionaries; languages.js maps LCIDs
x2t/x2t.js, x2t.wasm, worker.js         the converter and its worker
licenses/…                              upstream license texts (fonts, dictionaries, …)
```

## How a document opens and saves

1. The app reads the file (native dialog, document picker, File System Access
   API, or `<input type=file>`).
2. The x2t worker converts `.docx` → `DOCY` binary and extracts `media/*`.
3. A fresh iframe loads the host page; `LucidHost.boot()` gives sdkjs the
   binary and blob URLs for the images, in sdkjs's offline mode.
4. The ribbon calls `asc_docs_api` methods (`put_TextPrBold`, `put_Style`,
   `put_ListType`, `Undo`, …), and sdkjs callbacks update ribbon state.
5. Save: `LucidBridge.getBinary()` serializes the document, the worker
   converts it back to `.docx` with the original image bytes, and the app
   writes the file.

## Printing and PDF

sdkjs lays the pages out for printing (`ToRendererPart`, the same data
ONLYOFFICE's own print uses), and x2t's PDF writer turns that into a PDF with
the shipped fonts embedded (the worker un-obfuscates them into `/fonts` once).
Pictures go in from the same `media/` files that saving uses. **Print** shows
the PDF in a hidden frame and opens the system print dialog; where there is no
built-in PDF viewer (the desktop and Android apps), it saves the PDF instead.
**File › Export › PDF** saves it.

## Spell check

sdkjs's Hunspell worker checks words as you type, in the languages in
`manifest.json` (`dictionaries`). The host page tells sdkjs only those
languages exist, so text in other languages isn't underlined. Review ›
Spelling (F7) and the right-click menu show suggestions, Ignore and
Ignore All.

## Version and license notes

- **Minimum ONLYOFFICE version: 9.4.** Earlier releases carried an AGPL §7(b)
  "retain the original Product logo" term in their file headers; the 9.4
  release branch replaced it with the additional terms reproduced in
  [`/NOTICE`](../NOTICE). The tag `v9.4.0.97` still has the old per-file
  headers, which is why we pin the `release/v9.4.0` branch commit instead.
- **x2t is core 9.3.2.** No 9.4 WebAssembly build exists yet; core's
  converter is outside the logo-term change, and building our own needs
  emscripten (tracked as an M1 follow-up).
- The sdkjs build stamps every output file with a notice saying it is a
  modified version based on the original ONLYOFFICE software developed by
  Ascensio System SIA. See [`/legal/MODIFICATIONS.md`](../legal/MODIFICATIONS.md).
- ONLYOFFICE is a trademark of Ascensio System SIA. We use no ONLYOFFICE logo
  or name in Lucid Sentence branding.

## Regenerating `fonts/AllFonts.js`

`fonts/AllFonts.js` (font list, Unicode ranges and the font picker's
`g_fonts_selection_bin`) comes from ONLYOFFICE's `allfontsgen` tool, run once
over the TTFs listed in `fonts/fonts.json`, in that order:

```sh
allfontsgen --input=<dir with the TTFs> --use-system=false \
  --allfonts-web=AllFonts.js --allfonts=AllFonts.native.js \
  --selection=font_selection.bin --images=images --output-web=web
```

`allfontsgen` ships in the ONLYOFFICE DocumentServer package
(`server/tools/`). Re-run it whenever a font is added, removed, or replaced,
then check that `web/NNN` matches `engine/dist/fonts/NNN` byte for byte.
