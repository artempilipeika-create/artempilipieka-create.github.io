# Standard НМД2-600 source repair — 2026-10-24

The stable card `bazis.3079d0656398` expected production donor SHA
`7d6feef0bc55a52460670eaa9f738c2e9764edd947d52ca4269053fd5fed6d29`.
The user supplied `НМД2-600.(2).fr3d`, 1,517,534 bytes, SHA
`a659d5e7a0da816ef74206ec86c76e09fa3a3c728a7247b80be9bac507b689d2`.
A filename change alone cannot resolve a different hash.

The reviewed source has frame 600 × 820 × 510, 720 mm body and 100 mm legs,
two 297 × 717 × 18 facades, one shelf, nine board panels. Read-only inspection
used `scripts/fr3d_reader.py`; the measured panel bounds are preserved in
`tests/fixtures/nmd2-600-20261024.json`. No embedded native scripts executed.
The source bytes were hashed before and after inspection and resolution: unchanged.
The frontend matches all nine measured bounds, including facade clearance 0 and
rear-aligned shelf. These two geometry settings apply only to this reviewed donor.

The browser scene normalizer, exporter, API read/save projection and standalone
importer 9.9.3 canonicalize only the reviewed old production SHA (and current
filename) for this stable ID. Names, placement, dimensions, materials and notes
remain intact. The older 720 × 560 donor `d79434…`, unknown hashes and other
variants are not migrated. The resolver still requires exact source bytes and
finds the original recursively regardless of renaming. No hash bypass was added.

Validation:
- 60 Node tests passed: measured source, saved scene, actual exporter, strict
  resolver, upper revisions, Gola, door families and accessories.
- 21 native importer regression tests passed: placement, materials, glass, textures.
- 56 Python tests passed across source, upper, Gola and furniture heights.
- Three pre-existing height tests fail because they request rearServiceGapMm=60
  while the existing schema accepts only 50. Re-executed with HEAD's original
  three_d_api.py: exactly the same 3 failures and 11 passes. Unrelated to this fix.
- The actual uploaded FR3D resolved successfully from both previous and new SHA
  inputs; wrong same-name data is rejected by automated tests.
- Native BAZIS execution on the user's Windows PC remains unverified.

Installer: `tools/bazis_import/Martin_Forest_Import_v9_9_3_NMD2.zip` contains
one JS and instructions; original user FR3D is not redistributed.

Live verification:
- Runtime commit `30144e697734b37046f0ee2c86b4818be8bf94ee`.
- Railway deployment `37f41393-b781-4f5f-b263-219f3b0a4b9c`: SUCCESS
  at 2026-10-24 08:25:53 UTC (11:25 Minsk), existing isolated service only.
- In Chrome, created a separate project “НМД2-600 — проверка выгрузки”, added
  the standard two-door storage cabinet. Its visible source is now
  `НМД2-600.(2).fr3d`, with 600 × 820 × 510 dimensions and 720 mm body.
- The real Export BAZIS button reported one module and one worktop prepared.
- Screenshot: [nmd2-export.jpg](nmd2-export.jpg). Existing kitchen projects
  were not edited. The native Windows BAZIS run remains unverified.
