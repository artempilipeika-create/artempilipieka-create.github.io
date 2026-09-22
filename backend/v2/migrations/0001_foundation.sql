-- SPEC v2 Stage 1, expand only. This migration must run on an empty isolated staging DB.
CREATE TABLE mf_environment (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    environment text NOT NULL CHECK (environment = 'staging'),
    namespace text NOT NULL UNIQUE CHECK (namespace LIKE 'mf.staging.%'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mf_users (
    user_id uuid PRIMARY KEY,
    email text,
    password_hash text,
    email_verified_at timestamptz,
    account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','blocked','disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mf_users_email_unique ON mf_users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE mf_sessions (
    session_id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES mf_users,
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mf_sessions_user ON mf_sessions (user_id);

CREATE TABLE mf_email_verifications (
    verification_id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES mf_users,
    email text NOT NULL,
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mf_roles (role text PRIMARY KEY);
INSERT INTO mf_roles VALUES ('client'),('manager'),('production'),('accounting'),('viewer'),('admin'),('service_agent');
CREATE TABLE mf_permissions (
    permission text PRIMARY KEY CHECK (permission NOT LIKE '%*%')
);
-- Definitions only: no user receives a permission by merely holding a role.
INSERT INTO mf_permissions VALUES
 ('orders.read'),('orders.draft.write'),('orders.submit'),('orders.revision.create'),
 ('orders.assign_manager'),('orders.oblx.read'),('files.source.read'),
 ('files.preliminary_pdf.read'),('audit.read'),('roles.write'),
 ('production.calculate.enqueue'),('production.release'),('production.execute');
CREATE TABLE mf_user_roles (
    user_id uuid NOT NULL REFERENCES mf_users,
    role text NOT NULL REFERENCES mf_roles,
    PRIMARY KEY (user_id, role)
);
CREATE TABLE mf_permission_grants (
    grant_id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES mf_users,
    permission text NOT NULL REFERENCES mf_permissions,
    scope_type text NOT NULL CHECK (scope_type IN ('own','assigned','order','job','all')),
    scope_id text,
    granted_by uuid NOT NULL REFERENCES mf_users,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    revoked_at timestamptz,
    CHECK ((scope_type IN ('order','job') AND scope_id IS NOT NULL)
        OR (scope_type IN ('own','assigned','all') AND scope_id IS NULL))
);
CREATE INDEX mf_permission_grants_user ON mf_permission_grants (user_id, permission);

CREATE TABLE mf_orders (
    -- text preserves legacy Bridge order_id verbatim; new IDs are server-generated UUID strings.
    order_id text PRIMARY KEY CHECK (length(order_id) BETWEEN 1 AND 80),
    display_number text UNIQUE,
    business_name text NOT NULL,
    owner_user_id uuid NOT NULL REFERENCES mf_users,
    preparation_mode text NOT NULL CHECK (preparation_mode IN ('manager_assisted','self_prepared')),
    assigned_manager_id uuid REFERENCES mf_users,
    workflow_status text NOT NULL DEFAULT 'draft',
    active_revision_id uuid,
    approved_revision_id uuid,
    optimistic_lock_version bigint NOT NULL DEFAULT 1 CHECK (optimistic_lock_version > 0),
    legacy_source text,
    legacy_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (legacy_source, legacy_id),
    CHECK ((legacy_source IS NULL) = (legacy_id IS NULL))
);
CREATE INDEX mf_orders_owner ON mf_orders (owner_user_id);
CREATE INDEX mf_orders_manager ON mf_orders (assigned_manager_id);

CREATE TABLE mf_order_revisions (
    revision_id uuid PRIMARY KEY,
    order_id text NOT NULL REFERENCES mf_orders,
    revision_number integer NOT NULL CHECK (revision_number > 0),
    parent_revision_id uuid,
    created_by uuid NOT NULL REFERENCES mf_users,
    reason text NOT NULL,
    lifecycle text NOT NULL DEFAULT 'draft',
    content_hash text CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    content jsonb NOT NULL DEFAULT '{}'::jsonb,
    schema_version integer NOT NULL DEFAULT 1,
    submitted_at timestamptz,
    immutable_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (revision_id, order_id),
    UNIQUE (order_id, revision_number),
    FOREIGN KEY (parent_revision_id, order_id) REFERENCES mf_order_revisions (revision_id, order_id),
    CHECK (parent_revision_id IS DISTINCT FROM revision_id),
    CHECK (immutable_at IS NULL OR content_hash IS NOT NULL)
);
ALTER TABLE mf_orders ADD CONSTRAINT mf_order_active_revision
    FOREIGN KEY (active_revision_id, order_id) REFERENCES mf_order_revisions (revision_id, order_id);
ALTER TABLE mf_orders ADD CONSTRAINT mf_order_approved_revision
    FOREIGN KEY (approved_revision_id, order_id) REFERENCES mf_order_revisions (revision_id, order_id);

CREATE TABLE mf_manager_assignments (
    assignment_id uuid PRIMARY KEY,
    order_id text NOT NULL REFERENCES mf_orders,
    from_manager_id uuid REFERENCES mf_users,
    to_manager_id uuid REFERENCES mf_users,
    created_by uuid NOT NULL REFERENCES mf_users,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mf_production_jobs (
    job_id uuid PRIMARY KEY,
    order_id text NOT NULL REFERENCES mf_orders,
    revision_id uuid NOT NULL,
    purpose text NOT NULL CHECK (purpose IN ('calculate','produce')),
    namespace text NOT NULL REFERENCES mf_environment (namespace),
    schema_version integer NOT NULL DEFAULT 2,
    status text NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked','cancelled')),
    input_hash text CHECK (input_hash ~ '^[a-f0-9]{64}$'),
    manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
    required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
    attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    fencing bigint NOT NULL DEFAULT 0,
    created_by uuid NOT NULL REFERENCES mf_users,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_id, revision_id, order_id),
    FOREIGN KEY (revision_id, order_id) REFERENCES mf_order_revisions (revision_id, order_id)
);

CREATE TABLE mf_files (
    file_id uuid PRIMARY KEY,
    order_id text REFERENCES mf_orders,
    revision_id uuid,
    job_id uuid,
    kind text NOT NULL CHECK (kind IN ('source','preliminary_pdf','oblx','internal','test')),
    classification text NOT NULL CHECK (classification IN ('private','internal')),
    original_name text NOT NULL,
    storage_backend text NOT NULL DEFAULT 'volume',
    storage_key text NOT NULL UNIQUE CHECK (storage_key ~ '^objects/[a-f0-9]{2}/[a-f0-9]{32}$'),
    sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
    mime_type text NOT NULL,
    created_by uuid NOT NULL REFERENCES mf_users,
    created_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'staging' CHECK (status IN ('staging','ready','failed','quarantined','retired')),
    supersedes_file_id uuid REFERENCES mf_files,
    FOREIGN KEY (revision_id, order_id) REFERENCES mf_order_revisions (revision_id, order_id),
    FOREIGN KEY (job_id, revision_id, order_id) REFERENCES mf_production_jobs (job_id, revision_id, order_id),
    CHECK (revision_id IS NULL OR order_id IS NOT NULL),
    CHECK (job_id IS NULL OR (revision_id IS NOT NULL AND order_id IS NOT NULL)),
    CHECK (kind <> 'oblx' OR classification = 'internal')
);
CREATE INDEX mf_files_order ON mf_files (order_id, revision_id);

CREATE TABLE mf_audit (
    event_id uuid PRIMARY KEY,
    actor_user_id uuid NOT NULL REFERENCES mf_users,
    action text NOT NULL,
    object_type text NOT NULL,
    object_id text NOT NULL,
    object_version bigint,
    reason text NOT NULL,
    correlation_id uuid NOT NULL,
    -- Only redacted references here. Never raw bodies, tokens, DSNs or credentials.
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mf_audit_object ON mf_audit (object_type, object_id, created_at);

CREATE TABLE mf_outbox (
    event_id uuid PRIMARY KEY REFERENCES mf_audit (event_id),
    namespace text NOT NULL REFERENCES mf_environment (namespace),
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    destination text NOT NULL DEFAULT 'local_only' CHECK (destination = 'local_only'),
    status text NOT NULL DEFAULT 'paused' CHECK (status IN ('paused','observed_fake')),
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mf_outbox_pending ON mf_outbox (namespace, status, created_at);

CREATE TABLE mf_job_events (
    event_id uuid PRIMARY KEY,
    job_id uuid NOT NULL REFERENCES mf_production_jobs,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION mf_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only journal'; END;
$$;
CREATE TRIGGER mf_audit_append_only BEFORE UPDATE OR DELETE ON mf_audit
    FOR EACH ROW EXECUTE FUNCTION mf_append_only();
CREATE TRIGGER mf_assignment_append_only BEFORE UPDATE OR DELETE ON mf_manager_assignments
    FOR EACH ROW EXECUTE FUNCTION mf_append_only();
CREATE TRIGGER mf_job_event_append_only BEFORE UPDATE OR DELETE ON mf_job_events
    FOR EACH ROW EXECUTE FUNCTION mf_append_only();

CREATE FUNCTION mf_protect_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.immutable_at IS NOT NULL THEN RAISE EXCEPTION 'immutable revision'; END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER mf_revision_immutable BEFORE UPDATE OR DELETE ON mf_order_revisions
    FOR EACH ROW EXECUTE FUNCTION mf_protect_revision();
