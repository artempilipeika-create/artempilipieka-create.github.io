"""Caller owns transaction. No commit, no network, no production publisher."""
from uuid import uuid4
from psycopg.types.json import Jsonb


def record_event(conn, settings, *, actor, action, object_type, object_id, reason,
                 correlation_id=None, version=None):
    # Accept references only; avoid an arbitrary details/body argument that could leak secrets.
    event_id = uuid4()
    correlation_id = correlation_id or uuid4()
    conn.execute('''INSERT INTO mf_audit
        (event_id,actor_user_id,action,object_type,object_id,object_version,reason,correlation_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)''',
        (event_id,actor,action,object_type,str(object_id),version,reason,correlation_id))
    conn.execute('''INSERT INTO mf_outbox
        (event_id,namespace,aggregate_type,aggregate_id,event_type,payload)
        VALUES (%s,%s,%s,%s,%s,%s)''',
        (event_id,settings.namespace,object_type,str(object_id),action,
         Jsonb({'object_id': str(object_id), 'version': version})))
    return event_id
