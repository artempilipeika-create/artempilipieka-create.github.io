# Visuals, client room and pricing — interrupted work checkpoint

Date: 2026-09-27. Status: IN PROGRESS; NOT ACCEPTED; NOT DEPLOYED.

## Fixed starting point

Repository: artempilipeika-create/artempilipieka-create.github.io.
Accepted base: 917a9f4da9c2735db7837dd59bfedc00a76835cb.
Previous working branch: mf-kitchen-foundation-20260927.
New branch: mf-visuals-pricing-20260927 (created from that exact base).
Staging branch: martin-forest-v2-staging.

Both accepted branches were confirmed by git ls-remote at the base SHA.
Previous working checkout was clean before this stage.

Railway was checked again AFTER the workspace disconnected:
- Project: Martin Forest Site Preview, 6d754ad4-ba7b-45f8-8c5e-356387e7de06
- Service: martin-forest-v2-staging, 9aacf7bf-edd5-4f08-9423-3fbabea59268
- Environment ID: ee625678-c15e-452d-9761-cda99274839f (Railway labels it production, but this is the isolated staging project)
- Latest deployment: 7a0ab584-6291-49ef-b818-8df1f7232b83
- Status: SUCCESS
- Deployed SHA: 917a9f4da9c2735db7837dd59bfedc00a76835cb
- URL: https://martin-forest-v2-staging-production.up.railway.app/constructor

No deployment, production changes, production database access or native-export changes were made in this stage.

## User scope, in order

A. Entire CURRENT catalogue visual coverage, exact manufacturer + full article + material/variant identity.
Statuses EXACT_TEXTURE / OFFICIAL_PREVIEW / COLOR_ONLY / MISSING_VISUAL.
No lookalike substitutions. Clear neutral fallback must replace the previous map.
Preserve sRGB, physical scale, aspect ratio, grain, roughness and the existing four EGGER assets.
Save/reload and whole-kitchen material assignment must work.
Provide complete coverage and missing-source list.

B. Existing WebGL Technical / Client modes, compact room controls:
wall color, floor variant, lighting; presets Light Studio, Warm Interior, Neutral Showroom.
Save environmentPreset, wallColor, floorMaterial, lightingPreset as project DISPLAY state.
Exclude display state from furniture specification, production detail and native export.
Preserve fullscreen layout and existing selection, doors, views, snap, collision, Raycaster, history.
Measure browser performance rather than claim FPS.

C. Pricing FOUNDATION only; no invented prices.
actualWidthMm comes from actual module width.
pricingWidthMm = max(300, ceil(actualWidthMm / 50) * 50), up to actual width 1000.
Above 1000: CUSTOM, never cap at 1000. Never mutate geometry.
ModulePriceBreakdown: sheet materials, edging, hardware, operations, extras, totals.
Derive from real productionParts / kitchenRuns / kitchenLegs.
Unknown quantity rules -> PRICING_RULE_MISSING; unknown price -> PRICE_DATA_MISSING, never zero.
Module and kitchen price UI; future category matrix for D1 L, D1 P, D2 only.
Required rounding tests: 270/299/300=>300; 301/320/349/350=>350; 351=>400;
599/600=>600; 601=>650; 999/1000=>1000; 1001=>CUSTOM; actual width unchanged.
Full regression, clean commit, full SHA, staging-only deployment, Railway SUCCESS, published smoke.

## Confirmed findings

The accepted registry contains exactly FOUR decor attachments:
W1000 ST9, U999 ST7, U708 ST9, H1180 ST37.
File: backend/v2/cabinet_assets/planner/materials/manifest.json.
These are not the count of catalogue variants covered.

The original master file contains 2104 published material variants, including 164 unique articles
whose names explicitly contain EGGER. This is a SOURCE FILE count, NOT a verified count of
the currently active staging release. Many manufacturer fields are null.
Do not invent manufacturer identities from a decor name/code.
Source file was read using the existing normalize_master implementation:
  /workspace/scratch/43e731f7e779/upload/ДЛЯ ГПТ(5).xlsx
Source SHA per existing docs/stage03/master-evidence.json:
  54c6f737f0bafecc3dc5df4ed14b573b7e2f5ab0c83e626e5e79fc296c641f4a

