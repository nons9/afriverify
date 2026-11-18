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

## Website implementation (applied)
Defined once in `web/tailwind.config.ts`; resolved by Tailwind, so there are no per-page colour decisions.

| Token | Value | Use |
|---|---|---|
| `ink` | `#0D0B08` | Page background |
| `surface` / `surface-raised` | `#1A1612` / `#2A241B` | Cards, inputs |
| `ivory` | `#EDE0C8` | Body text (15.1:1 on ink) |
| `muted` | `#B8AF9B` | Secondary text (9.0:1) |
| `gold` (500 = `#C9960E`) | scale 50-950 | The one accent: primary buttons, links, focus ring |
| `gold-700` | `#8A6508` | Gold on light backgrounds (5.3:1 on white) |
| `success` / `warning` / `danger` | `#34D399` / `#F59E5B` / `#F87171` | Status only |

Rules: gold buttons use **ink** text (`text-ink`, 7.35:1), never white (2.7:1). Warnings are orange so they never read as "brand".
Dark-first: the site is ink-based; light backgrounds are for documents (certificate, invoices) and use `gold-700`.

The legacy `slate`, `indigo` and `amber` Tailwind scales are re-pointed at these tokens, so existing classes
(`bg-indigo-500`, `text-slate-400`...) already resolve to brand values. New code should use the semantic names.
White-label tenants: `lib/color.ts` picks ink or white text by real contrast, and treats the API's old indigo
default (`#4F46E5`) as "unset" so unbranded tenants get AfriVerify gold.

Verified with axe-core (WCAG colour-contrast) on public, certificate, hosted-verification and dashboard pages.
Regenerate brand geometry for the site with:
`python3 brand/source/generate.py --ts web/lib/brand-paths.ts`
