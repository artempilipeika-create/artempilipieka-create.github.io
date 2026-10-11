# Automatic countertops · 2026-10-11

Countertops derive from verified native lower cabinets. The first cabinet creates a top; adjoining cabinets extend it. Corner returns determine left/right/U layouts. A designer selects ordinary or euro joints for the kitchen; future cabinets inherit that choice. A per-cabinet switch creates an actual gap while retaining the configured thickness for re-enabling. Body and leg heights retain their existing meaning; the countertop adds its thickness above the module envelope.

Seven original FR3D donors and previews are included in `backend/v2/cabinet_assets/planner/countertop-sources/`. The manifest records exact hashes, dimensions, elastic planes and panel contours. The corrected ordinary-left donor ends in `(1).fr3d`. Euro-joint contours come from those donors, including their fixed radius. Cabinet moves, dimensions, undo/redo, save/restore and material selection all use the derived geometry.

Pricing adds one operation per actual corner joint, with separate `operation:countertop-standard` and `operation:countertop-euro` rate keys (unit `joint`, currency `BYN`, integer minor units). No rates are invented. Existing sheet pricing remains based on rectangular blank dimensions.

## Native export boundary

Supported native layouts at 600 mm strip depth and 38 mm thickness are included in `.mf-bazis.json` as additional native items, with exact source hashes and placement. Straight stock lengths over 4100 mm export separate pieces. Source files must be present in the operator's native fragment folder as usual.

The original U donor's global elasticity changes both arms together. Unequal U arms render with their individual lengths, but the entire native U donor is not automatically imported in this case. Their dimensions, contours and a specific adjustment note remain in `kitchen_production` and the project note. The same explicit adjustment path covers nonstandard depth/thickness, fragmented corner layouts and mixed-material corner assemblies. No stretched donor is presented as exact when its elasticity cannot represent the requested geometry.

The existing BAZIS importer is unchanged. JSON export is verified; executing imports in the desktop BAZIS application requires that runtime and has not been performed here.

## Verification

- `node --test tests/webgl/*.test.mjs`
- `python -m pytest tests/test_countertops.py tests/test_vitrine.py -q`
- `python scripts/verify-countertops-browser.py [BASE_URL]` (optional `MF_TEST_BROWSER`, `MF_TEST_OUTPUT`)

The browser check intercepts all application APIs and uses a synthetic project. It checks WebGL, placement, choice inheritance, per-module off/on, undo/redo, saved payload, native export, and desktop/mobile layout. It never creates orders or sends messages.
