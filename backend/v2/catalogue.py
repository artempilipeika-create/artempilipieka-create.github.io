"""Immutable catalogue releases. Caller owns the data/audit/outbox transaction."""
from collections import Counter
from uuid import uuid4
from psycopg.types.json import Jsonb
from .catalogue_model import normalize_master, fingerprint, safe_item, packed, canonical
from .events import record_event
from .security import error

CATALOGUE_LOCK=76010301


def active(conn):
    row=conn.execute('SELECT release_id FROM mf_catalogue_active WHERE singleton').fetchone()
    return row['release_id'] if row else None


def items(conn,release_id,kind=None):
    sql='SELECT snapshot FROM mf_catalogue_items WHERE release_id=%s'
    args=[release_id]
    if kind: sql+=' AND kind=%s'; args.append(kind)
    return [r['snapshot'] for r in conn.execute(sql+' ORDER BY item_id',args)]


def get_item(conn,release_id,item_id,kind=None):
    row=conn.execute('SELECT kind,snapshot FROM mf_catalogue_items WHERE release_id=%s AND item_id=%s',(release_id,item_id)).fetchone()
    if not row or (kind and row['kind']!=kind): error(422,'VARIANT_NOT_IN_RELEASE')
    return safe_item(row['snapshot'],release_id)


def build_diff(previous,records):
    old={i.get('variant_id',i.get('edge_id')):i for i in previous}
    new={r['normalized'].get('variant_id',r['normalized'].get('edge_id')):r for r in records if r['disposition']=='published'}
    common=set(old)&set(new)
    counts=Counter(r['disposition'] for r in records)
    return {'source_rows':len(records),'accounted_rows':sum(counts.values()),
        'dispositions':{s:counts[s] for s in ('published','review','excluded','error','duplicate')},
        'added':sorted(set(new)-set(old)),'inactive':sorted(set(old)-set(new)),
        'changed':[k for k in common if old[k].get('name')!=new[k]['normalized'].get('name')],
        'price_changes':[], 'format_changes':[],
        'ambiguous':sum('identity' in r['reason'] for r in records),
        'identity_collisions':sum(r['reason']=='duplicate_external_sync_id' for r in records)}


