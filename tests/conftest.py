import pytest
from cryptography.fernet import Fernet

@pytest.fixture(autouse=True)
def web_policy_environment(monkeypatch):
    monkeypatch.setenv('MF_WEB_ORIGIN','https://testserver')
    monkeypatch.setenv('MF_EMAIL_SEAL_KEY',Fernet.generate_key().decode())
