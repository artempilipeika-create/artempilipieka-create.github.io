import json
import os
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.v2.config import Settings
from backend.v2.db import connect, transaction
from backend.v2.events import record_event
from backend.v2.files import read_verified, save_private_file
from backend.v2.migrate import migrate, MIGRATIONS
from backend.v2.probe import create_probe, verify_probe
from backend.v2.rbac import allowed
from backend.v2.storage import VolumeStore, new_key, sha256


@pytest.fixture
def environment(monkeypatch, tmp_path):
    for name in list(os.environ):
        if name.startswith(('MF_', 'RAILWAY_')) or name in {'DATABASE_URL','AGENT_API_KEY','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID'}:
            monkeypatch.delenv(name,raising=False)
    values = {'MF_ENVIRONMENT':'staging','MF_DATABASE_URL':'postgresql://mf_staging_app@localhost/mf_staging_test',
              'MF_DATABASE_HOST':'localhost','MF_DATABASE_NAME':'mf_staging_test',
              'MF_PRIVATE_STORAGE_ROOT':str(tmp_path/'private'),'MF_JOB_NAMESPACE':'mf.staging.test'}
    for key,value in values.items():
        monkeypatch.setenv(key,value)
    return values


def test_config_valid(environment):
    assert Settings.from_env().namespace == 'mf.staging.test'


@pytest.mark.parametrize('key,value',[
    ('MF_ENVIRONMENT','production'),('MF_DATABASE_URL','sqlite:///tmp/data.db'),
    ('DATABASE_URL','postgresql://forbidden'),('AGENT_API_KEY','forbidden'),
    ('TELEGRAM_BOT_TOKEN','forbidden'),('MF_JOB_NAMESPACE','production'),
    ('MF_AGENT_TRANSPORT','enabled'),('MF_OUTBOX_DISPATCH','enabled'),
    ('MF_PRIVATE_STORAGE_ROOT','/app/public/files'),('MF_DATABASE_HOST','other-host'),
    ('MF_DATABASE_NAME','other_database'),
    ('RAILWAY_PROJECT_ID','7f59bf67-56db-4f6c-b213-c9c7b9342932'),
])
def test_config_fail_closed(environment,monkeypatch,key,value):
    monkeypatch.setenv(key,value)
    with pytest.raises(ValueError):
        Settings.from_env()


def test_railway_default_postgres_names_are_allowed_when_isolated(environment,monkeypatch):
    monkeypatch.setenv('MF_DATABASE_URL','postgresql://postgres@localhost/railway')
    monkeypatch.setenv('MF_DATABASE_NAME','railway')
    settings = Settings.from_env()
    assert settings.database_name == 'railway'


def test_railway_requires_mounted_volume(environment,monkeypatch):
    for key,value in {'RAILWAY_PROJECT_ID':'test-project','MF_EXPECTED_RAILWAY_PROJECT_ID':'test-project',
                      'RAILWAY_ENVIRONMENT_ID':'test-env','MF_EXPECTED_RAILWAY_ENVIRONMENT_ID':'test-env',
                      'RAILWAY_SERVICE_ID':'new-staging-service','MF_EXPECTED_RAILWAY_SERVICE_ID':'new-staging-service'}.items():
        monkeypatch.setenv(key,value)
    with pytest.raises(ValueError,match='persistent volume'):
        Settings.from_env()


def test_existing_preview_service_is_rejected(environment,monkeypatch):
    for key,value in {'RAILWAY_PROJECT_ID':'preview-project','MF_EXPECTED_RAILWAY_PROJECT_ID':'preview-project',
                      'RAILWAY_SERVICE_ID':'42c638e9-4dc2-4e9a-9ec9-e670ae661bb6',
                      'MF_EXPECTED_RAILWAY_SERVICE_ID':'42c638e9-4dc2-4e9a-9ec9-e670ae661bb6'}.items():
        monkeypatch.setenv(key,value)
    with pytest.raises(ValueError,match='service identity'):
        Settings.from_env()


