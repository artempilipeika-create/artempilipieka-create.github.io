"""Startup recovery against disposable local Postgres; never live credentials."""
from uuid import uuid4
import pytest
from backend.v2 import stage03_operator as operator
from backend.v2.db import connect, transaction
from backend.v2.security import digest, grant, password_hash, password_valid
from tests.stage02.test_security import settings

OLD = 'Synthetic-Old-Recovery-Fixture-Only!'
NEW = 'Synthetic-New-Recovery-Fixture-Only-' + 'x' * 24


@pytest.fixture
def recovery(settings, monkeypatch):
    for name in ('RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID', 'RAILWAY_ENVIRONMENT_ID',
                 'DATABASE_URL', 'AGENT_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
                 'PRODUCTION_DATABASE_URL', 'PRODUCTION_AGENT_API_KEY'):
        monkeypatch.delenv(name, raising=False)
    for name, value in {
        'MF_ENVIRONMENT': 'staging', 'MF_AGENT_TRANSPORT': 'disabled',
        'MF_OUTBOX_DISPATCH': 'disabled', 'MF_DATABASE_URL': settings.database_url,
        'MF_DATABASE_HOST': settings.database_host, 'MF_DATABASE_NAME': settings.database_name,
        'MF_PRIVATE_STORAGE_ROOT': str(settings.storage_root), 'MF_JOB_NAMESPACE': settings.namespace,
        'RAILWAY_DEPLOYMENT_ID': settings.instance_id,
        'MF_STAGE03_OPERATOR_MODE': 'recover_existing_admin',
        'MF_STAGE03_OPERATOR_PASSWORD': NEW,
    }.items():
        monkeypatch.setenv(name, value)
    uid, other = uuid4(), uuid4()
    email = uid.hex + '@example.invalid'
    with transaction(settings) as c:
        for user, state in ((uid, 'disabled'), (other, 'active')):
            c.execute('''INSERT INTO mf_users(user_id,email,password_hash,account_status,updated_at)
                VALUES (%s,%s,%s,%s,now()-interval '1 day')''',
                (user, user.hex + '@example.invalid', password_hash(OLD), state))
            c.execute('INSERT INTO mf_user_roles VALUES (%s,%s)', (user, 'admin' if user == uid else 'viewer'))
            for revoked in (False, False, True):
                c.execute('''INSERT INTO mf_sessions(session_id,user_id,token_hash,expires_at,revoked_at)
                    VALUES (%s,%s,%s,now()+interval '1 day',CASE WHEN %s THEN now()-interval '1 day' END)''',
                    (uuid4(), user, digest(uuid4().hex), revoked))
        for permission in ('orders.read', 'audit.read', 'users.roles.write'):
            grant(c, user_id=uid, permission=permission, scope='all', actor=uid)
        c.execute("UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND permission='audit.read'", (uid,))
    monkeypatch.setenv('MF_STAGE03_OPERATOR_EMAIL', email)
    monkeypatch.setenv('MF_STAGE03_OPERATOR_USER_ID', str(uid))
    return uid, email, other


def snapshot(settings, uid):
    with connect(settings) as c:
        result = {}
        for table, key, order in (
            ('mf_users', 'user_id', 'user_id'), ('mf_user_roles', 'user_id', 'role'),
            ('mf_permission_grants', 'user_id', 'grant_id'), ('mf_sessions', 'user_id', 'session_id'),
            ('mf_audit', 'object_id', 'event_id'), ('mf_outbox', 'aggregate_id', 'event_id'),
        ):
            result[table] = c.execute(f'SELECT * FROM {table} WHERE {key}=%s ORDER BY {order}',
                                      (str(uid),)).fetchall()
        return result


@pytest.mark.parametrize('already_verified', [False, True])
def test_exact_admin_hash_sessions_roles_grants_audit(settings, recovery, monkeypatch, capsys, caplog, already_verified):
    uid, email, other = recovery
    if already_verified:
        with transaction(settings) as c:
            c.execute("UPDATE mf_users SET email_verified_at=now()-interval '2 days' WHERE user_id=%s", (uid,))
    before, other_before = snapshot(settings, uid), snapshot(settings, other)
    monkeypatch.setenv('MF_STAGE03_OPERATOR_EMAIL', email.upper())
    operator.run_if_requested(settings)
    after = snapshot(settings, uid)
    user, old_user = after['mf_users'][0], before['mf_users'][0]
    assert user['user_id'] == uid and user['email'] == email
    assert user['password_hash'] != old_user['password_hash']
    assert password_valid(NEW, user['password_hash'])
    assert not password_valid(OLD, user['password_hash'])
    assert user['account_status'] == 'active' and user['email_verified_at']
    assert user['updated_at'] > old_user['updated_at']
    if already_verified:
        assert user['email_verified_at'] == old_user['email_verified_at']
    allowed = {'password_hash', 'account_status', 'email_verified_at', 'updated_at'}
    assert {k:v for k,v in user.items() if k not in allowed} == {k:v for k,v in old_user.items() if k not in allowed}
    assert after['mf_user_roles'] == before['mf_user_roles'] == [{'user_id': uid, 'role': 'admin'}]
    assert after['mf_permission_grants'] == before['mf_permission_grants']
    assert all(s['revoked_at'] for s in after['mf_sessions'])
    for old, new in zip(before['mf_sessions'], after['mf_sessions']):
        if old['revoked_at']:
            assert old == new
    assert snapshot(settings, other) == other_before
    event, = after['mf_audit']
    assert event['action'] == 'staff.admin.recovered'
    assert event['object_type'] == 'user' and event['object_id'] == str(uid)
    assert event['actor_user_id'] == uid
    assert event['reason'] == 'Explicit isolated staging administrator credential recovery'
    assert len(after['mf_outbox']) == 1
    out = capsys.readouterr()
    assert out.out == 'MF_STAGE03_ADMIN_RECOVERED\n' and not out.err
    assert all(secret not in str(after['mf_audit']) + str(after['mf_outbox']) + out.out + out.err + caplog.text
               for secret in (NEW, OLD, email, user['password_hash']))


