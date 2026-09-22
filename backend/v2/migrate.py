"""Versioned SQL, checksum drift detection and a cross-process migration lock."""
import hashlib
from pathlib import Path
from .config import Settings
from .db import connect, BACKUP_LOCK, MIGRATION_LOCK, check_identity

MIGRATIONS = Path(__file__).with_name('migrations')


def migrate(settings, directory=MIGRATIONS):
    with connect(settings) as conn:
        conn.execute('SELECT pg_advisory_xact_lock(%s)', (BACKUP_LOCK,))
        conn.execute('SELECT pg_advisory_xact_lock(%s)', (MIGRATION_LOCK,))
        # This bootstrap journal is itself a versioned part of the migration runner.
        conn.execute('''CREATE TABLE IF NOT EXISTS mf_schema_migrations (
            version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())''')
        applied = {r['version']: r['sha256'] for r in conn.execute('SELECT * FROM mf_schema_migrations')}
        scripts = sorted(directory.glob('[0-9][0-9][0-9][0-9]_*.sql'))
        if set(applied) - {p.name for p in scripts}:
            raise ValueError('Database has migrations unknown to this build')
        if not applied:
            unexpected = conn.execute("""SELECT tablename FROM pg_tables
                WHERE schemaname='public' AND tablename <> 'mf_schema_migrations'""").fetchall()
            if unexpected:
                raise ValueError('Initial migration requires an empty dedicated staging database')
        for path in scripts:
            data = path.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            if path.name in applied:
                if applied[path.name] != digest:
                    raise ValueError(f'Migration checksum mismatch: {path.name}')
                continue
            conn.execute(data.decode('utf-8'), prepare=False)
            conn.execute('INSERT INTO mf_schema_migrations(version,sha256) VALUES (%s,%s)', (path.name,digest))
        conn.execute("INSERT INTO mf_environment(environment,namespace) VALUES ('staging',%s) ON CONFLICT DO NOTHING",
                     (settings.namespace,))
        check_identity(conn, settings)


if __name__ == '__main__':
    migrate(Settings.from_env())
    print('Staging migrations verified/applied')
