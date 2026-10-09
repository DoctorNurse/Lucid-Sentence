# Engine integration (planned): ONLYOFFICE 9.4+

**Status: placeholder.** No ONLYOFFICE source is vendored yet. This directory
documents how the document engine will be integrated and the attribution
obligations that come with it.

## What we will use

| Upstream repo  | Role                                                       |
| -------------- | ---------------------------------------------------------- |
| `sdkjs`        | Document model, OOXML-native editing, client-side layout   |
| `web-apps`     | Editor controllers and dialogs (desktop mode) under our UI |
| `core` (x2t)   | Format conversion (.docx ⇄ internal, PDF export)           |
| `desktop-sdk`  | CEF embedding + native bridge (desktop)                    |
| `desktop-apps` | Native desktop shell (forked in `apps/desktop`)            |

**Minimum version: 9.4** (May 2026). Earlier releases carried an AGPL §7(b)
"retain the original Product logo" term; 9.4 replaced it. Do **not** import code
from pre-9.4 trees or from Euro-Office without a counsel review (plan §5.2).

**Fallback:** Collabora Online / LibreOfficeKit (MPL-2.0), selected only if the
M0 mobile gate fails or the fidelity bake-off shows no meaningful .docx
advantage for ONLYOFFICE, with engine-gap cost factored in (plan §2.2).

## Integration approach

- Pin upstream as tracked sources (submodules or vendored subtrees with a
  recorded commit hash per repo) under a top-level `upstream/` directory, added
  in M0/M1.
- Keep downstream patches thin and documented; offer engine gaps upstream first
  (Index, Table of Authorities, labels/envelopes, view modes).
- Map every registry command (`packages/commands`) to an sdkjs API call; M0
  turns each "unverified" coverage entry into "verified" or "gap" (plan §4.8).

## Attribution and license obligations (ONLYOFFICE 9.4 additional terms)

1. Keep **all** copyright, license, warranty, and attribution/origin notices in
   upstream files.
2. Mark modified versions prominently, with modification dates, stating they are
   "based on the original ONLYOFFICE software developed by Ascensio System SIA"
   — kept in [`/NOTICE`](../NOTICE) and a modification log.
3. Ship a visible **Legal Notices** screen (About) that identifies ONLYOFFICE as
   the original developer, says this version may be modified, and links to the
   license. Proposed text: "Lucid Sentence is based on ONLYOFFICE software
   developed by Ascensio System SIA, modified by Lucid Systems and the Lucid
   Sentence contributors."
4. No trademark license: no ONLYOFFICE logo or name in Sentence branding; mention
   it only nominatively with "ONLYOFFICE is a trademark of Ascensio System SIA".
5. ONLYOFFICE illustrations, icon sets, and docs are CC BY-SA 4.0 — we plan to
   replace them with original art.
6. Every distributed binary ships with its Corresponding Source (AGPL-3.0).
7. Re-read the upstream `LICENSE` at fork time and get counsel review before the
   first public build, especially for app-store channels.

CI will later check automatically that the legal notices are present.
