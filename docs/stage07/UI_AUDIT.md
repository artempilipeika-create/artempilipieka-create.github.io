# Stage 7 — before implementation

Accepted HEAD: 3951a746c778e668f7d0ec4372f9002a2f3ee692; clean working tree.
Runtime: 7ca146dbb5f2522604f8a7761e5763ec91f659a5; deployment 2769bd61-0279-4f83-a152-c3aff6036e1d SUCCESS; normal python -m backend.v2.serve.

## Findings and contract boundaries

- Stage 6 serves only the v2 cabinet, not the preserved photographic public pages or v9 workspaces. The legacy scripts use different auth/order/calculation contracts and browser OBLX export. Mounting public/ wholesale would violate Stage 2/6 boundaries.
- Preserve all legacy sources unchanged. Reuse the accepted public HTML/composition, image and design tokens; serve only explicitly enumerated UI assets in v2. Adapt presentation to existing v2 endpoints, without changing request/response schemas or permissions.
- v2 supports manual immutable revisions, exact catalogue selection, import templates and review, separate edge sides, preliminary calculation, private documents, staff administration and scoped queue. These can have working UI now.
- Missing contracts: v2 has no 3D subscription/project API, scraps inventory API, arbitrary source-file intake independent of the template/import flow, full granular capability projection or grant listing. Do not manufacture those APIs in Stage 7. Preserve legacy implementation; show an honest unavailable state where secure integration requires future work. No silent v9 fallback.
- No generic raw JSON/audit payload rendering in client UI. Existing client projection remains authoritative. Staff role chooses navigation only; every operation remains authorized by existing server RBAC.
- Public photo repeated three times in the accepted preview. Remove repetition; keep the existing hero reference asset, distinguish it from an actual company-production photograph. Additional verified company photos remain a content limitation.

## Scope

backend/v2/cabinet_ui.py, cabinet_assets, new ui_assets and UI-only static router, app router registration; build script; new Stage 7 UI tests and CI job; documentation/evidence. No migrations, catalogue/financial/production/auth contracts or legacy sources change.

## Verification

360/768/1440 px and 200% zoom, keyboard/focus, labels, error/empty/disabled/loading states; real API role/isolation tests plus browser UI scenarios; complete prior 195 regressions; isolated staging only.

## Compatibility finding during CI

The unchanged Stage 1 regression explicitly requires `/` to return 404. New public UI is therefore opt-in via `MF_PRESENTATION_UI=enabled`; absent/disabled retains the foundation-only route set. Stage 7 tests explicitly enable that deployment feature, old tests are untouched. The flag has no domain/auth/storage effect. Rollback may disable the flag or pin the accepted Stage 6 runtime.
