# Upper cabinet variants — 19 October 2026

The two catalogue cards ВМД1 and ВМД2 now select filling (shelves/dryer), execution (surface handles/handleless/push) and, for ВМД1, left/right hinges. All 18 combinations keep their exact source filename and SHA-256. The six previously deployed handle donors remain present. The twelve new sources use the uploaded corrected D2 handleless files, including their `(1)` suffixes.

The checked registry is `backend/v2/cabinet_assets/planner/upper-variants.json`. Rebuild it from the original uploads with `python scripts/build-upper-variants.py /path/to/uploads`. Source files are read as data; no embedded native script is executed. The shared FR3D reader also supports the existing drawer extraction script.

## Geometry and purchasing

- Source frame: 600 × 720 × 320 mm. Carcass depth: 317 mm; native importer profiles retain the 3 mm rear inset.
- All twelve default panel sizes and world positions are checked against the extracted source contours.
- The 20 mm front inset of the bottom is present only in the supplied right-opening and D2 handleless variants. The left-opening handleless donors retain their full-depth bottom.
- Only the supplied left-opening push donors have 2 mm facade clearance. The other new donors retain their measured zero clearance.
- Purchase rows count physical fittings once, excluding drilling operations and nested components of the dryer kit. Corrected D2 handleless variants have four hinges and no push fittings.
- MOUNT widths 400–900 use source catalogue articles 113270–113275. ВМД1 is limited to 600 mm; dryers use 100 mm width steps.

## Compatibility

Switching execution preserves item identity, dimensions, placement, material choices and designer notes, with one undo entry. Existing source IDs and the six original handle geometries are retained. Saved shelf positions now accept half-millimetres, required for the new native 359.5 mm shelf centers. No database migration or saved-project rewrite is performed.

The existing site shelf rule is retained: one shelf through 850 mm and two above; dryers add one upper shelf above 850 mm. New native FR3D shelf tables are different. For a height other than the supplied 720 mm, the inspector, PDF and native export explicitly request checking shelf count and center heights in BAZIS. The exporter records these marks and the importer preserves the production note. Native BAZIS execution has not been tested in this environment.

The stable importer URL `/account/planner/bazis-drawers-import.js` serves version 9.8.0; the existing tools mirror is kept identical for compatibility. Drawer materials, notes, glass and texture behavior are retained.

## Verification

109 Node checks passed: upper variants, original upper geometry, door families, drawer family/materials/elastic rules, vitrines and core. 26 Python checks passed: schema round trips, asset routes, corrected source hardware and JS/Python purchasing parity across dimensions. Tests use no production orders, messages or database. Browser visual QA was unavailable in this managed environment.

Deploy only the existing `martin-forest-v2-staging` service from branch `mf-upper-variants-20261019`. Previous live commit: `597321e66fc1785d64d42431f8e258f771d83e52` on `mf-drawer-variants-20261015`. Main and production integrations are unchanged.
