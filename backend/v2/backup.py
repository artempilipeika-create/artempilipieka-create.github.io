"""Consistent DB+bytes backup and restore ONLY into an empty, separate staging copy."""
import argparse
import json
import os
from pathlib import Path
import subprocess
from psycopg.conninfo import conninfo_to_dict
from .config import Settings
from .db import connect, BACKUP_LOCK, check_identity
from .storage import VolumeStore, sha256


def pg_env(settings):
    db = conninfo_to_dict(settings.database_url)
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    for key,var in {'host':'PGHOST','port':'PGPORT','dbname':'PGDATABASE','user':'PGUSER',
                    'password':'PGPASSWORD','sslmode':'PGSSLMODE','sslrootcert':'PGSSLROOTCERT'}.items():
        if key in db:
            env[var] = db[key]
    return env


def pg_command(settings, command):
    # Credentials only in child environment, never command line or logs.
    result = subprocess.run(command,env=pg_env(settings),capture_output=True)
    if result.returncode:
        raise RuntimeError(f'{command[0]} failed (exit {result.returncode}); inspect privately')


def backup(settings, destination):
    destination = Path(destination)
    if destination.resolve().is_relative_to(settings.storage_root):
        raise ValueError('Backup destination must be separate from private storage')
    destination.mkdir(parents=True,exist_ok=False,mode=0o700)
    store = VolumeStore(settings.storage_root)
    manifest = {'format_version':1,'database':settings.database_name,'namespace':settings.namespace,'files':[]}
    try:
        with connect(settings,autocommit=True) as conn:
            conn.execute('SELECT pg_advisory_lock(%s)', (BACKUP_LOCK,))
            try:
                check_identity(conn,settings)
                pg_command(settings,['pg_dump','--format=custom','--no-owner','--no-acl',
                                     '--file',str(destination/'database.dump')])
                for row in conn.execute('SELECT file_id,storage_key,sha256,size_bytes,status FROM mf_files ORDER BY file_id'):
                    path = store.path(row['storage_key'])
                    present = path.exists()
                    if row['status'] == 'ready' and not present:
                        raise ValueError('Ready manifest references missing bytes')
                    if present:
                        data = store.read(row['storage_key'])
                        if sha256(data) != row['sha256'] or len(data) != row['size_bytes']:
                            raise ValueError('Backup integrity mismatch')
                        target = destination/'blobs'/row['storage_key']
                        target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                        target.write_bytes(data)
                        target.chmod(0o600)
                    manifest['files'].append({**row,'file_id':str(row['file_id']),'present':present})
                manifest['database_sha256'] = sha256((destination/'database.dump').read_bytes())
                (destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
                (destination/'manifest.json').chmod(0o600)
                (destination/'database.dump').chmod(0o600)
            finally:
                conn.execute('SELECT pg_advisory_unlock(%s)', (BACKUP_LOCK,))
        return manifest
    except Exception:
        # Incomplete backup is never marked complete with a manifest.
        (destination/'manifest.json').unlink(missing_ok=True)
        raise


def restore(settings, source):
    source = Path(source)
    manifest = json.loads((source/'manifest.json').read_text())
    if manifest['format_version'] != 1 or settings.database_name == manifest['database']:
        raise ValueError('Restore requires a separate staging database name')
    if '_restore' not in settings.database_name:
        raise ValueError('Restore target name must contain _restore')
    if manifest['namespace'] != settings.namespace:
        raise ValueError('Restore namespace mismatch')
    if sha256((source/'database.dump').read_bytes()) != manifest['database_sha256']:
        raise ValueError('Database backup hash mismatch')
    with connect(settings,autocommit=True) as conn:
        tables = conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'").fetchall()
        if tables:
            raise ValueError('Restore refuses a nonempty database')
    if settings.storage_root.exists() and any(settings.storage_root.iterdir()):
        raise ValueError('Restore refuses nonempty storage')
    store = VolumeStore(settings.storage_root)
    # Verify all input bytes before restoring any database data.
    for row in manifest['files']:
        if row['present']:
            relative = store.path(row['storage_key']).relative_to(store.root)
            path = source/'blobs'/relative
            if path.is_symlink() or not path.resolve().is_relative_to((source/'blobs').resolve()):
                raise ValueError('Unsafe backup path')
            data = path.read_bytes()
            if sha256(data) != row['sha256'] or len(data) != row['size_bytes']:
                raise ValueError('Backup blob hash mismatch')
    pg_command(settings,['pg_restore','--exit-on-error','--single-transaction','--no-owner','--no-acl',
                         '--dbname',settings.database_name,str(source/'database.dump')])
    for row in manifest['files']:
        if row['present']:
            store.put(row['storage_key'],(source/'blobs'/row['storage_key']).read_bytes())
    with connect(settings) as conn:
        check_identity(conn,settings)
        actual = {str(r['file_id']):r for r in conn.execute('SELECT file_id,storage_key,sha256,size_bytes,status FROM mf_files')}
        if set(actual) != {r['file_id'] for r in manifest['files']}:
            raise ValueError('Restored manifest row count mismatch')
        for row in manifest['files']:
            if any(actual[row['file_id']][key] != row[key] for key in ('storage_key','sha256','size_bytes','status')):
                raise ValueError('Restored manifest differs')
    return {'restored':True,'file_count':len(manifest['files']),'database':settings.database_name}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action',choices=['backup','restore'])
    parser.add_argument('path')
    args = parser.parse_args()
    operation = backup if args.action == 'backup' else restore
    print(json.dumps(operation(Settings.from_env(),args.path),default=str))
