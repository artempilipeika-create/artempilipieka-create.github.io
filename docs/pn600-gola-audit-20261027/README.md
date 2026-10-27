# Separate PN-600 Gola card — 27 October 2026

The accepted collection contains 22 native FR3D donors: eleven for base 820 and eleven for base 900. Each base has storage L/P/D2 and door + oven, door + oven + microwave, drawer + oven, drawer + oven + microwave in L/P. All originals retain their exact filenames and SHA-256. The existing storage and appliance tall-cabinet cards remain separate families.

The original files and full parser audits are retained in the owner's private source archive, outside this public repository and web routes. `accepted-sources.json` records only the identities also required by the runtime catalogue. The revised base-820 left drawer facade resolves its earlier 18 mm offset; the two initially missing base-900 left donors are included.

Accepted source differences remain in the geometry: lower shelf elevations, 1 mm back-panel differences and the 0.2355 mm profile offset in the base-820 right drawer/oven/microwave donor. Original spelling, including `Goal` and doubled filename dots, remains unchanged. Inline Scheme caches were decoded as data; no native Scheme code was executed. Opening and resizing inside BAZIS was not tested.

The new family uses audited panel bounds, side contours, Gola profile contours, hardware and support elevations. Appliance clearances are measured from the top of the 18 mm support panel. Resizing keeps lower sections and appliance niches fixed, grows the upper section, follows the existing 400/500 mm drawer-slide rule and preserves explicit shelf counts and manual materials. The source-specific construction and profile cut length flow into native export and purchasing/PDF output.

Rebuild the accepted catalogue using `scripts/build-tall-gola-variants.py` with both accepted audit files from the private archive and `--sources` pointing at the original attachments, then run `scripts/build-tall-variants.py`. The generator verifies original SHA-256 values without copying native files into the website. Independent geometry fixtures test every native panel and profile and contain only the geometric information displayed by the catalogue. `scripts/export-tall-gola-references.mjs` prepares twenty-five exact construction views for the Tripo illustrations.

## Verified checkpoint

The implementation is saved in GitHub on `mf-reliability-pn600-gola-20261027`, commit `95b486cda105d787d83088668088bab9ef4687f7`. Its tree `3f45f233246707e6af59ee7d8e30822a087c4724` is byte-for-byte identical to the locally checked implementation. All 29 uploaded blobs were verified against their local Git object hashes. Native FR3D files and private archives are excluded.

Local checks passed: 708 Node tests; 406 Python tests passed with 37 database checks skipped locally. Constructor reliability then passed **708 Node and 443 Python tests**, including the disposable PostgreSQL checks, with no failures or skips. Run: https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/40494048589 (job `122154873187`). The only Python warning concerns the upstream Starlette/httpx test-client deprecation.

## Published and verified

All 25 Tripo illustrations (22 closed variants and three open storage views) and the dedicated catalogue cover are integrated. Option photographs resolve through the exact native donor. The runtime does not substitute artwork for construction geometry or manual material selections. Approved Tripo spend was 520 credits, including the disclosed duplicate.

Final runtime commit `4116aef384eb571ca3d9e97670dc9081edad207c` includes the explicit public asset allowlist and a route regression test for all 26 WebP files. Local JavaScript checks passed 711 tests. [Constructor reliability](https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/40539744597) passed both required suites, including disposable PostgreSQL saves, for this exact commit.

The owner applied the staged deployment in Railway. Deployment `c05fac6c-f5b0-4c45-bad3-a5c498cc2424` reached SUCCESS. The existing `martin-forest-v2-staging` service is pinned to the final runtime; no pending environment changes remain. All 26 hosted artwork files returned HTTP 200 and matched the committed bytes. Health returned `ok=true`.

Browser QA selected all 22 native variants (eleven per base) and verified their displayed source filenames. All three open illustrations loaded. Synthetic project `QA_PN600_Gola_20261027` was saved, reopened and edited; the final view uses base 820 storage D2 at 2200 mm. Browser error/warning logs and the deployment runtime error filter were empty. No customer project or production order was modified.

[Published constructor](https://martin-forest-v2-staging-production.up.railway.app/constructor.html). Find **ПН-600 Gola** in the catalogue.

Railway target: project `6d754ad4-ba7b-45f8-8c5e-356387e7de06`, environment `ee625678-c15e-452d-9761-cda99274839f`, service `9aacf7bf-edd5-4f08-9423-3fbabea59268`.