def test_volume_durable_immutable_and_no_traversal(tmp_path):
    store = VolumeStore(tmp_path/'private')
    key = new_key()
    store.put(key,b'test bytes')
    assert VolumeStore(tmp_path/'private').read(key) == b'test bytes'
    with pytest.raises(FileExistsError):
        store.put(key,b'changed')
    for invalid in ['../public/leak','/tmp/leak','objects/aa/../../../leak','test.oblx']:
        with pytest.raises(ValueError):
            store.read(invalid)
    assert not list((tmp_path/'private').rglob('.upload-*'))


def test_volume_rejects_symlink(tmp_path):
    store = VolumeStore(tmp_path/'private')
    key = new_key()
    outside = tmp_path/'outside'
    outside.mkdir()
    (store.root/'objects').symlink_to(outside,target_is_directory=True)
    with pytest.raises(ValueError):
        store.put(key,b'forbidden')


def test_http_has_no_files_or_legacy_routes(environment,monkeypatch):
    from backend.v2 import app as module
    monkeypatch.setattr(module,'readiness',lambda settings: None)
    with TestClient(module.create_app(Settings.from_env())) as client:
        assert client.get('/health').json()['agent_transport'] == 'disabled'
        assert 'Disallow: /' in client.get('/robots.txt').text
        for path in ['/','/public/probe.txt','/static/probe.txt','/objects/aa/test','/storage/test',
                     '/api/orders','/api/agent/pull','/api/agent/ack','/api/agent/events',
                     '/api/v2/files/123','/api/v2/orders/123/oblx','/docs','/openapi.json']:
            for method in ['GET','HEAD','POST']:
                response = client.request(method,path,headers={'Range':'bytes=0-5'})
                assert response.status_code == 404
                assert 'noindex' in response.headers['x-robots-tag']


@pytest.fixture(scope='module')
def db_settings(tmp_path_factory):
    if not os.environ.get('MF_TEST_DATABASE_URL'):
        pytest.skip('Native Postgres integration requires MF_TEST_DATABASE_URL')
    from psycopg.conninfo import conninfo_to_dict
    dsn = os.environ['MF_TEST_DATABASE_URL']
    info = conninfo_to_dict(dsn)
    if not info.get('dbname','').startswith('mf_staging_') or info.get('host') not in {'postgres','127.0.0.1','localhost'}:
        pytest.fail('Tests only permit isolated CI/local Postgres')
    settings = Settings(dsn,info['host'],info['dbname'],tmp_path_factory.mktemp('private'), 'mf.staging.ci','ci')
    migrate(settings)
    return settings


@pytest.fixture
def probe(db_settings):
    return create_probe(db_settings)


