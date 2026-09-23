"""Separate immutable final candidate; preliminary snapshots remain byte-identical."""
from copy import deepcopy
from uuid import uuid4
from psycopg.types.json import Jsonb
from .calculation_math import plain,hash_value,dec,money,category_totals
from .events import record_event
from .security import error,verified
from .domain_api import require
from . import production_service as jobs


def financial_snapshot(preliminary,facts):
    if preliminary['completeness']!='complete': error(409,'CALCULATION_INCOMPLETE')
    result=deepcopy(preliminary['result']);inputs=preliminary['input_snapshot']
    materials={m['material_key']:m for m in facts['materials']}
    for line in result['lines']:
        if line['state']!='complete': error(409,'CALCULATION_INCOMPLETE')
        if line['operation'] in ('clean_sheets','cutting_18'):
            key=line['material_key'];matches=[v for k,v in materials.items() if k.startswith(key+':')]
            # Never merge company/customer quantities under the same material ID.
            supply=line.get('supply_source','company')
            if line['operation']=='clean_sheets': matches=[materials[key+':'+supply]] if key+':'+supply in materials else []
            if len(matches)!=1: error(409,'FINAL_MATERIAL_BASIS_AMBIGUOUS')
            actual=matches[0]
            if line['operation']=='cutting_18':
                scope=inputs['production_profile']['policies'].get('cutting_18')
                if not scope or scope['basis']!='estimated_plan_excluding_trim' or actual['cut_basis']!='excluding_trim': error(409,'FINAL_CUT_BASIS_UNRESOLVED')
                line['quantity']=actual['cut_metres'];line['basis']='verified_native_excluding_trim'
            else:
                line['quantity']=str(actual['sheet_count'])
                if supply=='customer' and actual['sheet_count']>line['provided_sheets']: error(409,'INSUFFICIENT_CUSTOMER_SHEETS')
            line['gross']=plain(money(dec(line['quantity'])*dec(line['unit_price'])))
            line['estimated']=False
        line.pop('plan_hash',None)
    totals=category_totals(result['lines'],inputs['discount'])
    if not all(t['complete'] for t in totals.values()): error(409,'CALCULATION_INCOMPLETE')
    return plain({'type':'final_candidate','currency':result['currency'],'lines':result['lines'],'category_totals':totals,
        'total':money(sum(dec(t['net']) for t in totals.values())),'preliminary_calculation_id':preliminary['calculation_id'],
        'tariff_book_id':preliminary['tariff_book_id'],'price_book_id':preliminary['price_book_id'],
        'discount_profile_id':preliminary['discount_profile_id'],'rounding_policy':result['rounding_policy'],
        'financial_basis_version':'mf-verified-native-facts-v1','synthetic':result['synthetic']})


