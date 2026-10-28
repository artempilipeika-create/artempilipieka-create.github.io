# Native Gola and mounting rail repair, importer 9.9.7

The user reported that widened cabinets import with a 600 mm Gola extrusion and
one upper mounting rail piece loses its position. The supplied 9.9.6 diagnostic
loaded all 13 modules but only checked the outer elastic frame, not individual
extrusions. Consequently a correct 800 mm frame did not establish a correct
profile. The existing eight missing drawer-material reports are independent of
this repair; the importer continues to preserve the original drawer material.

Three exact original FR3D files were inspected as data, without running embedded
code. Their hashes match the export diagnostics and catalogue. The geometry-only
fixture is tests/webgl/fixtures/native-profile-anchors.json; private native files
remain outside the public repository.

- НМД2-600.Мойка.Gola L(1).fr3d: Gola is an extrusion with signed Thickness -600,
  local extrusion axis pointing toward negative cabinet X, and actual span X=0..600.
- Both corrected D2 handleless upper sources: the mount assembly contains two
  separate extrusions of signed Thickness -50. Their measured X extents are
  2..52 and 548..598 mm. They are short mounting pieces, not a continuous rail.

The new importer snapshots selected native profile poses before elastic resizing
and repairs them after the resize/build/material stage. Gola L/C retain their
native section, material, signed direction and Y/Z elasticity while their length
and X anchor follow the cabinet width. The source registry covers all 46 current
Gola-bearing source hashes. Upper mounting pieces keep their 50 mm lengths and
source offsets from the left/right side, top and rear. Nested native transforms
are converted through ToGlobal/ToObject, so neither parent offsets nor scene
rotations are mistaken for local profile coordinates. Unrelated hinge extrusions,
glass and unknown source identities are excluded. Unsupported shapes fail visibly.

Checks run before placement and again after CommitCurrentChanges. The diagnostic
now records profileChecks/profileErrors, actual/expected lengths and root-local
positions. A post-commit mismatch produces an import-with-errors message. This
does not claim disk persistence: saving, closing and reopening B3D still require
checking in the user's Windows BAZIS environment.

API definitions were checked against the official BAZIS scripting reference:
https://cdn.bazissoft.ru/documentation/ru/BAZIS-Script_functions.html
TCustomExtrusionBody.Thickness, TObject3D.Build/ToGlobal/ToObject/TranslateGCS and
objectTypeChecker.ObjectIsExtrusionBody. No new profile or replacement FR3D is made.

Implementation source: tools/bazis_import/profile-repair.js. Regenerate the
standalone download and versioned mirror with scripts/build-native-profile-repair.py.
Historical importer versions are retained unchanged. Constructor links now name
and download version 9.9.7, avoiding the previous stale 9.9.5/9.9.6 labels.

Validation: all 745 JavaScript tests passed, including 19 profile checks, including signed/mirrored profiles, widening,
shrinking, native-offset frames, simultaneous L/C profiles, arbitrary rotations,
unchanged sections, ignored unrelated objects, failed writes and post-commit drift.
484 Python tests passed; 37 database checks are run by CI with disposable PostgreSQL.
Native execution in BAZIS and save-close-reopen are not available here.

## Installation

Download Martin_Forest_Import_v9_9_7_NATIVE_PROFILES.js. Keep a backup of the previous
script outside the BAZIS Scripts folder and replace the single active importer.
Export the kitchen again and run the importer in a new empty unsaved model. Check
Gola on a widened cabinet and the two upper mount pieces; save as a new B3D and
reopen it. Existing saved B3D models are not modified by downloading this update.
