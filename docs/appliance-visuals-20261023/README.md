# Oven and microwave visuals — 23 October 2026

Optimized Tripo oven and microwave presentation models for the existing tall-appliance family. Deployed to the existing isolated constructor. The browser connection was restored and the live scene, catalogue and inspection modes were visually checked.

## Source assets

| Model | Tripo task | Cost | Original triangles |
|---|---|---:|---:|
| built-in oven 3d model | 493c506e-da6b-4ff3-bca2-846002d13cb8 | 55 credits | 1,950,841 |
| built-in microwave 3d model | d8ea151a-d744-4e31-8ea1-39a4d550d3c6 | 55 credits | 1,900,414 |

Total observed balance change: **3125 → 3015, 110 credits**. No paid remesh, upscale or regeneration was used. Generated via Studio UI because the Tripo CLI was not installed and no Tripo generation tool was exposed. Both models remain in the user's account.

- Oven: https://studio.tripo3d.ai/ru/workspace/generate/493c506e-da6b-4ff3-bca2-846002d13cb8
- Microwave: https://studio.tripo3d.ai/ru/workspace/generate/d8ea151a-d744-4e31-8ea1-39a4d550d3c6

Prompts requested isolated unbranded built-in appliances, black glass and brushed stainless steel, closed doors and realistic PBR materials. Oven requested a 595 × 595 × 550 mm envelope, two knobs, centre display and horizontal handle. Microwave requested a 595 × 380 × 350 mm envelope, left glass window, right display/dial and horizontal handle. These dimensions are prompt targets, not validated dimensions of the generated meshes.

## Runtime assets

User-provided originals: `libfile_f0c9ada2cc908191803b156dfdd25cce` (oven) and `libfile_a94545d6c1848191b44e035130f4b2f2` (microwave). Original GLBs remain intact. No additional Tripo credits were spent.

| Model | Source bytes | Runtime mesh + textures + manifest | Runtime triangles |
|---|---:|---:|---:|
| Oven | 62,016,216 | 1,158,120 | 22,504 |
| Microwave | 62,551,632 | 1,370,109 | 24,000 |

`scripts/build-appliance-assets.py` uses texture-aware offline simplification, retains source PBR maps at 2048 px colour / 1024 px roughness-metalness and normal, smooths normals across UV seams, and clips the oven's generated projecting top flange to its body width. Fixed same-origin manifests contain provenance and source hashes. Both meshes face +Z, are upright +Y and normalized to a unit envelope before presentation sizing.

The same MeshFactory serves the scene and catalogue. Resources are loaded lazily once per kind, GPU geometry/materials are shared, released preview groups reject late attachments, and thumbnail refresh happens when the asset becomes ready. The former measured faceplates remain as a loading/error fallback. Inspection and hidden-facade modes hide the appliances without changing their materials.

The appearance is an unbranded presentation model, not a specific manufacturer's mounting specification. Native 564 mm interior width, 595 / 380 mm niches, divider/support panels, project schema, cut list, FR3D files, BAZIS export, pricing, Bridge and database remain unchanged. The 9.5 mm visual extension around the shared divider preserves the previous 1 mm seam. No environment-variable, volume or production-integration changes.

## Verification and release

- 65 relevant Node checks passed (the 64 scaffold/production/mesh checks plus actual asset bounds, normals, UV, provenance and byte budgets).
- 62 Python checks passed for static resource MIME/CSP/allowlist boundaries and existing socket/shaft regression coverage. Existing Starlette/httpx deprecation warning only.
- Offline front/oblique/rear views inspected (below). These are geometry/PBR previews, not screenshots of the live constructor.
- Public HTTP checks after deployment: `/health`, loader module, both manifests, both binary meshes and all six WebP textures returned 200. Every checked asset matched the committed local bytes by SHA-256.
- Runtime commit: `91309144205258fdb6a085c8d3240c2d6f0e99e0`.
- Railway deployment: `8921b95b-119f-4eb1-a06d-c66aaa1a3ef5`, status **SUCCESS**, observed 2026-10-23 18:34:38 UTC.
- URL: https://martin-forest-v2-staging-production.up.railway.app/constructor.html
- Branch: `mf-appliance-visuals-20261023`.
- Browser demo: **Техника — визуальный пример**, separate from the user's existing projects, saved before deployment. A combined oven/microwave tall cabinet was added using the normal UI. Its pre-deployment console had no errors/warnings.
- Browser QA completed after reconnection on 23 October: both models were visible in the saved combined cabinet; the catalogue oven preview refreshed; Client 3D and front views were checked; both appliances disappeared in inspection and without-facade modes and returned in normal mode. No console errors or warnings were observed.
- Live QA showed that generated metal trim has visible waviness. The material follow-up reduces normal-map strength to 0.22, clearcoat to 0.08 and environment intensity to 0.85. This softens specular noise but does not change or fully repair the source mesh silhouette. All five appliance asset tests passed after the material change.
- Material follow-up runtime commit: `f7eb5124925eb82875a5a103a0a78df69648c4dc`; Railway deployment `52617cd4-7a68-4f41-918d-c335c437ab3c` reached **SUCCESS** at 2026-10-23 18:53:44 UTC.
- After rollout, the served loader returned HTTP 200 and matched the new committed bytes. Browser reload restored **Техника — визуальный пример** with both assets. Client 3D screenshot below was captured from the live site; the browser console remained empty of errors/warnings. The small material adjustment softened reflections, while generated trim/handle waviness remains a known visual limitation.

## Live verification

![After material refinement: live Client 3D](after.jpg)

![Catalogue and combined cabinet](catalogue.jpg)

![Inspection mode: appliances hidden, structure visible](inspection.jpg)

![Without-facade mode](without-facades.jpg)

![Before the material refinement, same Client 3D view](before-material-polish.jpg)

## Optimized asset previews (offline)

![Optimized oven: oblique, front and rear](oven-optimized-views.jpg)

![Optimized microwave: oblique, front and rear](microwave-optimized-views.jpg)

## Constructor before deployment

This screenshot records the old fallback faceplates in the saved demonstration project. It is not an after screenshot.

![Before deployment: old appliance placeholders](before.jpg)

## Original Tripo previews (before trimming and fitting)

![Raw Tripo oven, cleanup still required](tripo-oven.jpg)

![Raw Tripo microwave, fitting still required](tripo-microwave.jpg)
