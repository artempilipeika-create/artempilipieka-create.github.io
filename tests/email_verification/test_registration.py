"""Registration acceptance on a dedicated local Postgres, never a deployed database."""
import json
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from uuid import uuid4
from unittest.mock import patch

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from psycopg.conninfo import conninfo_to_dict
from backend.v2 import mail
from backend.v2.app import create_app
from backend.v2.config import Settings
from backend.v2.db import connect, transaction
from backend.v2.migrate import migrate
from backend.v2.security import WebPolicy, COOKIE, password_hash

PASSWORD = 'Synthetic-registration-only-2026!'

@pytest.fixture
def ctx(tmp_path, monkeypatch):
    dsn = os.environ.get('MF_TEST_DATABASE_URL')
    if not dsn:
        pytest.skip('Dedicated local Postgres required')
    info = conninfo_to_dict(dsn)
    assert info['host'] in {'localhost', '127.0.0.1'}
    assert info['dbname'].startswith('mf_staging_email_test')
    settings = Settings(dsn, info['host'], info['dbname'], tmp_path/'private', 'mf.staging.email_test', 'test')
    migrate(settings)
    policy = WebPolicy('https://testserver', Fernet.generate_key(), network_auth_per_hour=10000)
    monkeypatch.setenv('MF_EMAIL_PROVIDER', 'fake')
    with TestClient(create_app(settings, policy), base_url=policy.origin,
                    headers={'Origin': policy.origin}) as api:
        yield settings, policy, api

def register(api):
    email = uuid4().hex+'@example.invalid'
    response = api.post('/api/v2/auth/register', json={'email': email, 'password': PASSWORD})
    assert response.status_code == 201
    assert COOKIE not in response.cookies
    assert response.json()['registration_pending'] and not response.json()['email_verified']
    return response.json()

def token_for(settings, policy, uid):
    with connect(settings) as conn:
        row = conn.execute('''SELECT d.sealed_message,v.token_hash FROM mf_email_deliveries d
            JOIN mf_email_verifications v USING(verification_id) WHERE v.user_id=%s
            ORDER BY d.created_at DESC LIMIT 1''', (uid,)).fetchone()
    token = json.loads(Fernet(policy.email_seal_key).decrypt(row['sealed_message'].encode()))['url'].split('#token=')[1]
    assert token not in str(row)
    return token

def age_delivery(settings, uid):
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_email_verifications SET created_at=created_at-interval '61 seconds' WHERE user_id=%s", (uid,))

def login(api, email):
    return api.post('/api/v2/auth/login', json={'email': email, 'password': PASSWORD})

def test_register_verify_once_login_draft_logout(ctx):
    settings, policy, api = ctx
    user = register(api)
    assert api.get('/api/v2/auth/me').status_code == 401
    denied = login(api, user['email'])
    assert denied.status_code == 403 and denied.json()['detail']['code'] == 'EMAIL_NOT_VERIFIED'
    token = token_for(settings, policy, user['user_id'])
    def confirm(_):
        with TestClient(create_app(settings, policy), base_url=policy.origin, headers={'Origin': policy.origin}) as other:
            return other.post('/api/v2/auth/email-verification/confirm', json={'token': token}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm, range(2))) == [200, 400]
    assert login(api, user['email']).status_code == 200
    assert api.get('/api/v2/auth/me').json()['email_verified']
    assert api.post('/api/v2/orders', json={'business_name': 'Synthetic verification draft'}).status_code == 201
    assert api.post('/api/v2/auth/logout', json={}).status_code == 204
    assert api.get('/api/v2/auth/me').status_code == 401
    assert login(api, user['email']).status_code == 200

def test_resend_limits_revocation_expiration(ctx):
    settings, policy, api = ctx
    user = register(api)
    old = token_for(settings, policy, user['user_id'])
    resend = lambda: api.post('/api/v2/auth/email-verification/resend', json={'email': user['email']})
    assert resend().status_code == 429
    age_delivery(settings, user['user_id'])
    assert resend().status_code == 202
    assert api.post('/api/v2/auth/email-verification/confirm', json={'token': old}).status_code == 400
    latest = token_for(settings, policy, user['user_id'])
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_email_verifications SET expires_at=now()-interval '1 second' WHERE user_id=%s", (user['user_id'],))
    assert api.post('/api/v2/auth/email-verification/confirm', json={'token': latest}).status_code == 400
    for _ in range(3):
        age_delivery(settings, user['user_id'])
        assert resend().status_code == 202
    age_delivery(settings, user['user_id'])
    assert resend().status_code == 429

