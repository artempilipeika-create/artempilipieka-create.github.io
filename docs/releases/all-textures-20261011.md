# Full texture collection and importer v9.7

The user supplied all 11 collector archives and summary.json after explicitly
authorizing material integration and isolated staging updates. Base commit:
49b2cd0e30ded19903416ba9f2723383f34ffcaf. Production/order/database flows unchanged.

## Evidence and result

- 1315 inventory paths accounted for: 924 newly packed images and 391 previous
  originals. Zero scan errors or image decode/hash failures. Original file sizes
  total 12,924,212,862 bytes. Web copies retain original path, size and SHA-256.
- Same-brand full decor/finish matching supports approved Extravert stock prefixes,
  thickness suffixes and Latin/Cyrillic lookalikes in codes. No fuzzy matching,
  finish merging or automatic Ultradecor/Kronospan equivalence.
- 617 additional site attachments: 577 textures and 40 user sample previews.
  Snapshot coverage: 1250 USER_TEXTURE, 40 USER_PREVIEW, 113 OFFICIAL_PREVIEW,
  4 EXACT_TEXTURE, 697 MISSING_VISUAL. Catalogue snapshot remains 2026-09-27;
  runtime identity guards prevent attaching to changed records.
- All 673 existing site attachments and 256 assets are preserved. Added 179 unique
  image assets (64,321,221 bytes) in append-only packs 17–26.
- Reflections/borders on reviewed Senosan/Evogloss samples stay in picker thumbnails.
  3D uses an explicitly approximate median interior colour, never tiles these photos.
  Senosan TX is treated as TopX gloss, distinct from TopMatt; nomenclature cross-check:
  https://www.hranipex.com/en/latest-news/senosan-glass-like-boards/
- Importer v9.7 has 1359 bindings. All 778 previously hash-verified bindings remain
  identical. Approved 816 PO/TM aliases now also verify the original SHA-256:
  524586b58970dd720f423b8273ac7fd4d985facd18c5bbed5eece9aa72f09b89.
  The smaller website image hash is never used to verify the Windows original.
- Photo-only previews do not enter native texture bindings. Optical parts and
  existing BAZIS database resolution behavior are preserved.

## Verification

- Python: 28 material attachment, hash, route, preview, matching and identity tests.
- Node: 9 native binding, original-vs-preview hash, optical and sample rendering tests.
- Chromium/WebGL: D.302.W04, 816 PO, M.100.S02 image decoding, Senosan preview/color
  separation, six optical parts preserved and approximate-colour notice. No browser
  errors and no API writes. Native BAZIS 2025 execution still requires the user's PC.

## Outstanding

Unresolved exact identities, cross-manufacturer folders and distinct images sharing
one code are listed in the delivered offline Materials_Status.html. Do not interpret
all files received as every catalogue variant having a confirmed matching image.
Existing manual shelf-adjustment warnings and production donor requirements remain.
