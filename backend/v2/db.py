from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row

BACKUP_LOCK = 76010201
MIGRATION_LOCK = 76010202


def connect(settings, *, autocommit=False):
    return psycopg.connect(settings.database_url, autocommit=autocommit, row_factory=dict_row,
                           connect_timeout=10, options='-c timezone=UTC -c statement_timeout=30000')


@contextmanager
def transaction(settings):
    with connect(settings) as conn:
        conn.execute('SELECT pg_advisory_xact_lock_shared(%s)', (BACKUP_LOCK,))
        check_identity(conn, settings)
        yield conn
        # psycopg connection context commits on success, rolls back on any exception.


def check_identity(conn, settings):
    row = conn.execute('SELECT environment, namespace FROM mf_environment WHERE singleton').fetchone()
    if not row or row['environment'] != 'staging' or row['namespace'] != settings.namespace:
        raise ValueError('Database staging identity mismatch')