def test_postgres_migrations_idempotent_and_drift_rejected(db_settings,tmp_path):
    migrate(db_settings)
    with connect(db_settings) as conn:
        assert conn.execute('SELECT count(*) AS n FROM mf_schema_migrations').fetchone()['n'] == 1
        tables = {r['tablename'] for r in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")}
        assert {'mf_users','mf_sessions','mf_email_verifications','mf_orders','mf_order_revisions',
                'mf_manager_assignments','mf_files','mf_audit','mf_outbox','mf_job_events','mf_production_jobs'} <= tables
        assert 'orders' not in tables and 'events' not in tables
    path = tmp_path/'0001_foundation.sql'
    path.write_bytes((MIGRATIONS/path.name).read_bytes()+b'\n-- changed')
    with pytest.raises(ValueError,match='checksum'):
        migrate(db_settings,tmp_path)


def test_domain_audit_outbox_atomic_rollback(db_settings,probe):
    with connect(db_settings) as conn:
        actor = conn.execute('SELECT owner_user_id FROM mf_orders WHERE order_id=%s',(probe['order_id'],)).fetchone()['owner_user_id']
    object_id = str(uuid4())
    with pytest.raises(RuntimeError,match='injected'):
        with transaction(db_settings) as conn:
            conn.execute("INSERT INTO mf_orders(order_id,business_name,owner_user_id,preparation_mode) VALUES (%s,'rollback',%s,'self_prepared')", (object_id,actor))
            record_event(conn,db_settings,actor=actor,action='test.rollback',object_type='order',object_id=object_id,reason='fault injection')
            raise RuntimeError('injected fault after all writes')
    with connect(db_settings) as conn:
        for table,key in [('mf_orders','order_id'),('mf_audit','object_id'),('mf_outbox','aggregate_id')]:
            assert conn.execute(f'SELECT count(*) AS n FROM {table} WHERE {key}=%s',(object_id,)).fetchone()['n'] == 0
    assert verify_probe(db_settings,probe)['verified']


def test_outbox_failure_rolls_back_domain_and_audit(db_settings,probe):
    with connect(db_settings) as conn:
        actor = conn.execute('SELECT owner_user_id FROM mf_orders WHERE order_id=%s',(probe['order_id'],)).fetchone()['owner_user_id']
    object_id = str(uuid4())
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        with transaction(db_settings) as conn:
            conn.execute("INSERT INTO mf_orders(order_id,business_name,owner_user_id,preparation_mode) VALUES (%s,'rollback',%s,'self_prepared')",(object_id,actor))
            record_event(conn,replace(db_settings,namespace='mf.staging.wrong'),actor=actor,action='test.fail',
                         object_type='order',object_id=object_id,reason='force outbox FK failure')
    with connect(db_settings) as conn:
        assert conn.execute('SELECT count(*) AS n FROM mf_orders WHERE order_id=%s',(object_id,)).fetchone()['n'] == 0
        assert conn.execute('SELECT count(*) AS n FROM mf_audit WHERE object_id=%s',(object_id,)).fetchone()['n'] == 0


def test_constraints_block_transport_and_journal_mutation(db_settings,probe):
    statements = [
        ("UPDATE mf_production_jobs SET status='queued' WHERE job_id=%s",probe['job_id']),
        ("UPDATE mf_outbox SET destination='production' WHERE event_id=%s",probe['audit_event_id']),
        ("UPDATE mf_audit SET reason='tamper' WHERE event_id=%s",probe['audit_event_id']),
    ]
    for statement,key in statements:
        with pytest.raises(psycopg.Error):
            with transaction(db_settings) as conn:
                conn.execute(statement,(key,))


def test_revision_immutable_and_cross_order_fk(db_settings,probe):
    another = create_probe(db_settings)
    with transaction(db_settings) as conn:
        conn.execute('UPDATE mf_order_revisions SET immutable_at=now() WHERE revision_id=%s',(probe['revision_id'],))
    with pytest.raises(psycopg.Error):
        with transaction(db_settings) as conn:
            conn.execute("UPDATE mf_order_revisions SET content='{}' WHERE revision_id=%s",(probe['revision_id'],))
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        with transaction(db_settings) as conn:
            conn.execute('UPDATE mf_orders SET active_revision_id=%s WHERE order_id=%s',(another['revision_id'],probe['order_id']))


def test_file_manifest_persist_hash_and_failed_write(db_settings,probe):
    with connect(db_settings) as conn:
        row = conn.execute('SELECT * FROM mf_files WHERE file_id=%s',(probe['file_id'],)).fetchone()
        assert row['sha256'] == probe['sha256'] and row['status'] == 'ready'
        assert len(read_verified(conn,VolumeStore(db_settings.storage_root),probe['file_id'])) == row['size_bytes']
    class BrokenStore:
        def put(self,*args):
            raise OSError('simulated volume error')
    with pytest.raises(OSError):
        save_private_file(db_settings,BrokenStore(),actor=row['created_by'],data=b'fail',name='fail.txt',kind='test',mime='text/plain')
    with connect(db_settings) as conn:
        failed = conn.execute("SELECT * FROM mf_files WHERE created_by=%s AND original_name='fail.txt'",(row['created_by'],)).fetchone()
        assert failed['status'] == 'failed'
        assert conn.execute('SELECT count(*) AS n FROM mf_outbox WHERE aggregate_id=%s',(str(failed['file_id']),)).fetchone()['n'] == 0


def test_rbac_explicit_grants_current_scope_and_client_oblx_deny(db_settings,probe):
    manager,other,client,admin = [uuid4() for _ in range(4)]
    with transaction(db_settings) as conn:
        for user,role in [(manager,'manager'),(other,'manager'),(client,'client'),(admin,'admin')]:
            conn.execute('INSERT INTO mf_users(user_id) VALUES (%s)',(user,))
            conn.execute('INSERT INTO mf_user_roles VALUES (%s,%s)',(user,role))
        conn.execute('UPDATE mf_orders SET owner_user_id=%s,assigned_manager_id=%s WHERE order_id=%s',(client,manager,probe['order_id']))
        assert not allowed(conn,admin,'orders.read',order_id=probe['order_id'])
        for user,perm,scope in [(manager,'orders.read','assigned'),(client,'orders.oblx.read','own'),
                                (manager,'orders.oblx.read','all'),(admin,'orders.read','all')]:
            conn.execute('''INSERT INTO mf_permission_grants(grant_id,user_id,permission,scope_type,granted_by)
                VALUES (%s,%s,%s,%s,%s)''',(uuid4(),user,perm,scope,admin))
        assert allowed(conn,manager,'orders.read',order_id=probe['order_id'])
        assert allowed(conn,admin,'orders.read',order_id=probe['order_id'])
        assert not allowed(conn,manager,'orders.oblx.read',order_id=probe['order_id'])
        assert not allowed(conn,client,'orders.oblx.read',order_id=probe['order_id'],file_kind='oblx')
        conn.execute('UPDATE mf_orders SET assigned_manager_id=%s WHERE order_id=%s',(other,probe['order_id']))
        assert not allowed(conn,manager,'orders.read',order_id=probe['order_id'])
        conn.execute("UPDATE mf_users SET account_status='blocked' WHERE user_id=%s",(admin,))
        assert not allowed(conn,admin,'orders.read',order_id=probe['order_id'])


def test_http_with_native_postgres(db_settings,probe):
    from backend.v2.app import create_app
    with TestClient(create_app(db_settings)) as client:
        assert client.get('/health').status_code == 200
        assert client.get('/api/v2/files/'+probe['file_id']).status_code == 404


def test_backup_restore_separate_database(db_settings,tmp_path):
    from backend.v2.backup import backup,restore
    from psycopg import sql
    from psycopg.conninfo import conninfo_to_dict,make_conninfo
    target_name = 'mf_staging_restore_'+uuid4().hex[:8]
    with connect(db_settings,autocommit=True) as conn:
        conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(target_name)))
    info = conninfo_to_dict(db_settings.database_url)
    # Settings constructed directly for this isolated test; production config requires a URL.
    target = replace(db_settings,database_url=make_conninfo(**{**info,'dbname':target_name}),
                     database_name=target_name,storage_root=tmp_path/'restore-private')
    probe = create_probe(db_settings)
    before = {}
    with connect(db_settings) as conn:
        for row in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"):
            name=row['tablename']
            before[name]=conn.execute(sql.SQL('SELECT count(*) AS n FROM {}').format(sql.Identifier(name))).fetchone()['n']
    manifest = backup(db_settings,tmp_path/'backup')
    result = restore(target,tmp_path/'backup')
    assert result['restored'] and verify_probe(target,probe)['verified']
    with connect(target) as conn:
        for name,count in before.items():
            assert conn.execute(sql.SQL('SELECT count(*) AS n FROM {}').format(sql.Identifier(name))).fetchone()['n'] == count
    with pytest.raises(ValueError,match='nonempty'):
        restore(target,tmp_path/'backup')
    with pytest.raises(ValueError,match='separate'):
        restore(db_settings,tmp_path/'backup')
    evidence = {'native_postgres':True,'scope':'isolated CI/local only; NOT Railway',
                'backup_restore':'PASS','tables':before,'file_count':len(manifest['files']),
                'probe':probe,'database_dump_sha256':manifest['database_sha256']}
    out = Path(os.environ.get('MF_TEST_EVIDENCE_DIR',str(tmp_path)))
    out.mkdir(exist_ok=True,parents=True)
    (out/'restore-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
