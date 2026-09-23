from copy import deepcopy
from dataclasses import replace
from uuid import uuid4
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
import pytest
from backend.v2.db import connect
from backend.v2.migrate import migrate
from backend.v2.backup import backup,restore
from backend.v2.stage06_operator import verify
from backend.v2.files import read_verified
from backend.v2.storage import VolumeStore
from tests.stage03.test_api import settings
from .rehearsal import fixture,migrate_fixture
from .test_e2e import evidence


def target(settings,tmp_path):
    name='mf_staging_stage08_rehearsal_'+uuid4().hex[:10]
    info=conninfo_to_dict(settings.database_url)
    with connect(settings,autocommit=True) as c: c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    new=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,
                namespace='mf.staging.rehearsal8',storage_root=tmp_path/'private')
    migrate(new);return new


def test_fixture_migration_reconciliation_and_actual_restore(settings,tmp_path):
    source_before=verify(settings);s=target(settings,tmp_path);data=fixture();report=migrate_fixture(s,data)
    with connect(s) as db:
        assert db.execute('SELECT count(*) n FROM mf_users').fetchone()['n']==3
        assert db.execute('SELECT count(*) n FROM mf_users WHERE email IS NULL AND email_verified_at IS NULL').fetchone()['n']==2
        assert db.execute('SELECT count(*) n FROM mf_users WHERE email_verified_at IS NOT NULL').fetchone()['n']==1
        assert not db.execute('SELECT 1 FROM mf_user_roles').fetchone()
        orders=db.execute('SELECT * FROM mf_orders ORDER BY order_id').fetchall();assert len(orders)==2
        assert any(o['order_id']=='bridge-original-order-69' for o in orders)
        assert all(o['workflow_status']=='review' and o['approved_revision_id'] is None for o in orders)
        for r in db.execute('SELECT content FROM mf_order_revisions'):
            assert r['content']['source']['total']=='179.00' and r['content']['kind']=='legacy_snapshot'
        files=db.execute('SELECT * FROM mf_files').fetchall();assert len(files)==2
        for f in files:
            assert read_verified(db,VolumeStore(s.storage_root),f['file_id'])
            if f['kind']=='oblx': assert f['classification']=='internal' and f['original_name']=='renamed.pdf'
        assert db.execute("SELECT count(*) n FROM mf_legacy_rehearsal_records WHERE disposition='missing_bytes_not_restored'").fetchone()['n']==1
    before=verify(s);manifest=backup(s,tmp_path/'checkpoint')
    name='mf_staging_restore_stage08_rehearsal_'+uuid4().hex[:10];info=conninfo_to_dict(s.database_url)
    with connect(s,autocommit=True) as db: db.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    restored=replace(s,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,storage_root=tmp_path/'restored')
    restore(restored,tmp_path/'checkpoint');assert verify(restored)==before and verify(settings)==source_before
    evidence('migration-restore',{'scope':'SYNTHETIC FIXTURE REHEARSAL ONLY','report':report,'database':s.database_name,
             'restored_database':name,'dump_sha256':manifest['database_sha256'],'state':before,'working_database_unchanged':True})
    with pytest.raises(ValueError,match='Empty rehearsal'): migrate_fixture(s,data)


def test_rehearsal_rejects_working_database_and_non_synthetic(settings,tmp_path):
    with pytest.raises(ValueError,match='Isolated'): migrate_fixture(settings,fixture())
    s=target(settings,tmp_path);bad=fixture();bad['synthetic']=False
    with pytest.raises(ValueError,match='Isolated'): migrate_fixture(s,bad)


def test_duplicate_legacy_ids_do_not_overwrite(settings,tmp_path):
    s=target(settings,tmp_path);bad=fixture();bad['orders'].append(deepcopy(bad['orders'][0]))
    with pytest.raises(ValueError,match='Duplicate legacy ID'): migrate_fixture(s,bad)
    with connect(s) as db: assert not db.execute('SELECT 1 FROM mf_orders').fetchone()
