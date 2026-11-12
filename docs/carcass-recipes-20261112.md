# Rectangular carcasses from the user's blanks

Menu: Каталог → Заготовки → Готовые корпуса. Six families generate independent,
editable blank panels in one undoable transaction. No existing source module is
rewritten. Shelf and inset horizontal panel references use the existing binding
contract; overall recipe dimensions are set before insertion.

## Evidence and intentional boundaries

- `MartinForest_Zhanna_Assembly_Album.pdf`, Library
  `libfile_b4464dbdebec8191a75ed76ed10d3f87`, current version 3, page 35:
  wardrobe M3: side panels 2198.5×577×18; roof and bottom 964×577×18;
  separate HDF 2098×998×3 with no PVC. Side panels include shaped contour edges
  (E5); those exact contours and E-indices must not be inferred for rectangles.
- `MartinForest_Zhanna_Master_Assembly_Album.pdf`, Library
  `libfile_dfd0106dc8c081919a581cccb3df3a04`, page 44: M6 cap 600×350×18,
  PVC on all four edges; bottom 564×310×18; two sides 232×330×18. The new cap
  family reuses the joint arrangement, not the drawer clearances/overhangs.
- `MartinForest_Kitchen_Album_Prototype.pdf`, Library
  `libfile_5340d6c252848191bd6c71b09d2cde15`, pages 12 and 20: sink full-width
  bottom 600×510×18, sides 702×510×18, three vertical rails 80×564×18,
  no shelf/back and no assigned edging. Wall module: 720×317×18 sides,
  564×317×18 roof and bottom. These agree with the current canonical
  `furniture-core.js` productionParts (sink and wall families).
- Lower kitchen: canonical full-width bottom and two horizontal 80 mm rails.
- Six SHA-pinned native FR3D blanks already in the repository retain exact
  code mapping: long1,long2,short1,short2 → contour edges 1,3,0,2.

The new families are parameterized rectangular construction patterns, not exact
production replicas of the named projects. Standard front-edge PVC is an explicit
editable starting policy, not a claim that every model had that edging. Sink
defaults to no PVC, following the source. Each panel has a code selector, actual
orientation labels, finished size and cut size; manually assigned codes survive
dimension edits. Changing the global initial PVC policy explicitly resets overrides.

Back: optional overlay HDF 3 mm, 1 mm perimeter inset, separately assigned material.
Its actual material must be chosen before production export. It adds 3 mm to the
placement envelope. These are recipe settings, not inherited original-project sizes.
No legs, doors, fixings, machined rebates or drawer systems are invented.

## Validation contract

- Both client and API allow 40–1200 mm blank width, or up to 3000 for a vertical
  back panel. Thin 3/4 mm stock is allowed only for unedged vertical back panels.
  Existing cabinet limits remain unchanged.
- Native importer 9.9.9 accepts those same dimensions. The historic
  `tools/bazis_import/Martin_Forest_Import_v9_9_8_BLANKS.js` path stays as a
  compatibility mirror; its content/header is the current importer.
- Recipe tests cover all families and quarter turns, exact envelope, panel
  intersections, odd section widths, thickness changes, manual PVC/cut size,
  references, atomic insertion, undo/redo, source pins and native reconstruction.
- API tests validate generated scene roundtrips and isolated database
  save/reopen/edit. Required full constructor suites are run before staging.
- Native importer execution in the user's BAZIS application is not verified by
  the JavaScript mock reconstruction tests.
