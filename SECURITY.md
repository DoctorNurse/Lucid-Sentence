# Security Policy

Lucid Sentence opens untrusted `.docx` files, so document parsing, conversion
(x2t), and the native bridges in the desktop and mobile shells are
security-sensitive. We appreciate responsible reports.

## Supported versions

The project is pre-release (milestone M0). Until v1.0, only the `main` branch is
supported; fixes land there.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

- Preferred: use GitHub's private vulnerability reporting on this repository
  (**Security → Report a vulnerability**), if it is enabled.
- Otherwise: contact the maintainer, [@DoctorNurse](https://github.com/DoctorNurse),
  privately on GitHub and ask for a private channel.

Include the affected version or commit, the platform, steps to reproduce, and, if
possible, a minimal sample document. Do not attach documents that contain other
people's personal data.

We aim to acknowledge reports within 7 days and to agree on a disclosure date
with you. We will credit reporters who want to be credited.

## Upstream issues

If the problem is in ONLYOFFICE code (sdkjs, web-apps, core/x2t, desktop-sdk,
desktop-apps), we will coordinate with Ascensio System SIA and follow their
disclosure process as well. You may also report it to them directly.

## Supply-chain hygiene

- Every commit on `main` must be cryptographically signed (SSH or GPG) and show
  as **Verified** on GitHub.
- Dependencies are pinned through `pnpm-lock.yaml`; CI installs with
  `--frozen-lockfile`.
- No telemetry is collected by default.
