"""Audited append-only commercial versions. No raw master price promotion."""
from uuid import uuid4
from datetime import datetime,timezone
from psycopg.types.json import Jsonb
from .calculation_math import plain,CATEGORIES
from .events import record_event
from .security import error

TABLES={'production':'mf_production_profiles','tariff':'mf_tariff_books','price':'mf_price_books','discount':'mf_discount_profiles'}
IDS={'production':'profile_id','tariff':'book_id','price':'book_id','discount':'profile_id'}
SCOPES={'cutting_18':{'thickness_mm':'18','basis':'profile_policy_required'},
        'glued_finish_cut':{'route':'glued_18_18','basis':'one_length_plus_one_width'},
        'edge_normal':{'basis':'net_metres'},'edge_complex':{'basis':'net_metres','rule':'profile_complex_threshold'},
        'edge_thick':{'basis':'net_metres','rule':'profile_policy_required'},
        'glue':{'route':'glued_18_18','basis':'profile_policy_required'},'packaging':{'basis':'finished_area'}}

def get(conn,kind,ident):
    row=conn.execute(f'SELECT * FROM {TABLES[kind]} WHERE {IDS[kind]}=%s',(ident,)).fetchone()
    if not row: error(422,'FINANCIAL_VERSION_NOT_FOUND')
    return row

def version(conn,kind,parent):
    return get(conn,kind,parent)['version']+1 if parent else 1

def publish(conn,settings,actor,kind,body):
    ident=uuid4();data=plain(body.model_dump());ver=version(conn,kind,body.supersedes)
    if kind in {'tariff','price'}:
        if body.effective_from.tzinfo is None or (body.effective_to and (body.effective_to.tzinfo is None or body.effective_to<=body.effective_from)):
            error(422,'INVALID_EFFECTIVE_INTERVAL')
    if kind=='production':
        conn.execute('''INSERT INTO mf_production_profiles(profile_id,version,supersedes,settings,policies,synthetic,source,source_date,reason,approved_by)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(ident,ver,body.supersedes,Jsonb(data['settings']),Jsonb(data['policies']),body.synthetic,body.source,body.source_date,body.reason,actor))
    elif kind=='discount':
        conn.execute('''INSERT INTO mf_discount_profiles(profile_id,version,supersedes,materials,edge_material,services,source,reason,synthetic,approved_by,source_date)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(ident,ver,body.supersedes,body.materials,body.edge_material,body.services,body.source,body.reason,body.synthetic,actor,body.source_date))
    elif kind=='tariff':
        if len({e.operation for e in body.entries})!=len(body.entries): error(422,'DUPLICATE_OPERATION')
        conn.execute('''INSERT INTO mf_tariff_books(book_id,version,supersedes,synthetic,source,source_date,reason,approved_by,effective_from,effective_to)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(ident,ver,body.supersedes,body.synthetic,body.source,body.source_date,body.reason,actor,body.effective_from,body.effective_to))
        for e in body.entries:
            conn.execute('INSERT INTO mf_tariff_entries VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',
                (uuid4(),ident,e.operation,Jsonb(SCOPES[e.operation]),e.amount,e.currency,'m2' if e.operation in {'glue','packaging'} else 'm',e.tax_convention))
        conn.execute('INSERT INTO mf_financial_book_seals(seal_id,tariff_book_id) VALUES(%s,%s)',(uuid4(),ident))
    else:
        if not conn.execute('SELECT 1 FROM mf_catalogue_release_seals WHERE release_id=%s',(body.release_id,)).fetchone(): error(422,'SEALED_CATALOGUE_REQUIRED')
        if len({e.item_id for e in body.entries})!=len(body.entries): error(422,'DUPLICATE_PRICE_ITEM')
        conn.execute('''INSERT INTO mf_price_books(book_id,version,release_id,supersedes,synthetic,source,source_date,reason,currency,tax_convention,approved_by,effective_from,effective_to)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(ident,ver,body.release_id,body.supersedes,body.synthetic,body.source,body.source_date,body.reason,body.currency,body.tax_convention,actor,body.effective_from,body.effective_to))
        for e in body.entries:
            item=conn.execute('SELECT kind FROM mf_catalogue_items WHERE release_id=%s AND item_id=%s',(body.release_id,e.item_id)).fetchone()
            if not item or item['kind']!=e.kind: error(422,'EXACT_RELEASED_ITEM_REQUIRED')
            if e.raw_price_entry_id and not conn.execute('''SELECT 1 FROM mf_material_price_entries WHERE price_entry_id=%s AND release_id=%s AND item_id=%s''',(e.raw_price_entry_id,body.release_id,e.item_id)).fetchone(): error(422,'PRICE_PROVENANCE_MISMATCH')
            conn.execute('INSERT INTO mf_sale_price_entries VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)',(uuid4(),ident,body.release_id,e.item_id,e.kind,e.amount,e.unit,e.free_basis,e.raw_price_entry_id))
        conn.execute('INSERT INTO mf_financial_book_seals(seal_id,price_book_id) VALUES(%s,%s)',(uuid4(),ident))
    record_event(conn,settings,actor=actor,action='financial.version.created',object_type=kind,object_id=ident,reason=body.reason,version=ver)
    return {'id':str(ident),'version':ver,'synthetic':body.synthetic}

def current(conn):
    return conn.execute('SELECT * FROM mf_calculation_defaults WHERE singleton').fetchone()

def activate(conn,settings,actor,body):
    for kind,ident in [('production',body.production_profile_id),('tariff',body.tariff_book_id),('price',body.price_book_id),('discount',body.discount_profile_id)]:
        if ident and get(conn,kind,ident)['synthetic']: error(422,'SYNTHETIC_VERSION_CANNOT_BE_GLOBAL_DEFAULT')
    row=conn.execute('''UPDATE mf_calculation_defaults SET production_profile_id=%s,tariff_book_id=%s,price_book_id=%s,discount_profile_id=%s,
      version=version+1,updated_at=now() WHERE singleton AND version=%s RETURNING *''',
      (body.production_profile_id,body.tariff_book_id,body.price_book_id,body.discount_profile_id,body.expected_version)).fetchone()
    if not row: error(412,'PROFILE_VERSION_CONFLICT')
    record_event(conn,settings,actor=actor,action='financial.defaults.changed',object_type='financial_defaults',object_id='staging',reason=body.reason,version=row['version'])
    return plain(row)

def discount_for(conn,order,default):
    override=conn.execute('SELECT * FROM mf_order_discount_overrides WHERE order_id=%s ORDER BY created_at DESC,override_id DESC LIMIT 1',(order['order_id'],)).fetchone()
    assigned=conn.execute('SELECT * FROM mf_customer_discount_assignments WHERE customer_id=%s ORDER BY created_at DESC,assignment_id DESC LIMIT 1',(order['owner_user_id'],)).fetchone()
    selected=override or assigned
    ident=selected['profile_id'] if selected else default
    profile=get(conn,'discount',ident) if ident else None
    return profile,plain(selected)

def effective(row,at):
    return row['effective_from']<=at and (row['effective_to'] is None or at<row['effective_to'])
