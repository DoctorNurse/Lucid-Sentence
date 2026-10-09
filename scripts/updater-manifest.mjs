#!/usr/bin/env node
// Writes the Tauri updater manifest (latest.json) for a release to stdout.
//
//   node scripts/updater-manifest.mjs <tag> <dir with the release files> <download base URL>
//
// Each desktop platform points at its updater file and carries that file's minisign
// signature (the matching .sig). The apps verify the signature with the public key
// in apps/shell/src-tauri/tauri.conf.json before installing anything.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [tag, dir, base] = process.argv.slice(2);
if (!tag || !dir || !base) {
  console.error('usage: updater-manifest.mjs <tag> <dir> <download base URL>');
  process.exit(2);
}

// Tauri looks up "<os>-<arch>-<installer>" first, then "<os>-<arch>".
const targets = [
  [
    'Lucid-Sentence-macOS.app.tar.gz',
    ['darwin-aarch64', 'darwin-x86_64', 'darwin-aarch64-app', 'darwin-x86_64-app'],
  ],
  ['Lucid-Sentence-Windows-Setup.exe', ['windows-x86_64', 'windows-x86_64-nsis']],
  ['Lucid-Sentence-Windows.msi', ['windows-x86_64-msi']],
  ['Lucid-Sentence-Linux.AppImage', ['linux-x86_64', 'linux-x86_64-appimage']],
  ['Lucid-Sentence-Linux.deb', ['linux-x86_64-deb']],
];

const platforms = {};
for (const [file, keys] of targets) {
  const sig = join(dir, `${file}.sig`);
  if (!existsSync(sig) || !existsSync(join(dir, file))) continue;
  const entry = { signature: readFileSync(sig, 'utf8').trim(), url: `${base}/${file}` };
  for (const k of keys) platforms[k] = entry;
}
if (Object.keys(platforms).length === 0) {
  console.error('no signed updater files found');
  process.exit(1);
}

const manifest = {
  version: tag.replace(/^v/, ''),
  notes: `Lucid Sentence ${tag.replace(/^v/, '')}. See the release notes on GitHub.`,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms,
};
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
