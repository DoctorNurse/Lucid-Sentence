# M0 evaluation: fidelity bake-off and mobile go/no-go

**Status: placeholder.** Harnesses and corpus are added during M0. All numbers
below are **proposed targets** from the plan (§3.4) for R H to confirm; they are
not measured figures.

## 1. .docx fidelity bake-off

Render a real-world `.docx` corpus to PDF with **Microsoft Word** (reference),
**ONLYOFFICE 9.4+**, and **LibreOfficeKit/Collabora**, then measure per-page
visual differences.

- Corpus: real-world documents covering tables, images, headers/footers, TOCs,
  footnotes, sections/columns, tracked changes, comments, fields, equations,
  ink, and mail-merge templates. Only documents we have the right to use.
- Metrics: per-page pixel/perceptual diff vs. Word, pagination agreement (page
  count and page-break positions), and round-trip loss (open → save → reopen in
  Word with no repair prompt or content loss).
- Output: a report per engine and the long-term **fidelity CI gate** threshold.

## 2. Mobile go/no-go gate

### Reference devices (proposed)

- Android: one current mid-range phone (Galaxy A5x / Pixel "a" class) and one ~3 years old.
- iOS: iPhone SE (3rd gen) or iPhone 13 class, plus one current iPhone.
- Tablets: a recent base iPad and a mid-range Android tablet.

### Corpus

| File | Description                                        |
| ---- | -------------------------------------------------- |
| S    | 5 pages of text                                    |
| M    | 50 pages with tables, images, headers/footers, TOC |
| L    | 300-page report with footnotes, ~5–10 MB           |
| XL   | 25 MB image-heavy file (stress only, not gating)   |

### Pass criteria (proposed targets)

| Metric                         | Target                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| Cold open to editable          | S ≤ 2 s; M ≤ 5 s; L ≤ 12 s on the mid-range phone; older phones +50%                       |
| Typing latency p95             | ≤ 50 ms on M; ≤ 100 ms on L                                                                |
| Scrolling                      | ≥ 50 fps median on M; no blank-page flashes > 300 ms                                       |
| Peak memory (app + WebView)    | ≤ 800 MB on M; ≤ 1.2 GB on L; no OOM kill in a 30-min scripted edit session on L           |
| Save (.docx)                   | M ≤ 3 s; L ≤ 8 s; opens in Word without repair prompts or content loss                     |
| Ribbon parity                  | 100% of the v1 command list reachable on phone, each in ≤ 3 taps; dialogs usable at 375 pt |
| Stability                      | Zero crashes across the scripted session on all reference devices                          |
| Install size                   | ≤ 300 MB per platform (fonts included)                                                     |
| Mail merge (proposed, plan §8) | 500 records to PDF without an OOM kill                                                     |

The **ribbon parity** row is already checked statically by
`packages/commands` tests (every command has a phone placement and is reachable
in ≤ 3 taps); on-device checks are added here.

### Decision rule

- **Pass:** every gating criterion met on mid-range devices; older devices met
  or within 25%. Proceed with ONLYOFFICE on all platforms.
- **Conditional:** up to two criteria missed by ≤ 25% with a credible fix
  (e.g. native x2t instead of WASM, lazy loading). One fix iteration, one re-test.
- **Fail:** anything else, or failing the re-test. Switch the whole product to
  Collabora / LibreOfficeKit and run the same gate on it. Mixed engines
  (ONLYOFFICE desktop + Collabora mobile) are not recommended.

## Planned layout

```
eval/
├─ corpus/        # .docx files + provenance/licensing notes
├─ fidelity/      # render-to-PDF drivers + diff harness + report
└─ mobile-gate/   # scripted sessions, metrics collection, device matrix
```
