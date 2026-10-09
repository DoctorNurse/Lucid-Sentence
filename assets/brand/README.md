# Lucid Sentence brand assets

The Lucid Sentence identity: a dark cyan acrylic tile with a white geometric "S".

## Source of truth

| File                  | What it is                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/icon.svg`        | Vector master (1024 × 1024): tile, rim and glyph, marked with `<!-- tile:start -->` style comments so the generator can reuse each layer. |
| `src/text-paths.json` | Wordmark, tagline and labels pre-shaped into SVG paths (by `scripts/brand-text.py` with fontTools), so rendering needs no fonts.          |

Every other icon file is generated. Don't edit generated PNGs by hand; edit the
master and run:

```sh
pnpm icons                                  # regenerate everything (deterministic)
pnpm icons --contact-sheet /tmp/sheet.png   # also render a contact sheet of every size
```

`scripts/icons.js` renders with `@resvg/resvg-js` (a build-time dev dependency,
not shipped) and writes opaque or transparent PNGs, `.ico` and `.icns` itself.
`scripts/icons-manifest.json` lists every output with its size, and
`scripts/test/icons.test.ts` checks the set: every inventoried file exists at
its recorded size, the Windows `.ico` carries 16–256 px, the macOS `.icns` and
`.iconset` are complete, every Android density has foreground, background and
monochrome layers, iOS icons are opaque, and the PWA manifest points at real
icons and uses the token colors.

Small sizes (16–32 px) use a separate variant: a flatter tile, tighter corners and
a heavier, larger "S", so the icon stays legible in tabs and title bars.

## Outputs

| Location                            | Contents                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets/brand/`                     | `icon-16.png` … `icon-1024.png`, `icon.svg`, `icon.ico`, `icon.icns`, `social-preview.png` (1280 × 640), `og-image.png` (1200 × 630)              |
| `apps/demo/public/`                 | `favicon.ico`, `favicon.svg`, 16/32 px favicons, `apple-touch-icon.png`, PWA icons (192/512 and maskable), `manifest.webmanifest`, `og-image.png` |
| `apps/desktop/icons/windows/`       | `lucid-sentence.ico` (16–256 px) and MSIX tiles in `msix/` (scales 100–400 plus `targetsize` variants)                                            |
| `apps/desktop/icons/macos/`         | `LucidSentence.icns` and the `.iconset` folder it was built from                                                                                  |
| `apps/desktop/icons/linux/hicolor/` | App icons 16–512 px plus scalable SVG, and `.docx` MIME type icons                                                                                |
| `apps/desktop/icons/docx/`          | `.docx` document icon (SVG, PNG sizes, `.ico`, `.icns`) for file associations                                                                     |
| `apps/mobile/android-res/`          | Adaptive icon (foreground, background, monochrome) for five densities, legacy and round icons, `mipmap-anydpi-v26` XML, Play Store 512            |
| `apps/mobile/ios-res/`              | `AppIcon.appiconset` (single 1024 px, opaque) and `AppIcon-AllSizes.appiconset` (every slot, for older Xcode targets)                             |

Other files:

| File         | Use                                                                         |
| ------------ | --------------------------------------------------------------------------- |
| `banner.png` | README banner (1280 × 720). Older raster art, not generated from the master |
| `hero.png`   | Hero / 3D icon artwork for the website and store listings (1280 × 720)      |

Accent color matched to the icon (hue ≈ 190°): `#0a6a7c` on light surfaces and
`#45c3d6` on dark surfaces; the tile is `#0a4c5a`. Theme tokens are in
`packages/tokens`.

To set the GitHub social preview, upload `social-preview.png` in the repository's
Settings → General → Social preview (this needs the web UI).

## License and trademark

These images are **© 2026 Lucid Systems**. The code in this repository is
AGPL-3.0-only, but that license gives **no trademark rights**. The Lucid
Sentence name and logos are **not licensed for use as a mark**. Official builds
use them. Forks and modified redistributions must use their own name and icon
(plan §6.3). Referring to the project by name to describe it is fine. See
[`/NOTICE`](../../NOTICE).
