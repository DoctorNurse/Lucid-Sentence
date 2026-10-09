// @ts-check
/**
 * `pnpm icons`: regenerate every app icon from the vector master
 * (assets/brand/src/icon.svg) and the pre-shaped brand text
 * (assets/brand/src/text-paths.json). Output is deterministic; run it after
 * editing the master and commit the results. See assets/brand/README.md.
 *
 *   pnpm icons                      # write all outputs
 *   pnpm icons --contact-sheet out.png   # also render a contact sheet
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = readFileSync(join(ROOT, 'assets/brand/src/icon.svg'), 'utf8');
const TEXT = JSON.parse(readFileSync(join(ROOT, 'assets/brand/src/text-paths.json'), 'utf8'));

// Brand colors. canvasLight/canvasDark/accentLight/accent mirror packages/tokens
// (Paper canvas, Studio canvas, light and dark accents); scripts/test/icons.test.ts checks this.
export const BRAND = {
  tile: '#0a4c5a',
  canvasDark: '#0a0a0a',
  canvasLight: '#efe8dc',
  accentLight: '#0a6a7c',
  accent: '#45c3d6',
  paper: '#f3efe6',
};

/** @param {string} name */
const part = (name) => {
  const m = MASTER.match(new RegExp(`<!-- ${name}:start -->([\\s\\S]*?)<!-- ${name}:end -->`));
  if (!m?.[1]) throw new Error(`master is missing the ${name} markers`);
  return m[1];
};
const DEFS = MASTER.match(/<defs id="tile-defs">[\s\S]*?<\/defs>/)?.[0] ?? '';
const TILE = part('tile');
const RIM = part('rim');
const GLYPH = part('glyph');
/** The S without its shadow (small sizes, monochrome, adaptive layers). */
const GLYPH_FLAT = (fill = '#ffffff', width = 132) =>
  GLYPH.replace(/<g id="glyph"[^>]*>/, '<g>')
    .replace('stroke="url(#ls-s)"', `stroke="${fill}"`)
    .replace('stroke-width="132"', `stroke-width="${width}"`);

