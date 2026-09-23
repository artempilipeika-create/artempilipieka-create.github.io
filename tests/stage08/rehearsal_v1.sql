-- Rehearsal-only extension; NEVER a live backend/v2 migration.
-- Applied after canonical migrations only in an empty isolated fixture DB.
CREATE TABLE mf_legacy_rehearsal_records (
 source text NOT NULL, entity text NOT NULL, legacy_id text NOT NULL,
 target_id text, disposition text NOT NULL,
 payload jsonb NOT NULL, payload_sha256 text NOT NULL,
 PRIMARY KEY(source,entity,legacy_id)
);
CREATE TRIGGER mf_legacy_records_immutable BEFORE UPDATE OR DELETE ON mf_legacy_rehearsal_records
 FOR EACH ROW EXECUTE FUNCTION mf_append_only();
