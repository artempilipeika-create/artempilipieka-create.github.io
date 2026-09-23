"""Calculation and all subordinate snapshots are sealed in one domain transaction."""
from uuid import uuid4
from datetime import datetime,timezone
from psycopg.types.json import Jsonb
from . import financial_profiles as fp,order_revisions as revisions
from .calculation_math import plain,hash_value,CATEGORIES
from .calculation_engine import calculate,VERSION
from .events import record_event
from .security import error


def create(conn,settings,actor,order_id,revision_id,parent=None,reason='Explicit preliminary calculation'):
    order=revisions.locked(conn,order_id);revision=revisions.get(conn,order_id,revision_id)
    if revision['schema_version']!=4: error(409,'STAGE4_REVISION_REQUIRED')
    defaults=revisions.context(conn,order_id) or fp.current(conn)
    profile=fp.get(conn,'production',revision['production_profile_id']);tariff=fp.get(conn,'tariff',defaults['tariff_book_id'])
    at=datetime.now(timezone.utc)
    price=fp.get(conn,'price',defaults['price_book_id']) if defaults['price_book_id'] else None
    discount,discount_origin=fp.discount_for(conn,order,defaults['discount_profile_id'])
    tariff_entries=conn.execute('SELECT * FROM mf_tariff_entries WHERE book_id=%s ORDER BY operation',(tariff['book_id'],)).fetchall()
    prices=[]
    if price and str(price['release_id'])==str(revision['catalogue_release_id']) and fp.effective(price,at):
        prices=conn.execute('SELECT * FROM mf_sale_price_entries WHERE book_id=%s ORDER BY item_id',(price['book_id'],)).fetchall()
    if parent and not conn.execute('SELECT 1 FROM mf_calculations WHERE calculation_id=%s AND revision_id=%s AND order_id=%s',(parent,revision_id,order_id)).fetchone(): error(409,'RECALCULATION_PARENT_MISMATCH')
    inputs=plain({'revision_id':revision_id,'revision_hash':revision['content_hash'],'revision':revision['content'],
       'production_profile':profile,'tariff_book':tariff,'price_book':price,'discount_profile':discount,'discount_origin':discount_origin,
       'tariffs':{r['operation']:r for r in tariff_entries} if fp.effective(tariff,at) else {},
       'prices':{str(r['item_id']):r for r in prices},'discount':{k:discount[k] for k in CATEGORIES} if discount else None,
       'effective_at':at,'engine_version':VERSION})
    result=calculate(inputs);ident=uuid4()
    result.update(calculation_id=str(ident),order_id=order_id,revision_id=str(revision_id),parent_calculation_id=plain(parent),
        catalogue_release_id=plain(revision['catalogue_release_id']),production_profile_id=plain(profile['profile_id']),
        tariff_book_id=plain(tariff['book_id']),price_book_id=plain(price['book_id']) if price else None,
        discount_profile_id=plain(discount['profile_id']) if discount else None,created_at=plain(at),input_hash=hash_value(inputs),
        synthetic=any(r and r['synthetic'] for r in [profile,tariff,price,discount]))
    conn.execute('''INSERT INTO mf_calculations(calculation_id,order_id,revision_id,parent_calculation_id,type,completeness,input_hash,engine_version,rounding_policy,
       catalogue_release_id,production_profile_id,tariff_book_id,price_book_id,discount_profile_id,input_snapshot,result,created_by,created_at)
       VALUES(%s,%s,%s,%s,'preliminary',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
       (ident,order_id,revision_id,parent,result['completeness'],result['input_hash'],result['engine_version'],result['rounding_policy'],revision['catalogue_release_id'],
        profile['profile_id'],tariff['book_id'],price['book_id'] if price else None,discount['profile_id'] if discount else None,Jsonb(inputs),Jsonb(result),actor,at))
    for number,l in enumerate(result['lines'],1):
        conn.execute('INSERT INTO mf_calculation_lines VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
          (uuid4(),ident,number,l['category'],l['operation'],l['state'],l['quantity'],l['unit'],l['unit_price'],l['gross'],Jsonb(l)))
    conn.execute('INSERT INTO mf_discount_snapshots VALUES(%s,%s)',(ident,Jsonb(plain({'profile':discount,'origin':discount_origin,'categories':result['category_totals']}))))
    for p in result['price_snapshots']:
        conn.execute('INSERT INTO mf_calculation_price_snapshots VALUES(%s,%s,%s,%s,%s)',(uuid4(),ident,p['kind'],p['item_key'],Jsonb(p)))
    for p in result['sheet_estimates']:
        conn.execute('INSERT INTO mf_sheet_estimates VALUES(%s,%s,%s,%s,%s,%s)',(uuid4(),ident,p['material_key'],p['estimator_version'],p['plan_hash'],Jsonb(p)))
    for r in result['manufacturing_recipes']:
        conn.execute('INSERT INTO mf_manufacturing_recipes VALUES(%s,%s,%s,%s)',(uuid4(),ident,r['finished_detail_id'],Jsonb(r)))
    conn.execute('INSERT INTO mf_calculation_seals(calculation_id,result_hash) VALUES(%s,%s)',(ident,hash_value(result)))
    record_event(conn,settings,actor=actor,action='calculation.created',object_type='calculation',object_id=ident,reason=reason)
    return dto(result)


def dto(result):
    # Financial DTO is explicit. No raw Excel cells, private storage paths, internal mapping or profile comments.
    keys=('calculation_id','order_id','revision_id','parent_calculation_id','type','completeness','currency','engine_version','rounding_policy',
      'input_hash','catalogue_release_id','production_profile_id','tariff_book_id','price_book_id','discount_profile_id','created_at',
      'synthetic','lines','category_totals','calculated_part','known_gross','total','unresolved_categories','reasons','final_state','production_ready',
      'sheet_estimates','manufacturing_recipes')
    return {k:result[k] for k in keys}

def get(conn,ident):
    row=conn.execute('SELECT * FROM mf_calculations WHERE calculation_id=%s',(ident,)).fetchone()
    if not row: error(404,'CALCULATION_NOT_FOUND')
    return row
