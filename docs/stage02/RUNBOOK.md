# Stage 2 staging operations

Scope: project `6d754ad4-ba7b-45f8-8c5e-356387e7de06`, environment
`ee625678-c15e-452d-9761-cda99274839f`, app `9aacf7bf-edd5-4f08-9423-3fbabea59268` only.
The environment's Railway label is `production`; this is the separate **Site Preview project**, not production Bridge.

## Secrets and normal mode

- Keep the existing dedicated Postgres references and `/mf-private/storage` private root.
- `MF_WEB_ORIGIN=https://martin-forest-v2-staging-production.up.railway.app` is the exact trusted origin.
- `MF_EMAIL_SEAL_KEY` is a new random staging-only Fernet key. Never copy production credentials.
- `MF_SECURITY_API=enabled`, `MF_STAGE01_PROBE_MODE=off`, `MF_STAGE02_PROBE_MODE=off` normally.
- `MF_AGENT_TRANSPORT=disabled`, `MF_OUTBOX_DISPATCH=disabled` always during this stage.
- Do not add SMTP, Telegram or Agent credentials. No polling dispatcher exists.
- Start: `python -m backend.v2.serve`. This runs startup/migrations and then uvicorn in one process, with access logs and forwarded-header trust disabled.
- Public writes require `Origin` equal to `MF_WEB_ORIGIN` and JSON. Cookies are Secure/HttpOnly/SameSite=Lax.
- Do not enable public static/volume serving or mount v9/Bridge routers.

## First administrator

No default administrator/password is shipped. Synthetic probe users are disabled, their grants and sessions revoked.
An authorized staging operator can create the first real admin inside this service:

```sh
python -m backend.v2.operator bootstrap-admin --email OPERATOR_EMAIL < /secure/private-password-input
```

The password must be at least 12 characters. The temporary input file must be private and removed by the operator afterward.
Prefer an interactive stdin pipe from a password manager. Do not put the password in CLI arguments/history/logs.
The command refuses to run if any admin role exists. It issues **explicit Stage 2 permissions**, not `*` or future production rights.
The admin begins unverified. Record its returned delivery ID, then explicitly collect the fake message:

```sh
python -m backend.v2.operator collect-fake-email --delivery-id DELIVERY_UUID
```

This prints only the private sink file ID. An authorized operator can read its mf_files storage_key and private bytes locally.
Open that message's trusted-origin fragment link and press the confirmation button; GET itself never confirms.
Do not publish sink bytes or add a public sink endpoint. Normal staff are created through `/api/v2/admin/staff`, receive no implicit grants,
log in, request a verification message and follow the same local collector flow. NC-07 remains open.

## Backup and restore

Startup on the exact Stage 1 schema makes a native Postgres dump plus all manifest-tracked private bytes at
`/mf-private/backups/pre-stage02` **before** applying migration 0002. An existing backup directory blocks that first migration attempt:
inspect it privately; do not delete/overwrite it automatically. The backup manifest marks completeness and includes SHA-256.
The image contains pg_dump/pg_restore 18 to match the staging server major version.

Subsequent operator backup:

```sh
python -m backend.v2.backup backup /mf-private/backups/CHOOSE_NEW_UNIQUE_NAME
```

Keep `MF_EMAIL_SEAL_KEY` separately in the secret manager. DB/file backup deliberately excludes environment secrets.
Without the same key, queued encrypted verification messages cannot be collected; revoke those requests and issue new ones after rotation.
Backups and restore copies contain sensitive private data; never expose them through the web service or Git.
A backup on the same volume survives redeploy, but does not provide protection against loss of that volume.
Off-volume scheduled backups and Railway platform snapshot restore are **NOT VERIFIED** by this stage.

Restore only into an **empty different staging database**, name containing `_restore`, and an empty different private directory.
Construct a separate Settings/isolated operator environment with dedicated staging target pins; never replace the source URL with a production URL.
Run `python -m backend.v2.backup restore BACKUP_DIRECTORY`. It rejects the original database, nonempty targets,
namespace mismatch, checksum failure and mismatched manifest rows. Verify record counts and private file bytes before any use of that copy.
The smoke probe implements the full safe sequence and records non-secret evidence; it never points the main application at the copy.

## Rollback

1. Fast containment: set **only this staging service** `MF_SECURITY_API=disabled`, both probe modes `off`, redeploy the same Stage 2 build.
   Health and robots remain; all other paths return 404. This preserves the migrated DB, audit and private bytes.
2. Prefer a tested corrective Stage 2 commit with the same migrations. Source is manually pinned; Git push does not deploy automatically.
3. Do not run old Stage 1 code directly against a DB with migration 0002: its migration/readiness checks intentionally reject unknown versions.
4. For a full Stage 1 rollback, restore `/mf-private/backups/pre-stage02` to a **new** staging DB/private directory,
   verify it, then configure only the staging app to use that copy and the old runtime `71567afa146a6a9126bbf0cca4ce236de646098c`.
   Restore the old startup command and turn all probes off. Preserve the current Stage 2 DB/files as evidence; no destructive down migration.
5. Baseline, visual preview, main, production Bridge/Postgres/Agent and Windows paths are not part of rollback.

## Stage boundary

Draft metadata save, security gates and synthetic artifacts only. Verified submit returns `409 PACKAGE_NOT_READY`;
approve returns `409 CALCULATION_INCOMPLETE`. No fake business transition or OBLX generation is performed.
Production staff may review an explicitly granted **blocked synthetic job** artifact. This grants no job execution.
`service_agent` browser login and all artifact access stay denied until a separately authorized job lease/credential stage.
No production Agent key/transport, real mail, client frontend, parser, pricing or manufacturing integration is activated.
