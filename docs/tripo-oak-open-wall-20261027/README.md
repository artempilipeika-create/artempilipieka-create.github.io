# Oak open-wall catalogue renders — 27 October 2026

Replace all seven open-wall catalogue/option photographs with the approved realistic oak style. Four approved AQ/no-light renders are joined by three new LIRA renders from Tripo Studio, GPT Image 2.5. LIRA retains visible black 17.5 mm channels, AQ uses a thin luminous line. Lighting is vertical in the side panels, split by the single shelf, on the selected left/right/both sides.

The main card uses the no-light version. Execution photographs retain the original FR3D identity mapping. Refresh asset URLs in both constructor entry pages and option paths so existing browser sessions receive the new pictures. These are illustrative photographs: runtime geometry, dimensions, BOM, source pins and user material selections are unchanged.

Base: published staging commit ba459bdbd51461883e2aadddc476964f75d26708. This branch targets the isolated martin-forest-v2-staging service only.

All seven originals are 1024 × 1024; delivered WebP quality 95. jobs.json records source identities, task IDs, image hashes and the three new prompts. Three included generations, balance unchanged at 2520; free usage 94 → 97/100.

Validation: 683 Node tests. Local Python suite: 378 passed, 37 database-dependent checks skipped because no local Postgres is available. Constructor reliability CI passed all 683 Node tests and 415 Python tests with disposable Postgres, no skips. Run: https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/40403314762.

Deployment 0eb827a9-9474-4ba1-98a9-bf517bd71e95 reached SUCCESS with exact commit 548547ad4a507d6276ab3f1fb87387e28d446e07. All seven hosted WebP responses returned HTTP 200 and matched the recorded SHA-256. Browser review selected every lighting variant and verified loaded images, saved/reopened QA_Tripo_Oak_20261027, changed width 600 → 500 → 600, and preserved LIRA/both selection, native source filename and chosen BYSPAN white material. No console errors or warnings. qa-desktop.jpg and qa-lighting-cards.jpg show the deployed UI.
