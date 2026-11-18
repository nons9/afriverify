# AfriVerify brand identity (v1)

**Tagline:** Verify once. Trusted everywhere.

## The mark
Three corner brackets are the **live-scan viewfinder** (AfriVerify confirms a real person is present).
The fourth corner is left open: the **check mark's long arm runs at exactly 45° into it**, so verification
completes the frame. One compact square, built from a 12-unit stroke and 45° angles on a 100-unit grid
(brackets: 32-unit arms; check vertex at 34,66).

Everything is outlined filled shapes (no strokes, no clip-paths, no font dependency).

## Files
| Path | Use |
|---|---|
| `svg/logo-horizontal-{dark,light,mono-black,mono-white}.svg` | Primary lockup (nav bars, emails, docs) |
| `svg/logo-stacked-*.svg` | Square-ish spaces, covers, login screens |
| `svg/mark-*.svg` | Mark alone (>= 24 px) |
| `svg/app-icon.svg`, `svg/favicon.svg` | Icon tile (home screen, favicon, < 24 px) |
| `png/` | Raster exports: app icons 512/192/180/48/32/16, `favicon.ico`, logo PNGs (transparent), `og-image-1200x630.png` |
| `svg/pattern-chevron-tile.svg` | 45° chevron weave for backgrounds (textile-inspired) |
| `svg/africa-silhouette-*.svg` | Accurate continent silhouette (Natural Earth data, simplified) for supporting graphics |
| `brand-board.png` | One-page overview |
| `source/generate.py` | Regenerates every SVG (needs `fonttools` + the Bricolage `.woff` files) |

## Colour
| Name | Hex | Role | Contrast |
|---|---|---|---|
| Sankofa Gold | `#C9960E` | Frame, "Verify", accents (on dark) | 7.35:1 on Ink |
| Ivory | `#EDE0C8` | Check, "Afri", text on dark | 15.07:1 on Ink |
| Ink | `#0D0B08` | Primary background | |
| Soft Ink | `#1A1612` | Cards; text on light | 17.99:1 on white |
| Deep Gold | `#8A6508` | Gold on **light** backgrounds | 5.32:1 on white |

Do **not** put `#C9960E` text/marks on white: only 2.67:1 (fails WCAG AA). Use Deep Gold.

## Typography
Wordmark: **Bricolage Grotesque** - Light "Afri" + ExtraBold "Verify" (already used in the product nav). Shipped as outlines.
UI/body: Inter.

## Usage
- **Clear space:** one bracket arm (0.32 x mark height) on every side, minimum.
- **Minimum size:** horizontal lockup 112 px wide / 30 mm print; mark alone 16 px (use the icon tile below 24 px).
- **Do:** keep the mark square, whole and un-rotated; gold + ivory on dark, deep gold + ink on light; mono where one colour is all you have.
- **Don't:** stretch or recolour the check/frame; re-set the wordmark in another font; add shadows/outlines/gradients; use `#C9960E` on white; redraw the check at another angle.

## Licensing / provenance
- Bricolage Grotesque: SIL Open Font License.
- Continent silhouette: Natural Earth (public domain), simplified.
- The mark is original work for this project. **No trademark or design clearance search has been done.**
  Scan-frame + check icons are common; run a search in the classes/countries you operate in before registering.

## Not yet applied to the product
The web app (`web/components/logo.tsx`) still uses the previous logo, and `web/public/manifest.json`
references `/icons/icon-192.png` and `/icons/icon-512.png`, which do not exist in the repo.
To adopt: copy `png/app-icon-{192,512}.png` to `web/public/icons/`, `favicon.ico` + `svg/favicon.svg` to `web/app/`,
and swap `AfriVerifyMark`/`AfriVerifyLogo` to the new SVGs.
