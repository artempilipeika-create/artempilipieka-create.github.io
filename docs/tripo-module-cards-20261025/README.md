# Tripo card inputs — prepared, not processed

Status on 2026-10-25: **no new Tripo generation or texturing jobs submitted;
no credits spent; no live site changes**.

Prepared 25 GLBs from the configurator's MeshFactory:

- 7 open tall configurations (the duplicate AQ-left source is excluded);
- 6 cargo configurations (3 hardware families × standard / Gola);
- 12 pull-out dryer configurations (2 brands × 3 lower drawer systems × standard / Gola).

`prepared-inputs.zip` contains every GLB and the source SHA-256 manifest.
`input/open-tall-none-none.glb` is the first pilot, also kept separately for upload.
`input-review.jpg` shows the source geometry **before** Tripo.

Inputs preserve source panel geometry and dimensions. Cargo/dryer parts use an
inspection pose only, with the pull-out assembly translated forward. Hardware
visualizations retain the existing configurator's approximations; Tripo cannot
turn them into verified manufacturer geometry. The preview pose does not change
production geometry, order hardware, or FR3D files.

## Proposed Studio batch

1. Import existing GLB (free) and texture at 4K, using the prompt in the manifest.
   Start with `open-tall-none-none.glb`. Inspect panel edges, gaps and material
   consistency before continuing. Do not regenerate geometry.
2. If the pilot is usable, process the remaining 24 files with the same settings.
3. Download GLBs; compare geometry and inspect materials. Produce consistent card
   images, then connect them to the correct variants and validate the UI before
   deploying to staging. Images must not imply a different shelf count or fittings.

Studio currently displays 20 credits for 4K texturing on an existing model;
estimated batch total is 500 credits (20 pilot + 480 remaining). Confirm the
per-input price before submission, do not exceed the approved cap, and do not
silently rerun a failed or poor result. The Studio balance observed was 2520.
The UI does not expose the texture model's API version; no API pricing or balance
is substituted for Studio's.

## Browser handoff

Pilot source published on the separate `tripo-card-prep-20261025` review branch.
The GitHub download control was clicked, but the browser download event timed out;
its completion and local path are **not verified**. Opening `chrome://downloads`
was rejected by browser policy. No attempt to bypass that restriction was made.
The Tripo upload chooser is open for the user to select the pilot manually.
No file has yet been confirmed as uploaded to Tripo.

Before spending credits, obtain the batch spending limit required by the Tripo
skill. Reuse earlier authorization for Studio access and installation; do not ask
for those again.

## Reproduce

```sh
node scripts/prepare-tripo-module-cards.mjs
EGL_PLATFORM=surfaceless LIBGL_ALWAYS_SOFTWARE=1 python scripts/render-tripo-module-review.py docs/tripo-module-cards-20261025
```

The review renderer requires trimesh, pyrender 0.1.45, numpy, Pillow and working EGL.
All 25 GLBs were loaded and rendered successfully with trimesh/pyrender. Their GLB
headers, buffer ranges, mesh counts and bounding dimensions were checked.
