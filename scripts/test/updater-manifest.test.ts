// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../updater-manifest.mjs');

interface Manifest {
  version: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

describe('updater manifest (latest.json)', () => {
  it('maps each signed installer to its Tauri platform keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-upd-'));
    for (const f of [
      'Lucid-Sentence-macOS.app.tar.gz',
      'Lucid-Sentence-Windows-Setup.exe',
      'Lucid-Sentence-Linux.AppImage',
    ]) {
      writeFileSync(join(dir, f), 'x');
      writeFileSync(join(dir, `${f}.sig`), `sig-of-${f}\n`);
    }
    writeFileSync(join(dir, 'Lucid-Sentence-Linux.deb'), 'x'); // unsigned: left out
    const base = 'https://github.com/DoctorNurse/Lucid-Sentence/releases/download/v0.1.1-preview';
    const out = execFileSync('node', [SCRIPT, 'v0.1.1-preview', dir, base], { encoding: 'utf8' });
    const m = JSON.parse(out) as Manifest;
    expect(m.version).toBe('0.1.1-preview');
    expect(m.pub_date).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(Object.keys(m.platforms).sort()).toEqual([
      'darwin-aarch64',
      'darwin-aarch64-app',
      'darwin-x86_64',
      'darwin-x86_64-app',
      'linux-x86_64',
      'linux-x86_64-appimage',
      'windows-x86_64',
      'windows-x86_64-nsis',
    ]);
    expect(m.platforms['windows-x86_64']).toEqual({
      signature: 'sig-of-Lucid-Sentence-Windows-Setup.exe',
      url: `${base}/Lucid-Sentence-Windows-Setup.exe`,
    });
  });

  it('fails when nothing is signed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-upd-'));
    expect(() =>
      execFileSync('node', [SCRIPT, 'v1.0.0', dir, 'https://example.invalid'], { stdio: 'pipe' }),
    ).toThrow();
  });
});
