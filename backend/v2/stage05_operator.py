"""Explicit staging-only maintenance. No public endpoint, dispatch or production access."""
from dataclasses import replace
from pathlib import Path
from uuid import uuid4
import json,re
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from .db import connect,transaction
from .backup import backup,restore
from .stage04_operator import verify as verify_stage4
from .files import read_verified
from .storage import VolumeStore,sha256
from .calculation_math import hash_value
from .events import record_event

EXTRA=('mf_documents','mf_document_templates','mf_history_policy','mf_users','mf_sessions','mf_user_roles','mf_permission_grants','mf_manager_assignments')

def verify(settings):
    state=verify_stage4(settings)
    with connect(settings) as c:
        for table in EXTRA:
            rows=sorted(r['r'] for r in c.execute(sql.SQL('SELECT to_jsonb(t)::text r FROM {} t').format(sql.Identifier(table))))
            state['tables'][table]={'count':len(rows),'sha256':hash_value(rows)}
        for d in c.execute('SELECT d.*,f.kind,f.classification,f.order_id file_order,f.revision_id file_revision,c.order_id calculation_order,c.revision_id calculation_revision FROM mf_documents d JOIN mf_files f USING(file_id) JOIN mf_calculations c USING(calculation_id)'):
            if not (d['kind']=='preliminary_pdf' and d['classification']=='private' and d['order_id']==d['file_order']==d['calculation_order'] and d['revision_id']==d['file_revision']==d['calculation_revision'] and hash_value(d['presentation_snapshot'])==d['presentation_sha256']): raise ValueError('Document binding mismatch')
            if not read_verified(c,VolumeStore(settings.storage_root),d['file_id']).startswith(b'%PDF-'): raise ValueError('PDF bytes invalid')
    return state


def retire_restore(settings,email,checkpoint='stage05'):
    if checkpoint not in {'stage05','stage05-template-v2'}: raise ValueError('Invalid staging checkpoint')
    evidence_path=settings.storage_root.parent/(checkpoint+'-restore-evidence.json')
    if evidence_path.exists():
        print('MF_STAGE05_RESTORE='+evidence_path.read_text(),flush=True);return
    if not email.endswith('@example.invalid'): raise ValueError('Synthetic operator required')
    with transaction(settings) as c:
        users=c.execute("SELECT user_id FROM mf_users WHERE email=%s OR email LIKE 'stage05-%%@example.invalid' FOR UPDATE",(email,)).fetchall()
        for u in users:
            uid=u['user_id'];c.execute("UPDATE mf_users SET account_status='disabled',password_hash='disabled-stage05-operator' WHERE user_id=%s",(uid,))
            c.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
            c.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
            c.execute("DELETE FROM mf_user_roles WHERE user_id=%s AND role='admin'",(uid,))
            record_event(c,settings,actor=uid,action='stage05.operator.retired',object_type='user',object_id=uid,reason='Synthetic acceptance credentials retired')
    before=verify(settings)
    if before['tables']['mf_documents']['count']<2: raise ValueError('Document acceptance missing')
    run=uuid4().hex[:12];destination=settings.storage_root.parent/'backups'/(checkpoint+'-'+run)
    manifest=backup(settings,destination);name='mf_staging_restore_'+checkpoint.replace('-','_')+'_'+run
    with connect(settings,autocommit=True) as c: c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    info=conninfo_to_dict(settings.database_url)
    target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,storage_root=settings.storage_root.parent/('restore-'+checkpoint+'-'+run)/'storage')
    restored=restore(target,destination);after=verify(target)
    if before!=after: raise ValueError('Stage5 restore differs')
    evidence={'restore':restored,'dump_sha256':manifest['database_sha256'],'backup_path':str(destination),'storage_root':str(target.storage_root),
       'operator_retired':True,'tables_and_pdf_bindings_and_sha_verified':True,'authorization_metadata_verified':True,'state':after,'transport':'disabled','dispatch':'disabled'}
    evidence_path.write_text(json.dumps(evidence,indent=2));print('MF_STAGE05_RESTORE='+json.dumps(evidence,separators=(',',':')),flush=True)


def verify_persistence(settings,checkpoint='stage05'):
    if checkpoint not in {'stage05','stage05-template-v2'}: raise ValueError('Invalid staging checkpoint')
    recorded=json.loads((settings.storage_root.parent/(checkpoint+'-restore-evidence.json')).read_text());current=verify(settings)
    if current!=recorded['state']: raise ValueError('Stage5 persistence differs')
    evidence={'persistent_after_redeploy':True,'documents':current['tables']['mf_documents']['count'],'calculations':current['tables']['mf_calculations']['count'],
      'revisions':current['tables']['mf_order_revisions']['count'],'private_files':len(current['private_files']),'authorization_metadata_match':True,'production_jobs':current['production_jobs']}
    print('MF_STAGE05_PERSISTENCE='+json.dumps(evidence),flush=True)
