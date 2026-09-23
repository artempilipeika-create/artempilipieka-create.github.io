# Stage 4 — staging only

Branch `martin-forest-v2-staging`. No production cutover, Agent, BAZIS, OBLX generation or PDF.

## Checkpoints and migration

Pre-change HEAD `96f320cef3ef5823c9ac35955fd5905ca500958a`; runtime `267ed0cf8ac4439f82543dec1a79bad67fd4de63`.
Pre-change DB and all seven registered private files: `/mf-private/backups/pre-stage04`, native dump SHA-256 `77b6afbfd2371efe9a5d41b3eb40eae4fba24e940c259716d6ec7ab890ccbfd7`.
Actual execution: Railway deployment `21d932d7-a476-476c-b482-97c4808fad78`, `MF_STAGE04_BEFORE` log. Counts in `pre-stage04.json`.
The temporary backup command was replaced by ordinary startup in deployment `5abeef88-fd6c-428b-b6cd-35b40feb65d9`.
Startup verifies the dump and backed-up file bytes before applying `0004_order_calculation.sql` to the existing Stage 3 database. Migrations 0001–0003 are unchanged.

## Version selection

`GET /api/v2/financial/defaults` is permission protected. Geometry and seven confirmed rates are seeded once. Open policies remain null. No sale-price book or discount profile is invented from raw master D.
Admin with explicit `financial.profiles.manage` can create a production profile, tariff book, approved sale-price book and discount profile through `/financial/*`. Every approval carries source/reason/version; each book is sealed atomically. Use `/financial/defaults` with `expected_version` for an explicit default change. Synthetic versions cannot become global defaults.
An explicit order financial context can select approved versions for that order; this is also how synthetic acceptance fixtures are isolated. It never modifies old calculations. A changed production profile requires a new revision; recalculation of an old revision retains its geometry profile.
Manager with assigned `discounts.override` may select an approved order discount profile with a reason. Customer profile changes and order overrides affect newly requested calculations only.

## Revision and calculation sequence

1. Create/import an order using Stage 2/3 API. Raw imports, templates, identity resolution and AUTO are unchanged.
2. POST `/orders/{id}/revisions`, `If-Match`, explicit parent/reason, optional exact detail input. Every active raw row is retained. An explicit correction links `draft_row_id` and a reason; omitted rows are not dropped. Clients cannot choose financial profiles.
3. POST `/orders/{id}/calculations` with only `revision_id`. The server loads all financial inputs. Unexpected monetary fields or floating-point dimensions are rejected. Geometry accepts decimal strings/integer JSON values.
4. GET `/calculations/{id}` returns the same immutable DTO. GET `/orders/{id}/calculations` lists history. POST `/calculations/{id}/recalculate` with a reason makes a new calculation using current commercial selections and pinned revision geometry.
5. POST `/orders/{id}/submit`, `If-Match` and `Idempotency-Key`. Self-prepared supplies revision and preliminary calculation IDs. Unknown prices permit manager review; invalid/unresolved production inputs require explicit `handoff_problematic`. Manager-assisted needs a saved source and meaningful comment; raw problematic rows survive and no calculation/job is automatically created.
6. Submitted content cannot be updated or deleted. Manager changes use a new child revision and clear any previous approval pointer. `/review` moves submitted to review with optimistic locking.
7. `/calculations/{id}/fix` returns `409 BAZIS_RUN_REQUIRED`. No Stage 4 path creates final calculations or advances to production.

Submission receipt preserves the request, preliminary calculation ID/state, revision and idempotency hash in the same transaction as submit/audit/outbox. The calculation cannot be embedded retroactively into already hashed revision content; the immutable receipt is the association.

## Arithmetic and honest completeness

Guillotine vertical-first estimator v1 uses Decimal coordinates, explicit rotation/grain restrictions, fixed sort and placement tie breaks, full clean sheets, and cut segments from the estimated plan. It is not mathematically optimal or a calibrated native BAZIS model. Trimming is excluded from nesting segments; billing requires an approved operation scope.
Money is HALF_UP per line to 0.01 BYN; categories sum rounded lines, then each category discount rounds once. Sheet price derived from m² is not prematurely rounded.
Unknown price is null, never free. `total` exists only for complete preliminary calculations. `calculated_part` is the known net part; it is null if the discount profile itself is unknown. `known_gross`, reasons and unresolved categories remain explicit.
NC-01 edge procurement, NC-02 thick/complex classification, NC-03 glue area and NC-09 disputed cut scope remain open. Approved synthetic policies test mechanisms without establishing a real global policy. NC-05 raw prices are never automatically promoted.

## Backup, restore, persistence

The only authorized databases are in the separate Site Preview project. `python -m backend.v2.backup backup PATH` creates a native dump and hashes/copies manifest bytes under the backup lock. Existing destination or incomplete manifest fails closed.
Restore requires a NEW empty database containing `_restore` in its name, a separate empty storage root, matching staging namespace and verified input SHA. `python -m backend.v2.backup restore PATH` must run with Settings explicitly targeting that copy; never change working staging to a production DSN.
`stage04_operator.retire_restore(settings, synthetic_email)` is an explicit operator-only maintenance function, not an HTTP endpoint. It retires the temporary synthetic operator, makes a fresh backup, creates a new staging copy and compares entire financial/catalogue/file tables plus revision/input/result hashes and every private file SHA. It does not restore over working staging.
`stage04_operator.verify_persistence(settings)` compares the working DB/bytes after a later redeploy with that recorded state. Evidence paths: `/mf-private/stage04-restore-evidence.json`, `/mf-private/stage04-persistence-evidence.json`.
There is no claimed automated backup schedule/RPO or production restore verification.

## Rollback

Do not deploy Stage 3 against a database with migration 0004: checksum/version readiness deliberately refuses unknown migrations.
For application rollback preserve current Stage 4 data with a fresh backup, disable staging write exposure, and deploy a previous schema-compatible Stage 4 commit. For a full return to Stage 3, restore the pre-stage04 backup into a NEW staging copy and separate private root, verify it, then point only the staging app to that restored copy and pinned Stage 3 runtime. Preserve the current Stage 4 database and bytes for reconciliation; do not overwrite or drop them. Transport and dispatch stay disabled.
Production, baseline, main, visual preview and Windows paths are outside this procedure.
