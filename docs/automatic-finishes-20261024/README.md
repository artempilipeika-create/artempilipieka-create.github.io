# Automatic plinth and backsplash — 24 October 2026

Existing isolated Martin Forest constructor. Automatic finish entries are persistent settings; geometry is derived from current cabinets, not saved frozen member lists.

- Plinth uses the existing kitchen-run corner join geometry and verified straight FR3D donor for every physical board. End returns meet the back face without overlap. Native board height is leg height minus 3 mm, thickness 18 mm; module dimensions are untouched. Explicit module exclusions, per-module materials and an optional common 18 mm material are supported. Native export and price calculation use the same derived boards.
- Backsplash uses exposed back edges of the actual countertop rectangles, including the corner cabinet behind a perpendicular return. Adjacent stock/material seams merge, real gaps remain. L/U layouts, unequal arms and all four rotations are covered. Bottom follows the top of the countertop; the user controls finish height, kind and material. Skinali is 6 mm, LDSP 16/18, tile 8/10/12.
- Enabling automatic plinth replaces manual row plans in one undoable action, retaining their material assignments on surviving members. Choosing a backsplash type or enabling its automatic mode replaces manual panels with one automatic finish template. Existing manual settings remain readable until the user switches modes.
- Selected cabinet controls can suppress plinth or backsplash independently. Future cabinets are included automatically. Existing wall lighting remains wall-mounted and manually placed. Socket mounting follows the resolved finished face.
- Save/restore, history, scene geometry, project checks, notes and backsplash schedule use the new settings. Automatic backsplash remains visualization only, outside price/cutting/native import, as before.

Validation: 54 targeted Node tests and 37 Python tests passed. Covers add/resize/move/remove/gaps, per-module switches, material boundaries, unequal U arms, every L rotation, non-overlapping plinth boards and source-exact native export, actual mesh rebuilding, socket offsets, history, old manual behavior, API round trips/bounds and allowlisted assets. Syntax, compilation and git whitespace checks passed. The subsequent small schedule/limit change was verified by rerunning 39 affected Node tests.

No database migration, new hosting, production order, external notification or Tripo generation is involved. Browser evidence and deployment details follow after live verification.

## Tall cabinets and vitrines — 25 October 2026

Automatic plinths now include shelf tall cabinets, appliance tall cabinets and Z1 vitrines. The derived plinth strips are grouped by their actual front plane, support height, elevation and material, independently of cabinet height and carcass depth. Tall strips use the existing lower-row setback: the outer plinth face is 69 mm behind the nominal closed facade, including the Z1 frame extension. Existing corner butt joints are retained. Real gaps, height changes, material boundaries and explicit module exclusions remain separate; countertop geometry remains limited to lower cabinets.

In the existing **Цоколь по расстановке** mode, all eligible tall cabinets join automatically, including in saved projects. A selected tall cabinet can enable this mode through **Общий цоколь пеналов и кухни**. Existing manual row settings remain unchanged until that mode is enabled. Tall material assignment now accepts the **Цоколь** material field and the whole-kitchen material scope. Automatic geometry suppresses the former individual front/side plinth meshes, including explicitly excluded sections and catalogue previews. Shared strips remain visible in both lower and tall layer views. Changes to a tall material or source rebuild the shared geometry.

Scene meshes, quantity/area calculations and native export use the same derived plan: one 2400 × 97 × 18 mm board under an aligned 600 mm lower cabinet plus three 600 mm tall cabinets, with no duplicate per-cabinet plinths. Undo/Redo, save/reopen, moving an end cabinet, module exclusions and tall material changes were verified through the local browser with mocked API endpoints. Original source geometry and SHA values are unchanged; native БАЗИС was not executed.

Validation: 100 targeted Node tests passed (including all tall variants, four rotations, Gola, corners, material boundaries, actual mesh construction and pricing) and 31 Python tests passed. Excluded checks require accessory/countertop/wall-panel FR3D binaries absent from this local checkout. An existing unrelated pricing test expects three plinth boards where the previous front-only implementation returns one; the same failure was reproduced with the unchanged HEAD accessories code. The new mixed tall/lower pricing test confirms one physical board and its exact area.

## Live verification

Runtime commit: `66da0f8835412b66e471dbf85d8a211d68ec8060`.
Railway deployment `ab36f0b4-4027-4f76-93ab-1984905b3c7c` reached SUCCESS at 2026-10-24 07:43:30 UTC (10:43 Minsk). Existing service/domain/volume/configuration are unchanged.

Connected Chrome QA used a duplicate of the user's current six-module L kitchen, saved as **Цоколь и скиналь — автоматически**. The original project was preserved. Its two old manual plinth entries had stale/depth-mismatch errors; enabling automatic mode replaced them successfully. Four old overlapping wall-panel entries became one automatic 6 mm skinali. A common W1000 ST9 18 mm material was selected for the plinth.

Real UI resizing of the return cabinet 600 → 800 mm changed the countertop envelope 3600 × 1228 → 3600 × 1428 mm, the return plinth 737 → 937 mm, and the backsplash return 1222 → 1422 mm. Undo restored the 600 mm cabinet and both derived sizes. The per-module backsplash switch removed only the return panel and restored it. The plinth module switch rebuilt the main/return junction and restored it. Explicit save and page reload retained the automatic settings, 3600 / 1222 mm backsplash segments and the selected common material.

Final live screenshot `automatic-kitchen.jpg` shows the actual WebGL client presentation from the left, including the complete L backsplash and recessed plinth. The final tab is left open on this view. Browser warnings/errors after reload and final rendering: none. No production orders or messages were submitted.
