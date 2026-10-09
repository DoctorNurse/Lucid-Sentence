# Lucid Sentence

A free, open-source word processor for **.docx** with Word’s familiar ribbon and layout, and a fresher look — for Windows, macOS, Android, and iOS/iPadOS.

**Status:** M0 foundations — command registry and ribbon UI scaffold; no engine code yet.

## Goals

- Word-equivalent commands, dialogs, and shortcuts
- Full ribbon parity (File through Help, plus contextual tabs)
- High .docx / page-layout fidelity (Print Layout)
- One shared UI layer across four platforms, offline-first
- **v1 ships the entire Word ribbon on desktop, tablet, and phone** (touch changes layout only, not which commands exist)
- Free and copyleft (**AGPL-3.0**); no paid tier, no telemetry by default, no account required

## Non-goals (v1)

- Legacy `.doc` open/save (possible later: one-way import to `.docx`)
- Other edit formats (ODT, RTF) or spreadsheet/presentation apps
- Real-time co-authoring or cloud services
- Running VBA macros (`.docm` macros preserved, not executed)
- Microsoft 365–only features (Copilot, cloud Editor, etc.) — ribbon slots kept as stubs
- Copying Microsoft icons or artwork

## Platforms

Windows · macOS · Android · iOS/iPadOS

## Engine

Built on **ONLYOFFICE** 9.4+ (OOXML-native, AGPL-3.0). **Collabora / LibreOfficeKit** is the fallback if the Phase 0 mobile go/no-go gate or fidelity bake-off says so. Decision is pending the M0 evaluation.

Native format: **.docx** (plus `.dotx` / `.docm`). PDF is export-only.

## Roadmap (scope only)

| Milestone   | Focus                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| **M0**      | Foundations, fidelity bake-off, mobile go/no-go, counsel/name clearance                  |
| **M1**      | Platform alpha — command registry, three-layout ribbon, local open/save on all platforms |
| **Alpha A** | Authoring tabs (Home, Insert, Layout, Design, View) + contextual tabs                    |
| **Alpha B** | Review and Draw                                                                          |
| **Alpha C** | References and Mailings                                                                  |
| **Beta 1**  | Feature-complete (100% non-stub command list)                                            |
| **Beta 2**  | Release candidate — performance, a11y, localization, channels                            |
| **v1.0**    | Four-platform release                                                                    |

After v1: polish, optional Linux packaging, optional `.doc` import, optional collaboration, on-device extras.

## License

[AGPL-3.0](LICENSE). Lucid Sentence will be based on ONLYOFFICE software developed by Ascensio System SIA (with required attribution and legal notices when code lands).

## Trademark

Lucid Sentence is **not affiliated with Microsoft**. Word is a trademark of Microsoft Corporation.

## Repository

| Path                 | What it is                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `packages/commands`  | Single command registry: every tab → group → command, with desktop/tablet/phone placements |
| `packages/ribbon-ui` | `<ls-ribbon>` web component rendering the registry in three layouts, with themes           |
| `apps/demo`          | Vite dev page showing the ribbon                                                           |
| `apps/desktop`       | Planned ONLYOFFICE DesktopEditors fork (placeholder)                                       |
| `apps/mobile`        | Planned Capacitor shell for Android and iOS (placeholder)                                  |
| `engine/`            | Planned ONLYOFFICE 9.4+ integration and attribution obligations                            |
| `eval/`              | M0 fidelity bake-off and mobile go/no-go gate                                              |

## Development

Requires Node.js 20.19+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm dev        # ribbon demo at http://localhost:5173
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Contributing

Issues and Discussions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md): **signed commits are required**, plus DCO sign-off (`git commit -s`). Please also read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).

## Planning document

Full plan (draft v0.5): **[docs/PLAN.md](docs/PLAN.md)**
