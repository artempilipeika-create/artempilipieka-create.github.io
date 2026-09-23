"""Separate revocable service credentials, replay ledger and bounded request rate.

Raw MF_STAGING_AGENT credentials are returned once by an operator-only function.
No registration HTTP endpoint, browser session, admin privilege or production key.
"""
from datetime import datetime,timezone,timedelta
from uuid import UUID,uuid4
import hashlib,hmac,re,secrets
from psycopg.types.json import Jsonb
from .db import transaction
from .events import record_event
from .security import error


def digest(token): return hashlib.sha256(token.encode()).hexdigest()


def capabilities(values):
    if not isinstance(values,list) or not 1<=len(values)<=30 or len(set(values))!=len(values): error(422,'CAPABILITIES_INVALID')
    if any(not re.fullmatch(r'[A-Za-z0-9_.:-]{1,120}',v) for v in values): error(422,'CAPABILITIES_INVALID')
    return sorted(values)


def issue(settings, actor, allowed, days=1):
    """Explicit CLI/operator provisioning only. Caller stores the returned secret privately."""
    allowed=capabilities(allowed)
    if not 1<=days<=30: raise ValueError('Credential lifetime limit')
    with transaction(settings) as c:
        from .rbac import allowed as permission
        if not permission(c,actor,'production.agents.manage'): error(403,'PERMISSION_DENIED')
        aid,uid=uuid4(),uuid4();token='MF_STAGING_AGENT_'+aid.hex+'.'+secrets.token_urlsafe(48)
        c.execute("INSERT INTO mf_users(user_id,password_hash,email_verified_at) VALUES(%s,'service-only',now())",(uid,))
        c.execute("INSERT INTO mf_user_roles VALUES(%s,'service_agent')",(uid,))
        c.execute('''INSERT INTO mf_staging_agents(agent_id,actor_user_id,environment,namespace,credential_digest,allowed_capabilities,expires_at,created_by)
            VALUES(%s,%s,'staging',%s,%s,%s,%s,%s)''',
            (aid,uid,settings.namespace,digest(token),Jsonb(allowed),datetime.now(timezone.utc)+timedelta(days=days),actor))
        record_event(c,settings,actor=actor,action='agent.credential.created',object_type='agent',object_id=aid,reason='Isolated staging service credential')
    return {'agent_id':str(aid),'credential':token,'environment':'staging','namespace':settings.namespace,'capabilities':allowed}


def revoke(settings,actor,agent_id):
    with transaction(settings) as c:
        from .rbac import allowed
        if not allowed(c,actor,'production.agents.manage'): error(403,'PERMISSION_DENIED')
        r=c.execute('UPDATE mf_staging_agents SET revoked_at=now() WHERE agent_id=%s AND namespace=%s RETURNING actor_user_id',(agent_id,settings.namespace)).fetchone()
        if not r: error(404,'AGENT_NOT_FOUND')
        c.execute("UPDATE mf_users SET account_status='disabled' WHERE user_id=%s",(r['actor_user_id'],))
        record_event(c,settings,actor=actor,action='agent.credential.revoked',object_type='agent',object_id=agent_id,reason='Explicit staging credential revocation')


def authenticate(settings,request):
    # Called before all Agent routes. A committed replay record survives domain rejection.
    if request.headers.get('cookie') or request.headers.get('origin'): error(403,'AGENT_BROWSER_AUTH_DENIED')
    auth=request.headers.get('authorization','')
    if not re.fullmatch(r'Bearer MF_STAGING_AGENT_[a-f0-9]{32}\.[A-Za-z0-9_-]{64}',auth): error(401,'AGENT_CREDENTIAL_REQUIRED')
    token=auth[7:];aid=UUID(token[len('MF_STAGING_AGENT_'):].split('.')[0])
    try:
        nonce=UUID(request.headers.get('x-mf-request-id',''))
        stamp=int(request.headers.get('x-mf-timestamp',''))
    except (ValueError,TypeError): error(401,'AGENT_REPLAY_HEADERS_REQUIRED')
    if abs(datetime.now(timezone.utc).timestamp()-stamp)>90: error(401,'AGENT_REQUEST_EXPIRED')
    with transaction(settings) as c:
        agent=c.execute('''SELECT a.* FROM mf_staging_agents a JOIN mf_users u ON u.user_id=a.actor_user_id
            WHERE agent_id=%s AND namespace=%s AND revoked_at IS NULL AND expires_at>now() AND u.account_status='active' FOR UPDATE OF a''',
            (aid,settings.namespace)).fetchone()
        if not agent or not hmac.compare_digest(agent['credential_digest'],digest(token)): error(401,'AGENT_CREDENTIAL_INVALID')
        n=c.execute("SELECT count(*) n FROM mf_agent_requests WHERE agent_id=%s AND received_at>now()-interval '1 minute'",(aid,)).fetchone()['n']
        if n>=120: error(429,'AGENT_RATE_LIMIT')
        inserted=c.execute('INSERT INTO mf_agent_requests(agent_id,request_id) VALUES(%s,%s) ON CONFLICT DO NOTHING RETURNING request_id',(aid,nonce)).fetchone()
        if not inserted: error(409,'AGENT_REQUEST_REPLAY')
    return agent


def current(c,settings,agent):
    a=c.execute('''SELECT a.* FROM mf_staging_agents a JOIN mf_users u ON u.user_id=a.actor_user_id
       WHERE agent_id=%s AND namespace=%s AND revoked_at IS NULL AND expires_at>now() AND u.account_status='active' FOR SHARE OF a''',
       (agent['agent_id'],settings.namespace)).fetchone()
    if not a: error(401,'AGENT_CREDENTIAL_REVOKED')
    return a
