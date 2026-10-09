import { describe, expect, it } from 'vitest';
import { apkName, compareVersions, newerApk, type ReleaseInfo } from '../src/updates.js';

describe('update version order', () => {
  it('orders semantic versions, pre-releases before releases', () => {
    expect(compareVersions('0.1.1-preview', '0.1.0-preview')).toBe(1);
    expect(compareVersions('v0.1.0-preview', '0.1.0-preview')).toBe(0);
    expect(compareVersions('0.1.0-preview', '0.1.0')).toBe(-1);
    expect(compareVersions('0.2.0', '0.10.0')).toBe(-1);
    expect(compareVersions('1.0.0-preview.2', '1.0.0-preview.10')).toBe(-1);
    expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBe(1);
    expect(compareVersions('nonsense', '1.0.0')).toBe(0);
  });
});

describe('Android update check', () => {
  const rel = (tag: string, apk = true, draft = false): ReleaseInfo => ({
    tag_name: tag,
    draft,
    assets: apk
      ? [
          {
            name: 'Lucid-Sentence-Android.apk',
            browser_download_url: `https://github.com/DoctorNurse/Lucid-Sentence/releases/download/${tag}/Lucid-Sentence-Android.apk`,
          },
        ]
      : [],
  });

  it('picks the newest newer release with an APK, pre-releases included', () => {
    const found = newerApk(
      [rel('v0.1.2-preview', false), rel('v0.1.1-preview'), rel('v0.1.0-preview')],
      '0.1.0-preview',
    );
    expect(found?.version).toBe('0.1.1-preview');
    expect(found?.url).toContain('/v0.1.1-preview/Lucid-Sentence-Android.apk');
  });

  it('takes the APK for this CPU type, and the default one where a release has no such APK', () => {
    expect(apkName('aarch64')).toBe('Lucid-Sentence-Android.apk');
    expect(apkName(undefined)).toBe('Lucid-Sentence-Android.apk');
    expect(apkName('arm')).toBe('Lucid-Sentence-Android-armv7.apk');
    const split = rel('v0.1.4-preview');
    split.assets.push({
      name: 'Lucid-Sentence-Android-armv7.apk',
      browser_download_url:
        'https://github.com/DoctorNurse/Lucid-Sentence/releases/download/v0.1.4-preview/Lucid-Sentence-Android-armv7.apk',
    });
    expect(newerApk([split], '0.1.3-preview', apkName('arm'))?.url).toMatch(/-armv7\.apk$/);
    expect(newerApk([split], '0.1.3-preview', apkName('aarch64'))?.url).toMatch(/Android\.apk$/);
    expect(newerApk([rel('v0.1.4-preview')], '0.1.3-preview', apkName('x86_64'))?.url).toMatch(
      /Android\.apk$/,
    );
  });

  it('ignores drafts, older or equal versions, and foreign download hosts', () => {
    expect(newerApk([rel('v0.1.1-preview', true, true)], '0.1.0-preview')).toBeNull();
    expect(newerApk([rel('v0.1.0-preview')], '0.1.0-preview')).toBeNull();
    const foreign = rel('v9.0.0');
    foreign.assets[0]!.browser_download_url = 'https://example.com/Lucid-Sentence-Android.apk';
    expect(newerApk([foreign], '0.1.0-preview')).toBeNull();
  });
});

describe('update prompt', () => {
  it('shows one notice with the action and Later, and runs the action', async () => {
    const { updatePrompt } = await import('../src/editor/ui.js');
    let ran = 0;
    updatePrompt(
      'Update available: Lucid Sentence 0.1.2-preview is ready.',
      'Restart to update',
      () => {
        ran++;
      },
    );
    updatePrompt(
      'Update available: Lucid Sentence 0.1.2-preview is ready.',
      'Restart to update',
      () => {
        ran++;
      },
    );
    expect(document.querySelectorAll('.update-bar')).toHaveLength(1);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.update-bar button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Later', 'Restart to update']);
    buttons[1]!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(ran).toBe(1);
    expect(document.querySelector('.update-bar')).toBeNull();
  });
});
