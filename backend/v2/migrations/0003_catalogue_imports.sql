-- Stage 3 only. No production transport, calculation or legacy schema changes.
INSERT INTO mf_permissions VALUES ('catalogue.read'),('catalogue.import'),('catalogue.publish'),
 ('catalogue.mapping.manage'),('templates.own.manage'),('templates.manage');
-- Fixed client grants are explicit; roles remain ceilings rather than authorization.
INSERT INTO mf_permission_grants(grant_id,user_id,permission,scope_type,granted_by)
 SELECT gen_random_uuid(),u.user_id,p.permission,'own',u.user_id
 FROM mf_users u JOIN mf_user_roles r USING(user_id)
 CROSS JOIN (VALUES ('catalogue.read'),('templates.own.manage')) p(permission)
 WHERE r.role='client';

CREATE TABLE mf_catalogue_imports (
 import_id uuid PRIMARY KEY, file_id uuid NOT NULL REFERENCES mf_files,
 source_namespace text NOT NULL, profile jsonb NOT NULL, sha256 text NOT NULL,
 workbook jsonb NOT NULL, report jsonb NOT NULL, created_by uuid NOT NULL REFERENCES mf_users,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mf_materials (
 material_id uuid PRIMARY KEY, source_namespace text NOT NULL,
 identity_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_namespace,identity_key)
);
CREATE TABLE mf_material_variants (
 variant_id uuid PRIMARY KEY, material_id uuid NOT NULL REFERENCES mf_materials,
 identity_signature text NOT NULL, identity jsonb NOT NULL,
 UNIQUE(material_id,identity_signature)
);
CREATE TABLE mf_edge_variants (
 edge_id uuid PRIMARY KEY, source_namespace text NOT NULL,
 identity_signature text NOT NULL, identity jsonb NOT NULL,
 UNIQUE(source_namespace,identity_signature)
);
CREATE TABLE mf_catalogue_raw_rows (
 raw_row_id uuid PRIMARY KEY, import_id uuid NOT NULL REFERENCES mf_catalogue_imports,
 sheet text NOT NULL, row_number integer NOT NULL CHECK(row_number>0), cells jsonb NOT NULL,
 disposition text NOT NULL CHECK(disposition IN ('published','review','excluded','error','duplicate')),
 reason text NOT NULL, normalized jsonb NOT NULL,
 variant_id uuid REFERENCES mf_material_variants, edge_id uuid REFERENCES mf_edge_variants,
 duplicate_of uuid REFERENCES mf_catalogue_raw_rows,
 UNIQUE(import_id,sheet,row_number)
);
CREATE TABLE mf_catalogue_source_mappings (
 source_namespace text NOT NULL, key_kind text NOT NULL CHECK(key_kind IN ('identity','external')),
 source_key text NOT NULL, identity_signature text NOT NULL,
 variant_id uuid REFERENCES mf_material_variants, edge_id uuid REFERENCES mf_edge_variants,
 first_import_id uuid NOT NULL REFERENCES mf_catalogue_imports,
 PRIMARY KEY(source_namespace,key_kind,source_key,identity_signature),
 CHECK((variant_id IS NOT NULL)::int+(edge_id IS NOT NULL)::int=1)
);
CREATE TABLE mf_catalogue_releases (
 release_id uuid PRIMARY KEY, import_id uuid NOT NULL UNIQUE REFERENCES mf_catalogue_imports,
 parent_release_id uuid REFERENCES mf_catalogue_releases, report jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES mf_users, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mf_catalogue_items (
 release_id uuid NOT NULL REFERENCES mf_catalogue_releases,
 item_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('material','edge')),
 source_namespace text NOT NULL, snapshot jsonb NOT NULL,
 raw_row_id uuid NOT NULL REFERENCES mf_catalogue_raw_rows,
 PRIMARY KEY(release_id,item_id)
);
CREATE TABLE mf_material_price_entries (
 price_entry_id uuid PRIMARY KEY, release_id uuid NOT NULL REFERENCES mf_catalogue_releases,
 item_id uuid NOT NULL, raw_value jsonb, raw_unit text, raw_row_id uuid NOT NULL REFERENCES mf_catalogue_raw_rows,
 currency text, vat_mode text, purpose text, approved_profile_id uuid,
 CHECK(currency IS NULL AND vat_mode IS NULL AND purpose IS NULL AND approved_profile_id IS NULL),
 FOREIGN KEY(release_id,item_id) REFERENCES mf_catalogue_items
);
CREATE TABLE mf_catalogue_active (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 release_id uuid NOT NULL REFERENCES mf_catalogue_releases, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mf_identity_aliases (
 alias_id uuid PRIMARY KEY, source_value text NOT NULL, source_namespace text NOT NULL,
 manufacturer text, variant_id uuid NOT NULL REFERENCES mf_material_variants,
 version integer NOT NULL CHECK(version>0), reason text NOT NULL, source text NOT NULL,
 created_by uuid NOT NULL REFERENCES mf_users, approved_by uuid NOT NULL REFERENCES mf_users,
 approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_namespace,source_value,version)
);
CREATE TABLE mf_material_edge_mappings (
 mapping_id uuid PRIMARY KEY, variant_id uuid NOT NULL REFERENCES mf_material_variants,
 edge_id uuid NOT NULL REFERENCES mf_edge_variants, version integer NOT NULL CHECK(version>0),
 reason text NOT NULL, source text NOT NULL, created_by uuid NOT NULL REFERENCES mf_users,
 approved_by uuid NOT NULL REFERENCES mf_users, approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(variant_id,version)
);
CREATE TABLE mf_import_templates (
 template_id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES mf_users,
 scope text NOT NULL CHECK(scope='owner'), name text NOT NULL,
 created_by uuid NOT NULL REFERENCES mf_users, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mf_import_template_revisions (
 template_revision_id uuid PRIMARY KEY, template_id uuid NOT NULL REFERENCES mf_import_templates,
 version integer NOT NULL CHECK(version>0), definition jsonb NOT NULL,
 header_fingerprint text NOT NULL, status text NOT NULL CHECK(status IN ('draft','active','retired')),
 created_by uuid NOT NULL REFERENCES mf_users, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(template_id,version)
);
CREATE TABLE mf_import_batches (
 import_id uuid PRIMARY KEY, order_id text NOT NULL REFERENCES mf_orders,
 file_id uuid NOT NULL REFERENCES mf_files,
 template_revision_id uuid NOT NULL REFERENCES mf_import_template_revisions,
 release_id uuid NOT NULL REFERENCES mf_catalogue_releases,
 selected_sheets jsonb NOT NULL, summary jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES mf_users, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mf_import_rows (
 row_id uuid PRIMARY KEY, import_id uuid NOT NULL REFERENCES mf_import_batches,
 sheet text NOT NULL, row_number integer NOT NULL, original jsonb NOT NULL,
 UNIQUE(import_id,sheet,row_number)
);
CREATE TABLE mf_import_row_resolutions (
 resolution_id uuid PRIMARY KEY, row_id uuid NOT NULL REFERENCES mf_import_rows,
 version integer NOT NULL, resolution jsonb NOT NULL, created_by uuid NOT NULL REFERENCES mf_users,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(row_id,version)
);
CREATE TABLE mf_order_draft_rows (
 draft_row_id uuid PRIMARY KEY, order_id text NOT NULL REFERENCES mf_orders,
 source_row_id uuid NOT NULL REFERENCES mf_import_rows,
 template_revision_id uuid NOT NULL REFERENCES mf_import_template_revisions,
 release_id uuid NOT NULL REFERENCES mf_catalogue_releases, snapshot jsonb NOT NULL,
 excluded_reason text, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,source_row_id)
);
CREATE TABLE mf_import_receipts (
 import_id uuid PRIMARY KEY REFERENCES mf_import_batches, order_id text NOT NULL REFERENCES mf_orders,
 mode text NOT NULL CHECK(mode IN ('add','replace','new_revision')), request_hash text NOT NULL,
 result jsonb NOT NULL, created_by uuid NOT NULL REFERENCES mf_users, created_at timestamptz NOT NULL DEFAULT now()
);
-- Published history, raw inputs, definitions and confirmations are immutable at the DB boundary.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['mf_catalogue_imports','mf_materials','mf_material_variants','mf_edge_variants',
  'mf_catalogue_raw_rows','mf_catalogue_source_mappings','mf_catalogue_releases','mf_catalogue_items',
  'mf_material_price_entries','mf_identity_aliases','mf_material_edge_mappings','mf_import_templates',
  'mf_import_template_revisions','mf_import_batches','mf_import_rows','mf_import_row_resolutions','mf_import_receipts']
 LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mf_append_only()',t||'_immutable',t); END LOOP;
END $$;
