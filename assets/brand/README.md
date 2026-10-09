# Lucid Sentence brand assets

The Lucid Sentence identity: a dark cyan acrylic tile with a white geometric "S".

| File                            | Use                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `icon-1024.png` … `icon-16.png` | App icon, transparent outside the rounded tile (1024, 512, 256, 128, 64, 32, 16 px) |
| `icon.ico`                      | Windows icon (16, 24, 32, 48, 64, 128, 256 px)                                      |
| `icon.icns`                     | macOS icon (16–512 px, including @2x variants)                                      |
| `banner.png`                    | README banner (1280×720)                                                            |
| `social-preview.png`            | GitHub social preview (1280×640, 2:1)                                               |
| `hero.png`                      | Hero / 3D icon artwork for the website and store listings (1280×720)                |

Accent color matched to the icon (hue ≈ 190°): `#0b7488` on light surfaces
and `#45c3d6` on dark surfaces. The theme tokens are in `packages/ribbon-ui/src/tokens.ts`.

Notes:

- The icon is cut from 1280×720 source art, where the tile is about 640 px
  wide. `icon-1024.png` and the 512@2x `.icns` entry are upscaled, so replace
  them with a vector or higher-resolution master when one exists.
- The tile is slightly wider than tall (639×622 in the source), so the square
  icons have a few pixels of transparent padding at the top and bottom.
- To set the GitHub social preview, upload `social-preview.png` in the
  repository's Settings → General → Social preview.

## License and trademark

These images are **© 2026 Lucid Systems**. The code in this repository is
AGPL-3.0-only, but that license gives **no trademark rights**. The Lucid
Sentence name and logos are **not licensed for use as a mark**. Official builds
use them. Forks and modified redistributions must use their own name and icon
(plan §6.3). Referring to the project by name to describe it is fine. See
[`/NOTICE`](../../NOTICE).
