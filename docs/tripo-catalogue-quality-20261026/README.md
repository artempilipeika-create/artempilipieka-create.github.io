# Catalogue module image quality — 26 October 2026

Improve the 14 main catalogue module images through Tripo Studio. Each module receives an individual full-resolution image, using the previous catalogue picture as the reference. Cargo and pullout-dryer use canonical native-model views from `reference/` after review found invented basket levels in the old photographs. GPT Image 2.5, 4:3, one image at a time, included Studio generations, 4K upgrade off.

This change replaces catalogue photographs only. The live scene meshes, manufacturing parts, FR3D mappings, dimensions and the option chooser are retained. Cabinet construction, the shallow NShD drawer, perpendicular corner fillers, lighting locations and support heights are checked visually before accepting each result.

`jobs.json` records each exact reference SHA, prompt, output task ID, dimensions, delivered SHA and review status. `before/` retains the previous catalogue images. Production WebP files are saved from the original generated PNGs at quality 95. `before-after.webp` shows the first comparison.

Local task base: `b6fda2e`. Hosted task base: `d486f477314735e845b9bfcfbe5ab2bf4857e21b`; hosted tree `1f2d522e84933f3b5af321d6dc88a0b40f93fd54`. Publish only this task's delta over the hosted tree. The same isolated staging service is used.

Starting balance: 2520 credits. Included usage: 63/100. Final generation costs and validation are recorded with the completed batch.

## Completion and review

14 accepted individual images at 1536 × 1152. 16 included attempts: two rejected for a clipped countertop corner and the old cargo reference’s extra basket. Credits charged: 0; balance remained 2520; included counter 63/100 → 79/100. All results preserve the source module composition; these are catalogue illustrations, not fabrication drawings or manufacturer product photographs.

The synthetic browser check loaded all 14 full-resolution assets across the three categories, checked large cards, native module insertion and undo/redo, and a 390px mobile layout without horizontal overflow. No JavaScript errors or unexpected requests occurred; production writes were mocked. `validation.json` records the checks; `qa-*.webp` retain the reviewed screenshots. `all-modules.webp` shows the complete batch. The JavaScript syntax and whitespace checks passed.