def create(c,settings,j,user,reason):
    jobs.staff(c,user,'production.final.create',j['order_id'],j['job_id'])
    jobs.check_current(c,j)
    if j['purpose']!='calculate' or j['status']!='succeeded' or j['result_state']!='verified': error(409,'BAZIS_RUN_REQUIRED')
    result=c.execute('SELECT * FROM mf_job_results WHERE job_id=%s AND run_id=%s AND verified',(j['job_id'],j['current_run_id'])).fetchone()
    if not result: error(409,'BAZIS_RUN_REQUIRED')
    existing=c.execute('SELECT * FROM mf_final_calculation_candidates WHERE result_id=%s',(result['result_id'],)).fetchone()
    if existing: return projection(c,existing)
    pre=c.execute('SELECT * FROM mf_calculations WHERE calculation_id=%s',(j['calculation_id'],)).fetchone()
    snap=financial_snapshot(pre,result['manifest']['native_facts']);cid=uuid4()
    row=c.execute('''INSERT INTO mf_final_calculation_candidates(candidate_id,order_id,revision_id,preliminary_calculation_id,
       job_id,run_id,result_id,input_manifest_sha256,output_manifest_sha256,financial_snapshot,financial_sha256,created_by)
       VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
       (cid,j['order_id'],j['revision_id'],j['calculation_id'],j['job_id'],result['run_id'],result['result_id'],
        result['input_manifest_sha256'],hash_value(result['manifest']),Jsonb(snap),hash_value(snap),user['user_id'])).fetchone()
    record_event(c,settings,actor=user['user_id'],action='calculation.final_candidate.created',object_type='calculation',object_id=cid,reason=reason)
    return projection(c,row)


def projection(c,row):
    phases={r['phase'] for r in c.execute('SELECT phase FROM mf_final_approvals WHERE candidate_id=%s',(row['candidate_id'],))}
    return plain({**{k:row[k] for k in ('candidate_id','order_id','revision_id','preliminary_calculation_id','job_id','run_id','result_id','financial_snapshot','created_at')},
        'manager_reviewed':'manager_review' in phases,'customer_confirmed':'customer_confirmation' in phases})


def review(c,settings,user,body):
    f=c.execute('SELECT * FROM mf_final_calculation_candidates WHERE candidate_id=%s',(body.candidate_id,)).fetchone()
    if not f: error(404,'FINAL_CANDIDATE_NOT_FOUND')
    jobs.staff(c,user,'production.final.review',f['order_id'])
    if not user['roles'] & {'admin','manager'}: error(403,'MANAGER_REQUIRED')
    o=c.execute('SELECT * FROM mf_orders WHERE order_id=%s FOR NO KEY UPDATE',(f['order_id'],)).fetchone()
    if f['revision_id']!=body.revision_id or o['active_revision_id']!=body.revision_id: error(409,'STALE_REVISION')
    if o['workflow_status'] not in ('submitted','review','awaiting_approval'): error(409,'REVIEW_REQUIRED')
    if o['reviewed_final_candidate_id'] not in (None,body.candidate_id): error(409,'FINAL_REVIEW_ALREADY_SELECTED')
    if not c.execute("SELECT 1 FROM mf_final_approvals WHERE candidate_id=%s AND phase='manager_review'",(body.candidate_id,)).fetchone():
        c.execute("INSERT INTO mf_final_approvals VALUES(%s,%s,'manager_review',%s,%s,now())",(uuid4(),body.candidate_id,user['user_id'],body.reason))
        c.execute("UPDATE mf_orders SET reviewed_final_candidate_id=%s,approved_final_candidate_id=NULL,approved_revision_id=NULL,workflow_status='awaiting_approval',optimistic_lock_version=optimistic_lock_version+1,updated_at=now() WHERE order_id=%s",(body.candidate_id,f['order_id']))
        record_event(c,settings,actor=user['user_id'],action='calculation.final.manager_approved',object_type='calculation',object_id=body.candidate_id,reason=body.reason)
    return projection(c,f)


def approve(c,settings,user,order_id,body):
    require(c,user,'orders.approve',order_id=order_id);verified(user)
    if not body.candidate_id or not body.revision_id or not body.reason: error(409,'CALCULATION_INCOMPLETE')
    if user['roles'] & {'admin','manager'}: jobs.staff(c,user,'orders.approve',order_id)
    elif user['roles']!={'client'}: error(403,'PERMISSION_DENIED')
    o=c.execute('SELECT * FROM mf_orders WHERE order_id=%s FOR NO KEY UPDATE',(order_id,)).fetchone()
    f=c.execute('SELECT * FROM mf_final_calculation_candidates WHERE candidate_id=%s AND order_id=%s AND revision_id=%s',
                (body.candidate_id,order_id,body.revision_id)).fetchone()
    if not f or o['active_revision_id']!=body.revision_id: error(409,'STALE_REVISION')
    if not c.execute("SELECT 1 FROM mf_final_approvals WHERE candidate_id=%s AND phase='manager_review'",(body.candidate_id,)).fetchone(): error(409,'MANAGER_APPROVAL_REQUIRED')
    if o['reviewed_final_candidate_id']!=body.candidate_id: error(409,'EXACT_REVIEW_REQUIRED')
    if o['workflow_status']=='approved' and o['approved_final_candidate_id']!=body.candidate_id: error(409,'EXACT_APPROVAL_REQUIRED')
    if o['workflow_status'] not in ('awaiting_approval','approved'): error(409,'AWAITING_APPROVAL_REQUIRED')
    if not c.execute("SELECT 1 FROM mf_final_approvals WHERE candidate_id=%s AND phase='customer_confirmation'",(body.candidate_id,)).fetchone():
        c.execute("INSERT INTO mf_final_approvals VALUES(%s,%s,'customer_confirmation',%s,%s,now())",(uuid4(),body.candidate_id,user['user_id'],body.reason))
        c.execute("UPDATE mf_orders SET approved_revision_id=%s,approved_final_candidate_id=%s,workflow_status='approved',optimistic_lock_version=optimistic_lock_version+1,updated_at=now() WHERE order_id=%s",(body.revision_id,body.candidate_id,order_id))
        record_event(c,settings,actor=user['user_id'],action='order.exact.approved',object_type='order',object_id=order_id,reason=body.reason)
    return {'order_id':order_id,'revision_id':str(body.revision_id),'candidate_id':str(body.candidate_id),'workflow_status':'approved'}
