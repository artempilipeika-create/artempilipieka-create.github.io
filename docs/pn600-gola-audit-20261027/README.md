# Separate PN-600 Gola card — 27 October 2026

The accepted collection contains 22 native FR3D donors: eleven for base 820 and eleven for base 900. Each base has storage L/P/D2 and door + oven, door + oven + microwave, drawer + oven, drawer + oven + microwave in L/P. All originals retain their exact filenames and SHA-256. The existing storage and appliance tall-cabinet cards remain separate families.

The original files and full parser audits are retained in the owner's private source archive, outside this public repository and web routes. `accepted-sources.json` records only the identities also required by the runtime catalogue. The revised base-820 left drawer facade resolves its earlier 18 mm offset; the two initially missing base-900 left donors are included.

Accepted source differences remain in the geometry: lower shelf elevations, 1 mm back-panel differences and the 0.2355 mm profile offset in the base-820 right drawer/oven/microwave donor. Original spelling, including `Goal` and doubled filename dots, remains unchanged. Inline Scheme caches were decoded as data; no native Scheme code was executed. Opening and resizing inside BAZIS was not tested.

The new family uses audited panel bounds, side contours, Gola profile contours, hardware and support elevations. Appliance clearances are measured from the top of the 18 mm support panel. Resizing keeps lower sections and appliance niches fixed, grows the upper section, follows the existing 400/500 mm drawer-slide rule and preserves explicit shelf counts and manual materials. The source-specific construction and profile cut length flow into native export and purchasing/PDF output.

Rebuild the accepted catalogue using `scripts/build-tall-gola-variants.py` with both accepted audit files from the private archive and `--sources` pointing at the original attachments, then run `scripts/build-tall-variants.py`. The generator verifies original SHA-256 values without copying native files into the website. Independent geometry fixtures test every native panel and profile and contain only the geometric information displayed by the catalogue. `scripts/export-tall-gola-references.mjs` prepares twenty-five exact construction views for the Tripo illustrations.

## Verified checkpoint

The implementation is saved in GitHub on `mf-reliability-pn600-gola-20261027`, commit `95b486cda105d787d83088668088bab9ef4687f7`. Its tree `3f45f233246707e6af59ee7d8e30822a087c4724` is byte-for-byte identical to the locally checked implementation. All 29 uploaded blobs were verified against their local Git object hashes. Native FR3D files and private archives are excluded.

Local checks passed: 708 Node tests; 406 Python tests passed with 37 database checks skipped locally. Constructor reliability then passed **708 Node and 443 Python tests**, including the disposable PostgreSQL checks, with no failures or skips. Run: https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/40494048589 (job `122154873187`). The only Python warning concerns the upstream Starlette/httpx test-client deprecation.

Final Tripo artwork and browser save/reopen/edit checks remain pending. The managed local preview cannot launch the Python QA environment (the preview host reports its interpreter path unavailable); browser verification is not claimed. Tripo Studio is reachable, but authentication has not been confirmed in the agent-controlled browser. No new paid generation or staging deployment has been performed for this card.

Next: finish the Tripo illustrations from the prepared 25 construction references, register the separate Gola main card in `catalogue-artwork.js`, connect its layout/opening images in `execution-image-index.mjs`, and verify the actual card and a disposable QA project. Repeat the required checks for any runtime edits before updating the existing pinned Railway staging service. Keep all conventional tall-card donors and source identities unchanged.

The existing Railway target is project `6d754ad4-ba7b-45f8-8c5e-356387e7de06`, environment `ee625678-c15e-452d-9761-cda99274839f`, service `9aacf7bf-edd5-4f08-9423-3fbabea59268`. Its source remains pinned to the previously approved full-catalogue release. GitHub push from the shell is unavailable without credentials; the connected GitHub app successfully saved the verified tree and triggered CI.
