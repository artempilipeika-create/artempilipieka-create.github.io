# Project safety and preflight — 2026-10-12

Isolated review branch: `mf-project-safety-20261012`, based on
`cb32f5b674e4fbee6d6f2fb4d24a89b574504d1f`.

## User-visible changes

- Automatic server save after 1.4 seconds without a content change, with an
  immediate per-account device draft. Selection and camera changes alone do not
  create revisions. Completed edits, project settings and material identities do.
- Startup reopens the last saved project or offers outstanding device drafts.
  Save status distinguishes server confirmation, device-only state and conflict.
- “Версии проекта” under the top “•••” menu offers three preset names and free
  labels. Restoring a checkpoint atomically saves the previous server state first.
- “Проверить проект” reports missing/unavailable materials, incomplete pricing,
  dimensions/placement, countertop seams, native-source/adjustment requirements,
  and opening clearances. Clicking an item selects and frames its cabinet.
- Vitrine glass and profiles remain fixed materials and are excluded from missing
  LDSP assignments. Their pricing still needs explicit rates.

## Persistence protocol

The captured draft owns its request and expected revision. Writes are serialized;
edits made during a request become a subsequent save. Uncertain replies retry the
same UUID and payload, including after reload. A 409 pauses writes without adopting
the server revision. Designers can open the server copy or save their own copy.

Migration `0011_3d_project_safety.sql` adds two tables only: immutable named/restore
checkpoints and small idempotency receipts. Receipts omit scenes. Existing scene
JSON, project identities, shares, order identities and production integration stay
compatible. New API routes use existing authenticated ownership and exact grants.
Checkpoint insertion, restore, receipt and audit are one transaction.

Pending checkpoint/restore operations also survive reload. If a restoration reply
was lost and the designer continued editing, those later edits become a separate
recoverable device draft before the restored scene is displayed. Device storage
errors are visible and prevent unprotected navigation/closing with pending edits.

## Check boundaries

Door sweeps use the canonical pivot and configured angle, sampled in one-degree
steps, with polygon intersection and vertical ranges. Tests include rotated
cabinets and measured protrusions. Drawer clearance uses slide length as an
estimate of full travel. Unspecified mechanisms are explicitly unverified.
Handles, simultaneous opening of neighboring fronts and room-door motion are not
certified by this check. The existing 90-degree Z1 opening remains intact.

Pricing warnings reflect the existing pricing engine: missing rates, edging or
operation rules are not substituted with invented prices. Countertop joins remain
the designer's standard/euro selection and are surfaced for review and costing.

## Validation

- `node --test tests/webgl/*.test.mjs`: 308 passed, including 17 new persistence
  and geometry cases (lost acknowledgements, recovery, conflicts, in-flight edits,
  device quota, validation rejection, rotated openings, glass exclusions).
- `pytest -q tests/test_vitrine.py tests/test_countertops.py`: 10 passed.
- Three API tests verify receipts, original-revision replay, stale revision denial,
  named checkpoint replay, atomic restore backup, ownership, foreign checkpoints
  and archived project denial. In this environment they passed against disposable
  embedded PostgreSQL (PGlite); all migrations and app readiness ran unchanged.
  Native Postgres CI remains available through `MF_TEST_DATABASE_URL`. Native
  multi-process locking was not exercised by the embedded fallback.
- `scripts/verify-project-safety-database.py --pglite-bin <temporary-prefix>/node_modules/.bin/pglite-server`
  runs that fallback without changing the app's database configuration or runtime
  dependencies. It uses one test socket with prepared caching disabled to match
  PGlite's single-backend model; actual SQL transactions still commit/roll back.
- `scripts/verify-project-safety-browser.py --out <scratch-directory>` uses local
  static assets, actual WebGL and intercepted synthetic API requests. It checks
  autosave, named restore with backup, reload after a lost response, two-tab
  conflicts, save-as-copy, edits after a lost restore reply, duplication, cabinet
  selection and a 390 px viewport. Screenshots inspected; no JS errors.

Deployment target is only `martin-forest-v2-staging` in **Martin Forest Site Preview**.
No production orders, outgoing messages or production infrastructure are involved.
The strict migration journal means future deployment/rollback builds must include
migration 0011; an older build cannot pass readiness after the additive migration.
