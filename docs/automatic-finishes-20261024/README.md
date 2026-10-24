# Automatic plinth and backsplash — 24 October 2026

Existing isolated Martin Forest constructor. Automatic finish entries are persistent settings; geometry is derived from current cabinets, not saved frozen member lists.

- Plinth uses the existing kitchen-run corner join geometry and verified straight FR3D donor for every physical board. End returns meet the back face without overlap. Native board height is leg height minus 3 mm, thickness 18 mm; module dimensions are untouched. Explicit module exclusions, per-module materials and an optional common 18 mm material are supported. Native export and price calculation use the same derived boards.
- Backsplash uses exposed back edges of the actual countertop rectangles, including the corner cabinet behind a perpendicular return. Adjacent stock/material seams merge, real gaps remain. L/U layouts, unequal arms and all four rotations are covered. Bottom follows the top of the countertop; the user controls finish height, kind and material. Skinali is 6 mm, LDSP 16/18, tile 8/10/12.
- Enabling automatic plinth replaces manual row plans in one undoable action, retaining their material assignments on surviving members. Choosing a backsplash type or enabling its automatic mode replaces manual panels with one automatic finish template. Existing manual settings remain readable until the user switches modes.
- Selected cabinet controls can suppress plinth or backsplash independently. Future cabinets are included automatically. Existing wall lighting remains wall-mounted and manually placed. Socket mounting follows the resolved finished face.
- Save/restore, history, scene geometry, project checks, notes and backsplash schedule use the new settings. Automatic backsplash remains visualization only, outside price/cutting/native import, as before.

Validation: 54 targeted Node tests and 37 Python tests passed. Covers add/resize/move/remove/gaps, per-module switches, material boundaries, unequal U arms, every L rotation, non-overlapping plinth boards and source-exact native export, actual mesh rebuilding, socket offsets, history, old manual behavior, API round trips/bounds and allowlisted assets. Syntax, compilation and git whitespace checks passed. The subsequent small schedule/limit change was verified by rerunning 39 affected Node tests.

No database migration, new hosting, production order, external notification or Tripo generation is involved. Browser evidence and deployment details follow after live verification.
