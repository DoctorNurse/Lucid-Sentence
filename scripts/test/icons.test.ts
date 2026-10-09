// @vitest-environment node
/**
 * Validates the generated app icons (`pnpm icons`): presence, pixel sizes,
 * container formats, the PWA manifest, Android adaptive icons, and the iOS
 * asset catalogs.
 */
import { colors } from '../../packages/tokens/src/index.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const read = (p: string): Buffer => readFileSync(join(ROOT, p));
const json = (p: string): unknown => JSON.parse(read(p).toString('utf8'));

function pngInfo(p: string): { width: number; height: number; colorType: number } {
  const b = read(p);
  expect(b.subarray(0, 8).toString('hex'), `${p} is a PNG`).toBe('89504e470d0a1a0a');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25]! };
}

function icoSizes(p: string): number[] {
  const b = read(p);
  expect(b.readUInt16LE(2), `${p} is an icon file`).toBe(1);
  return Array.from({ length: b.readUInt16LE(4) }, (_, i) => b[6 + 16 * i] || 256);
}

function icnsTypes(p: string): string[] {
  const b = read(p);
  expect(b.subarray(0, 4).toString('ascii')).toBe('icns');
  expect(b.readUInt32BE(4)).toBe(b.length);
  const types: string[] = [];
  for (let o = 8; o < b.length; o += b.readUInt32BE(o + 4))
    types.push(b.subarray(o, o + 4).toString('ascii'));
  return types;
}

