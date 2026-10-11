# User-confirmed Ultradecor textures — v9.8

On 2026-10-12 (Europe/Minsk), the user confirmed that matching files in their
Kronospan folders correspond to the 216 unresolved Ultradecor catalogue variants.
The import is restricted to that reviewed group and requires the complete decor
and finish. The normal matcher still rejects cross-manufacturer assignments.

- 188 variants added to the site and native BAZIS bindings.
- 26 variants still have different candidate images; two have no finish code
  (`K097`, `Бук Бавария 0381`). Both cases remain explicit in the report.
- 151 new image assets in packs 28–41. The 249,756,355-byte collected previews
  occupy 88,135,006 bytes after web encoding. Dimensions and ICC profiles are
  retained. Uniform samples use lossless WebP; other samples use quality 92 only
  if smaller and mean error in each channel is at most 3/255. Otherwise the
  uploaded preview is used. Native bindings always retain the original file
  paths, sizes and SHA-256 values, separately from web-preview hashes.
- Existing catalogue identities, 1295 site bindings, 1360 native bindings and
  packs 01–27 are unchanged. The source supplier mapping is recorded explicitly.

Coverage against the saved 2026-09-27 catalogue: 1600/2104 variants have images;
1548 original-file bindings for BAZIS. The remaining 504 variants comprise 384
without exact full matches, 118 with different candidate images, and two without
a finish code. The portable report contains 28 visual comparison groups.

Validation: 34 Python tests, native importer syntax, all new asset hashes and
image decoding; Chromium WebGL checks for original materials and representative
Ultradecor textures, including a white decor, wood, TIFF-derived image and C509
CB. Six optical parts retain their glass/profile materials. No browser errors,
external requests or API writes. ZIP contents and the searchable HTML report
were verified. The native importer still requires a check on the user's BAZIS PC.
