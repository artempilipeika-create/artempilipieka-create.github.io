-- Named checkpoints are independent of the optimistic revision counter.
CREATE TABLE mf_3d_project_versions (
 version_id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES mf_3d_projects(project_id),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
 kind text NOT NULL CHECK(kind IN ('named','before_restore')),
 project_version integer NOT NULL CHECK(project_version>=1),
 name text NOT NULL,
 scene jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mf_3d_project_versions_project ON mf_3d_project_versions(project_id,created_at DESC);
-- Small durable receipts prevent duplicate projects/checkpoints after a lost reply.
-- Scene data is deliberately excluded: autosave is not an unbounded scene history.
CREATE TABLE mf_3d_project_requests (
 owner_user_id uuid NOT NULL REFERENCES mf_users(user_id),
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_user_id,request_id)
);