The scratch catalogue-source.json was initially normalized with a temporary namespace
martin-forest-master. ITS GENERATED IDs MUST NOT BE TREATED AS LIVE IDs.
Existing tests/stage03/live_acceptance.py names namespace master.u2.
Retrieve the actual active catalogue release for authoritative IDs/counts.

Official EGGER H1386 ST40 page was fetched successfully:
https://www.egger.com/en/furniture-interior-design/decors/H1386_40
Its page title matches the full article. Its first image stage provides the exact board preview
and a displayed extent approx. 2311 x 1300 mm. Use actual image/caption proportions.
A batch exact-article collection was started. Completion and downloaded files are UNVERIFIED.
Initial AU115/AU125/AU163/AU321/AU325 ST9 URLs returned 404; do not silently strip AU to U.
BYSPAN manufacturer catalogue https://www.span.by/design/dekory/ returned 502 in direct fetch.
Search identified it as the official source. No BYSPAN or Ultradecor preview was attached yet.

The collector script has been preserved in this remote branch as WIP, not accepted/tested code.
It leaves existing registered assets alone, verifies full page title, records hashes/provenance,
and classifies downloaded images as OFFICIAL_PREVIEW.

## Where to continue

Local worktree created before disconnect:
  /workspace/scratch/7ad058d621a4/martin-forest
Previous checkout:
  /workspace/scratch/a39b99bc204b/martin-forest
Temporary files, if the original workspace returns:
  /workspace/scratch/7ad058d621a4/catalogue-source.json
  /workspace/scratch/7ad058d621a4/visual-source-checks.json
  /workspace/scratch/7ad058d621a4/visual-download.log
  /workspace/scratch/7ad058d621a4/egger.html

Do NOT reset the local worktree. Inspect git status and reconcile any files with this remote
checkpoint. The last apply_patch call was interrupted and its outcome is UNKNOWN.
It attempted changes in material_visuals.py, catalogue_model.py, catalogue_api.py,
planner/material-visuals.mjs and planner/module-mesh.mjs:
- explicit manufacturer resolution only;
- four visual statuses and a safe per-variant visual identity;
- authenticated /api/v2/catalogue/visual-coverage report;
- renderer visual status and texture-load failure status.
Those edits are NOT claimed as saved in this remote checkpoint. Review before reapplying.

Key existing implementation:
- backend/v2/material_visuals.py: exact registry resolver.
- backend/v2/catalogue_model.py: safe_item projection.
- backend/v2/catalogue_api.py: materials pagination (limit <=250), release pinning, ID lookup.
- backend/v2/cabinet_ui.py: explicit public planner asset whitelist; manifest supplies image files.
- backend/v2/cabinet_assets/3d.js: normalizeScene, scenePayload, material hydration, native export.
- backend/v2/three_d_api.py: strict Scene and FurnitureItem schemas; display state needs an additive scene field.
- planner/furniture-core.js: canonical productionParts, kitchenRuns, kitchenLegs.
- planner/workspace.mjs: current Client toggle only hides controls; blocks inspector in Client.
- planner/scene.mjs: studio lights, PMREM, room meshes, on-demand renderer.
- planner/module-mesh.mjs: sRGB textures, physical UV, material/texture cache and map failure handler.
- planner/entry.mjs: toolbar, history binding, inspector, project sync.
- tests/webgl and .github/workflows/mf-webgl-review.yml: full existing regression.
  The review workflow needs the new branch added. Its legacy unchanged-file gate includes
  workspace.mjs; scope that gate to preserve native/layout files while allowing authorized room work.
- tests/webgl/live_smoke.py currently assumes every manifest entry has texture_url.
  Update to support preview_url before adding official preview entries.

Current production geometry already has real hinge counts/article and four kitchen legs.
Other fittings/edging/drilling rules must not be invented.

## Access and interruption

The execution environment reported environment_offline / 409 and subsequently removed
exec_command and filesystem tools. No local status or test execution is currently possible.
Browser secure sign-in was requested to inspect the protected active catalogue. No confirmed
authentication result was received. Do not assume login succeeded or reuse guessed credentials.
Railway OAuth exposes only variable names, not values. Do not reset credentials for this task.

No A/B/C completion, tests, coverage totals, performance pass or new deployment is claimed.
Next action after runtime recovery: inspect local files and download evidence, reconcile this
checkpoint branch, then continue A -> B -> C -> regression -> staging deployment.
