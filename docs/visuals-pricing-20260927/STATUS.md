# Visual coverage, client room and pricing

Status: prepared and locally checked. NOT deployed. Browser/Postgres CI remains pending.

## Publication authorization

The user explicitly authorized this working branch, code, tests, workflow and the 113 verified article previews to be sent to the public repository on 2026-09-27. This resolves the previous approval block. A subsequent shell push failed because the command environment has no GitHub credentials; the connected GitHub Git-data API is used to publish the same verified file tree. Full green CI is required before staging. Production remains outside scope.

Worktree: `/workspace/scratch/7ad058d621a4/martin-forest`.
Branch: `mf-visuals-pricing-20260927`, based on accepted `917a9f4da9c2735db7837dd59bfedc00a76835cb`.
Staging project/service/environment and accepted deployment remain as recorded in the archived checkpoint. Only `martin-forest-v2-staging` is authorized for publication after green tests. Production, production Postgres and native export source remain untouched.

## Catalogue verification completed

Authenticated through the protected browser sign-in. Current active release: `e6db8155-91a6-4f15-9b89-ce2194b43373`. All **2104 variant IDs and complete displayed material labels** were read through existing catalogue search/select controls and compared to the original workbook normalized with the unchanged `master.u2` namespace. All matched. This included names, full articles, structures and dimensions. No catalogue or order writes were made. Material IDs use the same deterministic source normalization. See `catalogue-verification.json`.

Source: `ДЛЯ ГПТ(5).xlsx`, SHA256 `54c6f737f0bafecc3dc5df4ed14b573b7e2f5ab0c83e626e5e79fc296c641f4a`.

| Metric | Count |
| --- | ---: |
| Unique material IDs / variant IDs | 2104 each |
| Unique full non-empty articles | 2053 |
| Article missing | 51 |
| Manufacturer field present | 0 |
| Brand explicitly in name | 832 |
| Manufacturer unconfirmed | 1272 |
| Unique identified brand + full article pairs | 830 |
| EXACT_TEXTURE | 4 |
| OFFICIAL_PREVIEW | 113 |
| COLOR_ONLY | 0 |
| MISSING_VISUAL | 1987 |

The visual counts describe the prepared registry. Current staging still has only the original four exact textures. Brand counts: EGGER 164, BYSPAN 215, ULTRADECOR 301, EXTRAVERT 150, KRONOSPAN 2, unconfirmed 1272. Full structures, AU prefixes and thickness suffixes are never stripped to create a match.

The four accepted EGGER images are byte-identical to the base. New previews were collected only after exact official page-title matching. All are OFFICIAL_PREVIEW; physical extents are unconfirmed and the UI explicitly labels the scale approximate while preserving image proportions. Average colors were removed because an average is not a confirmed manufacturer color. Failed previews clear the previous map, use a neutral fallback, and update the missing-visual notice.

GET `/api/v2/catalogue/visual-coverage` is protected by `catalogue.read` and returns exact identities, status, source, reason and all missing rows for the active/selected release. It exposes no prices.

User workbook `Martin-Forest-Texture-Coverage.xlsx` contains summary, all 2104 records, and 1987 missing records with editable image and identity-confirmation fields. Saved separately for the user; do not commit raw source/catalogue/workbook into the public repository.

## Client room prepared

Existing Technical/Client modes and renderer retained. Presets: Светлая студия, Тёплый интерьер, Нейтральный шоурум. Wall color, floor (light stone, wood, concrete), lighting, floor joints, room trim and soft client shadows are implemented. No new cabinet modules.

Display settings are separate `scene.displaySettings` and participate in history. `scene.materialIdentities` stores materialId/article/manufacturer by variantId. Display settings do not enter canonical production or native export. Browser save/load/export and 20-module performance checks are prepared but have not run; do not claim FPS or visual acceptance.

## Pricing foundation prepared

`actualWidthMm` derives from saved canonical `item.width`. `pricingWidthMm` is derived by `pricingCategory()` and returned in ModulePriceBreakdown. It is not duplicated in furniture geometry. Rule: `max(300, ceil(width/50)*50)` through 1000; above 1000 is CUSTOM with no capped width. All requested boundaries pass.

An isolated copy at the category width uses the same production generator. Actual BOM and category BOM are separate. The breakdown includes sheetMaterials, edging, hardware, operations, extras, totals and missing data/rules. Panels use productionParts; hinges use FR3D donor counts; legs use kitchenLegs. Undefined edge/fastener/shelf-fitting/handle/operation rules remain null/PRICING_RULE_MISSING. Unknown rates are null/PRICE_DATA_MISSING. Explicit matching BYN minor-unit rates are supported; markup is never assumed. Incomplete inputs never yield a zero or sale total.

Kitchen extras derive once from actual kitchenRuns. UI shows actual width, category, breakdown and missing-price notices. Future matrix descriptors contain exactly 45 donor-width pairs without invented prices.

## Checks and continuation

Local: 107 planner/geometry/material/room/pricing JS tests plus 16 order-entry helper tests passed. Backend: 142 passed, 217 skipped because no isolated Postgres exists here. The 13 visual/schema tests are included in the 142. Syntax/compilation and git diff checks passed. Original four image bytes verified unchanged.

Full regression, browser persistence/native export, client screenshots, performance and published smoke remain pending. The workflow is prepared for this branch. With explicit GitHub payload approval recorded:

1. Push the latest clean commit only to `mf-visuals-pricing-20260927`.
2. Complete every WebGL planner acceptance job, fix actual failures, and inspect screenshots/performance.
3. Only after green checks, fast-forward `martin-forest-v2-staging` and confirm exact-SHA Railway SUCCESS.
4. Run published asset/browser smoke and report actual deployment ID, SHA, regression and performance evidence.

User report path: `/workspace/scratch/7ad058d621a4/outputs/visual-coverage/Martin-Forest-Texture-Coverage.xlsx`.
Authenticated browser remains on a synthetic order's material search; only search fields were used, no save or submission. The source and complete DOM verification snapshots remain in the conversation scratch directory.
