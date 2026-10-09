// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../android-permissions.mjs');

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <!-- AndroidTV support -->
    <uses-feature android:name="android.software.leanback" android:required="false" />

    <application
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name">
    </application>
</manifest>
`;

describe('Android microphone permissions (audio notes)', () => {
  it('adds RECORD_AUDIO and MODIFY_AUDIO_SETTINGS before <application>, once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-perm-'));
    const file = join(dir, 'AndroidManifest.xml');
    writeFileSync(file, MANIFEST);
    execFileSync('node', [SCRIPT, file]);
    const once = readFileSync(file, 'utf8');
    for (const p of ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS']) {
      const tag = `<uses-permission android:name="android.permission.${p}" />`;
      expect(once.split(tag)).toHaveLength(2);
      expect(once.indexOf(tag)).toBeLessThan(once.indexOf('<application'));
    }
    expect(once).toContain('android.permission.INTERNET');
    execFileSync('node', [SCRIPT, file]);
    expect(readFileSync(file, 'utf8')).toBe(once);
  });
});