/** Wrap content in a 1024-unit square SVG at `w`×`h` (viewBox can be overridden). */
const svg = (body, viewBox = '0 0 1024 1024') => {
  const [, , w, h] = viewBox.split(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${viewBox}">${DEFS}${body}</svg>`;
};
const scaled = (k, body, cx = 512, cy = 512) =>
  `<g transform="translate(${cx} ${cy}) scale(${k}) translate(-512 -512)">${body}</g>`;
let clipN = 0;
const clipRound = (rx, body, x = 0, y = 0, w = 1024, h = 1024) => {
  const id = `c${clipN++}`;
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath><g clip-path="url(#${id})">${body}</g>`;
};
const clipCircle = (body) => {
  const id = `c${clipN++}`;
  return `<clipPath id="${id}"><circle cx="512" cy="512" r="512"/></clipPath><g clip-path="url(#${id})">${body}</g>`;
};

// ── Variants (all on a 1024 canvas)
const V = {
  /** The app icon: rounded tile, transparent corners. */
  rounded: () => clipRound(228, TILE + RIM) + GLYPH,
  /** 16–32 px: flatter tile, tighter corners, heavier and larger S for legibility. */
  small: () =>
    clipRound(
      200,
      '<rect width="1024" height="1024" fill="url(#ls-base)"/><rect width="1024" height="1024" fill="url(#ls-glow)"/>',
    ) + scaled(1.1, GLYPH_FLAT('#ffffff', 158), 512, 516),
  /** Full-bleed square (iOS, Play Store, PWA maskable base): platforms apply their own mask. */
  square: (k = 1) => TILE + scaled(k, GLYPH),
  /** macOS: tile on Apple's 824/1024 grid with a soft drop shadow. */
  mac: () =>
    `<filter id="mshadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.32"/></filter>` +
    `<g filter="url(#mshadow)"><g transform="translate(100 100) scale(${824 / 1024})">${clipRound(228, TILE + RIM)}${GLYPH}</g></g>`,
  round: () => clipCircle(TILE) + scaled(0.92, GLYPH),
  /** Android adaptive layers: 108dp canvas, 66dp safe-zone circle → S at 72 %. */
  fg: () => scaled(0.72, GLYPH),
  bg: () => TILE,
  mono: () => scaled(0.72, GLYPH_FLAT('#ffffff', 140)),
  /** A centered rounded icon with padding (`k` = share of the canvas). */
  padded: (k) => scaled(k, clipRound(228, TILE + RIM) + GLYPH),
};

/** .docx file-type icon: a page with a folded corner and the S badge. */
const docIcon = () => {
  const page =
    `<filter id="dshadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.22"/></filter>` +
    `<g filter="url(#dshadow)"><path d="M232 72 H640 L824 256 V920 Q824 952 792 952 H232 Q200 952 200 920 V104 Q200 72 232 72 Z" fill="#ffffff"/></g>` +
    `<path d="M640 72 V224 Q640 256 672 256 H824 Z" fill="#d9e9ec"/>` +
    `<path d="M232 72 H640 L824 256 V920 Q824 952 792 952 H232 Q200 952 200 920 V104 Q200 72 232 72 Z" fill="none" stroke="#b9c6c9" stroke-width="10"/>` +
    [330, 400, 470, 540]
      .map(
        (y, i) =>
          `<rect x="288" y="${y}" width="${i === 3 ? 260 : 448}" height="26" rx="13" fill="#c9d6d9"/>`,
      )
      .join('');
  const badge = `<g transform="translate(150 470) scale(${470 / 1024})">${clipRound(228, TILE + RIM)}${GLYPH_FLAT('#ffffff', 150)}</g>`;
  return page + badge;
};
const docIconSmall = () =>
  `<path d="M200 40 H660 L864 244 V984 H200 Z" fill="#ffffff" stroke="#8fa3a8" stroke-width="40" stroke-linejoin="round"/>` +
  `<g transform="translate(96 400) scale(${600 / 1024})">${clipRound(200, '<rect width="1024" height="1024" fill="url(#ls-base)"/>')}${scaled(1.1, GLYPH_FLAT('#ffffff', 170))}</g>`;

// ── Social preview and Open Graph image (wordmark from text-paths.json)
const social = (W, H) => {
  const icon = Math.round(H * 0.42);
  const ix = Math.round(W * 0.09);
  const iy = Math.round((H - icon) / 2);
  const tx = ix + icon + Math.round(W * 0.045);
  const wm = TEXT.wordmark;
  const tg = TEXT.tagline;
  const lb = TEXT.label;
  const s = Math.min(1, (W - tx - W * 0.06) / wm.width);
  const cy = H / 2;
  return svg(
    `<radialGradient id="sg" cx="0.22" cy="0.5" r="0.75"><stop offset="0" stop-color="#0f6b7c" stop-opacity="0.55"/><stop offset="1" stop-color="#0f6b7c" stop-opacity="0"/></radialGradient>` +
      `<rect width="${W}" height="${H}" fill="${BRAND.canvasDark}"/><rect width="${W}" height="${H}" fill="url(#sg)"/>` +
      `<g transform="translate(${ix} ${iy}) scale(${icon / 1024})">${V.rounded()}</g>` +
      `<g transform="translate(${tx} ${cy - 18}) scale(${s})"><path d="${wm.d}" fill="${BRAND.paper}"/></g>` +
      `<g transform="translate(${tx + 2} ${cy + 46}) scale(${Math.min(1, (W - tx - W * 0.06) / tg.width) * 0.98})"><path d="${tg.d}" fill="#b5b2ab"/></g>` +
      `<g transform="translate(${tx + 2} ${cy + 108})"><path d="${lb.d}" fill="${BRAND.accent}"/></g>`,
    `0 0 ${W} ${H}`,
  );
};

// ── Rasterize and containers
/** @param {string} source @param {number} w @param {number} [h] */
function png(source, w, h = w, background) {
  const r = new Resvg(source, {
    fitTo: { mode: 'width', value: w },
    ...(background ? { background } : {}),
    font: { loadSystemFonts: false },
  });
  const out = r.render();
  if (out.width !== w || out.height !== h)
    throw new Error(`size mismatch ${out.width}x${out.height} != ${w}x${h}`);
  return out.asPng();
}
/** CRC-32 (PNG chunk checksums). */
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** Opaque RGB PNG (no alpha channel), as App Store icons require. */
function opaquePng(source, size, background) {
  const r = new Resvg(source, {
    fitTo: { mode: 'width', value: size },
    background,
    font: { loadSystemFonts: false },
  }).render();
  const px = r.pixels;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = px[i];
      raw[o + 1] = px[i + 1];
      raw[o + 2] = px[i + 2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const iconPng = (size, variant = size <= 32 ? V.small : V.rounded) => png(svg(variant()), size);

/** Windows .ico with PNG-compressed entries (Vista+). */
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, data }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, o);
    head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...entries.map((e) => e.data)]);
}

/** macOS .icns with PNG entries. */
const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
];
function icns(render) {
  const chunks = ICNS_TYPES.map(([type, size]) => {
    const data = render(size);
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([h, data]);
  });
  const body = Buffer.concat(chunks);
  const h = Buffer.alloc(8);
  h.write('icns', 0, 'ascii');
  h.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([h, body]);
}
const ICONSET = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

// ── Write
const written = [];
const write = (rel, data) => {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  written.push(rel);
};
const fresh = (rel) => rmSync(join(ROOT, rel), { recursive: true, force: true });

const macRender = (s) => (s <= 32 ? iconPng(s) : png(svg(V.mac()), s));

// Brand masters
write('assets/brand/icon.svg', svg(V.rounded()));
for (const s of [16, 32, 64, 128, 256, 512, 1024]) write(`assets/brand/icon-${s}.png`, iconPng(s));
write(
  'assets/brand/icon.ico',
  ico([16, 20, 24, 32, 40, 48, 64, 96, 128, 256].map((size) => ({ size, data: iconPng(size) }))),
);
write('assets/brand/icon.icns', icns(macRender));
write('assets/brand/social-preview.png', png(social(1280, 640), 1280, 640));
write('assets/brand/og-image.png', png(social(1200, 630), 1200, 630));

// Web / PWA (apps/demo/public)
const pub = 'apps/demo/public';
write(`${pub}/favicon.svg`, svg(V.small()));
write(`${pub}/favicon.ico`, ico([16, 32, 48].map((size) => ({ size, data: iconPng(size) }))));
write(`${pub}/favicon-16.png`, iconPng(16));
write(`${pub}/favicon-32.png`, iconPng(32));
write(`${pub}/apple-touch-icon.png`, opaquePng(svg(V.square()), 180, BRAND.tile));
write(`${pub}/icon-192.png`, iconPng(192));
write(`${pub}/icon-512.png`, iconPng(512));
write(`${pub}/icon-maskable-192.png`, png(svg(V.square(0.86)), 192));
write(`${pub}/icon-maskable-512.png`, png(svg(V.square(0.86)), 512));
write(`${pub}/icon-256.png`, iconPng(256));
write(`${pub}/logo-64.png`, iconPng(64));
write(`${pub}/og-image.png`, png(social(1200, 630), 1200, 630));
write(
  `${pub}/manifest.webmanifest`,
  `${JSON.stringify(
    {
      name: 'Lucid Sentence',
      short_name: 'Sentence',
      description: 'A .docx-only word processor with Word’s ribbon.',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'any',
      background_color: BRAND.canvasLight,
      theme_color: BRAND.accentLight,
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      ],
    },
    null,
    2,
  )}\n`,
);

// Desktop: Windows (.ico + MSIX/Store tiles), macOS (.icns + iconset), Linux (hicolor)
const win = 'apps/desktop/icons/windows';
fresh(win);
write(
  `${win}/lucid-sentence.ico`,
  ico([16, 20, 24, 32, 40, 48, 64, 96, 128, 256].map((size) => ({ size, data: iconPng(size) }))),
);
const tile = (name, w, h, k) => {
  // Plated tiles: transparent canvas, icon centered at k of the shorter side.
  const short = Math.min(w, h);
  const s = Math.round(short * k);
  return png(
    svg(
      `<g transform="translate(${(w - s) / 2} ${(h - s) / 2}) scale(${s / 1024})">${(s <= 32 ? V.small : V.rounded)()}</g>`,
      `0 0 ${w} ${h}`,
    ),
    w,
    h,
  );
};
for (const scale of [100, 125, 150, 200, 400]) {
  const f = scale / 100;
  const r = (n) => Math.round(n * f);
  write(`${win}/msix/Square44x44Logo.scale-${scale}.png`, tile('', r(44), r(44), 1));
  write(`${win}/msix/Square71x71Logo.scale-${scale}.png`, tile('', r(71), r(71), 0.62));
  write(`${win}/msix/Square150x150Logo.scale-${scale}.png`, tile('', r(150), r(150), 0.56));
  write(`${win}/msix/Square310x310Logo.scale-${scale}.png`, tile('', r(310), r(310), 0.5));
  write(`${win}/msix/Wide310x150Logo.scale-${scale}.png`, tile('', r(310), r(150), 0.56));
  write(`${win}/msix/StoreLogo.scale-${scale}.png`, tile('', r(50), r(50), 1));
  write(`${win}/msix/SplashScreen.scale-${scale}.png`, tile('', r(620), r(300), 0.5));
}
for (const t of [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256]) {
  write(`${win}/msix/Square44x44Logo.targetsize-${t}.png`, iconPng(t));
  write(`${win}/msix/Square44x44Logo.targetsize-${t}_altform-unplated.png`, iconPng(t));
  write(`${win}/msix/Square44x44Logo.targetsize-${t}_altform-lightunplated.png`, iconPng(t));
}

const mac = 'apps/desktop/icons/macos';
fresh(mac);
write(`${mac}/LucidSentence.icns`, icns(macRender));
for (const [name, s] of ICONSET) write(`${mac}/LucidSentence.iconset/${name}`, macRender(s));

const linux = 'apps/desktop/icons/linux/hicolor';
fresh(linux);
for (const s of [16, 22, 24, 32, 48, 64, 128, 256, 512])
  write(`${linux}/${s}x${s}/apps/lucid-sentence.png`, iconPng(s));
write(`${linux}/scalable/apps/lucid-sentence.svg`, svg(V.rounded()));
for (const s of [16, 32, 48, 64, 128, 256]) {
  write(
    `${linux}/${s}x${s}/mimetypes/application-vnd.openxmlformats-officedocument.wordprocessingml.document.png`,
    png(svg(s <= 32 ? docIconSmall() : docIcon()), s),
  );
}

// .docx document icon (file association)
const docx = 'apps/desktop/icons/docx';
fresh(docx);
const docRender = (s) => png(svg(s <= 32 ? docIconSmall() : docIcon()), s);
write(`${docx}/docx.svg`, svg(docIcon()));
for (const s of [16, 32, 48, 64, 128, 256, 512]) write(`${docx}/docx-${s}.png`, docRender(s));
write(
  `${docx}/docx.ico`,
  ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: docRender(size) }))),
);
write(`${docx}/docx.icns`, icns(docRender));

// Android: adaptive icon (foreground, background, monochrome) + legacy + Play Store
const android = 'apps/mobile/android-res';
fresh(android);
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, f] of Object.entries(DENSITY)) {
  const layer = Math.round(108 * f);
  const legacy = Math.round(48 * f);
  write(`${android}/mipmap-${d}/ic_launcher_foreground.png`, png(svg(V.fg()), layer));
  write(`${android}/mipmap-${d}/ic_launcher_background.png`, png(svg(V.bg()), layer));
  write(`${android}/mipmap-${d}/ic_launcher_monochrome.png`, png(svg(V.mono()), layer));
  write(`${android}/mipmap-${d}/ic_launcher.png`, png(svg(V.padded(0.84)), legacy));
  write(`${android}/mipmap-${d}/ic_launcher_round.png`, png(svg(scaled(0.92, V.round())), legacy));
}
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;
write(`${android}/mipmap-anydpi-v26/ic_launcher.xml`, adaptive);
write(`${android}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptive);
write(
  `${android}/values/ic_launcher_colors.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND.tile}</color>\n</resources>\n`,
);
write(`${android}/playstore-icon-512.png`, png(svg(V.square()), 512));

