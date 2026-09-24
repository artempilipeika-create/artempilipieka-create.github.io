"""Explicit isolated staging operations. Disabled by default; no HTTP maintenance bypass."""
from dataclasses import replace
import json
import os
import re
from uuid import UUID,uuid4
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from .db import connect,transaction
from .security import WebPolicy,password_hash
from .config import Settings
from .operator import bootstrap
from .mail import FakeCollector,confirm
from .storage import VolumeStore
from .files import read_verified
from .backup import backup,restore
from .events import record_event


class _RecoveryRefused(ValueError):
    """Only fixed, non-secret diagnostic messages may cross the startup boundary."""


def _recover_existing_admin(settings):
    # Revalidate even for direct callers; production and mismatched DB identity fail closed.
    try:
        if Settings.from_env() != settings:
            raise ValueError()
        railway_identity=(
            os.environ.get('RAILWAY_PROJECT_ID'),
            os.environ.get('RAILWAY_SERVICE_ID'),
            os.environ.get('RAILWAY_ENVIRONMENT_ID'),
        )
        if any(railway_identity) and railway_identity != (
            '6d754ad4-ba7b-45f8-8c5e-356387e7de06',
            '9aacf7bf-edd5-4f08-9423-3fbabea59268',
            'ee625678-c15e-452d-9761-cda99274839f',
        ):
            raise ValueError()
    except Exception:
        raise _RecoveryRefused('Isolated staging recovery configuration required') from None
    email=os.environ.get('MF_STAGE03_OPERATOR_EMAIL','').strip()
    password=os.environ.get('MF_STAGE03_OPERATOR_PASSWORD','')
    if (not re.fullmatch(r'[^\s@<>]+@example\.invalid',email,re.IGNORECASE)
        or not 32 <= len(password) <= 128):
        raise _RecoveryRefused('Explicit synthetic recovery credentials required')
    try:
        uid=UUID(os.environ.get('MF_STAGE03_OPERATOR_USER_ID',''))
    except (ValueError,TypeError,AttributeError):
        raise _RecoveryRefused('Explicit recovery user ID required') from None
    try:
        with transaction(settings) as conn:
            conn.execute('SELECT pg_advisory_xact_lock(76010203)')
            users=conn.execute('''SELECT user_id FROM mf_users
                WHERE user_id=%s AND lower(email)=lower(%s) FOR UPDATE''',(uid,email)).fetchall()
            if len(users) != 1:
                raise _RecoveryRefused('Recovery identity missing or ambiguous; no changes made')
            roles=conn.execute('SELECT role FROM mf_user_roles WHERE user_id=%s FOR UPDATE',(uid,)).fetchall()
            if [r['role'] for r in roles] != ['admin']:
                raise _RecoveryRefused('Recovery requires exactly the admin role; no changes made')
            conn.execute('''UPDATE mf_users SET password_hash=%s,account_status='active',
                email_verified_at=COALESCE(email_verified_at,now()),updated_at=now()
                WHERE user_id=%s''',(password_hash(password),uid))
            conn.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
            record_event(conn,settings,actor=uid,action='staff.admin.recovered',object_type='user',object_id=uid,
                         reason='Explicit isolated staging administrator credential recovery')
    except _RecoveryRefused:
        raise
    except Exception:
        # Driver/trigger/hash errors must not print input credentials or SQL parameters.
        raise _RecoveryRefused('Staging administrator recovery failed; transaction rolled back') from None
    # Only announce success after the transaction has committed.
    print('MF_STAGE03_ADMIN_RECOVERED',flush=True)


def run_if_requested(settings):
    mode=os.environ.get('MF_STAGE03_OPERATOR_MODE','off')
    if mode=='off': return
    if mode=='recover_existing_admin':
        _recover_existing_admin(settings)
    elif mode=='bootstrap':
        email=os.environ.get('MF_STAGE03_OPERATOR_EMAIL','')
        password=os.environ.get('MF_STAGE03_OPERATOR_PASSWORD','')
        if not email.endswith('@example.invalid') or len(password)<32: raise ValueError('Explicit synthetic operator credentials required')
        policy=WebPolicy.from_env()
        with connect(settings) as conn:
            exists=conn.execute('SELECT user_id,account_status,email_verified_at FROM mf_users WHERE email=%s',(email,)).fetchone()
        if exists:
            if exists['account_status']!='active' or not exists['email_verified_at']: raise ValueError('Operator not reusable')
            print('MF_STAGE03_OPERATOR_READY',flush=True);return
        result=bootstrap(settings,policy,email,password)
        fid=FakeCollector().collect(settings,policy,result['verification_delivery_id'])
        with transaction(settings) as conn:
            payload=json.loads(read_verified(conn,VolumeStore(settings.storage_root),fid))
            confirm(conn,settings,payload['url'].split('#token=')[1])
        print('MF_STAGE03_OPERATOR_READY',flush=True)
    elif mode=='retire_restore':
        evidence_path=settings.storage_root.parent/'stage03-restore-evidence.json'
        if evidence_path.exists():
            print('MF_STAGE03_RESTORE='+evidence_path.read_text(),flush=True);return
        email=os.environ.get('MF_STAGE03_OPERATOR_EMAIL','')
        if not email.endswith('@example.invalid'): raise ValueError('Explicit synthetic operator identity required')
        with transaction(settings) as conn:
            u=conn.execute('SELECT user_id FROM mf_users WHERE email=%s FOR UPDATE',(email,)).fetchone()
            if not u: raise ValueError('Operator not found')
            uid=u['user_id']
            conn.execute("UPDATE mf_users SET account_status='disabled',password_hash='disabled-stage03-operator' WHERE user_id=%s",(uid,))
            conn.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
            conn.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
            conn.execute("DELETE FROM mf_user_roles WHERE user_id=%s AND role='admin'",(uid,))
            record_event(conn,settings,actor=uid,action='stage03.operator.retired',object_type='user',object_id=uid,reason='Temporary staging catalogue operator retired')
        run_id=uuid4().hex[:12];destination=settings.storage_root.parent/'backups'/('stage03-'+run_id)
        manifest=backup(settings,destination);name='mf_staging_restore_stage03_'+run_id
        with connect(settings,autocommit=True) as conn: conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        info=conninfo_to_dict(settings.database_url)
        target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,
                       storage_root=settings.storage_root.parent/('restore-stage03-'+run_id)/'storage')
        result=restore(target,destination)
        with connect(target) as conn:
            active=conn.execute('SELECT release_id FROM mf_catalogue_active').fetchone()
            source=conn.execute('SELECT file_id,sha256 FROM mf_catalogue_imports ORDER BY created_at LIMIT 1').fetchone()
            import hashlib
            assert hashlib.sha256(read_verified(conn,VolumeStore(target.storage_root),source['file_id'])).hexdigest()==source['sha256']
            rows=conn.execute('SELECT count(*) AS n FROM mf_catalogue_raw_rows').fetchone()['n']
        evidence={**result,'source_dump_sha256':manifest['database_sha256'],'backup_path':str(destination),
                  'master_sha256':source['sha256'],'master_bytes_verified':True,'catalogue_raw_rows':rows,
                  'active_release':str(active['release_id']),'operator_retired':True,'transport':'disabled','dispatch':'disabled'}
        evidence_path.write_text(json.dumps(evidence,indent=2))
        print('MF_STAGE03_RESTORE='+json.dumps(evidence),flush=True)
    else: raise ValueError('Unknown Stage 3 operator mode')
