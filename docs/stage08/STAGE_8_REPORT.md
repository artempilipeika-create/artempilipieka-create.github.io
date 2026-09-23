# Martin Forest — Stage 8 acceptance evidence and migration rehearsal

Date: 2026-09-23. **Submitted for review, not self-accepted. No Stage 9 or production cutover.**

## Checkpoint and scope

Accepted source: branch `martin-forest-v2-staging`, HEAD `496974b94c6e9a3965153f453987145ac4ab8ab9`, runtime `a8228b6e0cf7847c5d7a54b2499e39cbd05ee5fb`, deployment `7f509b33-b747-4bb2-b91a-4f23f186450f`. Working tree was clean; protected refs and deployment IDs were checked read-only.

Tested Stage 8 runtime: **`bc6b96101a9eaf88732e1342eaf18c2579e6a385`**. Final report/evidence commit is a descendant with the same executable tree; final HEAD is returned separately and can be resolved from the staging branch. Final Railway deployment: **`af8ba2e0-dc20-4239-afaa-d6b90c015364`**, SUCCESS, persisted start command **`python -m backend.v2.serve`**, no pending staging work. Railway `/health` readiness passed. Configuration evidence: `environment.json`.

Product API, auth/RBAC implementation, migrations 0001–0006, calculation engine, renderer, Agent package/protocol and all UI/frontend assets are unchanged from the accepted Stage 7 checkpoint. Added standalone Stage 8 operator/scenario modules, six tests, one rehearsal-only SQL file, CI matrix entry and evidence. None of the operator modules is imported by normal serve or a new HTTP endpoint.

The provided Stage 8 instruction file is physically truncated in section 21 at “PAS”. All complete requirements were used; no omitted tail is assumed.

## Results and acceptance matrix

