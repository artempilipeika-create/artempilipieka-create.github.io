# Photographic option cards — 26 October 2026

The execution chooser now uses 74 reviewed Tripo Studio photographs for 78 choices across 14 cabinet families. The selected module's large preview still renders its current production geometry, dimensions and materials. Existing option handlers, validation, state, undo and exports are retained.

The photographs describe the option being chosen, rather than acting as dimensioned manufacturing drawings. They are served locally as 512 × 512 WebP files. If a photograph fails to load, the same choice falls back to the native geometry preview. No external image service is needed at runtime.

## Source and review

- Native reference views: `inputs.json`; generated with `scripts/prepare-execution-tripo-inputs.py` in a synthetic project with all API writes mocked.
- Tripo Studio jobs: `jobs.json`, including the model, prompt, source quadrants, accepted task IDs and rejected attempts.
- Reviewed full sheets: `output/*.webp`, archived at quality 97. Original downloaded PNGs and reproducible reference sheets stay outside the commit.
- Delivered pictures: `backend/v2/cabinet_assets/planner/execution-card-images/`; cropped directly from the original Tripo outputs at quality 94.
- Re-export: `python scripts/export-execution-tripo-crops.py` uses the original PNG when available, otherwise the archived WebP.

Review explicitly checked left/right opening, number of doors and shelves, drawer layouts, lighting side, Gola without lighting, and the rectangular corner fronts with their perpendicular fillers. The handleless oven cabinet close-up was corrected to show the shallow lower drawer.

## Validation

Final browser and deployment results are recorded in `validation.json`.

Only the isolated staging website is updated. No production orders, Telegram messages, production integration settings or D:\\pgm files are touched.
