# Stage 6 staging operations and rollback

Only project `6d754ad4-ba7b-45f8-8c5e-356387e7de06`, environment `ee625678-c15e-452d-9761-cda99274839f`, API service `9aacf7bf-edd5-4f08-9423-3fbabea59268`. Railway calls the environment `production`; the project is the isolated **Martin Forest Site Preview** project. Its Postgres service is `e773c03c-1f76-4f78-adb7-2132528c3a19`; private volume is `29b79637-3f45-4ddd-ad2c-028d6b96af8e` at `/mf-private`.

## Credentials and transport

`MF_STAGING_AGENT_API=enabled` exposes only the separate v2 protocol. Keep `MF_AGENT_TRANSPORT=disabled` and `MF_OUTBOX_DISPATCH=disabled`. Never set `AGENT_API_KEY` or the legacy `DATABASE_URL` on this service. Staging uses its dedicated `MF_DATABASE_URL` and `mf.staging.v2-preview` namespace.

Provision using `backend.v2.agent_auth.issue(settings, authorized_operator_uuid, allowed_capabilities)` from a private operator process. The operator needs the explicit granular permission `production.agents.manage`; no public registration endpoint exists. Capture the returned credential privately once. The database stores only its digest and binding. Agent actor has `service_agent`, no browser grants, and an expiry of at most 30 days. Revoke with `agent_auth.revoke(...)`; current identity is checked for every operation. Never paste secrets into Git, browser code, reports, shell command arguments or logs.

The shipped `python -m agent.runner --root <dedicated-staging-directory> --namespace mf.staging.v2-preview` reads `MF_STAGING_AGENT_CREDENTIAL` and is **calculate/fake only**. The HTTPS origin is pinned to the staging service. It creates its own inbox, work, outbox, failed, archive and logs directories, plus a durable local ledger. SQLite here is solely the Agent's local execution ledger, not the server database.

Native execution is intentionally not implemented without evidence. Never enroll the synthetic CI attestor in live staging. Never use `D:\pgm` as a test directory. See NATIVE_CALIBRATION.md.

## Snapshot and restore

The database/file backup uses the existing global backup lock: application transactions use its shared form; the backup holds the exclusive lock while pg_dump and private bytes are copied. Manifest records SHA-256, size, status, namespace and database. Credentials are passed to pg_dump/pg_restore only through the child environment.

`backend.v2.stage06_operator.restore_checkpoint(settings)` creates a uniquely named backup, a new `mf_staging_restore_stage06_*` database on the staging Postgres service and a separate `/mf-private/restore-stage06-*/storage` root. It refuses an existing checkpoint and never restores over the working staging database. `verify()` compares every `mf_*` table's canonical row hash and count, all ready private bytes, PDF/revision/calculation/package/result seals, bindings and current fencing. `verify_persistence()` compares the recorded state after a fresh deployment.

The live staging gate stays closed, so the live restore contains no real verified native final candidate. Positive final-candidate restore coverage uses isolated CI databases with explicitly synthetic signed adapter reports, not production or BAZIS evidence.

## Rollback

1. Freeze staging writes and disable `MF_STAGING_AGENT_API`; retain legacy transport/outbox disabled. Revoke any active staging Agent credentials. Record current state and back up Stage 6 before rollback if retaining new synthetic evidence is necessary.
2. Verify `/mf-private/backups/pre-stage06/manifest.json`, dump SHA and blob hashes against pre-stage06.json. Do not run an in-place migration downgrade.
3. Create a **new empty staging rollback database** whose name contains `_restore`, plus a new private storage root. Restore the pre-Stage-6 dump/bytes there using `backend.v2.backup.restore` with an explicitly scoped Settings instance. Never target either working staging or production database.
4. Verify restored Stage 5 document/calculation/file seals against the recorded pre-state. Switch only this staging API's `MF_DATABASE_URL`, `MF_DATABASE_NAME` and private storage root to that verified copy; retain isolation assertions/secrets/namespace.
5. Pin the staging service source to accepted Stage 5 runtime `1d7b3f5e96809644655a31a9501092137294ef2c`, start command `python -m backend.v2.serve`, and explicitly deploy that SHA. Check health, noindex, private file deny and original Stage 5 document hashes.
6. Leave Stage 6 database/storage and Git commits as evidence. Do not reset protected branches or deploy the legacy production Bridge. The maintenance pre-backup deployment is not a replayable rollback command: its one-shot backup path already exists.

Stage 6 migration adds immutable structures; compatibility with the old application is not a substitute for a verified restored copy. A full return to Stage 5 is an explicit rollback operation, not automatic deployment retry.
