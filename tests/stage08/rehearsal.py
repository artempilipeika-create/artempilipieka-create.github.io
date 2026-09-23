"""Fixture-only migration rehearsal, not a production migration utility.

Historical money/payment/comments remain sealed legacy_snapshot data.
No authorization, production approval, or new calculation is inferred.
"""
import base64
from collections import Counter
from pathlib import Path
from uuid import UUID, uuid5
from psycopg.types.json import Jsonb
from backend.v2.db import connect, transaction
from backend.v2.files import save_private_file
from backend.v2.storage import VolumeStore,sha256
from backend.v2.calculation_math import hash_value

NAMESPACE=UUID('18080808-0000-4000-8000-000000000008')

def key(row): return row['source'],str(row['id'])
def stable(entity,row): return uuid5(NAMESPACE,entity+':'+row['source']+':'+str(row['id']))

def fixture():
    return {'synthetic':True,'users':[
        {'source':'v9','id':1,'email':'duplicate@example.invalid','name':'Same name','phone':'same','role':'client','verified':True},
        {'source':'bridge','id':'other','email':'DUPLICATE@example.invalid','name':'Same name','phone':'same','role':'client'},
        {'source':'v9','id':2,'email':'staff@example.invalid','role':'admin','permissions':['*'],'verified':True,
         'verification_evidence':{'source':'SYNTHETIC historical confirmation','address':'staff@example.invalid','confirmed_at':'2026-01-01T00:00:00Z'}}],
      'orders':[
        {'source':'bridge','id':'bridge-original-order-69','owner':['bridge','other'],'name':'Identical kitchen','total':'179.00','currency':'BYN',
         'payments':[{'amount':'50.00','status':'received'}],'comments':['Historical internal comment'],
         'materials':[{'raw':'621 PO','mapping':None}],'legacy_discounts':{'discount':10},'status':'CUT'},
        {'source':'v9','id':69,'owner':['v9','1'],'name':'Identical kitchen','total':'179.00','currency':'BYN',
         'payments':[],'comments':['No confirmed tariff snapshot'],'materials':[{'raw':'HDF','mapping':None}],
         'legacy_discounts':{'materials':10,'edges':20,'services':5},'status':'paid'}],
      'files':[
        {'source':'v9','id':1,'order':['v9','69'],'name':'source.xlsx','kind':'source','content':base64.b64encode(b'fixture-only-source').decode()},
        {'source':'bridge','id':'oblx','order':['bridge','bridge-original-order-69'],'name':'renamed.pdf','kind':'oblx','content':base64.b64encode(b'<fixture native="NOT VERIFIED"/>').decode()},
        {'source':'v9','id':2,'order':['v9','69'],'name':'missing.pdf','kind':'preliminary_pdf','content':None}]}


def migrate_fixture(settings,data):
    if '_stage08_rehearsal_' not in settings.database_name or settings.namespace!='mf.staging.rehearsal8' or not data.get('synthetic'):
        raise ValueError('Isolated synthetic rehearsal target required')
    for entity in ('users','orders','files'):
        keys=[key(row) for row in data[entity]]
        if len(keys)!=len(set(keys)): raise ValueError('Duplicate legacy ID; no overwrite')
    with connect(settings) as db:
        if db.execute('SELECT 1 FROM mf_users UNION ALL SELECT 1 FROM mf_orders').fetchone():
            raise ValueError('Empty rehearsal required')
        db.execute((Path(__file__).with_name('rehearsal_v1.sql')).read_text())
    collisions=Counter(u['email'].casefold() for u in data['users']);users={};orders={};revisions={}
    def record(db,entity,row,target,disposition):
        db.execute('INSERT INTO mf_legacy_rehearsal_records VALUES(%s,%s,%s,%s,%s,%s,%s)',
                   (row['source'],entity,str(row['id']),str(target) if target else None,disposition,Jsonb(row),hash_value(row)))
    with transaction(settings) as db:
        for row in data['users']:
            uid=stable('user',row);users[key(row)]=uid
            collision=collisions[row['email'].casefold()]>1
            proof=row.get('verification_evidence') or {}
            verified=proof.get('confirmed_at') if proof.get('address','').casefold()==row['email'].casefold() and proof.get('source') and not collision else None
            db.execute("INSERT INTO mf_users(user_id,email,password_hash,email_verified_at,account_status) VALUES(%s,%s,NULL,%s,'disabled')",
                       (uid,None if collision else row['email'],verified))
            # Legacy staff roles/permissions retained in the sealed record, not activated.
            record(db,'user',row,uid,'email_collision_review' if collision else 'account_and_roles_review')
        for row in data['orders']:
            owner=users[tuple(row['owner'])];oid=str(row['id']) if row['source']=='bridge' else str(stable('order',row))
            orders[key(row)]=oid;rid=stable('revision',row);revisions[key(row)]=rid
            db.execute("INSERT INTO mf_orders(order_id,business_name,owner_user_id,preparation_mode,workflow_status,legacy_source,legacy_id) VALUES(%s,%s,%s,'manager_assisted','review',%s,%s)",
                       (oid,row['name'],owner,row['source'],str(row['id'])))
            snapshot={'kind':'legacy_snapshot','legacy_v9_id':row['id'] if row['source']=='v9' else None,'source':row,
                      'pricing':'historical_only_not_recalculated','material_mapping':'needs_review'}
            db.execute("INSERT INTO mf_order_revisions(revision_id,order_id,revision_number,created_by,reason,lifecycle,content_hash,content,immutable_at) VALUES(%s,%s,1,%s,'Fixture migration provenance','legacy_snapshot',%s,%s,now())",
                       (rid,oid,owner,hash_value(snapshot),Jsonb(snapshot)))
            db.execute('UPDATE mf_orders SET active_revision_id=%s WHERE order_id=%s',(rid,oid))
            record(db,'order',row,oid,'legacy_snapshot_material_review')
    store=VolumeStore(settings.storage_root)
    for row in data['files']:
        oid=orders[tuple(row['order'])];rid=revisions[tuple(row['order'])]
        if row['content'] is None:
            with transaction(settings) as db: record(db,'file',row,None,'missing_bytes_not_restored')
            continue
        raw=base64.b64decode(row['content'],validate=True)
        with connect(settings) as db:
            owner=db.execute('SELECT owner_user_id FROM mf_orders WHERE order_id=%s',(oid,)).fetchone()['owner_user_id']
        # Historical PDFs without canonical calculation binding are internal archives.
        kind=row['kind'] if row['kind'] in ('source','oblx') else 'internal'
        fid=save_private_file(settings,store,actor=owner,data=raw,name=row['name'],kind=kind,mime='application/octet-stream',order_id=oid,revision_id=rid)
        with transaction(settings) as db: record(db,'file',row,fid,'private_bytes_verified')
    with connect(settings) as db:
        records=db.execute('SELECT * FROM mf_legacy_rehearsal_records ORDER BY source,entity,legacy_id').fetchall()
        for r in records: assert hash_value(r['payload'])==r['payload_sha256']
        assert not db.execute('SELECT 1 FROM mf_permission_grants UNION ALL SELECT 1 FROM mf_production_jobs UNION ALL SELECT 1 FROM mf_calculations').fetchone()
    return {'source_counts':{k:len(data[k]) for k in ('users','orders','files')},
            'records':[{k:str(v) if k=='target_id' and v else v for k,v in r.items() if k!='payload'} for r in records],
            'synthetic_only':True,'live_legacy_reconciliation':'NOT VERIFIED'}