// iOS / iPadOS: single-size (Xcode 14+) and an all-sizes set for older projects
const ios = 'apps/mobile/ios-res';
fresh(ios);
const opaque = (s) => opaquePng(svg(V.square()), s, BRAND.tile);
write(`${ios}/AppIcon.appiconset/AppIcon-1024.png`, opaque(1024));
write(
  `${ios}/AppIcon.appiconset/Contents.json`,
  `${JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
);
export const IOS_ALL_SIZES = [
  ['iphone', 20, 2],
  ['iphone', 20, 3],
  ['iphone', 29, 2],
  ['iphone', 29, 3],
  ['iphone', 40, 2],
  ['iphone', 40, 3],
  ['iphone', 60, 2],
  ['iphone', 60, 3],
  ['ipad', 20, 1],
  ['ipad', 20, 2],
  ['ipad', 29, 1],
  ['ipad', 29, 2],
  ['ipad', 40, 1],
  ['ipad', 40, 2],
  ['ipad', 76, 1],
  ['ipad', 76, 2],
  ['ipad', 83.5, 2],
  ['ios-marketing', 1024, 1],
];
const images = IOS_ALL_SIZES.map(([idiom, pt, scale]) => {
  const px = Math.round(Number(pt) * Number(scale));
  const filename = `AppIcon-${pt}@${scale}x.png`;
  write(`${ios}/AppIcon-AllSizes.appiconset/${filename}`, opaque(px));
  return { filename, idiom, scale: `${scale}x`, size: `${pt}x${pt}` };
});
write(
  `${ios}/AppIcon-AllSizes.appiconset/Contents.json`,
  `${JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
);

// Inventory of generated PNGs and their pixel sizes (checked by scripts/test/icons.test.ts).
const inventory = Object.fromEntries(
  written
    .filter((w) => w.endsWith('.png'))
    .sort()
    .map((w) => {
      const b = readFileSync(join(ROOT, w));
      return [w, `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`];
    }),
);
writeFileSync(join(ROOT, 'scripts/icons-manifest.json'), `${JSON.stringify(inventory, null, 2)}\n`);

// Contact sheet (optional, for review)
const sheetArg = process.argv.indexOf('--contact-sheet');
if (sheetArg > 0) {
  const out = process.argv[sheetArg + 1];
  if (!out) throw new Error('--contact-sheet needs a path');
  const cells = [
    ['App icon', svg(V.rounded()), 1024, 1024],
    ['macOS', svg(V.mac()), 1024, 1024],
    ['iOS (opaque)', svg(V.square()), 1024, 1024],
    ['PWA maskable', svg(V.square(0.86)), 1024, 1024],
    [
      'Android fg',
      svg(
        `<rect width="1024" height="1024" fill="#d6d2c8"/><circle cx="512" cy="512" r="313" fill="none" stroke="#c0392b" stroke-width="4" stroke-dasharray="12 10"/>${V.fg()}`,
      ),
      1024,
      1024,
    ],
    [
      'Android mono',
      svg(`<rect width="1024" height="1024" fill="#2b3a3d"/>${V.mono()}`),
      1024,
      1024,
    ],
    ['Android round', svg(scaled(0.92, V.round())), 1024, 1024],
    ['.docx', svg(docIcon()), 1024, 1024],
  ];
  const C = 300;
  const pad = 40;
  const labelH = 40;
  const cols = 4;
  const rows = Math.ceil(cells.length / cols);
  const smalls = [16, 24, 32, 48, 64];
  const smallRow = 3 * (smalls.reduce((a, s) => a + s * 2 + 18, 0) + 30);
  const W = Math.max(pad + cols * (C + pad), smallRow + pad * 2);
  const H = pad + 70 + rows * (C + labelH + pad) + 210;
  const dataUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  let body = `<rect width="${W}" height="${H}" fill="${BRAND.canvasLight}"/><g transform="translate(${pad} ${pad + 34}) scale(0.34)"><path d="${TEXT.wordmark.d}" fill="#1a1916"/></g>`;
  cells.forEach(([label, src, w], i) => {
    const x = pad + (i % cols) * (C + pad);
    const y = pad + 70 + Math.floor(i / cols) * (C + labelH + pad);
    body += `<rect x="${x - 8}" y="${y - 8}" width="${C + 16}" height="${C + 16}" rx="18" fill="#ffffff" fill-opacity="0.55"/>`;
    body += `<image x="${x}" y="${y}" width="${C}" height="${C}" href="${dataUri(png(src, Number(w)))}"/>`;
    body += `<g transform="translate(${x} ${y + C + 28})"><path d="${labelPath(label)}" fill="#55524b"/></g>`;
  });
  const sy = pad + 70 + rows * (C + labelH + pad);
  let sx = pad;
  for (const bg of [BRAND.canvasLight, '#ffffff', '#1e1e1e']) {
    body += `<rect x="${sx - 10}" y="${sy - 10}" width="${smalls.reduce((a, s) => a + s * 2 + 18, 0) + 10}" height="${64 * 2 + 20}" rx="14" fill="${bg}"/>`;
    for (const s of smalls) {
      body += `<image x="${sx}" y="${sy + (128 - s * 2) / 2}" width="${s * 2}" height="${s * 2}" style="image-rendering:pixelated" href="${dataUri(iconPng(s))}"/>`;
      sx += s * 2 + 18;
    }
    sx += 30;
  }
  body += `<g transform="translate(${pad} ${sy + 170})"><path d="${labelPath('16 · 24 · 32 · 48 · 64 px at 2× (pixelated) on light, white and dark')}" fill="#55524b"/></g>`;
  writeFileSync(out, png(svg(body, `0 0 ${W} ${H}`), W, H));
  console.log(`contact sheet → ${out}`);
}

/** Labels for the contact sheet: reuse the mono label glyph shapes when possible. */
function labelPath(text) {
  // Simple, dependency-free label: draw text as small rounded bars when glyphs are unavailable.
  return TEXT.labels?.[text] ?? '';
}

console.log(`wrote ${written.length} files`);
for (const dir of new Set(written.map((w) => w.split('/').slice(0, 3).join('/'))))
  console.log(`  ${relative(ROOT, join(ROOT, dir))}`);
