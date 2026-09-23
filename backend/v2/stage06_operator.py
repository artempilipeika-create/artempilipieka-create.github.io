"""Private staging-only snapshots and real restore. No HTTP maintenance endpoints."""
from dataclasses import replace
from uuid import uuid4
import json
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from .db import connect
from .backup import backup,restore
from .calculation_math import hash_value
from .files import read_verified
from .storage import VolumeStore,sha256


def verify(settings):
    with connect(settings) as c:
        tables={}
        for t in c.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'mf_%' ORDER BY tablename").fetchall():
            name=t['tablename']
            rows=sorted(r['row'] for r in c.execute(sql.SQL('SELECT to_jsonb(t)::text row FROM {} t').format(sql.Identifier(name))))
            tables[name]={'count':len(rows),'sha256':hash_value(rows)}
        for r in c.execute('SELECT content,content_hash FROM mf_order_revisions WHERE schema_version=4'):
            if hash_value(r['content'])!=r['content_hash']: raise ValueError('Revision seal mismatch')
        for r in c.execute('SELECT c.*,s.result_hash FROM mf_calculations c JOIN mf_calculation_seals s USING(calculation_id)'):
            if hash_value(r['input_snapshot'])!=r['input_hash'] or hash_value(r['result'])!=r['result_hash']: raise ValueError('Calculation seal mismatch')
        files=[];store=VolumeStore(settings.storage_root)
        for f in c.execute("SELECT file_id,sha256 FROM mf_files WHERE status='ready' ORDER BY file_id"):
            if sha256(read_verified(c,store,f['file_id']))!=f['sha256']: raise ValueError('Private bytes mismatch')
            files.append({'file_id':str(f['file_id']),'sha256':f['sha256']})
        for d in c.execute('SELECT d.*,f.order_id file_order,f.revision_id file_revision FROM mf_documents d JOIN mf_files f USING(file_id)'):
            if d['order_id']!=d['file_order'] or d['revision_id']!=d['file_revision'] or hash_value(d['presentation_snapshot'])!=d['presentation_sha256']: raise ValueError('Document binding mismatch')
            if not read_verified(c,store,d['file_id']).startswith(b'%PDF-'): raise ValueError('PDF mismatch')
        for p in c.execute('SELECT * FROM mf_job_packages'):
            m=p['manifest']
            if hash_value(m)!=p['manifest_sha256'] or sha256(read_verified(c,store,p['manifest_file_id']))!=p['manifest_sha256']: raise ValueError('Package manifest mismatch')
            for f in m['files']:
                db=c.execute('SELECT * FROM mf_files WHERE file_id=%s',(f['file_id'],)).fetchone()
                if any(str(db[k])!=str(m[k]) for k in ('job_id','order_id','revision_id')) or db['sha256']!=f['sha256']: raise ValueError('Package file binding mismatch')
        for r in c.execute('SELECT * FROM mf_job_results'):
            if sha256(read_verified(c,store,r['manifest_file_id']))!=hash_value(r['manifest']): raise ValueError('Result manifest mismatch')
            for f in r['manifest']['artifacts']:
                if sha256(read_verified(c,store,f['file_id']))!=f['sha256']: raise ValueError('Result output mismatch')
        for f in c.execute('SELECT * FROM mf_final_calculation_candidates'):
            if hash_value(f['financial_snapshot'])!=f['financial_sha256']: raise ValueError('Final candidate mismatch')
        if c.execute('''SELECT 1 FROM mf_production_jobs j JOIN mf_job_runs r ON r.run_id=j.current_run_id
          WHERE j.fencing<>r.fencing OR j.lease_digest<>r.lease_digest OR j.lease_agent_id<>r.agent_id LIMIT 1''').fetchone(): raise ValueError('Lease/fencing mismatch')
        if c.execute("SELECT 1 FROM mf_production_jobs WHERE namespace<>%s LIMIT 1",(settings.namespace,)).fetchone(): raise ValueError('Foreign namespace')
    return {'tables':tables,'private_files':files,'namespace':settings.namespace}


def restore_checkpoint(settings,checkpoint='stage06'):
    if checkpoint!='stage06': raise ValueError('Invalid checkpoint')
    evidence_path=settings.storage_root.parent/'stage06-restore-evidence.json'
    if evidence_path.exists(): raise ValueError('Checkpoint already exists; use verified evidence, never overwrite')
    before=verify(settings);suffix=uuid4().hex[:12]
    destination=settings.storage_root.parent/'backups'/('stage06-'+suffix)
    manifest=backup(settings,destination);name='mf_staging_restore_stage06_'+suffix
    with connect(settings,autocommit=True) as c: c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    db=conninfo_to_dict(settings.database_url)
    target=replace(settings,database_url=make_conninfo(**{**db,'dbname':name}),database_name=name,storage_root=settings.storage_root.parent/('restore-stage06-'+suffix)/'storage')
    outcome=restore(target,destination);after=verify(target)
    if before!=after: raise ValueError('Restored Stage 6 state differs')
    evidence={'restore':outcome,'dump_sha256':manifest['database_sha256'],'backup_path':str(destination),'storage_root':str(target.storage_root),
        'state':after,'all_tables_hashes_match':True,'private_bytes_verified':True,'native_execution':'NOT VERIFIED'}
    evidence_path.write_text(json.dumps(evidence,indent=2))
    print('MF_STAGE06_RESTORE='+json.dumps(evidence,separators=(',',':')),flush=True)
    return evidence


def verify_persistence(settings):
    recorded=json.loads((settings.storage_root.parent/'stage06-restore-evidence.json').read_text())
    if verify(settings)!=recorded['state']: raise ValueError('Stage 6 persistence differs')
    result={'persistent_after_redeploy':True,'counts':{k:v['count'] for k,v in recorded['state']['tables'].items()},'private_files_verified':len(recorded['state']['private_files'])}
    print('MF_STAGE06_PERSISTENCE='+json.dumps(result,separators=(',',':')),flush=True)
    return result
