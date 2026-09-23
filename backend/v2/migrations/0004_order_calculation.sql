-- Stage 4. Expand only. Raw Stage 3 prices remain untrusted and untouched.
CREATE TABLE mf_production_profiles (
 profile_id uuid PRIMARY KEY, version integer NOT NULL CHECK(version>0),
 supersedes uuid REFERENCES mf_production_profiles,
 settings jsonb NOT NULL, policies jsonb NOT NULL, synthetic boolean NOT NULL DEFAULT false,
 source text NOT NULL, source_date date NOT NULL, reason text NOT NULL,
 approved_by uuid REFERENCES mf_users, approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(supersedes)
);
CREATE TABLE mf_tariff_books (
 book_id uuid PRIMARY KEY, version integer NOT NULL CHECK(version>0),
 supersedes uuid REFERENCES mf_tariff_books, synthetic boolean NOT NULL DEFAULT false,
 source text NOT NULL, source_date date NOT NULL, reason text NOT NULL,
 approved_by uuid REFERENCES mf_users, approved_at timestamptz NOT NULL DEFAULT now(),
 effective_from timestamptz NOT NULL, effective_to timestamptz,
 CHECK(effective_to IS NULL OR effective_to>effective_from), UNIQUE(supersedes)
);
CREATE TABLE mf_tariff_entries (
 entry_id uuid PRIMARY KEY, book_id uuid NOT NULL REFERENCES mf_tariff_books,
 operation text NOT NULL, scope jsonb NOT NULL, amount numeric NOT NULL CHECK(amount>=0),
 currency text NOT NULL CHECK(currency='BYN'), unit text NOT NULL CHECK(unit IN ('m','m2')),
 tax_convention text, UNIQUE(book_id,operation)
);
CREATE TABLE mf_price_books (
 book_id uuid PRIMARY KEY, version integer NOT NULL CHECK(version>0),
 release_id uuid NOT NULL REFERENCES mf_catalogue_releases,
 supersedes uuid REFERENCES mf_price_books, synthetic boolean NOT NULL DEFAULT false,
 source text NOT NULL, source_date date NOT NULL, reason text NOT NULL,
 currency text NOT NULL CHECK(currency='BYN'), tax_convention text NOT NULL,
 approved_by uuid NOT NULL REFERENCES mf_users, approved_at timestamptz NOT NULL DEFAULT now(),
 effective_from timestamptz NOT NULL, effective_to timestamptz,
 CHECK(effective_to IS NULL OR effective_to>effective_from), UNIQUE(supersedes),
 UNIQUE(book_id,release_id)
);
CREATE TABLE mf_sale_price_entries (
 entry_id uuid PRIMARY KEY, book_id uuid NOT NULL, release_id uuid NOT NULL,
 item_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('material','edge')),
 amount numeric NOT NULL CHECK(amount>=0), unit text NOT NULL CHECK(unit IN ('sheet','m2','m')),
 free_basis text, raw_price_entry_id uuid REFERENCES mf_material_price_entries,
 FOREIGN KEY(book_id,release_id) REFERENCES mf_price_books(book_id,release_id),
 FOREIGN KEY(release_id,item_id) REFERENCES mf_catalogue_items(release_id,item_id),
 CHECK(amount>0 OR (free_basis IS NOT NULL AND length(trim(free_basis))>0)),
 CHECK((kind='material' AND unit IN ('sheet','m2')) OR (kind='edge' AND unit='m')),
 UNIQUE(book_id,item_id)
);
CREATE TABLE mf_financial_book_seals (
 seal_id uuid PRIMARY KEY, tariff_book_id uuid UNIQUE REFERENCES mf_tariff_books,
 price_book_id uuid UNIQUE REFERENCES mf_price_books,
 CHECK((tariff_book_id IS NULL)<>(price_book_id IS NULL))
);
CREATE TABLE mf_discount_profiles (
 profile_id uuid PRIMARY KEY, version integer NOT NULL CHECK(version>0),
 supersedes uuid REFERENCES mf_discount_profiles,
 materials numeric NOT NULL CHECK(materials BETWEEN 0 AND 100),
 edge_material numeric NOT NULL CHECK(edge_material BETWEEN 0 AND 100),
 services numeric NOT NULL CHECK(services BETWEEN 0 AND 100),
 source text NOT NULL, reason text NOT NULL, synthetic boolean NOT NULL DEFAULT false,
 approved_by uuid NOT NULL REFERENCES mf_users, approved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(supersedes)
);
CREATE TABLE mf_customer_discount_assignments (
 assignment_id uuid PRIMARY KEY, customer_id uuid NOT NULL REFERENCES mf_users,
 profile_id uuid NOT NULL REFERENCES mf_discount_profiles,
 created_by uuid NOT NULL REFERENCES mf_users, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mf_order_discount_overrides (
 override_id uuid PRIMARY KEY, order_id text NOT NULL REFERENCES mf_orders,
 profile_id uuid NOT NULL REFERENCES mf_discount_profiles,
 created_by uuid NOT NULL REFERENCES mf_users, reason text NOT NULL CHECK(length(trim(reason))>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mf_calculation_defaults (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 production_profile_id uuid NOT NULL REFERENCES mf_production_profiles,
 tariff_book_id uuid NOT NULL REFERENCES mf_tariff_books,
 price_book_id uuid REFERENCES mf_price_books,
 discount_profile_id uuid REFERENCES mf_discount_profiles,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mf_order_revisions ADD COLUMN catalogue_release_id uuid REFERENCES mf_catalogue_releases;
ALTER TABLE mf_order_revisions ADD COLUMN production_profile_id uuid REFERENCES mf_production_profiles;
CREATE TABLE mf_calculations (
 calculation_id uuid PRIMARY KEY, order_id text NOT NULL, revision_id uuid NOT NULL,
 parent_calculation_id uuid REFERENCES mf_calculations,
 type text NOT NULL CHECK(type='preliminary'),
 completeness text NOT NULL CHECK(completeness IN ('complete','incomplete','needs_confirmation','invalid')),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'), engine_version text NOT NULL, rounding_policy text NOT NULL,
 catalogue_release_id uuid REFERENCES mf_catalogue_releases,
 production_profile_id uuid NOT NULL REFERENCES mf_production_profiles,
 tariff_book_id uuid NOT NULL REFERENCES mf_tariff_books, price_book_id uuid REFERENCES mf_price_books,
 discount_profile_id uuid REFERENCES mf_discount_profiles,
 input_snapshot jsonb NOT NULL, result jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES mf_users, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(revision_id,order_id) REFERENCES mf_order_revisions(revision_id,order_id),
 UNIQUE(calculation_id,revision_id,order_id)
);
CREATE TABLE mf_calculation_lines (
 line_id uuid PRIMARY KEY, calculation_id uuid NOT NULL REFERENCES mf_calculations,
 line_number integer NOT NULL CHECK(line_number>0), category text NOT NULL CHECK(category IN ('materials','edge_material','services')),
 operation text NOT NULL, state text NOT NULL CHECK(state IN ('complete','incomplete','needs_confirmation','invalid')),
 quantity numeric, unit text, unit_price numeric, gross numeric,
 snapshot jsonb NOT NULL, UNIQUE(calculation_id,line_number),
 CHECK((state='complete' AND gross IS NOT NULL) OR (state<>'complete' AND gross IS NULL))
);
CREATE TABLE mf_discount_snapshots (
 calculation_id uuid PRIMARY KEY REFERENCES mf_calculations, snapshot jsonb NOT NULL
);
CREATE TABLE mf_calculation_price_snapshots (
 snapshot_id uuid PRIMARY KEY, calculation_id uuid NOT NULL REFERENCES mf_calculations,
 kind text NOT NULL CHECK(kind IN ('material','edge')), item_key text NOT NULL, snapshot jsonb NOT NULL
);
CREATE TABLE mf_sheet_estimates (
 estimate_id uuid PRIMARY KEY, calculation_id uuid NOT NULL REFERENCES mf_calculations,
 material_key text NOT NULL, estimator_version text NOT NULL, plan_hash text NOT NULL,
 snapshot jsonb NOT NULL, UNIQUE(calculation_id,material_key)
);
CREATE TABLE mf_manufacturing_recipes (
 recipe_id uuid PRIMARY KEY, calculation_id uuid NOT NULL REFERENCES mf_calculations,
 finished_detail_id text NOT NULL, snapshot jsonb NOT NULL, UNIQUE(calculation_id,finished_detail_id)
);
CREATE TABLE mf_submission_receipts (
 receipt_id uuid PRIMARY KEY, order_id text NOT NULL REFERENCES mf_orders,
 actor_id uuid NOT NULL REFERENCES mf_users, idempotency_key text NOT NULL,
 request_hash text NOT NULL, revision_id uuid NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,actor_id,idempotency_key),
 FOREIGN KEY(revision_id,order_id) REFERENCES mf_order_revisions(revision_id,order_id)
);
-- Profile is the single home of confirmed geometry. Open policies deliberately stay null.
INSERT INTO mf_production_profiles VALUES (
 '04000000-0000-4000-8000-000000000001',1,NULL,
 '{"kerf_mm":"4.4","trim_left_mm":"10","trim_right_mm":"10","trim_top_mm":"10","trim_bottom_mm":"10","glue_layers":2,"glue_allowance_each_side_mm":"10","glued_finished_thickness_mm":"36","complex_edge_threshold_mm":"60","geometry_decimal_places":3}',
 '{"edge_consumption":null,"cutting_18":null,"glue_area":null,"edge_classification":null}',false,
 'SPEC v2 J.3 / user Stage 4 confirmed settings','2026-09-23','Confirmed parameters; NC-01/02/03/09 remain open',NULL,now());
INSERT INTO mf_tariff_books VALUES ('04000000-0000-4000-8000-000000000002',1,NULL,false,
 'SPEC v2 J.11 / user Stage 4 confirmed rates','2026-09-23','Preserved rates, scope gates enforced',NULL,now(),'2026-09-23T00:00:00Z',NULL);
INSERT INTO mf_tariff_entries VALUES
 ('04000000-0000-4000-8100-000000000001','04000000-0000-4000-8000-000000000002','cutting_18','{"thickness_mm":"18","basis":"profile_policy_required"}',0.75,'BYN','m',NULL),
 ('04000000-0000-4000-8100-000000000002','04000000-0000-4000-8000-000000000002','glued_finish_cut','{"route":"glued_18_18","basis":"one_length_plus_one_width"}',1.70,'BYN','m',NULL),
 ('04000000-0000-4000-8100-000000000003','04000000-0000-4000-8000-000000000002','edge_normal','{"basis":"net_metres"}',2.10,'BYN','m',NULL),
 ('04000000-0000-4000-8100-000000000004','04000000-0000-4000-8000-000000000002','edge_complex','{"basis":"net_metres","rule":"profile_complex_threshold"}',4.00,'BYN','m',NULL),
 ('04000000-0000-4000-8100-000000000005','04000000-0000-4000-8000-000000000002','edge_thick','{"basis":"net_metres","rule":"profile_policy_required"}',3.50,'BYN','m',NULL),
 ('04000000-0000-4000-8100-000000000006','04000000-0000-4000-8000-000000000002','glue','{"route":"glued_18_18","basis":"profile_policy_required"}',14.00,'BYN','m2',NULL),
 ('04000000-0000-4000-8100-000000000007','04000000-0000-4000-8000-000000000002','packaging','{"basis":"finished_area"}',1.50,'BYN','m2',NULL);
INSERT INTO mf_financial_book_seals VALUES ('04000000-0000-4000-8200-000000000001','04000000-0000-4000-8000-000000000002',NULL);
INSERT INTO mf_calculation_defaults(singleton,production_profile_id,tariff_book_id) VALUES(true,'04000000-0000-4000-8000-000000000001','04000000-0000-4000-8000-000000000002');
CREATE FUNCTION mf_financial_sealed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (TG_TABLE_NAME='mf_tariff_entries' AND EXISTS(SELECT 1 FROM mf_financial_book_seals WHERE tariff_book_id=NEW.book_id))
 OR (TG_TABLE_NAME='mf_sale_price_entries' AND EXISTS(SELECT 1 FROM mf_financial_book_seals WHERE price_book_id=NEW.book_id))
 THEN RAISE EXCEPTION 'sealed financial book'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mf_tariff_sealed BEFORE INSERT ON mf_tariff_entries FOR EACH ROW EXECUTE FUNCTION mf_financial_sealed();
CREATE TRIGGER mf_sale_price_sealed BEFORE INSERT ON mf_sale_price_entries FOR EACH ROW EXECUTE FUNCTION mf_financial_sealed();
-- Immutable content even while a Stage 4 draft revision awaits submit. Only lifecycle metadata may advance once.
CREATE FUNCTION mf_stage04_revision_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.schema_version>=4 AND (to_jsonb(NEW)-ARRAY['lifecycle','submitted_at','immutable_at']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['lifecycle','submitted_at','immutable_at']) THEN RAISE EXCEPTION 'immutable revision content'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mf_stage04_revision_content BEFORE UPDATE ON mf_order_revisions FOR EACH ROW EXECUTE FUNCTION mf_stage04_revision_content();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['mf_production_profiles','mf_tariff_books','mf_tariff_entries','mf_price_books','mf_sale_price_entries',
 'mf_financial_book_seals','mf_discount_profiles','mf_customer_discount_assignments','mf_order_discount_overrides','mf_calculations',
 'mf_calculation_lines','mf_discount_snapshots','mf_calculation_price_snapshots','mf_sheet_estimates','mf_manufacturing_recipes','mf_submission_receipts'] LOOP
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mf_append_only()',t);
 END LOOP;
END $$;
INSERT INTO mf_permissions VALUES ('calculations.create'),('calculations.read'),('calculations.fix'),('orders.review'),
 ('financial.profiles.manage'),('discounts.override');
-- Explicit existing client grants, scoped own. Staff still need an audited explicit grant.
INSERT INTO mf_permission_grants(grant_id,user_id,permission,scope_type,granted_by)
 SELECT md5(u.user_id::text||p.permission)::uuid,u.user_id,p.permission,'own',u.user_id
 FROM mf_users u JOIN mf_user_roles r USING(user_id)
 CROSS JOIN (VALUES('calculations.create'),('calculations.read')) p(permission) WHERE r.role='client';
CREATE INDEX mf_calculation_order ON mf_calculations(order_id,created_at,calculation_id);
CREATE TABLE mf_order_financial_contexts (
 context_id uuid PRIMARY KEY, order_id text NOT NULL REFERENCES mf_orders,
 production_profile_id uuid NOT NULL REFERENCES mf_production_profiles,
 tariff_book_id uuid NOT NULL REFERENCES mf_tariff_books, price_book_id uuid REFERENCES mf_price_books,
 discount_profile_id uuid REFERENCES mf_discount_profiles,
 created_by uuid NOT NULL REFERENCES mf_users, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON mf_order_financial_contexts FOR EACH ROW EXECUTE FUNCTION mf_append_only();
CREATE TABLE mf_calculation_seals (
 calculation_id uuid PRIMARY KEY REFERENCES mf_calculations, result_hash text NOT NULL,
 sealed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON mf_calculation_seals FOR EACH ROW EXECUTE FUNCTION mf_append_only();
CREATE FUNCTION mf_calculation_sealed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM mf_calculation_seals WHERE calculation_id=NEW.calculation_id) THEN RAISE EXCEPTION 'sealed calculation'; END IF;
 RETURN NEW;
END; $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['mf_calculation_lines','mf_discount_snapshots','mf_calculation_price_snapshots','mf_sheet_estimates','mf_manufacturing_recipes'] LOOP
 EXECUTE format('CREATE TRIGGER sealed BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION mf_calculation_sealed()',t);
 END LOOP;
END $$;
ALTER TABLE mf_submission_receipts ADD COLUMN request_snapshot jsonb NOT NULL;
ALTER TABLE mf_discount_profiles ADD COLUMN source_date date NOT NULL;

CREATE FUNCTION mf_immutable_order_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN RAISE EXCEPTION 'immutable order_id'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mf_immutable_order_id BEFORE UPDATE ON mf_orders FOR EACH ROW EXECUTE FUNCTION mf_immutable_order_id();
