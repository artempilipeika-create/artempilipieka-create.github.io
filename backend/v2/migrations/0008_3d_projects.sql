-- Persistent 3D furniture projects owned by authenticated users.
CREATE TABLE mf_3d_projects (
 project_id uuid PRIMARY KEY,
 owner_user_id uuid NOT NULL REFERENCES mf_users(user_id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 module_type text NOT NULL CHECK(module_type IN ('chest')),
 scene jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz
);
CREATE INDEX mf_3d_projects_owner_updated ON mf_3d_projects(owner_user_id,updated_at DESC) WHERE archived_at IS NULL;