@pytest.mark.parametrize('case', ['wrong_id', 'wrong_email', 'missing_user', 'invalid_id', 'missing_id',
                                  'short_password', 'long_password', 'missing_password', 'missing_email'])
def test_mismatched_identity_or_credentials_no_changes(settings, recovery, monkeypatch, capsys, caplog, case):
    uid, email, other = recovery
    before, other_before = snapshot(settings, uid), snapshot(settings, other)
    changes = {
        'wrong_id': ('MF_STAGE03_OPERATOR_USER_ID', str(other)),
        'wrong_email': ('MF_STAGE03_OPERATOR_EMAIL', other.hex + '@example.invalid'),
        'missing_user': ('MF_STAGE03_OPERATOR_USER_ID', str(uuid4())),
        'invalid_id': ('MF_STAGE03_OPERATOR_USER_ID', 'not-a-uuid-' + NEW),
        'missing_id': ('MF_STAGE03_OPERATOR_USER_ID', ''),
        'short_password': ('MF_STAGE03_OPERATOR_PASSWORD', 'x' * 31),
        'long_password': ('MF_STAGE03_OPERATOR_PASSWORD', 'x' * 129),
        'missing_password': ('MF_STAGE03_OPERATOR_PASSWORD', ''),
        'missing_email': ('MF_STAGE03_OPERATOR_EMAIL', ''),
    }
    monkeypatch.setenv(*changes[case])
    with pytest.raises(ValueError) as error:
        operator.run_if_requested(settings)
    assert snapshot(settings, uid) == before and snapshot(settings, other) == other_before
    out = capsys.readouterr()
    assert 'MF_STAGE03_ADMIN_RECOVERED' not in out.out
    assert NEW not in str(error.value) + out.out + out.err + caplog.text
    assert email not in str(error.value)


@pytest.mark.parametrize('roles', [('client',), ('manager',), ('production',), ('accounting',),
                                  ('viewer',), ('service_agent',), (), ('admin', 'manager')])
def test_non_admin_or_mixed_roles_refused_without_changes(settings, recovery, roles):
    uid, _, _ = recovery
    with transaction(settings) as c:
        c.execute('DELETE FROM mf_user_roles WHERE user_id=%s', (uid,))
        for role in roles:
            c.execute('INSERT INTO mf_user_roles VALUES (%s,%s)', (uid, role))
    before = snapshot(settings, uid)
    with pytest.raises(ValueError, match='exactly the admin role'):
        operator.run_if_requested(settings)
    assert snapshot(settings, uid) == before


@pytest.mark.parametrize('mode', [None, 'off'])
def test_default_and_off_do_not_connect(settings, monkeypatch, mode):
    monkeypatch.delenv('MF_STAGE03_OPERATOR_MODE', raising=False)
    if mode:
        monkeypatch.setenv('MF_STAGE03_OPERATOR_MODE', mode)
    monkeypatch.setattr(operator, 'transaction', lambda _: pytest.fail('off must not access DB'))
    operator.run_if_requested(settings)


@pytest.mark.parametrize('case', ['production', 'wrong_db', 'wrong_railway', 'dispatch'])
def test_staging_guards_refuse_before_updates(settings, recovery, monkeypatch, case):
    uid, _, _ = recovery
    before = snapshot(settings, uid)
    changes = {'production': ('MF_ENVIRONMENT', 'production'),
               'wrong_db': ('MF_DATABASE_NAME', 'mismatch'),
               'wrong_railway': ('RAILWAY_PROJECT_ID', '7f59bf67-56db-4f6c-b213-c9c7b9342932'),
               'dispatch': ('MF_OUTBOX_DISPATCH', 'enabled')}
    monkeypatch.setenv(*changes[case])
    with pytest.raises(ValueError, match='Isolated staging'):
        operator.run_if_requested(settings)
    assert snapshot(settings, uid) == before


def test_audit_failure_rolls_back_and_redacts_exception(settings, recovery, monkeypatch, capsys, caplog):
    uid, email, _ = recovery
    before = snapshot(settings, uid)
    def failing_audit(*args, **kwargs):
        raise RuntimeError('Injected downstream failure ' + NEW + email)
    monkeypatch.setattr(operator, 'record_event', failing_audit)
    with pytest.raises(ValueError, match='transaction rolled back') as error:
        operator.run_if_requested(settings)
    assert snapshot(settings, uid) == before
    import traceback
    rendered = ''.join(traceback.format_exception(error.value))
    out = capsys.readouterr()
    assert NEW not in rendered + out.out + out.err + caplog.text and email not in rendered
    assert 'MF_STAGE03_ADMIN_RECOVERED' not in out.out
