# Contributing to Lucid Sentence

Thanks for helping build a free, open-source `.docx` word processor with Word's
ribbon and layout. Please read the [plan](docs/PLAN.md) first; it defines scope,
the engine choice, and the build rules below.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

1. **Signed commits are required.** Every commit (and tag) must carry a
   cryptographic signature (SSH or GPG) that GitHub shows as **Verified**.
   Unsigned commits will not be merged. See [Signing commits](#signing-commits).
2. **DCO sign-off.** Add a `Signed-off-by:` line to each commit (`git commit -s`)
   to certify the [Developer Certificate of Origin](https://developercertificate.org/).
   There is no CLA; you keep your copyright, and your contribution is licensed
   under AGPL-3.0-only.
3. **Mobile parity is a build rule.** Every command in the registry must have a
   desktop, tablet, **and** phone placement. CI fails otherwise. Never add a
   command to one layout only.
4. **No Microsoft or ONLYOFFICE artwork.** Icons, templates, and help text must
   be original. Do not trace Word or Fluent icons. Do not use "Microsoft",
   "Word", "Office", or "Fluent" in product names or branding.
5. **Upstream first.** Engine bugs and gaps should be proposed to ONLYOFFICE
   (sdkjs, core) when they would be accepted there. Keep downstream patches
   small and documented.
6. **Keep attribution intact.** Never remove copyright, license, or origin
   notices from upstream files. Record modifications in the modification log
   once upstream code is vendored (see [NOTICE](NOTICE)).

## Signing commits

SSH signing is the simplest option (Git 2.34+):

```sh
ssh-keygen -t ed25519 -C "you@example.com" -f ~/.ssh/git_signing
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/git_signing.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

Then add `~/.ssh/git_signing.pub` to GitHub as a **Signing key**
(Settings → SSH and GPG keys → New SSH key → Key type: _Signing Key_), or with
the GitHub CLI:

```sh
gh auth refresh -h github.com -s admin:ssh_signing_key
gh ssh-key add ~/.ssh/git_signing.pub --type signing --title "git signing"
```

Your commit email must be one that is verified on your GitHub account (the
`…@users.noreply.github.com` address works). Check with `git log --show-signature`.
GPG signing works too; see GitHub's docs on
[commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification).

Never bypass hooks with `--no-verify` or disable signing to get a commit through.

## Development

Requirements: Node.js 20.19+ and pnpm 10 (`corepack enable` picks up the pinned
version).

```sh
pnpm install
pnpm dev          # ribbon demo at http://localhost:5173
pnpm lint         # tsc -b (type info for ESLint) + ESLint + Prettier check
pnpm typecheck    # TypeScript (strict) across all packages
pnpm test         # Vitest
pnpm build        # packages + demo
pnpm format       # Prettier write
```

### Layout of the repository

| Path                 | What it is                                                            |
| -------------------- | --------------------------------------------------------------------- |
| `packages/commands`  | The single command registry (tab → group → command, three placements) |
| `packages/ribbon-ui` | `<ls-ribbon>` web component: desktop, tablet, phone layouts; themes   |
| `apps/demo`          | Vite dev page that shows the ribbon                                   |
| `apps/desktop`       | Planned ONLYOFFICE DesktopEditors fork (placeholder)                  |
| `apps/mobile`        | Planned Capacitor shell for Android and iOS (placeholder)             |
| `engine/`            | Planned ONLYOFFICE 9.4+ integration and attribution (placeholder)     |
| `eval/`              | M0 fidelity bake-off and mobile go/no-go gate (placeholder)           |

### Adding or changing a command

Edit the tab file in `packages/commands/src/tabs/`. Each `cmd(...)` call takes
the desktop size (`L`/`M`/`S`), tablet priority (`1`–`3`), and phone placement
(`strip`, `strip+sub`, `sheet`, `sub`) as required arguments. Run `pnpm test`;
the registry tests check order, placements, unique ids, and the ≤ 3-tap phone rule.

## Pull requests

- Branch from `main`; keep PRs focused.
- CI (lint, typecheck, test, build) must pass.
- Describe user-visible changes and which platforms/layouts you checked.
- UI-spec changes (tab/group/command map, layouts) go through an RFC issue first.
