"""Central web security policy; no legacy router or cached staff grants."""
from dataclasses import dataclass
from datetime import timedelta
import hashlib
import hmac
import ipaddress
import os
import secrets
from urllib.parse import urlsplit
from uuid import uuid4
from cryptography.fernet import Fernet
from fastapi import HTTPException
from .db import transaction

COOKIE = 'mf_v2_session'
CLIENT_PERMISSIONS = ('orders.read','orders.draft.write','orders.submit','orders.revision.create',
                      'orders.approve','files.source.read','files.preliminary_pdf.read','customers.pii.read',
                      'orders.prices.read','catalogue.read','templates.own.manage')
STAFF_ROLES = {'manager','production','accounting','viewer','admin','service_agent'}

@dataclass(frozen=True, repr=False)
class WebPolicy:
    origin: str
    email_seal_key: bytes
    verification_hours: int = 24
    resend_seconds: int = 60
    emails_per_hour: int = 5
    emails_per_day: int = 20
    network_emails_per_hour: int = 50
    network_auth_per_hour: int = 100
    session_days: int = 7

    def __post_init__(self):
        url = urlsplit(self.origin)
        if url.scheme != 'https' or not url.netloc or url.path or url.query or url.fragment or url.username:
            raise ValueError('Exact trusted HTTPS application origin required')
        Fernet(self.email_seal_key)

    @classmethod
    def from_env(cls):
        return cls(os.environ.get('MF_WEB_ORIGIN',''), os.environ.get('MF_EMAIL_SEAL_KEY','').encode())


def error(status, code):
    raise HTTPException(status, detail={'code': code})


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password):
    salt = secrets.token_bytes(16)
    value = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 600_000)
    return f'pbkdf2_sha256$600000${salt.hex()}${value.hex()}'


def password_valid(password, encoded):
    # Compatible with v9 260000-round hashes; rehash on successful login, never import role/verified state.
    try:
        algorithm, rounds, salt, expected = encoded.split('$')
        rounds = int(rounds)
        if algorithm != 'pbkdf2_sha256' or not 260_000 <= rounds <= 2_000_000 or len(salt) != 32:
            return False
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), rounds).hex()
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError, AttributeError):
        return False


def network_bucket(request):
    # Forwarded headers are deliberately not trusted. Proxies share a conservative limit.
    host = request.client.host if request.client else 'unknown'
    try:
        ip = ipaddress.ip_address(host)
        host = str(ipaddress.ip_network(f'{ip}/{24 if ip.version == 4 else 64}', strict=False))
    except ValueError:
        pass
    return digest(host)


def rate_limit(conn, bucket, *, maximum, seconds):
    conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 2))', (bucket,))
    count = conn.execute('SELECT count(*) AS n FROM mf_rate_events WHERE bucket=%s AND created_at > now() - %s',
                         (bucket, timedelta(seconds=seconds))).fetchone()['n']
    if count >= maximum:
        error(429, 'RATE_LIMITED')
    conn.execute('INSERT INTO mf_rate_events(event_id,bucket) VALUES (%s,%s)', (uuid4(),bucket))


def throttle_auth(settings, policy, request):
    # Own transaction: failed password attempts also consume the budget.
    with transaction(settings) as conn:
        rate_limit(conn, 'auth:'+network_bucket(request), maximum=policy.network_auth_per_hour, seconds=3600)


def identity(conn, request):
    token = request.cookies.get(COOKIE, '')
    if not token or len(token) > 256:
        error(401, 'AUTH_REQUIRED')
    row = conn.execute('''SELECT u.*, s.session_id FROM mf_sessions s JOIN mf_users u USING(user_id)
        WHERE s.token_hash=%s AND s.revoked_at IS NULL AND s.expires_at>now()''',(digest(token),)).fetchone()
    if not row or row['account_status'] == 'disabled':
        error(401,'AUTH_REQUIRED')
    row['roles'] = {r['role'] for r in conn.execute('SELECT role FROM mf_user_roles WHERE user_id=%s',(row['user_id'],))}
    if row['account_status'] == 'blocked' and row['roles'] != {'client'}:
        error(403,'ACCOUNT_BLOCKED')
    if not row['roles'] or 'service_agent' in row['roles']:
        # No browser credential can become an Agent identity. Leased job transport is out of scope.
        error(403,'PERMISSION_DENIED')
    return row


def verified(user):
    if not user['email_verified_at']:
        error(403,'EMAIL_NOT_VERIFIED')


def new_session(conn, policy, user_id, response):
    token = secrets.token_urlsafe(32)
    conn.execute('''INSERT INTO mf_sessions(session_id,user_id,token_hash,expires_at)
        VALUES (%s,%s,%s,now()+%s)''',(uuid4(),user_id,digest(token),timedelta(days=policy.session_days)))
    response.set_cookie(COOKIE,token,httponly=True,secure=True,samesite='lax',path='/',
                        max_age=policy.session_days*86400)


def grant(conn, *, user_id, permission, scope, actor, scope_id=None):
    grant_id = uuid4()
    conn.execute('''INSERT INTO mf_permission_grants(grant_id,user_id,permission,scope_type,scope_id,granted_by)
        VALUES (%s,%s,%s,%s,%s,%s)''',(grant_id,user_id,permission,scope,scope_id,actor))
    return grant_id
