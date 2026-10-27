# Separate PN-600 Gola card — 27 October 2026

The accepted collection contains 22 native FR3D donors: eleven for base 820 and eleven for base 900. Each base has storage L/P/D2 and door + oven, door + oven + microwave, drawer + oven, drawer + oven + microwave in L/P. All originals retain their exact filenames and SHA-256. The existing storage and appliance tall-cabinet cards remain separate families.

The original files and full parser audits are retained in the owner's private source archive, outside this public repository and web routes. `accepted-sources.json` records only the identities also required by the runtime catalogue. The revised base-820 left drawer facade resolves its earlier 18 mm offset; the two initially missing base-900 left donors are included.

Accepted source differences remain in the geometry: lower shelf elevations, 1 mm back-panel differences and the 0.2355 mm profile offset in the base-820 right drawer/oven/microwave donor. Original spelling, including `Goal` and doubled filename dots, remains unchanged. Inline Scheme caches were decoded as data; no native Scheme code was executed. Opening and resizing inside BAZIS was not tested.

The new family uses audited panel bounds, side contours, Gola profile contours, hardware and support elevations. Appliance clearances are measured from the top of the 18 mm support panel. Resizing keeps lower sections and appliance niches fixed, grows the upper section, follows the existing 400/500 mm drawer-slide rule and preserves explicit shelf counts and manual materials. The source-specific construction and profile cut length flow into native export and purchasing/PDF output.

Rebuild the accepted catalogue using `scripts/build-tall-gola-variants.py` with both accepted audit files from the private archive and `--sources` pointing at the original attachments, then run `scripts/build-tall-variants.py`. The generator verifies original SHA-256 values without copying native files into the website. Independent geometry fixtures test every native panel and profile and contain only the geometric information displayed by the catalogue. `scripts/export-tall-gola-references.mjs` prepares twenty-five exact construction views for the Tripo illustrations.

Validation and publication are pending the final checks for this package. The 37 database checks require disposable local Postgres in Constructor reliability CI. Final Tripo artwork and live browser save/reopen/edit checks remain pending. The Tripo sign-in handoff timed out; no new paid generation or staging deployment has been performed for this card.
