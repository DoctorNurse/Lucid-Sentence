---
title: "Lucid Sentence — Planning Document"
subtitle: "A free, open-source word processor with Word-equivalent function and layout"
author: "Prepared for R H"
date: "October 8, 2026 (draft v0.6)"
---

# Lucid Sentence — Planning Document

*Draft v0.6, October 8, 2026. Prepared for R H. External facts link to their sources. This document is not legal advice.*

**What changed in v0.6.** Adds §9, **AI features**:

- **Part A, optional offline on-device AI.** The minimum device is the Galaxy S24. Covers models, runtimes, capability tiers, and an AI go/no-go gate.
- **Part B, MCP readiness.** Lucid Sentence acts as a local MCP server, gated by per-document "Share with AI" keys. One tool layer serves both the on-device model and external agents.

The roadmap, risks, and open questions are updated to match.

**What changed in v0.5.** The product is renamed **Lucid Sentence** (from Lucid Systems). The planned GitHub repository is `lucid-sentence`, licensed AGPL-3.0. "Sentence" is used as a short form where it reads naturally.

**What changed in v0.4.** R H decided that **v1 includes every tab of Word's ribbon** (File, Home, Insert, Draw, Design, Layout, References, Mailings, Review, View, Help) on all four platforms, with the full mobile ribbon. This version:

- adds a per-tab audit of what ONLYOFFICE already provides and where new engine work is needed, with each item marked verified or unverified (§4.8);
- restructures the roadmap into pre-v1 milestones (internal alphas and betas grouped by tab) that lead to one v1 release, with polish and extras after v1 (§7);
- adds team and effort considerations, using relative sizes rather than dates (§7.3);
- updates the risks and removes open question 7 (§8).

**What changed in v0.3.** R H decided that **mobile v1 must have full ribbon editing, the same as desktop**. That means the same tabs, groups, and commands, adapted to touch the way Word mobile does it, not a reduced command set. This version:

- adds that requirement to the goals and the mobile UI spec (§1, §4.6);
- chooses how the mobile UI gets built (§3.3);
- turns the mobile spike into a measurable go/no-go gate (§3.4);
- ships mobile alongside desktop in v1 (§7);
- updates the risks and open questions to match (§8).

**What changed in v0.2.** Sentence now supports **.docx only**. Legacy .doc open/save is out of scope; at most it may come later as a one-way import. Because of that, the engine recommendation switches to **ONLYOFFICE**, which is AGPL-3.0 and natively built around OOXML (the format behind .docx). The product itself will therefore be **AGPL-3.0**. Collabora (built on LibreOffice) is kept as the fallback.

## 1. Lucid Sentence product summary

**Lucid Sentence** (by Lucid Systems) is a free, open-source word processor for Windows, macOS, Android, and iOS/iPadOS. It aims to work almost exactly like Microsoft Word:

- It opens, edits, and saves **.docx**, with Word-equivalent page layout.
- Its ribbon tabs and groups sit in the same order and the same places as Word's, so a Word user is productive immediately.
- Visually it should feel lighter and more modern than Word, with no copied Microsoft artwork or branding.

### Goals

- **Functional parity.** Commands, dialogs, and shortcuts behave the way Word users expect.
- **Ribbon parity.** Tabs appear in the order File, Home, Insert, Draw, Design, Layout, References, Mailings, Review, View, Help, with Word's groups inside each tab.
- **.docx fidelity.** The OOXML family (.docx, plus .dotx templates and .docm macro-enabled documents) is the native format. Round-tripping a file through Word and Sentence must not silently lose content. PDF is offered as an export only.
- **Page fidelity.** In Print Layout, pagination, rulers, margins, headers and footers, columns, and sections should match Word.
- **One shared UI layer across four platforms**, working offline-first with local files.
- **Mobile command parity (hard requirement for v1).** The phone and tablet apps expose **every tab, group, and command** that desktop has, in the same order. Touch only changes how the ribbon is laid out (a collapsible ribbon on tablet, a tab picker and bottom sheet on phone, as in Word mobile). It never changes which commands exist. A command that ships on desktop ships on mobile in the same release.
- **v1 scope = the entire Word ribbon.** All eleven tabs and their contextual tabs, with every non-stub command in §4.2, ship in v1 on Windows, macOS, Android, and iOS/iPadOS.
- **Free and copyleft (AGPL-3.0).** No paid tier, no telemetry by default, and no account required.

### Non-goals (v1)

- **.doc (Word 97–2003 binary) open or save.** A possible future nice-to-have is a one-way .doc to .docx import. ONLYOFFICE's x2t converter can already read .doc ([core](https://github.com/ONLYOFFICE/core)), so this would be cheap to add later if wanted.
- Other formats as edit targets (ODT, RTF), and spreadsheet or presentation apps.
- Real-time co-authoring and any cloud service.
- Running VBA macros. Macros inside .docm files are preserved but not run.
- Cloud AI of any kind. Optional AI runs on the device (§9); external agents connect only by explicit user action through MCP.
- Features that depend on Microsoft 365 services, such as Copilot, cloud Editor, Researcher, and Loop. Their ribbon slots are kept as stubs or replaced with open alternatives.
- Copying Word's icons or other visual artwork.

## 2. Document engine

### 2.1 Re-evaluation with .docx-only scope

The v0.1 recommendation for Collabora depended on one requirement: **saving .doc**. ONLYOFFICE has said it won't add that ([issue #1694](https://github.com/ONLYOFFICE/DesktopEditors/issues/1694)). With .doc out of scope, the comparison changes:

