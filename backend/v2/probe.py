"""Operator CLI with synthetic data only; deliberately no public test endpoint."""
import argparse
import json
from uuid import uuid4
from .config import Settings
from .db import transaction, connect
from .events import record_event
from .files import save_private_file, read_verified
from .storage import VolumeStore, sha256

PROBE_BYTES = b'Martin Forest Stage 0-1 private persistence probe\n'


def create_probe(settings):
    actor, revision, job = uuid4(), uuid4(), uuid4()
    order = str(uuid4())
    content_hash = sha256(b'{}')
    with transaction(settings) as conn:
        conn.execute('INSERT INTO mf_users(user_id,email) VALUES (%s,%s)', (actor,f'{actor}@example.invalid'))
        conn.execute("INSERT INTO mf_user_roles VALUES (%s,'service_agent')", (actor,))
        conn.execute("""INSERT INTO mf_orders(order_id,business_name,owner_user_id,preparation_mode)
            VALUES (%s,'SYNTHETIC STAGING PROBE',%s,'manager_assisted')""", (order,actor))
        conn.execute('''INSERT INTO mf_order_revisions
            (revision_id,order_id,revision_number,created_by,reason,content_hash)
            VALUES (%s,%s,1,%s,'Stage 1 persistence probe',%s)''', (revision,order,actor,content_hash))
        conn.execute('UPDATE mf_orders SET active_revision_id=%s WHERE order_id=%s', (revision,order))
        conn.execute('''INSERT INTO mf_production_jobs
            (job_id,order_id,revision_id,purpose,namespace,created_by)
            VALUES (%s,%s,%s,'produce',%s,%s)''', (job,order,revision,settings.namespace,actor))
        conn.execute("INSERT INTO mf_job_events(event_id,job_id,event_type) VALUES (%s,%s,'staging.blocked')", (uuid4(),job))
        event = record_event(conn,settings,actor=actor,action='staging.probe.created',
                             object_type='order',object_id=order,version=1,reason='Synthetic persistence probe')
    file_id = save_private_file(settings,VolumeStore(settings.storage_root),actor=actor,data=PROBE_BYTES,
                               name='stage01-probe.txt',kind='test',mime='text/plain',
                               order_id=order,revision_id=revision,job_id=job)
    return {'order_id':order,'revision_id':str(revision),'job_id':str(job),'file_id':str(file_id),
            'audit_event_id':str(event),'sha256':sha256(PROBE_BYTES),'size_bytes':len(PROBE_BYTES)}


def verify_probe(settings, probe):
    with connect(settings) as conn:
        order = conn.execute('SELECT * FROM mf_orders WHERE order_id=%s', (probe['order_id'],)).fetchone()
        if not order or str(order['active_revision_id']) != probe['revision_id']:
            raise ValueError('Order/revision did not persist')
        data = read_verified(conn,VolumeStore(settings.storage_root),probe['file_id'])
        if data != PROBE_BYTES or sha256(data) != probe['sha256']:
            raise ValueError('Probe byte/hash mismatch')
        row = conn.execute('''SELECT a.event_id,o.status,o.namespace FROM mf_audit a
            JOIN mf_outbox o USING(event_id) WHERE a.event_id=%s''', (probe['audit_event_id'],)).fetchone()
        if not row or row['status'] != 'paused' or row['namespace'] != settings.namespace:
            raise ValueError('Audit/outbox not preserved or dispatch enabled')
        job = conn.execute('SELECT status FROM mf_production_jobs WHERE job_id=%s', (probe['job_id'],)).fetchone()
        if not job or job['status'] != 'blocked':
            raise ValueError('Probe job is not blocked')
    return {'verified':True, 'sha256':sha256(data), 'job_status':'blocked','outbox_status':'paused'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action',choices=['create','verify'])
    parser.add_argument('--manifest',required=True)
    args = parser.parse_args()
    settings = Settings.from_env()
    if args.action == 'create':
        result = create_probe(settings)
        with open(args.manifest,'x') as stream:
            json.dump(result,stream,indent=2)
        print(json.dumps(result))
    else:
        with open(args.manifest) as stream:
            print(json.dumps(verify_probe(settings,json.load(stream))))


if __name__ == '__main__':
    main()
