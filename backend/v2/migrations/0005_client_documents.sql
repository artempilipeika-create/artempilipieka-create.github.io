-- Stage 5 only. Financial snapshots and existing migrations remain unchanged.
-- Nullable legacy completion timestamp; Stage 5 does not set production completion.
ALTER TABLE mf_orders ADD COLUMN completed_at timestamptz;
CREATE SEQUENCE mf_order_display_sequence;
ALTER TABLE mf_orders ALTER COLUMN display_number SET DEFAULT ('MF-' || lpad(nextval('mf_order_display_sequence')::text,6,'0'));
UPDATE mf_orders SET display_number='MF-' || lpad(nextval('mf_order_display_sequence')::text,6,'0') WHERE display_number IS NULL;
ALTER TABLE mf_users ADD COLUMN display_name text CHECK(length(display_name)<=200);
ALTER TABLE mf_users ADD COLUMN company_name text CHECK(length(company_name)<=200);
CREATE TABLE mf_document_templates (
 template_version text PRIMARY KEY, renderer_version text NOT NULL,
 asset_sha256 text NOT NULL CHECK(asset_sha256 ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mf_documents (
 file_id uuid PRIMARY KEY REFERENCES mf_files, calculation_id uuid NOT NULL REFERENCES mf_calculations,
 order_id text NOT NULL REFERENCES mf_orders, revision_id uuid NOT NULL,
 template_version text NOT NULL REFERENCES mf_document_templates,
 document_version integer NOT NULL CHECK(document_version>0),
 presentation_snapshot jsonb NOT NULL, presentation_sha256 text NOT NULL CHECK(presentation_sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES mf_users, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(calculation_id,template_version), UNIQUE(calculation_id,document_version),
 FOREIGN KEY(revision_id,order_id) REFERENCES mf_order_revisions(revision_id,order_id)
);
CREATE FUNCTION mf_document_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM mf_calculations c JOIN mf_calculation_seals s USING(calculation_id)
   JOIN mf_files f ON f.file_id=NEW.file_id WHERE c.calculation_id=NEW.calculation_id
   AND c.order_id=NEW.order_id AND c.revision_id=NEW.revision_id
   AND f.order_id=NEW.order_id AND f.revision_id=NEW.revision_id AND f.job_id IS NULL
   AND f.kind='preliminary_pdf' AND f.classification='private' AND f.mime_type='application/pdf' AND f.status='ready')
 THEN RAISE EXCEPTION 'document binding mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER binding BEFORE INSERT ON mf_documents FOR EACH ROW EXECUTE FUNCTION mf_document_binding();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON mf_documents FOR EACH ROW EXECUTE FUNCTION mf_append_only();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON mf_document_templates FOR EACH ROW EXECUTE FUNCTION mf_append_only();
CREATE INDEX mf_documents_order ON mf_documents(order_id,created_at);
-- NC-08 visibility only; no deletion or retention worker. Null means all history visible.
CREATE TABLE mf_history_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 completed_visibility_days integer CHECK(completed_visibility_days>0),
 direct_history_access boolean NOT NULL DEFAULT true
);
INSERT INTO mf_history_policy(singleton) VALUES(true);
INSERT INTO mf_permissions VALUES('documents.generate');
INSERT INTO mf_permission_grants(grant_id,user_id,permission,scope_type,granted_by)
 SELECT md5(u.user_id::text||'documents.generate')::uuid,u.user_id,'documents.generate','own',u.user_id
 FROM mf_users u JOIN mf_user_roles r USING(user_id) WHERE r.role='client';
