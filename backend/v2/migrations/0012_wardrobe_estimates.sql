CREATE TABLE mf_estimate_preferences (
    user_id uuid PRIMARY KEY REFERENCES mf_users(user_id),
    markup_bp integer NOT NULL CHECK (markup_bp BETWEEN 0 AND 99999999)
);

CREATE TABLE mf_3d_estimates (
    estimate_id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES mf_3d_projects(project_id),
    project_version integer NOT NULL,
    cost_date date NOT NULL,
    fingerprint text NOT NULL,
    amount numeric NOT NULL,
    complete boolean NOT NULL,
    pdf bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, project_version, fingerprint)
);
