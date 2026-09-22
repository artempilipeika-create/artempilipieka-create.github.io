from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, field_validator
from fastapi import APIRouter, Request, Response
from psycopg.errors import UniqueViolation
from .db import transaction
from .events import record_event
from .security import (COOKIE, CLIENT_PERMISSIONS, digest, error, grant, identity, network_bucket,
                       new_session, password_hash, password_valid, throttle_auth)
from .mail import queue_verification, confirm

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class Credentials(StrictModel):
    email: str = Field(min_length=3,max_length=254)
    password: str = Field(min_length=12,max_length=128)

    @field_validator('email')
    @classmethod
    def normalize_email(cls,value):
        import re
        value = value.strip().lower()
        if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',value) or any(ord(c)<32 for c in value):
            raise ValueError('Invalid email')
        return value

class Confirmation(StrictModel):
    token: str = Field(min_length=40,max_length=128)


def user_dto(user):
    client = user['roles'] == {'client'}
    return {'user_id':str(user['user_id']), 'email':user['email'],'roles':sorted(user['roles']),
            'account_status':user['account_status'],'email_verified':bool(user['email_verified_at']),
            # Exact capabilities filled from current grants by /me; no secrets or session hash.
            'verification_required':not bool(user['email_verified_at'])}


def router(settings, policy):
    api = APIRouter(prefix='/api/v2/auth')

    @api.post('/register',status_code=201)
    def register(body: Credentials, request: Request, response: Response):
        throttle_auth(settings,policy,request)
        user_id = uuid4()
        encoded = password_hash(body.password)
        try:
            with transaction(settings) as conn:
                user = conn.execute('''INSERT INTO mf_users(user_id,email,password_hash) VALUES (%s,%s,%s)
                    RETURNING *''',(user_id,body.email,encoded)).fetchone()
                conn.execute("INSERT INTO mf_user_roles VALUES (%s,'client')",(user_id,))
                for permission in CLIENT_PERMISSIONS:
                    grant(conn,user_id=user_id,permission=permission,scope='own',actor=user_id)
                record_event(conn,settings,actor=user_id,action='auth.registered',object_type='user',object_id=user_id,reason='Client registration')
                queue_verification(conn,settings,policy,user,network_bucket(request))
                new_session(conn,policy,user_id,response)
                return user_dto({**user,'roles':{'client'}})
        except UniqueViolation:
            error(409,'REGISTRATION_UNAVAILABLE')

    @api.post('/login')
    def login(body: Credentials, request: Request, response: Response):
        throttle_auth(settings,policy,request)
        with transaction(settings) as conn:
            user = conn.execute('SELECT * FROM mf_users WHERE lower(email)=%s FOR UPDATE',(body.email,)).fetchone()
            encoded = user['password_hash'] if user else password_hash('dummy-login-value')
            valid = password_valid(body.password,encoded)
            if not user or not valid:
                error(401,'LOGIN_FAILED')
            roles = {r['role'] for r in conn.execute('SELECT role FROM mf_user_roles WHERE user_id=%s',(user['user_id'],))}
            if user['account_status'] != 'active' and not (user['account_status']=='blocked' and roles=={'client'}):
                error(403,'ACCOUNT_BLOCKED')
            if not roles or 'service_agent' in roles:
                error(403,'PERMISSION_DENIED')
            if not encoded.startswith('pbkdf2_sha256$600000$'):
                conn.execute('UPDATE mf_users SET password_hash=%s WHERE user_id=%s',(password_hash(body.password),user['user_id']))
            old = request.cookies.get(COOKIE)
            if old:
                conn.execute('UPDATE mf_sessions SET revoked_at=now() WHERE token_hash=%s',(digest(old),))
            new_session(conn,policy,user['user_id'],response)
            return user_dto({**user,'roles':roles})

    @api.get('/me')
    def me(request: Request):
        from .rbac import allowed
        with transaction(settings) as conn:
            user = identity(conn,request)
            result = user_dto(user)
            result['capabilities'] = {'draft_create':allowed(conn,user['user_id'],'orders.draft.write'),
                                      'email_verification_request':user['account_status']=='active' and not user['email_verified_at']}
            return result

    @api.post('/logout',status_code=204)
    def logout(request: Request, response: Response):
        with transaction(settings) as conn:
            token = request.cookies.get(COOKIE,'')
            conn.execute('UPDATE mf_sessions SET revoked_at=now() WHERE token_hash=%s',(digest(token),))
        response.delete_cookie(COOKIE,path='/',secure=True,httponly=True,samesite='lax')

    @api.post('/email-verification/request',status_code=202)
    def request_verification(request: Request):
        with transaction(settings) as conn:
            user = identity(conn,request)
            user = conn.execute('SELECT * FROM mf_users WHERE user_id=%s FOR UPDATE',(user['user_id'],)).fetchone()
            if user['account_status'] != 'active':
                error(403,'ACCOUNT_BLOCKED')
            queue_verification(conn,settings,policy,user,network_bucket(request))
        return {'status':'accepted','provider':'fake'}

    @api.post('/email-verification/confirm')
    def confirm_verification(body: Confirmation, request: Request):
        throttle_auth(settings,policy,request)
        with transaction(settings) as conn:
            confirm(conn,settings,body.token)
        return {'email_verified':True}

    @api.post('/email/change')
    def change_email(body: Credentials, request: Request, response: Response):
        throttle_auth(settings,policy,request)
        try:
            with transaction(settings) as conn:
                user = identity(conn,request)
                user = conn.execute('SELECT * FROM mf_users WHERE user_id=%s FOR UPDATE',(user['user_id'],)).fetchone()
                if user['account_status']!='active' or not password_valid(body.password,user['password_hash']):
                    error(403,'REAUTH_REQUIRED')
                if user['email'] == body.email:
                    error(409,'EMAIL_UNCHANGED')
                conn.execute('UPDATE mf_email_verifications SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL AND consumed_at IS NULL',(user['user_id'],))
                user = conn.execute('''UPDATE mf_users SET email=%s,email_version=email_version+1,email_verified_at=NULL,
                    verification_migration_state='unverified',updated_at=now() WHERE user_id=%s RETURNING *''',(body.email,user['user_id'])).fetchone()
                # Email change cannot circumvent resend budget. Request a new message after cooldown.
                conn.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(user['user_id'],))
                new_session(conn,policy,user['user_id'],response)
                record_event(conn,settings,actor=user['user_id'],action='email.changed',object_type='user',object_id=user['user_id'],reason='Password reauthentication; tokens and sessions revoked')
                return {'email_verified':False,'verification_request_required':True}
        except UniqueViolation:
            error(409,'EMAIL_UNAVAILABLE')
    return api