def ingest(conn,settings,actor,file_id,workbook,namespace,profile):
    conn.execute('SELECT pg_advisory_xact_lock(%s)',(CATALOGUE_LOCK,))
    current=active(conn)
    existing=conn.execute('''SELECT import_id,report FROM mf_catalogue_imports
        WHERE sha256=%s AND source_namespace=%s AND profile=%s
        AND coalesce(report->>'base_release','')=%s ORDER BY created_at LIMIT 1''',
        (workbook['sha256'],namespace,Jsonb(profile),str(current or ''))).fetchone()
    if existing: return {**existing,'reused':True}
    batch=uuid4(); records,classes=normalize_master(workbook,namespace)
    prev=active(conn); previous=[i for i in items(conn,prev) if i['source_namespace']==namespace] if prev else []
    known={r['source_key']:r for r in conn.execute('''SELECT source_key,identity_signature FROM mf_catalogue_source_mappings
        WHERE source_namespace=%s AND key_kind='external' ''',(namespace,))}
    old_signatures={i.get('identity_signature'):i for i in previous}
    for r in records:
        ext=canonical(r['raw']['L'])
        if r['disposition']=='published' and ext in known and known[ext]['identity_signature']!=r['signature']:
            r.update(disposition='review',reason='external_identity_changed_requires_mapping')
        old=old_signatures.get(r['signature'])
        if r['disposition']=='published' and old and old['name']!=r['normalized']['name']:
            r.update(disposition='review',reason='rename_requires_explicit_audit')
    eligible={r['signature'] for r in records if r['disposition']=='published'}
    for r in records:
        if r['disposition']=='duplicate' and r['signature'] not in eligible:
            r.update(disposition='review',reason='duplicate_of_review_record')
            r.pop('duplicate_of',None)
    report=build_diff(previous,records); report['classes']=classes
    report['reasons']=dict(Counter(r['reason'] for r in records)); report['base_release']=str(prev) if prev else None
    report['price_policy']='NC-05 unknown currency/VAT/purpose; provenance only'
    if prev:
        old_price={str(r['item_id']):r['raw_value'] for r in conn.execute('SELECT item_id,raw_value FROM mf_material_price_entries WHERE release_id=%s',(prev,))}
        report['price_changes']=[r['normalized'].get('variant_id',r['normalized'].get('edge_id')) for r in records
            if r['disposition']=='published' and r['normalized'].get('variant_id',r['normalized'].get('edge_id')) in old_price
            and old_price[r['normalized'].get('variant_id',r['normalized'].get('edge_id'))]!=r['raw']['D']]
        # Article matches with different physical dimensions are visible; never silently replace.
        old_article={i['article']:i for i in previous if i['article']}
        report['format_changes']=[{'sheet':r['sheet'],'row':r['row'],'previous_variant':old_article[r['normalized']['article']].get('variant_id')}
            for r in records if r['normalized'].get('article') in old_article
            and any(r['normalized'].get(k)!=old_article[r['normalized']['article']].get(k) for k in ('length','width','thickness'))]
    meta={'sha256':workbook['sha256'],'sheets':[{'name':s['name'],'rows':len(s['rows'])-1,
           'headers':s['rows'][0]['cells']} for s in workbook['sheets']]}
    conn.execute('''INSERT INTO mf_catalogue_imports VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now())''',
                 (batch,file_id,namespace,Jsonb(profile),workbook['sha256'],Jsonb(meta),Jsonb(report),actor))
    # Persist stable identity map for every eligible unique variant, independent of row order and prices.
    for r in records:
        if r['disposition']!='published': continue  # All records are inserted into the raw ledger below.
        item=r['normalized']; sig=r['signature']; vid=item.get('variant_id'); eid=item.get('edge_id')
        if vid:
            conn.execute('INSERT INTO mf_materials(material_id,source_namespace,identity_key) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING',
                         (item['material_id'],namespace,sig))
            conn.execute('INSERT INTO mf_material_variants VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING',
                         (vid,item['material_id'],sig,Jsonb(item)))
        else: conn.execute('INSERT INTO mf_edge_variants VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING',(eid,namespace,sig,Jsonb(item)))
        keys=[('identity',sig)]+([('external',canonical(r['raw']['L']))] if canonical(r['raw']['L']) else [])
        for kind,key in keys:
            conn.execute('INSERT INTO mf_catalogue_source_mappings VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',
                         (namespace,kind,key,sig,vid,eid,batch))
    # Raw IDs are batch-local (repeated bytes with a different profile remain separate evidence).
    row_ids={r['raw_row_id']:uuid4() for r in records}
    with conn.cursor() as cur:
        cur.executemany('''INSERT INTO mf_catalogue_raw_rows VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            [(row_ids[r['raw_row_id']],batch,r['sheet'],r['row'],Jsonb(r['cells']),r['disposition'],r['reason'],Jsonb(r['normalized']),
              r['normalized'].get('variant_id') if r['disposition'] in {'published','duplicate'} else None,
              r['normalized'].get('edge_id') if r['disposition'] in {'published','duplicate'} else None,
              row_ids.get(r.get('duplicate_of'))) for r in records])
    record_event(conn,settings,actor=actor,action='catalogue.imported',object_type='catalogue_import',object_id=batch,reason='Immutable raw source and dry-run ledger')
    return {'import_id':batch,'report':report,'reused':False}


def publish(conn,settings,actor,batch,reason,accept_review,expected_active):
    conn.execute('SELECT pg_advisory_xact_lock(%s)',(CATALOGUE_LOCK,))
    row=conn.execute('SELECT * FROM mf_catalogue_imports WHERE import_id=%s',(batch,)).fetchone()
    if not row: error(404,'IMPORT_NOT_FOUND')
    existing=conn.execute('SELECT release_id FROM mf_catalogue_releases WHERE import_id=%s',(batch,)).fetchone()
    if existing: return existing
    previous=active(conn)
    if str(previous or '')!=str(expected_active or '') or str(previous or '')!=(row['report']['base_release'] or ''):
        error(409,'CATALOGUE_BASE_CHANGED_REIMPORT_REQUIRED')
    if row['report']['dispositions']['error']: error(409,'CATALOGUE_ERRORS_BLOCK_PUBLICATION')
    if row['report']['dispositions']['review'] and not accept_review: error(409,'EXPLICIT_REVIEW_EXCLUSION_REQUIRED')
    release=uuid4()
    conn.execute('INSERT INTO mf_catalogue_releases VALUES (%s,%s,%s,%s,%s,now())',
                 (release,batch,previous,Jsonb(row['report']),actor))
    # A source namespace is an explicit complete supplier scope, never a partial unmarked feed.
    if previous:
        conn.execute('''INSERT INTO mf_catalogue_items SELECT %s,item_id,kind,source_namespace,snapshot,raw_row_id
            FROM mf_catalogue_items WHERE release_id=%s AND source_namespace<>%s''',(release,previous,row['source_namespace']))
        conn.execute('''INSERT INTO mf_material_price_entries SELECT gen_random_uuid(),%s,p.item_id,p.raw_value,p.raw_unit,p.raw_row_id,
            NULL,NULL,NULL,NULL FROM mf_material_price_entries p JOIN mf_catalogue_items i
            ON i.release_id=p.release_id AND i.item_id=p.item_id WHERE p.release_id=%s AND i.source_namespace<>%s''',
            (release,previous,row['source_namespace']))
    rows=conn.execute("SELECT * FROM mf_catalogue_raw_rows WHERE import_id=%s AND disposition='published'",(batch,)).fetchall()
    with conn.cursor() as cur:
        cur.executemany('INSERT INTO mf_catalogue_items VALUES (%s,%s,%s,%s,%s,%s)',
            [(release,r['variant_id'] or r['edge_id'],r['normalized']['kind'],row['source_namespace'],Jsonb(r['normalized']),r['raw_row_id']) for r in rows])
        cur.executemany('INSERT INTO mf_material_price_entries VALUES (%s,%s,%s,%s,%s,%s,NULL,NULL,NULL,NULL)',
            [(uuid4(),release,r['variant_id'] or r['edge_id'],Jsonb(r['cells'].get('D',{}).get('value')),
              r['cells'].get('C',{}).get('value'),r['raw_row_id']) for r in rows])
    conn.execute('INSERT INTO mf_catalogue_release_seals(release_id) VALUES(%s)',(release,))
    activate(conn,settings,actor,release,reason)
    return {'release_id':release,'published_items':len(rows)}


def activate(conn,settings,actor,release,reason):
    conn.execute('SELECT pg_advisory_xact_lock(%s)',(CATALOGUE_LOCK,))
    if not conn.execute('SELECT 1 FROM mf_catalogue_releases WHERE release_id=%s',(release,)).fetchone(): error(404,'RELEASE_NOT_FOUND')
    conn.execute('''INSERT INTO mf_catalogue_active VALUES(true,%s,now()) ON CONFLICT(singleton)
        DO UPDATE SET release_id=EXCLUDED.release_id,updated_at=now()''',(release,))
    record_event(conn,settings,actor=actor,action='catalogue.activated',object_type='catalogue_release',object_id=release,reason=reason)


def projection(conn,release):
    return {'catalogue_release':str(release),'materials':[safe_item(i,release) for i in items(conn,release,'material')],
            'edges':[safe_item(i,release) for i in items(conn,release,'edge')]}


def cache_bytes(conn,release):
    # Compatibility cache has an independently verifiable hash and no purchasing/raw/internal fields.
    return ('/* GENERATED. DO NOT EDIT. */\nwindow.MF_DATA = '+packed(projection(conn,release))+';\n').encode()


def verify_cache(conn,release,data):
    if data!=cache_bytes(conn,release):
        raise ValueError('Generated catalogue cache drift')
    return True
