-- Stage 8.4. Manual attachments reuse mf_files bytes; never revision/import/document provenance.
ALTER TABLE mf_files DROP CONSTRAINT mf_files_kind_check;
ALTER TABLE mf_files ADD CONSTRAINT mf_files_kind_check CHECK(kind IN ('source','preliminary_pdf','oblx','internal','test','attachment'));
INSERT INTO mf_permissions(permission) VALUES ('files.attachments.read'),('files.attachments.upload'),('files.attachments.internal.read');
CREATE TABLE mf_order_attachments (
 file_id uuid PRIMARY KEY REFERENCES mf_files,
 order_id text NOT NULL REFERENCES mf_orders,
 category text NOT NULL CHECK(category IN ('source','drawing','image','document','internal_working','production_internal','oblx','other')),
 visibility text NOT NULL DEFAULT 'staff_internal' CHECK(visibility IN ('client_visible','staff_internal','production_internal')),
 staff_comment text NOT NULL DEFAULT '' CHECK(length(staff_comment)<=500),
 CHECK(category NOT IN ('internal_working','production_internal','oblx') OR visibility<>'client_visible'),
 CHECK(category<>'oblx' OR visibility='production_internal')
);
CREATE INDEX mf_order_attachments_order ON mf_order_attachments(order_id);
CREATE FUNCTION mf_attachment_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f mf_files;
BEGIN
 SELECT * INTO f FROM mf_files WHERE file_id=NEW.file_id;
 IF f.order_id IS DISTINCT FROM NEW.order_id OR f.job_id IS NOT NULL
 OR f.kind NOT IN ('attachment','oblx')
 OR (NEW.visibility='client_visible') IS DISTINCT FROM (f.classification='private')
 OR (NEW.category='oblx') IS DISTINCT FROM (f.kind='oblx')
 THEN RAISE EXCEPTION 'invalid manual attachment binding'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mf_attachment_binding BEFORE INSERT ON mf_order_attachments FOR EACH ROW EXECUTE FUNCTION mf_attachment_binding();
CREATE TRIGGER mf_attachment_immutable BEFORE UPDATE OR DELETE ON mf_order_attachments FOR EACH ROW EXECUTE FUNCTION mf_append_only();
-- Manual ready bytes/metadata cannot be replaced or removed; visibility is immutable in this stage.
CREATE FUNCTION mf_manual_file_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind='attachment' OR EXISTS(SELECT 1 FROM mf_order_attachments WHERE file_id=OLD.file_id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable manual file'; END IF;
  IF ROW(OLD.original_name,OLD.mime_type,OLD.storage_backend,OLD.created_at,OLD.supersedes_file_id)
    IS DISTINCT FROM ROW(NEW.original_name,NEW.mime_type,NEW.storage_backend,NEW.created_at,NEW.supersedes_file_id)
  THEN RAISE EXCEPTION 'immutable manual metadata'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mf_manual_file_immutable BEFORE UPDATE OR DELETE ON mf_files FOR EACH ROW EXECUTE FUNCTION mf_manual_file_immutable();