describe('generated icons', () => {
  const inventory = json('scripts/icons-manifest.json') as Record<string, string>;

  it('every inventoried PNG exists at its recorded size', () => {
    expect(Object.keys(inventory).length).toBeGreaterThan(150);
    for (const [path, size] of Object.entries(inventory)) {
      expect(existsSync(join(ROOT, path)), path).toBe(true);
      const { width, height } = pngInfo(path);
      expect(`${width}x${height}`, path).toBe(size);
    }
  });

  it('has the SVG master and the vector app icon', () => {
    for (const p of [
      'assets/brand/src/icon.svg',
      'assets/brand/icon.svg',
      'apps/demo/public/favicon.svg',
    ]) {
      const s = read(p).toString('utf8');
      expect(s, p).toMatch(/^<svg[^>]+viewBox="0 0 1024 1024"/);
    }
    const master = read('assets/brand/src/icon.svg').toString('utf8');
    for (const marker of ['tile', 'rim', 'glyph']) {
      expect(master).toContain(`<!-- ${marker}:start -->`);
      expect(master).toContain(`<!-- ${marker}:end -->`);
    }
  });

  it('brand PNGs, favicons and social images have the right sizes', () => {
    for (const s of [16, 32, 64, 128, 256, 512, 1024])
      expect(pngInfo(`assets/brand/icon-${s}.png`)).toMatchObject({ width: s, height: s });
    expect(pngInfo('assets/brand/social-preview.png')).toMatchObject({ width: 1280, height: 640 });
    expect(pngInfo('assets/brand/og-image.png')).toMatchObject({ width: 1200, height: 630 });
    expect(pngInfo('apps/demo/public/favicon-16.png')).toMatchObject({ width: 16, height: 16 });
    expect(pngInfo('apps/demo/public/favicon-32.png')).toMatchObject({ width: 32, height: 32 });
    // apple-touch-icon is opaque (iOS fills transparency with black).
    expect(pngInfo('apps/demo/public/apple-touch-icon.png')).toEqual({
      width: 180,
      height: 180,
      colorType: 2,
    });
  });

  it('Windows .ico files carry 16–256 px', () => {
    expect(icoSizes('apps/desktop/icons/windows/lucid-sentence.ico')).toEqual([
      16, 20, 24, 32, 40, 48, 64, 96, 128, 256,
    ]);
    expect(icoSizes('assets/brand/icon.ico')).toEqual([16, 20, 24, 32, 40, 48, 64, 96, 128, 256]);
    expect(icoSizes('apps/demo/public/favicon.ico')).toEqual([16, 32, 48]);
    expect(icoSizes('apps/desktop/icons/docx/docx.ico')).toContain(256);
  });

  it('MSIX / Store tiles exist at scale-100 and scale-200 with Store aspect ratios', () => {
    const dir = 'apps/desktop/icons/windows/msix';
    const expected: Record<string, [number, number]> = {
      Square44x44Logo: [44, 44],
      Square71x71Logo: [71, 71],
      Square150x150Logo: [150, 150],
      Square310x310Logo: [310, 310],
      Wide310x150Logo: [310, 150],
      StoreLogo: [50, 50],
      SplashScreen: [620, 300],
    };
    for (const [name, [w, h]] of Object.entries(expected)) {
      for (const scale of [100, 200]) {
        const f = scale / 100;
        expect(pngInfo(`${dir}/${name}.scale-${scale}.png`)).toMatchObject({
          width: w * f,
          height: h * f,
        });
      }
    }
    expect(pngInfo(`${dir}/Square44x44Logo.targetsize-16_altform-unplated.png`)).toMatchObject({
      width: 16,
    });
    expect(pngInfo(`${dir}/Square44x44Logo.targetsize-256.png`)).toMatchObject({ width: 256 });
  });

  it('macOS .icns and .iconset are complete', () => {
    const types = icnsTypes('apps/desktop/icons/macos/LucidSentence.icns');
    for (const t of ['icp4', 'icp5', 'ic07', 'ic08', 'ic09', 'ic10', 'ic13', 'ic14'])
      expect(types).toContain(t);
    const set = readdirSync(join(ROOT, 'apps/desktop/icons/macos/LucidSentence.iconset')).sort();
    expect(set).toEqual(
      [
        'icon_128x128.png',
        'icon_128x128@2x.png',
        'icon_16x16.png',
        'icon_16x16@2x.png',
        'icon_256x256.png',
        'icon_256x256@2x.png',
        'icon_32x32.png',
        'icon_32x32@2x.png',
        'icon_512x512.png',
        'icon_512x512@2x.png',
      ].sort(),
    );
    for (const f of set) {
      const m = /icon_(\d+)x\d+(@2x)?\.png/.exec(f)!;
      const px = Number(m[1]) * (m[2] ? 2 : 1);
      expect(pngInfo(`apps/desktop/icons/macos/LucidSentence.iconset/${f}`)).toMatchObject({
        width: px,
        height: px,
      });
    }
    expect(icnsTypes('apps/desktop/icons/docx/docx.icns')).toContain('ic10');
  });

  it('Linux hicolor theme has app and .docx mimetype icons', () => {
    for (const s of [16, 22, 24, 32, 48, 64, 128, 256, 512]) {
      expect(
        pngInfo(`apps/desktop/icons/linux/hicolor/${s}x${s}/apps/lucid-sentence.png`),
      ).toMatchObject({ width: s });
    }
    expect(
      existsSync(join(ROOT, 'apps/desktop/icons/linux/hicolor/scalable/apps/lucid-sentence.svg')),
    ).toBe(true);
    expect(
      pngInfo(
        'apps/desktop/icons/linux/hicolor/48x48/mimetypes/application-vnd.openxmlformats-officedocument.wordprocessingml.document.png',
      ),
    ).toMatchObject({ width: 48 });
  });

  it('Android adaptive icons cover every density with foreground, background and monochrome', () => {
    const base = 'apps/mobile/android-res';
    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [d, f] of Object.entries(densities)) {
      for (const layer of ['foreground', 'background', 'monochrome']) {
        expect(pngInfo(`${base}/mipmap-${d}/ic_launcher_${layer}.png`)).toMatchObject({
          width: 108 * f,
          height: 108 * f,
        });
      }
      expect(pngInfo(`${base}/mipmap-${d}/ic_launcher.png`)).toMatchObject({ width: 48 * f });
      expect(pngInfo(`${base}/mipmap-${d}/ic_launcher_round.png`)).toMatchObject({ width: 48 * f });
    }
    const xml = read(`${base}/mipmap-anydpi-v26/ic_launcher.xml`).toString('utf8');
    expect(xml).toContain('<adaptive-icon');
    for (const layer of ['background', 'foreground', 'monochrome']) {
      expect(xml).toContain(`<${layer} android:drawable="@mipmap/ic_launcher_${layer}" />`);
    }
    expect(pngInfo(`${base}/playstore-icon-512.png`)).toMatchObject({ width: 512, height: 512 });
  });

  it('iOS asset catalogs: single-size 1024 and the all-sizes set, all opaque', () => {
    type Contents = {
      images: {
        filename: string;
        idiom: string;
        size: string;
        scale?: string;
        platform?: string;
      }[];
      info: { version: number };
    };
    const single = json('apps/mobile/ios-res/AppIcon.appiconset/Contents.json') as Contents;
    expect(single.info.version).toBe(1);
    expect(single.images).toEqual([
      { filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
    ]);
    expect(pngInfo('apps/mobile/ios-res/AppIcon.appiconset/AppIcon-1024.png')).toEqual({
      width: 1024,
      height: 1024,
      colorType: 2,
    });

    const all = json('apps/mobile/ios-res/AppIcon-AllSizes.appiconset/Contents.json') as Contents;
    const slots = all.images.map((i) => `${i.idiom} ${i.size} ${i.scale}`);
    for (const s of [
      'iphone 60x60 2x',
      'iphone 60x60 3x',
      'ipad 76x76 2x',
      'ipad 83.5x83.5 2x',
      'ios-marketing 1024x1024 1x',
    ]) {
      expect(slots).toContain(s);
    }
    for (const img of all.images) {
      const pt = Number(img.size.split('x')[0]);
      const px = Math.round(pt * Number(img.scale!.replace('x', '')));
      expect(
        pngInfo(`apps/mobile/ios-res/AppIcon-AllSizes.appiconset/${img.filename}`),
        img.filename,
      ).toEqual({ width: px, height: px, colorType: 2 });
    }
  });

  it('the PWA manifest lists real icons (incl. maskable) and uses token colors', () => {
    type Manifest = {
      name: string;
      background_color: string;
      theme_color: string;
      icons: { src: string; sizes: string; type: string; purpose: string }[];
    };
    const m = json('apps/demo/public/manifest.webmanifest') as Manifest;
    expect(m.name).toBe('Lucid Sentence');
    expect(m.background_color).toBe(colors.light.canvas);
    expect(m.theme_color).toBe(colors.light.accent);
    expect(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true);
    for (const i of m.icons) {
      const p = `apps/demo/public/${i.src}`;
      expect(existsSync(join(ROOT, p)), p).toBe(true);
      if (i.type === 'image/png') {
        const { width, height } = pngInfo(p);
        expect(`${width}x${height}`).toBe(i.sizes);
      }
    }
    const html = read('apps/demo/index.html').toString('utf8');
    for (const href of [
      'favicon.svg',
      'favicon.ico',
      'apple-touch-icon.png',
      'manifest.webmanifest',
    ])
      expect(html).toContain(`href="./${href}"`);
  });
});
