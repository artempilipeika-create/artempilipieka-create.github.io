# Stage 0–1 — isolated provisioning, backup and rollback

## Prerequisites and exact boundary

Resolve Railway's resource limit without modifying production. Create a new empty staging project (or an
empty staging environment in the preview project); do not clone existing variables/services. Record exact
project/environment/service/volume IDs in an evidence file before deployment. Never use Bridge project
`7f59bf67-56db-4f6c-b213-c9c7b9342932` or preview environment
`ee625678-c15e-452d-9761-cda99274839f` for this build.

1. Create a dedicated Postgres 17 service with a persistent volume at `/var/lib/postgresql/data`.
   Use a freshly generated password, database `mf_staging`, dedicated user `mf_staging_app`. The initial
   migration owner is staging-only. No production role/password/data import. Keep DB private networking only.
2. Create app service from branch `martin-forest-v2-staging`, Dockerfile at repository root; use
   `ops/staging/railway.toml`. Attach its own volume at `/mf-private`. Keep one replica with this volume adapter.
3. Set variables from `ops/staging/environment.example` with exact NEW infrastructure identities. Generate
   secrets inside the platform; never echo passwords or copy `DATABASE_URL`, `AGENT_API_KEY` or Telegram
   configuration. Record names/reference targets, not values. No Agent service is created.
4. Review pending changes in the new environment only, then deploy the staging service. Startup runs
   versioned migrations under an advisory lock before opening the health port. Missing/wrong configuration
   fails startup. The old v9 and legacy Bridge entrypoints must not be used.
5. Verify service config, mounted volumes, database name/user, source branch/commit and absence of legacy
   keys. Pin these IDs in the deployment record. Only a synthetic test is allowed; do not use real orders.

## Cloud redeploy acceptance (NOT YET VERIFIED)

Run in the staging service terminal with its private environment, not the production terminal:

```bash
python -m backend.v2.probe create --manifest /mf-private/stage01-probe.json
python -m backend.v2.probe verify --manifest /mf-private/stage01-probe.json
```

Capture fixture IDs/hashes and current deployment ID; then redeploy/restart the staging app through Railway.
Repeat the **verify** command only. Do not recreate the fixture after redeploy. Capture new deployment ID,
order/revision row, `mf_files` manifest SHA-256/size and verified bytes. Restart the staging DB separately
and repeat verification if safe. GET/HEAD/Range `/public/...`, `/static/...`, `/api/v2/files/{id}` and
`/api/v2/orders/{id}/oblx` must return 404; `/health` must return 200 with noindex and disabled transport.
Check that blocked jobs and paused outbox remain unchanged and existing production deployment IDs remain
identical. This proves exclusion from transport, not observation of the live Windows Agent's full history.

## Consistent backup

Use an authorized operator environment with this code, psycopg and Postgres 17 `pg_dump`/`pg_restore`
(same major version as the DB). The minimal app image does not include these operator clients.
The destination must be on a **separate durable private backup volume/object store**, never the only live
volume. Do not put dumps, manifest with customer data, or bytes in Git/CI artifacts or public file storage.

```bash
python -m backend.v2.backup backup /private-backups/unique-timestamp
```

The command takes an exclusive advisory lock. Every domain/file writer uses its shared counterpart; file
upload holds the lock across all phases. This freezes cooperating Stage 1 writers while dumping DB and
copying registered bytes. Stop external/admin writers and migrations for this window. Only a completed
`manifest.json` marks a usable bundle; it contains the DB dump hash and each file's hash/size/status.
Do not accept missing or mismatched ready bytes. Failed/unready records are retained for reconciliation.
Encrypt/restrict backup storage; schedule daily backups on the operator infrastructure when provisioned.
Daily scheduling, off-volume retention, RPO/RTO and Railway disaster recovery are **NOT YET VERIFIED**.

## Restore into a new isolated copy only

Create another empty Postgres database named `mf_staging_restore_<suffix>` with a dedicated credential and
separate empty private storage. Keep namespace the same as the source backup so identity checks and foreign
keys remain valid. No application or transport runs on the restore target. Point the operator's MF variables
to this **copy**, never the source. Restore accepts only trusted backups produced by the operator.

```bash
python -m backend.v2.backup restore /private-backups/unique-timestamp
python -m backend.v2.probe verify --manifest /private-backups/stage01-probe.json
```

Keep a private copy of the probe manifest outside the app before backup. The restore operation rejects the
source DB name, nonempty target DB/storage and corrupted input. It verifies row/file manifests; compare
counts for all mf_* tables and the exact synthetic fixture as in the integration test. If restore fails,
quarantine the incomplete copy; do not repoint the application or overwrite a working source.
A successful CI restore is evidence for the code, not a Railway/production restore claim.

## Rollback

Before any staging redeploy, record the active commit/deployment and make a verified backup bundle. No
production cutover is authorized. First rollback point before provisioning: staging branch at
`5c97a60145569b7d1df99f5fce5341587db2f75c` and **no staging resources**. This SHA is provenance, not a safe
runtime rollback target: it starts legacy v9 and must not be deployed with v2 staging variables.

If the first Stage 1 deployment fails: stop only the new staging app, retain its DB/volume and evidence.
Do not replace its entrypoint with v9 or mount files publicly. Repair forward on staging. Once a verified
Stage 1 build exists, redeploy the previous compatible Stage 1 commit while preserving data. Startup rejects
unknown schema versions. Never run destructive down migrations or restore an old dump over newer data.
For incompatible schema changes, restore to a separate copy, verify it, and make any repointing an explicit
staging operation. Production deployment, DB, Agent and `D:\pgm` remain untouched throughout.
