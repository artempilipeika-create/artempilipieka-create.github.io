"""Explicit staging maintenance only, no HTTP route. Real restore into a new DB/root."""
from dataclasses import replace
from pathlib import Path
from uuid import uuid4
import json
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from .db import connect,transaction
from .backup import backup,restore
from .files import read_verified
from .storage import VolumeStore,sha256
from .calculation_math import canonical,hash_value
from .events import record_event

TABLES=('mf_order_revisions','mf_calculations','mf_calculation_lines','mf_discount_snapshots','mf_calculation_price_snapshots',
 'mf_sheet_estimates','mf_manufacturing_recipes','mf_tariff_books','mf_tariff_entries','mf_price_books','mf_sale_price_entries',
 'mf_discount_profiles','mf_production_profiles','mf_order_financial_contexts','mf_order_discount_overrides',
 'mf_customer_discount_assignments','mf_submission_receipts','mf_calculation_seals','mf_catalogue_releases','mf_catalogue_items','mf_files')

def snapshot(conn):
    result={}
    for table in TABLES:
        rows=sorted(r['r'] for r in conn.execute(sql.SQL('SELECT to_jsonb(t)::text r FROM {} t').format(sql.Identifier(table))))
        result[table]={'count':len(rows),'sha256':hash_value(rows)}
    return result

def verify(settings):
    with connect(settings) as conn:
        tables=snapshot(conn)
        for revision in conn.execute('SELECT content,content_hash FROM mf_order_revisions WHERE schema_version=4'):
            if hash_value(revision['content'])!=revision['content_hash']: raise ValueError('Revision hash mismatch')
        for c in conn.execute('SELECT c.*,s.result_hash FROM mf_calculations c JOIN mf_calculation_seals s USING(calculation_id)'):
            if hash_value(c['input_snapshot'])!=c['input_hash'] or hash_value(c['result'])!=c['result_hash']: raise ValueError('Calculation hash mismatch')
        verified_files=[]
        for f in conn.execute("SELECT file_id,sha256 FROM mf_files WHERE status='ready' ORDER BY file_id"):
            if sha256(read_verified(conn,VolumeStore(settings.storage_root),f['file_id']))!=f['sha256']: raise ValueError('Private bytes mismatch')
            verified_files.append({'file_id':str(f['file_id']),'sha256':f['sha256']})
        active=str(conn.execute('SELECT release_id FROM mf_catalogue_active').fetchone()['release_id'])
        jobs=conn.execute("SELECT count(*) n FROM mf_production_jobs").fetchone()['n']
        if conn.execute("SELECT 1 FROM mf_production_jobs WHERE status NOT IN ('blocked','cancelled') LIMIT 1").fetchone(): raise ValueError('Unexpected job state')
    return {'tables':tables,'private_files':verified_files,'active_catalogue_release':active,'production_jobs':jobs}

def retire_restore(settings,email):
    evidence_path=settings.storage_root.parent/'stage04-restore-evidence.json'
    if evidence_path.exists():
        print('MF_STAGE04_RESTORE='+evidence_path.read_text(),flush=True);return
    if not email.endswith('@example.invalid'): raise ValueError('Explicit synthetic operator required')
    with transaction(settings) as conn:
        user=conn.execute('SELECT user_id FROM mf_users WHERE email=%s FOR UPDATE',(email,)).fetchone()
        if not user: raise ValueError('Synthetic operator missing')
        uid=user['user_id']
        conn.execute("UPDATE mf_users SET account_status='disabled',password_hash='disabled-stage04-operator' WHERE user_id=%s",(uid,))
        conn.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
        conn.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
        conn.execute("DELETE FROM mf_user_roles WHERE user_id=%s AND role='admin'",(uid,))
        record_event(conn,settings,actor=uid,action='stage04.operator.retired',object_type='user',object_id=uid,reason='Temporary synthetic acceptance operator retired')
    before=verify(settings)
    if not before['tables']['mf_calculations']['count']: raise ValueError('Calculation evidence missing')
    run=uuid4().hex[:12];destination=settings.storage_root.parent/'backups'/('stage04-'+run)
    manifest=backup(settings,destination);name='mf_staging_restore_stage04_'+run
    with connect(settings,autocommit=True) as conn: conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    info=conninfo_to_dict(settings.database_url)
    target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,
      storage_root=settings.storage_root.parent/('restore-stage04-'+run)/'storage')
    restored=restore(target,destination);after=verify(target)
    if before!=after: raise ValueError('Restored tables/bytes differ from isolated source snapshot')
    evidence={'restore':restored,'dump_sha256':manifest['database_sha256'],'backup_path':str(destination),'storage_root':str(target.storage_root),
       'operator_retired':True,'table_snapshots_match':True,'revision_input_result_hashes_verified':True,'state':after,
       'transport':'disabled','dispatch':'disabled'}
    evidence_path.write_text(json.dumps(evidence,indent=2))
    print('MF_STAGE04_RESTORE='+json.dumps(evidence,separators=(',',':')),flush=True)

def verify_persistence(settings):
    recorded=json.loads((settings.storage_root.parent/'stage04-restore-evidence.json').read_text())
    current=verify(settings)
    if current!=recorded['state']: raise ValueError('Persistence verification differs')
    result={'persistent_after_redeploy':True,'calculation_count':current['tables']['mf_calculations']['count'],
        'revision_count':current['tables']['mf_order_revisions']['count'],'private_files_verified':len(current['private_files']),
        'active_catalogue_release':current['active_catalogue_release'],'production_jobs':current['production_jobs']}
    (settings.storage_root.parent/'stage04-persistence-evidence.json').write_text(json.dumps(result,indent=2))
    print('MF_STAGE04_PERSISTENCE='+json.dumps(result),flush=True)