def test_email_change_revokes_session_and_requires_verify(ctx):
    settings, policy, api = ctx
    user = register(api)
    token = token_for(settings, policy, user['user_id'])
    assert api.post('/api/v2/auth/email-verification/confirm', json={'token': token}).status_code == 200
    assert login(api, user['email']).status_code == 200
    age_delivery(settings, user['user_id'])
    new_email = uuid4().hex+'@example.invalid'
    assert api.post('/api/v2/auth/email/change', json={'email': new_email, 'password': PASSWORD}).status_code == 200
    assert api.get('/api/v2/auth/me').status_code == 401
    assert login(api, new_email).status_code == 403
    new_token = token_for(settings, policy, user['user_id'])
    assert api.post('/api/v2/auth/email-verification/confirm', json={'token': new_token}).status_code == 200
    assert login(api, new_email).status_code == 200

def test_staff_login_preserved(ctx):
    settings, _, api = ctx
    uid, email = uuid4(), uuid4().hex+'@example.invalid'
    with transaction(settings) as conn:
        conn.execute('INSERT INTO mf_users(user_id,email,password_hash) VALUES (%s,%s,%s)', (uid,email,password_hash(PASSWORD)))
        conn.execute("INSERT INTO mf_user_roles VALUES (%s,'admin')", (uid,))
    assert login(api, email).status_code == 200
    assert api.get('/api/v2/auth/me').json()['roles'] == ['admin']

def test_provider_fail_closed_and_resend_contract(monkeypatch):
    monkeypatch.delenv('MF_EMAIL_PROVIDER', raising=False)
    with pytest.raises(RuntimeError): mail.validate_mail_config()
    monkeypatch.setenv('MF_EMAIL_PROVIDER', 'smtp')
    monkeypatch.delenv('MF_SMTP_PASSWORD', raising=False)
    with pytest.raises(mail.MailDeliveryError): mail.validate_mail_config()
    monkeypatch.setenv('MF_EMAIL_PROVIDER', 'resend')
    with pytest.raises(mail.MailDeliveryError): mail.validate_mail_config()
    monkeypatch.setenv('MF_SMTP_PASSWORD', 're_synthetic_test_only')
    monkeypatch.setenv('MF_SMTP_FROM', 'onboarding@resend.dev')
    assert mail.validate_mail_config() == 'resend'
    def handler(request):
        assert str(request.url) == 'https://api.resend.com/emails'
        assert request.headers['Idempotency-Key'] == 'mf-verification-synthetic'
        body = json.loads(request.content)
        assert body['subject'] == 'Подтвердите email — Martin Forest'
        assert '/verify-email#token=' in body['html']
        return httpx.Response(200, json={'id': 'synthetic-message'})
    client_type = httpx.Client
    with patch.object(mail.httpx, 'Client', lambda **kw: client_type(transport=httpx.MockTransport(handler), **kw)):
        mail._send_resend({'to': 'test@example.invalid', 'url': 'https://testserver/verify-email#token=synthetic'}, 'synthetic')

def test_delivery_failure_keeps_account_locked_and_redacts_errors(ctx, monkeypatch):
    settings, policy, api = ctx
    monkeypatch.setenv('MF_EMAIL_PROVIDER', 'resend')
    def failure(*args): raise RuntimeError('sensitive-provider-detail')
    monkeypatch.setattr(mail, '_send_resend', failure)
    email = uuid4().hex+'@example.invalid'
    response = api.post('/api/v2/auth/register', json={'email': email, 'password': PASSWORD})
    assert response.status_code == 503
    assert 'sensitive-provider-detail' not in response.text and PASSWORD not in response.text
    assert api.get('/api/v2/auth/me').status_code == 401
    assert login(api, email).status_code == 403