Full final CI: [run 35896674899](https://github.com/artempilipeika-create/artempilipieka-create.github.io/actions/runs/35896674899), **248 PASS / 0 FAIL / 0 SKIP**:

| Suite | PASS |
|---|---:|
| Stage 1 | 28 |
| Stage 2 | 20 |
| Stage 3 | 46 |
| Stage 4 | 27 |
| Stage 5 | 30 |
| Stage 6 | 44 |
| Stage 7 presentation | 37 |
| Stage 7 Chromium browser | 10 |
| Stage 8 cross-layer/rehearsal | 6 |

All original 242 tests remain intact; no prior assertion/test was removed or weakened. Exact job IDs and summaries: [ci.json](ci.json).

[Q_MATRIX.md](Q_MATRIX.md) covers all **91** SPEC Q criteria with exactly one status each: **78 PASS, 1 FAIL, 12 NOT VERIFIED**. These acceptance counts are not CI test counts. `UI-01` fails its literal three-photograph requirement: the accepted visual fix uses one generated kitchen concept. No Stage 8 redesign was performed. Native, real legacy and other incompletely exercised criteria are not counted as full PASS.

[OPEN_NC.md](OPEN_NC.md) records all NC-01–09, affected P0/P1 boundaries, owners/evidence needed, and remaining criteria. Their safe software fallbacks do not constitute business approval.

## Actual staging HTTPS scenarios

[Live evidence](live-evidence.json) records three synthetic orders and **49 explicit HTTP status assertions**. Test inputs and accounts are synthetic; no real customer order was used. All temporary accounts were disabled, sessions/grants revoked and the temporary admin role removed.

| Scenario | Stable order ID | Verified boundary |
|---|---|---|
| Self-prepared | `9f67822e-326c-4824-9540-2c78e6018cd4` | Excel → qty=0/error retained → reasoned correction to qty=3 → revision → complete preliminary calculation → private immutable PDF → submit → review |
| Manager-assisted | `2b2468ca-b867-4310-9f1d-5889475d22ad` | Original Excel/raw intake → submitted parent → assigned manager correction → child revision → preliminary/PDF; parent remains identical |
| Mixed self-prepared | `7742a857-b57e-4175-af07-1792f170a269` | Exact article material, articleless customer HDF, ordinary 18 mm part, 18+18 recipe, four distinct edge IDs, grain/rotation, original qty=0 preserved; explicit problematic handoff to review |

The mixed calculation remains **`needs_confirmation`, total `null`**. Its unknown classification is not rendered as a valid final price. Four distinct side assignments remain explicit in the revision; AUTO/manual preservation is additionally exercised by unchanged Stage 3 regressions. Full stable revision/calculation/source/document IDs, release and financial context references, PDF SHA values and HTTP results are in the evidence.

No live production job was created in these flows. Both complete preliminary calculations returned **409 `BAZIS_RUN_REQUIRED`** when finalization was attempted. Audit/outbox linkage and original XLSX bytes were checked. The original 26 private files remained byte-identical.

Security responses include foreign-order/document denial, client staff denial, owned OBLX denial through file/download/preview/document GET/HEAD/Range aliases, current scoped accounting/viewer grants, immediate revocation, blocked manager and client-safe order/history/document projections. Legacy/ZIP/new Agent routes, registration privilege injection, manager reassignment, email tokens and concurrency additionally passed fresh Stage 1–7 regression tests. No secret or lease data was exposed to the client UI.

The initial live rollout produced an edge 502 before creating the first order. It is not reported as a successful attempt. Recovery evidence proves **0 orders, 0 active actors/sessions/grants** for that attempt before retry. No partially created order was blindly replayed: [recovered-empty-attempt.json](recovered-empty-attempt.json).

## Isolated downstream software and migration rehearsal

New CI scenarios:

1. Self Excel correction → PDF → submit/review → immutable calculate package → fake Agent result. Exact order/revision/job/run bindings, 18+18 child quantity 6, preserved raw qty=0, audit/outbox and final denial: [ci-self-chain.json](ci-self-chain.json).
2. Manager intake → immutable parent → reasoned child → preliminary; no inherited approval/early job: [ci-manager-chain.json](ci-manager-chain.json).
3. **SOFTWARE CONTRACT PASS / SYNTHETIC:** signed synthetic result → final candidate → explicit exact approval → publish later catalogue/financial versions; original order/revision/calculation/final snapshot and PDF hashes remain unchanged: [ci-approved-snapshot.json](ci-approved-snapshot.json).
4. Synthetic legacy transfer → real backup → separate restore with canonical rows/private bytes equal: [ci-migration-restore.json](ci-migration-restore.json).
5. Rehearsal refuses working database and non-synthetic input.
6. Duplicate legacy IDs fail before data writes; no overwrite/merge.

The first CI run of the new tests had one test-isolation failure: the signed-fixture scenario reused a database containing an immutable uncalibrated export profile from the fake scenario. It correctly could not lease to the native-capability fixture. Moving the signed scenario into a separate fixture database fixed the test setup, without changing the production profile contract or assertions. Subsequent complete runs pass.

The migration rehearsal uses a fresh `mf_staging_stage08_rehearsal_*` DB, namespace `mf.staging.rehearsal8`, separate private root and a second restore DB/root. Its SQL is **outside** `backend/v2/migrations` and was **not applied to working staging**. Input: 3 synthetic users, 2 orders, 3 file records. Output: 3 separate disabled users; 2 review-only orders with sealed legacy revisions; 2 verified private files; 1 missing-byte record explicitly not restored. All eight legacy records have immutable source/entity/ID mappings and payload hashes.

Bridge order ID remains verbatim. v9 integer ID is retained in legacy mapping and `legacy_v9_id` snapshot. Equal names/phones do not merge; duplicate emails are quarantined for review rather than reassigned. Historical admin/wildcard grants are never activated. Verification needs address-bound evidence. Historical totals (179.00), payment records, comments and discount shapes remain in `legacy_snapshot`, with no current-price recomputation. Ambiguous materials stay needs_review. OBLX remains internal even when named `.pdf`. Working test DB before/after is identical.

This is a **fixture rehearsal**, not proof of migration of real production/v9 data. No authorized complete real legacy snapshot was available or extracted. `MIG-01` remains NOT VERIFIED.

## Backup, restore, state changes and persistence

Before rehearsal, a consistent working-staging DB/private-byte checkpoint was backed up and actually restored into a new DB/root:

- Dump SHA: `d428e393be5768b4f2821e4dfe9c084fcbb5e0058ee2961df340d5d76467c953`.
- Restore DB: `mf_staging_restore_stage08_60b51b2f884a`.
- All 72 canonical table snapshots and 26 private files matched: [pre-stage08.json](pre-stage08.json).

After acceptance and credential retirement:

- Dump SHA: `af88150f034a430a7ebf92b08493c33b46a679c4bbe109f09fec0a6babdbf7f8`.
- Restore DB: `mf_staging_restore_stage08_c303c2665960`.
- All 72 table snapshots and 34 private files matched: [post-stage08.json](post-stage08.json).
- Redeployment persistence evidence: [persistence.json](persistence.json).

No restore overwrote working staging. Dumps/manifests/bytes remain on private staging storage; off-site disaster recovery is NOT VERIFIED.

[State comparison](state-comparison.json) explains pre/post differences. Orders 10→13; revisions 8→12; calculations 5→8; documents 8→11; files 26→34. Eight new files are three Excel sources, three preliminary PDFs and two owned private OBLX security fixtures. Users 14→26 and sessions 19→31 reflect six retired identities from the empty failed attempt plus six retired identities from the successful attempt. Grants/roles record those explicitly retired test actors. Import/template/receipt rows, three financial contexts, one manager assignment, calculation lines/snapshots/sheet estimates/recipes, and audit/outbox (153→220 each) derive from these synthetic scenarios.

Catalogue data/releases/active pointer, price/tariff books/defaults, production jobs/runs/results/Agent requests/calibration tables and unrelated tables remain identical. Production jobs remain 2 total historical staging records; **0 live Stage 8 jobs** and **0 schema-v6 produce jobs**. No unexplained mismatch between each checkpoint and its restored copy exists.

## UI and protected environment

No UI/frontend file changed. Live public browser checks: home, about, services, preparation, 3D and login; no overflow in inspected 1363-pixel viewport; noindex retained. Fresh Chromium checks cover 1440/768/360, keyboard/focus, form labels, editor qty=0, import errors, cabinet, admin/manager scope and honest states. The browser suite uses real ASGI/Postgres transport in isolated CI. **Live mobile/tablet screenshots and live authenticated browser workflow are NOT VERIFIED**; do not confuse CI screenshots with live Railway screenshots. Live authenticated HTTPS responses are separately verified above.

Screenshots: [live home](screenshots/live-home.jpg), [CI home mobile](screenshots/home-360.jpg), [live about](screenshots/live-about.jpg), [live services](screenshots/live-services.jpg), [live preparation](screenshots/live-order.jpg), [live 3D](screenshots/live-3d.jpg), [CI editor desktop](screenshots/editor-1440.jpg), [CI editor mobile](screenshots/editor-360.jpg). [ui.json](ui.json) records provenance. Live browser navigation to JSON `/health` was blocked by that browser client; HTTPS operator readiness and Railway healthcheck provide distinct health evidence.

Protected refs: main `470776dfd3efd1db9638668d2e19ea174b7901cc`; baseline `4fb9d5ceb146480be540a39b454119ea84daa98f`; visual preview `5c97a60145569b7d1df99f5fce5341587db2f75c`; Bridge branch `2031c09c2f9d8690cb75856b0a4cadb1533a411b`.

Production Bridge deployment `dc09ba1c-7182-481d-8c62-4a9e721461c2` and Postgres deployment `168b0c29-6693-433f-9a85-552f9de65b37` are unchanged. Bridge config and variable names were read without reading secret values. Original and visual preview services, production DB/schema/data, Agent credentials/queue, Windows, `D:\pgm`, Resilio and domains were not modified. [environment.json](environment.json) records IDs/config evidence. Production Agent telemetry was not inspected, so `MIG-04` is not claimed as full PASS.

## Closed native boundary and remaining limits

Working staging remains **native NOT VERIFIED / CLOSED**: 0 calibrations, 0 verified results, 0 final candidates, 0 final approvals, 0 v6 produce jobs. Fake calculate results do not satisfy `BAZIS_RUN_REQUIRED`; a signed test fixture is confined to isolated CI. Preliminary → final candidate → explicit manager/customer approval → produce authorization are separate. No native BAZIS run, physical production, native fixture calibration or production cutover occurred.

Full unverified list: EMAIL-05; ORD-05; JOB-01/04/06/08/09/10; MIG-01/04; UI-03; E2E-01; native fields/mappings/calibration; real legacy reconciliation; external email delivery; production Agent telemetry; off-site full disaster recovery; live authenticated/mobile/tablet browser workflow; business NC-01–09. UI-01 is FAIL, not hidden as an unrelated test PASS.

Rollback and recovery: [OPERATIONS.md](OPERATIONS.md). Actual executable diff against the accepted Stage 7 HEAD: [ACTUAL_GIT_DIFF.patch](ACTUAL_GIT_DIFF.patch); full changed-file inventory/stat: [changed-files.txt](changed-files.txt), [diff-stat.txt](diff-stat.txt). The report does not authorize Stage 9. Stop for user acceptance.
