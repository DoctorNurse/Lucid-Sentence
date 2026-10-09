#!/usr/bin/env node
// Adds the Android permissions Notes mode needs to the generated AndroidManifest.xml.
//
//   node scripts/android-permissions.mjs apps/shell/src-tauri/gen/android/app/src/main/AndroidManifest.xml
//
// `tauri android init` regenerates the Android project on every release build, and its
// manifest only asks for INTERNET. Audio notes need the microphone: the WebView's
// permission handler (wry) asks the user for RECORD_AUDIO at runtime, but Android only
// shows that prompt for permissions the manifest declares. Without them getUserMedia
// fails with NotAllowedError and Record does nothing. Running this twice is harmless.
import { readFileSync, writeFileSync } from 'node:fs';

export const PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
];

/** Insert missing <uses-permission> entries before <application>. */
export function addPermissions(xml, permissions = PERMISSIONS) {
  const missing = permissions.filter((p) => !xml.includes(`android:name="${p}"`));
  if (missing.length === 0) return xml;
  const at = xml.indexOf('<application');
  if (at < 0) throw new Error('AndroidManifest.xml has no <application> element');
  const indent = /([ \t]*)<application/.exec(xml)?.[1] ?? '    ';
  const lines = missing.map((p) => `<uses-permission android:name="${p}" />\n${indent}`).join('');
  return xml.slice(0, at) + lines + xml.slice(at);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: android-permissions.mjs <AndroidManifest.xml>');
    process.exit(2);
  }
  const before = readFileSync(file, 'utf8');
  const after = addPermissions(before);
  writeFileSync(file, after);
  for (const p of PERMISSIONS) {
    if (!after.includes(`android:name="${p}"`)) {
      console.error(`missing ${p}`);
      process.exit(1);
    }
  }
  console.log(
    after === before ? 'permissions already present' : `added: ${PERMISSIONS.join(', ')}`,
  );
}
