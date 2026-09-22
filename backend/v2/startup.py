"""Staging-only startup: preserve a native pre-Stage-2 backup before expanding the schema."""
import json
import os
from pathlib import Path
from .config import Settings
from .db import connect, check_identity
from .backup import backup
from .migrate import migrate
from .probe import create_probe, verify_probe


def prepare(settings):
    with connect(settings) as conn:
        exists=conn.execute("SELECT to_regclass('public.mf_schema_migrations') AS name").fetchone()['name']
        versions={r['version'] for r in conn.execute('SELECT version FROM mf_schema_migrations')} if exists else set()
        if versions:
            check_identity(conn,settings)
    if versions=={'0001_foundation.sql'}:
        # Production is rejected by Settings before connecting. Dedicated staging persistent volume only.
        destination=Path(os.environ.get('RAILWAY_VOLUME_MOUNT_PATH',str(settings.storage_root.parent)))/'backups'/'pre-stage02'
        if destination.exists():
            # A failed/incomplete backup must never authorize migration.
            raise RuntimeError('Pre-Stage-2 backup destination exists: inspect privately before retry')
        manifest=backup(settings,destination)
        print(json.dumps({'stage02_pre_migration_backup':True,'database_sha256':manifest['database_sha256'],
                          'file_count':len(manifest['files']),'destination':str(destination)}),flush=True)
    migrate(settings)
    mode=os.environ.get('MF_STAGE01_PROBE_MODE','off')
    manifest_path=Path(os.environ.get('RAILWAY_VOLUME_MOUNT_PATH','/mf-private'))/'stage01-probe.json'
    if mode=='verify':
        print(json.dumps(verify_probe(settings,json.loads(manifest_path.read_text()))),flush=True)
    elif mode=='create':
        if manifest_path.exists():
            raise ValueError('Probe manifest exists')
        manifest_path.write_text(json.dumps(create_probe(settings)))
    elif mode!='off':
        raise ValueError('Invalid probe mode')
    if os.environ.get('MF_STAGE02_PROBE_MODE','off')=='run':
        from .smoke import run
        evidence=run(settings)
        out=Path(os.environ.get('RAILWAY_VOLUME_MOUNT_PATH',str(settings.storage_root.parent)))/'stage02-evidence.json'
        out.write_text(json.dumps(evidence,indent=2))
        print('MF_STAGE02_EVIDENCE='+json.dumps(evidence),flush=True)
    elif os.environ.get('MF_STAGE02_PROBE_MODE','off')!='off':
        raise ValueError('Invalid Stage 2 probe mode')


if __name__=='__main__':
    prepare(Settings.from_env())
