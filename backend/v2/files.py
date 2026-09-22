"""Two-phase private storage. Failed writes retain a manifest for reconciliation."""
from uuid import uuid4
from .db import connect, check_identity, BACKUP_LOCK
from .events import record_event
from .storage import new_key, sha256


def save_private_file(settings, store, *, actor, data, name, kind, mime,
                      order_id=None, revision_id=None, job_id=None):
    if len(data) > 50 * 1024 * 1024:
        raise ValueError('File exceeds 50 MiB')
    if kind not in {'source', 'preliminary_pdf', 'oblx', 'internal', 'test'}:
        raise ValueError('Unknown file kind')
    if not name or len(name) > 255 or not mime or len(mime) > 255:
        raise ValueError('Invalid file metadata')
    # Only trusted internal code calls this in Stage 1. No public upload accepts a client kind.
    classification = 'internal' if kind in {'oblx', 'internal', 'test'} else 'private'
    file_id, key = uuid4(), new_key()
    with connect(settings, autocommit=True) as conn:
        conn.execute('SELECT pg_advisory_lock_shared(%s)', (BACKUP_LOCK,))
        try:
            check_identity(conn, settings)
            with conn.transaction():
                conn.execute('''INSERT INTO mf_files
                    (file_id,order_id,revision_id,job_id,kind,classification,original_name,
                     storage_key,sha256,size_bytes,mime_type,created_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                    (file_id,order_id,revision_id,job_id,kind,classification,name,key,
                     sha256(data),len(data),mime,actor))
            try:
                store.put(key, data)
                if sha256(store.read(key)) != sha256(data):
                    raise ValueError('Storage integrity verification failed')
                with conn.transaction():
                    conn.execute("UPDATE mf_files SET status='ready' WHERE file_id=%s", (file_id,))
                    record_event(conn,settings,actor=actor,action='file.ready',object_type='file',
                                 object_id=file_id,reason='Private bytes verified')
            except Exception:
                # Bytes may exist. Preserve their registered key; never expose as ready.
                with conn.transaction():
                    conn.execute("UPDATE mf_files SET status='failed' WHERE file_id=%s AND status='staging'", (file_id,))
                raise
            return file_id
        finally:
            conn.execute('SELECT pg_advisory_unlock_shared(%s)', (BACKUP_LOCK,))


def read_verified(conn, store, file_id):
    """Internal helper only. A future download gateway must authorize before calling this."""
    row = conn.execute('SELECT * FROM mf_files WHERE file_id=%s', (file_id,)).fetchone()
    if not row or row['status'] != 'ready':
        raise ValueError('File not ready')
    data = store.read(row['storage_key'])
    if len(data) != row['size_bytes'] or sha256(data) != row['sha256']:
        raise ValueError('File integrity mismatch')
    return data
