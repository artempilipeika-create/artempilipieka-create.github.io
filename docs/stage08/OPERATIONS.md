# Stage 8 evidence operations and rollback

Scope: isolated project `6d754ad4-ba7b-45f8-8c5e-356387e7de06`, service `9aacf7bf-edd5-4f08-9423-3fbabea59268`, environment `ee625678-c15e-452d-9761-cda99274839f`. Its Railway environment label is `production`, but this project is the separate staging project. Never apply these operations to the Bridge production project.

## Checkpoints

`backend.v2.stage08_operator` is an explicit operator module, never called by normal `backend.v2.serve` or any HTTP route. It does not add/apply a migration. Normal startup may validate the six existing migration checksums; no Stage 8 domain migration exists.

1. `pre-stage08` verifies native/final/produce gates, snapshots every `mf_*` table and every ready private file, calls the existing consistent `pg_dump` + private-bytes backup under the global advisory backup lock, and restores into a newly created `mf_staging_restore_stage08_<suffix>` database and separate private root.
2. Original state, restored state and current source must match. Any concurrent writer invalidates the acceptance comparison. A valid backup is not discarded.
3. `post-stage08` repeats this after synthetic acceptance identities are retired. It preserves both checkpoints.
4. `persistence` compares current state against the recorded post-checkpoint, including all canonical row hashes and private bytes. It is run on a new deployment before starting the ordinary server.
5. Return the persisted start command to `python -m backend.v2.serve`. Check deployment SUCCESS, `/health` readiness and no staged patch. Never leave the maintenance command as the final startup configuration.

Dump SHA, exact target database/root, per-table count/hash, file SHA/size/status/key, namespace and closed gates are in `pre-stage08.json` and `post-stage08.json`. No credentials or raw database rows are in these public evidence files.

## Temporary HTTPS acceptance

`stage08_acceptance` waits for three successful public HTTPS health responses. Synthetic credentials exist only in process memory. All synthetic sessions/grants are revoked and accounts disabled in `finally`; the temporary admin role is removed. No production orders or Agent credentials are used. No live produce job or native calibration record is created.

The first rollout encountered an initial edge 502 before the first order. Recovery is permitted only when all previous Stage 8 actors are disabled, all their sessions/grants revoked and none owns an order. The failed attempt is preserved separately. Any partial order progress stops recovery for operator inspection; POSTs are not blindly retried.

## Migration rehearsal

Only `tests/stage08/rehearsal.py` may apply `rehearsal_v1.sql`, and only in a fresh database whose name contains `_stage08_rehearsal_`, with namespace `mf.staging.rehearsal8` and explicitly synthetic input. This SQL is outside the live migration directory. It is not deployed/applied to working staging or production.

The rehearsal archives immutable raw legacy records and mapping dispositions. Bridge IDs remain verbatim; v9 IDs map deterministically and remain in legacy references. Duplicate emails produce separate disabled records with the original email retained in the sealed archive, not an inferred merge. Historical staff permissions are never activated; all imported accounts have no active role/grant. Verified addresses require evidence. Orders remain review-only with immutable `legacy_snapshot`; old totals/payments/comments/discounts are not recalculated. Unmapped materials require review. Missing bytes remain a missing record and never a fake ready file. OBLX classification is internal even with a `.pdf` name.

Rehearsal backup/restore runs into a second fresh database/private root and compares all rows/bytes; the original test database must stay unchanged. This proves fixture handling only, not readiness of a production migration tool.

## Rollback

Preferred software rollback: pin staging to accepted runtime `a8228b6e0cf7847c5d7a54b2499e39cbd05ee5fb`, set `python -m backend.v2.serve`, commit only the staging service patch and verify health. Stage 8 made no product-schema change, so no downgrade migration is needed. Preserve the synthetic audit/source records rather than deleting append-only evidence.

For data rollback investigation, use the exact pre-Stage-8 checkpoint listed in `pre-stage08.json`. Restore only into a NEW database/root using `backend.v2.backup.restore`; it rejects the source database name, nonempty target database/storage, namespace mismatch and mismatched dump/blob hashes. Compare with the checkpoint using `stage06_operator.verify`. Do not restore over working staging. Repointing staging to a restored copy is a distinct operator action requiring verification of its database/storage identity and ordinary startup; it was not performed here.

Do not delete existing checkpoints/restored copies during acceptance. Retention/off-site export and whole-project disaster recovery remain separate work. Stage 9 and production cutover remain unauthorized.
