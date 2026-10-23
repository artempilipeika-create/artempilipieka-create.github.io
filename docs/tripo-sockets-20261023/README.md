# Tripo room sockets — preparation, 2026-10-23

Status: placement editor prepared and unit checked; NOT deployed. The generated mesh is still in Tripo / the user's browser downloads and has not reached this checkout. Do not claim integration is complete or bill for another generation.

- Tripo Studio task: `092f8fb2-22f5-43e0-be1e-740d633766b3`
- URL: https://studio.tripo3d.ai/ru/workspace/generate/092f8fb2-22f5-43e0-be1e-740d633766b3
- Asset title: `schuko outlet 3d model`
- Model: H3.1 (max quality), one text-to-model generation.
- Studio balance 3180 before / 3125 after: 55 credits total. No remesh, reroll or other paid action.
- Successful GLB export toast observed; export attempted with names `schuko outlet 3d model` and `martin-forest-socket-tripo`. Browser download event timed out, so local filename/path cannot be confirmed.
- Generated mesh: 1,947,155 triangles / 1,007,641 vertices. Needs offline simplification before shipping.
- Preview: `tripo-outlet.jpg`, captured from the finished Studio viewport.

Prepared UI adds/removes individually positioned sockets in Room settings. Existing `room.features` data and project history/save schema are used. All four walls, bottom-edge elevation, frame width/height, projection and corner offset are editable. Defaults 86 x 86 x 12 mm are visual placeholders, not certified manufacturer dimensions or an installation recommendation. Other room features are retained. Explicit legacy survey flags are reconciled without claiming a full survey.

Validation: `node --test tests/webgl/room-plan.test.mjs tests/webgl/socket-editor.test.mjs` — 5 pass; JavaScript syntax and git diff checks pass. Browser UI integration is still pending deployment.

Next: obtain exported GLB, retain source attribution; simplify while preserving visible contact detail; normalize front to +Z, up to +Y and fit the editable feature envelope. Replace ONLY `kind=socket` visual in `room-mesh.mjs`. Inward rotations for walls A/B/C/D are 0/-pi/2/pi/pi/2. Preserve 2D plan markers, feature IDs, BAZIS geometry/export/order behavior. Add async/disposal checks, verify render on all walls and project undo/save/load, then deploy the existing staging service from the isolated review branch. Never touch main or production infrastructure.
