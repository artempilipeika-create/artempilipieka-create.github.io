# User textures and native optical materials — 2026-10-11

The uploaded MF_Textures_Part_01–03 archives contain 391 images. Every entry was checked against its manifest size and SHA-256 and decoded successfully. Original image bytes are preserved.

256 unique images add visuals to 673 variants from the verified 2026-09-27 catalogue snapshot. The existing 117 official visuals retain their priority. This is snapshot coverage, not a new catalogue release or a database migration. A lookup requires exact variant ID, material ID, full article, name and dimensions. Stock article prefixes are mapped explicitly; PO and PE are never conflated. The user-selected D.302 W04.png is used for D.302.W04.

The images live in 16 ZIP_STORED bundles. The existing asset route serves only named, hash-addressed image entries from the manifest; the manifest and bundles themselves return 404. The in-process image cache is bounded to eight entries. Prices, production dimensions and material identities remain unchanged. Physical image scale is unconfirmed and explicitly shown as approximate in the scene notice; aspect ratio is preserved.

Seven decor codes remain unassigned because the uploaded alternatives differ: D.325.W04, D.331.W01, D.432.W01, D.508.S01, D.515.W04, D.521.W04 and F.407.F02. Nine variants with catalogue/source manufacturer conflicts are also unassigned. Three uploaded EGGER samples containing captions/borders are not used; their existing official site assets remain.

The standalone v9.5 BAZIS importer is based on the user's working v9.4.3. It preserves optical glass and Z1 parts, and recognises the native 4 mm glass shelves only in the verified vitrine donors. Ordinary 4 mm HDF remains assignable. 778 native variant bindings reference exact local files and verify their SHA-256 before use. Missing or changed files are logged; an unchanged donor texture is cleared when the material changes, while a newly resolved BAZIS database texture is retained. Geometry, elastic transforms and the notes window remain intact.

Validation: 32 Python tests; 45 Node tests, including all 12 vitrine donors and their existing variant/export regressions; real Chromium/WebGL image decoding and material switching with synthetic read-only API responses. The BAZIS desktop runtime is not available here; one fresh-model import must be checked on the user's workstation.

No production orders, messages, material database writes or changes to D:\\pgm are part of this update. Deployment target is the existing isolated martin-forest-v2-staging service only.
