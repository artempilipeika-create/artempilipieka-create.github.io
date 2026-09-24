-- Revocable read-only sharing for 3D projects. Tokens are stored only as SHA-256 digests.
CREATE TABLE mf_3d_project_shares (
 share_id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES mf_3d_projects(project_id),
 token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
 created_by uuid NOT NULL REFERENCES mf_users(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
CREATE INDEX mf_3d_project_shares_project ON mf_3d_project_shares(project_id,created_at DESC);
