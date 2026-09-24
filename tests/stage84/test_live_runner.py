"""Exercise the live operator contract in isolated ASGI, clearly separate from HTTPS evidence."""
import json
from unittest.mock import patch
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from backend.v2.app import create_app
from backend.v2.db import connect
from backend.v2.security import WebPolicy
from backend.v2.stage84_acceptance import run, ORIGIN
from backend.v2.stage84_operator import pre_backup, checkpoint
from tests.stage03.test_api import settings


def test_one_shot_acceptance_retires_actors_and_restores(settings):
    pre_backup(settings)
    policy=WebPolicy(ORIGIN,Fernet.generate_key(),network_auth_per_hour=100000,network_emails_per_hour=100000)
    app=create_app(settings,policy)
    def client(**kw):
        return TestClient(app,base_url=kw['base_url'],headers=kw['headers'],cookies=kw['cookies'])
    with patch('backend.v2.stage84_acceptance.httpx.Client',client):
        run(settings,evidence_transport='isolated ASGI/Postgres; not live HTTPS')
    evidence=json.loads((settings.storage_root.parent/'stage84-live-evidence.json').read_text())
    assert evidence['temporary_credentials_retired'] and len(evidence['files'])==5
    assert all(r['status']==r['expected'] for r in evidence['responses'])
    assert evidence['gates_after']['native']=='NOT VERIFIED / CLOSED'
    with connect(settings) as c:
        assert not c.execute("SELECT 1 FROM mf_users WHERE email LIKE 'stage84-%' AND account_status<>'disabled'").fetchone()
        assert not c.execute('SELECT 1 FROM mf_sessions WHERE revoked_at IS NULL').fetchone()
        assert not c.execute('SELECT 1 FROM mf_permission_grants WHERE revoked_at IS NULL').fetchone()
    assert checkpoint(settings)['all_tables_and_bytes_equal']
