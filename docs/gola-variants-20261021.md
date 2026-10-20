# Gola variants — 2026-10-21

The 13 supplied Gola FR3D sources use the existing lower cabinet catalogue:
- One door: standard/Gola L, shelf/sink, left/right.
- Two doors: standard/Gola L, shelf/sink.
- Drawers: standard/Gola II, ball-bearing/AQ LineBox/Slimbox, supported two/three/inner combinations.

There are still only three catalogue cards for these families. Ordinary ball-bearing drawers and all existing source identities remain supported. Unsupported combinations are disabled, never substituted. Changing a source is undoable; project identity, position, dimensions and compatible material assignments are retained.

## Updated AQ three-drawer source

The user replaced `НМРШ3-600.З.С 3мм Гвозди. Ящик AQ LineBox.Gola II(1).fr3d` before deployment with revision `(2).fr3d`.

Current SHA-256: `99f651b86d4dc7b965e7682a7e4e7eb57912ff9e604bf93dabe768a7fc8519f3`.

At the native 600 × 820 × 510 mm size (720 mm carcass, 100 mm legs), the fronts are **329 / 163 / 163 mm**. The replaced revision had 329 / 162.5 / 162.5 mm. Only the two upper front dimensions and the upper front position changed; panels, hardware, elastic rules and profiles otherwise match. The replaced source is not exposed as another choice.

All current three-front Gola sources now have 329 / 163 / 163 mm fronts. Two-front and two-plus-inner sources have 329 / 329 mm fronts. Door fronts are 688.5 mm high.

## Geometry and purchasing

`scripts/build-gola-variants.py` reads native panel transformations, line/arc contours, source SHA, elastic planes, cached drawer kits, profile contours and purchasing entries. Run against the supplied upload directory, including AQ revision (2).

Side Gola cutouts and L/C profiles are meshes, not rectangular substitutes. Profile AKS 60965 (L) and 60966 (C) quantities use metres and the actual module width; 5.5 m stock is not charged as one whole bar per module. Mount 118236: two per profile.

Metal drawer bottoms/rears remain 16 mm; ball-bearing drawer walls remain 18 mm with 3 mm bottoms. Missing or conflicting cached kits prevent unsupported dimensions instead of stretching hardware.

Known source issue: the three Gola L shelf cabinets contain two coincident shelves of 510 and 509 mm depth. Both are preserved in cutlists. The card and specification flag the overlap for correction in BAZIS before manufacture.

The current downloadable importer is `Martin_Forest_Import_v9_9_0_GOLA.js`; the served file is byte-identical. Exact source SHA matching and 16 mm material protection include the corrected AQ source. BAZIS itself has not been executed in this environment.

## Verification

- 80 JavaScript tests: native geometry, original drawer/upper regressions, catalogue grouping, all source transitions, 16 mm materials, actual JSON export and importer checks.
- 69 Python tests: saved-project validation, exact source normalization, profile purchasing, JS/Python constraints and hardware parity, PDF text for all sources, served assets, original drawer/upper regressions.
- Browser visual QA blocked by managed preview infrastructure (`net::ERR_BLOCKED_BY_CLIENT` at the allowed preview URL); no browser result is claimed.
- No production orders, database writes or Telegram messages were used for testing.
