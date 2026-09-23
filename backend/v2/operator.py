"""Explicit staging operator commands; never served over HTTP, no default credentials."""
import argparse
import json
import sys
from uuid import uuid4
from .config import Settings
from .security import WebPolicy, password_hash, grant
from .auth_api import Credentials
from .db import transaction
from .events import record_event
from .mail import FakeCollector, queue_verification

ADMIN_PERMISSIONS = ('orders.read','orders.draft.write','orders.submit','orders.approve','orders.revision.create',
                     'orders.assign_manager','orders.oblx.read','files.source.read','files.preliminary_pdf.read',
                     'customers.pii.read','users.staff.create','users.roles.write','audit.read','orders.prices.read',
                     'catalogue.read','catalogue.import','catalogue.publish','catalogue.mapping.manage','templates.manage',
                     'calculations.create','documents.generate','calculations.read','calculations.fix','orders.review','financial.profiles.manage','discounts.override')


def bootstrap(settings,policy,email,password):
    body = Credentials(email=email,password=password)
    with transaction(settings) as conn:
        conn.execute('SELECT pg_advisory_xact_lock(76010203)')
        if conn.execute("SELECT 1 FROM mf_user_roles WHERE role='admin' LIMIT 1").fetchone():
            raise ValueError('An admin already exists; use audited admin API')
        uid=uuid4()
        user=conn.execute('INSERT INTO mf_users(user_id,email,password_hash) VALUES (%s,%s,%s) RETURNING *',
                          (uid,body.email,password_hash(body.password))).fetchone()
        conn.execute("INSERT INTO mf_user_roles VALUES (%s,'admin')",(uid,))
        for permission in ADMIN_PERMISSIONS:
            grant(conn,user_id=uid,permission=permission,scope='all',actor=uid)
        record_event(conn,settings,actor=uid,action='staff.bootstrap',object_type='user',object_id=uid,
                     reason='One-time operator bootstrap with explicit Stage 2 permissions')
        delivery=queue_verification(conn,settings,policy,user,'operator-bootstrap')
        return {'user_id':str(uid),'verification_delivery_id':str(delivery),'email_verified':False}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    sub=parser.add_subparsers(dest='command',required=True)
    b=sub.add_parser('bootstrap-admin');b.add_argument('--email',required=True)
    c=sub.add_parser('collect-fake-email');c.add_argument('--delivery-id',required=True)
    args=parser.parse_args()
    settings,policy=Settings.from_env(),WebPolicy.from_env()
    if args.command=='bootstrap-admin':
        result=bootstrap(settings,policy,args.email,sys.stdin.readline().rstrip('\n'))
    else:
        result={'sink_file_id':str(FakeCollector().collect(settings,policy,args.delivery_id))}
    print(json.dumps(result))
