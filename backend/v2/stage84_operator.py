"""Explicit staging checkpoint utilities. No native/Agent/job mutations."""
import json,os
from dataclasses import replace
from pathlib import Path
from uuid import uuid4
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from .db import connect
from .backup import backup,restore
from .stage06_operator import verify
from .stage08_operator import gates
from .storage import sha256


def pre_backup(settings):
    root=settings.storage_root.parent; dest=root/'backups'/'pre-stage84'; path=dest/'stage84-before.json'
    if dest.exists():
        before=json.loads(path.read_text()); manifest=json.loads((dest/'manifest.json').read_text())
        if before['state']!=verify(settings) or sha256((dest/'database.dump').read_bytes())!=manifest['database_sha256']: raise ValueError('Pre-stage84 snapshot mismatch')
        for f in manifest['files']:
            if f['present'] and sha256((dest/'blobs'/f['storage_key']).read_bytes())!=f['sha256']: raise ValueError('Pre-stage84 bytes changed')
    else:
        before={'state':verify(settings),'gates':gates(settings)}; manifest=backup(settings,dest)
        before.update(database_sha256=manifest['database_sha256'],backup_path=str(dest),file_count=len(manifest['files']))
        path.write_text(json.dumps(before,indent=2,default=str));path.chmod(0o600)
    print('MF_STAGE84_PRE='+json.dumps(before,default=str),flush=True)
    return before


def checkpoint(settings):
    root=settings.storage_root.parent; path=root/'stage84-post-evidence.json'
    if path.exists():
        evidence=json.loads(path.read_text())
        if verify(settings)!=evidence['state']: raise ValueError('Stage84 state changed after checkpoint')
        return evidence
    state=verify(settings); suffix=uuid4().hex[:12]; dest=root/'backups'/('post-stage84-'+suffix)
    manifest=backup(settings,dest); name='mf_staging_restore_stage84_'+suffix
    with connect(settings,autocommit=True) as c: c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    info=conninfo_to_dict(settings.database_url)
    target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,storage_root=root/('restore-stage84-'+suffix)/'storage')
    restored=restore(target,dest)
    if state!=verify(target) or state!=verify(settings): raise ValueError('Backup restore mismatch/concurrent write')
    result={'database_sha256':manifest['database_sha256'],'backup_path':str(dest),'restore_database':name,'restore_storage':str(target.storage_root),
            'restore':restored,'state':state,'gates':gates(settings),'all_tables_and_bytes_equal':True}
    path.write_text(json.dumps(result,indent=2,default=str));path.chmod(0o600)
    return result
