# Constructor reliability audit — 26 October 2026

Scope: the existing Martin Forest staging constructor, its saved project schema, native source identity, geometry and export regressions. Production Bridge, production orders and customer projects were not used for testing.

## Reproduced defects and fixes

1. **A reopened two-door cabinet could be validated as a single-door cabinet.** The scene loader inferred a generic template from the initial 600 mm width even when a native BAZIS source was already specified. After increasing the width to 800 mm, the browser accepted the edit but the server rejected the save. The audit reproduced this on the live staging site in a synthetic QA project. Native source identity now takes precedence; loading no longer adds a generic template, and existing projects carrying that old template remain saveable without rewriting their source pins. Genuine single-door limits remain enforced.
2. **Unsupported worktop depth was accepted by the editor.** Two older drawer donors offered a 1000 mm depth while the server only supports a worktop on lower modules up to 750 mm deep. The editor now blocks this combination before changing the scene or attempting to save, with a specific size message.
3. **The active branch lacked comprehensive regression automation.** Older workflows targeted other branches. A new `Constructor reliability` workflow exercises the current staging branch and audit branches with a disposable PostgreSQL database and fake email. `AGENTS.md` now requires successful checks before changing the pinned staging deployment.

The initial new/opened size matrix found 30 browser/server disagreements: 26 generic-template cases and 4 unsupported-depth cases. These are cases of the two defects above, not 30 separate defects.

## Regression coverage

- All 137 catalogue donors are created using the actual browser catalogue and StateAdapter.
- 3,237 client-accepted resize cases are checked against the server schema, covering new items, reopened items and historical inferred templates. An additional 429 combinations are rejected by the editor.
- Every donor is created, reopened, resized, saved and fetched again through the actual HTTP API with isolated PostgreSQL. Source filename/hash, native identity, material choices and dimensions are checked.
- The full Node suite covers geometry, native export/source pins, materials, undo/redo, autosave, interrupted replies, revision conflicts and visuals. The Python suite covers server validation, asset routing, PDF output, access restrictions and project recovery.
- Stale tests were corrected for preserved renamed files, current upper/wall families, 50 mm rear clearance, current render limits, merged plinths and explicit client login after registration. Source hash and genuine production constraints remain checked.

## Limits

This audit covers the enumerated automated cases and the recorded browser smoke test, not every possible project or future network/device failure. Native execution inside the user's Windows BAZIS installation was not available. No original FR3D bytes, Tripo meshes or user-selected source filenames/hashes were changed by this audit.

## Automated result

- Tested commit: `d195c4690ede032631b26d089a01e30d78806d09`.
- [Successful CI run](https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/40329317043): **670 Node tests and 415 Python tests passed, no skipped tests**.
- Staging publication was scoped to environment `ee625678-c15e-452d-9761-cda99274839f`, changing only the pinned commit of service `martin-forest-v2-staging`. The reviewed patch was non-destructive and contained no database, volume, variable or other service changes.

## Deployed browser verification

Deployment `b47ac4ee-e937-4f46-a145-48831d8bab9a` reached **SUCCESS** at 2026-10-26 13:39:52 UTC on the tested commit. Public `3d.js` and `furniture-core.js` bytes exactly match the tested files; `/health` returns 200 and identifies the environment as staging.

In synthetic project `QA_Надёжность_20261026`, the previously failing 800 mm two-door cabinet saved successfully using the already-open browser tab. After reloading, its 800 mm width and saved status remained correct. Undo and redo correctly switched the width between 800 and 900 mm; the final 800 mm scene saved successfully. Native BAZIS export reported one module and one worktop prepared. Fresh browser error/warning logs were empty; the new deployment's filtered runtime logs contained no errors or rejected saves during this check.

The project checker still correctly flags the synthetic scene's unassigned rear-panel/worktop materials, incomplete price data and survey/door-opening review items. These production-readiness messages were not hidden or represented as software failures.
