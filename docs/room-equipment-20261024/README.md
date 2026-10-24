# Room equipment — 24 October 2026

Status: implementation prepared; NOT deployed. Runtime mesh and thumbnail files are
still missing. Keep the currently working constructor release d2d2adfe in Railway.
Do not publish this branch until the five GLBs have been received, optimized,
inspected and tested in the actual scene.

## Tripo generation

Generated through the user's signed-in Tripo Studio using H3.1, geometry and texture,
no paid remesh, upscale or regeneration. Each model cost 55 Studio credits. Observed
balance: 2795 -> 2520; total 275 credits. All five completed successfully and remain
in the user's Tripo account.

| Kind | Task ID | Credits |
|---|---|---:|
| gas_cooker | dc893516-a4e3-49ae-94d4-ffa34766a657 | 55 |
| radiator | f2a5a16a-1b01-4903-bd0f-219629975289 | 55 |
| gas_boiler | 0532e262-3d47-46ce-a57f-6d92c1729c1b | 55 |
| water_heater | 95753287-6a88-454b-ab8d-eafc7e8e66ee | 55 |
| window | d6a394c2-f588-409c-9bde-1a0381ca0109 | 55 |

Open each task at https://studio.tripo3d.ai/ru/workspace/generate/TASK_ID.
Prompts requested isolated, unbranded manufactured appliances with PBR materials,
front facing forward and upright. The cooker is freestanding, four gas burners and
closed oven; radiator is a horizontal white steel panel; gas boiler is a wall-mounted
rectangular cabinet; water heater is a vertical white cylinder; window has two closed
white PVC casements. Prompt dimensions are concept proportions, not verified mesh
measurements or manufacturer mounting requirements.

Generated meshes have approximately 1.9 million triangles each. Window glass has
visible blocky artifacts and the frame is uneven; repair the glazing while optimizing.
The water heater has an unrequested projecting top connector; inspect/remove it as
appropriate before fitting the measured tank envelope. Cooker knobs and metal edges
have normal generative imperfections; reduce normal strength, inspect silhouette.

Studio GLB export was attempted via the normal Export dialog, GLB and current 4K.
The Browser download event timed out; no GLB was received in the coding workspace.
Chrome's internal downloads page was blocked by the Browser URL policy (HTTP/HTTPS
only). Do not retry that page via indirect controls. Ask the user to attach the five
normal GLB exports, as with the earlier oven/sink imports. Do not regenerate models.

## Prepared implementation

- Catalogue cards for five objects; room dialog offers windows/equipment alongside
  shafts and sockets. Wall, offset, lower-edge elevation, width, height, depth/sill
  projection, label and notes are editable. Cooker stays on the floor.
- Backend RoomFeature kind validation and measured envelope persistence; one history
  action commits all room edits. Existing cabinet/native records remain unchanged.
- Existing wallPanels subtracts window openings. The room renderer fits the Tripo
  window in that opening; sill remains a separate measured object.
- Shared lazy appliance loader accepts the five new kinds; room attachments face
  inward on A/B/C/D, reject stale loads and retain fallbacks on load failure. Scene
  disposal preserves shared geometries until the asset cache is disposed.
- Cooker/radiator/boiler/heater block cabinet and countertop overlaps by their measured
  envelope. Automatic wall snapping still uses only walls/shafts/columns.
- These room objects remain room metadata in BAZIS export. No fabricated native FR3D,
  no changes to importer 9.9.4 or production parts, no new prices.

## Remaining installation

1. Receive the original five GLBs. Preserve them unchanged in the user's file storage.
2. `scripts/build-appliance-assets.py KIND source.glb preview.glb` already maps task
   IDs. Validate orientation and inspect output; do not assume source node transforms
   or front orientation match earlier models. Repair window glazing and heater top.
3. Create optimized mesh, textures, manifest and `KIND-tripo-preview.webp` for every
   kind in `backend/v2/cabinet_assets/planner/appliance-assets/`.
4. Verify actual assets, byte budgets, appearance in a separate browser QA project,
   save/reload, room editing and catalogue filters. Preserve the user's existing room.
5. Publish only the complete checked package to the existing isolated Railway service.

Validation completed: 88 relevant Node checks and 67 Python checks passed, including
new equipment measurements/placement/serialization, existing shaft/socket behavior,
window subtraction, native skinali export, plinth thumbnails, appliance assets and
fixed static routes. Original socket bytes missing from the sparse checkout were
restored unchanged from git; affected tests then passed. Python reports the existing
Starlette/httpx deprecation warning. Actual new GLB geometry and browser UI verification
remain pending because the mesh files are not yet available.