| Criterion | **ONLYOFFICE** (recommended) | **Collabora / LibreOfficeKit** (fallback) |
|---|---|---|
| Native document model | **OOXML-native.** .docx is its native format ([DesktopEditors](https://github.com/ONLYOFFICE/DesktopEditors)). | ODF-native. .docx goes through an import/export filter. |
| .docx fidelity | Strong. This is its home format. | Good and actively improved, but every load and save is a conversion. |
| Layout engine | JavaScript/canvas layout in sdkjs ([sdkjs](https://github.com/ONLYOFFICE/sdkjs)) | Writer's C++ layout, sent to the UI as rendered tiles |
| Existing UI | Already has a Word-like tabbed toolbar in web-apps, with separate desktop and mobile UIs ([web-apps](https://github.com/ONLYOFFICE/web-apps/)) | Notebookbar UI in HTML/JS |
| License | AGPL-3.0 plus additional §7 terms (see §5.2) | MPL-2.0 ([LibreOffice](https://www.libreoffice.org/licenses/); [COPYING](https://github.com/CollaboraOnline/online/blob/main/COPYING)) |
| Desktop | Open-source Desktop Editors app for Windows, macOS, and Linux ([DesktopEditors](https://github.com/ONLYOFFICE/DesktopEditors)) | Collabora Office desktop app for Windows 11 x64, macOS 15+ on Apple Silicon, and Linux ([press release](https://www.collaboraonline.com/blog/press-release-bringing-collabora-online-to-the-desktop/)) |
| **Mobile** | **Gap.** The official iOS and Android apps are commercially licensed. An open-source path exists but has to be built (see §3.2). | **Ready.** Open-source Android and iOS/iPadOS apps already ship (Collabora Office 26.04) ([release](https://forum.collaboraonline.com/t/collabora-office-26-04-now-available-on-android-and-ios/5034)). |
| Maturity / community | Mature and widely deployed. Euro-Office is a fork of it (GA June 2026) ([Nextcloud](https://nextcloud.com/blog/euro-office-general-availability-set-for-june-9/)). | Very mature engine. The new desktop app is young (first release Nov 2025). |

Other options (docx.js, Mammoth, or a custom OOXML engine) remain unsuitable. They are generation or conversion libraries, not editors with a layout engine, and building our own would take years of work before reaching parity.

### 2.2 Recommendation

**Engine: ONLYOFFICE sdkjs + web-apps + core/x2t, version 9.4 or later, AGPL-3.0.**

- **Why.** It is the strongest open-source fit for .docx-only: OOXML is its native model, its layout engine runs on the client, and its UI is already ribbon-like. Turning it into Word's exact tab and group map is mostly front-end work in `web-apps`.
- **Cost of this choice.** Sentence must build its own open-source mobile shell (§3.2), and the whole product is AGPL-3.0 (§6).
- **When to fall back to Collabora.** Switch if either of these happens in Phase 0:
  1. The open mobile path proves infeasible, meaning sdkjs mobile editing cannot be made to work acceptably in a WebView on mid-range phones.
  2. The fidelity bake-off shows no meaningful .docx advantage for ONLYOFFICE.

  There is now a third consideration, because v1 requires the whole ribbon: **feature coverage**. ONLYOFFICE lacks several Word features (§4.8) that LibreOffice Writer already has natively, including alphabetical indexes, a bibliography database, and mail merge with labels and envelopes ([LO index help](https://help.libreoffice.org/latest/en-US/text/swriter/guide/indices_index.html); [LO bibliography help](https://help.libreoffice.org/latest/en-US/text/swriter/guide/indices_literature.html); [Writer Guide: Mail Merge](https://books.libreoffice.org/en/WG262/WG26214-MailMerge.html)). The Phase 0 decision should therefore weigh the **cost of the gaps in each engine** alongside mobile performance and .docx fidelity. ONLYOFFICE remains the recommendation because .docx fidelity is the core promise, and its gaps can be built on its OOXML model. The trade-off is now closer than it was.

  The bake-off compares Word, ONLYOFFICE, and LibreOfficeKit by rendering a real-world .docx corpus to PDF in each and measuring visual differences.

## 3. App shells

### 3.1 Desktop (Windows, macOS)

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **Fork ONLYOFFICE DesktopEditors** (recommended) | `desktop-apps` is the native shell: Qt on Windows/Linux and native code on macOS. `desktop-sdk` embeds Chromium (CEF) and injects a native bridge that the editors use for local files, x2t conversion, fonts, and printing ([desktop-sdk](https://github.com/ONLYOFFICE/desktop-sdk); [desktop-apps](https://github.com/ONLYOFFICE/desktop-apps); [architecture write-up](https://weekly-geekly.imtqy.com/articles/279397/index.html)) | Offline editing, local x2t, printing, and font enumeration already work. The bridge is what web-apps' desktop mode expects. Builds come from [build_tools](https://github.com/ONLYOFFICE/build_tools). | Heavy C++/CEF build. We must strip the spreadsheet, slides, and PDF editors and the start page, and rebrand. Tracking upstream means rebasing a large fork. |
| Electron + sdkjs + x2t | Bundled Chromium. x2t runs as a native child process or as WebAssembly. | Familiar tooling, and one JS codebase for the shell. | We would re-implement the native bridge (the `AscDesktopEditor` API surface) or a server shim. Large binaries. Desktop only. |
| Tauri 2 + sdkjs + x2t | System WebView (WebView2 on Windows, WKWebView on macOS), with stable iOS/Android support since Oct 2024 ([Tauri 2.0](https://v2.tauri.app/blog/tauri-20/); [webviews](https://v2.tauri.app/reference/webview-versions/)) | Small binaries, and potentially **one shell for all four platforms**. | Same bridge re-implementation as Electron, plus a different web engine per OS that needs testing. Least proven with sdkjs. |

**Recommendation: fork DesktopEditors for v1 desktop.** It is the fastest route to a fully working offline editor. Keep all Sentence-specific UI in the shared web-apps fork, so that moving to a Tauri shell later is optional, not a rewrite. In Phase 0, prototype Tauri for desktop at the same time as the mobile shell (§3.2). If the shared bridge layer works well, a single Tauri shell for all four platforms becomes a later simplification.

### 3.2 Mobile (Android, iOS/iPadOS): the honest gap

**What isn't open source:**

- ONLYOFFICE's iOS and Android apps are **commercially licensed** ([ONLYOFFICE license guide](https://www.onlyoffice.com/blog/2026/05/onlyoffice-license-and-trademark-policy)).
- Their native editor glue modules (`core-ext`, the Android editor modules) are not public. Developers trying to build the Android app from source report those modules as missing ([community forum](https://community.onlyoffice.com/t/about-android-app/520); [build report](https://devhide.com/onlyoffice-for-android-building-77228752)). The public repos ship only binary packages ([editors-android-packages](https://github.com/ONLYOFFICE/editors-android-packages); [editors-ios-sp](https://github.com/ONLYOFFICE/editors-ios-sp)).
- ONLYOFFICE's own docs say its **mobile web editors are available only in commercial builds** (Enterprise/Developer). In the Community server, mobile browsers get view-only mode ([mobile integration](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/mobile-integration/); [help center](https://helpcenter.onlyoffice.com/mobile/android/mobile-web-editors/overview.aspx)).

**What is open source and usable:**

1. **The mobile editor UI.** The touch UI source (React + Framework7) is in the AGPL `web-apps` repo under `apps/documenteditor/mobile` ([web-apps](https://github.com/ONLYOFFICE/web-apps/tree/master/apps)).
2. **The editing engine.** sdkjs is AGPL, and ONLYOFFICE documents running the editor inside a native WebView (Android WebView or iOS WKWebView) with `type: "mobile"` ([mobile integration](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/mobile-integration/)).
3. **Local conversion (x2t) on the device.** There are two ways to do this:
   - **Native x2t.** `build_tools` lists `ios` and `android_*` as build targets ([configure.py](https://github.com/ONLYOFFICE/build_tools/blob/master/configure.py)).
   - **x2t compiled to WebAssembly**, as CryptPad has done ([onlyoffice-x2t-wasm](https://github.com/cryptpad/onlyoffice-x2t-wasm)).
4. **Prior art for running without a server.** [ranuts/document](https://github.com/ranuts/document) and [wasm-onlyoffice-sdk](https://github.com/oonxt/wasm-onlyoffice-sdk) both run sdkjs + web-apps + x2t-WASM entirely on the client, using a mock socket and an in-browser "editor server" in place of Document Server.

**Proposed Lucid Sentence mobile architecture:**

- **Shell: Capacitor**, which is mature for WebView-based mobile apps. Tauri 2 mobile is the alternative if Phase 0 points us to one shell for all platforms.
- **UI:** the same Sentence UI as desktop, using a responsive touch layout (see §3.3 for why we don't extend ONLYOFFICE's mobile UI).
- **Engine:** sdkjs.
- **Local "editor server" shim:** handles document open and save, autosave, and fonts, with no network.
- **Conversion:** x2t, starting with **WASM** for a fast prototype and moving to **native x2t through a Capacitor plugin** if WASM performance or memory is inadequate.
- **Platform integration:** file access through Android's Storage Access Framework and the iOS document picker / Files app.

**Effort and risk:**

| Item | Effort | Risk |
|---|---|---|
| WebView + sdkjs mobile UI running offline | Medium. Prior art exists. | Edit-mode behavior and any client-side license or permission checks in web-apps or sdkjs must be verified and, where needed, modified (allowed under AGPL). |
| x2t on device (WASM first, then native) | Medium–high | Memory and startup time on low-end phones. Native cross-compilation is officially a build target, but there is little public documentation for building it as an app library. |
| Fonts, printing, share sheet, file providers | Medium | iOS WKWebView memory limits on large documents. |
| Keeping pace with upstream | Ongoing | ONLYOFFICE develops its mobile UI mainly for its commercial apps. Upstream refactors may break our shim. |

**Overall:** this is feasible, but it is **the largest single engineering risk** in the plan. The full-ribbon requirement makes it larger. That is why it is a measurable Phase 0 go/no-go gate (§3.4) that must pass before v1 work is committed.

### 3.3 Mobile UI strategy for full ribbon parity

ONLYOFFICE's open-source mobile touch UI (`apps/documenteditor/mobile`, React + Framework7) is designed as a **reduced command set**. It is a set of edit panels for common formatting, not the full desktop toolbar with all its dialogs. Phase 0 will produce an exact list of what it covers against §4.2. That leaves two ways to reach full parity:

| | **A. Extend ONLYOFFICE's mobile UI to the full command set** | **B. Run the desktop-style UI (sdkjs + web-apps desktop controllers and dialogs) with a responsive touch layout** (recommended) |
|---|---|---|
| Starting point | Touch-native, but most commands and dialogs are missing | Every command and dialog already exists, wired to sdkjs |
| Work required | Re-implement in React/Framework7 a large share of the desktop features: every group, dialog, and pane (paragraph, tables, styles, references, mail merge, review) | Build a responsive ribbon renderer (§4.6). Re-present dialogs as touch sheets. Add touch input and selection handling to the desktop editor view, reusing the touch handling that sdkjs already uses for its mobile editor where possible (to verify in Phase 0). |
| Long-term cost | **Two UIs per feature, forever.** Every new command is built twice, and the two drift apart, which directly breaks the parity requirement. | **One UI.** One command registry renders the desktop, tablet, and phone layouts, so parity is built in. |
| Main risk | Scope: we would effectively rebuild the desktop UI | Touch ergonomics and performance of desktop-oriented controllers and dialogs in a mobile WebView |

**Recommendation: B.** Sentence is already writing its own Word-map ribbon on top of web-apps (§4.2), so a single command registry with three layouts costs little extra. It is the only option that keeps parity automatically. From ONLYOFFICE's mobile UI we borrow selected patterns and code (touch selection, magnifier, keyboard-accessory behavior) rather than its command surface. Option A remains a partial fallback for specific panels that are hard to adapt to touch.

### 3.4 Mobile go/no-go gate (end of Phase 0)

*All numbers below are **proposed targets** for R H to confirm. They are not measured or published figures.*

**Reference devices (proposed).** These cover a recent mid-range phone and an older but supported device on each OS, plus tablets:

- **Android:** one current mid-range phone (for example Samsung Galaxy A5x class or Pixel "a" class) and one about 3 years old.
- **iOS:** iPhone SE (3rd generation) or iPhone 13 class, plus one current iPhone.
- **Tablets:** base iPad (recent generation) and one mid-range Android tablet.

**Test corpus (proposed).** All files are real-world .docx:

- **S:** 5 pages of text.
- **M:** 50 pages with tables, images, headers and footers, and a table of contents.
- **L:** 300 pages, a long report with footnotes, about 5–10 MB.
- **XL:** a 25 MB image-heavy file (stress test only, not gating).

**Pass criteria (proposed targets).** "Phone" means the mid-range reference phone; "older phone" means the older reference devices.

| Metric | Target |
|---|---|
| Cold open to editable | S ≤ 2 s; M ≤ 5 s; L ≤ 12 s on the mid-range phone. Older phones get +50%. |
| Typing latency (keystroke to glyph on screen), p95 | ≤ 50 ms on M; ≤ 100 ms on L |
| Scrolling | ≥ 50 fps median on M; no blank-page flashes over 300 ms |
| Peak memory (app plus WebView) | ≤ 800 MB on M, ≤ 1.2 GB on L, on iPhone and Android. No out-of-memory kill during a 30-minute scripted edit session on L. |
| Save (.docx) | M ≤ 3 s; L ≤ 8 s. Saved file opens in Word without repair prompts or content loss. |
| Ribbon parity | 100% of the full v1 command list (all eleven tabs) is reachable on the phone, each command within ≤ 3 taps after entering edit mode. All dialogs are usable at 375 pt width. |
| Stability | Zero crashes across the scripted session on all reference devices |
| Install size | ≤ 300 MB per platform (fonts included) |

**Decision rule:**

- **Pass:** every gating criterion is met on the mid-range devices, and criteria on the older devices are met or within 25%. Proceed with ONLYOFFICE on all platforms.
- **Conditional:** up to two criteria are missed by no more than 25%, and there is a credible fix (for example native x2t instead of WASM, or lazy loading). Do one fix iteration and re-test once.
- **Fail:** anything else, or failing the re-test. **Switch the whole product to Collabora / LibreOfficeKit**, which ships open-source Android and iOS apps (§2.1). Run the same gate on Collabora before committing. Collabora's mobile UI is also not a full Word ribbon, so the §4.6 ribbon work applies either way. Running two engines (ONLYOFFICE on desktop, Collabora on mobile) is **not recommended**: users would see different .docx layout across devices, and the team would carry double the maintenance.

## 4. UI specification

### 4.1 Window layout (desktop)

From top to bottom:

1. Title bar, containing the Quick Access Toolbar (QAT), document name, search box, and window controls.
2. Ribbon tab row.
3. Ribbon (can collapse to show tabs only).
4. Horizontal ruler.
5. Page canvas, with the vertical ruler on its left and an optional Navigation pane.
6. Status bar.

### 4.2 Ribbon map

The tab and group lists below follow current Microsoft 365 Word. Re-verify them against a pinned reference Word build in Phase 0. *(stub)* marks a slot that is kept in place but disabled or replaced with an open alternative. Each command maps to an sdkjs API call; Phase 0 produces the gap list.

| Tab | Groups → key commands |
|---|---|
| **File** (backstage) | See §4.4 |
| **Home** | **Clipboard:** Paste (Keep Source / Merge / Text Only, Paste Special), Cut, Copy, Format Painter · **Font:** Font, Size, Grow/Shrink, Change Case, Clear Formatting, B/I/U, Strikethrough, Sub/Superscript, Text Effects, Highlight, Font Color, Font dialog · **Paragraph:** Bullets, Numbering, Multilevel List, Indent, Sort, Show ¶, Align, Line & Paragraph Spacing, Shading, Borders, Paragraph dialog · **Styles:** gallery, Styles pane · **Editing:** Find, Replace, Select · **Voice:** Dictate *(stub)* · **Editor / Add-ins** *(stub)* |
| **Insert** | **Pages:** Cover Page, Blank Page, Page Break · **Tables:** Table grid, Insert/Draw Table, Convert Text to Table, Quick Tables · **Illustrations:** Pictures, Shapes, Icons, 3D Models *(stub)*, SmartArt, Chart, Screenshot · **Add-ins** *(stub)* · **Media:** Online Video · **Links:** Link, Bookmark, Cross-reference · **Comments:** Comment · **Header & Footer:** Header, Footer, Page Number · **Text:** Text Box, Quick Parts, WordArt, Drop Cap, Signature Line, Date & Time, Object · **Symbols:** Equation, Symbol |
| **Draw** | **Drawing Tools:** Select, Lasso, Eraser, pen gallery, Add Pen · **Convert:** Ink to Shape, Ink to Math · **Insert:** Drawing Canvas · **Replay:** Ink Replay |
| **Design** | **Document Formatting:** Themes, Style Set gallery, Colors, Fonts, Paragraph Spacing, Effects, Set as Default · **Page Background:** Watermark, Page Color, Page Borders |
| **Layout** | **Page Setup:** Margins, Orientation, Size, Columns, Breaks, Line Numbers, Hyphenation · **Paragraph:** Indent Left/Right, Spacing Before/After · **Arrange:** Position, Wrap Text, Bring Forward, Send Backward, Selection Pane, Align, Group, Rotate |
| **References** | **Table of Contents** · **Footnotes:** Insert Footnote/Endnote, Next Footnote, Show Notes · **Research** *(stub)* · **Citations & Bibliography:** Insert Citation, Manage Sources, Style, Bibliography · **Captions:** Insert Caption, Table of Figures, Update Table, Cross-reference · **Index:** Mark Entry, Insert/Update Index · **Table of Authorities:** Mark Citation, Insert/Update ToA |
| **Mailings** | **Create:** Envelopes, Labels · **Start Mail Merge:** Start, Select Recipients, Edit Recipient List · **Write & Insert Fields:** Highlight Merge Fields, Address Block, Greeting Line, Insert Merge Field, Rules, Match Fields, Update Labels · **Preview Results:** Preview, navigation, Find Recipient, Check for Errors · **Finish:** Finish & Merge |
| **Review** | **Proofing:** Spelling & Grammar (local engines), Thesaurus, Word Count · **Speech:** Read Aloud (OS text-to-speech) · **Accessibility:** Check Accessibility · **Language:** Translate *(stub)*, Language · **Comments:** New, Delete, Previous, Next, Show Comments · **Tracking:** Track Changes, Display for Review, Show Markup, Reviewing Pane · **Changes:** Accept, Reject, Previous, Next · **Compare:** Compare, Combine · **Protect:** Block Authors *(stub)*, Restrict Editing · **Ink:** Hide Ink |
| **View** | **Views:** Read Mode, Print Layout, Web Layout, Outline, Draft · **Immersive:** Focus, Immersive Reader · **Page Movement:** Vertical, Side to Side · **Show:** Ruler, Gridlines, Navigation Pane · **Zoom:** Zoom, 100%, One Page, Multiple Pages, Page Width · **Window:** New Window, Arrange All, Split, View Side by Side, Synchronous Scrolling, Reset Window Position, Switch Windows · **Macros** (view only, not run) · **Properties** |
| **Help** | Help, Contact Support (opens the project issue tracker), Feedback, Show Training, What's New |

**Contextual tabs** appear to the right of Help when relevant, as in Word:

- Table Design and Table Layout (when the cursor is in a table)
- Picture Format
- Shape Format
- Header & Footer
- Equation

### 4.3 Quick Access Toolbar, keyboard, mini toolbar

- **QAT:** AutoSave, Save, Undo with a history dropdown, Redo, and Customize. It can sit above or below the ribbon.
- **Keyboard:** Word-equivalent shortcuts throughout. Alt or F10 shows KeyTips (letter badges for ribbon navigation).
- **On selection or right-click:** a mini toolbar and context menu with Word's item set.

### 4.4 Backstage (File)

The left rail contains: Home, New, Open, Info, Save, Save As, Print, Share, Export, Close, and at the bottom Account and Options.

- **Info:** document properties, Protect Document, Inspect Document, and local version history. If a .docx was saved in an older Word compatibility mode, Info shows that mode and offers a **Convert** option, as Word does.
- **Save As:** .docx, .dotx, and .docm only.
- **Export:** PDF.
- **Open:** .docx, .dotx, and .docm. Selecting a .doc file shows a clear "not supported" message (or, if the import is added later, "import as .docx").
- **Print:** live preview with printer and settings controls.
- **Options:** Word's categories (General, Display, Proofing, Save, Language, Accessibility, Advanced, Customize Ribbon, QAT, Trust Center).

### 4.5 Status bar and page view

- **Status bar, left:** page X of Y, word count, proofing status, language, accessibility.
- **Status bar, right:** Focus, view buttons, zoom slider, zoom percentage.
- **Page view:** centered pages with a soft shadow. Both rulers can be dragged to set margins, indents, and tab stops. Text boundaries and formatting marks can be toggled.

### 4.6 Mobile adaptation: full ribbon on touch

**Rule.** Phone and tablet expose the **complete §4.2 ribbon**: every tab (including File/backstage and the contextual tabs), every group, and every command, in Word's order. Touch adaptation changes **layout and presentation only**. All three layouts are generated from the same command registry, and CI fails if any command lacks a phone or tablet placement.

**Tablet (iPad, Android tablets; width ≥ about 700 pt, proposed breakpoint):** a near-desktop ribbon.

- The full tab row is shown in desktop order, with a single-row ribbon underneath. Groups appear left to right as on desktop, with group labels.
- When the window narrows (split view or portrait), groups collapse progressively. Rarely used commands move into each group's overflow dropdown first, then whole groups collapse into one group button that opens a popover, the same way Word's ribbon scales down.
- Touch targets are at least 44 pt. The ribbon can be pinned or set to auto-hide while typing.
- Rulers and the QAT are optional. The Draw tab supports stylus input.
- Dialogs open as centered sheets with the same fields as desktop.

**Phone (narrower than the breakpoint):** a tab picker and bottom sheet, as in Word mobile, with every group reachable.

- **Reading view first.** A pencil button enters edit mode.
- **Collapsed ribbon bar** (one row, above the keyboard or at the bottom of the screen) with three parts:
  1. a **tab picker** button ("Home ▾");
  2. a strip of that tab's most-used commands, which scrolls horizontally;
  3. a **sheet toggle** (▴).
- **Tab picker:** lists **all** tabs in desktop order, plus contextual tabs when active (for example "Table Layout" when the cursor is in a table).
- **Bottom sheet:** expands to half or full height and shows **every group of the current tab** as labeled sections, in desktop order. Each group lists all of its commands. Commands that open galleries or dialogs push a sub-page inside the sheet, with a back button. The full set is reachable in **≤ 3 taps** from edit mode: tab picker, then a command, then a sub-page if needed.
- **Backstage (File):** a full-screen page with the same sections as desktop.
- **Find a command:** a search field at the top of the sheet. It searches all commands, like Word's "Tell me", and offers a fast route to anything.
- **Selection:** touch handles and a floating mini toolbar (cut, copy, paste, B/I/U, comment, more).
- **Keyboard accessory row** above the on-screen keyboard: undo, B/I/U, lists, indent, and the sheet toggle.
- **Dialogs** become full-screen sheets with the same fields and sections as desktop (for example Paragraph, Page Setup, Mail Merge Recipients). Fields are never removed for small screens; long dialogs scroll or are split into sub-pages.

**Tab-specific notes for touch:**

- **Draw:** on tablets with a stylus, the pen tools are first-class. On phones, finger drawing requires an explicit "draw mode" toggle, so that scrolling isn't mistaken for ink. Pressure and tilt support in WKWebView and Android WebView pointer events needs testing (*unverified*).
- **Mailings:**
  - The recipient list is picked from local files: CSV or XLSX through the system file picker.
  - Edit Recipient List is a full-screen table editor.
  - Preview Results uses swipe to move between records.
  - Finish & Merge outputs a merged .docx or PDF through the share sheet. "Send Email" hands off to the OS mail app, one message per record or in batches.
  - Envelopes and Labels dialogs scroll on phones, with no fields removed.
- **References and Review:** panes such as Manage Sources, the Reviewing Pane, and Comments open as full-height sheets on phones and as side panels on tablets.

**Both layouts:** hardware-keyboard shortcuts and KeyTips work when a keyboard is attached. Mouse or trackpad input on iPad and Android tablets switches to desktop-style hover and right-click menus.

### 4.7 "Fresher" visual identity

- **Type:** Inter (SIL OFL) at 13–14 px with generous line height. Avoid Segoe UI.
- **Surfaces:** 8–12 px corner radii, a soft elevated ribbon, light group separators, and quieter group labels.
- **Icons:** an original 1.5 px line icon set, which can start from Lucide or Phosphor. Do not trace Word or Fluent icons. Do not reuse ONLYOFFICE's icon art unless we follow its CC BY-SA 4.0 terms (§5.2). Replacing them is cleaner.
- **Color:** a distinctive accent color that isn't Word blue, with user-selectable accents.
- **Themes:** Light, Dark, and High-contrast, following the OS setting, with an optional dark page in dark mode.
- **Motion:** 120–160 ms transitions that honor the system's reduce-motion setting.
- **Density:** Comfortable and Compact modes.

### 4.8 Feature coverage vs. ONLYOFFICE (per tab)

**Legend:**

- **✔ Verified:** documented in ONLYOFFICE's Document Editor help center (linked).
- **? Unverified:** not found in the help center, or only available through a plugin. Phase 0 must confirm whether sdkjs supports it, at least in its document model.
- **✖ Gap:** new engine work is needed (sdkjs model, layout, or field support). Gaps are also marked unverified when the only evidence is that no documentation exists.
- **UI only:** the engine has it; Sentence only needs ribbon or dialog work.

The help center lists the editor's topics ([index](https://helpcenter.onlyoffice.com/docs/userguides/document_editor)). ONLYOFFICE's tab names differ from Word's; for example, review features live on its Collaboration tab.

| Word tab | Already in ONLYOFFICE | Gaps / new engine work |
|---|---|---|
| **File** | ✔ Open, create, save, print, download ([FileTab](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/FileTab.aspx); [SavePrintDownload](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/SavePrintDownload.aspx)). ✔ Document info ([ViewDocInfo](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/ViewDocInfo.aspx)). ✔ Password protection ([password](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/password.aspx)). ✔ Version history in the online editor ([versionhistory](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/versionhistory.aspx)). | ✖ Inspect Document (metadata and hidden content), *unverified*. ✖ Local version history on desktop and mobile is shell work, *unverified*. Backstage layout is UI only. |
| **Home** | ✔ Clipboard, Format Painter ([CopyClearFormatting](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/CopyClearFormatting.aspx)). ✔ Font and decoration ([FontTypeSizeColor](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/FontTypeSizeColor.aspx); [DecorationStyles](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/DecorationStyles.aspx)). ✔ Lists, spacing, indents, borders and shading ([CreateLists](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/CreateLists.aspx); [LineSpacing](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/LineSpacing.aspx); [addborders](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/addborders.aspx)). ✔ Styles ([formattingpresets](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/formattingpresets.aspx)). ✔ Find and replace ([search](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/search.aspx)). | ? Text Effects (glow, reflection on text). ? A Word-like Styles pane (UI only if the style model is complete). Dictate is a stub. |
| **Insert** | ✔ Tables, images, shapes, charts, SmartArt, equations, symbols, Text Art and text boxes, drop cap, date and time, headers and footers, page numbers, hyperlinks, bookmarks, content controls, video ([InsertTab](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/InsertTab.aspx); [InsertSmartArt](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/InsertSmartArt.aspx)). ? Field codes: the help index lists a topic for them, but the page returned 404 on Oct 8, 2026. | ✖ Cover Page gallery (building blocks), *unverified*. ✖ Quick Parts / AutoText (glossary document), *unverified*. ? Signature line (desktop has digital signatures on its Protection tab ([protectiontab](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/protectiontab.aspx))). ? Embedded objects (OLE). ? Draw Table and Quick Tables. Icons and Screenshot are UI and shell work. 3D Models is a stub. |
| **Draw** | ✔ Select, pen, highlighter, eraser (whole stroke), since 7.4 ([DrawTab](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/DrawTab.aspx); [7.4 changelog](https://github.com/ONLYOFFICE/DocumentServer/blob/v7.4.0/CHANGELOG.md)) | ✖ Ink to Shape, ✖ Ink to Math, ✖ Ink Replay, ✖ Lasso and point eraser, ? Drawing Canvas. ? Round-tripping ink with Word as OOXML ink (a fidelity test item). |
| **Design** | ✔ Color scheme (currently under Layout) ([ChangeColorScheme](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/ChangeColorScheme.aspx)). ✔ Watermark ([AddWatermark](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/AddWatermark.aspx)). ✔ Page Color ([layouttab](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/layouttab.aspx)). | ✖ Style Sets gallery, ✖ Paragraph Spacing presets, ? full document Themes (fonts and effects, not just colors), ? Set as Default. ✖ **Page Borders** (whole-page borders; only paragraph borders are documented), *unverified*. |
| **Layout** | ✔ Margins, orientation, size, columns, page/section/column breaks, line numbers, hyphenation, wrap, align and arrange ([layouttab](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/layouttab.aspx); [InsertLineNumbers](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/InsertLineNumbers.aspx); [Hyphenation](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/Hyphenation.aspx); [AlignArrangeObjects](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/AlignArrangeObjects.aspx)) | ? Selection Pane. Otherwise mostly UI only. |
| **References** | ✔ TOC, footnotes and endnotes (including conversion between them), captions, cross-references, table of figures, bookmarks ([ReferencesTab](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/ReferencesTab.aspx); [InsertCrossReference](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/InsertCrossReference.aspx); [AddTableofFigures](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/AddTableofFigures.aspx)). Citations and bibliography only through **Zotero and Mendeley plugins** ([plugins help](https://helpcenter.onlyoffice.com/docs/userguides/plugins/InsertReferences.aspx)). | ✖ **Native Citations & Bibliography**: a Word-compatible source manager stored in the document, the Word bibliography styles, and offline use without an account. ✖ **Index** (Mark Entry, XE fields, INDEX field layout), *unverified*. ✖ **Table of Authorities** (TA/TOA fields), *unverified*. |
| **Mailings** | ✔ Mail merge exists: an XLSX data source, merge fields, highlighting, preview, and output to PDF, DOCX, or email. However it is **online-only**, the data source must be stored on the portal, it has a 100-recipient limit, and email output needs the portal's Mail module ([UseMailMerge](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/UseMailMerge.aspx)). ONLYOFFICE staff confirm it isn't in Desktop Editors ([forum](https://community.onlyoffice.com/t/mail-merge-in-desktop-editors/16837)). | ✖ **Local mail-merge host** (data sources from local CSV/XLSX, output written to local files, mail hand-off, no 100-record cap). ✖ **Next Record and other Rules** (IF, ASK, FILLIN, SKIPIF), so there are no multi-label sheets today ([forum](https://community.onlyoffice.com/t/making-labels-using-mail-merge-no-ability-to-advance-to-next-record-on-the-same-document/16522)). ✖ **Envelopes** and ✖ **Labels** (vendor label catalog, sheet layout), *unverified*. ? Address Block and Greeting Line, Match Fields, Check for Errors. |
| **Review** | ✔ Spell check ([spellchecking](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/spellchecking.aspx)). ✔ Comments ([Commenting](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/Commenting.aspx)). ✔ Track changes with display modes (Markup, Final, Original) ([Review](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/Review.aspx)). ✔ Compare and Combine ([comparison](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/comparison.aspx)). ✔ Restrict editing ([protectiontab](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/protectiontab.aspx)). ✔ Word count ([ViewDocInfo](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/ViewDocInfo.aspx)). | ✖ Accessibility checker, *unverified*. ? Thesaurus, Read Aloud, Translate (plugins may exist; need offline and OS-based versions). ? Reviewing Pane (UI only if the change list API exists). ? Set Language for proofing. |
| **View** | ✔ Headings / navigation pane, zoom, fit to page and width, 100%, multiple pages, rulers, dark document, macros ([ViewTab](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/ViewTab.aspx); [navigation](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/navigation.aspx)) | ✖ **Read Mode**, ✖ **Web Layout**, ✖ **Outline view**, ✖ **Draft view** (each is a layout or presentation mode in sdkjs), *unverified*. ✖ Focus and Immersive Reader, ✖ Side to Side page movement. ? Gridlines. Window commands (New Window, Arrange All, Split, View Side by Side, Synchronous Scrolling) are mostly shell work, and they are hard on phones. |
| **Help** | n/a | Sentence's own content. UI only. |
| **Contextual tabs** | ✔ Table, image, shape, chart, and header/footer settings exist (in right-side panels) ([ChartDesign](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/ChartDesign.aspx); [InsertTables](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/InsertTables.aspx)) | Mostly UI only: re-present the side panels as Word-style contextual tabs. |

**Biggest engine gaps (descending effort, proposed relative sizing):**

1. **Mailings (XL):** local merge host, Rules including Next Record, Envelopes, Labels.
2. **View modes (L–XL):** Read Mode, Web Layout, Outline, and Draft are alternative layout modes.
3. **References (L):** native citations and bibliography, Index, Table of Authorities.
4. **Draw extensions (M):** Ink to Shape, Ink to Math, replay.
5. **Design (M):** Style Sets, Paragraph Spacing presets, full themes, page borders.
6. **Insert building blocks (M):** Cover Page, Quick Parts.
7. **Accessibility checker (M).**

Wherever possible, these should be contributed upstream to sdkjs, which reduces long-term fork cost.

## 5. Legal and IP guardrails (not legal advice; get a counsel review before launch)

### 5.1 Microsoft

- **What we copy and what we don't.** Matching functions, tab and group order, and .docx behavior is the plan. The OOXML format is standardized as ECMA-376, and Microsoft publishes its [MS-DOCX] extensions.
- **The Ribbon license.** In 2006 Microsoft offered a royalty-free Office UI license for the Ribbon. It came with a design-guideline requirement and **excluded products that "directly compete" with Word** ([Microsoft/Jensen Harris, 2006](https://learn.microsoft.com/en-us/archive/blogs/jensenh/licensing-the-2007-microsoft-office-user-interface); [Ars Technica](https://arstechnica.com/information-technology/2006/11/6052/)). That program has since been **retired**, and there is "no longer a separate Office Ribbon UI licensing program" ([Office Watch](https://office-watch.com/2018/can-microsoft-office-ribbon-used-developers/); [Law StackExchange](https://law.stackexchange.com/questions/18329/what-is-the-status-of-microsoft-ribbon-licensing-as-of-2017)).
  - The retirement does not explicitly grant rights to a Word competitor.
  - Ask counsel specifically about design patents and trade dress.
- **Trademarks.** Do not use "Microsoft", "Word", "Office", or "Fluent" in the product name, logo, or store listings, apart from accurate descriptions such as "opens Microsoft Word .docx files". Do not use Microsoft logos or icons ([Microsoft Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks)).
- **Assets.** All icons, templates, cover pages, and help text must be original. Do not ship Microsoft fonts; use metric-compatible open fonts instead (Carlito, Caladea, Liberation).
- **Trade dress.** Keep the layout the same as Word but make the look clearly different: accent color, logo, and icon style.
- **Name.** Run a trademark clearance search for **"Lucid Sentence"**, and for "Lucid" and "Sentence" separately in software classes (Nice classes 9/42), with the USPTO and EUIPO and in the app stores. Existing marks containing "Lucid" in software must be checked for likelihood of confusion. *I have not run this search.*

### 5.2 ONLYOFFICE license terms and the §7(b) logo-retention dispute

**The history:**

- **Older releases (up to 9.3).** ONLYOFFICE's LICENSE invoked AGPLv3 §7(b) to require that redistributors "**retain the original Product logo**", while §7(e) withheld any trademark rights ([DocumentServer LICENSE, older](https://github.com/ONLYOFFICE/DocumentServer/blob/e2976d7/LICENSE.txt)). In practice that meant you had to show a logo you had no permission to use.
- **The dispute.**
  - The Software Freedom Conservancy argues a logo is not a "reasonable legal notice or author attribution" under §7(b). On that view the clause is a "further restriction" that recipients may remove under §7 ¶4 ([SFC, Apr 2026](https://sfconservancy.org/blog/2026/apr/16/badgeware-onlyoffice-nextcloud-affero-gpl/)).
  - Nextcloud's Euro-Office fork removed the logo clause for that reason ([Nextcloud](https://nextcloud.com/blog/euro-office-license-compliance-and-what-open-source-means/)).
  - ONLYOFFICE says removing its terms is a license violation ([ONLYOFFICE, Mar 2026](https://www.onlyoffice.com/blog/2026/03/onlyoffice-flags-license-violations-in-euro-office-project-by-nextcloud-and-ionos); [open letter](https://www.onlyoffice.com/blog/2026/04/open-letter-to-the-euro-office-team)).
- **Current terms (9.4, May 2026).** ONLYOFFICE rewrote its additional terms ([9.4 release](https://www.onlyoffice.com/blog/2026/05/onlyoffice-docs-9-4)). The current `LICENSE` in sdkjs, web-apps, DocumentServer, core, desktop-sdk, desktop-apps, and DesktopEditors no longer contains the logo clause; I checked the `master` branches on Oct 8, 2026 ([sdkjs LICENSE](https://github.com/ONLYOFFICE/sdkjs/blob/master/LICENSE)). The terms now require:
  1. Retaining all copyright, license, warranty, and attribution or origin notices.
  2. Marking modified versions prominently, with modification dates, and stating that they are "based on the original ONLYOFFICE software developed by Ascensio System SIA".
  3. A visible UI feature showing Appropriate Legal Notices that identifies ONLYOFFICE as the original developer, says the version may be modified, and links to the license.
  4. No trademark license (§7(e)), with use governed by ONLYOFFICE's Trademark Policy.
  5. Illustrations, icon sets, and documentation licensed under CC BY-SA 4.0.

**How Lucid Sentence handles it (recommended):**

1. **Base the fork on ONLYOFFICE 9.4 or later**, so the logo clause never enters our tree. Do not pull code from Euro-Office or from pre-9.4 trees without a counsel review.
2. **Comply fully with the 9.4 terms, at low cost:**
   - **About / Legal Notices screen:** "Lucid Sentence is based on ONLYOFFICE software developed by Ascensio System SIA, modified by Lucid Systems and the Lucid Sentence contributors," with modification dates or a changelog link and the AGPL-3.0 text.
   - **Source and docs:** keep all file headers, and add a `NOTICE` file and a modification log.
   - **Branding:** no ONLYOFFICE logo or name in Sentence's own branding. Mention it only nominatively, with the notice "ONLYOFFICE is a trademark of Ascensio System SIA", as its policy asks ([trademark guide](https://www.onlyoffice.com/blog/2026/05/onlyoffice-license-and-trademark-policy)).
3. **Replace ONLYOFFICE's icons and illustrations** with original art, so the CC BY-SA obligations shrink to our own choice.
4. **Have counsel review** whether any of the 9.4 terms would be a "further restriction" in Sentence's specific distribution channels, especially the app stores. Get that answer before the first public build.

## 6. Lucid Sentence open-source project setup

### 6.1 License consequences (AGPL-3.0)

- **The whole product is AGPL-3.0-only**, because that is how upstream is licensed (`SPDX: AGPL-3.0-only` in sdkjs headers). Sentence cannot relicense ONLYOFFICE code; any new code we write must be AGPL-compatible.
- **Every binary we ship must come with its Corresponding Source**, including the shells, build scripts, and the mobile shim.
- **The network clause** (AGPL §13) only matters if Sentence later runs a sync or collaboration server. That server would also have to offer its source to users.
- **App stores.** Apple's historic terms conflicted with GPL-family licenses: in 2010 the FSF pushed for the removal of a GPL app (GNU Go) from the App Store, and VLC was later pulled after a similar complaint ([FSF](https://www.fsf.org/news/2010-05-app-store-compliance); [FSF follow-up](https://www.fsf.org/blogs/licensing/more-about-the-app-store-gpl-enforcement)). ONLYOFFICE holds the copyright to most of the code and does not ship an AGPL iOS app itself, so Sentence can't get an exception from upstream. **Counsel review is required** before iOS distribution. Also plan for distribution channels outside the stores: F-Droid and a direct APK for Android, signed installers for desktop.
- **Contributors keep their copyright.** Sentence uses a DCO sign-off with no CLA, so no single party can later relicense the project.

### 6.2 Repository structure (proposed: GitHub `lucid-sentence`, AGPL-3.0)

```
lucid-sentence/      # GitHub: lucid-sentence (AGPL-3.0)
├─ upstream/          # tracked ONLYOFFICE ≥9.4: sdkjs, web-apps, core (x2t), desktop-sdk, desktop-apps
├─ ui/                # Sentence UI layer on web-apps: Word ribbon map, backstage, status bar, themes
│  ├─ commands/       # single command registry (id, label, icon, shortcut, sdkjs API mapping)
│  ├─ desktop/        # desktop ribbon layout
│  └─ responsive/     # tablet ribbon + phone tab-picker/bottom-sheet, same registry (on web-apps desktop controllers)
├─ shells/
│  ├─ desktop/        # fork of DesktopEditors (Win/macOS), stripped to the word processor
│  └─ mobile/         # Capacitor app: local editor-server shim, x2t (WASM → native plugin)
├─ packages/
│  ├─ commands/       # the 352-command ribbon registry (exists)
│  ├─ mcp-tools/      # proposed: one tool layer for MCP and the on-device model (§9.10)
│  └─ ai-runtime/     # proposed: llama.cpp / LiteRT-LM / OS-model backends (§9.3)
├─ assets/            # original icons, OFL fonts, templates
├─ fidelity/          # .docx corpus + Word-vs-Sentence PDF diff harness
├─ legal/             # NOTICE, modification log, third-party licenses, TRADEMARKS.md
└─ docs/  LICENSE (AGPL-3.0)  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md
```

### 6.3 Contribution model

- **DCO, upstream-first.** Engine bugs are reported and patched in ONLYOFFICE's sdkjs and core where they will be accepted. Downstream patches are kept small and documented.
- **Governance:** a maintainer group led by R H, an RFC process for changes to the UI spec, and possibly a fiscal host later.
- **Trademark policy:** the "Lucid Sentence" name and logo are reserved for official builds; forks must rename.
- **CI:** builds for every platform, plus a **fidelity gate** that fails when PDF diffs of the corpus exceed a set threshold. It also checks automatically that the legal notices are present.

## 7. Roadmap: milestones to a single v1 (scope only, no dates)

**Principles:**

- **One v1 release.** It contains the full Word ribbon (all eleven tabs plus the contextual tabs) on Windows, macOS, Android, and iOS/iPadOS at the same time.
- Pre-v1 milestones are **internal alphas and betas grouped by tab**. Each milestone ships to every platform with command parity, so mobile is never catching up.
- **Engine-gap work (§4.8) starts in M0 as its own parallel track**, because it has the longest lead time.

### 7.1 Pre-v1 milestones

| Milestone | Scope (all platforms unless noted) | Exit criteria |
|---|---|---|
| **M0: Foundations and go/no-go** (Phase 0) | .docx fidelity bake-off. **Mobile gate (§3.4).** DesktopEditors fork stripped to the word processor. Full command list with the §4.8 coverage confirmed against sdkjs (turning unverified items into verified or gap). Rough sizing of engine gaps for both engines. Name clearance and counsel review. | Engine decision made: ONLYOFFICE, or a switch to Collabora (§3.4), with the gap cost factored in. |
| **M1: Platform alpha** (internal) | Command registry and three-layout ribbon renderer with CI parity checks. Touch input layer. Dialogs adapted to sheets. Local editor-server shim and x2t on all platforms. Backstage (File) and Help. Theming, branding, legal notices. **MCP tool layer** (`mcp-tools`) generated from the registry, which doubles as the test harness (§9.10). | The same UI-layer build opens, edits, and saves .docx on all four platforms. |
| **Alpha A: Authoring** (internal) | **Home, Insert, Layout, Design, View** with the "UI only" and verified items, plus contextual tabs (Table, Picture, Shape, Header & Footer, Equation, Chart). Design gaps (Style Sets, page borders, themes). Insert gaps (Cover Page, Quick Parts). | Every verified command in these tabs works on all platforms, and the fidelity gate passes. |
| **Alpha B: Review and Draw** (internal) | **Review** (track changes, comments, compare/combine, restrict editing, OS-based Read Aloud, accessibility checker) and **Draw** (pen tools with stylus on tablets, finger draw mode on phones; Ink to Shape and Ink to Math). | Tracked changes, comments, and ink round-trip with Word. |
| **Alpha C: References and Mailings** (internal) | **References** (native citations and bibliography, Index, Table of Authorities on top of the existing TOC, notes, and captions) and **Mailings** (local merge host, Rules, Envelopes, Labels, mobile share-sheet output). | Reference-heavy and merge documents from Word behave the same on all platforms. |
| **Beta 1: Feature-complete** (closed beta) | Remaining View modes (Read Mode, Web Layout, Outline, Draft, Focus) and window commands (with the phone adaptations in §4.6). Every non-stub command in §4.2 is present. **Desktop MCP server** (opt-in, off by default; §9.7–9.9). | The parity CI check reports 100% of the command list on desktop, tablet, and phone. |
| **Beta 2: Release candidate** (public beta) | Performance hardening (re-run the §3.4 targets on the full feature set), accessibility, localization, crash-free sessions, store submissions or alternative channels, documentation. | Release criteria below are met. |
| **v1.0** | Single release on four platforms | Fidelity gate, §3.4 performance targets, zero known data-loss bugs, legal sign-off |

#### M1 status: document engine spike (branch `feat/m1-engine`)

- **Engine:** ONLYOFFICE sdkjs `release/v9.4.0` (pinned commit), built with its own `build.py` plus our bridge addon (`engine/sdkjs-addon`). x2t WASM comes from CryptPad's 9.3.2 build. Fonts come from ONLYOFFICE core-fonts. `pnpm engine:build` writes `engine/dist`, and the app serves it offline from `/engine/` (the service worker caches it on first use).
- **Works (web/PWA, verified by e2e):**
  - Open a .docx (File System Access API or `<input>`).
  - Edit it with the ribbon slice:
    - clipboard
    - font family and size, grow/shrink, clear formatting
    - bold, italic, underline, strike, subscript, superscript
    - bullets, numbering, indents, alignment, formatting marks
    - the Styles gallery
    - select all, page break
    - zoom
  - Undo/redo from the Quick Access Toolbar and the keyboard.
  - New blank document.
  - Save (back to the same file handle), Save As (picker), and download fallback.
  - Ink and Notes mode are unchanged on notes pages.
- **Desktop/Android (Tauri):** File > Open/Save As use the native dialogs (`tauri-plugin-dialog`), and the Android document picker comes through the same plugin. Files go through `tauri-plugin-fs`. Files the OS opens with the app load in the engine. Code builds and passes clippy and the tests; not yet run on a device.
- **Fidelity eval:** `pnpm fidelity` round-trips a 10-file corpus through x2t alone and through x2t plus sdkjs in Chromium. 240 of 240 checks pass, with a baseline in CI.
- **Open items:**
  - Wire the remaining registry commands (tables, images, headers/footers, review).
  - Print and PDF export.
  - Spell-check dictionaries.
  - x2t 9.4 build (we use 9.3.2).
  - Test on Android and desktop devices.
  - Real-world (Word-authored) corpus.

### 7.2 Post-v1 phases

| Phase | Scope |
|---|---|
| **1.x Polish** | Ribbon and QAT customization, performance work, UX refinements from beta feedback, plug-in API |
| **Linux** (if not in v1) | Mostly free with DesktopEditors; packaging and QA |
| **.doc import** (if kept) | One-way .doc to .docx import through x2t |
| **Collaboration** | Optional co-editing server. It is covered by AGPL §13, so it must offer its source to users. |
| **AI Pack (1.x)** | Optional on-device model download and use cases 1–4 (§9.1). Then alt text, translation, and dictation models. Gated by §9.5. The Tier 0 keyword palette is already in v1. |
| **MCP extensions** | OAuth-conformant local authorization; mobile MCP (app-to-app or LAN pairing), to evaluate (§9.7) |

### 7.3 Scope, team, and effort considerations (relative, no dates)

- **Scope grew sharply.** Folding the former Phases 3–5 into v1 means the first public release must include all the §4.8 gap work. This is the largest change in this revision. In particular, Mailings, the extra View modes, and References are engine work (sdkjs model, layout, fields), not just UI.
- **Proposed relative sizing of v1 work (S/M/L/XL, illustrative):**
  - XL: three-layout ribbon and touch/dialog adaptation; Mailings.
  - L–XL: View modes.
  - L: References gaps; mobile shell and x2t; desktop fork.
  - M: Design and Insert gaps; Draw extensions; accessibility checker.
  - Continuous: QA and fidelity.
- **Workstreams that can run in parallel:**
  1. Engine (sdkjs JavaScript, plus x2t C++ where needed)
  2. UI layer (TypeScript: ribbon, dialogs, sheets)
  3. Desktop shell (C++/CEF)
  4. Mobile shells (Swift, Kotlin, Capacitor)
  5. Fidelity and QA (corpus, device farm, automation)
  6. Design and UX (icons, touch layouts, usability tests)
  7. Release and legal
- **Team considerations:**
  - A volunteer-only team is unlikely to staff seven workstreams to a "full Word ribbon on four platforms" bar.
  - **Plan for funded core maintainers** on the engine and UI-layer tracks at minimum, through grants, sponsors, or a fiscal host.
  - Recruit contributors with sdkjs experience. ONLYOFFICE's contributor base and the Euro-Office community are natural places to look, so long as the code they contribute is cleanly licensed.
- **Upstream strategy.** Offer the engine gaps (index, Table of Authorities, labels, view modes) to ONLYOFFICE upstream early. If accepted, the fork's maintenance cost drops a lot. If not, budget for carrying the patches.
- **Scope control without breaking the v1 decision:** commands that remain stubs (§4.2: Copilot, Researcher, 3D Models, Dictate, Translate, Block Authors) stay stubs. No other command may be cut from v1 without R H's approval.

## 8. Risks and open questions

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Much larger v1** (full ribbon on four platforms, including engine-gap work) | Long time to first release; contributor fatigue | Internal alphas by tab, parallel workstreams, funded core maintainers, strict stub list, upstream contributions |
| **Engine gaps in ONLYOFFICE** (Mailings: local host, Rules, labels, envelopes; View modes; Index and Table of Authorities; native citations) | Ribbon slots without features; v1 blocked | Verify in M0, start the gap track in M0, include gap cost in the engine decision (Collabora covers several natively) |
| **Mobile gate fails** (performance of the desktop-style UI, sdkjs, and x2t in a WebView) | ONLYOFFICE cannot meet v1 | §3.4 gate, one fix iteration, switch the whole product to Collabora |
| **Mailings on mobile** (local data sources, large merges in memory, email hand-off, label sheets on small screens) | Poor or failing merges on phones | Stream merges record by record; add a merge-size target to the §3.4 tests (proposed: 500 records to PDF without an out-of-memory kill); share sheet and OS mail hand-off |
| **Draw on mobile** (finger vs. scroll conflicts, stylus pressure in WebViews, ink round-trip with Word) | Ink feels poor or gets lost | Explicit draw mode on phones; test pressure and tilt support; ink round-trip tests in the fidelity corpus |
| **View modes and window commands on phones** (Split, Side by Side, Outline) | Awkward or impossible to provide on small screens | Phone-specific presentations defined in §4.6 (stacked or switchable views); parity means the command exists and works, even if the layout differs |
| Full-parity touch UI is a large UX effort | Delays | One command registry, three generated layouts, CI parity check, early usability tests |
| QA matrix (4 OS × phone and tablet × 11 tabs) and app-store review | Slow betas | Automated UI tests per layout, device farm, TestFlight and Play testing tracks from Alpha A |
| Large DesktopEditors fork and sdkjs patches to rebase | Maintenance burden | Upstream-first, thin patches, `ui/` isolation |
| Licensing friction with ONLYOFFICE, and AGPL vs. App Store terms | Legal cost; no iOS store distribution | Comply fully with 9.4 terms, counsel review in M0, alternative channels |
| AI and MCP risks (model performance on the S24, prompt injection, local endpoint security, model licensing) | See §9.12 | See §9.12 |
| .docx layout drift from Word, and Microsoft IP or trade-dress claims | The core promise fails; takedown | Fidelity CI gate, open fonts, §5.1 guardrails |

### Open questions for R H

1. **Distribution channels.** Is shipping on the Apple App Store a must-have? If the AGPL makes the App Store impractical, would sideload or TestFlight distribution for iOS be acceptable, alongside F-Droid or direct APK for Android? Mobile is part of v1, so this decision gates the v1 launch.
2. **Legal budget and posture.** Will you fund a counsel review of the AGPL and ONLYOFFICE terms, the Ribbon/trade-dress question, and a **trademark search for "Lucid Sentence"** (including existing "Lucid" software marks)? Do you agree to strict compliance with ONLYOFFICE's 9.4 terms rather than the Euro-Office approach?
3. **Minimum OS versions and reference devices.** Windows 10? Intel Macs? What are the oldest iOS and Android versions, and do you confirm the §3.4 proposed devices and targets?
4. Is Linux wanted in v1 or after v1? It costs little with DesktopEditors.
5. Which Word should be the compatibility reference: Microsoft 365 current, or a fixed version?
6. Is a future one-way .doc import worth keeping on the roadmap, or should it be dropped entirely?
7. AI and MCP questions: see §9.13.

## 9. AI features: on-device AI and MCP (optional)

**Status legend for this section:**

- **✔ verified:** checked against the linked source on Oct 8, 2026.
- **? unverified:** an estimate, an assumption, or a design proposal.
- **Proposed** targets are proposals for R H, not measured figures.

**Principles:**

- AI is **optional and off by default**.
- **Nothing leaves the device** unless the user explicitly connects an external agent.
- **Every AI edit goes in as a tracked change** by default.
- The **on-device model and external agents share one tool layer**, built on the command registry (§9.9).

### Part A: On-device AI

#### 9.1 Use cases (prioritized)

| # | Use case | Model needed | Notes |
|---|---|---|---|
| 1 | **Rewrite selection**: shorter, clearer, more formal, friendlier | Small text LLM | Shown as a diff and inserted as a tracked change. Selection-sized, so it fits small models. |
| 2 | **Grammar and style with explanations** | Small text LLM, on top of the existing spell checker | Each suggestion comes with a one-line explanation. The deterministic checker (Hunspell or LanguageTool) still runs without a model. |
| 3 | **Summarize** a selection or short document; **summarize tracked changes** | Small text LLM | "Short" is a proposal: up to about 4k tokens, roughly 3,000 words. Change summaries read the revision list, not the whole document. |
| 4 | **Natural-language command palette**: maps phrases to the **352-command registry** in `packages/commands` | Small text LLM (constrained output), with `searchCommands` keyword search as the fallback | Output is constrained to a valid command id plus arguments, then confirmed by the user. This works on Tier 0 too, through keyword search only. |
| 5 | **Accessibility help**: alt-text drafts, fixing heading order | Small vision-language model for alt text; text LLM or rules for headings | Feasible: SmolVLM-256M/500M (Apache-2.0, under about 1–1.3 GB RAM) ✔ ([256M](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct), [500M](https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct)). Gemma 4 and Qwen3.5 small models also accept images ✔. Drafts must always be reviewed by a human. |
| 6 | **Smart templates and outlines** | Small text LLM | Produces structure (headings, sections), not long prose |
| 7 | **Offline translation** | Dedicated small translation models | Mozilla's Firefox Translations models (MPL-2.0) ✔ ([mozilla/translations](https://github.com/mozilla/translations)). OPUS-MT is CC-BY-4.0 ✔ ([Opus-MT](https://github.com/helsinki-nlp/opus-mt)). Downloaded per language pair. |
| 8 | **On-device dictation** | Small speech model | whisper.cpp (MIT, with Android and iOS examples) running Whisper weights (MIT) ✔ ([whisper.cpp](https://github.com/ggerganov/whisper.cpp/)). Moonshine's English models are MIT, but its non-English models are under a community license ✔ ([Moonshine](https://github.com/moonshine-ai/moonshine-v2/)). Prefer Whisper for all languages. |

**Non-goals:**

- Long-form generation ("write me a 10-page report").
- Chat over very large documents. RAG or chat across 300-page files is out of scope on device.
- Cloud fallback. Lucid Sentence ships no cloud AI; users who want cloud models connect them as external MCP agents (Part B).
- Training on user documents.

#### 9.2 Candidate models (about 0.5–4B, open weights)

The models are **separate optional downloads**, not bundled and not linked into AGPL code. Their licenses therefore don't need to be AGPL-compatible in the copyleft sense, but they shouldn't add use restrictions we can't pass on cleanly. **Proposed policy:** default models are **Apache-2.0 or MIT only**. Apache-2.0 is GPLv3-compatible per the FSF ([FSF license list](https://www.gnu.org/licenses/license-list.html#apache2)).

| Family / size | License (✔ verified) | Fit | Notes |
|---|---|---|---|
| **Gemma 4 E2B / E4B** (2.3B / 4.5B effective; 5.1B / 8B with embeddings) | **Apache-2.0** (Gemma 4 only) ✔ ([Google](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/); [model card](https://ai.google.dev/gemma/docs/core/model_card_4)) | **Strong candidate.** Text, image, and audio input, built for on-device use. | Google cites under 1.5 GB of memory for E2B "on some devices" with LiteRT-LM ✔ ([Google Dev blog](https://developers.googleblog.com/bring-state-of-the-art-agentic-skills-to-the-edge-with-gemma-4/)). Its footprint in GGUF runtimes is ? unverified. |
| **Qwen3.5 0.8B / 2B / 4B** | **Apache-2.0** ✔ ([Qwen3.5-4B card](https://huggingface.co/Qwen/Qwen3.5-4B/raw/main/README.md); [Artificial Analysis](https://artificialanalysis.ai/articles/qwen3-5-small-models)) | **Strong candidate.** Native vision. Released 2026-03-02 ✔ ([repo](https://github.com/QwenLM/Qwen3.5/)). | About 3 GB for 4B at 4-bit and under 2 GB for 2B, according to a third-party estimate ✔ ([Artificial Analysis](https://artificialanalysis.ai/articles/qwen3-5-small-models)). Use non-thinking mode for latency. |
| Qwen3 0.6B / 1.7B / 4B | Apache-2.0 ✔ ([Qwen3](https://github.com/qwenLM/qwen3)) | Fallback | Superseded by Qwen3.5 |
| **Phi-4-mini-instruct** (3.8B) | **MIT** ✔ ([card](https://huggingface.co/microsoft/Phi-4-mini-instruct)) | Tier 2, text only | 128K context |
| **SmolLM3-3B** | Apache-2.0 ✔ (third-party summary ([dev.co](https://dev.co/ai/llms/smollm3-3b)); confirm on the Hugging Face card) | Tier 2 alternative | Fully open training recipe |
| Gemma 1–3n, TranslateGemma | **Gemma Terms of Use** (custom): the Prohibited Use Policy must be passed downstream as an enforceable term, and a Notice file is required ✔ ([terms](https://ai.google.dev/gemma/terms)) | **Not a default** | Allowed only as an opt-in "custom model" |
| Llama 3.2 1B / 3B | **Llama 3.2 Community License**: "Built with Llama" attribution, an acceptable use policy, and a 700M-MAU clause ✔ ([license](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/LICENSE)) | **Not a default** | Custom license with use restrictions |

**Recommendation:**

- **Tier 1 default (S24-class phones, 8 GB):** **Qwen3.5-2B** through llama.cpp (predictable GGUF footprint, vision included). Benchmark **Gemma 4 E2B** through LiteRT-LM against it in the AI gate (§9.5), and pick the winner per platform.
- **Tier 2 (12 GB+ phones, 16 GB+ desktops):** **Gemma 4 E4B** or **Qwen3.5-4B**.
- **Specialized models:** Firefox Translations models for translation, Whisper (base or small, through whisper.cpp) for dictation, SmolVLM-500M for alt text only where the main model has no vision.

#### 9.3 Runtimes and platform coverage

| Runtime | License | Windows | macOS | Android | iOS | Notes |
|---|---|---|---|---|---|---|
| **llama.cpp / GGUF** (recommended primary) | MIT ✔ | ✔ | ✔ (Metal, "first-class") | ✔ ([Android build doc](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md)) | ✔ (XCFramework) | ✔ [README](https://github.com/ggml-org/llama.cpp). Vulkan, Metal, and CPU backends. Widest model coverage. Qwen3.5 support is noted in Qwen's README; Gemma 4 support is ? unverified. |
| **LiteRT-LM** (recommended secondary on Android) | Apache-2.0 ✔ | ✔ | ✔ | ✔ (GPU, **NPU**) | ✔ (Swift API **Early Preview**) | ✔ [overview](https://developers.google.com/edge/litert-lm/overview), [repo](https://github.com/google-ai-edge/LiteRT-LM). The path to Gemma 4's low-memory claims. |
| MediaPipe LLM Inference | Apache-2.0 | n/a | n/a | maintenance-only | maintenance-only | ✔ Superseded by LiteRT-LM ([guide](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/android)). **Avoid.** |
| MLC LLM | Apache-2.0 ✔ | ✔ (Vulkan) | ✔ (Metal) | ✔ (OpenCL) | ✔ (Metal) | ✔ [repo](https://github.com/mlc-ai/mlc-llm). Needs ahead-of-time compilation per model. Good fallback. |
| ONNX Runtime GenAI | MIT | ✔ | ✔ | ✔ | **in development** | ✔ [repo](https://github.com/microsoft/onnxruntime-genai). Not usable on iOS yet. |
| ExecuTorch 1.0 | BSD | experimental (x86 Windows) | ? | ✔ | ✔ | ✔ [1.0 release](https://pytorch.org/blog/introducing-executorch-1-0/) |
| Apple Foundation Models | OS API | n/a | ✔ M1+ (macOS 26) | n/a | ✔ iPhone 15 Pro / 16+ | ✔ About a 3B on-device model at 2-bit, for summarization, extraction, and short text ([Apple newsroom](https://www.apple.com/newsroom/2025/09/apples-foundation-models-framework-unlocks-new-intelligent-app-experiences/); [Apple ML](https://machinelearning.apple.com/research/apple-foundation-models-2025-updates)). **Optional backend** when present: no download needed. |
| Android AICore / Gemini Nano (ML Kit GenAI) | OS API | n/a | n/a | selected devices | n/a | ✔ The current list includes the Galaxy **S25/S26** and Pixel 9–11, **not the S24** ([ML Kit GenAI](https://developers.google.com/ml-kit/genai)). Optional backend on R H's S26, but it **can't be the baseline**. |

**Recommendation:**

- Use **one abstraction** (`packages/ai-runtime`, ? proposed) with these backends:
  1. **llama.cpp**, the default on all four platforms.
  2. **LiteRT-LM** on Android, where it wins the gate.
  3. **OS models** (Apple Foundation Models, AICore) as zero-download optional backends.
- On mobile, the runtime runs natively (a Capacitor plugin). On desktop, it runs in the shell process. It never runs inside the WebView.

#### 9.4 Minimum device, RAM sizing, and capability tiers

**Minimum bar: Samsung Galaxy S24** ✔

- 8 GB LPDDR5X RAM on the base model; 12 GB on S24+/Ultra and some S24 configurations ([Wikipedia](https://en.wikipedia.org/wiki/Samsung_Galaxy_S24); [GSMArena](https://www.gsmarena.com/compare.php3?idPhone1=12773)).
- The chip differs by region ([Android Authority](https://www.androidauthority.com/samsung-galaxy-s24-snapdragon-vs-exynos-countries-3402659/)):
  - **Snapdragon 8 Gen 3 for Galaxy** in the US, Canada, China, Hong Kong, and Taiwan.
  - **Exynos 2400** in most other markets.
- **Both variants must be tested.** Their GPUs (Adreno 750 vs. Xclipse 940) differ for GPU and NPU backends.

**Sizing rule of thumb (? estimates):**

- 4-bit weights take about 0.55–0.65 GB per billion parameters.
- KV cache and runtime overhead add about 0.3–1 GB, depending on context length (4k proposed).
- So: 0.8B ≈ 0.6–1 GB, 2B ≈ 1.5–2.2 GB, 4B ≈ 3–3.5 GB of extra RAM while running.
- This must fit **alongside** the editor's own budget (§3.4: ≤ 800 MB for an M-size document).

| Tier (proposed) | Device RAM | Text model | Other models | Typical devices (?) |
|---|---|---|---|---|
| **Tier 0: no model** | any, or user opt-out | none: keyword command palette (`searchCommands`), deterministic spell and grammar checks, OS features where present | none | Older and low-RAM phones |
| **Tier 1: baseline** | **≥ 8 GB** | 2B class, 4-bit (Qwen3.5-2B or Gemma 4 E2B) | Translation per language pair; Whisper base; vision through the main model or SmolVLM | **Galaxy S24 (8 GB)**, recent mid- and high-end phones |
| **Tier 2: enhanced** | **≥ 12 GB** (phones), **≥ 16 GB** (desktop) | 4B class, 4-bit (Gemma 4 E4B, Qwen3.5-4B, Phi-4-mini) | Whisper small | S24+/Ultra, S26, most 2024+ laptops |
| 6 GB "lite" (optional) | 6 GB | 0.8B class (Qwen3.5-0.8B), palette and short rewrites only | none | Budget phones |

**What "most phones" can run (? unverified):** typical mid-range Android phones currently ship with 6–8 GB of RAM. Tier 1 therefore covers many current mid-range and all flagship devices, and the 0.8B "lite" tier extends to 6 GB phones. Market data must be confirmed before the tiers are final.

**Behavior:**

- **Optional download** (not bundled): about 1–3 GB per model, Wi-Fi only by default, resumable, checksum-verified, stored in app storage.
- The device tier is detected automatically from total RAM, free storage, and a 10-second micro-benchmark. The user can override it.
- **Graceful fallback:** with no model, every AI entry point either degrades (keyword palette, deterministic checks) or shows "Download the on-device model to use this." **Nothing silently calls the network.**
- **Privacy:** inference is local; prompts and documents never leave the device; there is no telemetry. A model-integrity manifest (hashes) is published in the repo.

#### 9.5 AI go/no-go gate (proposed targets)

The gate runs on the **S24 (8 GB, both Snapdragon and Exynos)**, the S26, an iPhone 15 Pro, and a 16 GB laptop, with an M-size document open.

| Metric | Tier 1 target on S24 (proposed) | Tier 2 / desktop (proposed) |
|---|---|---|
| Time to first token (500-token prompt) | ≤ 1.5 s | ≤ 1.0 s |
| Decode speed | ≥ 10 tok/s | ≥ 20 tok/s |
| Peak extra RAM (model + KV) | ≤ 2.2 GB; no out-of-memory kill of the app or the WebView | ≤ 3.5 GB |
| Model load (warm or cold) | ≤ 2 s / ≤ 6 s | ≤ 1 s / ≤ 4 s |
| Battery drain, 10 min of continuous mixed use | ≤ 4% | n/a (laptop: ≤ 3%) |
| Thermal, 10 min sustained | Throughput drop ≤ 30%; no OS thermal warning | No fan-noise complaint in tests |
| Quality: rewrite acceptance (blind review, 200 samples) | ≥ 60% "accept as is or with a minor edit" | ≥ 70% |
| Quality: command-palette top-1 accuracy (300-phrase set) | ≥ 85% (the keyword-only baseline is measured too) | ≥ 90% |
| Dictation word error rate (English test set) | ≤ 12% | ≤ 8% |

- **Pass:** ship the AI Pack on that tier.
- **Fail on Tier 1:** move to the 0.8B "lite" model, or limit Tier 1 to the palette and rewrites. Tier 0 always ships.

### Part B: MCP (Model Context Protocol)

#### 9.6 Spec facts (current revision 2026-07-28)

- **Transports** ✔ ([transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)):
  - **stdio**: newline-delimited JSON-RPC over a client-launched subprocess.
  - **Streamable HTTP**: each message is a POST to one endpoint; the reply is JSON or a request-scoped SSE stream.
  - Revision 2026-07-28 **removed protocol-level sessions and the GET stream** ([Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).
- **Streamable HTTP security** ✔: servers **MUST validate `Origin`** (to prevent DNS rebinding) and return **403** if it is present and invalid. Local servers **SHOULD bind to 127.0.0.1**. Servers **SHOULD authenticate** all connections ([Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).
- **Authorization** ✔ ([authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)):
  - It is **OPTIONAL**.
  - *If* a server supports it over HTTP, it acts as an **OAuth 2.1 resource server**. It **MUST** implement Protected Resource Metadata (RFC 9728), validate the token **audience** (RFC 8707), and return **401** for invalid tokens.
  - **Token passthrough is forbidden.**
  - **stdio implementations SHOULD NOT** use this spec and should take credentials **from the environment** instead.

#### 9.7 Architecture

| Surface | Design | Status |
|---|---|---|
| **Desktop: Streamable HTTP** | The app hosts the MCP server at `http://127.0.0.1:<random port>/mcp`, **only while the user has shared at least one document**. Binds to loopback only. Port and endpoint are written to a user-only file for clients to find. | ? proposal |
| **Desktop: stdio launcher** | A small `lucid-sentence-mcp` binary that agents launch as a subprocess. It relays to the running app over a user-only local socket or named pipe. The key comes from the environment (`LUCID_SENTENCE_KEY`), as the spec recommends for stdio. | ? proposal |
| **Mobile (v1 scope)** | **No external MCP listener in v1.** When the AI Pack ships, the on-device model uses the tool layer in-process (same device only). | ? proposal |
| Mobile (later, evaluate) | (a) **App-to-app**: Android bound service or intents; iOS has no general local-server path in the background (? to verify). (b) **LAN with pairing**: an opt-in, foreground-only listener paired by QR code, with TLS and certificate pinning. Off by default and time-boxed. | ? to verify; higher risk |

#### 9.8 Tools, resources, prompts (built on the command registry)

| Kind | Name (proposed) | Permission | Behavior |
|---|---|---|---|
| Tool | `document.info`, `document.outline` | read | Title, stats, heading tree, sections, and styles in use |
| Tool | `text.read(range)`, `text.find(query)` | read | Ranges are addressed by stable paragraph anchors plus offsets (? anchor scheme to verify in sdkjs) |
| Tool | `text.insert(range, text)`, `text.replace(range, text)` | suggest / edit | **Always a tracked change** with author `AI: <client name>`. Rejected if the range changed since it was read (optimistic concurrency). |
| Tool | `style.apply(range, styleId)` | suggest / edit | Tracked as a formatting change |
| Tool | `commands.list()`, `commands.run(id, args)` | read / edit | Exposes the **352-command registry**. Each command carries a permission class (read, format, structure, destructive). Destructive and file-level commands require in-app confirmation. |
| Tool | `comments.list/add/reply/resolve` | read / comment | Comments are authored as the AI client |
| Tool | `revisions.list`, `revisions.accept/reject` | read / **edit + user confirmation** | Agents can propose but never silently accept their own changes |
| Tool | `export(format)` | read | Produces a PDF or .docx **copy**. It never overwrites the open file. |
| Resource | `doc://current/text` (Markdown view), `doc://current/outline`, `doc://current/comments`, `doc://current/revisions` | read | Read-only snapshots |
| Prompt | `summarize-changes`, `tighten-selection`, `fix-heading-order` | read | Templates that use the tools above |

**Agent-safety rules:**

- Document content is **untrusted input to agents** (prompt-injection risk), and tool descriptions say so.
- Per-key permission classes are enforced server-side.
- Bulk operations are limited (proposed: at most 200 changed paragraphs per call).

#### 9.9 Per-document key ("Share with AI")

**Flow:**

1. The user chooses **Review → Share with AI** (also in File → Share).
2. They pick the permission: **Read** / **Comment** / **Suggest** (tracked changes only, the default) / **Edit**. Edit still records tracked changes; it only adds formatting and structure commands.
3. They set an optional **expiry** (1 h / 24 h / 7 days / none) and a label (e.g., "Claude Desktop").
4. The key is **shown once**, with Copy, a ready-made MCP client config snippet, and a QR code (for later mobile pairing).

| Property | Design |
|---|---|
| Key format | `lsk_<keyId>_<secret>`: a 256-bit random secret (base64url) from the OS CSPRNG. `keyId` is a public 8-character lookup handle. |
| Storage | Store **only a hash** of the secret, plus its scope: SHA-256/HMAC is enough because the secret is high-entropy. Store it in the OS keystore or protected app data: Windows DPAPI / Credential Manager, macOS and iOS Keychain, Android Keystore-wrapped storage. The plaintext is never stored. |
| Scope | One **document ID** and one permission level, with optional expiry. Also bound to **this installation**: a key copied to another machine doesn't work there. |
| Revocation | Per key, or **"Revoke all AI access"** for the document or the whole app |
| **What goes in the .docx** | **Recommended: never the secret.** Files get emailed, uploaded, and versioned, and a secret stored in the file would travel with every copy. Store only a random **document ID** (UUID) as a custom property, for example `LucidSentence.DocumentId` in `docProps/custom.xml`, so keys can find the document after it is moved or renamed. |
| Document-ID trade-offs | If the file is copied, both copies carry the same ID. When two documents with the same ID are open, the app asks which one an agent may access. The ID is minor metadata; File → Inspect Document can remove it, and a setting can turn it off. ? Word should preserve custom properties on round-trip; to verify with the fidelity corpus. |
| Alternative considered | Storing a key hash or "AI policy" as a **custom XML part** in the .docx. **Rejected**: anyone with the file could see that AI sharing was enabled, and an offline brute-force attack is pointless only while the secret stays high-entropy. It adds risk for no benefit. |

**How the key maps to MCP authorization:**

- **v1 (proposed): static bearer token, local only.**
  - Streamable HTTP clients send `Authorization: Bearer lsk_…`. stdio clients set `LUCID_SENTENCE_KEY` (the spec-endorsed stdio pattern).
  - Because authorization is optional in the spec, this is **allowed**. Over HTTP we would document it as "local static bearer, not MCP-Authorization-conformant": it has no Protected Resource Metadata.
  - Invalid, expired, or revoked keys get **401**.
- **Later (spec-conformant option): the app embeds a small OAuth 2.1 authorization server on loopback.**
  - It publishes RFC 9728 metadata, and the "Share with AI" dialog acts as the **consent screen** (authorization code with PKCE).
  - It issues **short-lived, audience-bound access tokens** (audience = this MCP endpoint, scope = document + permission).
  - The long-lived per-document key becomes the **grant**, not the access token. This adds compliance and token rotation at the cost of complexity. Do it only if major MCP clients require OAuth for local servers (? to verify against client behavior).

**Transport hardening:**

| Control | Design (proposed) |
|---|---|
| Binding | `127.0.0.1` / `::1` only. Never `0.0.0.0`. The listener is off when nothing is shared. |
| DNS rebinding | Reject any `Origin` header that is present and not on the allowlist (empty by default) with **403**. Require `Host` to be `127.0.0.1:<port>` or `localhost:<port>`. ✔ The spec requires Origin validation. |
| Rate limits | Per key: 20 requests/s burst, 600/min, 60 writes/min, plus payload limits (1 MB per request). Return 429 with Retry-After. |
| Audit log | Every call is logged locally: time, key label, tool, range, and outcome. Viewable in **Review → AI Activity** and exportable. Content is not logged by default. |
| Visibility | Status-bar badge **"AI connected: <label> (Suggest)"**, which pulses while an agent is acting. Tracked changes are attributed to the agent. |
| Kill switch | One click on the badge or **Review → Stop all AI** revokes active sessions immediately and stops the listener. There is also a global setting "Disable MCP server". |

#### 9.10 One tool layer for the local model and external agents

- `packages/mcp-tools` (? proposed) defines each tool once, generated from the command registry plus the document API. It is exposed through three adapters:
  1. the **MCP server** (HTTP and stdio) for external agents;
  2. an **in-process adapter** for the on-device model, which uses the same schemas with constrained JSON output and needs no network or socket;
  3. the **test harness**, so CI drives the editor through the same tools.
- The local model gets a built-in key-equivalent scope (default **Suggest**). Its edits show the same tracked-change attribution ("AI: on-device"), audit log entries, and kill switch.

### 9.11 Roadmap placement (recommendation)

| Item | Placement | Why |
|---|---|---|
| Tool layer (`mcp-tools`) built on the registry | **M1 (pre-v1)** | Cheap with the registry already in place. It doubles as the automation and test harness. |
| Desktop MCP server (stdio + localhost HTTP, static bearer, per-document keys, audit log, kill switch) | **v1, opt-in, off by default** (lands in Beta 1) | Large value for low effort on desktop; isolated behind a toggle. ? R H to confirm. |
| On-device **AI Pack** (Tier 0 palette ships in v1; model download and use cases 1–4) | **Post-v1, 1.x**. The AI gate (§9.5) runs as a spike parallel to M0/M1 | Keeps the full-ribbon v1 scope intact. Tier 0 (keyword palette) is in v1. |
| Alt text, translation, dictation models | 1.x, after the AI Pack | Each one is a separate model download and evaluation |
| OAuth-conformant MCP auth; mobile MCP (app-to-app or LAN pairing) | Post-v1, evaluate | Complexity and security risk; depends on how clients behave |

### 9.12 Risks (AI and MCP)

| Risk | Impact | Mitigation |
|---|---|---|
| Tier 1 models too slow, hot, or memory-hungry on the S24 (especially on Exynos vs. Snapdragon GPU paths) | Poor AI on the minimum device | §9.5 gate on both variants, CPU fallback, 0.8B lite model, LiteRT-LM NPU path |
| Model plus editor exceeds the memory limit, so Android or iOS kills the app | Data-loss risk | Load the model only on demand, unload it when idle, keep autosave on, enforce a memory budget |
| Model license drift (custom terms, use restrictions) | Legal and community risk | Apache/MIT-only default policy; license manifest checked in CI |
| Hallucinated rewrites, summaries, or alt text | User trust | Diff view, tracked changes, "AI draft" labels, human review required for alt text |
| **Prompt injection** through document content against external agents | An agent performs unintended edits | Suggest-only default, permission classes, confirmation for destructive actions, rate limits, audit log |
| Local MCP endpoint attacked by other local processes or by browsers (DNS rebinding) | Document leak or tampering | Loopback binding, Origin and Host checks, high-entropy hashed keys, listener off by default, kill switch |
| Key leaked (pasted into chats or configs) | Unauthorized access | Short default expiry (proposed 24 h), per-installation binding, easy revocation, keys visible in the audit log |
| MCP spec churn (2026-07-28 removed sessions) | Breakage | Use the official SDK, pin the protocol version, version-negotiation tests |
| Model download size and hosting costs | Users or project pay for bandwidth | Fetch from upstream hosts (for example Hugging Face) with pinned hashes; optional mirror |

### 9.13 Open questions (AI and MCP)

1. **v1 or post-v1 for MCP?** The recommendation is a desktop MCP server in v1 (opt-in) and the on-device AI Pack in 1.x. Do you agree, or should AI also be a v1 optional pack?
2. **Model policy.** Is an Apache/MIT-only default acceptable, excluding Gemma 1–3n and Llama from defaults? And may models be downloaded from third-party hosts such as Hugging Face, or must Lucid Systems mirror them?
3. **Mobile MCP.** Should external agents ever reach the mobile app, through app-to-app or LAN pairing? Or is on-device-only acceptable for good?
4. Should the per-document ID in the .docx be **on by default**, or created only when "Share with AI" is first used? (The recommendation is to create it only on first use.)
5. Is a **non-OAuth static bearer** acceptable for local MCP in v1, with OAuth only if clients require it?


---
*Sources are linked inline. External facts were checked on October 8, 2026. ONLYOFFICE license text was read from GitHub `master` on that date; re-check it at fork time.*
