# Martin Forest — Stage 0–1 staging foundation

Scope: SPEC v2 C/D/G/H/L/O/P/Q and the explicit Stage 0–1 task. No Stage 2–9 implementation.

## Provenance and isolation

Integration branch: `martin-forest-v2-staging`, from visual preview
`5c97a60145569b7d1df99f5fce5341587db2f75c`, descendant of functional baseline
`4fb9d5ceb146480be540a39b454119ea84daa98f`.
`backend/main.py`, `backend/requirements.txt`, `backend/README.md` are exact copies from
Bridge `2031c09c2f9d8690cb75856b0a4cadb1533a411b` (see `bridge-provenance.json`).
They are retained as the integration source, never imported or packaged by the staging runtime.
No legacy router is mounted and no legacy contract is changed. The v2 FastAPI entrypoint adds
infrastructure modules alongside that source. The preserved frontend/v9 is not served yet.

Before/after control point evidence lives in this folder. Baseline, preview, main and the Bridge branch
must never be pushed by the staging workflow. CI has contents-read permission and no deployment secrets.

## Current infrastructure blocker

Railway refused creation of `Martin Forest V2 Staging` with:
`Free plan resource provision limit exceeded. Please upgrade to provision more resources!`
No staging project ID, database, volume, credentials or deployment was provisioned by this attempt.
The existing preview project has only its existing environment named `production`; creating a new empty
environment is not supported by the connected plugin. The cloud browser is not signed in.
No resources were deleted/reused to bypass quota and no billing/plan changes were made.

The checked-in code and CI verification do **not** mean cloud Stage 1 acceptance is complete.
Cloud persistence and cloud restore remain NOT YET VERIFIED until the infrastructure blocker is resolved.

## Runtime boundary

Entrypoint: `backend.v2.app:create_app --factory`. Only `/health` and `/robots.txt` exist.
No UI, registration, admin, order submit, upload, download, OBLX, pull, ack, event or Telegram routes.
Every response, including errors, carries `X-Robots-Tag: noindex, nofollow, noarchive` and `no-store`.
Noindex is a crawler directive, not authorization. Private data is inaccessible because no serving route
or static mount is installed. Until Stage 2, synthetic writes happen only through the operator CLI.

Settings reject SQLite, absent environment/namespace, production project ID, existing preview environment,
legacy `DATABASE_URL`/`AGENT_API_KEY`/Telegram variables, unpinned DB host, non-staging DB/user names,
enabled Agent/outbox dispatch and (on Railway) storage outside a mounted volume.
Only `MF_DATABASE_URL` points to the dedicated staging Postgres. There is no production secret reader.
Stage 1 has **no Agent credential or Agent listener**; a fresh credential for a fake consumer is unnecessary
until such a consumer is added. This is not a claim that live staging credentials have been compared.

## Schema and transactions

Migration: `backend/v2/migrations/0001_foundation.sql`.
Runner: `python -m backend.v2.migrate` uses a transaction, advisory locks and SHA-256 migration journal;
it rejects checksum drift, unknown migrations and initial deployment into a nonempty database.
No ORM `create_all`, implicit SQLite fallback, manual domain DDL or destructive down migration.

17 tables (including migration/identity metadata):

- `mf_schema_migrations`, `mf_environment`
- `mf_users`, `mf_sessions`, `mf_email_verifications`
- `mf_roles`, `mf_permissions`, `mf_user_roles`, `mf_permission_grants`
- `mf_orders`, `mf_order_revisions`, `mf_manager_assignments`
- `mf_files`, `mf_audit`, `mf_outbox`, `mf_job_events`, `mf_production_jobs`

No price/catalogue/Excel/Bazis business entities are implemented.
Order IDs are text to preserve existing Bridge IDs in a future explicit migration; new fixture IDs use UUIDs.
Composite foreign keys prevent cross-order revision/file/job links. Immutable revisions and journals have
database triggers. Credentials/tokens have hash columns, with no authentication flow implemented.

Roles are definitions only. Authorization requires an exact permission grant, current object scope and
account state. No wildcard permission is allowed. `all` scope is honored only for an explicit admin grant.
Client OBLX denial takes precedence over generic/accidental grants; service_agent and job scopes remain denied
until leases exist. Role/user administration and full email/RBAC flow are Stage 2, not implemented here.

`record_event()` cannot commit or send anything. Caller writes domain state, audit and outbox through the
same connection/transaction. Failure of any part rolls back all three. Outbox destination is constrained to
`local_only`, status defaults to `paused`. All jobs use the database's `mf.staging.*` namespace and can only
be `blocked` or `cancelled`. No scheduler/consumer/producer connects to any external Agent.

## Private file protocol

`BlobStore` is the storage interface; `VolumeStore` is the initial adapter. An object-storage adapter can
replace it without changing file identity, classifications, hash or relations.

1. Commit an `mf_files` record with status `staging` and expected SHA-256/size.
2. Write a private temporary file, fsync it, atomically publish a new immutable key, fsync directory.
3. Read/verify bytes, then mark `ready` and write audit/outbox in one transaction.
4. On failure retain a `failed`/`staging` manifest. No file becomes ready prematurely. A process kill between
   steps leaves a traceable key for future reconciliation. Unready files are not read by the helper.

Storage keys are server-generated and do not contain original names. Traversal/symlinks and overwrite are
rejected. `kind=oblx` is internal; no OBLX is generated or tested. The fixture is harmless text with `kind=test`.
Telegram is absent. File bytes, DB dumps and credentials must never be committed to this repository.

## Tests

Local: `python -m pytest tests/stage01 -v`. Database tests skip explicitly if no test Postgres is configured.
GitHub workflow `staging-foundation.yml` starts a disposable native Postgres 17 on an isolated job Docker
network with no published host ports, no production secrets and no Railway access. It checks migrations,
constraints, transaction rollback, current RBAC scope, file failures/integrity, HTTP exclusions and a real
`pg_dump` → `pg_restore` into another database with row counts and file hashes. Evidence is a workflow artifact.
This verifies the implementation only; it cannot prove Railway volume mounts or redeploy persistence.

## Deferred, unchanged

No LHDF/catalogue changes, Excel parsing, qty handling, 621 PO/PE, AUTO, sheet/price/tariff/discount logic,
PDF, full email verification, OBLX generation, Agent v2, Bazis execution, Windows paths, photos, homepage,
3D or scraps work. No existing user/order data migrated. No production backup or restore attempted.

See `RUNBOOK.md` for provisioning, cloud acceptance and rollback. Stop at Stage 0–1.
