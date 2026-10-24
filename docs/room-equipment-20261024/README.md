# Room equipment — 24 October 2026

Four supplied Tripo GLBs are integrated as room accessories: freestanding gas cooker,
radiator, gas boiler and water heater. The measured window remains an analytic frame
with glazing, opening and sill; no missing Tripo window file is requested at runtime.

## Behavior

All five catalogue cards support dragging into the scene and selecting/moving the
placed object. Equipment snaps and turns toward A/B/C/D walls; the window always
stays in a wall. The right card edits wall, offset along wall, distance from wall,
elevation and dimensions. “К стене” resets the gap, and copy/delete are undoable.
The cooker remains on the floor. Millimetre coordinates persist in room features,
including the backward-compatible `wall_gap: 0` default.

A drag only previews geometry until pointer release. Valid release commits one
history action; Escape, pointer cancellation and invalid placement restore the
original. Cabinet, countertop and equipment intersections are checked. Window
openings and sills follow the measured wall. The 2D fallback also supports placement.

Cabinet/native records, importer 9.9.4, existing material aliases, straight plinth
and skinali export sources are unchanged. Room objects remain room metadata in
BAZIS export; this change does not fabricate native production FR3D geometry.

## Asset provenance

The original attachments are unchanged. Optimization is local; no new Tripo credits
or regeneration were used. Geometry is normalized to the measured envelope, front
+Z/up +Y, with shared PBR color, roughness/metalness and normal maps. Runtime meshes
are limited to 24,000 triangles each, about 0.8–1.1 MB per mesh. Manifests include
source SHA-256, original size, task ID and bounds. Thumbnails render those meshes.

| Kind | Tripo task ID | Runtime triangles |
|---|---|---:|
| gas_cooker | dc893516-a4e3-49ae-94d4-ffa34766a657 | 23,999 |
| radiator | f2a5a16a-1b01-4903-bd0f-219629975289 | 24,000 |
| gas_boiler | 0532e262-3d47-46ce-a57f-6d92c1729c1b | 24,000 |
| water_heater | 95753287-6a88-454b-ab8d-eafc7e8e66ee | 23,999 |

Rebuild using `scripts/build-appliance-assets.py KIND source.glb preview.glb`, then
`scripts/render-equipment-assets.py` for runtime thumbnails. Source details and
minor generative surface imperfections are retained; geometry is visual room context,
not manufacturer installation specifications.

## Validation

- 100 relevant Node tests passed: placement on every wall, measured coordinates,
  window openings, collisions, real raycast selection, one-step drag undo/cancel,
  catalogue drop, finite optimized assets, shared resources, material readback,
  existing plinth isolation, skinali and appliance loading.
- 135 Python tests passed: schema persistence and validation, route delivery, shafts,
  sockets, existing accessories and wall finishes. One existing httpx deprecation.
- Broad Node suite exposed four pre-existing expectations in pricing, production
  notes, presentation resolution and upper donor count; reproduced against HEAD.
  Sparse-checkout showroom fixture was restored unchanged. The changed scene picker
  now has an actual raycast test instead of asserting its old source text.
- Rendered all four optimized models and inspected their orientation and silhouettes.
- Live deployment/UI verification recorded separately after publication.

Deployment scope: existing isolated `martin-forest-v2-staging` service only. No main
branch, production integrations, database contents, variables or volume changes.
