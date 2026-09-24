-- Protected 3D workspace: time-limited client access, saved projects and immutable revisions.
CREATE TABLE mf_3d_access (
    user_id uuid PRIMARY KEY REFERENCES mf_users,
    access_until timestamptz NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    granted_by uuid NOT NULL REFERENCES mf_users,
    reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mf_3d_projects (
    project_id uuid PRIMARY KEY,
    owner_user_id uuid NOT NULL REFERENCES mf_users,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    kind text NOT NULL CHECK (kind IN ('dresser')),
    catalogue_release_id uuid NOT NULL REFERENCES mf_catalogue_releases,
    linked_order_id text REFERENCES mf_orders,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','converted','archived')),
    optimistic_lock_version bigint NOT NULL DEFAULT 1 CHECK (optimistic_lock_version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mf_3d_projects_owner ON mf_3d_projects(owner_user_id,updated_at DESC);

CREATE TABLE mf_3d_project_revisions (
    revision_id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES mf_3d_projects,
    version integer NOT NULL CHECK (version > 0),
    state jsonb NOT NULL,
    created_by uuid NOT NULL REFERENCES mf_users,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id,version)
);
CREATE INDEX mf_3d_project_revisions_project ON mf_3d_project_revisions(project_id,version DESC);
CREATE TRIGGER mf_3d_revision_append_only BEFORE UPDATE OR DELETE ON mf_3d_project_revisions
    FOR EACH ROW EXECUTE FUNCTION mf_append_only();
