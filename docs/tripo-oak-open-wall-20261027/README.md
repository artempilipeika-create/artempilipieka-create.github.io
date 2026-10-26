# Oak open-wall catalogue renders — 27 October 2026

Replace all seven open-wall catalogue/option photographs with the approved realistic oak style. Four approved AQ/no-light renders are joined by three new LIRA renders from Tripo Studio, GPT Image 2.5. LIRA retains visible black 17.5 mm channels, AQ uses a thin luminous line. Lighting is vertical in the side panels, split by the single shelf, on the selected left/right/both sides.

The main card uses the no-light version. Execution photographs retain the original FR3D identity mapping. Refresh asset URLs in both constructor entry pages and option paths so existing browser sessions receive the new pictures. These are illustrative photographs: runtime geometry, dimensions, BOM, source pins and user material selections are unchanged.

Base: published staging commit ba459bdbd51461883e2aadddc476964f75d26708. This branch targets the isolated martin-forest-v2-staging service only.

All seven originals are 1024 × 1024; delivered WebP quality 95. jobs.json records source identities, task IDs, image hashes and the three new prompts. Three included generations, balance unchanged at 2520; free usage 94 → 97/100.

Validation: 683 Node tests. Local Python suite: 378 passed, 37 database-dependent checks skipped because no local Postgres is available. The required full suite with disposable Postgres runs in Constructor reliability CI before deployment. Browser review will check the seven lighting variants and a synthetic project save/reopen/edit on the exact deployed commit.
