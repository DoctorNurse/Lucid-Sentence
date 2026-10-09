# Lucid Sentence

A free, open-source word processor for **.docx** with Word’s familiar ribbon and layout, and a fresher look — for Windows, macOS, Android, and iOS/iPadOS.

**Status:** Planning stage — no code yet.

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

| Milestone | Focus |
|-----------|--------|
| **M0** | Foundations, fidelity bake-off, mobile go/no-go, counsel/name clearance |
| **M1** | Platform alpha — command registry, three-layout ribbon, local open/save on all platforms |
| **Alpha A** | Authoring tabs (Home, Insert, Layout, Design, View) + contextual tabs |
| **Alpha B** | Review and Draw |
| **Alpha C** | References and Mailings |
| **Beta 1** | Feature-complete (100% non-stub command list) |
| **Beta 2** | Release candidate — performance, a11y, localization, channels |
| **v1.0** | Four-platform release |

After v1: polish, optional Linux packaging, optional `.doc` import, optional collaboration, on-device extras.

## License

[AGPL-3.0](LICENSE). Lucid Sentence will be based on ONLYOFFICE software developed by Ascensio System SIA (with required attribution and legal notices when code lands).

## Trademark

Lucid Sentence is **not affiliated with Microsoft**. Word is a trademark of Microsoft Corporation.

## Contributing

Issues and Discussions are welcome. See the planning doc for open questions and the contribution model (DCO, upstream-first).

## Planning document

Full plan (draft v0.5): **[docs/PLAN.md](docs/PLAN.md)**
