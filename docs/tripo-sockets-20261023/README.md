# Tripo room sockets — 2026-10-23

The user's Tripo GLB is integrated into measured room features. Add any number of outlets (within the existing 100-room-feature limit) in **Комната → Розетки → Добавить розетку**. Wall, corner offset, bottom-edge elevation, frame dimensions and projection are editable. The same room save/load and undo/redo path retains the measurements; cabinet geometry, BAZIS identifiers, orders and production exports are unchanged.

## Provenance and optimization

- Tripo Studio H3.1 task: `092f8fb2-22f5-43e0-be1e-740d633766b3`.
- https://studio.tripo3d.ai/ru/workspace/generate/092f8fb2-22f5-43e0-be1e-740d633766b3
- Original supplied as `schuko outlet 3d model (1).glb`, Library ID `libfile_1ce55b3aad008191816ffbd735a3c46d`.
- SHA-256: `c96677c0f95420b47d9362a1d35c04586995d5f68c6e17d558b545f8b90b69ef`.
- Original: 60,499,980 bytes, 1,947,155 triangles. Website mesh: 19,999 triangles, 15,218 vertices, 726,964-byte binary; all runtime geometry and texture files together are under 1 MB.
- Offline PyMeshLab simplification welds duplicate vertices before reducing with per-corner UV coordinates and boundary preservation. 1024px colour, 512px normal and metallic/roughness maps retain the generated appearance.
- One paid Studio generation cost 55 credits (3180 → 3125). No additional Tripo calls or charges for the integration.
- Defaults 86 × 86 × 12 mm are editable visualization dimensions, not certified product measurements or electrical installation guidance.

## Integration

`socket-asset.mjs` loads the fixed versioned manifest, validates the mesh, and shares one geometry/material/texture set per scene across placed sockets. Requests are aborted at scene disposal; stale room callbacks cannot attach old models. A measured white placeholder remains if network loading fails. Socket fronts face into the room on all four walls. Technical plan numbering remains; socket badges are hidden in client view.

Only specific new assets are added to the existing route allowlist. The existing CSP is unchanged; textures are same-origin WebP files. No general mesh upload endpoint or external CDN was added. Current studio lighting/shadow improvements from review commit `8495122` are retained.

## Validation

- Node: socket geometry, four-wall bounds/orientation, damaged input rejection, stale async loads, GPU sharing, room constraints, JSON roundtrip, undo/redo and existing studio rendering — 17 tests passed.
- Python: fixed asset routes/MIME/CSP and backend Room schema roundtrip on four walls — 2 tests passed.
- Offline front/back render inspected after simplification; UV seam cracks from an initial trial were fixed before shipping.
- Live deployment and browser evidence recorded in `LIVE.md` after release.
