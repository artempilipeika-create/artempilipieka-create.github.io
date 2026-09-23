"""Explicit staging checkpoint. Never imported by normal serve or HTTP routes.

No migrations, native enrollment, production jobs, or source data writes.
Existing complete checkpoints are verified, never replaced.
"""
from dataclasses import replace
from pathlib import Path
from uuid import uuid4
import argparse
import json
import os

from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from .backup import backup, restore
from .config import Settings
from .db import check_identity, connect
from .stage06_operator import verify
from .storage import sha256


def gates(settings):
    with connect(settings) as db:
        check_identity(db, settings)
        result = {
            'calibrations': db.execute('SELECT count(*) n FROM mf_bazis_calibrations').fetchone()['n'],
            'final_candidates': db.execute('SELECT count(*) n FROM mf_final_calculation_candidates').fetchone()['n'],
            'produce_jobs': db.execute("SELECT count(*) n FROM mf_production_jobs WHERE schema_version=6 AND purpose='produce'").fetchone()['n'],
            'verified_results': db.execute('SELECT count(*) n FROM mf_job_results WHERE verified').fetchone()['n'],
        }
        if any(result.values()):
            raise ValueError('Unexpected native/final/produce state; inspect before acceptance')
        result['native'] = 'NOT VERIFIED / CLOSED'
        result['catalogue_active'] = [str(r['release_id']) for r in db.execute('SELECT release_id FROM mf_catalogue_active')]
        result['schema_versions'] = [r['version'] for r in db.execute('SELECT version FROM mf_schema_migrations ORDER BY version')]
        result['financial_defaults'] = [dict(r) for r in db.execute('SELECT * FROM mf_calculation_defaults')]
    return result


def checkpoint(settings, label):
    if label not in ('pre-stage08', 'post-stage08'):
        raise ValueError('Unknown checkpoint')
    root = settings.storage_root.parent
    evidence_path = root / (label + '-evidence.json')
    if evidence_path.exists():
        recorded = json.loads(evidence_path.read_text())
        manifest = json.loads((Path(recorded['backup_path']) / 'manifest.json').read_text())
        if sha256((Path(recorded['backup_path']) / 'database.dump').read_bytes()) != recorded['dump_sha256']:
            raise ValueError('Checkpoint dump changed')
        if manifest['namespace'] != settings.namespace:
            raise ValueError('Checkpoint namespace mismatch')
        return recorded
    state = verify(settings)
    gate_state = gates(settings)
    suffix = uuid4().hex[:12]
    destination = root / 'backups' / (label + '-' + suffix)
    manifest = backup(settings, destination)
    name = 'mf_staging_restore_stage08_' + suffix
    with connect(settings, autocommit=True) as db:
        db.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    info = conninfo_to_dict(settings.database_url)
    target = replace(settings, database_url=make_conninfo(**{**info, 'dbname': name}),
                     database_name=name, storage_root=root / ('restore-stage08-' + suffix) / 'storage')
    restored = restore(target, destination)
    after = verify(target)
    # A writer between the first snapshot and backup invalidates comparison; do not claim PASS.
    if state != after or verify(settings) != after:
        raise ValueError('Concurrent state change: backup remains valid but comparison requires review')
    evidence = {'checkpoint': label, 'deployment': settings.instance_id,
                'dump_sha256': manifest['database_sha256'], 'backup_path': str(destination),
                'restored_database': name, 'restored_storage': str(target.storage_root),
                'restore': restored, 'state': after, 'gates': gate_state,
                'file_manifest': manifest['files'], 'all_tables_and_private_bytes_equal': True}
    evidence_path.write_text(json.dumps(evidence, indent=2, default=str) + '\n')
    evidence_path.chmod(0o600)
    return evidence


def persistence(settings, label):
    evidence = json.loads((settings.storage_root.parent / (label + '-evidence.json')).read_text())
    if verify(settings) != evidence['state']:
        raise ValueError('State differs from checkpoint')
    return {'checkpoint': label, 'deployment': settings.instance_id, 'persistent': True,
            'private_files': len(evidence['state']['private_files']), 'gates': gates(settings)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['pre-stage08', 'post-stage08', 'persistence'])
    args = parser.parse_args()
    settings = Settings.from_env()
    if os.environ.get('RAILWAY_PROJECT_ID') != '6d754ad4-ba7b-45f8-8c5e-356387e7de06':
        raise ValueError('Explicit staging project required')
    result = persistence(settings, 'post-stage08') if args.action == 'persistence' else checkpoint(settings, args.action)
    print('MF_STAGE08_CHECKPOINT=' + json.dumps(result, separators=(',', ':'), default=str), flush=True)


if __name__ == '__main__':
    main()
