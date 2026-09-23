-- Expand the existing staging domain. Legacy blocked jobs remain blocked.
INSERT INTO mf_permissions VALUES
 ('production.jobs.read'),('production.jobs.cancel'),('production.jobs.reconcile'),
 ('production.final.create'),('production.final.review'),('production.agents.manage')
 ON CONFLICT DO NOTHING;

CREATE TABLE mf_bazis_calibrations (
 calibration_id uuid PRIMARY KEY,
 profile_version text NOT NULL UNIQUE,
 profile_sha256 text NOT NULL CHECK(profile_sha256 ~ '^[a-f0-9]{64}$'),
 bazis_version text NOT NULL,
 result_format text NOT NULL CHECK(result_format='mf-native-result-v1'),
 attestor_public_key text NOT NULL,
 evidence jsonb NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 approved_by uuid NOT NULL REFERENCES mf_users,
 approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER mf_calibration_immutable BEFORE UPDATE OR DELETE ON mf_bazis_calibrations
 FOR EACH ROW EXECUTE FUNCTION mf_append_only();

CREATE TABLE mf_bazis_material_mappings (
 calibration_id uuid NOT NULL REFERENCES mf_bazis_calibrations,
 identity_sha256 text NOT NULL CHECK(identity_sha256 ~ '^[a-f0-9]{64}$'),
 native_mapping_id text NOT NULL CHECK(length(native_mapping_id) BETWEEN 1 AND 100),
 local_catalogue_version text NOT NULL CHECK(length(local_catalogue_version) BETWEEN 1 AND 100),
 approved_by uuid NOT NULL REFERENCES mf_users,
 approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(calibration_id,identity_sha256)
);
CREATE TRIGGER mf_native_mapping_immutable BEFORE UPDATE OR DELETE ON mf_bazis_material_mappings
 FOR EACH ROW EXECUTE FUNCTION mf_append_only();

CREATE TABLE mf_bazis_export_profiles (
 version text PRIMARY KEY,
 snapshot jsonb NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 calibration_id uuid REFERENCES mf_bazis_calibrations,
 created_by uuid NOT NULL REFERENCES mf_users,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER mf_export_profile_immutable BEFORE UPDATE OR DELETE ON mf_bazis_export_profiles
 FOR EACH ROW EXECUTE FUNCTION mf_append_only();

CREATE TABLE mf_staging_agents (
 agent_id uuid PRIMARY KEY,
 actor_user_id uuid NOT NULL UNIQUE REFERENCES mf_users,
 environment text NOT NULL CHECK(environment='staging'),
 namespace text NOT NULL REFERENCES mf_environment(namespace),
 credential_digest text NOT NULL UNIQUE CHECK(credential_digest ~ '^[a-f0-9]{64}$'),
 allowed_capabilities jsonb NOT NULL,
 reported_capabilities jsonb NOT NULL DEFAULT '[]',
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 last_heartbeat_at timestamptz,
 created_by uuid NOT NULL REFERENCES mf_users,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mf_agent_requests (
 agent_id uuid NOT NULL REFERENCES mf_staging_agents,
 request_id uuid NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(agent_id,request_id)
);
CREATE INDEX mf_agent_request_rate ON mf_agent_requests(agent_id,received_at);

ALTER TABLE mf_production_jobs DROP CONSTRAINT mf_production_jobs_status_check;
ALTER TABLE mf_production_jobs ADD CONSTRAINT mf_production_jobs_status_check
 CHECK(status IN ('blocked','created','admitted','leased','running','result_uploaded','succeeded','failed','uncertain','cancelled'));
ALTER TABLE mf_production_jobs ADD COLUMN calculation_id uuid REFERENCES mf_calculations;
ALTER TABLE mf_production_jobs ADD COLUMN production_profile_version uuid REFERENCES mf_production_profiles;
ALTER TABLE mf_production_jobs ADD COLUMN catalogue_release_id uuid REFERENCES mf_catalogue_releases;
ALTER TABLE mf_production_jobs ADD COLUMN export_profile_version text REFERENCES mf_bazis_export_profiles;
ALTER TABLE mf_production_jobs ADD COLUMN price_snapshot_sha256 text;
ALTER TABLE mf_production_jobs ADD COLUMN request_key text;
ALTER TABLE mf_production_jobs ADD COLUMN request_sha256 text;
ALTER TABLE mf_production_jobs ADD COLUMN admitted_at timestamptz;
ALTER TABLE mf_production_jobs ADD COLUMN current_run_id uuid;
ALTER TABLE mf_production_jobs ADD COLUMN lease_agent_id uuid REFERENCES mf_staging_agents;
ALTER TABLE mf_production_jobs ADD COLUMN lease_digest text;
ALTER TABLE mf_production_jobs ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE mf_production_jobs ADD COLUMN physical_started boolean NOT NULL DEFAULT false;
ALTER TABLE mf_production_jobs ADD COLUMN result_state text NOT NULL DEFAULT 'none'
 CHECK(result_state IN ('none','unverified','verified','rejected'));
ALTER TABLE mf_production_jobs ADD COLUMN final_candidate_id uuid;
ALTER TABLE mf_production_jobs ADD COLUMN admission_reason text;
ALTER TABLE mf_production_jobs ADD CONSTRAINT mf_job_new_required CHECK(schema_version<>6 OR
 (calculation_id IS NOT NULL AND production_profile_version IS NOT NULL AND catalogue_release_id IS NOT NULL
 AND export_profile_version IS NOT NULL AND input_hash IS NOT NULL AND request_key IS NOT NULL));
CREATE UNIQUE INDEX mf_job_request_dedupe ON mf_production_jobs(order_id,created_by,request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX mf_single_produce_revision ON mf_production_jobs(order_id,revision_id)
 WHERE schema_version=6 AND purpose='produce' AND status NOT IN ('failed','cancelled');

CREATE TABLE mf_job_packages (
 package_id uuid PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES mf_production_jobs,
 run_id uuid NOT NULL UNIQUE,
 manifest jsonb NOT NULL,
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 manifest_file_id uuid NOT NULL REFERENCES mf_files,
 oblx_file_id uuid NOT NULL REFERENCES mf_files,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(package_id,job_id,run_id)
);
CREATE TRIGGER mf_package_immutable BEFORE UPDATE OR DELETE ON mf_job_packages
 FOR EACH ROW EXECUTE FUNCTION mf_append_only();

CREATE TABLE mf_job_runs (
 run_id uuid PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES mf_production_jobs,
 package_id uuid NOT NULL,
 fencing bigint NOT NULL CHECK(fencing>0),
 agent_id uuid NOT NULL REFERENCES mf_staging_agents,
 lease_digest text NOT NULL CHECK(lease_digest ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('leased','running','result_uploaded','succeeded','failed','expired','uncertain','cancelled')),
 physical_started boolean NOT NULL DEFAULT false,
 started_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,fencing), UNIQUE(run_id,job_id),
 FOREIGN KEY(package_id,job_id,run_id) REFERENCES mf_job_packages(package_id,job_id,run_id)
);
ALTER TABLE mf_production_jobs ADD CONSTRAINT mf_current_run FOREIGN KEY(current_run_id,job_id) REFERENCES mf_job_runs(run_id,job_id);

ALTER TABLE mf_job_events ADD COLUMN run_id uuid;
ALTER TABLE mf_job_events ADD COLUMN fencing bigint;
ALTER TABLE mf_job_events ADD COLUMN occurred_at timestamptz;
ALTER TABLE mf_job_events ADD COLUMN payload_hash text;
ALTER TABLE mf_job_events ADD CONSTRAINT mf_event_run FOREIGN KEY(run_id,job_id) REFERENCES mf_job_runs(run_id,job_id);

CREATE TABLE mf_job_results (
 result_id uuid PRIMARY KEY,
 job_id uuid NOT NULL,
 run_id uuid NOT NULL UNIQUE,
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 manifest jsonb NOT NULL,
 manifest_file_id uuid NOT NULL REFERENCES mf_files,
 input_manifest_sha256 text NOT NULL CHECK(input_manifest_sha256 ~ '^[a-f0-9]{64}$'),
 verified boolean NOT NULL DEFAULT false,
 calibration_id uuid REFERENCES mf_bazis_calibrations,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(run_id,job_id) REFERENCES mf_job_runs(run_id,job_id),
 CHECK(NOT verified OR calibration_id IS NOT NULL),
 UNIQUE(result_id,run_id,job_id)
);
CREATE TRIGGER mf_result_immutable BEFORE UPDATE OR DELETE ON mf_job_results
 FOR EACH ROW EXECUTE FUNCTION mf_append_only();

CREATE TABLE mf_final_calculation_candidates (
 candidate_id uuid PRIMARY KEY,
 order_id text NOT NULL REFERENCES mf_orders,
 revision_id uuid NOT NULL,
 preliminary_calculation_id uuid NOT NULL REFERENCES mf_calculations,
 job_id uuid NOT NULL,
 run_id uuid NOT NULL,
 result_id uuid NOT NULL UNIQUE,
 input_manifest_sha256 text NOT NULL,
 output_manifest_sha256 text NOT NULL,
 financial_snapshot jsonb NOT NULL,
 financial_sha256 text NOT NULL,
 created_by uuid NOT NULL REFERENCES mf_users,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(revision_id,order_id) REFERENCES mf_order_revisions(revision_id,order_id),
 FOREIGN KEY(result_id,run_id,job_id) REFERENCES mf_job_results(result_id,run_id,job_id),
 UNIQUE(candidate_id,revision_id,order_id)
);
CREATE TRIGGER mf_final_candidate_immutable BEFORE UPDATE OR DELETE ON mf_final_calculation_candidates
 FOR EACH ROW EXECUTE FUNCTION mf_append_only();
ALTER TABLE mf_production_jobs ADD CONSTRAINT mf_job_final_candidate FOREIGN KEY(final_candidate_id,revision_id,order_id)
 REFERENCES mf_final_calculation_candidates(candidate_id,revision_id,order_id);

CREATE TABLE mf_final_approvals (
 approval_id uuid PRIMARY KEY,
 candidate_id uuid NOT NULL REFERENCES mf_final_calculation_candidates,
 phase text NOT NULL CHECK(phase IN ('manager_review','customer_confirmation')),
 actor_user_id uuid NOT NULL REFERENCES mf_users,
 basis text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(candidate_id,phase)
);
CREATE TRIGGER mf_final_approval_immutable BEFORE UPDATE OR DELETE ON mf_final_approvals
 FOR EACH ROW EXECUTE FUNCTION mf_append_only();
CREATE TABLE mf_job_reconciliations (
 reconciliation_id uuid PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES mf_production_jobs,
 run_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('confirmed_not_executed','confirmed_stopped','retain_uncertain')),
 evidence_file_ids jsonb NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES mf_users,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(run_id,job_id) REFERENCES mf_job_runs(run_id,job_id)
);
CREATE TRIGGER mf_reconciliation_immutable BEFORE UPDATE OR DELETE ON mf_job_reconciliations
 FOR EACH ROW EXECUTE FUNCTION mf_append_only();

CREATE FUNCTION mf_protect_job_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.schema_version=6 AND (TG_OP='DELETE' OR
  (to_jsonb(NEW)-ARRAY['status','attempt','fencing','current_run_id','lease_agent_id','lease_digest','lease_expires_at','physical_started','result_state','admitted_at'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','attempt','fencing','current_run_id','lease_agent_id','lease_digest','lease_expires_at','physical_started','result_state','admitted_at']))
 THEN RAISE EXCEPTION 'immutable job references'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.fencing<OLD.fencing OR NEW.attempt<OLD.attempt THEN RAISE EXCEPTION 'monotonic job fence'; END IF;
 IF OLD.physical_started AND NOT NEW.physical_started THEN RAISE EXCEPTION 'physical execution cannot be forgotten'; END IF;
 IF OLD.status='uncertain' AND NEW.status IN ('admitted','leased','running') THEN RAISE EXCEPTION 'uncertain jobs require reconciliation and a new authorized job'; END IF;
 IF OLD.status<>NEW.status AND OLD.schema_version=6 AND NOT (
   (OLD.status='created' AND NEW.status IN ('admitted','cancelled','failed')) OR
   (OLD.status='admitted' AND NEW.status IN ('leased','cancelled','failed')) OR
   (OLD.status='leased' AND NEW.status IN ('running','admitted','uncertain','failed','cancelled')) OR
   (OLD.status='running' AND NEW.status IN ('result_uploaded','admitted','failed','uncertain','cancelled')) OR
   (OLD.status='result_uploaded' AND NEW.status IN ('succeeded','failed','uncertain','cancelled','admitted')) OR
   (OLD.status='uncertain' AND NEW.status IN ('failed','cancelled'))
 ) THEN RAISE EXCEPTION 'invalid job transition'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mf_job_v2_immutable BEFORE UPDATE OR DELETE ON mf_production_jobs
 FOR EACH ROW EXECUTE FUNCTION mf_protect_job_v2();

CREATE FUNCTION mf_protect_run_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','physical_started','started_at','completed_at','expires_at'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','physical_started','started_at','completed_at','expires_at'])
 THEN RAISE EXCEPTION 'immutable run identity'; END IF;
 IF OLD.physical_started AND NOT NEW.physical_started THEN RAISE EXCEPTION 'physical execution cannot be forgotten'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mf_run_identity BEFORE UPDATE OR DELETE ON mf_job_runs
 FOR EACH ROW EXECUTE FUNCTION mf_protect_run_v2();

CREATE FUNCTION mf_protect_job_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.job_id IS NOT NULL AND OLD.status='ready' AND (TG_OP='DELETE' OR
    (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status'))
 THEN RAISE EXCEPTION 'immutable job artifact'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mf_job_file_immutable BEFORE UPDATE OR DELETE ON mf_files
 FOR EACH ROW EXECUTE FUNCTION mf_protect_job_file();

-- Exact currently selected review and approval, never inferred from historical approvals.
ALTER TABLE mf_orders ADD COLUMN reviewed_final_candidate_id uuid;
ALTER TABLE mf_orders ADD COLUMN approved_final_candidate_id uuid;
ALTER TABLE mf_orders ADD CONSTRAINT mf_order_reviewed_final FOREIGN KEY(reviewed_final_candidate_id,active_revision_id,order_id)
 REFERENCES mf_final_calculation_candidates(candidate_id,revision_id,order_id);
ALTER TABLE mf_orders ADD CONSTRAINT mf_order_approved_final FOREIGN KEY(approved_final_candidate_id,approved_revision_id,order_id)
 REFERENCES mf_final_calculation_candidates(candidate_id,revision_id,order_id);
