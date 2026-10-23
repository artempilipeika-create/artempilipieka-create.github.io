# Furniture studio visual update — 23 October 2026

The public /3d/ page now presents the user's NMD2-600 and an on-demand 3D viewer. The home page links to this product studio with a rendered cabinet card. The authenticated constructor has larger module previews, dimensions with units, accessible add affordances and a coordinated neutral palette. Actual selected material textures still take priority over default render finishes.

## Model provenance and boundaries

The example was exported from Tripo model 1f7a0d9c-0211-4aaf-b032-532690e935a3 after a prior 4K texture run. That texture was defective, so it is not published. The supplied GLB was repaired locally: three materials, flat normals for panels, original exported triangle indices, normalized node scale/orientation. No additional Tripo generation or credit spending was performed in this update.

The deployed showroom asset is NMD2-600_materials_fixed.glb renamed nmd2-600.glb. It has 45,100 triangles and three material groups (panels, feet, hardware). Its dimensions are approximately 600.009 × 820 × 531 mm, with 510 mm carcass depth. The two facades are 297 × 717 × 18 mm. Preview images are renders of this exact GLB, not generated concept furniture.

The fixed GLB is a public visual example only. It is not substituted for the parameterized constructor models, native BAZIS geometry, parts, IDs, machining, payload, orders or export. The cabinet has no worktop or handles in the supplied geometry. The showroom page states that worktop and decor are selected separately.

The showroom GLB reader supports only the fixed, texture-free asset layout shipped here. It is not a user file importer. All new public asset paths are explicitly allowlisted, with the existing CSP unchanged. No database migration or authentication change.

## Validation before deployment

- 37 targeted Node tests passed: model import, physical bounds, triangle count, invalid GLB rejection, visual geometry and production dimensions.
- Full existing Node suite before the new showroom tests: 434 passed, 3 failed. All three failures reproduced in a clean b3b9559 worktree: sink-oven fixture treats upper cabinets as lower ones; upper registry count expects 79 instead of 94; vitrine exporter VM omits refreshUpperSource. These unrelated tests were not modified.
- JavaScript syntax checks and git diff whitespace check passed.
- Both WebP renders decoded and were visually inspected.

## Editing

Current Railway public presentation source: backend/v2/ui_assets; scripts/build-showroom.py rebuilds just the studio and homepage module section from the accepted shell. scripts/build-stage07-ui.py invokes it after its legacy page pass. The active editor is backend/v2/cabinet_assets/constructor-next.html, not the old public/constructor.html.

## Live review

The first deployment succeeded on Railway. In the connected browser the desktop and 390 px mobile showroom loaded the real GLB successfully; front/back presets and keyboard rotation worked, with no reported console errors or horizontal overflow. All new asset routes returned 200 in isolated FastAPI checks; non-allowlisted paths remained 404. Four presentation checks (links, contrast, landmarks and legacy API boundaries) passed.

The final visual refinement replaces the hard floor shadow with a soft contact shadow and applies the reviewed render to the native NMD2-600 catalogue card only at its exact default dimensions. On image failure that card falls back to the normal mesh preview. Insertion and parameterized model generation are unchanged.

The authenticated constructor redirected to login in the connected browser. Its geometry/unit checks passed; direct browser review of the authenticated catalogue requires the user to sign in.
