-- Stage 2, additive. Never backfill verification or import legacy staff privileges.
ALTER TABLE mf_users ADD COLUMN email_version bigint NOT NULL DEFAULT 1 CHECK (email_version > 0);
ALTER TABLE mf_users ADD COLUMN verification_migration_state text NOT NULL DEFAULT 'unverified'
    CHECK (verification_migration_state IN ('unverified','verified','legacy_pending'));
ALTER TABLE mf_email_verifications ADD COLUMN email_version bigint NOT NULL DEFAULT 1;
ALTER TABLE mf_email_verifications ADD COLUMN purpose text NOT NULL DEFAULT 'verify_email' CHECK (purpose = 'verify_email');
ALTER TABLE mf_email_verifications ADD COLUMN revoked_at timestamptz;
CREATE INDEX mf_verification_user_time ON mf_email_verifications(user_id, created_at);
INSERT INTO mf_permissions VALUES ('customers.pii.read'),('users.staff.create'),('users.roles.write'),
    ('orders.approve'),('orders.prices.read') ON CONFLICT DO NOTHING;
CREATE TABLE mf_rate_events (
    event_id uuid PRIMARY KEY,
    bucket text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mf_rate_bucket_time ON mf_rate_events(bucket, created_at);
-- Durable provider-neutral mail queue. No plaintext token in the database or audit/outbox.
-- The encryption key is a separate staging secret. Only an explicit local collector decrypts.
CREATE TABLE mf_email_deliveries (
    delivery_id uuid PRIMARY KEY,
    verification_id uuid NOT NULL UNIQUE REFERENCES mf_email_verifications,
    event_id uuid NOT NULL UNIQUE REFERENCES mf_outbox,
    sealed_message text NOT NULL,
    provider text NOT NULL DEFAULT 'fake' CHECK (provider = 'fake'),
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','collected','cancelled')),
    sink_file_id uuid REFERENCES mf_files,
    created_at timestamptz NOT NULL DEFAULT now(),
    collected_at timestamptz
);
-- Manifest classification and bindings cannot be downgraded to evade the gateway.
CREATE FUNCTION mf_protect_file_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.kind, NEW.classification, NEW.order_id, NEW.revision_id, NEW.job_id,
           NEW.created_by, NEW.storage_key, NEW.sha256, NEW.size_bytes)
       IS DISTINCT FROM
       ROW(OLD.kind, OLD.classification, OLD.order_id, OLD.revision_id, OLD.job_id,
           OLD.created_by, OLD.storage_key, OLD.sha256, OLD.size_bytes)
    THEN RAISE EXCEPTION 'immutable file identity'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER mf_file_identity BEFORE UPDATE ON mf_files
    FOR EACH ROW EXECUTE FUNCTION mf_protect_file_identity();
